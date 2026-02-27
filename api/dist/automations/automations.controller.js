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
exports.AutomationsController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const feature_flags_1 = require("../common/feature-flags");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const automations_dto_1 = require("./automations.dto");
const automations_service_1 = require("./automations.service");
let AutomationsController = class AutomationsController {
    constructor(automations) {
        this.automations = automations;
    }
    getSettings(user) {
        (0, feature_flags_1.requireAutomationsV1Enabled)();
        return this.automations.getSettings(user.companyId);
    }
    updateSettings(user, dto) {
        (0, feature_flags_1.requireAutomationsV1Enabled)();
        return this.automations.updateSettings(user, dto);
    }
    preview(user, windowDays) {
        (0, feature_flags_1.requireAutomationsV1Enabled)();
        const raw = Number(windowDays || 7);
        if (Number.isNaN(raw)) {
            throw new common_1.BadRequestException("windowDays must be a number");
        }
        const clamped = Math.max(1, Math.min(30, Math.floor(raw)));
        return this.automations.preview(user.companyId, clamped);
    }
};
exports.AutomationsController = AutomationsController;
__decorate([
    (0, common_1.Get)("settings"),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF", "READ_ONLY"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AutomationsController.prototype, "getSettings", null);
__decorate([
    (0, common_1.Patch)("settings"),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, automations_dto_1.UpdateAutomationsSettingsDto]),
    __metadata("design:returntype", void 0)
], AutomationsController.prototype, "updateSettings", null);
__decorate([
    (0, common_1.Get)("preview"),
    (0, roles_decorator_1.Roles)("OWNER", "ADMIN", "STAFF", "READ_ONLY"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)("windowDays")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AutomationsController.prototype, "preview", null);
exports.AutomationsController = AutomationsController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)("automations"),
    __metadata("design:paramtypes", [automations_service_1.AutomationsService])
], AutomationsController);
//# sourceMappingURL=automations.controller.js.map