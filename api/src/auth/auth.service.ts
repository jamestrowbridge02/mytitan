import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { BillingInterval } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_PLAN_CODE, DEFAULT_INTERVAL } from '../billing/billing.constants';
import { classifyNonRoutableRecipientEmail } from '../common/email-recipient-hygiene';
import {
  DEFAULT_WORKSPACE_CURRENCY,
  DEFAULT_WORKSPACE_LOCALE,
  DEFAULT_WORKSPACE_TIMEZONE,
  resolveGeoDefaultsFromCountryCode,
} from '../common/geo-defaults';
import { isPlatformAdminUser, isTrialExcludedUser } from '../common/platform-admin';
import { buildAppUrl } from '../common/public-url';
import { EmailDeliveryResult, EmailService } from '../email/email.service';
import { buildPasswordResetEmailTemplate, buildVerificationEmailTemplate } from '../email/email-templates';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { classifyGeneratedSignupArtifact, isPublicSignupHost } from './signup-hygiene';
import {
  ForgotPasswordDto,
  LoginDto,
  PlatformStaffSetupCompleteDto,
  PlatformStaffSetupRequestDto,
  ResendVerificationDto,
  ResetPasswordDto,
  SignupDto,
  VerifyEmailDto,
} from './dto';
import { JwtPayload } from './auth.types';

type VerificationResendStatus = 'sent' | 'accepted' | 'already_verified' | 'delivery_unavailable' | 'delivery_failed';
type VerificationResendResult = {
  ok: true;
  status: VerificationResendStatus;
  message?: string;
  actionHref?: string;
};

