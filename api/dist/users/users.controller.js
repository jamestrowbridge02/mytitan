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
exports.UsersPublicController = exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const audit_service_1 = require("../audit/audit.service");
const feature_flags_1 = require("../common/feature-flags");
const permissions_1 = require("../common/permissions");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const prisma_service_1 = require("../prisma/prisma.service");
const users_dto_1 = require("./users.dto");
const users_service_1 = require("./users.service");
let UsersController = class UsersController {
    constructor(users, prisma, audit) {
        this.users = users;
        this.prisma = prisma;
        this.audit = audit;
    }
    async assertCanInvite(user) {
        if (!(0, feature_flags_1.isAuthSecurityV1Enabled)())
            return;
        if (user.demoUser || user.email === '@mytitan.co.uk')
            return;
        const db = this.prisma;
        const fullUser = await db.user.findFirst({ where: { id: user.sub, companyId: user.companyId } });
        if (!fullUser?.emailVerified) {
            throw new common_1.ForbiddenException('Please verify your email before inviting users.');
        }
    }
    list(user) {
        return this.users.list(user.companyId, user.role);
    }
    async invite(user, dto, req) {
        const requestId = String(req.requestId || req.headers?.['x-request-id'] || '').trim() || undefined;
        await (0, permissions_1.assertPermission)({
            user,
            permission: 'USER_INVITE',
            audit: this.audit,
            requestId,
            action: 'users.invite',
        });
        await this.assertCanInvite(user);
        return this.users.invite(user.companyId, user.sub, dto);
    }
    async updateRole(user, id, dto, req) {
        const requestId = String(req.requestId || req.headers?.['x-request-id'] || '').trim() || undefined;
        await (0, permissions_1.assertPermission)({
            user,
            permission: 'USER_ROLE_ASSIGN',
            audit: this.audit,
            requestId,
            action: 'users.updateRole',
        });
        return this.users.updateRole(user.companyId, user.sub, id, dto);
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('invite'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, users_dto_1.InviteUserDto, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "invite", null);
__decorate([
    (0, common_1.Patch)(':id/role'),
    (0, roles_decorator_1.Roles)('OWNER'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, users_dto_1.UpdateUserRoleDto, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "updateRole", null);
exports.UsersController = UsersController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('users'),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], UsersController);
let UsersPublicController = class UsersPublicController {
    constructor(users) {
        this.users = users;
    }
    acceptInvite(dto) {
        return this.users.acceptInvite(dto);
    }
};
exports.UsersPublicController = UsersPublicController;
__decorate([
    (0, common_1.Post)('accept-invite'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [users_dto_1.AcceptInviteDto]),
    __metadata("design:returntype", void 0)
], UsersPublicController.prototype, "acceptInvite", null);
exports.UsersPublicController = UsersPublicController = __decorate([
    (0, common_1.Controller)('users'),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], UsersPublicController);
//# sourceMappingURL=users.controller.js.map