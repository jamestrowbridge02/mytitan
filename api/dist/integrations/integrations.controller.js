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
exports.IntegrationsCallbackController = exports.IntegrationsController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const feature_flags_1 = require("../common/feature-flags");
const prisma_service_1 = require("../prisma/prisma.service");
const integrations_service_1 = require("./integrations.service");
let IntegrationsController = class IntegrationsController {
    constructor(integrations, prisma) {
        this.integrations = integrations;
        this.prisma = prisma;
    }
    async assertEmailVerified(user) {
        if (!(0, feature_flags_1.isAuthSecurityV1Enabled)())
            return;
        if (user.demoUser || user.email === '@mytitan.co.uk')
            return;
        const db = this.prisma;
        const fullUser = await db.user.findFirst({ where: { id: user.sub, companyId: user.companyId } });
        if (!fullUser?.emailVerified) {
            throw new common_1.ForbiddenException('Please verify your email before connecting integrations.');
        }
    }
    statusXero(user) {
        if (!(0, feature_flags_1.isMarketplaceEnabled)()) {
            return { provider: 'XERO', connected: false, allowed: false, enabled: false };
        }
        return this.integrations.getStatus(user.companyId, 'XERO');
    }
    async connectXero(user) {
        (0, feature_flags_1.requireMarketplaceEnabled)();
        await this.assertEmailVerified(user);
        return this.integrations.createAuthUrl(user.companyId, 'XERO');
    }
    disconnectXero(user) {
        (0, feature_flags_1.requireMarketplaceEnabled)();
        return this.integrations.disconnect(user.companyId, 'XERO');
    }
    syncXero() {
        throw new common_1.HttpException('Xero sync not implemented yet.', common_1.HttpStatus.NOT_IMPLEMENTED);
    }
    statusQbo(user) {
        if (!(0, feature_flags_1.isMarketplaceEnabled)()) {
            return { provider: 'QBO', connected: false, allowed: false, enabled: false };
        }
        return this.integrations.getStatus(user.companyId, 'QBO');
    }
    async connectQbo(user) {
        (0, feature_flags_1.requireMarketplaceEnabled)();
        await this.assertEmailVerified(user);
        return this.integrations.createAuthUrl(user.companyId, 'QBO');
    }
    disconnectQbo(user) {
        (0, feature_flags_1.requireMarketplaceEnabled)();
        return this.integrations.disconnect(user.companyId, 'QBO');
    }
    syncQbo() {
        throw new common_1.HttpException('QuickBooks sync not implemented yet.', common_1.HttpStatus.NOT_IMPLEMENTED);
    }
    statusGoogle(user) {
        if (!(0, feature_flags_1.isMarketplaceEnabled)()) {
            return { provider: 'GOOGLE_CALENDAR', connected: false, allowed: false, enabled: false };
        }
        return this.integrations.getStatus(user.companyId, 'GOOGLE_CALENDAR');
    }
    async connectGoogle(user) {
        (0, feature_flags_1.requireMarketplaceEnabled)();
        await this.assertEmailVerified(user);
        return this.integrations.createAuthUrl(user.companyId, 'GOOGLE_CALENDAR');
    }
    disconnectGoogle(user) {
        (0, feature_flags_1.requireMarketplaceEnabled)();
        return this.integrations.disconnect(user.companyId, 'GOOGLE_CALENDAR');
    }
    syncGoogle() {
        throw new common_1.HttpException('Google Calendar sync not implemented yet.', common_1.HttpStatus.NOT_IMPLEMENTED);
    }
};
exports.IntegrationsController = IntegrationsController;
__decorate([
    (0, common_1.Get)('xero/status'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], IntegrationsController.prototype, "statusXero", null);
__decorate([
    (0, common_1.Post)('xero/connect'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IntegrationsController.prototype, "connectXero", null);
__decorate([
    (0, common_1.Post)('xero/disconnect'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], IntegrationsController.prototype, "disconnectXero", null);
__decorate([
    (0, common_1.Post)('xero/sync'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], IntegrationsController.prototype, "syncXero", null);
__decorate([
    (0, common_1.Get)('qbo/status'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], IntegrationsController.prototype, "statusQbo", null);
__decorate([
    (0, common_1.Post)('qbo/connect'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IntegrationsController.prototype, "connectQbo", null);
__decorate([
    (0, common_1.Post)('qbo/disconnect'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], IntegrationsController.prototype, "disconnectQbo", null);
__decorate([
    (0, common_1.Post)('qbo/sync'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], IntegrationsController.prototype, "syncQbo", null);
__decorate([
    (0, common_1.Get)('google/status'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], IntegrationsController.prototype, "statusGoogle", null);
__decorate([
    (0, common_1.Post)('google/connect'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IntegrationsController.prototype, "connectGoogle", null);
__decorate([
    (0, common_1.Post)('google/disconnect'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], IntegrationsController.prototype, "disconnectGoogle", null);
__decorate([
    (0, common_1.Post)('google/sync'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], IntegrationsController.prototype, "syncGoogle", null);
exports.IntegrationsController = IntegrationsController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('integrations'),
    __metadata("design:paramtypes", [integrations_service_1.IntegrationsService, prisma_service_1.PrismaService])
], IntegrationsController);
let IntegrationsCallbackController = class IntegrationsCallbackController {
    constructor(integrations) {
        this.integrations = integrations;
    }
    async xeroCallback(code, state, res) {
        (0, feature_flags_1.requireMarketplaceEnabled)();
        await this.integrations.handleCallback('XERO', code, state);
        const appUrl = process.env.APP_PUBLIC_URL || 'https://app.mytitan.co.uk';
        res.redirect(`${appUrl}/dashboard/integrations?connected=xero`);
    }
    async qboCallback(code, state, realmId, res) {
        (0, feature_flags_1.requireMarketplaceEnabled)();
        await this.integrations.handleCallback('QBO', code, state, realmId);
        const appUrl = process.env.APP_PUBLIC_URL || 'https://app.mytitan.co.uk';
        res.redirect(`${appUrl}/dashboard/integrations?connected=qbo`);
    }
    async googleCallback(code, state, res) {
        (0, feature_flags_1.requireMarketplaceEnabled)();
        await this.integrations.handleCallback('GOOGLE_CALENDAR', code, state);
        const appUrl = process.env.APP_PUBLIC_URL || 'https://app.mytitan.co.uk';
        res.redirect(`${appUrl}/dashboard/integrations?connected=google`);
    }
};
exports.IntegrationsCallbackController = IntegrationsCallbackController;
__decorate([
    (0, common_1.Get)('xero/callback'),
    __param(0, (0, common_1.Query)('code')),
    __param(1, (0, common_1.Query)('state')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], IntegrationsCallbackController.prototype, "xeroCallback", null);
__decorate([
    (0, common_1.Get)('qbo/callback'),
    __param(0, (0, common_1.Query)('code')),
    __param(1, (0, common_1.Query)('state')),
    __param(2, (0, common_1.Query)('realmId')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], IntegrationsCallbackController.prototype, "qboCallback", null);
__decorate([
    (0, common_1.Get)('google/callback'),
    __param(0, (0, common_1.Query)('code')),
    __param(1, (0, common_1.Query)('state')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], IntegrationsCallbackController.prototype, "googleCallback", null);
exports.IntegrationsCallbackController = IntegrationsCallbackController = __decorate([
    (0, common_1.Controller)('integrations'),
    __metadata("design:paramtypes", [integrations_service_1.IntegrationsService])
], IntegrationsCallbackController);
//# sourceMappingURL=integrations.controller.js.map