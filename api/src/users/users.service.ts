import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { buildAppUrl } from '../common/public-url';
import { EmailService } from '../email/email.service';
import { buildTeamInviteEmailTemplate } from '../email/email-templates';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptInviteDto, InviteUserDto, UpdateUserRoleDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  async list(tenantId: string, role: string) {
    const db = this.prisma as any;
    const users = await db.user.findMany({
      where: { companyId: tenantId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        role: true,
        color: true,
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

    const rawToken = `invite_${randomBytes(24).toString('hex')}`;
    const tokenHash = this.tokenHash(rawToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    const activationUrl = buildAppUrl(`/accept-invite?token=${encodeURIComponent(rawToken)}`);
    const invite = await db.inviteToken.create({
      data: {
        tenantId,
        email,
        role: dto.role,
        token: tokenHash,
        expiresAt,
      },
    });

    const tracking = await this.notifications.prepareTrackedEmailNotification({
      companyId: tenantId,
      userId: inviterId,
      type: 'team_invite_email',
      title: 'Team invite email pending',
      body: 'Team invite email is being prepared for delivery.',
      entityType: 'tenant',
      entityId: tenantId,
      reasonKey: 'team_invite',
      to: email,
      summary: `Workspace invite was prepared for role ${dto.role}.`,
      ctaHref: activationUrl,
      trackingExpiresAt: expiresAt,
    });
    const template = buildTeamInviteEmailTemplate(await this.email.getBranding(tenantId, { ownership: 'workspace' }), {
      role: dto.role,
      acceptUrl: activationUrl,
      htmlAcceptUrl: tracking.trackedHref || activationUrl,
    });
    const delivery = await this.email.sendTransactionalEmail(null, {
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    }, {
      ownership: 'system',
      category: 'team_invite',
      templateKey: 'team_invite_email',
      actorUserId: inviterId,
      dedupeWindowMinutes: 60,
    });
    await this.notifications.finalizeTrackedEmailNotification(tracking.id, delivery, {
      title: delivery.delivered ? 'Team invite email sent' : 'Team invite email pending',
      body: delivery.delivered ? `Invite email sent for role ${dto.role}.` : 'Team invite email was not delivered in this environment.',
    });

    if (!delivery.delivered) {
      await db.inviteToken.delete({ where: { id: invite.id } });
      return {
        ok: true,
        status: delivery.status === 'failed' ? 'delivery_failed' : 'delivery_unavailable',
        message:
          delivery.status === 'failed'
            ? 'We could not send the team invite email just now. Please try again shortly.'
            : delivery.reason || 'MyTitan email is not set up yet. Please contact support.',
      };
    }

    await this.audit.log(tenantId, 'user.invite', `Invited ${email} as ${dto.role}`, inviterId);

    return {
      ok: true,
      status: 'sent',
      message: `Invite email sent to ${email}.`,
      expiresAt: invite.expiresAt,
    };
  }

  async acceptInvite(dto: AcceptInviteDto) {
    const db = this.prisma as any;
    const invite = await db.inviteToken.findUnique({ where: { token: this.tokenHash(dto.token) } });
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

  async updateRole(tenantId: string, actorId: string, actorRole: string, userId: string, dto: UpdateUserRoleDto) {
    const db = this.prisma as any;
    const user = await db.user.findFirst({ where: { id: userId, companyId: tenantId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.role === 'OWNER' && actorRole !== 'OWNER') {
      throw new ForbiddenException('Only an owner can assign the owner role');
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
