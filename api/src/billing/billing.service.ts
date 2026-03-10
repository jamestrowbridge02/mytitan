import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';
import Stripe from 'stripe';
import { AuditService } from '../audit/audit.service';
import { isAutomationsV1Enabled, isNotificationsV1Enabled } from '../common/feature-flags';
import { NotificationsService } from '../notifications/notifications.service';
import { AutomationsService } from '../automations/automations.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_INTERVAL, DEFAULT_PLAN_CODE, PLAN_DEFINITIONS } from './billing.constants';

@Injectable()
export class BillingService {
  private readonly stripe: Stripe | null;
  private readonly logger = new Logger(BillingService.name);


  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly automations: AutomationsService,
  ) {
    const secret = process.env.STRIPE_SECRET_KEY?.trim();
    this.stripe = secret ? new Stripe(secret, { apiVersion: '2023-10-16' }) : null;
  }

  private requireStripe() {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }
    return this.stripe;
  }

  private async maybeQueueReviewRequest(companyId: string, jobId: string) {
    if (!isAutomationsV1Enabled()) return;
    const enabled = await this.automations.getSettings(companyId);
    if (!enabled.reviewRequestEnabled) return;
    const db = this.prisma as any;
    const recent = await db.notification.findFirst({
      where: {
        companyId,
        entityType: 'job',
        entityId: jobId,
        metaJson: { path: ['reasonKey'], equals: 'review_request' },
      },
    });
    if (recent) return;
    const owner = await db.user.findFirst({ where: { companyId, role: 'OWNER' }, select: { id: true } });
    if (!owner?.id) return;
    await this.notifications.sendEntityUpdate(companyId, owner.id, {
      entityType: 'job',
      entityId: jobId,
      templateKey: 'review_request',
      channel: 'in_app',
      note: 'Automation review request',
    });
  }

  private async resolveBillingFollowUp(companyId: string, userId: string | null, jobId: string, reason: 'invoice_issued' | 'payment_received') {
    const db = this.prisma as any;
    const openReminders = await db.jobReminder.findMany({
      where: {
        companyId,
        jobId,
        completedAt: null,
        note: { in: ['Automation billing follow-up', 'Automation dispatch follow-up'] },
      },
    });
    if (!openReminders.length) return 0;

    const completedAt = new Date();
    await db.jobReminder.updateMany({
      where: { id: { in: openReminders.map((row: any) => row.id) } },
      data: { completedAt },
    });
    await db.jobActivity.create({
      data: {
        companyId,
        jobId,
        actorUserId: userId,
        eventType: 'job.reminder.completed',
        message: reason === 'payment_received' ? 'Billing follow-up resolved after payment' : 'Billing follow-up resolved after invoice issue',
        payloadJson: {
          reason,
          reminderIds: openReminders.map((row: any) => row.id),
        },
      },
    });
    return openReminders.length;
  }

  private async logBillingActivity(companyId: string, jobId: string, actorUserId: string | null, eventType: string, message: string, payloadJson?: any) {
    const db = this.prisma as any;
    await db.jobActivity.create({
      data: {
        companyId,
        jobId,
        actorUserId: actorUserId || null,
        eventType,
        message,
        payloadJson: payloadJson ?? null,
      },
    });
  }

  isStripeConfigured() {
    return Boolean(this.stripe);
  }

  private getReturnUrl() {
    return process.env.STRIPE_BILLING_RETURN_URL || 'https://app.mytitan.co.uk/dashboard/billing';
  }

  async ensurePlans() {
    const db = this.prisma as any;
    const defs = Object.values(PLAN_DEFINITIONS);
    await Promise.all(
      defs.map((plan) =>
        db.plan.upsert({
          where: { code: plan.code },
          update: {
            name: plan.name,
            stripePriceMonthlyId: this.priceIdFor(plan.code, 'MONTHLY') || '',
            stripePriceAnnualId: this.priceIdFor(plan.code, 'ANNUAL') || '',
            featuresJson: plan.features,
            aiRequestsLimitMonthly: plan.aiRequestsLimitMonthly,
            aiTokensLimitMonthly: plan.aiTokensLimitMonthly,
          },
          create: {
            code: plan.code,
            name: plan.name,
            stripePriceMonthlyId: this.priceIdFor(plan.code, 'MONTHLY') || '',
            stripePriceAnnualId: this.priceIdFor(plan.code, 'ANNUAL') || '',
            featuresJson: plan.features,
            aiRequestsLimitMonthly: plan.aiRequestsLimitMonthly,
            aiTokensLimitMonthly: plan.aiTokensLimitMonthly,
          },
        }),
      ),
    );
  }

  private priceIdFor(planCode: string, interval: 'MONTHLY' | 'ANNUAL') {
    if (planCode === 'SOLE_TRADER') {
      return interval === 'MONTHLY'
        ? process.env.STRIPE_PRICE_SOLE_TRADER_MONTHLY
        : process.env.STRIPE_PRICE_SOLE_TRADER_ANNUAL;
    }
    if (planCode === 'BUSINESS') {
      return interval === 'MONTHLY'
        ? process.env.STRIPE_PRICE_BUSINESS_MONTHLY
        : process.env.STRIPE_PRICE_BUSINESS_ANNUAL;
    }
    if (planCode === 'ENTERPRISE') {
      return interval === 'MONTHLY'
        ? process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY
        : process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL;
    }
    return undefined;
  }

  async createCheckoutSession(tenantId: string, userId: string, planCode: string, interval: 'MONTHLY' | 'ANNUAL') {
    const stripe = this.requireStripe();
    await this.ensurePlans();

    const priceId = this.priceIdFor(planCode, interval);

    if (!priceId) {
      throw new BadRequestException('Invalid plan or Stripe price not configured');
    }

    const db = this.prisma as any;
    const user = await db.user.findUnique({ where: { id: userId } });
    const subscription = await db.tenantSubscription.findUnique({ where: { tenantId } });
    let customerId = subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user?.email ?? undefined,
        metadata: { tenantId },
      });
      customerId = customer.id;
    }

    const plan = await db.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      throw new BadRequestException('Plan not found');
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: tenantId,
      success_url: `${this.getReturnUrl()}?checkout=success`,
      cancel_url: `${this.getReturnUrl()}?checkout=cancel`,
      metadata: {
        tenantId,
        planCode,
        interval,
      },
      subscription_data: {
        metadata: {
          tenantId,
          planCode,
          interval,
        },
      },
    });

    await db.tenantSubscription.upsert({
      where: { tenantId },
      update: { stripeCustomerId: customerId },
      create: {
        tenantId,
        stripeCustomerId: customerId,
        planId: plan.id,
        status: 'incomplete',
      },
    });

    await db.tenantSetting.updateMany({
      where: { tenantId },
      data: { planId: plan.id, planBillingInterval: interval },
    });

    await this.audit.log(tenantId, 'billing.checkout', `Checkout session created for plan ${planCode}`, userId);

    return { url: session.url };
  }

  async createBillingPortal(tenantId: string, userId: string) {
    const stripe = this.requireStripe();
    const db = this.prisma as any;
    const subscription = await db.tenantSubscription.findUnique({ where: { tenantId } });
    if (!subscription?.stripeCustomerId) {
      throw new BadRequestException('No Stripe customer configured for this tenant');
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: this.getReturnUrl(),
    });

    await this.audit.log(tenantId, 'billing.portal', 'Billing portal opened', userId);
    return { url: portal.url };
  }

  async createJobPaymentSession(tenantId: string, jobId: string, token: string) {
    const stripe = this.requireStripe();
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: jobId, companyId: tenantId } });
    if (!job) {
      throw new BadRequestException('Job not found');
    }
    if (!job.totalCents || job.totalCents <= 0) {
      throw new BadRequestException('Job has no payable total');
    }
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    if (!settings?.paymentsEnabled) {
      throw new BadRequestException('Payments are not enabled for this tenant');
    }

    const appUrl = process.env.APP_PUBLIC_URL || 'https://app.mytitan.co.uk';
    const returnUrl = `${appUrl}/portal/job/${token}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: job.customerEmail ?? undefined,
      line_items: [
        {
          price_data: {
            currency: (job.currency || 'GBP').toLowerCase(),
            unit_amount: job.totalCents,
            product_data: {
              name: `Job ${job.jobRef}`,
              description: job.serviceName || undefined,
            },
          },
          quantity: 1,
        },
      ],
      client_reference_id: tenantId,
      metadata: {
        type: 'job_payment',
        tenantId,
        jobId,
      },
      success_url: `${returnUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}?payment=cancel`,
    });

    await db.job.update({
      where: { id: jobId },
      data: { paymentCheckoutSessionId: session.id },
    });

    await this.audit.log(tenantId, 'portal.payment.start', `Checkout started for job ${job.jobRef}`, null);

    return { url: session.url };
  }

  async getJobPaymentStatus(tenantId: string, jobId: string, sessionId: string) {
    const stripe = this.requireStripe();
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: jobId, companyId: tenantId } });
    if (!job) {
      throw new BadRequestException('Job not found');
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    if (session.metadata?.jobId && session.metadata.jobId !== jobId) {
      throw new BadRequestException('Session does not match this job');
    }

    let receiptUrl: string | null = null;
    const paymentIntent = session.payment_intent as Stripe.PaymentIntent | null;
    const charge = (paymentIntent as any)?.charges?.data?.[0];
    if (charge?.receipt_url) {
      receiptUrl = charge.receipt_url;
    }

    if (session.payment_status === 'paid' && !job.invoicePaidAt) {
      const paidAt = new Date();
      await db.job.update({
        where: { id: jobId },
        data: {
          invoicePaidAt: paidAt,
          invoiceIssuedAt: job.invoiceIssuedAt ?? paidAt,
          paymentReceiptUrl: receiptUrl,
        },
      });
      await this.audit.log(tenantId, 'portal.payment.complete', `Payment received for job ${job.jobRef}`, null);
      await this.logBillingActivity(tenantId, jobId, null, 'billing.payment.received', 'Payment received through the customer portal', {
        receiptUrl,
        source: 'portal_payment_status',
      });
      await this.resolveBillingFollowUp(tenantId, null, jobId, 'payment_received');
      if (isNotificationsV1Enabled()) {
        await this.notifications.notifyPaymentReceived(tenantId, jobId);
      }
      await this.maybeQueueReviewRequest(tenantId, jobId);
    }

    return {
      status: session.payment_status,
      receiptUrl,
    };
  }

  async getBillingInfo(tenantId: string) {
    const db = this.prisma as any;
    await this.ensurePlans();
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const subscription = await db.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    let plan = subscription?.plan ?? null;
    if (!plan) {
      plan = await db.plan.findUnique({ where: { code: DEFAULT_PLAN_CODE } });
    }

    const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const usage = await db.usageMeter.findUnique({
      where: { tenantId_periodStart: { tenantId, periodStart } },
    });

    const planFeatures = (plan?.featuresJson ?? PLAN_DEFINITIONS[DEFAULT_PLAN_CODE].features) as Record<string, any>;
    const tenantFlags: Record<string, boolean | undefined> = {
      bookings_enabled: settings?.bookingsEnabled,
      accounting_enabled: settings?.accountingEnabled,
      payments_enabled: settings?.paymentsEnabled,
      social_enabled: settings?.socialEnabled,
      ai_enabled: settings?.aiEnabled,
    };
    const effective = Object.fromEntries(
      Object.entries(planFeatures).map(([key, value]) => {
        if (key in tenantFlags) {
          return [key, Boolean(value) && Boolean(tenantFlags[key])];
        }
        return [key, value];
      }),
    );

    return {
      plan,
      subscription,
      usage: usage ?? { aiRequestsUsed: 0, aiTokensUsed: 0, periodStart },
      features: effective,
      interval: settings?.planBillingInterval ?? DEFAULT_INTERVAL,
    };
  }

  async getBillingReadiness(tenantId: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const now = new Date();
    const appUrl = process.env.APP_PUBLIC_URL || 'https://app.mytitan.co.uk';
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const jobs = await db.job.findMany({
      where: {
        companyId: tenantId,
        status: { in: ['COMPLETED', 'INVOICED'] },
      },
      include: {
        publicTokens: {
          where: { expiresAt: { gt: now } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        reminders: {
          where: {
            completedAt: null,
            note: 'Automation billing follow-up',
          },
          orderBy: { remindAt: 'asc' },
          take: 1,
        },
        activities: {
          where: {
            eventType: {
              in: [
                'billing.invoice.issued',
                'billing.payment.received',
                'billing.follow_up.requeued',
                'billing.follow_up.escalated',
                'job.reminder.create',
                'job.reminder.completed',
              ],
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 4,
        },
      },
      orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 50,
    });

    const billingEscalationsLast7Days = await db.activityEvent.count({
      where: {
        tenantId,
        type: 'automation.billing_follow_up_escalation',
        at: { gte: last7Days },
      },
    });

    const rows = jobs.map((job: any) => {
      const token = job.publicTokens?.[0]?.token || null;
      const invoiceReady = Boolean(job.completedAt || job.status === 'COMPLETED' || job.status === 'INVOICED');
      const paymentReady = Boolean(settings?.paymentsEnabled && this.isStripeConfigured() && (job.totalCents || 0) > 0);
      const portalReady = Boolean((settings?.featureCustomerPortal || settings?.paymentsEnabled) && token);
      const billingFollowUpAt = job.reminders?.[0]?.remindAt || null;
      const invoiceDueAt = job.invoiceDueAt || null;
      const invoiceOverdue = Boolean(invoiceDueAt && !job.invoicePaidAt && new Date(invoiceDueAt).getTime() < now.getTime());
      const invoiceDueSoon = Boolean(
        invoiceDueAt &&
          !job.invoicePaidAt &&
          !invoiceOverdue &&
          new Date(invoiceDueAt).getTime() < now.getTime() + 48 * 60 * 60 * 1000,
      );
      const lifecycleState = job.invoicePaidAt
        ? 'paid'
        : job.invoiceIssuedAt
        ? invoiceOverdue
          ? 'invoice_overdue'
          : invoiceDueSoon
          ? 'invoice_due_soon'
          : 'invoice_issued'
        : invoiceReady
        ? 'invoice_ready'
        : 'pre_billing';
      const nextStep = job.invoicePaidAt
        ? 'Payment recorded. Share receipt or close billing follow-through.'
        : !job.invoiceIssuedAt
        ? 'Issue invoice to start collections and customer payment guidance.'
        : invoiceOverdue
        ? 'Escalate collections and refresh customer payment guidance now.'
        : billingFollowUpAt && new Date(billingFollowUpAt).getTime() < now.getTime()
        ? 'Escalate the overdue billing follow-up.'
        : paymentReady
        ? 'Customer can pay through the portal or payment link once shared.'
        : 'Track manual payment follow-through and customer confirmation.';
      return {
        id: job.id,
        jobRef: job.jobRef,
        customerName: job.customerName,
        status: job.status,
        totalCents: job.totalCents,
        currency: job.currency,
        completedAt: job.completedAt,
        invoiceIssuedAt: job.invoiceIssuedAt,
        invoiceDueAt,
        invoicePaidAt: job.invoicePaidAt,
        invoiceReady,
        paymentReady,
        portalReady,
        invoiceOverdue,
        lifecycleState,
        nextStep,
        billingFollowUpAt,
        billingFollowUpOverdue: Boolean(billingFollowUpAt && new Date(billingFollowUpAt).getTime() < now.getTime()),
        invoiceDocumentReady: Boolean(job.invoicePdfUrl),
        receiptReady: Boolean(job.paymentReceiptUrl),
        billingTimeline: (job.activities || []).map((activity: any) => ({
          eventType: activity.eventType,
          message: activity.message,
          createdAt: activity.createdAt,
        })),
        portalUrl: token ? `${appUrl}/portal/job/${token}` : null,
        paymentLinkUrl: job.paymentLinkUrl || null,
      };
    });

    return {
      paymentsEnabled: Boolean(settings?.paymentsEnabled),
      stripeConfigured: this.isStripeConfigured(),
      summary: {
        completedJobs: rows.length,
        invoiceReady: rows.filter((row) => row.invoiceReady).length,
        invoiceIssued: rows.filter((row) => Boolean(row.invoiceIssuedAt)).length,
        issuedAwaitingPayment: rows.filter((row) => Boolean(row.invoiceIssuedAt) && !row.invoicePaidAt).length,
        paid: rows.filter((row) => Boolean(row.invoicePaidAt)).length,
        paymentReady: rows.filter((row) => row.paymentReady).length,
        portalReady: rows.filter((row) => row.portalReady).length,
        overdueInvoices: rows.filter((row) => row.invoiceOverdue).length,
        overdueBillingFollowUps: rows.filter((row) => row.billingFollowUpOverdue).length,
        billingEscalationsLast7Days,
      },
      jobs: rows,
    };
  }

  async issueInvoice(tenantId: string, userId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: jobId, companyId: tenantId } });
    if (!job) {
      throw new BadRequestException('Job not found');
    }
    if (!(job.status === 'COMPLETED' || job.status === 'INVOICED')) {
      throw new BadRequestException('Only completed jobs can move into invoice state');
    }

    const updated = await db.job.update({
      where: { id: job.id },
      data: {
        status: 'INVOICED',
        invoiceIssuedAt: job.invoiceIssuedAt ?? new Date(),
        invoiceDueAt: job.invoiceDueAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        completedAt: job.completedAt ?? new Date(),
      },
    });
    await this.audit.log(tenantId, 'billing.invoice.issue', `Invoice issued for ${job.jobRef || job.id}`, userId);
    await this.logBillingActivity(tenantId, job.id, userId, 'billing.invoice.issued', 'Invoice issued and moved into collections workflow', {
      invoiceIssuedAt: updated.invoiceIssuedAt,
      invoiceDueAt: updated.invoiceDueAt,
    });
    await this.resolveBillingFollowUp(tenantId, userId, job.id, 'invoice_issued');
    return updated;
  }

  async markPaidOffline(tenantId: string, userId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: jobId, companyId: tenantId } });
    if (!job) {
      throw new BadRequestException('Job not found');
    }
    if (!job.invoiceIssuedAt && job.status !== 'INVOICED') {
      throw new BadRequestException('Issue the invoice before marking the job paid');
    }
    if (job.invoicePaidAt) {
      return job;
    }

    const updated = await db.job.update({
      where: { id: job.id },
      data: {
        status: 'INVOICED',
        invoicePaidAt: new Date(),
        invoiceIssuedAt: job.invoiceIssuedAt ?? new Date(),
        completedAt: job.completedAt ?? new Date(),
      },
    });
    await this.audit.log(tenantId, 'billing.invoice.mark_paid', `Offline payment recorded for ${job.jobRef || job.id}`, userId);
    await this.logBillingActivity(tenantId, job.id, userId, 'billing.payment.received', 'Offline payment recorded against issued invoice', {
      source: 'manual_offline',
      invoiceIssuedAt: updated.invoiceIssuedAt,
      invoicePaidAt: updated.invoicePaidAt,
    });
    await this.resolveBillingFollowUp(tenantId, userId, job.id, 'payment_received');
    if (isNotificationsV1Enabled()) {
      await this.notifications.notifyPaymentReceived(tenantId, job.id);
    }
    await this.maybeQueueReviewRequest(tenantId, job.id);
    return updated;
  }

  async queueBillingFollowUp(tenantId: string, userId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: jobId, companyId: tenantId } });
    if (!job) {
      throw new BadRequestException('Job not found');
    }
    if (job.invoicePaidAt) {
      throw new BadRequestException('Paid jobs do not need a billing follow-up');
    }
    if (!(job.completedAt || job.status === 'COMPLETED' || job.status === 'INVOICED')) {
      throw new BadRequestException('Only completed or invoiced jobs can enter billing follow-up');
    }

    const now = Date.now();
    const targetTime = job.invoiceDueAt
      ? new Date(job.invoiceDueAt).getTime() < now
        ? new Date(now + 2 * 60 * 60 * 1000)
        : new Date(job.invoiceDueAt)
      : new Date(now + 24 * 60 * 60 * 1000);

    const existing = await db.jobReminder.findFirst({
      where: {
        companyId: tenantId,
        jobId,
        completedAt: null,
        note: 'Automation billing follow-up',
      },
    });

    let reminder;
    if (existing) {
      reminder = await db.jobReminder.update({
        where: { id: existing.id },
        data: { remindAt: targetTime, channel: existing.channel || 'in_app' },
      });
      await this.logBillingActivity(tenantId, jobId, userId, 'billing.follow_up.requeued', 'Billing follow-up reminder refreshed', {
        remindAt: reminder.remindAt,
        reminderId: reminder.id,
      });
    } else {
      reminder = await db.jobReminder.create({
        data: {
          companyId: tenantId,
          jobId,
          remindAt: targetTime,
          channel: 'in_app',
          note: 'Automation billing follow-up',
        },
      });
      await this.logBillingActivity(tenantId, jobId, userId, 'job.reminder.create', 'Billing follow-up reminder queued from billing workflow', {
        remindAt: reminder.remindAt,
        reminderId: reminder.id,
        note: reminder.note,
      });
    }

    await this.audit.log(tenantId, 'billing.follow_up.queue', `Billing follow-up queued for ${job.jobRef || job.id}`, userId);
    return {
      jobId: job.id,
      reminderId: reminder.id,
      remindAt: reminder.remindAt,
      refreshed: Boolean(existing),
    };
  }

  async escalateBillingFollowUp(tenantId: string, userId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: jobId, companyId: tenantId } });
    if (!job) {
      throw new BadRequestException('Job not found');
    }
    if (job.invoicePaidAt) {
      throw new BadRequestException('Paid jobs do not need billing escalation');
    }
    if (!(job.completedAt || job.status === 'COMPLETED' || job.status === 'INVOICED')) {
      throw new BadRequestException('Only completed or invoiced jobs can enter billing escalation');
    }

    const now = Date.now();
    const reminderAt = new Date(now + 30 * 60 * 1000);
    const existing = await db.jobReminder.findFirst({
      where: {
        companyId: tenantId,
        jobId,
        completedAt: null,
        note: 'Automation billing follow-up',
      },
    });

    const reminder = existing
      ? await db.jobReminder.update({
          where: { id: existing.id },
          data: { remindAt: reminderAt, channel: existing.channel || 'in_app' },
        })
      : await db.jobReminder.create({
          data: {
            companyId: tenantId,
            jobId,
            remindAt: reminderAt,
            channel: 'in_app',
            note: 'Automation billing follow-up',
          },
        });

    await this.audit.log(tenantId, 'billing.follow_up.escalate', `Billing follow-up escalated for ${job.jobRef || job.id}`, userId);
    await this.logBillingActivity(tenantId, jobId, userId, 'billing.follow_up.escalated', 'Billing follow-up escalated for operator attention', {
      reminderId: reminder.id,
      remindAt: reminder.remindAt,
      previousRemindAt: existing?.remindAt || null,
      escalated: true,
    });
    await this.automations.handleBillingFollowUpEscalation(tenantId, userId, job, reminder);

    return {
      jobId: job.id,
      reminderId: reminder.id,
      remindAt: reminder.remindAt,
      escalated: true,
      created: !existing,
    };
  }

  private truncateWebhookError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || 'unknown webhook error');
    return message.slice(0, 500);
  }

  private async reserveWebhookEvent(eventId: string, type: string, requestId?: string) {
    const db = this.prisma as any;
    try {
      return await db.webhookEvent.create({
        data: {
          provider: 'stripe',
          eventId,
          type,
          status: 'received',
          requestId: requestId || null,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return db.webhookEvent.findUnique({ where: { provider_eventId: { provider: 'stripe', eventId } } });
      }
      throw error;
    }
  }

  private async markWebhookProcessed(eventId: string, type: string, requestId?: string) {
    const db = this.prisma as any;
    await db.webhookEvent.updateMany({
      where: { provider: 'stripe', eventId },
      data: {
        type,
        status: 'processed',
        processedAt: new Date(),
        requestId: requestId || null,
        error: null,
      },
    });
  }

  private async markWebhookFailed(eventId: string, type: string, error: unknown, requestId?: string) {
    const db = this.prisma as any;
    await db.webhookEvent.updateMany({
      where: { provider: 'stripe', eventId },
      data: {
        type,
        status: 'failed',
        requestId: requestId || null,
        error: this.truncateWebhookError(error),
      },
    });
  }

  async handleStripeWebhook(req: Request & { rawBody?: Buffer; body?: unknown; requestId?: string }) {
    const signature = req.headers['stripe-signature'];
    const payload = Buffer.isBuffer(req.body) ? req.body : req.rawBody ?? Buffer.from('');
    const requestId = String(req.requestId || req.headers['x-request-id'] || '').trim() || undefined;
    try {
      return await this.handleWebhook(signature, payload, requestId);
    } catch {
      throw new BadRequestException('Invalid Stripe webhook payload or signature.');
    }
  }

  async handleWebhook(signature: string | string[] | undefined, payload: Buffer, requestId?: string) {
    const stripe = this.requireStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException('STRIPE_WEBHOOK_SECRET is not configured');
    }

    const event = stripe.webhooks.constructEvent(payload, signature as string, secret);
    return this.handleStripeEvent(event, requestId);
  }

  async handleStripeEvent(event: Stripe.Event, requestId?: string) {
    const db = this.prisma as any;
    const eventId = String(event.id || '').trim();
    if (!eventId) {
      throw new BadRequestException('Stripe event id missing');
    }

    const stripe = this.requireStripe();
    const webhookEvent = await this.reserveWebhookEvent(eventId, event.type, requestId);
    if (webhookEvent?.processedAt || webhookEvent?.status === 'processed') {
      this.logger.log(`requestId=${requestId || 'unknown'} provider=stripe eventId=${eventId} dedupe=hit status=processed`);
      return { received: true, duplicate: true };
    }

    try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.type === 'job_payment' && session.metadata?.jobId && session.metadata?.tenantId) {
        const job = await db.job.findFirst({
          where: { id: session.metadata.jobId, companyId: session.metadata.tenantId },
        });
        if (!job) {
          await this.markWebhookProcessed(eventId, event.type, requestId);
          return { received: true };
        }

        let receiptUrl: string | null = null;
        if (session.payment_intent) {
          const intent = await stripe.paymentIntents.retrieve(session.payment_intent as string, { expand: ['charges'] });
          const charge = (intent as any)?.charges?.data?.[0];
          if (charge?.receipt_url) {
            receiptUrl = charge.receipt_url;
          }
        }

        await db.job.update({
          where: { id: job.id },
          data: {
            invoicePaidAt: job.invoicePaidAt ?? new Date(),
            invoiceIssuedAt: job.invoiceIssuedAt ?? new Date(),
            paymentReceiptUrl: receiptUrl,
          },
        });
        await this.audit.log(job.companyId, 'portal.payment.complete', `Payment received for job ${job.jobRef}`, null);
        await this.logBillingActivity(job.companyId, job.id, null, 'billing.payment.received', 'Payment received through Stripe checkout', {
          receiptUrl,
          source: 'stripe_webhook',
        });
        await this.resolveBillingFollowUp(job.companyId, null, job.id, 'payment_received');
        if (isNotificationsV1Enabled()) {
          await this.notifications.notifyPaymentReceived(job.companyId, job.id);
        }
        await this.maybeQueueReviewRequest(job.companyId, job.id);
        await this.markWebhookProcessed(eventId, event.type, requestId);
        return { received: true };
      }
      const tenantId = (session.client_reference_id || session.metadata?.tenantId) as string | undefined;
      const planCode = (session.metadata?.planCode as string | undefined) ?? null;
      const interval = (session.metadata?.interval as 'MONTHLY' | 'ANNUAL' | undefined) ?? DEFAULT_INTERVAL;
      if (!tenantId) {
        await this.markWebhookProcessed(eventId, event.type, requestId);
        return { received: true };
      }
      const plan = planCode
        ? await db.plan.findUnique({ where: { code: planCode } })
        : await db.plan.findUnique({ where: { code: DEFAULT_PLAN_CODE } });
      if (!plan) {
        throw new BadRequestException('Plan not found');
      }

      await db.tenantSubscription.upsert({
        where: { tenantId },
        update: {
          stripeCustomerId: String(session.customer || ''),
          stripeSubscriptionId: String(session.subscription || ''),
          status: session.status ?? 'active',
          planId: plan.id,
        },
        create: {
          tenantId,
          stripeCustomerId: String(session.customer || ''),
          stripeSubscriptionId: String(session.subscription || ''),
          status: session.status ?? 'active',
          planId: plan.id,
        },
      });

      await db.tenantSetting.updateMany({
        where: { tenantId },
        data: { planId: plan.id, planBillingInterval: interval },
      });
    }

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const tenantId = subscription.metadata?.tenantId as string | undefined;
      const priceId = subscription.items.data[0]?.price?.id;
      const plan =
        (priceId
          ? await db.plan.findFirst({
              where: {
                OR: [
                  { stripePriceMonthlyId: priceId },
                  { stripePriceAnnualId: priceId },
                ],
              },
            })
          : null) ??
        (subscription.metadata?.planCode
          ? await db.plan.findUnique({ where: { code: subscription.metadata.planCode } })
          : null) ??
        (await db.plan.findUnique({ where: { code: DEFAULT_PLAN_CODE } }));

      if (!tenantId) {
        await this.markWebhookProcessed(eventId, event.type, requestId);
        return { received: true };
      }

      const interval =
        plan && plan.stripePriceAnnualId === priceId ? 'ANNUAL' : 'MONTHLY';

      await db.tenantSubscription.upsert({
        where: { tenantId },
        update: {
          stripeCustomerId: subscription.customer as string,
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000)
            : null,
          planId: plan?.id,
          cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        },
        create: {
          tenantId,
          stripeCustomerId: subscription.customer as string,
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000)
            : null,
          planId: plan?.id,
          cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        },
      });

      if (plan?.id) {
        await db.tenantSetting.updateMany({
          where: { tenantId },
          data: { planId: plan.id, planBillingInterval: interval },
        });
      }
    }

    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = String(invoice.customer || '');
      if (customerId) {
        const result = await db.tenantSubscription.updateMany({
          where: { stripeCustomerId: customerId },
          data: { status: event.type === 'invoice.paid' ? 'active' : 'past_due' },
        });
        if (event.type === 'invoice.paid' && isNotificationsV1Enabled() && result.count > 0) {
          const subs = await db.tenantSubscription.findMany({ where: { stripeCustomerId: customerId }, select: { tenantId: true } });
          for (const sub of subs) {
            const owners = await db.user.findMany({
              where: { companyId: sub.tenantId, role: 'OWNER' },
              select: { id: true },
            });
            await this.notifications.createForUsers(
              sub.tenantId,
              owners.map((u: any) => u.id),
              {
                type: 'payment.received',
                title: 'Payment received',
                body: 'Stripe confirmed a successful payment.',
                entityType: 'billing',
                entityId: String(invoice.id || ''),
              },
            );
          }
        }
      }
    }

      await this.markWebhookProcessed(eventId, event.type, requestId);
      return { received: true };
    } catch (error) {
      await this.markWebhookFailed(eventId, event.type, error, requestId);
      throw error;
    }
  }
}
