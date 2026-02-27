import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';
import Stripe from 'stripe';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_INTERVAL, DEFAULT_PLAN_CODE, PLAN_DEFINITIONS } from './billing.constants';

@Injectable()
export class BillingService {
  private readonly stripe: Stripe | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
      await db.job.update({
        where: { id: jobId },
        data: {
          invoicePaidAt: new Date(),
          paymentReceiptUrl: receiptUrl,
        },
      });
      await this.audit.log(tenantId, 'portal.payment.complete', `Payment received for job ${job.jobRef}`, null);
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

  async handleStripeWebhook(req: Request & { rawBody?: Buffer; body?: unknown }) {
    const signature = req.headers['stripe-signature'];
    const payload = Buffer.isBuffer(req.body) ? req.body : req.rawBody ?? Buffer.from('');
    try {
      return await this.handleWebhook(signature, payload);
    } catch {
      throw new BadRequestException('Invalid Stripe webhook payload or signature.');
    }
  }

  async handleWebhook(signature: string | string[] | undefined, payload: Buffer) {
    const stripe = this.requireStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException('STRIPE_WEBHOOK_SECRET is not configured');
    }

    const event = stripe.webhooks.constructEvent(payload, signature as string, secret);
    const db = this.prisma as any;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.type === 'job_payment' && session.metadata?.jobId && session.metadata?.tenantId) {
        const job = await db.job.findFirst({
          where: { id: session.metadata.jobId, companyId: session.metadata.tenantId },
        });
        if (!job) {
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
            paymentReceiptUrl: receiptUrl,
          },
        });
        await this.audit.log(job.companyId, 'portal.payment.complete', `Payment received for job ${job.jobRef}`, null);
        return { received: true };
      }
      const tenantId = (session.client_reference_id || session.metadata?.tenantId) as string | undefined;
      const planCode = (session.metadata?.planCode as string | undefined) ?? null;
      const interval = (session.metadata?.interval as 'MONTHLY' | 'ANNUAL' | undefined) ?? DEFAULT_INTERVAL;
      if (!tenantId) {
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
        await db.tenantSubscription.updateMany({
          where: { stripeCustomerId: customerId },
          data: { status: event.type === 'invoice.paid' ? 'active' : 'past_due' },
        });
      }
    }

    return { received: true };
  }
}
