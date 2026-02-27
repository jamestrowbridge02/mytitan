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
exports.CrmController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const feature_gate_1 = require("../common/feature-gate");
const feature_flags_1 = require("../common/feature-flags");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const dto_1 = require("./dto");
const trade_accounts_service_1 = require("./trade-accounts.service");
let CrmController = class CrmController {
    constructor(tradeAccountsService) {
        this.tradeAccountsService = tradeAccountsService;
    }
    search(user, query) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCrmProV1Enabled)(), feature: 'CRM_PRO_V1', mode: 'read' });
        return this.tradeAccountsService.crmSearch(user.companyId, query);
    }
    full(user, id) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCrmProV1Enabled)(), feature: 'CRM_PRO_V1', mode: 'read' });
        return this.tradeAccountsService.crmFull(user.companyId, id);
    }
    addNote(user, id, dto) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCrmProV1Enabled)(), feature: 'CRM_PRO_V1', mode: 'mutation' });
        return this.tradeAccountsService.addCrmNote(user.companyId, user.sub, id, dto);
    }
    addTask(user, id, dto) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCrmProV1Enabled)(), feature: 'CRM_PRO_V1', mode: 'mutation' });
        return this.tradeAccountsService.addCrmTask(user.companyId, user.sub, id, dto);
    }
    patch(user, id, dto) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCrmProV1Enabled)(), feature: 'CRM_PRO_V1', mode: 'mutation' });
        return this.tradeAccountsService.patchCrmAccount(user.companyId, user.sub, id, dto);
    }
};
exports.CrmController = CrmController;
__decorate([
    (0, common_1.Get)('search'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.CrmSearchQueryDto]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "search", null);
__decorate([
    (0, common_1.Get)(':id/full'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "full", null);
__decorate([
    (0, common_1.Post)(':id/note'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, dto_1.AddCrmNoteDto]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "addNote", null);
__decorate([
    (0, common_1.Post)(':id/task'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, dto_1.AddCrmTaskDto]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "addTask", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, dto_1.PatchCrmAccountDto]),
    __metadata("design:returntype", void 0)
], CrmController.prototype, "patch", null);
exports.CrmController = CrmController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('crm/accounts'),
    __metadata("design:paramtypes", [trade_accounts_service_1.TradeAccountsService])
], CrmController);
//# sourceMappingURL=crm.controller.js.map