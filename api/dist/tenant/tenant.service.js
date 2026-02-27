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
exports.TenantService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const audit_service_1 = require("../audit/audit.service");
const billing_constants_1 = require("../billing/billing.constants");
const prisma_service_1 = require("../prisma/prisma.service");
let TenantService = class TenantService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    normalizeRecipients(recipients) {
        if (!recipients) {
            return undefined;
        }
        return recipients.map((value) => value.trim().toLowerCase()).filter(Boolean);
    }
    async ensureTenantSettings(tenantId) {
        const db = this.prisma;
        const company = await db.company.findUnique({ where: { id: tenantId } });
        if (!company) {
            throw new common_1.NotFoundException('Tenant not found');
        }
        const defaultPlan = await db.plan.findFirst({ where: { code: billing_constants_1.DEFAULT_PLAN_CODE } });
        return db.tenantSetting.upsert({
            where: { tenantId },
            update: {},
            create: {
                tenantId,
                planId: defaultPlan?.id ?? null,
                companyName: company.name,
                defaultCurrency: company.currency ?? 'USD',
                defaultTimezone: company.timezone ?? 'UTC',
            },
        });
    }
    getSettings(tenantId) {
        return this.ensureTenantSettings(tenantId);
    }
    async updateSettings(tenantId, userId, role, dto) {
        const db = this.prisma;
        const settings = await this.ensureTenantSettings(tenantId);
        let plan = null;
        if (settings.planId) {
            plan = await db.plan.findUnique({ where: { id: settings.planId } });
        }
        else {
            plan = await db.plan.findFirst({ where: { code: billing_constants_1.DEFAULT_PLAN_CODE } });
        }
        const planLimit = plan?.aiRequestsLimitMonthly ?? billing_constants_1.PLAN_DEFINITIONS[billing_constants_1.DEFAULT_PLAN_CODE].aiRequestsLimitMonthly;
        const isEnterprise = plan?.code === 'ENTERPRISE';
        if (dto.defaultCurrency) {
            dto.defaultCurrency = dto.defaultCurrency.toUpperCase().trim();
        }
        if (typeof dto.aiRequestsLimit === 'number') {
            if (!isEnterprise && dto.aiRequestsLimit > planLimit) {
                throw new common_1.BadRequestException('AI request limit cannot exceed your plan cap.');
            }
            if (isEnterprise && role !== 'OWNER') {
                throw new common_1.BadRequestException('Only OWNER can change Enterprise AI limits.');
            }
        }
        const payload = {
            ...dto,
            emailNotificationRecipients: this.normalizeRecipients(dto.emailNotificationRecipients),
            defaultItems: dto.defaultItems ?? undefined,
            defaultServiceNamePresets: dto.defaultServiceNamePresets ?? undefined,
        };
        if (dto.bookingPublicEnabled && !settings.bookingPublicToken) {
            payload.bookingPublicToken = crypto_1.default.randomBytes(24).toString('base64url');
        }
        if (dto.bookingPublicEnabled && !settings.bookingIcsToken) {
            payload.bookingIcsToken = crypto_1.default.randomBytes(24).toString('base64url');
        }
        const updated = await db.tenantSetting.upsert({
            where: { tenantId },
            update: payload,
            create: {
                tenantId,
                ...payload,
            },
        });
        await this.audit.log(tenantId, 'tenant.settings.update', 'Tenant settings updated', userId);
        return updated;
    }
    async saveUploadedLogo(tenantId, userId, fileName) {
        const db = this.prisma;
        if (!fileName) {
            throw new common_1.BadRequestException('File name is required');
        }
        const logoPath = `/tenant/public-logo/${tenantId}/${encodeURIComponent(fileName)}`;
        const apiBase = (process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
        const logoUrl = apiBase ? `${apiBase}${logoPath}` : logoPath;
        const updated = await db.tenantSetting.upsert({
            where: { tenantId },
            update: { logoUrl },
            create: { tenantId, logoUrl },
        });
        await this.audit.log(tenantId, 'tenant.logo.upload', `Uploaded tenant logo ${fileName}`, userId);
        return { logoUrl: updated.logoUrl };
    }
    async setLogoUrl(tenantId, userId, logoUrl) {
        const db = this.prisma;
        const updated = await db.tenantSetting.upsert({
            where: { tenantId },
            update: { logoUrl },
            create: { tenantId, logoUrl },
        });
        await this.audit.log(tenantId, 'tenant.logo.set', 'Tenant logo URL updated', userId);
        return { logoUrl: updated.logoUrl };
    }
};
exports.TenantService = TenantService;
exports.TenantService = TenantService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], TenantService);
//# sourceMappingURL=tenant.service.js.map