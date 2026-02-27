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
exports.MeController = void 0;
const common_1 = require("@nestjs/common");
const common_2 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const audit_service_1 = require("../audit/audit.service");
const feature_flags_1 = require("../common/feature-flags");
const prisma_service_1 = require("../prisma/prisma.service");
let MeController = class MeController {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    me(user) {
        return user;
    }
    async getLocationContext(user) {
        const db = this.prisma;
        const locations = (0, feature_flags_1.isLocationsV1Enabled)()
            ? await db.location.findMany({
                where: { companyId: user.companyId, isActive: true },
                orderBy: { name: 'asc' },
            })
            : [];
        const me = await db.user.findFirst({
            where: { id: user.sub, companyId: user.companyId },
            select: { defaultLocationId: true, onlyMyLocation: true },
        });
        return {
            activeLocationId: me?.defaultLocationId || 'all',
            onlyMyLocation: Boolean(me?.onlyMyLocation),
            available: [{ id: 'all', name: 'All locations' }, ...locations.map((l) => ({ id: l.id, name: l.name }))],
        };
    }
    async setLocationContext(user, body) {
        if (!(0, feature_flags_1.isLocationsV1Enabled)())
            return { activeLocationId: 'all' };
        const db = this.prisma;
        const selected = body?.locationId && body.locationId !== 'all' ? String(body.locationId) : null;
        if (selected) {
            const location = await db.location.findFirst({ where: { id: selected, companyId: user.companyId, isActive: true } });
            if (!location) {
                return { activeLocationId: 'all' };
            }
        }
        await db.user.update({
            where: { id: user.sub },
            data: { defaultLocationId: selected },
        });
        await this.audit.log(user.companyId, 'me.location.set', `Set active location context to ${selected || 'all'}`, user.sub);
        return { activeLocationId: selected || 'all' };
    }
};
exports.MeController = MeController;
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MeController.prototype, "me", null);
__decorate([
    (0, common_1.Get)('me/location'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MeController.prototype, "getLocationContext", null);
__decorate([
    (0, common_2.Put)('me/location'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_2.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MeController.prototype, "setLocationContext", null);
exports.MeController = MeController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], MeController);
//# sourceMappingURL=me.controller.js.map