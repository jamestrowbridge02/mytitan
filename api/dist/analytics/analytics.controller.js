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
exports.AnalyticsController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const feature_flags_1 = require("../common/feature-flags");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const analytics_service_1 = require("./analytics.service");
let AnalyticsController = class AnalyticsController {
    constructor(analytics) {
        this.analytics = analytics;
    }
    getOpsInsights(user, windowDays) {
        (0, feature_flags_1.requireAnalyticsV1Enabled)();
        const raw = Number(windowDays || 7);
        if (Number.isNaN(raw)) {
            throw new common_1.BadRequestException('windowDays must be a number');
        }
        const clamped = Math.max(1, Math.min(30, Math.floor(raw)));
        return this.analytics.getOpsInsights(user.companyId, clamped);
    }
    getUtilization(user, windowDays) {
        (0, feature_flags_1.requireAnalyticsV1Enabled)();
        const raw = Number(windowDays || 7);
        if (Number.isNaN(raw)) {
            throw new common_1.BadRequestException('windowDays must be a number');
        }
        const clamped = Math.max(1, Math.min(30, Math.floor(raw)));
        return this.analytics.getUtilization(user.companyId, clamped);
    }
    getCashflow(user, windowDays) {
        (0, feature_flags_1.requireAnalyticsV1Enabled)();
        const raw = Number(windowDays || 7);
        if (Number.isNaN(raw)) {
            throw new common_1.BadRequestException('windowDays must be a number');
        }
        const clamped = Math.max(1, Math.min(30, Math.floor(raw)));
        return this.analytics.getCashflow(user.companyId, clamped);
    }
    getFunnel(user, windowDays) {
        (0, feature_flags_1.requireAnalyticsV1Enabled)();
        const raw = Number(windowDays || 7);
        if (Number.isNaN(raw)) {
            throw new common_1.BadRequestException('windowDays must be a number');
        }
        const clamped = Math.max(1, Math.min(30, Math.floor(raw)));
        return this.analytics.getFunnel(user.companyId, clamped);
    }
};
exports.AnalyticsController = AnalyticsController;
__decorate([
    (0, common_1.Get)('ops-insights'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('windowDays')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getOpsInsights", null);
__decorate([
    (0, common_1.Get)('utilization'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('windowDays')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getUtilization", null);
__decorate([
    (0, common_1.Get)('cashflow'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('windowDays')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getCashflow", null);
__decorate([
    (0, common_1.Get)('funnel'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('windowDays')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getFunnel", null);
exports.AnalyticsController = AnalyticsController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('analytics'),
    __metadata("design:paramtypes", [analytics_service_1.AnalyticsService])
], AnalyticsController);
//# sourceMappingURL=analytics.controller.js.map