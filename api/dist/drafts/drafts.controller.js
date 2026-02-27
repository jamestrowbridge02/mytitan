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
exports.DraftsController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const prisma_service_1 = require("../prisma/prisma.service");
let DraftsController = class DraftsController {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(user) {
        const db = this.prisma;
        const [jobs, crm] = await Promise.all([
            db.jobDraft.findMany({
                where: { companyId: user.companyId, userId: user.sub },
                orderBy: { updatedAt: 'desc' },
                take: 30,
            }),
            db.crmDraft.findMany({
                where: { companyId: user.companyId, userId: user.sub },
                orderBy: { updatedAt: 'desc' },
                take: 30,
            }),
        ]);
        const items = [
            ...jobs.map((item) => ({
                id: `job:${item.trade}`,
                draftKind: 'JOB',
                trade: item.trade,
                payload: item.payload,
                updatedAt: item.updatedAt,
            })),
            ...crm.map((item) => ({
                id: `crm:${item.id}`,
                draftKind: 'CRM_NOTE',
                tradeAccountId: item.tradeAccountId || null,
                payload: item.payload,
                updatedAt: item.updatedAt,
            })),
        ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        return { items };
    }
    async latest(user, kind = 'job') {
        const db = this.prisma;
        if (String(kind).toLowerCase() === 'job') {
            const item = await db.jobDraft.findFirst({
                where: { companyId: user.companyId, userId: user.sub },
                orderBy: { updatedAt: 'desc' },
            });
            return item
                ? { id: `job:${item.trade}`, draftKind: 'JOB', trade: item.trade, payload: item.payload, updatedAt: item.updatedAt }
                : null;
        }
        const item = await db.crmDraft.findFirst({
            where: { companyId: user.companyId, userId: user.sub },
            orderBy: { updatedAt: 'desc' },
        });
        return item
            ? {
                id: `crm:${item.id}`,
                draftKind: 'CRM_NOTE',
                tradeAccountId: item.tradeAccountId || null,
                payload: item.payload,
                updatedAt: item.updatedAt,
            }
            : null;
    }
    async getJobDraft(user, trade) {
        const db = this.prisma;
        const item = await db.jobDraft.findUnique({
            where: { companyId_userId_trade: { companyId: user.companyId, userId: user.sub, trade: String(trade || 'WHEELS').toUpperCase() } },
        });
        return item || null;
    }
    async upsertJobDraft(user, body) {
        const trade = String(body?.trade || 'WHEELS').toUpperCase();
        const payload = body?.payload || {};
        const db = this.prisma;
        return db.jobDraft.upsert({
            where: { companyId_userId_trade: { companyId: user.companyId, userId: user.sub, trade } },
            create: { companyId: user.companyId, userId: user.sub, trade, payload },
            update: { payload, updatedAt: new Date() },
        });
    }
    async upsertCrmDraft(user, body) {
        const db = this.prisma;
        const tradeAccountId = body?.tradeAccountId || null;
        const existing = await db.crmDraft.findFirst({
            where: { companyId: user.companyId, userId: user.sub, tradeAccountId },
        });
        if (!existing) {
            return db.crmDraft.create({
                data: {
                    companyId: user.companyId,
                    userId: user.sub,
                    tradeAccountId,
                    payload: body?.payload || {},
                },
            });
        }
        return db.crmDraft.update({
            where: { id: existing.id },
            data: { payload: body?.payload || {}, updatedAt: new Date() },
        });
    }
    async getJobDrafts(user) {
        const db = this.prisma;
        return db.jobDraft.findMany({
            where: { companyId: user.companyId, userId: user.sub },
            orderBy: { updatedAt: 'desc' },
            take: 20,
        });
    }
    async saveJobDraftCompat(user, body) {
        return this.upsertJobDraft(user, body);
    }
    async saveJobDraft(user, body) {
        return this.upsertJobDraft(user, body);
    }
    async deleteJobDraft(user, trade) {
        const db = this.prisma;
        await db.jobDraft.deleteMany({ where: { companyId: user.companyId, userId: user.sub, trade: String(trade || '').toUpperCase() } });
        return { ok: true };
    }
    async getCrmDrafts(user) {
        const db = this.prisma;
        return db.crmDraft.findMany({
            where: { companyId: user.companyId, userId: user.sub },
            orderBy: { updatedAt: 'desc' },
            take: 20,
        });
    }
    async saveCrmDraftCompat(user, body) {
        return this.upsertCrmDraft(user, body);
    }
    async saveCrmDraft(user, body) {
        return this.upsertCrmDraft(user, body);
    }
    async deleteDraftById(user, id) {
        const db = this.prisma;
        const [kind, value] = String(id || '').split(':');
        if (kind === 'job' && value) {
            await db.jobDraft.deleteMany({ where: { companyId: user.companyId, userId: user.sub, trade: value.toUpperCase() } });
            return { ok: true };
        }
        if (kind === 'crm' && value) {
            await db.crmDraft.deleteMany({ where: { companyId: user.companyId, userId: user.sub, id: value } });
            return { ok: true };
        }
        return { ok: true };
    }
};
exports.DraftsController = DraftsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DraftsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('latest'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('kind')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], DraftsController.prototype, "latest", null);
__decorate([
    (0, common_1.Get)('jobs/:trade'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('trade')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], DraftsController.prototype, "getJobDraft", null);
__decorate([
    (0, common_1.Put)('jobs'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], DraftsController.prototype, "upsertJobDraft", null);
__decorate([
    (0, common_1.Put)('crm-note'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], DraftsController.prototype, "upsertCrmDraft", null);
__decorate([
    (0, common_1.Get)('job'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DraftsController.prototype, "getJobDrafts", null);
__decorate([
    (0, common_1.Put)('job'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], DraftsController.prototype, "saveJobDraftCompat", null);
__decorate([
    (0, common_1.Post)('job'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], DraftsController.prototype, "saveJobDraft", null);
__decorate([
    (0, common_1.Delete)('job/:trade'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('trade')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], DraftsController.prototype, "deleteJobDraft", null);
__decorate([
    (0, common_1.Get)('crm'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DraftsController.prototype, "getCrmDrafts", null);
__decorate([
    (0, common_1.Put)('crm'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], DraftsController.prototype, "saveCrmDraftCompat", null);
__decorate([
    (0, common_1.Post)('crm'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], DraftsController.prototype, "saveCrmDraft", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], DraftsController.prototype, "deleteDraftById", null);
exports.DraftsController = DraftsController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('drafts'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DraftsController);
//# sourceMappingURL=drafts.controller.js.map