import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptInviteDto, InviteUserDto, UpdateUserRoleDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, role: string) {
    const db = this.prisma as any;
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
    if (role === 'OWNER') return users;
    return users.map((u: any) => ({ ...u, lastLoginAt: null, emailVerified: undefined }));
  }

  async invite(tenantId: string, inviterId: string, dto: InviteUserDto) {
    const db = this.prisma as any;
    const email = dto.email.toLowerCase().trim();
    const existing = await db.user.findFirst({ where: { companyId: tenantId, email } });
    if (existing) {
      throw new BadRequestException('User already exists for this tenant');
    }

    const token = randomBytes(24).toString('hex');
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

  async acceptInvite(dto: AcceptInviteDto) {
    const db = this.prisma as any;
    const invite = await db.inviteToken.findUnique({ where: { token: dto.token } });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.acceptedAt) {
      throw new BadRequestException('Invite already accepted');
    }
    if (invite.expiresAt < new Date()) {
      throw new BadRequestException('Invite expired');
    }

    const existing = await db.user.findFirst({ where: { companyId: invite.tenantId, email: invite.email } });
    if (existing) {
      throw new BadRequestException('User already exists for this tenant');
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

  async updateRole(tenantId: string, actorId: string, userId: string, dto: UpdateUserRoleDto) {
    const db = this.prisma as any;
    const user = await db.user.findFirst({ where: { id: userId, companyId: tenantId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === 'OWNER' && dto.role !== 'OWNER') {
      throw new ForbiddenException('Owner role cannot be removed');
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: { role: dto.role },
    });

    await this.audit.log(tenantId, 'user.role.update', `Changed role for ${updated.email} to ${dto.role}`, actorId);
    return updated;
  }
}
