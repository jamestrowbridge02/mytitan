import { BadRequestException, Injectable } from '@nestjs/common';
import * as net from 'net';
import * as tls from 'tls';
import { decryptText, encryptText } from '../integrations/integrations.crypto';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePublicUrl } from '../common/public-url';
import type { WorkspaceEmailBranding } from './email-templates';
import {
  allowLiveSmtpInCurrentEnvironment,
  classifyOutboundRecipient,
  classifyProviderFailure,
  detectEmailEnvironmentMode,
  type EmailEnvironmentMode,
  hashContent,
  hashEmailAddress,
  maskEmailAddress,
  SmtpResponseError,
} from './email-safety';

export type EmailDeliveryStatus = 'sent' | 'captured' | 'not_configured' | 'misconfigured' | 'failed' | 'suppressed' | 'paused' | 'deferred';
export type EmailReadinessStatus = 'ready' | 'safe_capture' | 'not_configured' | 'misconfigured' | 'failing';

export type EmailReadiness = {
  status: EmailReadinessStatus;
  source: 'environment' | 'encrypted_vault' | 'safe_capture' | 'missing';
  transport: 'smtp' | 'capture' | 'none';
  canSend: boolean;
  fromEmail: string | null;
  fromName: string | null;
  replyToEmail: string | null;
  guidance: string;
  dnsRecords: string[];
  environment?: EmailEnvironmentMode;
};

export type EmailDeliveryResult = {
  delivered: boolean;
  status: EmailDeliveryStatus;
  reason: string;
  actionHref?: string;
  senderOwnership?: EmailOwnership;
  usedFallback?: boolean;
  notice?: string | null;
  attachmentCapability?: 'supported' | 'safe_capture' | 'not_configured';
  attachmentCount?: number;
};

export type OperationalEmailReadiness = {
  workspace: EmailReadiness;
  fallback: EmailReadiness;
  effective: EmailReadiness & {
    senderOwnership: EmailOwnership | 'none';
    usingFallback: boolean;
    notice: string | null;
  };
};

type EmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string | null;
  replyToEmail: string | null;
  source: 'environment' | 'encrypted_vault' | 'missing';
  provider?: string;
};

type EmailDeliveryOverrides = {
  fromName?: string | null;
  replyToEmail?: string | null;
};

type EmailSendInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  fromName?: string | null;
  replyToEmail?: string | null;
  attachments?: EmailAttachment[];
};

export type EmailAttachment = {
  filename: string;
  contentBase64: string;
  contentType?: string | null;
  sizeBytes?: number | null;
};

export type EmailOwnership = 'workspace' | 'system';

type EmailContextOptions = {
  ownership?: EmailOwnership;
  category?: string;
  templateKey?: string;
  actorUserId?: string | null;
  dedupeWindowMinutes?: number;
  bypassDuplicateSuppression?: boolean;
};

type TenantMailPresentation = {
  companyName: string | null;
  logoUrl: string | null;
  emailSenderName: string | null;
  emailReplyTo: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpPasswordEncrypted: string | null;
};

@Injectable()
export class EmailService {
  constructor(private readonly prisma: PrismaService) {}

  private firstNonEmpty(...values: Array<string | undefined | null>) {
    for (const value of values) {
      const normalized = String(value || '').trim();
      if (normalized) return normalized;
    }
    return '';
  }

