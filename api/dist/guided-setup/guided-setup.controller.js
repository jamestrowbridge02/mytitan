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
exports.GuidedSetupController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const feature_flags_1 = require("../common/feature-flags");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const guided_setup_dto_1 = require("./guided-setup.dto");
const guided_setup_service_1 = require("./guided-setup.service");
const MAX_GUIDED_SETUP_STEP = 5;
let GuidedSetupController = class GuidedSetupController {
    constructor(guidedSetupService) {
        this.guidedSetupService = guidedSetupService;
    }
    assertEnabled() {
        if (!(0, feature_flags_1.isGuidedSetupV2Enabled)()) {
            throw new common_1.ServiceUnavailableException("Feature is not enabled.");
        }
    }
    async status(user) {
        this.assertEnabled();
        return this.guidedSetupService.getStatus(user.companyId);
    }
    async reset(user) {
        this.assertEnabled();
        return this.guidedSetupService.reset(user.companyId, user.sub);
    }
    async step(user, dto) {
        this.assertEnabled();
        const step = Number(dto.step);
        if (!Number.isFinite(step) || step < 0 || step > MAX_GUIDED_SETUP_STEP) {
            throw new common_1.BadRequestException("Invalid step");
        }
        return this.guidedSetupService.applyStep(user.companyId, user.sub, user.role, step, dto.data || {}, Boolean(dto.skipped));
    }
    async complete(user) {
        this.assertEnabled();
        return this.guidedSetupService.complete(user.companyId, user.sub);
    }
};
exports.GuidedSetupController = GuidedSetupController;
__decorate([
    (0, common_1.Get)("status"),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF", "READ_ONLY"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GuidedSetupController.prototype, "status", null);
__decorate([
    (0, common_1.Post)("reset"),
    (0, roles_decorator_1.Roles)("OWNER"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GuidedSetupController.prototype, "reset", null);
__decorate([
    (0, common_1.Post)("step"),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, guided_setup_dto_1.GuidedSetupStepDto]),
    __metadata("design:returntype", Promise)
], GuidedSetupController.prototype, "step", null);
__decorate([
    (0, common_1.Post)("complete"),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GuidedSetupController.prototype, "complete", null);
exports.GuidedSetupController = GuidedSetupController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)("guided-setup"),
    __metadata("design:paramtypes", [guided_setup_service_1.GuidedSetupService])
], GuidedSetupController);
//# sourceMappingURL=guided-setup.controller.js.map