const PLATFORM_STAFF_SETUP_MESSAGE = 'If this is a MyTitan staff address, setup instructions will be sent.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  private tokenHash(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private makeToken(prefix: string) {
    return `${prefix}_${crypto.randomBytes(24).toString('hex')}`;
  }

  private normalizeEmail(email?: string | null) {
    return String(email || '').trim().toLowerCase();
  }

  private isMytitanStaffEmail(email?: string | null) {
    const normalized = this.normalizeEmail(email);
    return normalized.endsWith('@mytitan.co.uk');
  }

  private async ensureMytitanStaffCompany() {
    const db = this.prisma as any;
    return db.company.upsert({
      where: { id: 'mytitan-staff' },
      create: {
        id: 'mytitan-staff',
        name: 'MyTitan Staff',
        timezone: 'Europe/London',
        currency: 'GBP',
      },
      update: {},
    });
  }

  private assertPasswordResetFixtureEmail(email: string) {
    const normalized = email.toLowerCase().trim();
    if (!normalized.endsWith('@mytitan.example')) {
      throw new BadRequestException('Password reset fixture access is not available.');
    }
    return normalized;
  }

  private async createEmailVerificationToken(companyId: string, userId: string, email: string) {
    const db = this.prisma as any;
    const suppressionReason = classifyNonRoutableRecipientEmail(email);
    if (suppressionReason) {
      return {
        delivered: false,
        status: 'suppressed',
        reason: 'Outbound email is suppressed for non-routable or internal test recipient domains.',
      } as EmailDeliveryResult;
    }
    const rawToken = this.makeToken('verify');
    const tokenHash = this.tokenHash(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.emailVerificationToken.create({
      data: { companyId, userId, tokenHash, expiresAt },
    });
    const verifyUrl = buildAppUrl(`/verify-email?token=${encodeURIComponent(rawToken)}`);
    const tracking = await this.notifications.prepareTrackedEmailNotification({
      companyId,
      userId,
      type: 'email_verification_email',
      title: 'Verification email pending',
      body: 'Verification email is being prepared for delivery.',
      entityType: 'user',
      entityId: userId,
      reasonKey: 'email_verification',
      to: email,
      summary: 'Email verification was requested for this workspace user.',
      ctaHref: verifyUrl,
      trackingExpiresAt: expiresAt,
    });
    const template = buildVerificationEmailTemplate(
      await this.email.getBranding(null, { ownership: 'system' }),
      verifyUrl,
      tracking.trackedHref || verifyUrl,
    );
    const result = await this.email.sendTransactionalEmail(null, {
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    }, {
      ownership: 'system',
      category: 'verification',
      templateKey: 'email_verification_email',
      actorUserId: userId,
      dedupeWindowMinutes: 15,
    });
    await this.notifications.finalizeTrackedEmailNotification(tracking.id, result, {
      title: result.delivered ? 'Verification email sent' : 'Verification email pending',
      body: result.delivered ? 'Verification email sent to the workspace user.' : 'Verification email was not delivered in this environment.',
    });
    if (!result.delivered) {
      await this.audit.log(companyId, 'auth.email.delivery_unavailable', `Verification email not delivered: ${result.status}`, userId);
    }
    return result;
  }

  private async issuePasswordSetupToken(input: {
    companyId: string;
    userId: string;
    email: string;
    type: string;
    reasonKey: string;
    templateKey: string;
    auditAction: string;
    auditMessage: string;
    expiryMinutes?: number;
  }) {
    const db = this.prisma as any;
    const expiresAt = new Date(Date.now() + (input.expiryMinutes || 30) * 60 * 1000);
    await db.passwordResetToken.updateMany({
      where: { userId: input.userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    const token = this.makeToken('reset');
    await db.passwordResetToken.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        tokenHash: this.tokenHash(token),
        expiresAt,
      },
    });
    const setupUrl = buildAppUrl(`/reset-password?token=${encodeURIComponent(token)}`);
    const tracking = await this.notifications.prepareTrackedEmailNotification({
      companyId: input.companyId,
      userId: input.userId,
      type: input.type,
      title: 'MyTitan account setup pending',
      body: 'Account setup email is being prepared for delivery.',
      entityType: 'user',
      entityId: input.userId,
      reasonKey: input.reasonKey,
      to: input.email,
      summary: 'A MyTitan account setup link was requested.',
      ctaHref: setupUrl,
      trackingExpiresAt: expiresAt,
    });
    const template = buildPasswordResetEmailTemplate(
      await this.email.getBranding(null, { ownership: 'system' }),
      setupUrl,
      tracking.trackedHref || setupUrl,
    );
    const result = await this.email.sendTransactionalEmail(null, {
      to: input.email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    }, {
      ownership: 'system',
      category: 'password_reset',
      templateKey: input.templateKey,
      actorUserId: input.userId,
      dedupeWindowMinutes: process.env.MYTITAN_ENABLE_E2E_FIXTURES === '1' ? 1 : 5,
      bypassDuplicateSuppression: process.env.MYTITAN_ENABLE_E2E_FIXTURES === '1',
    });
    await this.notifications.finalizeTrackedEmailNotification(tracking.id, result, {
      title: result.delivered ? 'MyTitan account setup sent' : 'MyTitan account setup pending',
      body: result.delivered ? 'Account setup email sent to the MyTitan staff user.' : 'Account setup email was not delivered in this environment.',
    });
    await this.audit.log(input.companyId, input.auditAction, input.auditMessage, input.userId);
    if (!result.delivered) {
      await this.audit.log(input.companyId, 'auth.email.delivery_unavailable', `Setup email not delivered: ${result.status}`, input.userId);
    }
    return result;
  }

  private buildAuthenticatedResendResult(mail: EmailDeliveryResult): VerificationResendResult {
    if (mail.delivered) {
      return { ok: true, status: 'sent', message: 'Verification email sent from MyTitan. Check your inbox for the new link.' };
    }
    if (mail.status === 'not_configured' || mail.status === 'misconfigured' || mail.status === 'suppressed') {
      return {
        ok: true,
        status: 'delivery_unavailable',
        message:
          mail.status === 'suppressed'
            ? 'This address cannot receive live verification email from this environment.'
            : mail.status === 'not_configured'
              ? 'MyTitan email is not set up yet. Please contact support.'
              : 'MyTitan cannot send verification emails right now. Try again shortly.',
      };
    }
    return {
      ok: true,
      status: 'delivery_failed',
      message: 'MyTitan could not send the verification email just now. Try again shortly.',
    };
  }

  async signup(dto: SignupDto, requestHost?: string | string[] | null) {
    const db = this.prisma as any;
    const email = dto.email.toLowerCase().trim();
    const geoDefaults = resolveGeoDefaultsFromCountryCode(dto.countryCode);
    const defaultLocale = String(dto.defaultLocale || geoDefaults.locale || DEFAULT_WORKSPACE_LOCALE).trim() || DEFAULT_WORKSPACE_LOCALE;
    const timezone = String(dto.timezone || geoDefaults.timezone || DEFAULT_WORKSPACE_TIMEZONE).trim() || DEFAULT_WORKSPACE_TIMEZONE;
    const currency = String(dto.currency || geoDefaults.currency || DEFAULT_WORKSPACE_CURRENCY).trim().toUpperCase() || DEFAULT_WORKSPACE_CURRENCY;
    const signupArtifactReason =
      isPublicSignupHost(requestHost)
        ? classifyGeneratedSignupArtifact({ email, companyName: dto.companyName })
        : null;
    if (signupArtifactReason) {
      throw new BadRequestException('Use a real company name and email address on the live signup form.');
    }
    const existing = await db.user.findFirst({ where: { email } });
    if (existing) {
      throw new BadRequestException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const result = await db.$transaction(async (tx: any) => {
      const defaultPlan =
        await tx.plan.findFirst({ where: { code: DEFAULT_PLAN_CODE } }) ??
        await tx.plan.findFirst();
      if (!defaultPlan) {
        throw new BadRequestException('Billing plans are not configured');
      }

      let company;
      try {
        company = await tx.company.create({
          data: {
            name: dto.companyName.trim(),
            timezone,
            currency,
          },
        });
      } catch {
        company = await tx.company.create({ data: { name: dto.companyName.trim() } });
      }

      const user = await tx.user.create({
        data: {
          companyId: company.id,
          email,
          emailVerified: false,
          tokenVersion: 0,
          passwordHash,
          role: 'OWNER',
        },
      });

      const currentYear = new Date().getUTCFullYear();
      const trialExcluded = isTrialExcludedUser({ email });
      const trialStartedAt = trialExcluded ? null : new Date();
      const trialEndsAt = trialExcluded ? null : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const initialSubscriptionStatus = trialEndsAt ? 'trialing' : 'active';
      try {
        await tx.invoiceCounter.create({
          data: {
            companyId: company.id,
            year: currentYear,
            current: 0,
          },
        });
      } catch {
        await tx.invoiceCounter.upsert({
          where: { companyId: company.id },
          create: { companyId: company.id, prefix: `INV-${currentYear}`, nextNumber: 1 },
          update: {},
        });
      }

      try {
        await tx.tenantSetting.create({
          data: {
            tenantId: company.id,
            planId: defaultPlan.id,
            companyName: company.name,
            defaultCurrency: company.currency ?? currency ?? DEFAULT_WORKSPACE_CURRENCY,
            defaultLocale,
            defaultTimezone: company.timezone ?? timezone ?? DEFAULT_WORKSPACE_TIMEZONE,
            planBillingInterval: DEFAULT_INTERVAL as BillingInterval,
          },
        });
      } catch {
        await tx.tenantSetting.upsert({
          where: { tenantId: company.id },
          create: {
            tenantId: company.id,
            planId: defaultPlan.id,
            companyName: company.name,
            defaultCurrency: company.currency ?? currency ?? DEFAULT_WORKSPACE_CURRENCY,
            defaultLocale,
            defaultTimezone: company.timezone ?? timezone ?? DEFAULT_WORKSPACE_TIMEZONE,
            planBillingInterval: DEFAULT_INTERVAL as BillingInterval,
          },
          update: {},
        });
      }

      await tx.tenantSubscription.create({
        data: {
          tenantId: company.id,
          planId: defaultPlan.id,
          status: initialSubscriptionStatus,
          trialStartedAt,
          trialEndsAt,
          currentPeriodEnd: trialEndsAt,
        },
      });

      return { company, user };
    });

    await this.audit.log(result.company.id, 'signup', 'Company and admin user created', result.user.id);
    const verificationDelivery = await this.createEmailVerificationToken(result.company.id, result.user.id, result.user.email);

    const payload: JwtPayload = {
      sub: result.user.id,
      companyId: result.user.companyId,
      role: result.user.role,
      email: result.user.email,
      platformAdmin: isPlatformAdminUser({ email: result.user.email }),
      tokenVersion: Number(result.user.tokenVersion ?? 0),
      emailVerified: false,
    };

    return {
      token: await this.jwt.signAsync(payload),
      user: {
        id: result.user.id,
        companyId: result.user.companyId,
        email: result.user.email,
        emailVerified: false,
        role: result.user.role,
        platformAdmin: isPlatformAdminUser({ email: result.user.email }),
        createdAt: result.user.createdAt,
      },
      company: {
        id: result.company.id,
        name: result.company.name,
        timezone: result.company.timezone ?? DEFAULT_WORKSPACE_TIMEZONE,
        currency: result.company.currency ?? DEFAULT_WORKSPACE_CURRENCY,
      },
      emailVerificationRequired: true,
      emailDeliveryStatus: verificationDelivery.status,
      emailDeliveryMessage:
        verificationDelivery.delivered
          ? 'Check your email to verify your address before sensitive actions.'
          : verificationDelivery.status === 'not_configured' || verificationDelivery.status === 'misconfigured' || verificationDelivery.status === 'suppressed'
            ? verificationDelivery.status === 'suppressed'
              ? 'Your account is ready, but this address cannot receive live verification email from this environment.'
              : verificationDelivery.status === 'not_configured'
                ? 'Your account is ready, but MyTitan email is not set up yet. Please contact support.'
                : 'Your account is ready, but MyTitan cannot send the verification email just now. Try resending in a moment.'
            : 'Your account is ready, but MyTitan could not send the verification email just now. Try resending in a moment.',
      emailActionHref: null,
    };
  }

  async requestPlatformStaffSetup(dto: PlatformStaffSetupRequestDto) {
    const db = this.prisma as any;
    const email = this.normalizeEmail(dto.email);
    if (!this.isMytitanStaffEmail(email)) {
      return { ok: true, status: 'accepted', message: PLATFORM_STAFF_SETUP_MESSAGE };
    }

    const company = await this.ensureMytitanStaffCompany();
    const user = await db.user.findFirst({ where: { email } });
    const target = user?.id
      ? await db.user.update({
          where: { id: user.id },
          data: {
            companyId: user.companyId || company.id,
            email,
            role: user.role || 'STAFF',
            isActive: true,
          },
        })
      : await db.user.create({
          data: {
            companyId: company.id,
            email,
            role: email === 'admin@mytitan.co.uk' ? 'OWNER' : 'STAFF',
            emailVerified: false,
            isActive: true,
            passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), 10),
          },
        });

    const result = await this.issuePasswordSetupToken({
      companyId: target.companyId,
      userId: target.id,
      email: target.email,
      type: 'platform_staff_setup_email',
      reasonKey: 'platform_staff_setup',
      templateKey: 'platform_staff_setup_email',
      auditAction: 'auth.platform-staff.setup-requested',
      auditMessage: 'Platform staff password setup requested',
      expiryMinutes: 30,
    });
    return {
      ok: true,
      status: result.delivered ? 'sent' : 'accepted',
      message: PLATFORM_STAFF_SETUP_MESSAGE,
    };
  }

  async completePlatformStaffSetup(dto: PlatformStaffSetupCompleteDto) {
    const db = this.prisma as any;
    const tokenHash = this.tokenHash(dto.token);
    const token = await db.passwordResetToken.findFirst({
      where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!token || !this.isMytitanStaffEmail(token.user?.email)) {
      throw new BadRequestException('This setup link is no longer valid. Request a new link to keep going.');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await db.$transaction([
      db.user.update({
        where: { id: token.userId },
        data: {
          passwordHash,
          emailVerified: true,
          isActive: true,
          tokenVersion: { increment: 1 },
        },
      }),
      db.passwordResetToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } }),
    ]);
    await this.audit.log(token.companyId, 'auth.platform-staff.setup-completed', 'Platform staff password setup completed', token.userId);
    return { ok: true };
  }

  async login(dto: LoginDto) {
    const db = this.prisma as any;
    const email = dto.email.toLowerCase().trim();
    const user = await db.user.findFirst({ where: { email } });
    if (!user) {
      this.logger.warn(`login_failed reason=not_found email=${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.isActive === false) {
      this.logger.warn(`login_failed reason=inactive email=${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      this.logger.warn(`login_failed reason=password_mismatch email=${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    await db.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date(), lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      sub: user.id,
      companyId: user.companyId,
      role: user.role,
      email: user.email,
      platformAdmin: isPlatformAdminUser({ email: user.email, emailVerified: Boolean(user.emailVerified) } as any),
      tokenVersion: Number(user.tokenVersion ?? 0),
      emailVerified: Boolean(user.emailVerified),
      demoUser: user.email === '@mytitan.co.uk',
    };

    await this.audit.log(user.companyId, 'login', 'User logged in', user.id);

    return {
      token: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        companyId: user.companyId,
        email: user.email,
        emailVerified: Boolean(user.emailVerified),
        role: user.role,
        platformAdmin: isPlatformAdminUser({ email: user.email, emailVerified: Boolean(user.emailVerified) } as any),
        createdAt: user.createdAt,
        lastLoginAt: new Date().toISOString(),
      },
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const db = this.prisma as any;
    const email = dto.email.toLowerCase().trim();
    const suppressionReason = classifyNonRoutableRecipientEmail(email);
    const readiness = await this.email.getReadiness(null, { ownership: 'system' });
    const fixturesEnabled = process.env.MYTITAN_ENABLE_E2E_FIXTURES === '1' || email.endsWith('@mytitan.example');
    if (suppressionReason) {
      return {
        ok: true,
        status: 'delivery_unavailable',
        message: 'If an account exists, a reset link will be sent once MyTitan email delivery is available.',
      };
    }
    const user = await db.user.findFirst({ where: { email } });
    if (!user) {
      return {
        ok: true,
        status: readiness.status === 'ready' ? 'sent' : 'delivery_unavailable',
        message:
          readiness.status === 'ready'
            ? 'If an account exists, a reset link has been sent.'
        : 'If an account exists, a reset link will be sent once MyTitan email delivery is available.',
      };
    }
    if (!fixturesEnabled) {
      const recentToken = await db.passwordResetToken.findFirst({
        where: {
          userId: user.id,
          consumedAt: null,
          createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        },
        select: { id: true },
      });
      if (recentToken?.id) {
        await this.audit.log(user.companyId, 'auth.reset-password.cooldown', 'Password reset request held by cooldown window', user.id);
        return {
          ok: true,
          status: 'delivery_unavailable',
          message: 'If an account exists, a recent reset email is still active. Please wait a few minutes before requesting another one.',
        };
      }
    }
    await db.passwordResetToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    const token = this.makeToken('reset');
    const tokenHash = this.tokenHash(token);
    await db.passwordResetToken.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    const resetUrl = buildAppUrl(`/reset-password?token=${encodeURIComponent(token)}`);
    const tracking = await this.notifications.prepareTrackedEmailNotification({
      companyId: user.companyId,
      userId: user.id,
      type: 'password_reset_email',
      title: 'Password reset email pending',
      body: 'Password reset email is being prepared for delivery.',
      entityType: 'user',
      entityId: user.id,
      reasonKey: 'password_reset',
      to: user.email,
      summary: 'Password reset was requested for this workspace user.',
      ctaHref: resetUrl,
      trackingExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    const template = buildPasswordResetEmailTemplate(
      await this.email.getBranding(null, { ownership: 'system' }),
      resetUrl,
      tracking.trackedHref || resetUrl,
    );
    const result = await this.email.sendTransactionalEmail(null, {
      to: user.email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    }, {
      ownership: 'system',
      category: 'password_reset',
      templateKey: 'password_reset_email',
      actorUserId: user.id,
      dedupeWindowMinutes: fixturesEnabled ? 1 : 5,
      bypassDuplicateSuppression: fixturesEnabled,
    });
    await this.notifications.finalizeTrackedEmailNotification(tracking.id, result, {
      title: result.delivered ? 'Password reset email sent' : 'Password reset email pending',
      body: result.delivered ? 'Password reset email sent to the workspace user.' : 'Password reset email was not delivered in this environment.',
    });
    if (!result.delivered) {
      await this.audit.log(user.companyId, 'auth.email.delivery_unavailable', `Reset email not delivered: ${result.status}`, user.id);
    }
    return {
      ok: true,
      status: result.delivered ? 'sent' : 'delivery_unavailable',
      message: result.delivered
        ? 'If an account exists, a reset link has been sent.'
        : 'If an account exists, a reset link will be sent once MyTitan email delivery is available.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const db = this.prisma as any;
    const tokenHash = this.tokenHash(dto.token);
    const token = await db.passwordResetToken.findFirst({
      where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!token) {
      throw new BadRequestException('This reset link is no longer valid. Request a new link to keep going.');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    const verifiesPlatformStaff = this.isMytitanStaffEmail(token.user?.email);
    await db.$transaction([
      db.user.update({
        where: { id: token.userId },
        data: {
          passwordHash,
          emailVerified: verifiesPlatformStaff ? true : undefined,
          isActive: verifiesPlatformStaff ? true : undefined,
          tokenVersion: { increment: 1 },
        },
      }),
      db.passwordResetToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } }),
    ]);
    await this.audit.log(token.companyId, verifiesPlatformStaff ? 'auth.platform-staff.setup-completed' : 'auth.reset-password', verifiesPlatformStaff ? 'Platform staff password setup completed' : 'Password reset completed', token.userId);
    return { ok: true };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const db = this.prisma as any;
    const tokenHash = this.tokenHash(dto.token);
    const token = await db.emailVerificationToken.findFirst({
      where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!token) {
      throw new BadRequestException('Invalid or expired verification token');
    }
    await db.$transaction([
      db.user.update({ where: { id: token.userId }, data: { emailVerified: true } }),
      db.emailVerificationToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } }),
    ]);
    await this.audit.log(token.companyId, 'auth.verify-email', 'Email verified', token.userId);
    return { ok: true };
  }

  async resendVerificationForUser(companyId: string, userId: string, dto?: ResendVerificationDto): Promise<VerificationResendResult> {
    const db = this.prisma as any;
    const where = dto?.email
      ? { companyId, email: dto.email.toLowerCase().trim() }
      : { companyId, id: userId };
    const user = await db.user.findFirst({ where });
    if (!user) return { ok: true, status: 'accepted', message: 'If the address still needs verification, a new email will be sent.' };
    if (user.emailVerified) {
      return { ok: true, status: 'already_verified', message: 'This email is already verified.' };
    }
    const mail = await this.createEmailVerificationToken(user.companyId, user.id, user.email);
    return this.buildAuthenticatedResendResult(mail);
  }

  async resendVerificationForEmail(email: string): Promise<VerificationResendResult> {
    const db = this.prisma as any;
    const normalizedEmail = email.toLowerCase().trim();
    if (classifyNonRoutableRecipientEmail(normalizedEmail)) {
      return {
        ok: true,
        status: 'accepted',
        message: 'If that address still needs verification, we will send a new email shortly.',
      };
    }
    const user = await db.user.findFirst({ where: { email: normalizedEmail } });
    if (!user || user.emailVerified) {
      return {
        ok: true,
        status: 'accepted',
        message: 'If that address still needs verification, we will send a new email shortly.',
      };
    }
    const mail = await this.createEmailVerificationToken(user.companyId, user.id, user.email);
    if (mail.delivered) {
      return {
        ok: true,
        status: 'accepted',
        message: 'If that address still needs verification, we will send a new email shortly.',
      };
    }
    return {
      ok: true,
      status: 'accepted',
      message: 'If that address still needs verification, MyTitan will retry delivery when verification email service is available.',
    };
  }

  async getLatestPasswordResetFixture(email: string) {
    const db = this.prisma as any;
    const normalizedEmail = this.assertPasswordResetFixtureEmail(email);
    const user = await db.user.findFirst({
      where: { email: normalizedEmail },
      select: { id: true, companyId: true },
    });
    if (!user?.id) {
      throw new BadRequestException('Password reset fixture account not found.');
    }
    const notification = await db.notification.findFirst({
      where: {
        companyId: user.companyId,
        userId: user.id,
        type: 'password_reset_email',
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!notification?.id) {
      return { ok: false, resetHref: null };
    }
    const resetHref = await this.notifications.resolveTrackedDestinationForFixture(notification.id);
    return { ok: Boolean(resetHref), resetHref };
  }

  private assertPlatformStaffSetupFixtureEmail(email: string) {
    const normalized = this.normalizeEmail(email);
    if (!this.isMytitanStaffEmail(normalized)) {
      throw new BadRequestException('Platform staff setup fixture access is not available.');
    }
    if (
      process.env.MYTITAN_ENABLE_E2E_FIXTURES !== '1' &&
      !/^staff\.(setup|expire)\.\d+@mytitan\.co\.uk$/.test(normalized)
    ) {
      throw new BadRequestException('Platform staff setup fixture access is not available.');
    }
    return normalized;
  }

  async getLatestPlatformStaffSetupFixture(email: string) {
    const db = this.prisma as any;
    const normalizedEmail = this.assertPlatformStaffSetupFixtureEmail(email);
    const user = await db.user.findFirst({
      where: { email: normalizedEmail },
      select: { id: true, companyId: true },
    });
    if (!user?.id) {
      throw new BadRequestException('Platform staff setup fixture account not found.');
    }
    const notification = await db.notification.findFirst({
      where: {
        companyId: user.companyId,
        userId: user.id,
        type: 'platform_staff_setup_email',
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!notification?.id) {
      return { ok: false, setupHref: null };
    }
    const setupHref = await this.notifications.resolveTrackedDestinationForFixture(notification.id);
    return { ok: Boolean(setupHref), setupHref };
  }

  async isPasswordResetFixtureToken(token: string) {
    const db = this.prisma as any;
    const normalizedToken = String(token || '').trim();
    if (!normalizedToken.startsWith('reset_')) {
      return false;
    }
    const row = await db.passwordResetToken.findFirst({
      where: { tokenHash: this.tokenHash(normalizedToken) },
      select: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });
    return String(row?.user?.email || '').toLowerCase().trim().endsWith('@mytitan.example');
  }

  async expireLatestPasswordResetFixture(email: string) {
    const db = this.prisma as any;
    const normalizedEmail = this.assertPasswordResetFixtureEmail(email);
    const user = await db.user.findFirst({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (!user?.id) {
      throw new BadRequestException('Password reset fixture account not found.');
    }
    const token = await db.passwordResetToken.findFirst({
      where: { userId: user.id, consumedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!token?.id) {
      return { ok: false };
    }
    await db.passwordResetToken.update({
      where: { id: token.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    return { ok: true };
  }

  async expireLatestPlatformStaffSetupFixture(email: string) {
    const db = this.prisma as any;
    const normalizedEmail = this.assertPlatformStaffSetupFixtureEmail(email);
    const user = await db.user.findFirst({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (!user?.id) {
      throw new BadRequestException('Platform staff setup fixture account not found.');
    }
    const token = await db.passwordResetToken.findFirst({
      where: { userId: user.id, consumedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!token?.id) {
      return { ok: false };
    }
    await db.passwordResetToken.update({
      where: { id: token.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    return { ok: true };
  }

  async signOutAll(companyId: string, userId: string) {
    const db = this.prisma as any;
    await db.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    await this.audit.log(companyId, 'auth.logout-all', 'User signed out all sessions', userId);
    return { ok: true };
  }
}
