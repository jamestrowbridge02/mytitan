"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnboardingService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const billing_constants_1 = require("../billing/billing.constants");
const feature_flags_1 = require("../common/feature-flags");
const prisma_service_1 = require("../prisma/prisma.service");
const trade_packs_service_1 = require("../trade-packs/trade-packs.service");
const MAX_ONBOARDING_STEP = 6;
const INTEGRATION_KEYS = [
    'payments',
    'bookings',
    'accounting',
    'social',
    'ai',
    'customer_portal',
    'whatsapp',
];
const PLAN_INTEGRATIONS = {
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
const INTEGRATION_META = {
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
const TRADE_TO_PACK = {
    WHEELS: 'WHEELS',
    BODYSHOP: 'BODYSHOP',
    GARAGE: 'GARAGE',
    MOBILE: 'MOBILE_TECH',
};
const PACK_TO_TRADE = {
    WHEELS: 'WHEELS',
    BODYSHOP: 'BODYSHOP',
    GARAGE: 'GARAGE',
    MOBILE_TECH: 'MOBILE',
};
let OnboardingService = class OnboardingService {
    constructor(prisma, audit, tradePacks) {
        this.prisma = prisma;
        this.audit = audit;
        this.tradePacks = tradePacks;
    }
    async getPlanCode(tenantId) {
        const db = this.prisma;
        const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
        if (settings?.planId) {
            const plan = await db.plan.findUnique({ where: { id: settings.planId } });
            return plan?.code ?? billing_constants_1.DEFAULT_PLAN_CODE;
        }
        return billing_constants_1.DEFAULT_PLAN_CODE;
    }
    async getIntegrations(tenantId) {
        const db = this.prisma;
        const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
        const planCode = await this.getPlanCode(tenantId);
        const plan = PLAN_INTEGRATIONS[planCode] ?? PLAN_INTEGRATIONS[billing_constants_1.DEFAULT_PLAN_CODE];
        const enabledMap = {
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
    async toggleIntegration(tenantId, userId, role, key, enabled) {
        if (!INTEGRATION_KEYS.includes(key)) {
            throw new common_1.BadRequestException('Unknown integration key');
        }
        const planCode = await this.getPlanCode(tenantId);
        const plan = PLAN_INTEGRATIONS[planCode] ?? PLAN_INTEGRATIONS[billing_constants_1.DEFAULT_PLAN_CODE];
        if (enabled && !plan[key]) {
            throw new common_1.ForbiddenException('Upgrade required to enable this integration.');
        }
        const db = this.prisma;
        const update = {};
        const legacy = {};
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
        await this.audit.log(tenantId, 'integrations.toggle', `Integration ${key} ${enabled ? 'enabled' : 'disabled'}`, userId);
        return { key, enabled };
    }
    async selectTrade(tenantId, userId, trade) {
        const db = this.prisma;
        const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
        const tradeValue = String(trade || '').toUpperCase();
        const packCode = TRADE_TO_PACK[tradeValue];
        if (!packCode) {
            throw new common_1.BadRequestException('Invalid trade selection.');
        }
        const currentTrade = (settings?.primaryTrade || null);
        const currentPackCode = currentTrade ? TRADE_TO_PACK[currentTrade] : null;
        if (currentPackCode && currentPackCode !== packCode) {
            try {
                await this.tradePacks.uninstall(tenantId, userId, currentPackCode);
            }
            catch {
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
    async getTradeSelection(tenantId) {
        const db = this.prisma;
        const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
        const installed = await this.tradePacks.getInstalled(tenantId);
        return {
            trade: (settings?.primaryTrade || null),
            installedPacks: installed.items.map((item) => ({
                packCode: item.packCode,
                trade: PACK_TO_TRADE[item.packCode] ?? null,
            })),
        };
    }
    async getChecklist(tenantId) {
        const db = this.prisma;
        const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
        const servicesCount = await db.serviceCatalogItem.count({
            where: { tenantId, active: true },
        });
        const usersCount = await db.user.count({ where: { companyId: tenantId } });
        const integrationsEnabled = Boolean(settings?.featurePayments ||
            settings?.featureBookings ||
            settings?.featureAccounting ||
            settings?.featureSocial ||
            settings?.featureAI ||
            settings?.featureCustomerPortal ||
            settings?.featureWhatsApp);
        let installedTradePacks = 0;
        if ((0, feature_flags_1.isTradePacksEnabled)()) {
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
        if ((0, feature_flags_1.isTradePacksEnabled)()) {
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
    async advanceOnboardingStep(tenantId, userId, role, step) {
        if (step < 0 || step > MAX_ONBOARDING_STEP) {
            throw new common_1.BadRequestException('Invalid onboarding step');
        }
        const db = this.prisma;
        const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
        const currentStep = Number(settings?.onboardingStep ?? 0);
        if (step > currentStep + 1 && role !== 'OWNER') {
            throw new common_1.ForbiddenException('You can only advance one step at a time.');
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
    async completeOnboarding(tenantId, userId) {
        const db = this.prisma;
        await db.tenantSetting.upsert({
            where: { tenantId },
            update: { onboardingCompleted: true, onboardingStep: MAX_ONBOARDING_STEP + 1 },
            create: { tenantId, onboardingCompleted: true, onboardingStep: MAX_ONBOARDING_STEP + 1 },
        });
        await this.audit.log(tenantId, 'onboarding.complete', 'Onboarding completed', userId);
        return { completed: true };
    }
};
exports.OnboardingService = OnboardingService;
exports.OnboardingService = OnboardingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        trade_packs_service_1.TradePacksService])
], OnboardingService);
//# sourceMappingURL=onboarding.service.js.map