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
exports.CommandCentreController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const feature_gate_1 = require("../common/feature-gate");
const feature_flags_1 = require("../common/feature-flags");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const prisma_service_1 = require("../prisma/prisma.service");
let CommandCentreController = class CommandCentreController {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async summary(user) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCommandCentreV1Enabled)(), feature: 'COMMAND_CENTRE_V1', mode: 'read' });
        const db = this.prisma;
        const now = new Date();
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(now);
        dayEnd.setHours(23, 59, 59, 999);
        const [todayBookings, dueAndOverdueJobs, unpaidJobs, draftJobs, crmDrafts, sub, settings] = await Promise.all([
            db.booking.findMany({
                where: { companyId: user.companyId, startsAt: { gte: dayStart, lte: dayEnd } },
                orderBy: { startsAt: 'asc' },
                take: 20,
            }),
            db.job.findMany({
                where: {
                    companyId: user.companyId,
                    OR: [{ invoiceDueAt: { lt: now }, invoicePaidAt: null }, { status: { in: ['OPEN', 'SCHEDULED'] } }],
                },
                orderBy: { updatedAt: 'desc' },
                take: 20,
            }),
            db.job.findMany({
                where: { companyId: user.companyId, invoiceIssuedAt: { not: null }, invoicePaidAt: null },
                orderBy: { invoiceIssuedAt: 'desc' },
                take: 20,
            }),
            db.jobDraft.findMany({ where: { companyId: user.companyId, userId: user.sub }, orderBy: { updatedAt: 'desc' }, take: 20 }),
            db.crmDraft.findMany({ where: { companyId: user.companyId, userId: user.sub }, orderBy: { updatedAt: 'desc' }, take: 20 }),
            db.tenantSubscription.findUnique({ where: { tenantId: user.companyId } }),
            db.tenantSetting.findUnique({ where: { tenantId: user.companyId } }),
        ]);
        return {
            quickActions: [
                { key: 'new_job', label: 'New Job', href: '/dashboard/jobs/new' },
                { key: 'new_booking', label: 'New Booking', href: '/dashboard/bookings' },
                { key: 'new_customer', label: 'New Customer / Trade Account', href: '/dashboard/trade-accounts' },
            ],
            todayBookings,
            dueAndOverdueJobs,
            unpaidJobs,
            drafts: { jobs: draftJobs, crm: crmDrafts },
            money: {
                unpaidCount: unpaidJobs.length,
                unpaidTotalCents: unpaidJobs.reduce((sum, job) => sum + Number(job.totalCents || 0), 0),
                subscriptionStatus: sub?.status || 'none',
            },
            setup: {
                guidedSetupCompletedAt: settings?.guidedSetupCompletedAt || null,
                onboardingCompleted: Boolean(settings?.onboardingCompleted),
                onboardingStep: Number(settings?.onboardingStep || 0),
            },
        };
    }
    async listViews(user) {
        const fallback = (0, feature_gate_1.featureGate)({
            enabled: (0, feature_flags_1.isCommandCentrePremiumV1Enabled)(),
            feature: 'COMMAND_CENTRE_PREMIUM_V1',
            mode: 'read',
            fallback: [],
        });
        if (fallback)
            return fallback;
        const db = this.prisma;
        return db.savedCommandView.findMany({
            where: { companyId: user.companyId, userId: user.sub },
            orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        });
    }
    async createView(user, body) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCommandCentrePremiumV1Enabled)(), feature: 'COMMAND_CENTRE_PREMIUM_V1', mode: 'mutation' });
        const db = this.prisma;
        if (body?.isDefault) {
            await db.savedCommandView.updateMany({
                where: { companyId: user.companyId, userId: user.sub },
                data: { isDefault: false },
            });
        }
        return db.savedCommandView.create({
            data: {
                companyId: user.companyId,
                userId: user.sub,
                name: String(body?.name || 'Saved view').slice(0, 80),
                filtersJson: body?.filters || {},
                isDefault: Boolean(body?.isDefault),
            },
        });
    }
    async updateView(user, id, body) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCommandCentrePremiumV1Enabled)(), feature: 'COMMAND_CENTRE_PREMIUM_V1', mode: 'mutation' });
        const db = this.prisma;
        const existing = await db.savedCommandView.findFirst({ where: { id, companyId: user.companyId, userId: user.sub } });
        if (!existing)
            return { ok: false, message: 'View not found' };
        if (body?.isDefault) {
            await db.savedCommandView.updateMany({
                where: { companyId: user.companyId, userId: user.sub },
                data: { isDefault: false },
            });
        }
        return db.savedCommandView.update({
            where: { id },
            data: {
                name: body?.name ? String(body.name).slice(0, 80) : undefined,
                filtersJson: body?.filters ?? undefined,
                isDefault: body?.isDefault ?? undefined,
            },
        });
    }
    async deleteView(user, id) {
        (0, feature_gate_1.featureGate)({ enabled: (0, feature_flags_1.isCommandCentrePremiumV1Enabled)(), feature: 'COMMAND_CENTRE_PREMIUM_V1', mode: 'mutation' });
        const db = this.prisma;
        const existing = await db.savedCommandView.findFirst({ where: { id, companyId: user.companyId, userId: user.sub } });
        if (!existing)
            return { ok: false, message: 'View not found' };
        await db.savedCommandView.delete({ where: { id } });
        return { ok: true };
    }
};
exports.CommandCentreController = CommandCentreController;
__decorate([
    (0, common_1.Get)('summary'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CommandCentreController.prototype, "summary", null);
__decorate([
    (0, common_1.Get)('views'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CommandCentreController.prototype, "listViews", null);
__decorate([
    (0, common_1.Post)('views'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CommandCentreController.prototype, "createView", null);
__decorate([
    (0, common_1.Patch)('views/:id'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], CommandCentreController.prototype, "updateView", null);
__decorate([
    (0, common_1.Delete)('views/:id'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CommandCentreController.prototype, "deleteView", null);
exports.CommandCentreController = CommandCentreController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('command-centre'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CommandCentreController);
//# sourceMappingURL=command-centre.controller.js.map