  private normalizeEmail(value?: string | null) {
    const normalized = String(value || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
  }

  private formatMailbox(address: string, displayName?: string | null) {
    const normalizedAddress = String(address || '').trim();
    if (!displayName) return normalizedAddress;
    const safeName = String(displayName || '').replace(/[\r\n"]/g, '').trim();
    return safeName ? `"${safeName}" <${normalizedAddress}>` : normalizedAddress;
  }

  private isTruthy(value: string) {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
  }

  private isFixtureCaptureAddress(value?: string | null) {
    const email = this.normalizeEmail(value || '');
    if (!email || process.env.MYTITAN_ENABLE_E2E_FIXTURES !== '1') return false;
    return email.endsWith('@mytitan.example');
  }

  private normalizeAttachments(attachments?: EmailAttachment[]) {
    const rows = Array.isArray(attachments) ? attachments : [];
    return rows
      .map((attachment) => {
        const filename = String(attachment?.filename || 'attachment.bin').replace(/[\r\n/\\]+/g, '_').slice(0, 120);
        const contentBase64 = String(attachment?.contentBase64 || '').replace(/\s+/g, '');
        const sizeBytes = Number(attachment?.sizeBytes || Buffer.from(contentBase64 || '', 'base64').length || 0);
        const contentType = String(attachment?.contentType || 'application/octet-stream').replace(/[\r\n;]+/g, '').slice(0, 120);
        return { filename, contentBase64, contentType, sizeBytes };
      })
      .filter((attachment) => attachment.filename && attachment.contentBase64 && attachment.sizeBytes > 0);
  }

  private resolveOwnership(options?: EmailContextOptions) {
    return options?.ownership === 'system' ? 'system' : 'workspace';
  }

  private resolveCategory(options?: EmailContextOptions, ownership?: EmailOwnership) {
    const explicit = String(options?.category || '').trim().toLowerCase();
    if (explicit) return explicit;
    return ownership === 'system' ? 'system' : 'operational';
  }

  private environmentMode() {
    return detectEmailEnvironmentMode();
  }

  private allowLiveSmtp(mode = this.environmentMode()) {
    return allowLiveSmtpInCurrentEnvironment(mode);
  }

  private async getOutboundEmailControl() {
    const db = this.prisma as any;
    const mode = this.environmentMode();
    return db.outboundEmailControl.upsert({
      where: { id: 'global' },
      create: {
        id: 'global',
        environment: mode,
        allowLiveSmtpInNonProd: this.allowLiveSmtp(mode),
      },
      update: {
        environment: mode,
        allowLiveSmtpInNonProd: this.allowLiveSmtp(mode),
      },
    });
  }

  private extractDomain(value?: string | null) {
    const email = this.normalizeEmail(value || '');
    const atIndex = email.lastIndexOf('@');
    if (atIndex < 0) return '';
    return email.slice(atIndex + 1);
  }

  private async recordEmailEvent(input: {
    companyId?: string | null;
    userId?: string | null;
    ownership?: EmailOwnership | null;
    category: string;
    templateKey?: string | null;
    recipient: string;
    subject?: string | null;
    dedupeKey?: string | null;
    status: EmailDeliveryStatus;
    reason: string;
    providerCode?: string | null;
    responseSummary?: string | null;
    metaJson?: Record<string, any> | null;
  }) {
    const db = this.prisma as any;
    const environment = this.environmentMode();
    return db.outboundEmailEvent.create({
      data: {
        companyId: input.companyId || null,
        userId: input.userId || null,
        environment,
        senderOwnership: input.ownership || null,
        category: input.category,
        templateKey: input.templateKey || null,
        recipientEmailHash: hashEmailAddress(input.recipient),
        recipientMasked: maskEmailAddress(input.recipient),
        recipientDomain: this.extractDomain(input.recipient),
        subjectHash: input.subject ? hashContent(input.subject) : null,
        dedupeKey: input.dedupeKey || null,
        status: input.status,
        reason: input.reason,
        providerCode: input.providerCode || null,
        responseSummary: input.responseSummary || null,
        metaJson: input.metaJson || null,
      },
    });
  }

  private async getRecentMatchingEvent(dedupeKey: string, windowMinutes: number) {
    const db = this.prisma as any;
    return db.outboundEmailEvent.findFirst({
      where: {
        dedupeKey,
        createdAt: { gte: new Date(Date.now() - windowMinutes * 60 * 1000) },
        status: { in: ['sent', 'captured', 'deferred'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getActiveRecipientSuppression(companyId: string | null | undefined, email: string) {
    const db = this.prisma as any;
    return db.outboundEmailSuppression.findFirst({
      where: {
        email: this.normalizeEmail(email),
        status: 'active',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
        AND: [
          {
            OR: [
              { companyId: null },
              { companyId: companyId || null },
            ],
          },
        ],
      },
      orderBy: [{ companyId: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async createRecipientSuppression(input: {
    companyId?: string | null;
    email: string;
    reason: string;
    category: string;
    source: string;
    createdByUserId?: string | null;
    expiresAt?: Date | null;
    metaJson?: Record<string, any> | null;
  }) {
    const db = this.prisma as any;
    return db.outboundEmailSuppression.create({
      data: {
        companyId: input.companyId || null,
        email: this.normalizeEmail(input.email),
        reason: input.reason,
        category: input.category,
        source: input.source,
        createdByUserId: input.createdByUserId || null,
        expiresAt: input.expiresAt || null,
        metaJson: input.metaJson || null,
      },
    });
  }

  private async touchSuppression(id: string) {
    const db = this.prisma as any;
    return db.outboundEmailSuppression.update({
      where: { id },
      data: {
        hitCount: { increment: 1 },
        lastMatchedAt: new Date(),
      },
    });
  }

  private async evaluateDeliveryGuard(
    companyId: string | null | undefined,
    input: EmailSendInput,
    options?: EmailContextOptions,
  ): Promise<{ result?: EmailDeliveryResult; dedupeKey: string; control: any; environment: EmailEnvironmentMode }> {
    const ownership = this.resolveOwnership(options);
    const category = this.resolveCategory(options, ownership);
    const dedupeWindowMinutes = Math.max(1, Number(options?.dedupeWindowMinutes || 15));
    const recipient = this.normalizeEmail(input.to);
    const environment = this.environmentMode();
    const control = await this.getOutboundEmailControl();
    const recipientClassification = classifyOutboundRecipient(recipient, environment);
    const dedupeKey = hashContent([
      companyId || 'global',
      ownership,
      category,
      recipient,
      String(input.subject || '').trim(),
      hashContent(String(input.text || '')),
    ].join('|'));

    if (recipientClassification?.suppress) {
      const result = {
        delivered: false,
        status: 'suppressed' as const,
        reason: recipientClassification.reason,
        senderOwnership: ownership as EmailOwnership,
        usedFallback: false,
        notice: null,
      };
      await this.recordEmailEvent({
        companyId,
        userId: options?.actorUserId || null,
        ownership,
        category,
        templateKey: options?.templateKey || null,
        recipient,
        subject: input.subject,
        dedupeKey,
        status: result.status,
        reason: result.reason,
        metaJson: { code: recipientClassification.code },
      });
      return { result, dedupeKey, control, environment };
    }

    const suppression = await this.getActiveRecipientSuppression(companyId, recipient);
    if (suppression?.id) {
      await this.touchSuppression(suppression.id);
      const result = {
        delivered: false,
        status: 'suppressed' as const,
        reason: suppression.reason,
        senderOwnership: ownership as EmailOwnership,
        usedFallback: false,
        notice: null,
      };
      await this.recordEmailEvent({
        companyId,
        userId: options?.actorUserId || null,
        ownership,
        category,
        templateKey: options?.templateKey || null,
        recipient,
        subject: input.subject,
        dedupeKey,
        status: result.status,
        reason: result.reason,
        metaJson: { suppressionCategory: suppression.category, suppressionSource: suppression.source },
      });
      return { result, dedupeKey, control, environment };
    }

    if (control.paused || control.providerSuspended) {
      const reason = control.providerSuspended
        ? control.providerSuspensionReason || 'Outbound email is paused because the provider reported a suspension or reputation issue.'
        : control.pausedReason || 'Outbound email is paused by platform control.';
      const result = {
        delivered: false,
        status: 'paused' as const,
        reason,
        senderOwnership: ownership as EmailOwnership,
        usedFallback: false,
        notice: null,
      };
      await this.recordEmailEvent({
        companyId,
        userId: options?.actorUserId || null,
        ownership,
        category,
        templateKey: options?.templateKey || null,
        recipient,
        subject: input.subject,
        dedupeKey,
        status: result.status,
        reason: result.reason,
      });
      return { result, dedupeKey, control, environment };
    }

    if (!options?.bypassDuplicateSuppression) {
      const recentDuplicate = await this.getRecentMatchingEvent(dedupeKey, dedupeWindowMinutes);
      if (recentDuplicate?.id) {
        const result = {
          delivered: false,
          status: 'deferred' as const,
          reason: 'An identical email was already processed recently, so the duplicate send was suppressed.',
          senderOwnership: ownership as EmailOwnership,
          usedFallback: false,
          notice: null,
        };
        await this.recordEmailEvent({
          companyId,
          userId: options?.actorUserId || null,
          ownership,
          category,
          templateKey: options?.templateKey || null,
          recipient,
          subject: input.subject,
          dedupeKey,
          status: result.status,
          reason: result.reason,
          metaJson: { duplicateOfEventId: recentDuplicate.id },
        });
        return { result, dedupeKey, control, environment };
      }
    }

    if (companyId) {
      const db = this.prisma as any;
      const [tenantHourCount, recipientBurstCount] = await Promise.all([
        db.outboundEmailEvent.count({
          where: {
            companyId,
            createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
            status: { in: ['sent', 'captured', 'failed', 'deferred'] },
          },
        }),
        db.outboundEmailEvent.count({
          where: {
            companyId,
            recipientEmailHash: hashEmailAddress(recipient),
            createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
            status: { in: ['sent', 'captured', 'failed', 'deferred'] },
          },
        }),
      ]);
      if (tenantHourCount >= 120 || recipientBurstCount >= 8) {
        const result = {
          delivered: false,
          status: 'deferred' as const,
          reason: tenantHourCount >= 120
            ? 'Tenant outbound email rate limit reached. Delivery is paused briefly to protect reputation.'
            : 'Recipient burst limit reached. Delivery is paused briefly to prevent repetitive mail.',
          senderOwnership: ownership as EmailOwnership,
          usedFallback: false,
          notice: null,
        };
        await this.recordEmailEvent({
          companyId,
          userId: options?.actorUserId || null,
          ownership,
          category,
          templateKey: options?.templateKey || null,
          recipient,
          subject: input.subject,
          dedupeKey,
          status: result.status,
          reason: result.reason,
          metaJson: { tenantHourCount, recipientBurstCount },
        });
        return { result, dedupeKey, control, environment };
      }
    }

    return { dedupeKey, control, environment };
  }

  private fallbackNotice() {
    return 'Sent by MyTitan because your workspace sending email is not set up.';
  }

  private async getTenantMailPresentation(companyId?: string | null) {
    if (!companyId) {
      return {
        companyName: null,
        logoUrl: null,
        emailSenderName: null,
        emailReplyTo: null,
        smtpHost: null,
        smtpPort: null,
        smtpUsername: null,
        smtpPasswordEncrypted: null,
      } satisfies TenantMailPresentation;
    }
    const tenant = await (this.prisma as any).tenantSetting.findUnique({
      where: { tenantId: companyId },
      select: {
        companyName: true,
        logoUrl: true,
        emailSenderName: true,
        emailReplyTo: true,
        smtpHost: true,
        smtpPort: true,
        smtpUsername: true,
        smtpPasswordEncrypted: true,
      },
    });
    return {
      companyName: tenant?.companyName || null,
      logoUrl: tenant?.logoUrl || null,
      emailSenderName: tenant?.emailSenderName || null,
      emailReplyTo: tenant?.emailReplyTo || null,
      smtpHost: tenant?.smtpHost || null,
      smtpPort: typeof tenant?.smtpPort === 'number' ? tenant.smtpPort : null,
      smtpUsername: tenant?.smtpUsername || null,
      smtpPasswordEncrypted: tenant?.smtpPasswordEncrypted || null,
    };
  }

  private async buildSystemConfig(overrides?: EmailDeliveryOverrides): Promise<EmailConfig> {
    const db = this.prisma as any;
    const vault = await db.platformEmailProviderConfig.findUnique({ where: { id: 'system_email' } }).catch(() => null);
    if (vault?.provider && String(vault.provider).toLowerCase() !== 'env_runtime') {
      const password = this.decryptWorkspacePassword(vault.secretEncrypted);
      const port = Number(vault.port || 587);
      const overrideReplyToEmail = this.normalizeEmail(overrides?.replyToEmail || '');
      const overrideFromName = String(overrides?.fromName || '').replace(/[\r\n"]/g, '').trim();
      return {
        host: String(vault.host || '').trim(),
        port,
        secure: String(vault.tlsMode || '').toLowerCase() === 'ssl' || port === 465,
        user: String(vault.username || '').trim(),
        password,
        fromEmail: this.normalizeEmail(vault.fromEmail || ''),
        fromName: overrideFromName || String(vault.fromName || '').replace(/[\r\n"]/g, '').trim() || null,
        replyToEmail: overrideReplyToEmail || this.normalizeEmail(vault.replyToEmail || '') || null,
        source: 'encrypted_vault',
        provider: String(vault.provider || 'smtp').toLowerCase(),
      };
    }
    const host = this.firstNonEmpty(process.env.SMTP_HOST, process.env.MAIL_HOST);
    const port = Number(this.firstNonEmpty(process.env.SMTP_PORT, process.env.MAIL_PORT) || 587);
    const user = this.firstNonEmpty(process.env.SMTP_USER, process.env.MAIL_USER);
    const password = this.firstNonEmpty(process.env.SMTP_PASSWORD, process.env.SMTP_PASS, process.env.MAIL_PASSWORD);
    const fromEmail = this.normalizeEmail(
      this.firstNonEmpty(
        process.env.SMTP_FROM_EMAIL,
        process.env.SMTP_FROM,
        process.env.MAIL_FROM,
        process.env.EMAIL_FROM,
        process.env.FROM_EMAIL,
        process.env.SYSTEM_EMAIL,
      ),
    );
    const secure = this.isTruthy(this.firstNonEmpty(process.env.SMTP_SECURE)) || port === 465;
    const overrideReplyToEmail = this.normalizeEmail(overrides?.replyToEmail || '');
    const overrideFromName = String(overrides?.fromName || '').replace(/[\r\n"]/g, '').trim();
    const configuredFromName = this.firstNonEmpty(
      process.env.SMTP_FROM_NAME,
      process.env.MAIL_FROM_NAME,
      process.env.EMAIL_FROM_NAME,
      process.env.SYSTEM_EMAIL_NAME,
    );

    return {
      host,
      port,
      secure,
      user,
      password,
      fromEmail,
      fromName: overrideFromName || configuredFromName || (fromEmail ? 'MyTitan' : null),
      replyToEmail: overrideReplyToEmail || this.normalizeEmail(process.env.REPLY_TO_EMAIL || process.env.SUPPORT_EMAIL || '') || null,
      source: host ? 'environment' : 'missing',
      provider: 'smtp',
    };
  }

  private decryptWorkspacePassword(value?: string | null) {
    const input = String(value || '').trim();
    if (!input) return '';
    try {
      return String(decryptText(input) || '').trim();
    } catch {
      return input;
    }
  }

  private buildWorkspaceConfig(tenant: TenantMailPresentation, overrides?: EmailDeliveryOverrides): EmailConfig {
    const host = String(tenant.smtpHost || '').trim();
    const port = Number(tenant.smtpPort || 587);
    const user = String(tenant.smtpUsername || '').trim();
    const password = this.decryptWorkspacePassword(tenant.smtpPasswordEncrypted);
    const overrideReplyToEmail = this.normalizeEmail(overrides?.replyToEmail || '');
    const overrideFromName = String(overrides?.fromName || '').replace(/[\r\n"]/g, '').trim();
    const fromEmail = this.normalizeEmail(user);
    const replyToEmail = overrideReplyToEmail || this.normalizeEmail(tenant.emailReplyTo || '');
    const secure = port === 465 || port === 587;

    return {
      host,
      port,
      secure,
      user,
      password,
      fromEmail,
      fromName: overrideFromName || String(tenant.emailSenderName || '').trim() || null,
      replyToEmail: replyToEmail || null,
      source: host ? 'environment' : 'missing',
    };
  }

  async getBranding(companyId?: string | null, options?: EmailContextOptions): Promise<WorkspaceEmailBranding> {
    const ownership = this.resolveOwnership(options);
    const tenant =
      ownership === 'workspace'
        ? await this.getTenantMailPresentation(companyId)
        : {
            companyName: null,
            logoUrl: null,
            emailSenderName: null,
            emailReplyTo: null,
            smtpHost: null,
            smtpPort: null,
            smtpUsername: null,
            smtpPasswordEncrypted: null,
          };
    return {
      workspaceName: String(tenant.companyName || tenant.emailSenderName || 'MyTitan').trim() || 'MyTitan',
      logoUrl: resolvePublicUrl(tenant.logoUrl, { kind: 'api' }) || null,
      senderName: tenant.emailSenderName || null,
      replyToEmail:
        ownership === 'workspace'
          ? this.normalizeEmail(tenant.emailReplyTo || '') || null
          : this.normalizeEmail(process.env.REPLY_TO_EMAIL || process.env.SUPPORT_EMAIL || '') || null,
    };
  }

  private async getConfig(companyId?: string | null, overrides?: EmailDeliveryOverrides, options?: EmailContextOptions): Promise<EmailConfig> {
    const ownership = this.resolveOwnership(options);
    if (ownership === 'system') {
      return this.buildSystemConfig(overrides);
    }
    const tenant = await this.getTenantMailPresentation(companyId);
    return this.buildWorkspaceConfig(tenant, overrides);
  }

  private async waitForResponse(socket: net.Socket | tls.TLSSocket) {
    return await new Promise<string>((resolve, reject) => {
      let buffer = '';
      const onData = (chunk: Buffer | string) => {
        buffer += String(chunk || '');
        const normalized = buffer.replace(/\r\n/g, '\n');
        const lines = normalized.split('\n').filter(Boolean);
        const lastLine = lines[lines.length - 1] || '';
        if (/^\d{3} /.test(lastLine)) {
          cleanup();
          resolve(normalized.trim());
        }
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onTimeout = () => {
        cleanup();
        reject(new Error('SMTP timeout'));
      };
      const cleanup = () => {
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('timeout', onTimeout);
      };

      socket.on('data', onData);
      socket.once('error', onError);
      socket.once('timeout', onTimeout);
    });
  }

  private async sendCommand(socket: net.Socket | tls.TLSSocket, command: string, expectedPrefixes: string[]) {
    socket.write(`${command}\r\n`);
    const response = await this.waitForResponse(socket);
    const ok = expectedPrefixes.some((prefix) => response.startsWith(prefix));
    if (!ok) {
      throw new SmtpResponseError('SMTP command failed', response);
    }
    return response;
  }

  private async connectSocket(config: EmailConfig) {
    const socket: net.Socket | tls.TLSSocket = config.secure
      ? tls.connect({
          host: config.host,
          port: config.port,
          servername: config.host,
          rejectUnauthorized: true,
        })
      : net.connect({ host: config.host, port: config.port });
    socket.setTimeout(10_000);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('error', reject);
    });
    return socket;
  }

  private async startTls(socket: net.Socket, host: string) {
    return await new Promise<tls.TLSSocket>((resolve, reject) => {
      const tlsSocket = tls.connect(
        {
          socket,
          servername: host,
          rejectUnauthorized: true,
        },
        () => resolve(tlsSocket),
      );
      tlsSocket.once('error', reject);
    });
  }

  private async runSmtpSession(
    config: EmailConfig,
    options?: { probeOnly?: boolean; to?: string; subject?: string; text?: string; html?: string; attachments?: EmailAttachment[] },
  ) {
    let socket = await this.connectSocket(config);
    try {
      const banner = await this.waitForResponse(socket);
      if (!banner.startsWith('220')) {
        throw new SmtpResponseError('SMTP banner invalid', banner);
      }

      const initialEhlo = await this.sendCommand(socket, 'EHLO mytitan.co.uk', ['250']);
      const supportsStartTls = /\bSTARTTLS\b/i.test(initialEhlo);
      if (!config.secure && supportsStartTls) {
        await this.sendCommand(socket, 'STARTTLS', ['220']);
        socket = await this.startTls(socket as net.Socket, config.host);
        socket.setTimeout(10_000);
        await this.sendCommand(socket, 'EHLO mytitan.co.uk', ['250']);
      } else if (!config.secure && this.isTruthy(process.env.SMTP_SECURE || '') && !supportsStartTls) {
        throw new Error('SMTP TLS upgrade unavailable');
      }

      if ((config.user && !config.password) || (!config.user && config.password)) {
        throw new Error('SMTP credentials incomplete');
      }
      if (config.user && config.password) {
        await this.sendCommand(socket, 'AUTH LOGIN', ['334']);
        await this.sendCommand(socket, Buffer.from(config.user).toString('base64'), ['334']);
        await this.sendCommand(socket, Buffer.from(config.password).toString('base64'), ['235']);
      }

      if (options?.probeOnly) {
        await this.sendCommand(socket, 'QUIT', ['221']);
        socket.end();
        return;
      }

      await this.sendCommand(socket, `MAIL FROM:<${config.fromEmail}>`, ['250']);
      await this.sendCommand(socket, `RCPT TO:<${String(options?.to || '').trim()}>`, ['250', '251']);
      await this.sendCommand(socket, 'DATA', ['354']);
      const body = [
        `From: ${this.formatMailbox(config.fromEmail, config.fromName)}`,
        `To: ${String(options?.to || '').trim()}`,
        `Subject: ${String(options?.subject || '').replace(/[\r\n]/g, ' ').trim()}`,
        ...(config.replyToEmail ? [`Reply-To: ${config.replyToEmail}`] : []),
        ...this.buildMimeBody(options),
      ].join('\r\n');
      socket.write(`${body}\r\n`);
      const dataResponse = await this.waitForResponse(socket);
      if (!dataResponse.startsWith('250')) {
        throw new SmtpResponseError('SMTP DATA failed', dataResponse);
      }
      await this.sendCommand(socket, 'QUIT', ['221']);
      socket.end();
    } catch (error) {
      socket.end();
      throw error;
    }
  }

  private dotStuff(value: string) {
    return String(value || '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => (line.startsWith('.') ? `.${line}` : line))
      .join('\r\n');
  }

  private wrapBase64(value: string) {
    return String(value || '').replace(/\s+/g, '').match(/.{1,76}/g)?.join('\r\n') || '';
  }

  private buildMimeBody(options?: { text?: string; html?: string; attachments?: EmailAttachment[] }) {
    const text = this.dotStuff(String(options?.text || '').trim());
    const html = String(options?.html || '').trim();
    const attachments = this.normalizeAttachments(options?.attachments);
    if (attachments.length) {
      const mixedBoundary = `mytitan_mixed_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const alternativeBoundary = `mytitan_alt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const body = [
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
        '',
        `--${mixedBoundary}`,
        html ? `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"` : 'Content-Type: text/plain; charset=utf-8',
        ...(html ? [
          '',
          `--${alternativeBoundary}`,
          'Content-Type: text/plain; charset=utf-8',
          'Content-Transfer-Encoding: 8bit',
          '',
          text,
          `--${alternativeBoundary}`,
          'Content-Type: text/html; charset=utf-8',
          'Content-Transfer-Encoding: 8bit',
          '',
          this.dotStuff(html),
          `--${alternativeBoundary}--`,
        ] : [
          'Content-Transfer-Encoding: 8bit',
          '',
          text,
        ]),
      ];
      for (const attachment of attachments) {
        body.push(
          `--${mixedBoundary}`,
          `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
          'Content-Transfer-Encoding: base64',
          `Content-Disposition: attachment; filename="${attachment.filename}"`,
          '',
          this.wrapBase64(attachment.contentBase64),
        );
      }
      body.push(`--${mixedBoundary}--`, '.');
      return body;
    }
    if (!html) {
      return [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        text,
        '.',
      ];
    }

    const htmlBody = this.dotStuff(html);
    const boundary = `mytitan_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return [
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      text,
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      htmlBody,
      `--${boundary}--`,
      '.',
    ];
  }

  async getReadiness(companyId?: string | null, options?: { probe?: boolean; ownership?: EmailOwnership }): Promise<EmailReadiness> {
    const ownership = this.resolveOwnership(options);
    const config = await this.getConfig(companyId, undefined, options);
    const mode = this.environmentMode();
    const allowLiveSmtp = this.allowLiveSmtp(mode);
    const control = await this.getOutboundEmailControl();
    const dnsRecords = [
      'Publish SPF for your sending domain.',
      'Enable DKIM signing with your mail provider.',
      'Add a DMARC policy so mailbox providers can trust your mail.',
    ];

    if (!config.host) {
      return {
        status: 'not_configured',
        source: 'missing',
        transport: 'none',
        canSend: false,
        fromEmail: null,
        fromName: config.fromName,
        replyToEmail: config.replyToEmail,
        guidance:
          ownership === 'workspace'
            ? 'Customer email is not set up yet. Add your sending email in Settings.'
            : 'Configure Email Provider in Platform Admin Infrastructure.',
        dnsRecords,
        environment: mode,
      };
    }

    if (
      !config.fromEmail ||
      (ownership === 'system' && !config.fromName) ||
      !config.port ||
      ((config.user && !config.password) || (!config.user && config.password))
    ) {
      const missingSenderSetup = ownership === 'workspace' || (ownership === 'system' && (!config.fromEmail || !config.fromName));
      return {
        status: missingSenderSetup ? 'not_configured' : 'misconfigured',
        source: missingSenderSetup ? 'missing' : config.source,
        transport: 'smtp',
        canSend: false,
        fromEmail: config.fromEmail || null,
        fromName: config.fromName,
        replyToEmail: config.replyToEmail,
        guidance:
          ownership === 'workspace'
            ? 'Customer email is not set up yet. Add your sending email in Settings.'
            : missingSenderSetup
              ? 'Configure Email Provider in Platform Admin Infrastructure.'
              : 'Email delivery is partially configured. Complete the SMTP host, sender email, sender name, and matching credential fields on the server, then retry.',
        dnsRecords,
        environment: mode,
      };
    }

    if (control.paused || control.providerSuspended) {
      return {
        status: 'failing',
        source: config.source,
        transport: allowLiveSmtp ? 'smtp' : 'capture',
        canSend: false,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        replyToEmail: config.replyToEmail,
        guidance: control.providerSuspended
          ? control.providerSuspensionReason || 'Outbound email is paused because the provider reported a suspension or reputation issue.'
          : control.pausedReason || 'Outbound email is paused by platform control.',
        dnsRecords,
        environment: mode,
      };
    }

    if (!allowLiveSmtp) {
      return {
        status: 'safe_capture',
        source: 'safe_capture',
        transport: 'capture',
        canSend: true,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        replyToEmail: config.replyToEmail,
        guidance: 'External SMTP is blocked in this environment. Outbound email is captured safely and never sent to a real provider.',
        dnsRecords,
        environment: mode,
      };
    }

    if (options?.probe) {
      try {
        await this.runSmtpSession(config, { probeOnly: true });
      } catch {
        return {
          status: 'failing',
          source: config.source,
          transport: 'smtp',
          canSend: false,
          fromEmail: config.fromEmail,
          fromName: config.fromName,
          replyToEmail: config.replyToEmail,
          guidance: 'SMTP is configured but the server could not complete a safe connection. Check credentials, TLS mode, firewall rules, and provider-side domain setup.',
          dnsRecords,
          environment: mode,
        };
      }
    }

    return {
      status: 'ready',
      source: config.source,
      transport: 'smtp',
      canSend: true,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      replyToEmail: config.replyToEmail,
      guidance: 'Email delivery is ready. Keep SPF, DKIM, and DMARC aligned with the sending domain for production deliverability.',
      dnsRecords,
      environment: mode,
    };
  }

  async getOperationalReadiness(companyId: string, options?: { probe?: boolean }): Promise<OperationalEmailReadiness> {
    const [workspace, fallback] = await Promise.all([
      this.getReadiness(companyId, { probe: options?.probe, ownership: 'workspace' }),
      this.getReadiness(null, { probe: options?.probe, ownership: 'system' }),
    ]);

    if (workspace.canSend) {
      return {
        workspace,
        fallback,
        effective: {
          ...workspace,
          senderOwnership: 'workspace',
          usingFallback: false,
          notice: null,
          guidance: 'Customer emails will use your workspace sending email.',
        },
      };
    }

    if (fallback.canSend) {
      return {
        workspace,
        fallback,
        effective: {
          ...fallback,
          senderOwnership: 'system',
          usingFallback: true,
          notice: this.fallbackNotice(),
          guidance: 'Customer emails can be sent by MyTitan until you add your own sending email.',
        },
      };
    }

    return {
      workspace,
      fallback,
      effective: {
        ...workspace,
        status: workspace.status === 'failing' || fallback.status === 'failing' ? 'failing' : workspace.status,
        canSend: false,
        fromEmail: null,
        fromName: null,
        replyToEmail: workspace.replyToEmail || fallback.replyToEmail,
        senderOwnership: 'none',
        usingFallback: false,
        notice: null,
        guidance:
          workspace.status === 'ready'
            ? 'Customer email is unavailable right now. Check MyTitan system email.'
            : fallback.canSend
              ? 'Customer emails can be sent by MyTitan until you add your own sending email.'
              : 'Customer email is unavailable right now. Add your sending email in Settings or contact support about MyTitan email readiness.',
      },
    };
  }

  async sendTransactionalEmail(
    companyId: string | null | undefined,
    input: EmailSendInput,
    options?: EmailContextOptions,
  ): Promise<EmailDeliveryResult> {
    const ownership = this.resolveOwnership(options);
    const category = this.resolveCategory(options, ownership);
    const actionHref = ownership === 'workspace' ? '/dashboard/settings?tab=messages' : undefined;
    if (this.isFixtureCaptureAddress(input.to)) {
      await this.recordEmailEvent({
        companyId,
        userId: options?.actorUserId || null,
        ownership,
        category,
        templateKey: options?.templateKey || null,
        recipient: input.to,
        subject: input.subject,
        status: 'captured',
        reason: 'Captured for E2E fixture delivery.',
        metaJson: { attachmentCount: this.normalizeAttachments(input.attachments).length },
      });
      return {
        delivered: true,
        status: 'captured',
        reason: 'captured_for_e2e',
        senderOwnership: ownership,
        usedFallback: false,
        notice: 'Captured for E2E fixture delivery.',
        attachmentCapability: this.normalizeAttachments(input.attachments).length ? 'safe_capture' : undefined,
        attachmentCount: this.normalizeAttachments(input.attachments).length || undefined,
      };
    }

    const guard = await this.evaluateDeliveryGuard(companyId, input, options);
    if (guard.result) {
      return {
        ...guard.result,
        actionHref,
      };
    }

    const readiness = await this.getReadiness(companyId, { ownership });
    if (readiness.status === 'not_configured') {
      await this.recordEmailEvent({
        companyId,
        userId: options?.actorUserId || null,
        ownership,
        category,
        templateKey: options?.templateKey || null,
        recipient: input.to,
        subject: input.subject,
        dedupeKey: guard.dedupeKey,
        status: 'not_configured',
        reason:
          ownership === 'workspace'
            ? 'Customer email is not set up yet. Add your sending email in Settings.'
            : 'MyTitan email is not set up yet. Configure Email Provider in Platform Admin Infrastructure.',
        metaJson: {
          transport: readiness.transport,
          source: readiness.source,
          canSend: readiness.canSend,
        },
      });
      return {
        delivered: false,
        status: 'not_configured',
        reason:
          ownership === 'workspace'
            ? 'Customer email is not set up yet. Add your sending email in Settings.'
            : 'MyTitan email is not set up yet. Configure Email Provider in Platform Admin Infrastructure.',
        actionHref,
      };
    }
    if (readiness.status === 'misconfigured') {
      await this.recordEmailEvent({
        companyId,
        userId: options?.actorUserId || null,
        ownership,
        category,
        templateKey: options?.templateKey || null,
        recipient: input.to,
        subject: input.subject,
        dedupeKey: guard.dedupeKey,
        status: 'misconfigured',
        reason:
          ownership === 'workspace'
            ? 'Customer email is not set up yet. Add your sending email in Settings.'
            : 'MyTitan email is only partially configured on the server.',
        metaJson: {
          transport: readiness.transport,
          source: readiness.source,
          canSend: readiness.canSend,
        },
      });
      return {
        delivered: false,
        status: 'misconfigured',
        reason:
          ownership === 'workspace'
            ? 'Customer email is not set up yet. Add your sending email in Settings.'
            : 'MyTitan email is only partially configured on the server.',
        actionHref,
      };
    }
    if (readiness.status === 'safe_capture') {
      await this.recordEmailEvent({
        companyId,
        userId: options?.actorUserId || null,
        ownership,
        category,
        templateKey: options?.templateKey || null,
        recipient: input.to,
        subject: input.subject,
        dedupeKey: guard.dedupeKey,
        status: 'captured',
        reason: 'Captured safely because live SMTP is disabled in this environment.',
        metaJson: { attachmentCount: this.normalizeAttachments(input.attachments).length },
      });
      return {
        delivered: true,
        status: 'captured',
        reason: 'captured_safe_mode',
        actionHref,
        senderOwnership: ownership,
        usedFallback: false,
        notice: 'Captured locally because live SMTP is disabled in this environment.',
        attachmentCapability: this.normalizeAttachments(input.attachments).length ? 'safe_capture' : undefined,
        attachmentCount: this.normalizeAttachments(input.attachments).length || undefined,
      };
    }

    try {
      const config = await this.getConfig(companyId, {
        fromName: input.fromName,
        replyToEmail: input.replyToEmail,
      }, { ownership });
      await this.runSmtpSession(config, {
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        attachments: input.attachments,
      });
      await this.recordEmailEvent({
        companyId,
        userId: options?.actorUserId || null,
        ownership,
        category,
        templateKey: options?.templateKey || null,
        recipient: input.to,
        subject: input.subject,
        dedupeKey: guard.dedupeKey,
        status: 'sent',
        reason: 'sent',
        metaJson: { attachmentCount: this.normalizeAttachments(input.attachments).length },
      });
      return {
        delivered: true,
        status: 'sent',
        reason: 'sent',
        senderOwnership: ownership,
        usedFallback: false,
        notice: null,
        attachmentCapability: this.normalizeAttachments(input.attachments).length ? 'supported' : undefined,
        attachmentCount: this.normalizeAttachments(input.attachments).length || undefined,
      };
    } catch (error) {
      const failure = classifyProviderFailure(error);
      if (failure.suppressionCategory) {
        await this.createRecipientSuppression({
          companyId,
          email: input.to,
          reason: failure.reason,
          category: failure.suppressionCategory,
          source: 'smtp_failure',
          createdByUserId: options?.actorUserId || null,
          expiresAt: failure.permanent ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000),
          metaJson: { providerCode: failure.providerCode },
        });
      }
      if (failure.pauseSending) {
        const db = this.prisma as any;
        await db.outboundEmailControl.update({
          where: { id: 'global' },
          data: {
            paused: true,
            providerSuspended: true,
            providerSuspensionReason: failure.reason,
            providerSuspendedAt: new Date(),
          },
        });
      }
      await this.recordEmailEvent({
        companyId,
        userId: options?.actorUserId || null,
        ownership,
        category,
        templateKey: options?.templateKey || null,
        recipient: input.to,
        subject: input.subject,
        dedupeKey: guard.dedupeKey,
        status: failure.temporary ? 'deferred' : 'failed',
        reason: failure.reason,
        providerCode: failure.providerCode || null,
        responseSummary: error instanceof SmtpResponseError ? error.response : error instanceof Error ? error.message : String(error || ''),
      });
      return {
        delivered: false,
        status: failure.temporary ? 'deferred' : 'failed',
        reason: failure.reason,
        actionHref,
        senderOwnership: ownership,
        usedFallback: false,
        notice: null,
      };
    }
  }

  async sendOperationalEmail(companyId: string, input: EmailSendInput, options?: Omit<EmailContextOptions, 'ownership'>): Promise<EmailDeliveryResult> {
    const readiness = await this.getOperationalReadiness(companyId);
    if (readiness.effective.senderOwnership === 'workspace') {
      const result = await this.sendTransactionalEmail(companyId, input, { ...(options || {}), ownership: 'workspace' });
      return {
        ...result,
        senderOwnership: 'workspace',
        usedFallback: false,
        notice: null,
      };
    }

    if (readiness.effective.senderOwnership === 'system') {
      const result = await this.sendTransactionalEmail(
        null,
        {
          ...input,
          fromName: null,
        },
        { ...(options || {}), ownership: 'system' },
      );
      return {
        ...result,
        senderOwnership: 'system',
        usedFallback: true,
        notice: this.fallbackNotice(),
        actionHref: result.actionHref || '/dashboard/settings?tab=messages',
      };
    }

    return {
      delivered: false,
      status: 'not_configured',
      reason: 'Customer email delivery is unavailable because neither the workspace sender nor MyTitan fallback is ready.',
      actionHref: '/dashboard/settings?tab=messages',
      senderOwnership: undefined,
      usedFallback: false,
      notice: null,
    };
  }

  async sendSystemOperationalEmail(input: EmailSendInput, options?: Omit<EmailContextOptions, 'ownership'>): Promise<EmailDeliveryResult> {
    const result = await this.sendTransactionalEmail(
      null,
      {
        ...input,
        fromName: null,
      },
      { ...(options || {}), ownership: 'system' },
    );
    return {
      ...result,
      senderOwnership: 'system',
      usedFallback: false,
      notice: null,
    };
  }

  async getPlatformEmailSafetyOverview() {
    const db = this.prisma as any;
    const [control, systemReadiness, recentEvents, recentFailures, suppressions] = await Promise.all([
      this.getOutboundEmailControl(),
      this.getReadiness(null, { ownership: 'system', probe: this.allowLiveSmtp() }),
      db.outboundEmailEvent.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        orderBy: { createdAt: 'desc' },
        take: 80,
      }),
      db.outboundEmailEvent.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          status: { in: ['failed', 'deferred', 'paused', 'suppressed'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      db.outboundEmailSuppression.findMany({
        where: {
          status: 'active',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 20,
      }),
    ]);
    const config = await this.getPlatformEmailProviderConfig();

    const countStatus = (statuses: string[]) => recentEvents.filter((row: any) => statuses.includes(String(row.status || ''))).length;
    const delivered = countStatus(['sent', 'captured']);
    const deferred = countStatus(['deferred']);
    const failed = countStatus(['failed']);
    const suppressed = countStatus(['suppressed', 'paused']);
    const complaintCount = suppressions.filter((row: any) => row.category === 'complaint').length;
    const bounceCount = suppressions.filter((row: any) => ['bounce', 'invalid_recipient'].includes(String(row.category || ''))).length;
    const deliverabilityDenominator = Math.max(1, delivered + failed + deferred);

    return {
      control: {
        paused: Boolean(control.paused),
        pausedReason: control.pausedReason || null,
        pausedAt: control.pausedAt || null,
        providerSuspended: Boolean(control.providerSuspended),
        providerSuspensionReason: control.providerSuspensionReason || null,
        providerSuspendedAt: control.providerSuspendedAt || null,
      },
      environment: {
        mode: this.environmentMode(),
        liveSmtpAllowed: this.allowLiveSmtp(),
        productionOnlySenderEnforced: !this.allowLiveSmtp(),
        captureOnly: !this.allowLiveSmtp(),
      },
      sender: {
        readiness: systemReadiness,
        replyToValid: Boolean(systemReadiness.replyToEmail),
        senderIdentityVerified: ['1', 'true', 'yes', 'on'].includes(String(process.env.MYTITAN_EMAIL_SENDER_IDENTITY_VERIFIED || '').trim().toLowerCase()),
      },
      config,
      domainAlignment: {
        spf: String(process.env.MYTITAN_EMAIL_SPF_STATUS || '').trim() || 'unknown',
        dkim: String(process.env.MYTITAN_EMAIL_DKIM_STATUS || '').trim() || 'unknown',
        dmarc: String(process.env.MYTITAN_EMAIL_DMARC_STATUS || '').trim() || 'unknown',
        warmup: String(process.env.MYTITAN_EMAIL_WARMUP_STATUS || '').trim() || 'unknown',
      },
      health: {
        sentLast24h: delivered,
        deferredLast24h: deferred,
        failedLast24h: failed,
        blockedLast24h: suppressed,
        bounceRate: Number(((bounceCount / deliverabilityDenominator) * 100).toFixed(2)),
        complaintRate: Number(((complaintCount / deliverabilityDenominator) * 100).toFixed(2)),
        activeSuppressions: suppressions.length,
        recentProviderResponses: recentFailures.map((row: any) => ({
          id: row.id,
          createdAt: row.createdAt,
          status: row.status,
          category: row.category,
          recipientMasked: row.recipientMasked,
          responseSummary: row.responseSummary || row.reason,
          providerCode: row.providerCode || null,
        })),
      },
      suppressions: suppressions.map((row: any) => ({
        id: row.id,
        emailMasked: maskEmailAddress(row.email),
        category: row.category,
        reason: row.reason,
        source: row.source,
        expiresAt: row.expiresAt || null,
        hitCount: Number(row.hitCount || 0),
        lastMatchedAt: row.lastMatchedAt || null,
      })),
    };
  }

  async updatePlatformEmailControl(input: { action: 'pause' | 'resume'; reason?: string | null; userId?: string | null }) {
    const db = this.prisma as any;
    const current = await this.getOutboundEmailControl();
    const action = input.action === 'pause' ? 'pause' : 'resume';
    const next = await db.outboundEmailControl.update({
      where: { id: current.id },
      data:
        action === 'pause'
          ? {
              paused: true,
              pausedReason: String(input.reason || '').trim() || 'Paused by platform admin.',
              pausedAt: new Date(),
              pausedByUserId: input.userId || null,
            }
          : {
              paused: false,
              pausedReason: null,
              pausedAt: null,
              pausedByUserId: input.userId || null,
              providerSuspended: false,
              providerSuspensionReason: null,
              providerSuspendedAt: null,
            },
    });
    return {
      ok: true,
      paused: Boolean(next.paused),
      providerSuspended: Boolean(next.providerSuspended),
      reason: next.pausedReason || next.providerSuspensionReason || null,
    };
  }

  async getPlatformEmailProviderConfig() {
    const db = this.prisma as any;
    const row = await db.platformEmailProviderConfig.findUnique({ where: { id: 'system_email' } }).catch(() => null);
    const envHost = this.firstNonEmpty(process.env.SMTP_HOST, process.env.MAIL_HOST);
    const envUser = this.firstNonEmpty(process.env.SMTP_USER, process.env.MAIL_USER);
    const envSecret = this.firstNonEmpty(process.env.SMTP_PASSWORD, process.env.SMTP_PASS, process.env.MAIL_PASSWORD);
    const envFromEmail = this.normalizeEmail(this.firstNonEmpty(process.env.SMTP_FROM_EMAIL, process.env.SMTP_FROM, process.env.MAIL_FROM, process.env.EMAIL_FROM, process.env.FROM_EMAIL, process.env.SYSTEM_EMAIL));
    const source = row?.provider && String(row.provider).toLowerCase() !== 'env_runtime'
      ? 'encrypted_vault'
      : envHost
        ? 'runtime_environment'
        : 'missing';
    return {
      provider: row?.provider || (envHost ? 'smtp' : 'env_runtime'),
      source,
      editable: source !== 'runtime_environment',
      host: row?.host || (source === 'runtime_environment' ? envHost : null),
      port: row?.port || (source === 'runtime_environment' ? Number(this.firstNonEmpty(process.env.SMTP_PORT, process.env.MAIL_PORT) || 587) : null),
      tlsMode: row?.tlsMode || (source === 'runtime_environment' && String(process.env.SMTP_SECURE || '').trim() === 'true' ? 'ssl' : 'starttls'),
      usernamePresent: Boolean(row?.username || envUser),
      secret: {
        present: Boolean(row?.secretEncrypted || envSecret),
        lastFour: row?.secretLastFour || (envSecret ? envSecret.slice(-4) : null),
        source,
      },
      fromEmail: row?.fromEmail || (source === 'runtime_environment' ? envFromEmail : null),
      fromName: row?.fromName || (source === 'runtime_environment' ? this.firstNonEmpty(process.env.SMTP_FROM_NAME, process.env.MAIL_FROM_NAME, process.env.EMAIL_FROM_NAME, process.env.SYSTEM_EMAIL_NAME) : null),
      replyToEmail: row?.replyToEmail || (source === 'runtime_environment' ? this.normalizeEmail(process.env.REPLY_TO_EMAIL || process.env.SUPPORT_EMAIL || '') || null : null),
      operatorTestRecipient: row?.operatorTestRecipient || null,
      spfStatus: row?.spfStatus || String(process.env.MYTITAN_EMAIL_SPF_STATUS || '').trim() || 'unknown',
      dkimStatus: row?.dkimStatus || String(process.env.MYTITAN_EMAIL_DKIM_STATUS || '').trim() || 'unknown',
      dmarcStatus: row?.dmarcStatus || String(process.env.MYTITAN_EMAIL_DMARC_STATUS || '').trim() || 'unknown',
      evidence: row?.evidence || null,
      verificationStatus: row?.verificationStatus || (envHost ? 'runtime_environment' : 'missing'),
      verifiedAt: row?.verifiedAt || null,
      failureReason: row?.failureReason || null,
      lastChecked: row?.updatedAt || null,
      owner: 'Platform operations',
      nextAction: row || envHost ? 'Verify provider readiness and send an operator test email.' : 'Configure Email Provider.',
      secretsReturned: false,
    };
  }

  async savePlatformEmailProviderConfig(input: Record<string, any> & { actorUserId?: string | null }) {
    const provider = String(input.provider || 'smtp').trim().toLowerCase();
    const allowedProviders = new Set(['smtp', 'resend', 'postmark', 'ses', 'sendgrid', 'mailgun', 'env_runtime']);
    if (!allowedProviders.has(provider)) throw new BadRequestException('Unsupported email provider.');
    const secret = String(input.secret || input.password || input.apiKey || '').trim();
    const port = input.port === undefined || input.port === null || input.port === '' ? null : Number(input.port);
    const fromEmail = this.normalizeEmail(input.fromEmail || '');
    if (provider !== 'env_runtime' && !fromEmail) throw new BadRequestException('From Email is required.');
    const data: any = {
      id: 'system_email',
      provider,
      host: String(input.host || '').trim() || null,
      port,
      tlsMode: ['none', 'starttls', 'ssl'].includes(String(input.tlsMode || '').toLowerCase()) ? String(input.tlsMode).toLowerCase() : 'starttls',
      username: String(input.username || '').trim() || null,
      fromEmail: fromEmail || null,
      fromName: String(input.fromName || '').replace(/[\r\n"]/g, '').trim() || null,
      replyToEmail: this.normalizeEmail(input.replyToEmail || '') || null,
      operatorTestRecipient: this.normalizeEmail(input.operatorTestRecipient || '') || null,
      spfStatus: String(input.spfStatus || 'unknown').trim().toLowerCase() || 'unknown',
      dkimStatus: String(input.dkimStatus || 'unknown').trim().toLowerCase() || 'unknown',
      dmarcStatus: String(input.dmarcStatus || 'unknown').trim().toLowerCase() || 'unknown',
      evidence: String(input.evidence || '').trim().slice(0, 1000) || null,
      verificationStatus: 'needs_verification',
      failureReason: null,
      updatedByUserId: input.actorUserId || null,
    };
    if (secret) {
      data.secretEncrypted = encryptText(secret);
      data.secretLastFour = secret.slice(-4);
    }
    if (provider === 'env_runtime') {
      data.host = null;
      data.port = null;
      data.username = null;
      data.secretEncrypted = null;
      data.secretLastFour = null;
      data.fromEmail = null;
      data.fromName = null;
      data.replyToEmail = null;
      data.operatorTestRecipient = null;
      data.evidence = null;
      data.verificationStatus = 'missing';
    }
    const db = this.prisma as any;
    await db.platformEmailProviderConfig.upsert({
      where: { id: 'system_email' },
      create: data,
      update: data,
    });
    return this.getPlatformEmailProviderConfig();
  }

  async verifyPlatformEmailProviderConfig(input: { actorUserId?: string | null }) {
    const db = this.prisma as any;
    const readiness = await this.getReadiness(null, { ownership: 'system', probe: this.allowLiveSmtp() });
    const ok = readiness.status === 'ready' || readiness.status === 'safe_capture';
    await db.platformEmailProviderConfig.update({
      where: { id: 'system_email' },
      data: {
        verificationStatus: ok ? 'verified' : readiness.status,
        verifiedAt: ok ? new Date() : null,
        failureReason: ok ? null : readiness.guidance,
        updatedByUserId: input.actorUserId || null,
      },
    }).catch(() => undefined);
    return { ok, readiness, config: await this.getPlatformEmailProviderConfig() };
  }
}
