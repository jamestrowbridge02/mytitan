import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { readPaymentCollectionConfig } from '../billing/payment-collection';
import { DEFAULT_PLAN_CODE } from '../billing/billing.constants';
import { isBillingEnforced } from '../common/billing-mode';
import { isTenantOwnerAllowlisted } from '../common/billing-entitlement';
import { isBillingAllowlisted } from '../common/billing-allowlist';
import { Role } from '../common/constants';
import { isTradePacksEnabled } from '../common/feature-flags';
import { hasPermission } from '../common/permissions';
import { resolveBookingsEnabled } from '../common/workspace-features';
import { PrismaService } from '../prisma/prisma.service';
import { TradePacksService } from '../trade-packs/trade-packs.service';
import { OnboardingTrade } from './onboarding.dto';

const MAX_ONBOARDING_STEP = 6;
const INTEGRATION_KEYS = [
  'payments',
  'bookings',
  'accounting',
  'social',
  'ai',
  'customer_portal',
  'whatsapp',
] as const;
type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

function canAccessChecklistHref(role: Role | undefined, href: string | undefined) {
  if (!href) return true;
  const parsed = new URL(href, 'http://mytitan.local');
  const pathname = parsed.pathname;
  if (pathname.startsWith('/dashboard/billing')) return hasPermission(role, 'billing.manage');
  if (pathname.startsWith('/dashboard/revenue')) return hasPermission(role, 'billing.manage');
  if (pathname.startsWith('/dashboard/quotes')) return hasPermission(role, 'billing.manage');
  if (pathname.startsWith('/dashboard/users')) {
    return hasPermission(role, 'users.invite') || hasPermission(role, 'users.role_assign');
  }
  if (pathname.startsWith('/dashboard/portal')) return hasPermission(role, 'portal.manage');
  if (pathname.startsWith('/dashboard/technician')) return hasPermission(role, 'technician.execute');
  if (pathname.startsWith('/dashboard/analytics')) return hasPermission(role, 'dashboard.view_intelligence');
  if (pathname.startsWith('/dashboard/compliance')) return hasPermission(role, 'dashboard.view_intelligence');
  if (pathname.startsWith('/dashboard/intelligence')) return hasPermission(role, 'dashboard.view_intelligence');
  if (pathname.startsWith('/dashboard/settings')) return hasPermission(role, 'settings.manage');
  return true;
}

const PLAN_INTEGRATIONS: Record<string, Record<IntegrationKey, boolean>> = {
  SOLE_TRADER: {
    payments: true,
    bookings: true,
    accounting: false,
    social: false,
    ai: true,
    customer_portal: false,
    whatsapp: false,
  },
  BUSINESS: {
    payments: true,
    bookings: true,
    accounting: true,
    social: false,
    ai: true,
    customer_portal: false,
    whatsapp: false,
  },
  ENTERPRISE: {
    payments: true,
    bookings: true,
    accounting: true,
    social: true,
    ai: true,
    customer_portal: true,
    whatsapp: true,
  },
};

const INTEGRATION_META: Record<IntegrationKey, { name: string; description: string; configureUrl: string }> = {
  payments: {
    name: 'Payments',
    description: 'Accept card and bank payments from customers.',
    configureUrl: '/dashboard/billing',
  },
  bookings: {
    name: 'Bookings',
    description: 'Let customers request and schedule bookings online.',
    configureUrl: '/dashboard/bookings',
  },
  accounting: {
    name: 'Accounting',
    description: 'Track revenue, tax, and exports for accounting tools.',
    configureUrl: '/dashboard/settings',
  },
  social: {
    name: 'Social',
    description: 'Share updates and offers across social channels.',
    configureUrl: '/dashboard/settings',
  },
  ai: {
    name: 'AI Assistant',
    description: 'Enable guided AI support for your team.',
    configureUrl: '/dashboard/settings',
  },
  customer_portal: {
    name: 'Customer Portal',
    description: 'Give customers a self-service portal for invoices and updates.',
    configureUrl: '/dashboard/settings',
  },
  whatsapp: {
    name: 'WhatsApp',
    description: 'Send updates and reminders via WhatsApp.',
    configureUrl: '/dashboard/settings',
  },
};

const TRADE_TO_PACK: Record<OnboardingTrade, string> = {
  WHEELS: 'WHEELS',
  BODYSHOP: 'BODYSHOP',
  GARAGE: 'GARAGE',
  MOBILE: 'MOBILE_TECH',
};

