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
exports.TradeAccountsController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const dto_1 = require("./dto");
const trade_accounts_service_1 = require("./trade-accounts.service");
let TradeAccountsController = class TradeAccountsController {
    constructor(tradeAccountsService) {
        this.tradeAccountsService = tradeAccountsService;
    }
    upsert(user, dto) {
        return this.tradeAccountsService.upsert(user.companyId, user.sub, dto);
    }
    list(user, query) {
        return this.tradeAccountsService.list(user.companyId, query);
    }
    get(user, id) {
        return this.tradeAccountsService.get(user.companyId, id);
    }
    timeline(user, id, page, pageSize) {
        return this.tradeAccountsService.timeline(user.companyId, id, Number(page || 1), Number(pageSize || 25));
    }
    addNote(user, id, dto) {
        return this.tradeAccountsService.addNote(user.companyId, user.sub, id, dto);
    }
    updateNextAction(user, id, dto) {
        return this.tradeAccountsService.updateNextAction(user.companyId, user.sub, id, dto);
    }
};
exports.TradeAccountsController = TradeAccountsController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.UpsertTradeAccountDto]),
    __metadata("design:returntype", void 0)
], TradeAccountsController.prototype, "upsert", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.TradeAccountsQueryDto]),
    __metadata("design:returntype", void 0)
], TradeAccountsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TradeAccountsController.prototype, "get", null);
__decorate([
    (0, common_1.Get)(':id/timeline'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], TradeAccountsController.prototype, "timeline", null);
__decorate([
    (0, common_1.Post)(':id/notes'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, dto_1.AddTradeAccountNoteDto]),
    __metadata("design:returntype", void 0)
], TradeAccountsController.prototype, "addNote", null);
__decorate([
    (0, common_1.Patch)(':id/next-action'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, dto_1.UpdateNextActionDto]),
    __metadata("design:returntype", void 0)
], TradeAccountsController.prototype, "updateNextAction", null);
exports.TradeAccountsController = TradeAccountsController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('trade-accounts'),
    __metadata("design:paramtypes", [trade_accounts_service_1.TradeAccountsService])
], TradeAccountsController);
//# sourceMappingURL=trade-accounts.controller.js.map