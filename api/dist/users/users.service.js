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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = require("bcryptjs");
const crypto_1 = require("crypto");
const audit_service_1 = require("../audit/audit.service");
const prisma_service_1 = require("../prisma/prisma.service");
let UsersService = class UsersService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async list(tenantId, role) {
        const db = this.prisma;
        const users = await db.user.findMany({
            where: { companyId: tenantId },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                email: true,
                role: true,
                emailVerified: true,
                createdAt: true,
                lastActiveAt: true,
                lastLoginAt: true,
            },
        });
        if (role === 'OWNER')
            return users;
        return users.map((u) => ({ ...u, lastLoginAt: null, emailVerified: undefined }));
    }
    async invite(tenantId, inviterId, dto) {
        const db = this.prisma;
        const email = dto.email.toLowerCase().trim();
        const existing = await db.user.findFirst({ where: { companyId: tenantId, email } });
        if (existing) {
            throw new common_1.BadRequestException('User already exists for this tenant');
        }
        const token = (0, crypto_1.randomBytes)(24).toString('hex');
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
        const invite = await db.inviteToken.create({
            data: {
                tenantId,
                email,
                role: dto.role,
                token,
                expiresAt,
            },
        });
        await this.audit.log(tenantId, 'user.invite', `Invited ${email} as ${dto.role}`, inviterId);
        return { token: invite.token, expiresAt: invite.expiresAt };
    }
    async acceptInvite(dto) {
        const db = this.prisma;
        const invite = await db.inviteToken.findUnique({ where: { token: dto.token } });
        if (!invite) {
            throw new common_1.NotFoundException('Invite not found');
        }
        if (invite.acceptedAt) {
            throw new common_1.BadRequestException('Invite already accepted');
        }
        if (invite.expiresAt < new Date()) {
            throw new common_1.BadRequestException('Invite expired');
        }
        const existing = await db.user.findFirst({ where: { companyId: invite.tenantId, email: invite.email } });
        if (existing) {
            throw new common_1.BadRequestException('User already exists for this tenant');
        }
        const passwordHash = await bcrypt.hash(dto.password, 10);
        const user = await db.user.create({
            data: {
                companyId: invite.tenantId,
                email: invite.email,
                passwordHash,
                role: invite.role,
            },
        });
        await db.inviteToken.update({
            where: { id: invite.id },
            data: { acceptedAt: new Date() },
        });
        await this.audit.log(invite.tenantId, 'user.invite.accept', `Invite accepted for ${invite.email}`, user.id);
        return { accepted: true };
    }
    async updateRole(tenantId, actorId, userId, dto) {
        const db = this.prisma;
        const user = await db.user.findFirst({ where: { id: userId, companyId: tenantId } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        if (user.role === 'OWNER' && dto.role !== 'OWNER') {
            throw new common_1.ForbiddenException('Owner role cannot be removed');
        }
        const updated = await db.user.update({
            where: { id: userId },
            data: { role: dto.role },
        });
        await this.audit.log(tenantId, 'user.role.update', `Changed role for ${updated.email} to ${dto.role}`, actorId);
        return updated;
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], UsersService);
//# sourceMappingURL=users.service.js.map