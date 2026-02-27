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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationsController = exports.SetupController = exports.OnboardingController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const feature_flags_1 = require("../common/feature-flags");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const prisma_service_1 = require("../prisma/prisma.service");
const tenant_service_1 = require("../tenant/tenant.service");
const onboarding_dto_1 = require("./onboarding.dto");
const onboarding_service_1 = require("./onboarding.service");
let OnboardingController = class OnboardingController {
    constructor(tenantService, onboardingService, prisma) {
        this.tenantService = tenantService;
        this.onboardingService = onboardingService;
        this.prisma = prisma;
    }
    async status(user) {
        const settings = await this.tenantService.getSettings(user.companyId);
        const checklist = await this.onboardingService.getChecklist(user.companyId);
        return {
            onboardingCompleted: Boolean(settings.onboardingCompleted),
            onboardingStep: Number(settings.onboardingStep ?? 0),
            checklist,
        };
    }
    async trade(user) {
        (0, feature_flags_1.requireStartHereEnabled)();
        return this.onboardingService.getTradeSelection(user.companyId);
    }
    async selectTrade(user, dto) {
        (0, feature_flags_1.requireStartHereEnabled)();
        return this.onboardingService.selectTrade(user.companyId, user.sub, dto.trade);
    }
    async step(user, dto) {
        const step = Number(dto.step);
        const data = dto.data || {};
        const startHereEnabled = (0, feature_flags_1.isStartHereEnabled)();
        if (startHereEnabled && step === 0 && data.trade) {
            await this.onboardingService.selectTrade(user.companyId, user.sub, String(data.trade).toUpperCase());
            return { ok: true, onboardingStep: 1 };
        }
        if (startHereEnabled ? step === 1 : step === 0) {
            await this.tenantService.updateSettings(user.companyId, user.sub, user.role, {
                companyName: data.companyName,
                logoUrl: data.logoUrl,
                brandPrimaryColor: data.brandPrimaryColor,
                brandSecondaryColor: data.brandSecondaryColor,
                brandAccentColor: data.brandAccentColor,
            });
        }
        if (startHereEnabled ? step === 2 : step === 1) {
            await this.tenantService.updateSettings(user.companyId, user.sub, user.role, {
                emailSenderName: data.emailSenderName,
                emailReplyTo: data.emailReplyTo,
            });
        }
        if (!startHereEnabled && step === 2) {
            const packCode = String(data.packCode || '').trim().toUpperCase();
            if (packCode && (0, feature_flags_1.isTradePacksEnabled)()) {
                if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
                    throw new common_1.ForbiddenException('Only OWNER or ADMIN can install trade packs.');
                }
                await this.onboardingService.selectTrade(user.companyId, user.sub, (packCode === 'MOBILE_TECH' ? 'MOBILE' : packCode));
            }
        }
        if (step === 3) {
            const name = String(data.serviceName || '').trim();
            if (name) {
                const unitPrice = Number(data.unitPrice || 0);
                const defaultQty = Number(data.defaultQty || 1);
                const db = this.prisma;
                await db.serviceCatalogItem.create({
                    data: {
                        tenantId: user.companyId,
                        name,
                        unitPrice,
                        defaultQty,
                        active: true,
                    },
                });
            }
        }
        if (step === 4) {
            const bookingPublicEnabled = Boolean(data.bookingPublicEnabled);
            await this.tenantService.updateSettings(user.companyId, user.sub, user.role, {
                bookingPublicEnabled,
            });
            if (Array.isArray(data.businessHours)) {
                const db = this.prisma;
                await db.bookingBusinessHour.deleteMany({ where: { tenantId: user.companyId } });
                await db.bookingBusinessHour.createMany({
                    data: data.businessHours.map((entry) => ({
                        tenantId: user.companyId,
                        dayOfWeek: Number(entry.dayOfWeek),
                        startMinute: Number(entry.startMinute),
                        endMinute: Number(entry.endMinute),
                    })),
                });
            }
        }
        if (step === 5) {
        }
        if (step === 6 && Array.isArray(data.integrations)) {
            if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
                throw new common_1.ForbiddenException('Only OWNER or ADMIN can enable integrations.');
            }
            for (const entry of data.integrations) {
                if (!entry || typeof entry.key !== 'string')
                    continue;
                await this.onboardingService.toggleIntegration(user.companyId, user.sub, user.role, entry.key, Boolean(entry.enabled));
            }
        }
        const progress = await this.onboardingService.advanceOnboardingStep(user.companyId, user.sub, user.role, step);
        return { ok: true, ...progress };
    }
    async complete(user, _body) {
        return this.onboardingService.completeOnboarding(user.companyId, user.sub);
    }
};
exports.OnboardingController = OnboardingController;
__decorate([
    (0, common_1.Get)('status'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OnboardingController.prototype, "status", null);
__decorate([
    (0, common_1.Get)('trade'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OnboardingController.prototype, "trade", null);
__decorate([
    (0, common_1.Post)('select-trade'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, onboarding_dto_1.SelectTradeDto]),
    __metadata("design:returntype", Promise)
], OnboardingController.prototype, "selectTrade", null);
__decorate([
    (0, common_1.Post)('step'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, onboarding_dto_1.OnboardingStepDto]),
    __metadata("design:returntype", Promise)
], OnboardingController.prototype, "step", null);
__decorate([
    (0, common_1.Post)('complete'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], OnboardingController.prototype, "complete", null);
exports.OnboardingController = OnboardingController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('onboarding'),
    __metadata("design:paramtypes", [tenant_service_1.TenantService,
        onboarding_service_1.OnboardingService,
        prisma_service_1.PrismaService])
], OnboardingController);
let SetupController = class SetupController {
    constructor(onboardingService) {
        this.onboardingService = onboardingService;
    }
    checklist(user) {
        if (!(0, feature_flags_1.isMarketplaceEnabled)()) {
            return { items: [], completedCount: 0, total: 0 };
        }
        return this.onboardingService.getChecklist(user.companyId);
    }
};
exports.SetupController = SetupController;
__decorate([
    (0, common_1.Get)('checklist'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SetupController.prototype, "checklist", null);
exports.SetupController = SetupController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('setup'),
    __metadata("design:paramtypes", [onboarding_service_1.OnboardingService])
], SetupController);
let IntegrationsController = class IntegrationsController {
    constructor(onboardingService) {
        this.onboardingService = onboardingService;
    }
    list(user) {
        if (!(0, feature_flags_1.isMarketplaceEnabled)()) {
            return [];
        }
        return this.onboardingService.getIntegrations(user.companyId);
    }
    toggle(user, dto) {
        (0, feature_flags_1.requireMarketplaceEnabled)();
        return this.onboardingService.toggleIntegration(user.companyId, user.sub, user.role, dto.key, Boolean(dto.enabled));
    }
};
exports.IntegrationsController = IntegrationsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], IntegrationsController.prototype, "list", null);
__decorate([
    (0, common_1.Patch)(),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, onboarding_dto_1.IntegrationToggleDto]),
    __metadata("design:returntype", void 0)
], IntegrationsController.prototype, "toggle", null);
exports.IntegrationsController = IntegrationsController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('integrations'),
    __metadata("design:paramtypes", [onboarding_service_1.OnboardingService])
], IntegrationsController);
//# sourceMappingURL=onboarding.controller.js.map