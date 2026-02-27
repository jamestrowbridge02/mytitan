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
exports.FeatureGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const prisma_service_1 = require("../prisma/prisma.service");
const tenant_service_1 = require("../tenant/tenant.service");
const billing_constants_1 = require("../billing/billing.constants");
const feature_decorator_1 = require("./feature.decorator");
let FeatureGuard = class FeatureGuard {
    constructor(reflector, prisma, tenantService) {
        this.reflector = reflector;
        this.prisma = prisma;
        this.tenantService = tenantService;
    }
    async canActivate(context) {
        const feature = this.reflector.get(feature_decorator_1.FEATURE_KEY, context.getHandler());
        if (!feature)
            return true;
        const req = context.switchToHttp().getRequest();
        const tenantId = req?.user?.companyId;
        if (!tenantId) {
            throw new common_1.ForbiddenException('Tenant not found');
        }
        const settings = await this.tenantService.ensureTenantSettings(tenantId);
        const flagMap = {
            bookings_enabled: settings.bookingsEnabled,
            accounting_enabled: settings.accountingEnabled,
            payments_enabled: settings.paymentsEnabled,
            social_enabled: settings.socialEnabled,
            ai_enabled: settings.aiEnabled,
        };
        const featureFlag = flagMap[feature];
        if (featureFlag === false) {
            throw new common_1.ForbiddenException(`Feature '${feature}' is disabled for this tenant`);
        }
        const db = this.prisma;
        const subscription = await db.tenantSubscription.findUnique({
            where: { tenantId },
            include: { plan: true },
        });
        if (subscription && subscription.status && !['active', 'trialing'].includes(subscription.status)) {
            throw new common_1.HttpException('Subscription is inactive. Please renew or upgrade to access this feature.', common_1.HttpStatus.PAYMENT_REQUIRED);
        }
        let planFeatures = subscription?.plan?.featuresJson;
        if (!planFeatures && settings.planId) {
            const plan = await db.plan.findUnique({ where: { id: settings.planId } });
            planFeatures = plan?.featuresJson;
        }
        const effectiveFeatures = (planFeatures ?? billing_constants_1.PLAN_DEFINITIONS[billing_constants_1.DEFAULT_PLAN_CODE].features);
        const planAllows = effectiveFeatures?.[feature] !== undefined ? Boolean(effectiveFeatures[feature]) : false;
        if (!planAllows) {
            throw new common_1.HttpException(`Upgrade required to enable '${feature}'.`, common_1.HttpStatus.PAYMENT_REQUIRED);
        }
        return true;
    }
};
exports.FeatureGuard = FeatureGuard;
exports.FeatureGuard = FeatureGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        prisma_service_1.PrismaService,
        tenant_service_1.TenantService])
], FeatureGuard);
//# sourceMappingURL=feature.guard.js.map