const PACK_TO_TRADE: Record<string, OnboardingTrade> = {
  WHEELS: 'WHEELS',
  BODYSHOP: 'BODYSHOP',
  GARAGE: 'GARAGE',
  MOBILE_TECH: 'MOBILE',
};

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tradePacks: TradePacksService,
  ) {}

  private async getPlanCode(tenantId: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    if (settings?.planId) {
      const plan = await db.plan.findUnique({ where: { id: settings.planId } });
      return plan?.code ?? DEFAULT_PLAN_CODE;
    }
    return DEFAULT_PLAN_CODE;
  }

  async getIntegrations(tenantId: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const planCode = await this.getPlanCode(tenantId);
    const plan = PLAN_INTEGRATIONS[planCode] ?? PLAN_INTEGRATIONS[DEFAULT_PLAN_CODE];
    const billingBypass = !isBillingEnforced() || await isTenantOwnerAllowlisted(this.prisma, tenantId);

    const enabledMap: Record<IntegrationKey, boolean> = {
      payments: Boolean(settings?.featurePayments),
      bookings: resolveBookingsEnabled(settings),
      accounting: Boolean(settings?.featureAccounting),
      social: Boolean(settings?.featureSocial),
      ai: Boolean(settings?.featureAI),
      customer_portal: Boolean(settings?.featureCustomerPortal),
      whatsapp: Boolean(settings?.featureWhatsApp),
    };

    return INTEGRATION_KEYS.map((key) => ({
      key,
      name: INTEGRATION_META[key].name,
      description: INTEGRATION_META[key].description,
      configureUrl: INTEGRATION_META[key].configureUrl,
      enabled: enabledMap[key],
      allowed: billingBypass ? true : Boolean(plan[key]),
    }));
  }

  async toggleIntegration(tenantId: string, userId: string, role: string, key: IntegrationKey, enabled: boolean) {
    if (!INTEGRATION_KEYS.includes(key)) {
      throw new BadRequestException('Unknown integration key');
    }

    const planCode = await this.getPlanCode(tenantId);
    const plan = PLAN_INTEGRATIONS[planCode] ?? PLAN_INTEGRATIONS[DEFAULT_PLAN_CODE];
    if (isBillingEnforced() && !await isTenantOwnerAllowlisted(this.prisma, tenantId) && enabled && !plan[key]) {
      throw new ForbiddenException('Upgrade required to enable this integration.');
    }

    const db = this.prisma as any;
    const update: Record<string, boolean> = {};
    const legacy: Record<string, boolean> = {};
    if (key === 'payments') {
      update.featurePayments = enabled;
      legacy.paymentsEnabled = enabled;
    }
    if (key === 'bookings') {
      update.featureBookings = enabled;
      legacy.bookingsEnabled = enabled;
    }
    if (key === 'accounting') {
      update.featureAccounting = enabled;
      legacy.accountingEnabled = enabled;
    }
    if (key === 'social') {
      update.featureSocial = enabled;
      legacy.socialEnabled = enabled;
    }
    if (key === 'ai') {
      update.featureAI = enabled;
      legacy.aiEnabled = enabled;
    }
    if (key === 'customer_portal') {
      update.featureCustomerPortal = enabled;
    }
    if (key === 'whatsapp') {
      update.featureWhatsApp = enabled;
    }

    await db.tenantSetting.upsert({
      where: { tenantId },
      update: { ...update, ...legacy },
      create: { tenantId, ...update, ...legacy },
    });

    await this.audit.log(
      tenantId,
      'integrations.toggle',
      `Integration ${key} ${enabled ? 'enabled' : 'disabled'}`,
      userId,
    );

    return { key, enabled };
  }

  async selectTrade(tenantId: string, userId: string, trade: OnboardingTrade) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const tradeValue = String(trade || '').toUpperCase() as OnboardingTrade;
    const packCode = TRADE_TO_PACK[tradeValue];
    if (!packCode) {
      throw new BadRequestException('Invalid trade selection.');
    }

    const currentTrade = (settings?.primaryTrade || null) as OnboardingTrade | null;
    const currentPackCode = currentTrade ? TRADE_TO_PACK[currentTrade] : null;

    if (currentPackCode && currentPackCode !== packCode) {
      try {
        await this.tradePacks.uninstall(tenantId, userId, currentPackCode);
      } catch {
        // Continue; install below will still run and enforce limits.
      }
    }

    await this.tradePacks.ensurePackDefinitions();
    await this.tradePacks.install(tenantId, userId, packCode);

    await db.tenantSetting.upsert({
      where: { tenantId },
      update: {
        primaryTrade: tradeValue,
        onboardingStep: Math.max(Number(settings?.onboardingStep ?? 0), 1),
      },
      create: {
        tenantId,
        primaryTrade: tradeValue,
        onboardingStep: 1,
      },
    });

    await this.audit.log(tenantId, 'onboarding.trade', `Onboarding trade selected: ${tradeValue}`, userId);

    return {
      trade: tradeValue,
      packCode,
    };
  }

  async getTradeSelection(tenantId: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const installed = await this.tradePacks.getInstalled(tenantId);

    return {
      trade: (settings?.primaryTrade || null) as OnboardingTrade | null,
      installedPacks: installed.items.map((item: any) => ({
        packCode: item.packCode,
        trade: PACK_TO_TRADE[item.packCode] ?? null,
      })),
    };
  }

  async getChecklist(tenantId: string, role?: Role) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const [
      servicesCount,
      jobsCreatedCount,
      jobsCompletedCount,
      serviceRecordsCount,
      bookingsCount,
      bookingHoursCount,
    ] = await Promise.all([
      db.serviceCatalogItem.count({
        where: { tenantId, active: true },
      }),
      db.job.count({ where: { companyId: tenantId } }),
      db.job.count({ where: { companyId: tenantId, status: 'COMPLETED' } }),
      db.job.count({
        where: {
          companyId: tenantId,
          OR: [
            { invoicePdfUrl: { not: null } },
            { pdf: { isNot: null } },
          ],
        },
      }),
      db.booking.count({ where: { companyId: tenantId } }),
      db.bookingBusinessHour.count({ where: { tenantId } }),
    ]);
    const paymentCollection = readPaymentCollectionConfig(settings);
    const paymentMethodReady = Boolean(
      settings?.paymentsEnabled ||
        settings?.featurePayments ||
        paymentCollection.preferredProvider ||
        paymentCollection.requestedProviders.length,
    );
    const firstWorkflowStarted = bookingsCount > 0 || jobsCreatedCount > 0;

    let installedTradePacks = 0;
    if (isTradePacksEnabled()) {
      const installs = await db.tradePackInstall.findMany({
        where: { tenantId },
        select: { configJson: true },
      });
      installedTradePacks = installs.filter((install: any) => {
        if (!install?.configJson) return true;
        return install.configJson?.active !== false;
      }).length;
    }

    const items = [
      {
        key: 'workspace_details',
        title: 'Set business details',
        description: 'Add the business name and reply-to email customers should recognise.',
        completed: Boolean(settings?.companyName && settings?.emailReplyTo),
        href: '/dashboard/settings',
      },
      {
        key: 'booking_link',
        title: 'Set booking link',
        description: 'Turn on the public booking page so customers can request work.',
        completed: Boolean(settings?.bookingPublicEnabled),
        href: '/dashboard/booking/settings',
      },
      {
        key: 'first_service',
        title: 'Add first service',
        description: 'Create at least one real service customers can book or approve.',
        completed: servicesCount > 0,
        href: '/dashboard/booking/settings',
      },
      {
        key: 'working_hours',
        title: 'Set working hours',
        description: 'Show customers when you actually want to accept bookings.',
        completed: bookingHoursCount > 0,
        href: '/dashboard/booking/settings',
      },
      {
        key: 'payment_method',
        title: 'Choose payment collection',
        description: 'Decide whether customers pay through Stripe or by manual follow-up.',
        completed: paymentMethodReady,
        href: '/dashboard/billing',
      },
      {
        key: 'first_booking_or_job',
        title: 'Create or receive first booking',
        description: 'Start the first real workflow with a booking request or a manually created job.',
        completed: firstWorkflowStarted,
        href: bookingsCount > 0 ? '/dashboard/bookings' : '/dashboard/jobs/new',
      },
      {
        key: 'complete_first_job',
        title: 'Complete first job',
        description: 'Move one job all the way through so the team sees the real working path.',
        completed: jobsCompletedCount > 0,
        href: jobsCreatedCount > 0 ? '/dashboard/jobs' : '/dashboard/work',
      },
      {
        key: 'send_result',
        title: 'Send result and follow-up',
        description: 'Send the customer-facing record so the outcome and payment follow-up are clear.',
        completed: serviceRecordsCount > 0,
        href: jobsCompletedCount > 0 ? '/dashboard/jobs' : '/dashboard/work',
      },
    ];

    if (isTradePacksEnabled()) {
      items.splice(3, 0, {
        key: 'trade_pack',
        title: 'Install a trade pack',
        description: 'Apply an industry preset so setup is faster.',
        completed: installedTradePacks > 0,
        href: '/dashboard/trade-packs',
      });
    }

    const completedCount = items.filter((item) => item.completed).length;
    const firstValueJourney = [
      {
        key: 'publish_booking_path',
        title: 'Publish your booking path',
        description: 'Turn on the booking page, add a service, and make the first request easy to place.',
        completed: Boolean(settings?.bookingPublicEnabled) && servicesCount > 0 && bookingHoursCount > 0,
        href: '/dashboard/booking/settings',
      },
      {
        key: 'run_first_workflow',
        title: 'Run the first booking or job',
        description: 'Create or receive one live piece of work so the workspace starts reflecting reality.',
        completed: firstWorkflowStarted,
        href: bookingsCount > 0 ? '/dashboard/bookings' : '/dashboard/jobs/new',
      },
      {
        key: 'finish_and_follow_up',
        title: 'Complete, send, and get paid',
        description: 'Finish the job, send the result, and use the payment path you have chosen.',
        completed: jobsCompletedCount > 0 && serviceRecordsCount > 0,
        href: jobsCompletedCount > 0 ? '/dashboard/jobs' : '/dashboard/work',
      },
      {
        key: 'payment_path',
        title: 'Make payment follow-up clear',
        description: 'Choose a truthful payment route before you ask the customer to pay.',
        completed: paymentMethodReady,
        href: '/dashboard/billing',
      },
    ];
    const recommendedNextAction =
      firstValueJourney.find((item) => !item.completed) ||
      items.find((item) => !item.completed) || {
        key: 'review_dashboard',
        title: 'Open dashboard',
        description: 'Your workspace is ready to run live work.',
        completed: true,
        href: '/dashboard',
      };
    const workspaceAreas = [
      {
        key: 'jobs',
        title: 'Jobs',
        description: 'Create, price, complete, and publish customer work.',
        href: '/dashboard/jobs',
      },
      {
        key: 'customers',
        title: 'Customers',
        description: 'Keep contact details, history, and follow-up in one place.',
        href: '/dashboard/customers',
      },
      {
        key: 'bookings',
        title: 'Bookings',
        description: 'Capture new requests and convert them into scheduled work.',
        href: '/dashboard/bookings',
      },
      {
        key: 'calendar',
        title: 'Calendar',
        description: 'See capacity, bookings, and workload by day.',
        href: '/dashboard/calendar',
      },
    ];
    const filterItems = <T extends { href?: string }>(entries: T[]) =>
      entries.filter((entry) => canAccessChecklistHref(role, entry.href));
    const filteredItems = filterItems(items);
    const filteredFirstValueJourney = filterItems(firstValueJourney);
    const filteredWorkspaceAreas = filterItems(workspaceAreas);
    const filteredRecommendedNextAction =
      recommendedNextAction && canAccessChecklistHref(role, recommendedNextAction.href)
        ? recommendedNextAction
        : filteredFirstValueJourney.find((item) => !item.completed) ||
          filteredItems.find((item) => !item.completed) ||
          filteredWorkspaceAreas[0] || {
            key: 'review_dashboard',
            title: 'Open dashboard',
            description: 'Your workspace is ready to run live work.',
            completed: true,
            href: '/dashboard',
          };

    return {
      items: filteredItems,
      completedCount: filteredItems.filter((item) => item.completed).length,
      total: filteredItems.length,
      counts: {
        services: servicesCount,
        jobsCreated: jobsCreatedCount,
        jobsCompleted: jobsCompletedCount,
        serviceRecords: serviceRecordsCount,
        bookings: bookingsCount,
        bookingHours: bookingHoursCount,
      },
      firstValueJourney: filteredFirstValueJourney,
      recommendedNextAction: filteredRecommendedNextAction,
      workspaceAreas: filteredWorkspaceAreas,
    };
  }

  async advanceOnboardingStep(tenantId: string, userId: string, role: string, step: number) {
    if (step < 0 || step > MAX_ONBOARDING_STEP) {
      throw new BadRequestException('Invalid onboarding step');
    }

    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const currentStep = Number(settings?.onboardingStep ?? 0);

    if (step > currentStep + 1 && role !== 'OWNER') {
      throw new ForbiddenException('You can only advance one step at a time.');
    }

    const nextStep = Math.max(currentStep, step + 1);
    await db.tenantSetting.upsert({
      where: { tenantId },
      update: { onboardingStep: nextStep },
      create: { tenantId, onboardingStep: nextStep },
    });

    await this.audit.log(tenantId, 'onboarding.step', `Completed onboarding step ${step}`, userId);
    return { onboardingStep: nextStep };
  }

  async completeOnboarding(tenantId: string, userId: string) {
    const db = this.prisma as any;
    await db.tenantSetting.upsert({
      where: { tenantId },
      update: { onboardingCompleted: true, onboardingStep: MAX_ONBOARDING_STEP + 1 },
      create: { tenantId, onboardingCompleted: true, onboardingStep: MAX_ONBOARDING_STEP + 1 },
    });
    await this.audit.log(tenantId, 'onboarding.complete', 'Onboarding completed', userId);
    return { completed: true };
  }
}
