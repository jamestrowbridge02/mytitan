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
exports.StripeWebhookController = exports.BillingController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const audit_service_1 = require("../audit/audit.service");
const feature_flags_1 = require("../common/feature-flags");
const permissions_1 = require("../common/permissions");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const prisma_service_1 = require("../prisma/prisma.service");
const billing_dto_1 = require("./billing.dto");
const billing_service_1 = require("./billing.service");
let BillingController = class BillingController {
    constructor(billing, prisma, audit) {
        this.billing = billing;
        this.prisma = prisma;
        this.audit = audit;
    }
    async assertEmailVerified(user) {
        if (!(0, feature_flags_1.isAuthSecurityV1Enabled)())
            return;
        if (user.demoUser || user.email === '@mytitan.co.uk')
            return;
        const db = this.prisma;
        const fullUser = await db.user.findFirst({ where: { id: user.sub, companyId: user.companyId } });
        if (!fullUser?.emailVerified) {
            throw new common_1.ForbiddenException('Please verify your email before accessing billing actions.');
        }
    }
    async createCheckout(user, dto, req) {
        const requestId = String(req.requestId || req.headers['x-request-id'] || '').trim() || undefined;
        await (0, permissions_1.assertPermission)({
            user,
            permission: 'BILLING_MANAGE',
            audit: this.audit,
            requestId,
            action: 'billing.checkout',
        });
        await this.assertEmailVerified(user);
        return this.billing.createCheckoutSession(user.companyId, user.sub, dto.planCode, dto.interval);
    }
    async createPortal(user, req) {
        const requestId = String(req.requestId || req.headers['x-request-id'] || '').trim() || undefined;
        await (0, permissions_1.assertPermission)({
            user,
            permission: 'BILLING_MANAGE',
            audit: this.audit,
            requestId,
            action: 'billing.portal',
        });
        await this.assertEmailVerified(user);
        return this.billing.createBillingPortal(user.companyId, user.sub);
    }
    me(user) {
        return this.billing.getBillingInfo(user.companyId);
    }
};
exports.BillingController = BillingController;
__decorate([
    (0, common_1.Post)('checkout-session'),
    (0, roles_decorator_1.Roles)('OWNER'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, billing_dto_1.CheckoutSessionDto, Object]),
    __metadata("design:returntype", Promise)
], BillingController.prototype, "createCheckout", null);
__decorate([
    (0, common_1.Get)('portal'),
    (0, roles_decorator_1.Roles)('OWNER'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BillingController.prototype, "createPortal", null);
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BillingController.prototype, "me", null);
exports.BillingController = BillingController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('billing'),
    __metadata("design:paramtypes", [billing_service_1.BillingService,
        prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], BillingController);
let StripeWebhookController = class StripeWebhookController {
    constructor(billing) {
        this.billing = billing;
    }
    async webhook(req) {
        return this.billing.handleStripeWebhook(req);
    }
};
exports.StripeWebhookController = StripeWebhookController;
__decorate([
    (0, common_1.Post)(['stripe/webhook', 'billing/webhook']),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], StripeWebhookController.prototype, "webhook", null);
exports.StripeWebhookController = StripeWebhookController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [billing_service_1.BillingService])
], StripeWebhookController);
//# sourceMappingURL=billing.controller.js.map