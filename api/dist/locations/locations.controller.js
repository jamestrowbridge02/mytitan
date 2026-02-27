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
exports.LocationsController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const feature_gate_1 = require("../common/feature-gate");
const feature_flags_1 = require("../common/feature-flags");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const dto_1 = require("./dto");
const locations_service_1 = require("./locations.service");
let LocationsController = class LocationsController {
    constructor(locationsService) {
        this.locationsService = locationsService;
    }
    list(user) {
        const fallback = (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isLocationsV1Enabled)(), feature: 'LOCATIONS_V1', mode: 'read', fallback: [] });
        if (fallback)
            return fallback;
        return this.locationsService.list(user.companyId);
    }
    create(user, dto) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isLocationsV1Enabled)(), feature: 'LOCATIONS_V1', mode: 'mutation' });
        return this.locationsService.create(user.companyId, user.sub, dto);
    }
    update(user, id, dto) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isLocationsV1Enabled)(), feature: 'LOCATIONS_V1', mode: 'mutation' });
        return this.locationsService.update(user.companyId, user.sub, id, dto);
    }
    archive(user, id) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isLocationsV1Enabled)(), feature: 'LOCATIONS_V1', mode: 'mutation' });
        return this.locationsService.archive(user.companyId, user.sub, id);
    }
    setStaffRestriction(user, body) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isLocationsAdvancedV1Enabled)(), feature: 'LOCATIONS_ADVANCED_V1', mode: 'mutation' });
        return this.locationsService.setOnlyMyLocation(user.companyId, user.sub, Boolean(body?.onlyMyLocation));
    }
};
exports.LocationsController = LocationsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], LocationsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.UpsertLocationDto]),
    __metadata("design:returntype", void 0)
], LocationsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, dto_1.UpsertLocationDto]),
    __metadata("design:returntype", void 0)
], LocationsController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/archive'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], LocationsController.prototype, "archive", null);
__decorate([
    (0, common_1.Post)('staff-restriction'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], LocationsController.prototype, "setStaffRestriction", null);
exports.LocationsController = LocationsController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('locations'),
    __metadata("design:paramtypes", [locations_service_1.LocationsService])
], LocationsController);
//# sourceMappingURL=locations.controller.js.map