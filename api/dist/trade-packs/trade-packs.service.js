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
exports.TradePacksService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const billing_constants_1 = require("../billing/billing.constants");
const prisma_service_1 = require("../prisma/prisma.service");
const trade_packs_data_1 = require("./trade-packs.data");
const PACK_LIMITS = {
    SOLE_TRADER: 1,
    BUSINESS: 2,
    ENTERPRISE: Number.MAX_SAFE_INTEGER,
};
const PACK_CODE_SET = new Set(trade_packs_data_1.TRADE_PACKS.map((pack) => pack.code));
let TradePacksService = class TradePacksService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async ensurePackDefinitions() {
        const db = this.prisma;
        for (const pack of trade_packs_data_1.TRADE_PACKS) {
            await db.tradePack.upsert({
                where: { code: pack.code },
                create: {
                    code: pack.code,
                    name: pack.name,
                    description: pack.description,
                    tags: pack.tags,
                    version: 1,
                    isActive: true,
                },
                update: {
                    name: pack.name,
                    description: pack.description,
                    tags: pack.tags,
                    isActive: true,
                },
            });
        }
    }
    getPackOrThrow(packCode) {
        const code = String(packCode || '').toUpperCase();
        const pack = trade_packs_data_1.TRADE_PACKS.find((entry) => entry.code === code);
        if (!pack || !PACK_CODE_SET.has(code)) {
            throw new common_1.BadRequestException('Unknown trade pack code.');
        }
        return pack;
    }
    async getPlanCode(tenantId) {
        const db = this.prisma;
        const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
        if (settings?.planId) {
            const plan = await db.plan.findUnique({ where: { id: settings.planId } });
            return plan?.code ?? billing_constants_1.DEFAULT_PLAN_CODE;
        }
        const subscription = await db.tenantSubscription.findUnique({
            where: { tenantId },
            include: { plan: true },
        });
        return subscription?.plan?.code ?? billing_constants_1.DEFAULT_PLAN_CODE;
    }
    async listAvailable(tenantId) {
        await this.ensurePackDefinitions();
        const installed = await this.getInstalled(tenantId);
        const installedMap = new Map(installed.items.map((item) => [item.packCode, item]));
        const planCode = await this.getPlanCode(tenantId);
        const limit = PACK_LIMITS[planCode] ?? PACK_LIMITS[billing_constants_1.DEFAULT_PLAN_CODE];
        return trade_packs_data_1.TRADE_PACKS.map((pack) => ({
            code: pack.code,
            name: pack.name,
            description: pack.description,
            tags: pack.tags,
            includes: pack.includes,
            installed: installedMap.has(pack.code),
            planCode,
            planLimit: Number.isFinite(limit) ? limit : null,
        }));
    }
    async getInstalled(tenantId) {
        const db = this.prisma;
        const installs = await db.tradePackInstall.findMany({
            where: {
                tenantId,
                OR: [{ configJson: null }, { configJson: { path: ['active'], equals: true } }],
            },
            orderBy: { installedAt: 'desc' },
        });
        return {
            items: installs.map((install) => ({
                packCode: install.packCode,
                installedAt: install.installedAt,
                installedByUserId: install.installedByUserId,
                configJson: install.configJson,
            })),
            count: installs.length,
        };
    }
    async assertPlanLimit(tenantId, nextPackCode) {
        const planCode = await this.getPlanCode(tenantId);
        const limit = PACK_LIMITS[planCode] ?? PACK_LIMITS[billing_constants_1.DEFAULT_PLAN_CODE];
        const installed = await this.getInstalled(tenantId);
        if (nextPackCode && installed.items.some((item) => item.packCode === nextPackCode)) {
            return { planCode, limit, installedCount: installed.count };
        }
        if (installed.count >= limit) {
            throw new common_1.ForbiddenException(`Your plan supports up to ${limit} trade pack${limit === 1 ? '' : 's'}.`);
        }
        return { planCode, limit, installedCount: installed.count };
    }
    async seedCatalog(tenantId, userId, pack) {
        const db = this.prisma;
        for (const item of pack.catalogItems) {
            const key = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
            const existing = await db.serviceCatalogItem.findFirst({
                where: {
                    tenantId,
                    OR: [{ key }, { name: item.name }],
                },
            });
            if (existing) {
                continue;
            }
            await db.serviceCatalogItem.create({
                data: {
                    tenantId,
                    key,
                    name: item.name,
                    description: item.description,
                    unitPrice: item.unitPrice,
                    defaultQty: item.defaultQty,
                    durationMinutes: item.durationMinutes,
                    capacity: item.capacity,
                    active: true,
                    vatEligible: false,
                },
            });
            await this.audit.log(tenantId, 'catalog.item.create', `Trade pack seeded catalog item ${item.name}`, userId);
        }
    }
    async seedTemplatePresets(tenantId, pack) {
        const db = this.prisma;
        const createPreset = async (type, key, name, dataJson) => {
            await db.templatePreset.upsert({
                where: { tenantId_packCode_type_key: { tenantId, packCode: pack.code, type, key } },
                create: {
                    tenantId,
                    packCode: pack.code,
                    type,
                    key,
                    name,
                    dataJson,
                    isActive: true,
                },
                update: {
                    dataJson,
                    name,
                    isActive: true,
                },
            });
        };
        for (const entry of pack.catalogItems) {
            await createPreset('CATALOG_ITEM', entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), entry.name, entry);
        }
        for (const entry of pack.pricingPresets) {
            await createPreset('PRICING_PRESET', entry.key, entry.label, entry);
        }
        for (const entry of pack.checklist) {
            await createPreset('CHECKLIST', entry.key, entry.title, entry);
        }
        for (const entry of pack.emailTemplates) {
            await createPreset('EMAIL_TEMPLATE', entry.key, entry.subject, entry);
        }
        for (const entry of pack.pdfTemplates) {
            await createPreset('PDF_TEMPLATE', entry.key, entry.title, entry);
        }
        await createPreset('BOOKING_DEFAULTS', `${pack.code.toLowerCase()}_booking`, `${pack.name} booking defaults`, pack.bookingDefaults);
        await createPreset('PORTAL_COPY', `${pack.code.toLowerCase()}_portal`, `${pack.name} portal copy`, pack.portalCopy);
    }
    async seedEmailTemplates(tenantId, userId, pack) {
        const db = this.prisma;
        const defaults = [
            {
                type: 'JOB_NOTIFICATION',
                subject: `${pack.name}: Job update`,
                bodyText: pack.portalCopy.intro,
            },
            {
                type: 'INVOICE',
                subject: `${pack.name}: Invoice available`,
                bodyText: pack.portalCopy.paymentNote,
            },
            {
                type: 'BOOKING_CONFIRMATION',
                subject: pack.emailTemplates[0]?.subject ?? `${pack.name} booking confirmed`,
                bodyText: pack.emailTemplates[0]?.bodyText ?? 'Your booking is confirmed.',
            },
        ];
        for (const tpl of defaults) {
            const existing = await db.emailTemplate.findFirst({ where: { tenantId, type: tpl.type } });
            if (existing)
                continue;
            await db.emailTemplate.create({
                data: {
                    tenantId,
                    type: tpl.type,
                    subject: tpl.subject,
                    bodyText: tpl.bodyText,
                },
            });
            await this.audit.log(tenantId, 'email-template.create', `Trade pack seeded template ${tpl.type}`, userId);
        }
    }
    async seedBookingDefaults(tenantId, userId, pack) {
        const db = this.prisma;
        const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
        const bookingsEnabled = Boolean(settings?.featureBookings ?? settings?.bookingsEnabled);
        if (!bookingsEnabled) {
            return;
        }
        const existingHours = await db.bookingBusinessHour.count({ where: { tenantId } });
        if (existingHours === 0) {
            const startMinute = 9 * 60;
            const endMinute = 17 * 60;
            await db.bookingBusinessHour.createMany({
                data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ tenantId, dayOfWeek, startMinute, endMinute })),
            });
            await this.audit.log(tenantId, 'booking.settings.update', `Trade pack seeded booking defaults (${pack.code})`, userId);
        }
    }
    async updateTenantDefaults(tenantId, pack) {
        const db = this.prisma;
        const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
        const existingPresets = Array.isArray(settings?.defaultServiceNamePresets) ? settings.defaultServiceNamePresets : [];
        const merged = Array.from(new Set([...existingPresets, ...pack.catalogItems.map((item) => item.name)]));
        await db.tenantSetting.upsert({
            where: { tenantId },
            create: {
                tenantId,
                defaultServiceNamePresets: merged,
            },
            update: {
                defaultServiceNamePresets: merged,
                onboardingStep: Math.max(Number(settings?.onboardingStep ?? 0), 3),
            },
        });
    }
    async install(tenantId, userId, packCode) {
        const pack = this.getPackOrThrow(packCode);
        await this.ensurePackDefinitions();
        const planMeta = await this.assertPlanLimit(tenantId, pack.code);
        const db = this.prisma;
        await db.tradePackInstall.upsert({
            where: { tenantId_packCode: { tenantId, packCode: pack.code } },
            create: {
                tenantId,
                packCode: pack.code,
                installedByUserId: userId,
                configJson: { active: true, version: 1 },
            },
            update: {
                installedByUserId: userId,
                configJson: { active: true, version: 1 },
            },
        });
        await this.seedCatalog(tenantId, userId, pack);
        await this.seedTemplatePresets(tenantId, pack);
        await this.seedEmailTemplates(tenantId, userId, pack);
        await this.seedBookingDefaults(tenantId, userId, pack);
        await this.updateTenantDefaults(tenantId, pack);
        await this.audit.log(tenantId, 'trade-pack.install', `Installed trade pack ${pack.code}`, userId);
        return {
            ok: true,
            packCode: pack.code,
            planCode: planMeta.planCode,
            installedCount: planMeta.installedCount + 1,
            limit: Number.isFinite(planMeta.limit) ? planMeta.limit : null,
        };
    }
    async uninstall(tenantId, userId, packCode) {
        const pack = this.getPackOrThrow(packCode);
        const db = this.prisma;
        const existing = await db.tradePackInstall.findUnique({
            where: { tenantId_packCode: { tenantId, packCode: pack.code } },
        });
        if (!existing) {
            return { ok: true, packCode: pack.code, wasInstalled: false };
        }
        await db.tradePackInstall.update({
            where: { tenantId_packCode: { tenantId, packCode: pack.code } },
            data: { configJson: { active: false, version: 1, uninstalledAt: new Date().toISOString() } },
        });
        await db.templatePreset.updateMany({
            where: { tenantId, packCode: pack.code },
            data: { isActive: false },
        });
        await this.audit.log(tenantId, 'trade-pack.uninstall', `Uninstalled trade pack ${pack.code}`, userId);
        return { ok: true, packCode: pack.code, wasInstalled: true };
    }
};
exports.TradePacksService = TradePacksService;
exports.TradePacksService = TradePacksService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], TradePacksService);
//# sourceMappingURL=trade-packs.service.js.map