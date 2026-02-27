import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_PLAN_CODE } from '../billing/billing.constants';
import { isTradePacksEnabled } from '../common/feature-flags';
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

    const enabledMap: Record<IntegrationKey, boolean> = {
      payments: Boolean(settings?.featurePayments),
      bookings: Boolean(settings?.featureBookings),
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
      allowed: Boolean(plan[key]),
    }));
  }

  async toggleIntegration(tenantId: string, userId: string, role: string, key: IntegrationKey, enabled: boolean) {
    if (!INTEGRATION_KEYS.includes(key)) {
      throw new BadRequestException('Unknown integration key');
    }

    const planCode = await this.getPlanCode(tenantId);
    const plan = PLAN_INTEGRATIONS[planCode] ?? PLAN_INTEGRATIONS[DEFAULT_PLAN_CODE];
    if (enabled && !plan[key]) {
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

  async getChecklist(tenantId: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const servicesCount = await db.serviceCatalogItem.count({
      where: { tenantId, active: true },
    });
    const usersCount = await db.user.count({ where: { companyId: tenantId } });
    const integrationsEnabled = Boolean(
      settings?.featurePayments ||
        settings?.featureBookings ||
        settings?.featureAccounting ||
        settings?.featureSocial ||
        settings?.featureAI ||
        settings?.featureCustomerPortal ||
        settings?.featureWhatsApp,
    );

    let installedTradePacks = 0;
    if (isTradePacksEnabled()) {
      installedTradePacks = await db.tradePackInstall.count({
        where: {
          tenantId,
          OR: [{ configJson: null }, { configJson: { path: ['active'], equals: true } }],
        },
      });
    }

    const items = [
      {
        key: 'logo',
        title: 'Add your logo',
        description: 'Upload a logo so invoices and emails look professional.',
        completed: Boolean(settings?.logoUrl),
        href: '/dashboard/settings',
      },
      {
        key: 'support_email',
        title: 'Confirm support email',
        description: 'Set a reply-to email for customer messages.',
        completed: Boolean(settings?.emailReplyTo),
        href: '/dashboard/settings',
      },
      {
        key: 'catalog',
        title: 'Add a service',
        description: 'Create at least one service or product price.',
        completed: servicesCount > 0,
        href: '/dashboard/catalog',
      },
      {
        key: 'integrations',
        title: 'Enable an integration',
        description: 'Turn on at least one optional integration.',
        completed: integrationsEnabled,
        href: '/dashboard/integrations',
      },
      {
        key: 'bookings',
        title: 'Set booking hours',
        description: 'Define business hours for online bookings.',
        completed: Boolean(settings?.bookingPublicEnabled),
        href: '/dashboard/bookings',
      },
      {
        key: 'invite',
        title: 'Invite a team member',
        description: 'Add at least one teammate to help you work.',
        completed: usersCount > 1,
        href: '/dashboard/users',
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
    return {
      items,
      completedCount,
      total: items.length,
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
