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
exports.BoardViewsController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const feature_gate_1 = require("../common/feature-gate");
const feature_flags_1 = require("../common/feature-flags");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const prisma_service_1 = require("../prisma/prisma.service");
let BoardViewsController = class BoardViewsController {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(user) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCommandCentreV2Enabled)(), feature: 'COMMAND_CENTRE_V2', mode: 'read' });
        const db = this.prisma;
        return db.savedBoardView.findMany({
            where: { companyId: user.companyId, userId: user.sub },
            orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        });
    }
    async create(user, body) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCommandCentreV2Enabled)(), feature: 'COMMAND_CENTRE_V2', mode: 'mutation' });
        const db = this.prisma;
        if (body?.isDefault) {
            await db.savedBoardView.updateMany({
                where: { companyId: user.companyId, userId: user.sub },
                data: { isDefault: false },
            });
        }
        return db.savedBoardView.create({
            data: {
                companyId: user.companyId,
                userId: user.sub,
                name: String(body?.name || 'Saved board').slice(0, 80),
                filtersJson: body?.filters || {},
                isDefault: Boolean(body?.isDefault),
                viewType: body?.viewType === 'list' ? 'list' : 'kanban',
            },
        });
    }
    async update(user, id, body) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCommandCentreV2Enabled)(), feature: 'COMMAND_CENTRE_V2', mode: 'mutation' });
        const db = this.prisma;
        const existing = await db.savedBoardView.findFirst({ where: { id, companyId: user.companyId, userId: user.sub } });
        if (!existing)
            return { ok: false, message: 'View not found' };
        if (body?.isDefault) {
            await db.savedBoardView.updateMany({
                where: { companyId: user.companyId, userId: user.sub },
                data: { isDefault: false },
            });
        }
        return db.savedBoardView.update({
            where: { id },
            data: {
                name: body?.name ? String(body.name).slice(0, 80) : undefined,
                filtersJson: body?.filters ?? undefined,
                isDefault: body?.isDefault ?? undefined,
                viewType: body?.viewType ? (body.viewType === 'list' ? 'list' : 'kanban') : undefined,
            },
        });
    }
    async remove(user, id) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCommandCentreV2Enabled)(), feature: 'COMMAND_CENTRE_V2', mode: 'mutation' });
        const db = this.prisma;
        const existing = await db.savedBoardView.findFirst({ where: { id, companyId: user.companyId, userId: user.sub } });
        if (!existing)
            return { ok: false, message: 'View not found' };
        await db.savedBoardView.delete({ where: { id } });
        return { ok: true };
    }
};
exports.BoardViewsController = BoardViewsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BoardViewsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BoardViewsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], BoardViewsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BoardViewsController.prototype, "remove", null);
exports.BoardViewsController = BoardViewsController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('board-views'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], BoardViewsController);
//# sourceMappingURL=board-views.controller.js.map