import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { BillingService } from '../billing/billing.service';
import { DEFAULT_INTERVAL, DEFAULT_PLAN_CODE, PLAN_DEFINITIONS } from '../billing/billing.constants';
import { getInternalMonitoringSnapshot } from '../common/internal-monitoring';
import { EmailService } from '../email/email.service';
import { IntegrationPlatformService } from '../integrations/integration-platform.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

type TenantSnapshot = {
  id: string;
  name: string;
  createdAt: Date;
  timezone: string;
  currency: string;
  owner: {
    id: string;
    email: string;
    emailVerified: boolean;
    createdAt: Date;
    lastLoginAt: Date | null;
    lastActiveAt: Date | null;
  } | null;
  settings: {
    planBillingInterval: 'MONTHLY' | 'ANNUAL';
    defaultCurrency: string;
    paymentsEnabled: boolean;
    featureBookings: boolean;
    featureAccounting: boolean;
    featureCustomerPortal: boolean;
    featureWhatsApp: boolean;
    bookingPublicEnabled: boolean;
    smtpHost: string | null;
    smtpPort: number | null;
    smtpUsername: string | null;
    smtpPasswordEncrypted: string | null;
    emailSenderName: string | null;
    updatedAt: Date | null;
  } | null;
  subscription: {
    status: string | null;
    trialStartedAt: Date | null;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    convertedAt: Date | null;
    conversionSource: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    plan: { code: string; name: string } | null;
  } | null;
};

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
    private readonly email: EmailService,
    private readonly integrations: IntegrationPlatformService,
    private readonly redis: RedisService,
  ) {}

  private buildTrialState(subscription: TenantSnapshot['subscription'], now = new Date()) {
    const startedAt = subscription?.trialStartedAt ? new Date(subscription.trialStartedAt) : null;
    const endsAt = subscription?.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
    if (!startedAt || !endsAt) {
      return {
        status: 'not_applicable',
        isActive: false,
        startedAt: null,
        endsAt: null,
        daysRemaining: 0,
      };
    }

    const hasFutureWindow = endsAt.getTime() > now.getTime();
    const isActive = subscription?.status === 'trialing' && hasFutureWindow;
    const status = isActive ? 'active' : hasFutureWindow ? 'converted' : 'expired';
    const daysRemaining = isActive ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))) : 0;

    return {
      status,
      isActive,
      startedAt: startedAt.toISOString(),
      endsAt: endsAt.toISOString(),
      daysRemaining,
    };
  }

  private monthKey(date: Date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private monthLabel(date: Date) {
    return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  private getWindowMonths(now: Date, count: number) {
    return Array.from({ length: count }).map((_, index) => {
      const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - index - 1), 1));
      return {
        key: this.monthKey(monthDate),
        label: this.monthLabel(monthDate),
      };
    });
  }

  private describeEmailState(
    settings: TenantSnapshot['settings'],
    systemEmailReady: boolean,
  ): 'ready' | 'needs_attention' {
    const hasWorkspaceEmailConfig = Boolean(
      settings?.smtpHost ||
      settings?.emailSenderName ||
      settings?.smtpPort ||
      settings?.smtpUsername ||
      settings?.smtpPasswordEncrypted,
    );
    if (!hasWorkspaceEmailConfig) {
      return systemEmailReady ? 'ready' : 'needs_attention';
    }
    const completeWorkspaceConfig = Boolean(
      settings?.smtpHost &&
      settings?.smtpPort &&
      settings?.emailSenderName &&
      ((settings?.smtpUsername && settings?.smtpPasswordEncrypted) || (!settings?.smtpUsername && !settings?.smtpPasswordEncrypted)),
    );
    return completeWorkspaceConfig ? 'ready' : 'needs_attention';
  }

  private describeNextAction(input: {
    ownerVerified: boolean;
    emailReady: boolean;
    billingBlocked: boolean;
    cancelAtPeriodEnd: boolean;
    webhookFailures: number;
    ackPending: number;
    complianceOpen: number;
    slaBreaches: number;
    overdueInvoices: number;
    expiredTrial: boolean;
  }) {
    if (!input.ownerVerified) return 'Verify the workspace owner before billing or approval support.';
    if (!input.emailReady) return 'Fix outbound email readiness so the team can send customer updates reliably.';
    if (input.billingBlocked) return 'Review billing status and restore paid access before billing-enabled workflows stall.';
    if (input.expiredTrial) return 'Follow up on the expired trial and confirm whether the workspace should convert.';
    if (input.cancelAtPeriodEnd) return 'Reach out before the current period ends and confirm renewal intent.';
    if (input.webhookFailures > 0) return 'Review recent integration delivery failures before customer-facing syncs drift.';
    if (input.overdueInvoices > 0) return 'Prompt finance follow-up because issued invoices are already overdue.';
    if (input.ackPending > 0) return 'Check completion acknowledgement pressure so finished work does not stall handoff.';
    if (input.complianceOpen > 0 || input.slaBreaches > 0) return 'Review open compliance or SLA pressure before it becomes customer-visible friction.';
    return 'No urgent support action is outstanding right now.';
  }

  async getControlCentreOverview() {
    const db = this.prisma as any;
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const months = this.getWindowMonths(now, 6);
    const monthKeySet = new Set(months.map((month) => month.key));
    const systemEmailReadiness = await this.email.getReadiness(null, { ownership: 'system' });

    const [
      revenue,
      conversions,
      companies,
      webhookEndpoints,
      failedWebhookDeliveries,
      failedNotifications,
      overdueInvoicesByTenant,
      ackPendingByTenant,
      complianceOpenByTenant,
      slaBreachesByTenant,
      internalMonitoring,
      traffic,
    ] = await Promise.all([
      this.billing.getPlatformRevenueDashboard(),
      this.billing.getConversionMetrics(),
      db.company.findMany({
        select: {
          id: true,
          name: true,
          createdAt: true,
          timezone: true,
          currency: true,
          users: {
            where: { role: 'OWNER' },
            take: 1,
            select: {
              id: true,
              email: true,
              emailVerified: true,
              createdAt: true,
              lastLoginAt: true,
              lastActiveAt: true,
            },
          },
          tenantSetting: {
            select: {
              planBillingInterval: true,
              defaultCurrency: true,
              paymentsEnabled: true,
              featureBookings: true,
              featureAccounting: true,
              featureCustomerPortal: true,
              featureWhatsApp: true,
              bookingPublicEnabled: true,
              smtpHost: true,
              smtpPort: true,
              smtpUsername: true,
              smtpPasswordEncrypted: true,
              emailSenderName: true,
              updatedAt: true,
            },
          },
          subscriptions: {
            select: {
              status: true,
              trialStartedAt: true,
              trialEndsAt: true,
              currentPeriodEnd: true,
              cancelAtPeriodEnd: true,
              convertedAt: true,
              conversionSource: true,
              stripeCustomerId: true,
              stripeSubscriptionId: true,
              plan: { select: { code: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.webhookEndpoint.findMany({
        select: {
          tenantId: true,
          active: true,
          lastSuccessAt: true,
        },
      }),
      db.webhookDelivery.groupBy({
        by: ['tenantId'],
        where: { status: 'FAILED', createdAt: { gte: last7Days } },
        _count: { tenantId: true },
      }),
      db.notification.findMany({
        where: {
          createdAt: { gte: last7Days },
          type: {
            in: ['trial_lifecycle_email', 'service_record_email', 'email_verification_email', 'entity_update'],
          },
        },
        select: {
          companyId: true,
          metaJson: true,
        },
      }),
      db.job.groupBy({
        by: ['companyId'],
        where: {
          invoiceIssuedAt: { not: null },
          invoicePaidAt: null,
          invoiceDueAt: { lt: now },
        },
        _count: { companyId: true },
      }),
      db.jobExecutionRecord.groupBy({
        by: ['tenantId'],
        where: {
          status: 'SUBMITTED',
          acknowledgedAt: null,
        },
        _count: { tenantId: true },
      }),
      db.complianceException.groupBy({
        by: ['tenantId'],
        where: { status: 'OPEN' },
        _count: { tenantId: true },
      }),
      db.workflowSlaEvent.groupBy({
        by: ['tenantId'],
        where: { status: 'BREACHED' },
        _count: { tenantId: true },
      }),
      getInternalMonitoringSnapshot(this.prisma, this.redis),
      this.analytics.getWebsiteTrafficSummary({ platformWide: true }),
    ]);

    const tenantSnapshots: TenantSnapshot[] = companies.map((company: any) => ({
      id: company.id,
      name: company.name,
      createdAt: company.createdAt,
      timezone: company.timezone,
      currency: company.currency,
      owner: company.users?.[0]
        ? {
            id: company.users[0].id,
            email: company.users[0].email,
            emailVerified: Boolean(company.users[0].emailVerified),
            createdAt: company.users[0].createdAt,
            lastLoginAt: company.users[0].lastLoginAt || null,
            lastActiveAt: company.users[0].lastActiveAt || null,
          }
        : null,
      settings: company.tenantSetting
        ? {
            planBillingInterval: company.tenantSetting.planBillingInterval || DEFAULT_INTERVAL,
            defaultCurrency: company.tenantSetting.defaultCurrency || company.currency || 'GBP',
            paymentsEnabled: Boolean(company.tenantSetting.paymentsEnabled),
            featureBookings: Boolean(company.tenantSetting.featureBookings),
            featureAccounting: Boolean(company.tenantSetting.featureAccounting),
            featureCustomerPortal: Boolean(company.tenantSetting.featureCustomerPortal),
            featureWhatsApp: Boolean(company.tenantSetting.featureWhatsApp),
            bookingPublicEnabled: Boolean(company.tenantSetting.bookingPublicEnabled),
            smtpHost: company.tenantSetting.smtpHost || null,
            smtpPort: company.tenantSetting.smtpPort || null,
            smtpUsername: company.tenantSetting.smtpUsername || null,
            smtpPasswordEncrypted: company.tenantSetting.smtpPasswordEncrypted || null,
            emailSenderName: company.tenantSetting.emailSenderName || null,
            updatedAt: company.tenantSetting.updatedAt || null,
          }
        : null,
      subscription: company.subscriptions
        ? {
            status: company.subscriptions.status || null,
            trialStartedAt: company.subscriptions.trialStartedAt || null,
            trialEndsAt: company.subscriptions.trialEndsAt || null,
            currentPeriodEnd: company.subscriptions.currentPeriodEnd || null,
            cancelAtPeriodEnd: Boolean(company.subscriptions.cancelAtPeriodEnd),
            convertedAt: company.subscriptions.convertedAt || null,
            conversionSource: company.subscriptions.conversionSource || null,
            stripeCustomerId: company.subscriptions.stripeCustomerId || null,
            stripeSubscriptionId: company.subscriptions.stripeSubscriptionId || null,
            plan: company.subscriptions.plan
              ? {
                  code: company.subscriptions.plan.code,
                  name: company.subscriptions.plan.name,
                }
              : null,
          }
        : null,
    }));

    const webhookEndpointMap = new Map<string, Array<{ active: boolean; lastSuccessAt: Date | null }>>();
    for (const endpoint of webhookEndpoints) {
      const current = webhookEndpointMap.get(endpoint.tenantId) || [];
      current.push({
        active: Boolean(endpoint.active),
        lastSuccessAt: endpoint.lastSuccessAt || null,
      });
      webhookEndpointMap.set(endpoint.tenantId, current);
    }

    const webhookFailureMap = new Map<string, number>(
      failedWebhookDeliveries.map((row: any) => [row.tenantId, row._count.tenantId]),
    );
    const overdueInvoiceMap = new Map<string, number>(
      overdueInvoicesByTenant.map((row: any) => [row.companyId, row._count.companyId]),
    );
    const ackPendingMap = new Map<string, number>(
      ackPendingByTenant.map((row: any) => [row.tenantId, row._count.tenantId]),
    );
    const complianceOpenMap = new Map<string, number>(
      complianceOpenByTenant.map((row: any) => [row.tenantId, row._count.tenantId]),
    );
    const slaBreachMap = new Map<string, number>(
      slaBreachesByTenant.map((row: any) => [row.tenantId, row._count.tenantId]),
    );

    const notificationFailureMap = new Map<string, number>();
    for (const row of failedNotifications) {
      const meta = row.metaJson && typeof row.metaJson === 'object' ? row.metaJson : {};
      const status = String((meta as any)?.status || (meta as any)?.deliveryStatus || '').trim().toLowerCase();
      const nestedStatus = String((meta as any)?.context?.deliveryStatus || '').trim().toLowerCase();
      const failureReason = String((meta as any)?.failureReason || (meta as any)?.context?.failureReason || '').trim();
      if (status !== 'failed' && nestedStatus !== 'failed' && !failureReason) continue;
      notificationFailureMap.set(row.companyId, (notificationFailureMap.get(row.companyId) || 0) + 1);
    }

    const lifecycleTrendMap = new Map<string, { newTenants: number; trialsStarted: number; converted: number }>();
    for (const month of months) {
      lifecycleTrendMap.set(month.key, { newTenants: 0, trialsStarted: 0, converted: 0 });
    }

    const attentionRows = tenantSnapshots.map((tenant) => {
      const subscription = tenant.subscription;
      const trial = this.buildTrialState(subscription, now);
      const emailState = this.describeEmailState(tenant.settings, systemEmailReadiness.canSend);
      const webhookSummary = webhookEndpointMap.get(tenant.id) || [];
      const webhookFailures = webhookFailureMap.get(tenant.id) || 0;
      const ackPending = ackPendingMap.get(tenant.id) || 0;
      const complianceOpen = complianceOpenMap.get(tenant.id) || 0;
      const slaBreaches = slaBreachMap.get(tenant.id) || 0;
      const overdueInvoices = overdueInvoiceMap.get(tenant.id) || 0;
      const recentSendFailures = notificationFailureMap.get(tenant.id) || 0;
      const billingBlocked = Boolean(
        trial.status === 'expired' ||
        (subscription && !['active', 'trialing'].includes(String(subscription.status || '').toLowerCase()) && !subscription.convertedAt),
      );
      const issues: string[] = [];
      if (!tenant.owner?.emailVerified) issues.push('Owner verification');
      if (billingBlocked) issues.push('Billing action');
      if (emailState !== 'ready') issues.push('Email readiness');
      if (subscription?.cancelAtPeriodEnd) issues.push('Cancels at period end');
      if (webhookFailures > 0) issues.push('Integration delivery');
      if (recentSendFailures > 0) issues.push('Recent send failures');
      if (overdueInvoices > 0) issues.push('Overdue invoices');
      if (ackPending > 0) issues.push('Acknowledgement pressure');
      if (complianceOpen > 0) issues.push('Compliance queue');
      if (slaBreaches > 0) issues.push('SLA breaches');

      const latestWebhookSuccessAt = webhookSummary
        .map((item) => item.lastSuccessAt)
        .filter(Boolean)
        .sort((left: Date | null, right: Date | null) => (right?.getTime() || 0) - (left?.getTime() || 0))[0] || null;
      const integrationState =
        !webhookSummary.length
          ? 'disabled'
          : webhookFailures > 0
            ? 'needs_attention'
            : 'connected';

      const createdMonthKey = this.monthKey(new Date(tenant.createdAt));
      if (monthKeySet.has(createdMonthKey)) {
        lifecycleTrendMap.get(createdMonthKey)!.newTenants += 1;
      }
      if (subscription?.trialStartedAt) {
        const key = this.monthKey(new Date(subscription.trialStartedAt));
        if (monthKeySet.has(key)) {
          lifecycleTrendMap.get(key)!.trialsStarted += 1;
        }
      }
      if (subscription?.convertedAt) {
        const key = this.monthKey(new Date(subscription.convertedAt));
        if (monthKeySet.has(key)) {
          lifecycleTrendMap.get(key)!.converted += 1;
        }
      }

      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        ownerEmail: tenant.owner?.email || null,
        ownerEmailVerified: Boolean(tenant.owner?.emailVerified),
        ownerLastLoginAt: tenant.owner?.lastLoginAt || null,
        ownerLastActiveAt: tenant.owner?.lastActiveAt || null,
        createdAt: tenant.createdAt,
        planName: subscription?.plan?.name || PLAN_DEFINITIONS[DEFAULT_PLAN_CODE].name,
        planCode: subscription?.plan?.code || DEFAULT_PLAN_CODE,
        billingInterval: tenant.settings?.planBillingInterval || DEFAULT_INTERVAL,
        subscriptionStatus: subscription?.status || 'inactive',
        trialStatus: trial.status,
        trialEndsAt: trial.endsAt,
        cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
        emailState,
        paymentsEnabled: Boolean(tenant.settings?.paymentsEnabled),
        portalEnabled: Boolean(tenant.settings?.featureCustomerPortal || tenant.settings?.paymentsEnabled),
        bookingEnabled: Boolean(tenant.settings?.featureBookings || tenant.settings?.bookingPublicEnabled),
        whatsappEnabled: Boolean(tenant.settings?.featureWhatsApp),
        webhookEndpointCount: webhookSummary.length,
        activeWebhookEndpointCount: webhookSummary.filter((item) => item.active).length,
        lastWebhookSuccessAt: latestWebhookSuccessAt,
        integrationState,
        webhookFailures,
        recentSendFailures,
        overdueInvoices,
        ackPending,
        complianceOpen,
        slaBreaches,
        billingBlocked,
        issueCount: issues.length,
        issues,
        nextAction: this.describeNextAction({
          ownerVerified: Boolean(tenant.owner?.emailVerified),
          emailReady: emailState === 'ready',
          billingBlocked,
          cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
          webhookFailures,
          ackPending,
          complianceOpen,
          slaBreaches,
          overdueInvoices,
          expiredTrial: trial.status === 'expired',
        }),
      };
    });

    const activeTrials = attentionRows.filter((row) => row.trialStatus === 'active').length;
    const expiredTrials = attentionRows.filter((row) => row.trialStatus === 'expired').length;
    const paidTenants = attentionRows.filter((row) => String(row.subscriptionStatus).toLowerCase() === 'active').length;
    const newTenantsLast30Days = attentionRows.filter((row) => new Date(row.createdAt).getTime() >= last30Days.getTime()).length;
    const conversionsLast30Days = tenantSnapshots.filter((row) => row.subscription?.convertedAt && new Date(row.subscription.convertedAt).getTime() >= last30Days.getTime()).length;
    const trialEndingSoon = tenantSnapshots.filter((row) => {
      const trial = this.buildTrialState(row.subscription, now);
      return trial.status === 'active' && trial.daysRemaining <= 3;
    }).length;
    const cancelAtPeriodEndCount = attentionRows.filter((row) => row.cancelAtPeriodEnd).length;
    const billingBlockedTenants = attentionRows.filter((row) => row.billingBlocked).length;
    const unverifiedOwners = attentionRows.filter((row) => !row.ownerEmailVerified).length;
    const emailReadinessIssues = attentionRows.filter((row) => row.emailState !== 'ready').length;
    const tenantsNeedingAttention = attentionRows.filter((row) => row.issueCount > 0).length;
    const operationalFrictionTenants = attentionRows.filter((row) => row.ackPending || row.complianceOpen || row.slaBreaches || row.webhookFailures).length;
    const recentSendFailures = Array.from(notificationFailureMap.values()).reduce((total, count) => total + count, 0);
    const recentWebhookFailures = Array.from(webhookFailureMap.values()).reduce((total, count) => total + count, 0);
    const totalAckPending = Array.from(ackPendingMap.values()).reduce((total, count) => total + count, 0);
    const totalComplianceOpen = Array.from(complianceOpenMap.values()).reduce((total, count) => total + count, 0);
    const totalSlaBreaches = Array.from(slaBreachMap.values()).reduce((total, count) => total + count, 0);
    const totalOverdueInvoices = Array.from(overdueInvoiceMap.values()).reduce((total, count) => total + count, 0);

    const issueCategories = [
      { key: 'owner_verification', label: 'Owner verification', count: unverifiedOwners },
      { key: 'email_readiness', label: 'Email readiness', count: emailReadinessIssues },
      { key: 'billing_blocked', label: 'Billing action', count: billingBlockedTenants },
      { key: 'cancellations', label: 'Cancels at period end', count: cancelAtPeriodEndCount },
      { key: 'ack_pressure', label: 'Acknowledgement pressure', count: totalAckPending },
      { key: 'compliance_queue', label: 'Compliance queue', count: totalComplianceOpen },
      { key: 'sla_breaches', label: 'SLA breaches', count: totalSlaBreaches },
      { key: 'send_failures', label: 'Send failures', count: recentSendFailures + recentWebhookFailures },
      { key: 'overdue_invoices', label: 'Overdue invoices', count: totalOverdueInvoices },
    ].filter((item) => item.count > 0);

    const platformHealth = {
      integrations: {
        connected: attentionRows.filter((row) => row.integrationState === 'connected').length,
        needsAttention: attentionRows.filter((row) => row.integrationState === 'needs_attention').length,
        disabled: attentionRows.filter((row) => row.integrationState === 'disabled').length,
      },
      email: {
        ready: attentionRows.filter((row) => row.emailState === 'ready').length,
        needsAttention: attentionRows.filter((row) => row.emailState !== 'ready').length,
        systemConfigured: systemEmailReadiness.canSend,
      },
      payments: {
        ready: attentionRows.filter((row) => row.paymentsEnabled && revenue.stripeAlignment.stripeConfigured).length,
        blocked: attentionRows.filter((row) => row.paymentsEnabled && !revenue.stripeAlignment.stripeConfigured).length,
        disabled: attentionRows.filter((row) => !row.paymentsEnabled).length,
      },
      workflows: {
        completionAcknowledgementPressure: totalAckPending,
        complianceQueue: totalComplianceOpen,
        breachedSlas: totalSlaBreaches,
        overdueInvoices: totalOverdueInvoices,
        recentSendFailures,
        recentWebhookFailures,
      },
    };

    return {
      executive: {
        totalActiveTenants: tenantSnapshots.length,
        trialTenants: activeTrials,
        paidTenants,
        expiredTrials,
        conversionRate: revenue.totals.conversionRate,
        actualMrrByCurrency: revenue.totals.actualMonthlyRecurringRevenueByCurrency,
        estimatedMrrByCurrency: revenue.totals.actualMonthlyRecurringRevenueByCurrency,
        forecastedMrrByCurrency: revenue.totals.forecastedMonthlyRevenueByCurrency,
        recentMovement: {
          newTenantsLast30Days,
          conversionsLast30Days,
          trialEndingSoon,
          cancelAtPeriodEnd: cancelAtPeriodEndCount,
        },
      },
      support: {
        tenantsNeedingAttention,
        unverifiedOwners,
        billingBlockedTenants,
        emailReadinessIssues,
        recentSendFailures,
        operationalFrictionTenants,
        attentionTenants: attentionRows
          .filter((row) => row.issueCount > 0)
          .sort((left, right) => right.issueCount - left.issueCount || left.tenantName.localeCompare(right.tenantName))
          .slice(0, 8),
      },
      revenue: {
        planDistribution: revenue.activeSubscriptionsByTier,
        funnel: [
          { key: 'trials_started', label: 'Trials started', count: conversions.trialsStarted },
          { key: 'active_trials', label: 'Active trials', count: activeTrials },
          { key: 'converted', label: 'Converted', count: conversions.trialsConverted },
          { key: 'expired_trials', label: 'Expired trials', count: expiredTrials },
        ],
        cancelAtPeriodEnd: cancelAtPeriodEndCount,
        lifecycleEmails: {
          clicks: conversions.lifecycleEmailClicks,
          conversions: conversions.lifecycleEmailConversions,
        },
        checkoutReadyTenants: attentionRows.filter((row) => row.paymentsEnabled && revenue.stripeAlignment.stripeConfigured).length,
        portalReadyTenants: attentionRows.filter((row) => row.portalEnabled).length,
        stripeAlignment: revenue.stripeAlignment,
      },
      system: {
        readiness: platformHealth,
        internalMonitoring,
        traffic,
        issueCategories,
        attentionQueue: [
          totalAckPending > 0 ? { key: 'ack_pressure', label: 'Completion proofs awaiting acknowledgement', count: totalAckPending, href: '#system' } : null,
          totalComplianceOpen > 0 ? { key: 'compliance_queue', label: 'Open compliance queue', count: totalComplianceOpen, href: '#system' } : null,
          totalSlaBreaches > 0 ? { key: 'sla_breaches', label: 'Breached workflow SLAs', count: totalSlaBreaches, href: '#system' } : null,
          recentWebhookFailures > 0 ? { key: 'webhook_failures', label: 'Recent webhook delivery failures', count: recentWebhookFailures, href: '#system' } : null,
          recentSendFailures > 0 ? { key: 'send_failures', label: 'Recent email delivery failures', count: recentSendFailures, href: '#support' } : null,
          totalOverdueInvoices > 0 ? { key: 'overdue_invoices', label: 'Invoices overdue for payment', count: totalOverdueInvoices, href: '#revenue' } : null,
        ].filter(Boolean),
      },
      charts: {
        tenantLifecycle: months.map((month) => ({
          label: month.label,
          ...lifecycleTrendMap.get(month.key)!,
        })),
        planDistribution: revenue.activeSubscriptionsByTier,
        conversionFunnel: [
          { label: 'Trials started', count: conversions.trialsStarted },
          { label: 'Active trials', count: activeTrials },
          { label: 'Converted', count: conversions.trialsConverted },
          { label: 'Paid now', count: paidTenants },
        ],
        mrrByCurrency: revenue.totals.actualMonthlyRecurringRevenueByCurrency,
        forecastedMrrByCurrency: revenue.totals.forecastedMonthlyRevenueByCurrency,
        issueCategories,
      },
    };
  }

  async getTenantOperationalSummary(tenantId: string) {
    const [email, integration] = await Promise.all([
      this.email.getReadiness(tenantId),
      this.integrations.getAdminHealth(tenantId),
    ]);

    return {
      email: {
        status: email.status,
        canSend: email.canSend,
        source: email.source,
        guidance: email.guidance,
      },
      integrations: integration,
    };
  }

  async listSafeErrorLogs(input?: { category?: string; status?: string }) {
    const db = this.prisma as any;
    const category = String(input?.category || '').trim().toLowerCase();
    const status = String(input?.status || '').trim().toLowerCase();
    const where: Record<string, any> = {};
    if (category && category !== 'all') {
      where.category = category;
    }
    if (status && status !== 'all') {
      where.status = status;
    }

    const [rows, totalsByCategory, totalsByStatus] = await Promise.all([
      db.platformSafeErrorLog.findMany({
        where,
        orderBy: [{ auditProtected: 'desc' }, { lastSeenAt: 'desc' }],
        take: 80,
      }),
      db.platformSafeErrorLog.groupBy({
        by: ['category'],
        _count: { _all: true },
      }),
      db.platformSafeErrorLog.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    return {
      items: rows.map((row: any) => ({
        id: row.id,
        category: row.category,
        area: row.area,
        summary: row.summary,
        severity: row.severity,
        status: row.status,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        occurrenceCount: Number(row.occurrenceCount || 0),
        clearable: row.clearable !== false,
        validationOnly: row.validationOnly === true,
        auditProtected: row.auditProtected === true,
        safeAction:
          row.auditProtected === true
            ? 'Retain for audit and review only.'
            : row.status === 'reviewed' || row.status === 'resolved'
              ? 'Eligible for reviewed-log clear.'
              : row.validationOnly
                ? 'Review, then clear from validation-only logs.'
                : 'Review and keep until resolved.',
        diagnostics: row.sanitizedDetailsJson || null,
      })),
      summary: {
        categories: totalsByCategory.map((row: any) => ({
          key: row.category,
          count: row._count?._all || 0,
        })),
        statuses: totalsByStatus.map((row: any) => ({
          key: row.status,
          count: row._count?._all || 0,
        })),
      },
    };
  }

  async updateSafeErrorLogStatus(logId: string, companyId: string, userId: string, action: 'reviewed' | 'resolved' | 'reopen') {
    const db = this.prisma as any;
    const existing = await db.platformSafeErrorLog.findUnique({ where: { id: logId } });
    if (!existing) {
      return { ok: false, error: 'LOG_NOT_FOUND' };
    }

    const now = new Date();
    const nextStatus =
      action === 'reviewed' ? 'reviewed' : action === 'resolved' ? 'resolved' : 'open';
    const updated = await db.platformSafeErrorLog.update({
      where: { id: logId },
      data: {
        status: nextStatus,
        reviewedAt: action === 'reviewed' ? now : action === 'reopen' ? null : existing.reviewedAt,
        reviewedByUserId: action === 'reviewed' ? userId : action === 'reopen' ? null : existing.reviewedByUserId,
        resolvedAt: action === 'resolved' ? now : action === 'reopen' ? null : existing.resolvedAt,
        resolvedByUserId: action === 'resolved' ? userId : action === 'reopen' ? null : existing.resolvedByUserId,
      },
    });

    await this.audit.log(
      companyId,
      'platform.safe_error_log.status',
      `Updated safe error log ${logId} to ${nextStatus}`,
      userId,
    );

    return { ok: true, item: updated };
  }

  async clearReviewedSafeErrorLogs(companyId: string, userId: string) {
    const db = this.prisma as any;
    const result = await db.platformSafeErrorLog.deleteMany({
      where: {
        clearable: true,
        auditProtected: false,
        status: { in: ['reviewed', 'resolved'] },
      },
    });
    await this.audit.log(
      companyId,
      'platform.safe_error_log.clear_reviewed',
      `Cleared ${Number(result.count || 0)} reviewed safe error logs`,
      userId,
    );
    return {
      ok: true,
      clearedCount: Number(result.count || 0),
      clearedByUserId: userId,
    };
  }

  async clearValidationSafeErrorLogs(companyId: string, userId: string) {
    const db = this.prisma as any;
    const result = await db.platformSafeErrorLog.deleteMany({
      where: {
        clearable: true,
        auditProtected: false,
        validationOnly: true,
      },
    });
    await this.audit.log(
      companyId,
      'platform.safe_error_log.clear_validation',
      `Cleared ${Number(result.count || 0)} validation-only safe error logs`,
      userId,
    );
    return {
      ok: true,
      clearedCount: Number(result.count || 0),
      clearedByUserId: userId,
    };
  }

  async exportSafeErrorLogSummary(input?: { category?: string; status?: string }) {
    const payload = await this.listSafeErrorLogs(input);
    const lines = [
      'category,area,status,count,first_seen,last_seen,clearable,audit_protected,summary',
      ...payload.items.map((row: any) =>
        [
          row.category,
          row.area,
          row.status,
          row.occurrenceCount,
          row.firstSeenAt,
          row.lastSeenAt,
          row.clearable ? 'yes' : 'no',
          row.auditProtected ? 'yes' : 'no',
          `"${String(row.summary || '').replace(/"/g, '""')}"`,
        ].join(','),
      ),
    ];
    return {
      ok: true,
      exportedAt: new Date().toISOString(),
      format: 'csv',
      content: lines.join('\n'),
    };
  }

  async getTenant360(tenantId: string) {
    const db = this.prisma as any;
    const now = new Date();
    const recentWindow = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const company = await db.company.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        timezone: true,
        currency: true,
        users: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            email: true,
            role: true,
            emailVerified: true,
            createdAt: true,
            lastLoginAt: true,
            lastActiveAt: true,
            isActive: true,
          },
        },
        tenantSetting: {
          select: {
            paymentsEnabled: true,
            bookingPublicEnabled: true,
            featureCustomerPortal: true,
            featureBookings: true,
            smtpHost: true,
            smtpPort: true,
            emailSenderName: true,
            businessConfigJson: true,
          },
        },
        subscriptions: {
          include: { plan: true },
        },
      },
    });
    if (!company) return { ok: false, error: 'TENANT_NOT_FOUND' };

    const [
      commercial,
      allowance,
      bookings,
      recentBookings,
      completedJobs,
      recentCompletedJobs,
      invoices,
      payments,
      locations,
      services,
      automationRules,
      failedAutomations,
      failedWebhooks,
      failedEmails,
      tradePortalActivity,
      auditHistory,
      firstBooking,
      firstCompletedJob,
      firstInvoice,
      firstPayment,
    ] = await Promise.all([
      this.billing.getTenantCommercialControl(tenantId),
      this.billing.getTenantJobAllowanceControl(tenantId),
      db.booking.count({ where: { companyId: tenantId } }),
      db.booking.count({ where: { companyId: tenantId, createdAt: { gte: recentWindow } } }),
      db.job.count({ where: { companyId: tenantId, completedAt: { not: null } } }),
      db.job.count({ where: { companyId: tenantId, completedAt: { gte: recentWindow } } }),
      db.job.count({ where: { companyId: tenantId, invoiceIssuedAt: { not: null } } }),
      db.job.count({ where: { companyId: tenantId, invoicePaidAt: { not: null } } }),
      db.location.count({ where: { companyId: tenantId } }),
      db.service.count({ where: { companyId: tenantId } }),
      db.automationRule.count({ where: { tenantId, enabled: true } }),
      Promise.resolve(0),
      db.webhookDelivery.count({ where: { tenantId, status: 'FAILED', createdAt: { gte: recentWindow } } }),
      db.notification.count({
        where: {
          companyId: tenantId,
          createdAt: { gte: recentWindow },
          OR: [
            { metaJson: { path: ['status'], equals: 'failed' } },
            { metaJson: { path: ['deliveryStatus'], equals: 'failed' } },
          ],
        },
      }).catch(() => 0),
      db.tradePortalAccess.count({ where: { tenantId, status: 'ACTIVE', revokedAt: null } }).catch(() => 0),
      db.auditEvent.findMany({
        where: { companyId: tenantId },
        select: { id: true, type: true, message: true, userId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      db.booking.findFirst({ where: { companyId: tenantId }, select: { createdAt: true }, orderBy: { createdAt: 'asc' } }),
      db.job.findFirst({ where: { companyId: tenantId, completedAt: { not: null } }, select: { completedAt: true }, orderBy: { completedAt: 'asc' } }),
      db.job.findFirst({ where: { companyId: tenantId, invoiceIssuedAt: { not: null } }, select: { invoiceIssuedAt: true }, orderBy: { invoiceIssuedAt: 'asc' } }),
      db.job.findFirst({ where: { companyId: tenantId, invoicePaidAt: { not: null } }, select: { invoicePaidAt: true }, orderBy: { invoicePaidAt: 'asc' } }),
    ]);

    const owner = company.users.find((row: any) => row.role === 'OWNER') || company.users[0] || null;
    const settings = company.tenantSetting;
    const subscription = company.subscriptions;
    const activeUsers = company.users.filter((row: any) => row.isActive !== false).length;
    const lastActiveAt = company.users
      .map((row: any) => row.lastActiveAt || row.lastLoginAt)
      .filter(Boolean)
      .sort((left: Date, right: Date) => right.getTime() - left.getTime())[0] || null;
    const emailReady = Boolean(
      (settings?.smtpHost && settings?.smtpPort && settings?.emailSenderName) ||
      String(process.env.EMAIL_FROM || '').trim(),
    );
    const paymentReady = Boolean(settings?.paymentsEnabled);

    const setupChecks = [
      { key: 'owner_verified', label: 'Owner email verified', met: Boolean(owner?.emailVerified), weight: 10 },
      { key: 'team_invited', label: 'Team invited', met: company.users.length > 1, weight: 8 },
      { key: 'location_configured', label: 'Location configured', met: locations > 0, weight: 10 },
      { key: 'services_configured', label: 'Services configured', met: services > 0, weight: 10 },
      { key: 'booking_live', label: 'Booking is live', met: Boolean(settings?.bookingPublicEnabled), weight: 10 },
      { key: 'email_ready', label: 'Email ready', met: emailReady, weight: 10 },
      { key: 'payment_ready', label: 'Customer payments ready', met: paymentReady, weight: 8 },
      { key: 'recent_login', label: 'Recent login activity', met: Boolean(lastActiveAt && lastActiveAt >= recentWindow), weight: 10 },
      { key: 'booking_adoption', label: 'Bookings created', met: bookings > 0, weight: 8 },
      { key: 'job_adoption', label: 'Jobs completed', met: completedJobs > 0, weight: 8 },
      { key: 'invoice_adoption', label: 'Invoices sent', met: invoices > 0, weight: 4 },
      { key: 'automation_adoption', label: 'Automations used', met: automationRules > 0, weight: 4 },
    ];
    const positiveScore = setupChecks.reduce((total, check) => total + (check.met ? check.weight : 0), 0);
    const failurePenalty = Math.min(25, failedAutomations * 5 + failedWebhooks * 3 + failedEmails * 3);
    const score = Math.max(0, Math.min(100, positiveScore - failurePenalty));
    const status = score >= 80 ? 'Healthy' : score >= 60 ? 'Watch' : score >= 35 ? 'At Risk' : 'Critical';
    const reasons = setupChecks.filter((check) => !check.met).map((check) => check.label);
    if (failedAutomations) reasons.push(`${failedAutomations} failed automation event(s) in 30 days`);
    if (failedWebhooks) reasons.push(`${failedWebhooks} failed webhook delivery event(s) in 30 days`);
    if (failedEmails) reasons.push(`${failedEmails} failed email event(s) in 30 days`);
    const trialEndsAt = subscription?.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
    const trialDaysRemaining = trialEndsAt ? Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86_400_000) : null;
    const risks = [
      trialDaysRemaining !== null && trialDaysRemaining >= 0 && trialDaysRemaining <= 14
        ? { key: 'trial_ending', severity: trialDaysRemaining <= 3 ? 'critical' : 'warning', label: `Trial ends in ${trialDaysRemaining} day(s)`, action: 'Review conversion and contact the workspace owner.' }
        : null,
      !lastActiveAt || lastActiveAt < recentWindow
        ? { key: 'inactive', severity: 'warning', label: 'Workspace inactive for 30+ days', action: 'Review onboarding blockers and owner activity.' }
        : null,
      bookings === 0 ? { key: 'no_first_booking', severity: 'warning', label: 'No first booking', action: 'Check booking publication and service setup.' } : null,
      completedJobs === 0 ? { key: 'no_first_job', severity: 'warning', label: 'No first completed job', action: 'Review dispatch and job workflow adoption.' } : null,
      !paymentReady ? { key: 'payment_incomplete', severity: 'warning', label: 'Customer payment setup incomplete', action: 'Review tenant-owned provider readiness.' } : null,
      failedAutomations > 0 ? { key: 'failed_automations', severity: 'critical', label: 'Failed automations detected', action: 'Inspect recent automation failures.' } : null,
      Number(allowance.summary?.remainingAllowance || 0) <= Math.max(2, Math.ceil(Number(allowance.summary?.monthlyIncludedAllowance || 0) * 0.1))
        ? { key: 'allowance_pressure', severity: 'warning', label: 'Usage is near or above allowance', action: 'Review usage and the authoritative allowance ledger.' }
        : null,
    ].filter(Boolean);
    const recommendedNextAction = String((risks[0] as any)?.action || (reasons.length ? `Resolve: ${reasons[0]}.` : 'No urgent action required.'));

    const timeline = [
      { type: 'workspace.created', label: 'Workspace created', at: company.createdAt },
      owner?.createdAt ? { type: 'owner.invited', label: 'Owner invited', at: owner.createdAt } : null,
      owner?.emailVerified ? { type: 'owner.verified', label: 'Owner email verified', at: owner.lastLoginAt || owner.createdAt } : null,
      firstBooking?.createdAt ? { type: 'booking.first', label: 'First booking created', at: firstBooking.createdAt } : null,
      firstCompletedJob?.completedAt ? { type: 'job.first_completed', label: 'First job completed', at: firstCompletedJob.completedAt } : null,
      firstInvoice?.invoiceIssuedAt ? { type: 'invoice.first_sent', label: 'First invoice sent', at: firstInvoice.invoiceIssuedAt } : null,
      firstPayment?.invoicePaidAt ? { type: 'payment.first_recorded', label: 'First payment recorded', at: firstPayment.invoicePaidAt } : null,
      ...auditHistory.map((row: any) => ({ type: row.type, label: row.message, at: row.createdAt, auditEventId: row.id })),
    ]
      .filter(Boolean)
      .sort((left: any, right: any) => new Date(right.at).getTime() - new Date(left.at).getTime());

    return {
      ok: true,
      account: {
        id: company.id,
        name: company.name,
        owner: owner ? { id: owner.id, email: owner.email, emailVerified: owner.emailVerified } : null,
        plan: subscription?.plan ? { code: subscription.plan.code, name: subscription.plan.name } : null,
        trial: {
          state: subscription?.status === 'trialing' && trialDaysRemaining !== null && trialDaysRemaining >= 0 ? 'active' : trialEndsAt ? 'expired' : 'not_applicable',
          startedAt: subscription?.trialStartedAt || null,
          endsAt: subscription?.trialEndsAt || null,
          daysRemaining: Math.max(0, trialDaysRemaining || 0),
        },
        subscription: {
          state: subscription?.status || 'inactive',
          currentPeriodEnd: subscription?.currentPeriodEnd || null,
          cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
        },
        billingState: commercial.controls?.paused ? 'commercially_paused' : 'active',
        paymentReadiness: paymentReady ? 'enabled' : 'not_ready',
        createdAt: company.createdAt,
        lastActiveAt,
        riskStatus: status,
      },
      commercial,
      usage: {
        ...allowance.summary,
        recurringExtraAllowance: Number(allowance.summary?.recurringExtraAllowance || 0),
        usageForecast: recentCompletedJobs,
        overageStatus: Number(allowance.summary?.purchasedCreditsDeficit || 0) > 0 ? 'over' : 'within',
        ledger: allowance.credits,
      },
      health: {
        score,
        status,
        reasons,
        recommendedNextAction,
        setupCompleteness: Math.round((setupChecks.filter((check) => check.met).length / setupChecks.length) * 100),
        inputs: setupChecks,
        activity: {
          loginActivity: lastActiveAt,
          activeUsers,
          bookingsCreated: bookings,
          bookingsCreatedLast30Days: recentBookings,
          jobsCompleted: completedJobs,
          jobsCompletedLast30Days: recentCompletedJobs,
          invoicesSent: invoices,
          paymentsRecorded: payments,
          tradePortalActivity,
          customerPortalEnabled: Boolean(settings?.featureCustomerPortal),
          automationsUsed: automationRules,
          failedAutomations,
          failedWebhooks,
          failedEmails,
        },
      },
      risks,
      recommendedNextAction,
      timeline,
      auditHistory,
      secretsReturned: false,
    };
  }
}
