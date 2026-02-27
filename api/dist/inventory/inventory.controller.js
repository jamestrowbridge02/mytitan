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
exports.InventoryController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const feature_gate_1 = require("../common/feature-gate");
const feature_flags_1 = require("../common/feature-flags");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const dto_1 = require("./dto");
const inventory_service_1 = require("./inventory.service");
let InventoryController = class InventoryController {
    constructor(inventoryService) {
        this.inventoryService = inventoryService;
    }
    items(user, locationId, q) {
        const fallback = (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isInventoryV1Enabled)(), feature: 'INVENTORY_V1', mode: 'read', fallback: [] });
        if (fallback)
            return fallback;
        return this.inventoryService.listItems(user.companyId, { locationId, q });
    }
    createItem(user, dto) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isInventoryV1Enabled)(), feature: 'INVENTORY_V1', mode: 'mutation' });
        return this.inventoryService.createItem(user.companyId, user.sub, dto);
    }
    patchItem(user, id, dto) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isInventoryV1Enabled)(), feature: 'INVENTORY_V1', mode: 'mutation' });
        return this.inventoryService.patchItem(user.companyId, user.sub, id, dto);
    }
    levels(user, locationId) {
        const fallback = (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isInventoryV1Enabled)(), feature: 'INVENTORY_V1', mode: 'read', fallback: [] });
        if (fallback)
            return fallback;
        return this.inventoryService.levels(user.companyId, locationId);
    }
    movements(user, dto) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isInventoryV1Enabled)(), feature: 'INVENTORY_V1', mode: 'mutation' });
        return this.inventoryService.addMovement(user.companyId, user.sub, dto);
    }
    listMovements(user) {
        const fallback = (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isInventoryV1Enabled)(), feature: 'INVENTORY_V1', mode: 'read', fallback: [] });
        if (fallback)
            return fallback;
        return this.inventoryService.listMovements(user.companyId);
    }
    purchaseOrders(user) {
        const fallback = (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isInventoryV1Enabled)(), feature: 'INVENTORY_V1', mode: 'read', fallback: [] });
        if (fallback)
            return fallback;
        return this.inventoryService.listPurchaseOrders(user.companyId);
    }
    createPo(user, dto) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isInventoryV1Enabled)(), feature: 'INVENTORY_V1', mode: 'mutation' });
        return this.inventoryService.createPurchaseOrder(user.companyId, user.sub, dto);
    }
    patchPo(user, id, dto) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isInventoryV1Enabled)(), feature: 'INVENTORY_V1', mode: 'mutation' });
        return this.inventoryService.patchPurchaseOrder(user.companyId, user.sub, id, dto);
    }
    receivePo(user, id) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isInventoryV1Enabled)(), feature: 'INVENTORY_V1', mode: 'mutation' });
        return this.inventoryService.receivePurchaseOrder(user.companyId, user.sub, id);
    }
    allocate(user, id, dto) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isInventoryV1Enabled)(), feature: 'INVENTORY_V1', mode: 'mutation' });
        return this.inventoryService.allocateToJob(user.companyId, user.sub, id, dto);
    }
    alerts(user) {
        const fallback = (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isInventoryV1Enabled)(), feature: 'INVENTORY_V1', mode: 'read', fallback: [] });
        if (fallback)
            return fallback;
        return this.inventoryService.lowStockAlerts(user.companyId);
    }
    valuation(user) {
        const fallback = (0, feature_gate_1.featureGate)({
            enabled: (0, feature_flags_1.isInventoryV1Enabled)(),
            feature: 'INVENTORY_V1',
            mode: 'read',
            fallback: { totalValue: 0, items: [] },
        });
        if (fallback)
            return fallback;
        return this.inventoryService.valuation(user.companyId);
    }
    reorderDraft(user, id, body) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isInventoryV1Enabled)(), feature: 'INVENTORY_V1', mode: 'mutation' });
        return this.inventoryService.createReorderDraft(user.companyId, user.sub, id, body?.qtyOrdered, body?.locationId);
    }
};
exports.InventoryController = InventoryController;
__decorate([
    (0, common_1.Get)('items'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('locationId')),
    __param(2, (0, common_1.Query)('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "items", null);
__decorate([
    (0, common_1.Post)('items'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.UpsertStockItemDto]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "createItem", null);
__decorate([
    (0, common_1.Patch)('items/:id'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "patchItem", null);
__decorate([
    (0, common_1.Get)('levels'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('locationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "levels", null);
__decorate([
    (0, common_1.Post)('movements'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.CreateStockMovementDto]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "movements", null);
__decorate([
    (0, common_1.Get)('movements'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "listMovements", null);
__decorate([
    (0, common_1.Get)('purchase-orders'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "purchaseOrders", null);
__decorate([
    (0, common_1.Post)('purchase-orders'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.UpsertPurchaseOrderDto]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "createPo", null);
__decorate([
    (0, common_1.Patch)('purchase-orders/:id'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, dto_1.UpsertPurchaseOrderDto]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "patchPo", null);
__decorate([
    (0, common_1.Post)('purchase-orders/:id/receive'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "receivePo", null);
__decorate([
    (0, common_1.Post)('items/:id/allocate-to-job'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, dto_1.AllocateToJobDto]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "allocate", null);
__decorate([
    (0, common_1.Get)('alerts'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "alerts", null);
__decorate([
    (0, common_1.Get)('valuation'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "valuation", null);
__decorate([
    (0, common_1.Post)('items/:id/reorder-draft'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "reorderDraft", null);
exports.InventoryController = InventoryController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('inventory'),
    __metadata("design:paramtypes", [inventory_service_1.InventoryService])
], InventoryController);
//# sourceMappingURL=inventory.controller.js.map