import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AutomationsService } from '../automations/automations.service';
import {
  getCustomerFeedbackSettings,
  getInternalNotificationSettings,
  getOperationalAlertSettings,
  getSummaryEmailSettings,
  type InternalNotificationCategory,
  type OperationalAlertCategory,
  getServiceRecordEmailSettings,
  type SummaryEmailCadence,
  type SummaryEmailSection,
} from '../common/business-config';
import { buildCustomerOutputPresentation, resolveCustomerOutputFields } from '../common/customer-fields';
import { classifyNonRoutableRecipientEmail } from '../common/email-recipient-hygiene';
import { buildJobCompletionEmailLines, buildJobCompletionOverview, buildServiceRecordEmailContent } from '../common/job-completion-output';
import { buildAppUrl, getApiPublicUrl, getAppPublicUrl } from '../common/public-url';
import { EmailDeliveryResult, EmailService } from '../email/email.service';
import {
  buildServiceRecordEmailTemplate,
  buildTrialEndingSoonEmailTemplate,
  buildTrialExpiredEmailTemplate,
  buildTrialFinalReminderEmailTemplate,
  buildTrialStartedEmailTemplate,
} from '../email/email-templates';
import { isAutomationsV1Enabled, isNotificationsV1Enabled } from '../common/feature-flags';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNotificationPreferenceDto } from './dto';

type NotificationInput = {
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  metaJson?: Record<string, any>;
};

type InAppNotificationPriority = 'info' | 'success' | 'attention' | 'urgent';
type InAppNotificationCategory =
  | 'jobs'
  | 'bookings'
  | 'customers'
  | 'payments'
  | 'integrations'
  | 'email'
  | 'templates'
  | 'team'
  | 'platform';

type TrialLifecycleStage = 'trial_started' | 'trial_ending_soon' | 'trial_final_reminder' | 'trial_expired';
type TrialLifecycleCandidate = {
  stage: TrialLifecycleStage;
  reasonKey: TrialLifecycleStage;
  idempotencyKey: string;
  title: string;
  summary: string;
  daysRemaining: number;
  startedAt: string;
  endsAt: string;
};

type NotificationEmailOverrides = {
  fromName?: string | null;
  replyToEmail?: string | null;
};

type NotificationEmailOptions = {
  suppressFailureAlert?: boolean;
  category?: string;
  templateKey?: string;
  actorUserId?: string | null;
};

type NotificationDeliveryStatus = 'sent' | 'queued' | 'skipped_no_recipient' | 'unavailable_sender' | 'failed';

type OperationalAlertSeverity = 'info' | 'warning' | 'critical';
type SupportRequestCategory = 'support' | 'billing' | 'integrations' | 'bug_report' | 'feature_request' | 'onboarding';

type WorkspaceSummaryDispatchInput = {
  companyId: string;
  actorUserId: string;
  cadence: SummaryEmailCadence;
  dryRun?: boolean;
  asOf?: Date;
};

type WorkspaceSummaryRecipient = {
  email: string;
  source: 'owner_admin' | 'internal_routing';
  categories: InternalNotificationCategory[];
};

type OperationalAlertRecipient = {
  email: string;
  source: 'owner_admin' | 'workspace_extra' | 'platform_critical_copy';
};

type OperationalAlertRecipientBundle = {
  workspaceName: string;
  ownerAdminRecipients: string[];
  extraRecipients: string[];
  platformRecipients: string[];
  recipients: OperationalAlertRecipient[];
  enabledCategories: OperationalAlertCategory[];
  opsCategory: OperationalAlertCategory;
  platformCriticalCopiesEnabled: boolean;
};

type SupportRequestInput = {
  category: SupportRequestCategory;
  subject: string;
  message: string;
  requesterEmail: string;
  requesterName?: string | null;
  companyId?: string | null;
  userId?: string | null;
  companyName?: string | null;
  route: 'marketing' | 'workspace';
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly automations: AutomationsService,
    private readonly email: EmailService,
  ) {}

  async sendIssuedInvoice(input: {
    companyId: string;
    actorUserId: string;
    to: string;
    invoiceNumber: string;
    customerName: string;
    amountLabel: string;
    dueDateLabel: string;
    jobId: string;
    businessLines?: string[];
  }) {
    const result = await this.email.sendOperationalEmail(input.companyId, {
      to: input.to,
      subject: `Invoice ${input.invoiceNumber}`,
      text: [
        `Hello ${input.customerName},`,
        '',
        `Invoice ${input.invoiceNumber}`,
        `Amount: ${input.amountLabel}`,
        `Due: ${input.dueDateLabel}`,
        ...(input.businessLines?.length ? ['', ...input.businessLines] : []),
        '',
        'Please contact the business if you have any questions.',
      ].join('\n'),
    }, {
      category: 'invoice',
      templateKey: `invoice:${input.jobId}`,
      actorUserId: input.actorUserId,
      dedupeWindowMinutes: 2,
    });
    await this.audit.log(input.companyId, 'billing.invoice.send', `Invoice ${input.invoiceNumber} email ${result.status}`, input.actorUserId);
    return result;
  }

  async sendAccountStatement(input: {
    companyId: string;
    actorUserId: string;
    to: string;
    reference: string;
    accountName: string;
    balanceLabel: string;
    pdf: Buffer;
  }) {
    const result = await this.email.sendOperationalEmail(input.companyId, {
      to: input.to,
      subject: `Account statement ${input.reference}`,
      text: [
        `Hello ${input.accountName},`,
        '',
        `Your account statement ${input.reference} is attached.`,
        `Open balance: ${input.balanceLabel}`,
      ].join('\n'),
      attachments: [{
        filename: `${input.reference}.pdf`,
        contentBase64: input.pdf.toString('base64'),
        contentType: 'application/pdf',
        sizeBytes: input.pdf.length,
      }],
    }, {
      category: 'statement',
      templateKey: `statement:${input.reference}`,
      actorUserId: input.actorUserId,
      dedupeWindowMinutes: 2,
    });
    await this.audit.log(input.companyId, 'billing.statement.send', `Statement ${input.reference} email ${result.status}`, input.actorUserId);
    return result;
  }

  async sendTradePortalInvite(input: {
    companyId: string;
    actorUserId: string;
    to: string;
    accountName: string;
    inviteUrl: string;
  }) {
    const result = await this.email.sendOperationalEmail(input.companyId, {
      to: input.to,
      subject: `Your ${input.accountName} trade portal`,
      text: [
        `Your secure trade portal for ${input.accountName} is ready.`,
        '',
        `Open portal: ${input.inviteUrl}`,
        '',
        'This link expires in 7 days. Contact the business if you need a new invitation.',
      ].join('\n'),
    }, {
      category: 'trade_portal',
      templateKey: `trade-portal:${input.to.toLowerCase()}`,
      actorUserId: input.actorUserId,
      dedupeWindowMinutes: 2,
    });
    await this.audit.log(input.companyId, 'trade.portal.invite_email', `Trade portal invite email ${result.status}`, input.actorUserId);
    return result;
  }

  private resolveTrackingSecret() {
    const value = String(process.env.EMAIL_TRACKING_SECRET || process.env.JWT_SECRET || '').trim();
    return value || 'dev_insecure_click_tracking';
  }

  private buildTrackingKey() {
    return crypto.createHash('sha256').update(this.resolveTrackingSecret()).digest();
  }

  private buildStableTrackedNotificationId(companyId: string, seed: string) {
    const digest = crypto.createHash('sha256').update(`${companyId}:${seed}`).digest('hex');
    return `trk_${digest.slice(0, 28)}`;
  }

  private normalizeEmail(value?: string | null) {
    const normalized = String(value || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
  }

  private sanitizeSupportField(value: unknown, maxLength: number) {
    return String(value || '')
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  private supportCategoryLabel(category: SupportRequestCategory) {
    switch (category) {
      case 'billing':
        return 'Billing';
      case 'integrations':
        return 'Integrations';
      case 'bug_report':
        return 'Bug report';
      case 'feature_request':
        return 'Feature request';
      case 'onboarding':
        return 'Onboarding';
      case 'support':
      default:
        return 'Support';
    }
  }

  private normalizeEmailList(values: unknown) {
    const source = Array.isArray(values)
      ? values
      : typeof values === 'string'
        ? values.split(',')
        : [];
    return Array.from(
      new Set(
        source
          .map((value) => this.normalizeEmail(String(value || '')))
          .filter(Boolean)
          .filter((email) => !classifyNonRoutableRecipientEmail(email)),
      ),
    );
  }

  private isReservedSystemEmail(value?: string | null) {
    const email = this.normalizeEmail(value || '');
    if (!email) return false;
    const reserved = new Set(
      [
        process.env.SUPPORT_EMAIL,
        process.env.SYSTEM_EMAIL,
        process.env.SMTP_FROM_EMAIL,
        process.env.SMTP_FROM,
        process.env.EMAIL_FROM,
        'support@mytitan.co.uk',
      ]
        .map((entry) => this.normalizeEmail(entry || ''))
        .filter(Boolean),
    );
    return reserved.has(email);
  }

  private normalizeDeliverableEmail(value?: string | null, options?: { allowReservedSystemAddress?: boolean }) {
    const email = this.normalizeEmail(value || '');
    if (!email || classifyNonRoutableRecipientEmail(email)) return null;
    if (!options?.allowReservedSystemAddress && this.isReservedSystemEmail(email)) return null;
    return email;
  }

  private rememberRecipient(target: Map<string, Set<string>>, emailValue: unknown, source: string) {
    const email = this.normalizeDeliverableEmail(String(emailValue || ''));
    if (!email) return;
    if (!target.has(email)) {
      target.set(email, new Set<string>());
    }
    target.get(email)?.add(source);
  }

  private pickFirstRecipient(candidates: Array<{ email?: string | null; source: string }>) {
    for (const candidate of candidates) {
      const email = this.normalizeDeliverableEmail(candidate.email || '');
      if (email) {
        return { email, source: candidate.source };
      }
    }
    return null;
  }

  private summarizeRecipients(target: Map<string, Set<string>>) {
    const sourceCounts = new Map<string, number>();
    for (const sources of target.values()) {
      for (const source of sources) {
        sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
      }
    }
    const detail = Array.from(sourceCounts.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([source, count]) => `${source}:${count}`)
      .join(', ');
    return `recipient_count=${target.size}${detail ? ` | sources=${detail}` : ''}`;
  }

  private mapNotificationDeliveryStatus(result: EmailDeliveryResult | { delivered: false; status: 'skipped'; reason: string }) {
    if (result.status === 'sent') return 'sent' satisfies NotificationDeliveryStatus;
    if (result.status === 'skipped' || result.status === 'suppressed') return 'queued' as NotificationDeliveryStatus;
    if (result.status === 'not_configured' || result.status === 'misconfigured') return 'unavailable_sender' satisfies NotificationDeliveryStatus;
    return 'failed' satisfies NotificationDeliveryStatus;
  }

  async getActiveAssignedUserEmail(companyId: string, userId?: string | null) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return null;
    const db = this.prisma as any;
    const user = await db.user.findFirst({
      where: {
        id: normalizedUserId,
        companyId,
        isActive: true,
        emailVerified: true,
      },
      select: { email: true },
    });
    return this.normalizeDeliverableEmail(user?.email || '');
  }

  private resolveJobCustomerRecipients(job: any, purpose: 'general' | 'billing' = 'general') {
    const profile = resolveCustomerOutputFields({
      job,
      tradeAccount: job?.tradeAccount || null,
      customer: job?.customer || null,
      formData: (job?.formData || {}) as Record<string, any>,
    });
    const billingEmail = this.normalizeDeliverableEmail(profile.mergeFields.billingEmail || null);
    const primaryEmail = this.normalizeDeliverableEmail(profile.primaryContact.email || null);
    const selected =
      purpose === 'billing'
        ? this.pickFirstRecipient([
            { email: billingEmail, source: 'customer_billing_contact' },
            { email: primaryEmail, source: 'customer_primary_contact' },
          ])
        : this.pickFirstRecipient([
            { email: primaryEmail, source: 'customer_primary_contact' },
            { email: billingEmail, source: 'customer_billing_contact' },
          ]);
    return {
      profile,
      selected,
    };
  }

  private resolveBookingCustomerRecipient(booking: any, purpose: 'general' | 'billing' = 'general') {
    const tradeAccount = booking?.tradeAccount || {};
    return (
      (purpose === 'billing'
        ? this.pickFirstRecipient([
            { email: tradeAccount.billingEmail, source: 'trade_billing_contact' },
            { email: booking?.customerEmail, source: 'booking_customer_email' },
            { email: tradeAccount.contactEmail, source: 'trade_primary_contact' },
          ])
        : this.pickFirstRecipient([
            { email: booking?.customerEmail, source: 'booking_customer_email' },
            { email: tradeAccount.contactEmail, source: 'trade_primary_contact' },
            { email: tradeAccount.billingEmail, source: 'trade_billing_contact' },
          ])) || null
    );
  }

  private mapReasonKeyToOperationalAlertCategory(reasonKey: string): OperationalAlertCategory {
    const normalized = String(reasonKey || '').trim().toLowerCase();
    if (normalized.includes('summary')) return 'failed_summary_dispatch';
    if (normalized.includes('refund')) return 'failed_refund';
    if (normalized.includes('webhook')) return 'failed_webhook';
    if (normalized.includes('backup') || normalized.includes('restore')) return 'failed_backup';
    if (normalized.includes('booking')) return 'failed_booking';
    if (normalized.includes('payment') || normalized.includes('deposit')) return 'failed_payment';
    if (normalized.includes('health')) return 'health_degraded';
    return 'failed_email';
  }

  private sanitizeOperationalAlertLine(value: unknown) {
    return String(value || '')
      .replace(/https?:\/\/\S+/gi, '[redacted-url]')
      .replace(/\b(sk|rk|whsec)_[a-z0-9_]+\b/gi, '[redacted-secret]')
      .replace(/\b(cs|pi|ch|re|evt|sub|cus|in|price)_[a-z0-9_]+\b/gi, '[redacted-reference]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);
  }

  private readPlatformOpsAlertRecipients() {
    return this.normalizeEmailList(
      process.env.MYTITAN_OPS_ALERT_RECIPIENTS ||
      process.env.OPS_ALERT_RECIPIENTS ||
      '',
    );
  }

  private readPlatformCriticalOpsCopiesEnabled() {
    return ['1', 'true', 'yes', 'on'].includes(
      String(
        process.env.MYTITAN_OPS_ALERT_INCLUDE_PLATFORM_CRITICAL_COPIES ||
        process.env.OPS_ALERT_INCLUDE_PLATFORM_CRITICAL_COPIES ||
        '',
      )
        .trim()
        .toLowerCase(),
    );
  }

  private async getActiveOperationalAlertUsers(companyId: string) {
    const db = this.prisma as any;
    return db.user.findMany({
      where: {
        companyId,
        role: { in: ['OWNER', 'ADMIN'] },
        isActive: true,
        emailVerified: true,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, role: true },
    });
  }

  private async getExternalOperationalAlertRecipients(companyId: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({
      where: { tenantId: companyId },
      select: { businessConfigJson: true, companyName: true },
    });
    const workspace = getOperationalAlertSettings(settings);
    return {
      workspaceName: String(settings?.companyName || '').trim() || 'MyTitan',
      workspaceRecipients: workspace.externalEmailRecipients,
      enabledCategories: workspace.enabledCategories,
      platformRecipients: this.readPlatformOpsAlertRecipients(),
    };
  }

  private async resolveOperationalAlertRecipients(
    companyId: string,
    opsCategory: OperationalAlertCategory,
    severity: OperationalAlertSeverity,
  ): Promise<OperationalAlertRecipientBundle> {
    const [config, ownersAndAdmins] = await Promise.all([
      this.getExternalOperationalAlertRecipients(companyId),
      this.getActiveOperationalAlertUsers(companyId),
    ]);

    const ownerAdminRecipients = ownersAndAdmins
      .map((user: { email?: string | null }) => this.normalizeEmail(user?.email || ''))
      .filter((email) => Boolean(email) && !classifyNonRoutableRecipientEmail(email));
    const extraRecipients = config.enabledCategories.includes(opsCategory) ? config.workspaceRecipients : [];
    const platformCriticalCopiesEnabled = this.readPlatformCriticalOpsCopiesEnabled();
    const shouldIncludePlatformRecipients =
      platformCriticalCopiesEnabled &&
      severity === 'critical' &&
      opsCategory === 'health_degraded';
    const platformRecipients = shouldIncludePlatformRecipients ? config.platformRecipients : [];
    const recipients = new Map<string, OperationalAlertRecipient>();

    for (const email of ownerAdminRecipients) {
      recipients.set(email, { email, source: 'owner_admin' });
    }
    for (const email of extraRecipients) {
      if (!recipients.has(email)) {
        recipients.set(email, { email, source: 'workspace_extra' });
      }
    }
    for (const email of platformRecipients) {
      if (!recipients.has(email)) {
        recipients.set(email, { email, source: 'platform_critical_copy' });
      }
    }

    return {
      workspaceName: config.workspaceName,
      ownerAdminRecipients: Array.from(new Set(ownerAdminRecipients)),
      extraRecipients: Array.from(new Set(extraRecipients)),
      platformRecipients: Array.from(new Set(platformRecipients)),
      recipients: Array.from(recipients.values()),
      enabledCategories: config.enabledCategories,
      opsCategory,
      platformCriticalCopiesEnabled,
    };
  }

  private buildExternalOperationalAlertEmail(input: {
    workspaceName: string;
    companyId: string;
    opsCategory: OperationalAlertCategory;
    severity: OperationalAlertSeverity;
    title: string;
    reasonKey: string;
    recommendedAction?: string | null;
  }) {
    const timestamp = new Date().toISOString();
    const subject = `MyTitan ops alert: ${this.sanitizeOperationalAlertLine(input.title) || 'Operational alert'}`;
    const lines = [
      'MyTitan detected an operational issue that needs attention.',
      `Workspace: ${this.sanitizeOperationalAlertLine(input.workspaceName)}`,
      `Tenant: ${this.sanitizeOperationalAlertLine(input.companyId)}`,
      `Category: ${input.opsCategory}`,
      `Severity: ${input.severity}`,
      `Event: ${this.sanitizeOperationalAlertLine(input.reasonKey) || 'operational_alert'}`,
      `Time: ${timestamp}`,
      `Recommended action: ${this.sanitizeOperationalAlertLine(input.recommendedAction || 'Review workspace notifications, billing state, and delivery health before taking follow-up action.')}`,
    ];
    return {
      subject,
      text: lines.join('\n'),
    };
  }

  private deriveUserDisplayName(user: any) {
    const explicitName = String(user?.name || '').trim();
    if (explicitName) return explicitName;
    const email = this.normalizeEmail(user?.email || '');
    if (!email) return null;
    const localPart = email.split('@', 1)[0] || '';
    const cleaned = localPart.replace(/[._-]+/g, ' ').trim();
    return cleaned ? cleaned.replace(/\b\w/g, (value) => value.toUpperCase()) : email;
  }

  private buildOperationalEmailIdentity(input: {
    workspaceName?: string | null;
    workspaceSenderName?: string | null;
    workspaceReplyToEmail?: string | null;
    actorUser?: any;
  }) {
    const workspaceName = String(input.workspaceName || '').trim();
    const workspaceSenderName = String(input.workspaceSenderName || '').trim() || null;
    const actorName = this.deriveUserDisplayName(input.actorUser);
    const actorReplyToEmail = this.normalizeEmail(input.actorUser?.email || '') || null;

    return {
      senderName:
        actorName && workspaceName
          ? `${actorName} at ${workspaceName}`
          : actorName || workspaceSenderName || workspaceName || null,
      replyToEmail: actorReplyToEmail || this.normalizeEmail(input.workspaceReplyToEmail || '') || null,
    };
  }

  private encryptTrackingDestination(destination: string) {
    const normalized = String(destination || '').trim();
    if (!normalized) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.buildTrackingKey(), iv);
    const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64url');
  }

  private decryptTrackingDestination(value?: string | null) {
    const encoded = String(value || '').trim();
    if (!encoded) return null;
    try {
      const input = Buffer.from(encoded, 'base64url');
      const iv = input.subarray(0, 12);
      const tag = input.subarray(12, 28);
      const encrypted = input.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.buildTrackingKey(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }

  private buildTrackedClickId(notificationId: string, expiresAt: Date) {
    const payload = Buffer.from(
      JSON.stringify({
        n: String(notificationId || '').trim(),
        e: expiresAt.toISOString(),
      }),
      'utf8',
    ).toString('base64url');
    const signature = crypto.createHmac('sha256', this.resolveTrackingSecret()).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  private parseTrackedClickId(value?: string | null) {
    const encoded = String(value || '').trim();
    const [payload, signature] = encoded.split('.');
    if (!payload || !signature) return null;
    const expected = crypto.createHmac('sha256', this.resolveTrackingSecret()).update(payload).digest('base64url');
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return null;
    }

    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      const notificationId = String(parsed?.n || '').trim();
      const expiresAt = new Date(String(parsed?.e || ''));
      if (!notificationId || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        return null;
      }
      return { notificationId };
    } catch {
      return null;
    }
  }

  private sanitizePreviewLines(lines: string[]) {
    return (Array.isArray(lines) ? lines : [])
      .map((line) => {
        const text = String(line || '').trim();
        if (!text) return '';
        if (/^customer portal:/i.test(text)) return 'Customer portal: [redacted link]';
        if (/^service record pdf:/i.test(text)) return 'Service record PDF: [redacted link]';
        return text.replace(/https?:\/\/\S+/gi, '[redacted link]');
      })
      .filter(Boolean);
  }

  private sanitizeNotificationContext(context: Record<string, any> | null | undefined) {
    if (!context || typeof context !== 'object') return context;
    const { ctaCiphertext, ctaHref, ...safeContext } = context;
    return safeContext;
  }

  private sanitizeStoredTrackingContext(context: Record<string, any> | null | undefined) {
    if (!context || typeof context !== 'object') return context;
    const { ctaHref, ...safeContext } = context;
    return safeContext;
  }

  private readonly summarySectionCategoryMap: Record<SummaryEmailSection, InternalNotificationCategory> = {
    bookings: 'bookings',
    jobs: 'jobs',
    payments: 'payments',
    failed_sends: 'workspace_alerts',
    upcoming_work: 'jobs',
    tax_reminders: 'workspace_alerts',
  };

  private startOfUtcDay(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private startOfUtcMonth(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  private startOfUtcQuarter(date: Date) {
    const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3;
    return new Date(Date.UTC(date.getUTCFullYear(), quarterMonth, 1));
  }

  private startOfUtcYear(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  }

  private formatCurrencyAmount(currency: string, amountCents: number) {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: String(currency || 'GBP').toUpperCase(),
    }).format(Math.max(0, Number(amountCents || 0)) / 100);
  }

  private formatSummaryDate(date: Date) {
    return new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }

  private resolveSummaryWindow(cadence: SummaryEmailCadence, rawAsOf?: Date) {
    const asOf = rawAsOf && !Number.isNaN(rawAsOf.getTime()) ? rawAsOf : new Date();
    const periodEnd = asOf;
    let periodStart = this.startOfUtcDay(asOf);
    let label = 'Daily';

    if (cadence === 'weekly') {
      periodStart = new Date(this.startOfUtcDay(asOf).getTime() - 6 * 24 * 60 * 60 * 1000);
      label = 'Weekly';
    } else if (cadence === 'monthly') {
      periodStart = this.startOfUtcMonth(asOf);
      label = 'Monthly';
    } else if (cadence === 'quarterly') {
      periodStart = this.startOfUtcQuarter(asOf);
      label = 'Quarterly';
    } else if (cadence === 'annual') {
      periodStart = this.startOfUtcYear(asOf);
      label = 'Annual';
    }

    const upcomingWorkEnd = new Date(periodEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
    const periodKey = `${cadence}:${periodStart.toISOString().slice(0, 10)}:${periodEnd.toISOString().slice(0, 10)}`;
    return {
      cadence,
      label,
      periodStart,
      periodEnd,
      periodKey,
      upcomingWorkEnd,
      dateLabel: `${this.formatSummaryDate(periodStart)} to ${this.formatSummaryDate(periodEnd)}`,
    };
  }

  private summarizeBillingActivities(activities: any[]) {
    const summary = {
      refundRecordedCents: 0,
      refundPendingCents: 0,
      adjustmentCreditCents: 0,
      adjustmentDebitCents: 0,
    };

    for (const activity of activities || []) {
      const payloadJson = activity?.payloadJson || {};
      const type = String(payloadJson?.type || '').trim();
      const amountCents = Math.max(0, Number(payloadJson?.amountCents || 0));
      if (!type || !amountCents) continue;
      if (type === 'refund') {
        if (String(payloadJson?.status || '').trim() === 'pending') {
          summary.refundPendingCents += amountCents;
        } else {
          summary.refundRecordedCents += amountCents;
        }
      }
      if (type === 'adjustment') {
        const direction = String(payloadJson?.direction || '').trim();
        if (direction === 'credit') summary.adjustmentCreditCents += amountCents;
        if (direction === 'debit') summary.adjustmentDebitCents += amountCents;
      }
    }

    return summary;
  }

  private async getSummaryRecipients(
    companyId: string,
    enabledSections: SummaryEmailSection[],
  ): Promise<{ workspaceName: string; recipients: WorkspaceSummaryRecipient[] }> {
    const db = this.prisma as any;
    const [settings, ownersAndAdmins] = await Promise.all([
      db.tenantSetting.findUnique({
        where: { tenantId: companyId },
        select: { companyName: true, businessConfigJson: true, emailNotificationRecipients: true },
      }),
      this.getActiveOperationalAlertUsers(companyId),
    ]);
    const requiredCategories = Array.from(
      new Set(enabledSections.map((section) => this.summarySectionCategoryMap[section])),
    );
    const recipients = new Map<string, WorkspaceSummaryRecipient>();

    for (const user of ownersAndAdmins) {
      const email = this.normalizeEmail(user?.email || '');
      if (!email || classifyNonRoutableRecipientEmail(email)) continue;
      recipients.set(email, {
        email,
        source: 'owner_admin',
        categories: requiredCategories,
      });
    }

    const internalSettings = getInternalNotificationSettings(settings);
    for (const recipient of internalSettings.internalRecipients) {
      if (!recipient.enabled) continue;
      const email = this.normalizeEmail(recipient.email);
      if (!email) continue;
      const matches = recipient.categories.filter((category) => requiredCategories.includes(category));
      if (!matches.length) continue;
      const existing = recipients.get(email);
      recipients.set(email, {
        email,
        source: existing?.source || 'internal_routing',
        categories: Array.from(new Set([...(existing?.categories || []), ...matches])),
      });
    }

    return {
      workspaceName: String(settings?.companyName || '').trim() || 'MyTitan',
      recipients: Array.from(recipients.values()),
    };
  }

  private buildSummaryEmailContent(input: {
    workspaceName: string;
    cadenceLabel: string;
    dateLabel: string;
    sections: SummaryEmailSection[];
    data: {
      bookings: { created: number; confirmed: number; cancelled: number; tradeWaivedDeposit: number };
      jobs: { completed: number; active: number; archived: number };
      payments: {
        owedByCurrency: Array<{ currency: string; amountCents: number }>;
        paidByCurrency: Array<{ currency: string; amountCents: number }>;
        refundedByCurrency: Array<{ currency: string; amountCents: number }>;
        adjustedByCurrency: Array<{ currency: string; creditCents: number; debitCents: number }>;
      };
      failedSends: { count: number };
      upcomingWork: { bookings: number; jobs: number };
      tax: { configured: boolean; vatNumber: string | null; reminder: string };
    };
  }) {
    const lines = [
      `${input.workspaceName} ${input.cadenceLabel.toLowerCase()} summary`,
      `Period: ${input.dateLabel}`,
      '',
    ];
    const htmlSections: string[] = [
      `<p><strong>${input.workspaceName} ${input.cadenceLabel.toLowerCase()} summary</strong><br/>Period: ${input.dateLabel}</p>`,
    ];

    if (input.sections.includes('bookings')) {
      lines.push(
        `Bookings: ${input.data.bookings.created} created, ${input.data.bookings.confirmed} confirmed, ${input.data.bookings.cancelled} cancelled, ${input.data.bookings.tradeWaivedDeposit} trade bookings without deposit.`,
      );
      htmlSections.push(
        `<p><strong>Bookings</strong><br/>${input.data.bookings.created} created, ${input.data.bookings.confirmed} confirmed, ${input.data.bookings.cancelled} cancelled, ${input.data.bookings.tradeWaivedDeposit} trade bookings without deposit.</p>`,
      );
    }

    if (input.sections.includes('jobs')) {
      lines.push(`Jobs: ${input.data.jobs.completed} completed, ${input.data.jobs.active} active, ${input.data.jobs.archived} archived.`);
      htmlSections.push(
        `<p><strong>Jobs</strong><br/>${input.data.jobs.completed} completed, ${input.data.jobs.active} active, ${input.data.jobs.archived} archived.</p>`,
      );
    }

    if (input.sections.includes('payments')) {
      const owed = input.data.payments.owedByCurrency.map((entry) => `${this.formatCurrencyAmount(entry.currency, entry.amountCents)} owed`).join(', ') || 'No outstanding balance';
      const paid = input.data.payments.paidByCurrency.map((entry) => `${this.formatCurrencyAmount(entry.currency, entry.amountCents)} paid`).join(', ') || 'No payments recorded';
      const refunded = input.data.payments.refundedByCurrency.map((entry) => `${this.formatCurrencyAmount(entry.currency, entry.amountCents)} refunded`).join(', ') || 'No refunds recorded';
      const adjusted =
        input.data.payments.adjustedByCurrency
          .map((entry) => `${entry.currency} credit ${this.formatCurrencyAmount(entry.currency, entry.creditCents)}, debit ${this.formatCurrencyAmount(entry.currency, entry.debitCents)}`)
          .join(', ') || 'No adjustments recorded';
      lines.push(`Payments: ${owed}. ${paid}. ${refunded}. Adjustments: ${adjusted}.`);
      htmlSections.push(
        `<p><strong>Payments</strong><br/>${owed}.<br/>${paid}.<br/>${refunded}.<br/>Adjustments: ${adjusted}.</p>`,
      );
    }

    if (input.sections.includes('failed_sends')) {
      lines.push(`Failed sends: ${input.data.failedSends.count}.`);
      htmlSections.push(`<p><strong>Failed sends</strong><br/>${input.data.failedSends.count} failed outbound emails in this period.</p>`);
    }

    if (input.sections.includes('upcoming_work')) {
      lines.push(`Upcoming work: ${input.data.upcomingWork.bookings} bookings and ${input.data.upcomingWork.jobs} scheduled jobs in the next 7 days.`);
      htmlSections.push(
        `<p><strong>Upcoming work</strong><br/>${input.data.upcomingWork.bookings} bookings and ${input.data.upcomingWork.jobs} scheduled jobs in the next 7 days.</p>`,
      );
    }

    if (input.sections.includes('tax_reminders')) {
      lines.push(`VAT / tax reminder: ${input.data.tax.reminder}`);
      htmlSections.push(`<p><strong>VAT / tax reminder</strong><br/>${input.data.tax.reminder}</p>`);
    }

    lines.push('', 'MyTitan sends summary emails from the system sender. Review records with your finance or tax adviser where needed.');
    htmlSections.push(
      '<p>MyTitan sends summary emails from the system sender. Review records with your finance or tax adviser where needed.</p>',
    );

    return {
      subject: `${input.workspaceName} ${input.cadenceLabel} summary`,
      text: lines.join('\n'),
      html: htmlSections.join(''),
    };
  }

  private async buildWorkspaceSummaryData(
    companyId: string,
    cadence: SummaryEmailCadence,
    asOf?: Date,
  ) {
    const db = this.prisma as any;
    const window = this.resolveSummaryWindow(cadence, asOf);
    const [settings, bookings, jobs, billingActivities, failedSends] = await Promise.all([
      db.tenantSetting.findUnique({
        where: { tenantId: companyId },
        select: {
          companyName: true,
          defaultCurrency: true,
          vatEnabledDefault: true,
          businessConfigJson: true,
        },
      }),
      db.booking.findMany({
        where: {
          companyId,
          createdAt: { gte: window.periodStart, lte: window.periodEnd },
        },
        select: {
          id: true,
          status: true,
          tradeAccountId: true,
          paymentStateJson: true,
        },
      }),
      db.job.findMany({
        where: {
          companyId,
          OR: [
            { createdAt: { gte: window.periodStart, lte: window.periodEnd } },
            { completedAt: { gte: window.periodStart, lte: window.periodEnd } },
            { invoicePaidAt: { gte: window.periodStart, lte: window.periodEnd } },
            { invoiceIssuedAt: { not: null } },
            { scheduledAt: { gte: window.periodEnd, lte: window.upcomingWorkEnd } },
          ],
        },
        select: {
          id: true,
          jobRef: true,
          status: true,
          totalCents: true,
          currency: true,
          invoiceIssuedAt: true,
          invoicePaidAt: true,
          invoiceDueAt: true,
          taxCents: true,
          scheduledAt: true,
          archivedAt: true,
        },
      }),
      db.jobActivity.findMany({
        where: {
          companyId,
          createdAt: { gte: window.periodStart, lte: window.periodEnd },
          eventType: {
            in: ['billing.refund.recorded', 'billing.adjustment.recorded'],
          },
        },
        select: {
          jobId: true,
          payloadJson: true,
          createdAt: true,
        },
      }),
      db.notification.count({
        where: {
          companyId,
          createdAt: { gte: window.periodStart, lte: window.periodEnd },
          OR: [
            { metaJson: { path: ['status'], equals: 'failed' } },
            { metaJson: { path: ['context', 'deliveryStatus'], equals: 'failed' } },
          ],
        },
      }),
    ]);

    const financeConfig = settings?.businessConfigJson && typeof settings.businessConfigJson === 'object'
      ? (settings.businessConfigJson as any).finance || {}
      : {};
    const activitiesByJobId = new Map<string, any[]>();
    for (const activity of billingActivities) {
      const bucket = activitiesByJobId.get(activity.jobId) || [];
      bucket.push(activity);
      activitiesByJobId.set(activity.jobId, bucket);
    }

    const owedByCurrency = new Map<string, number>();
    const paidByCurrency = new Map<string, number>();
    const refundedByCurrency = new Map<string, number>();
    const adjustedByCurrency = new Map<string, { creditCents: number; debitCents: number }>();

    for (const job of jobs) {
      const currency = String(job.currency || settings?.defaultCurrency || 'GBP').toUpperCase();
      const activitySummary = this.summarizeBillingActivities(activitiesByJobId.get(job.id) || []);
      const effectiveGrossCents = Math.max(0, Number(job.totalCents || 0) + activitySummary.adjustmentDebitCents - activitySummary.adjustmentCreditCents);
      const paidCents = job.invoicePaidAt ? Math.max(0, Number(job.totalCents || 0) - activitySummary.refundRecordedCents) : 0;
      const unpaidCents =
        job.invoiceIssuedAt && !job.invoicePaidAt
          ? effectiveGrossCents
          : job.invoicePaidAt
            ? Math.max(0, effectiveGrossCents - paidCents)
            : 0;

      if (unpaidCents > 0) {
        owedByCurrency.set(currency, (owedByCurrency.get(currency) || 0) + unpaidCents);
      }
      if (job.invoicePaidAt && job.invoicePaidAt >= window.periodStart && job.invoicePaidAt <= window.periodEnd) {
        paidByCurrency.set(currency, (paidByCurrency.get(currency) || 0) + paidCents);
      }
      if (activitySummary.refundRecordedCents > 0) {
        refundedByCurrency.set(currency, (refundedByCurrency.get(currency) || 0) + activitySummary.refundRecordedCents);
      }
      if (activitySummary.adjustmentCreditCents > 0 || activitySummary.adjustmentDebitCents > 0) {
        const current = adjustedByCurrency.get(currency) || { creditCents: 0, debitCents: 0 };
        current.creditCents += activitySummary.adjustmentCreditCents;
        current.debitCents += activitySummary.adjustmentDebitCents;
        adjustedByCurrency.set(currency, current);
      }
    }

    return {
      window,
      workspaceName: String(settings?.companyName || '').trim() || 'MyTitan',
      settings,
      summarySettings: getSummaryEmailSettings(settings),
      data: {
        bookings: {
          created: bookings.length,
          confirmed: bookings.filter((booking: any) => booking.status === 'CONFIRMED').length,
          cancelled: bookings.filter((booking: any) => booking.status === 'CANCELLED').length,
          tradeWaivedDeposit: bookings.filter((booking: any) => {
            const paymentStateJson = booking.paymentStateJson && typeof booking.paymentStateJson === 'object' ? booking.paymentStateJson : {};
            return Boolean(booking.tradeAccountId) && paymentStateJson?.depositRequired === false;
          }).length,
        },
        jobs: {
          completed: jobs.filter((job: any) => job.completedAt && job.completedAt >= window.periodStart && job.completedAt <= window.periodEnd).length,
          active: jobs.filter((job: any) => ['OPEN', 'SCHEDULED', 'IN_PROGRESS'].includes(String(job.status || ''))).length,
          archived: jobs.filter((job: any) => Boolean(job.archivedAt)).length,
        },
        payments: {
          owedByCurrency: Array.from(owedByCurrency.entries()).map(([currency, amountCents]) => ({ currency, amountCents })),
          paidByCurrency: Array.from(paidByCurrency.entries()).map(([currency, amountCents]) => ({ currency, amountCents })),
          refundedByCurrency: Array.from(refundedByCurrency.entries()).map(([currency, amountCents]) => ({ currency, amountCents })),
          adjustedByCurrency: Array.from(adjustedByCurrency.entries()).map(([currency, totals]) => ({ currency, ...totals })),
        },
        failedSends: {
          count: failedSends,
        },
        upcomingWork: {
          bookings: await db.booking.count({
            where: {
              companyId,
              startsAt: { gt: window.periodEnd, lte: window.upcomingWorkEnd },
              status: { in: ['PENDING', 'PLANNED', 'CONFIRMED', 'IN_PROGRESS'] },
            },
          }),
          jobs: jobs.filter((job: any) => job.scheduledAt && job.scheduledAt > window.periodEnd && job.scheduledAt <= window.upcomingWorkEnd).length,
        },
        tax: {
          configured: Boolean(settings?.vatEnabledDefault && String(financeConfig.vatNumber || '').trim()),
          vatNumber: String(financeConfig.vatNumber || '').trim() || null,
          reminder:
            settings?.vatEnabledDefault
              ? String(financeConfig.vatNumber || '').trim()
                ? `VAT tracking is configured${String(financeConfig.vatNumber || '').trim() ? ` for ${String(financeConfig.vatNumber).trim()}` : ''}. This is record support only, not filing advice.`
                : 'VAT is enabled but the VAT number is still missing in Settings.'
              : 'VAT is not configured. Add it in Settings before relying on VAT summaries.',
        },
      },
    };
  }

  async getSummaryEmailReadiness(companyId: string) {
    const db = this.prisma as any;
    const [settings, systemReadiness, workspace] = await Promise.all([
      db.tenantSetting.findUnique({
        where: { tenantId: companyId },
        select: { companyName: true, businessConfigJson: true, emailNotificationRecipients: true },
      }),
      this.email.getReadiness(null, { ownership: 'system', probe: true }),
      this.getSummaryRecipients(companyId, getSummaryEmailSettings(await db.tenantSetting.findUnique({
        where: { tenantId: companyId },
        select: { businessConfigJson: true, emailNotificationRecipients: true, companyName: true },
      })).enabledSections),
    ]);

    return {
      workspaceName: String(settings?.companyName || '').trim() || 'MyTitan',
      sender: systemReadiness,
      settings: getSummaryEmailSettings(settings),
      recipientCount: workspace.recipients.length,
      runtimeNote: 'Schedule `npm run summary:dispatch -- <cadence>` in your runtime to send summaries automatically. MyTitan will not send them on its own until you wire that scheduler.',
      dispatchCommand: 'npm run summary:dispatch -- <cadence>',
    };
  }

  async dispatchWorkspaceSummary(input: WorkspaceSummaryDispatchInput) {
    const asOf = input.asOf && !Number.isNaN(input.asOf.getTime()) ? input.asOf : new Date();
    const compiled = await this.buildWorkspaceSummaryData(input.companyId, input.cadence, asOf);
    const summarySettings = compiled.summarySettings;
    const senderReadiness = await this.email.getReadiness(null, { ownership: 'system' });
    const recipientsBundle = await this.getSummaryRecipients(input.companyId, summarySettings.enabledSections);
    const emailBody = this.buildSummaryEmailContent({
      workspaceName: compiled.workspaceName,
      cadenceLabel: compiled.window.label,
      dateLabel: compiled.window.dateLabel,
      sections: summarySettings.enabledSections,
      data: compiled.data,
    });

    if (!summarySettings.enabled) {
      return {
        ok: true,
        enabled: false,
        cadence: input.cadence,
        dryRun: input.dryRun === true,
        sender: senderReadiness,
        recipients: recipientsBundle.recipients.map((recipient) => ({
          email: recipient.email,
          source: recipient.source,
          categories: recipient.categories,
          delivered: false,
          status: 'disabled',
          reason: 'Summary emails are turned off in Settings.',
        })),
        preview: {
          subject: emailBody.subject,
          text: emailBody.text,
          sections: summarySettings.enabledSections,
          window: compiled.window,
          data: compiled.data,
        },
        runtimeNote: 'Schedule `npm run summary:dispatch -- <cadence>` in your runtime to send summaries automatically. MyTitan will not send them on its own until you wire that scheduler.',
      };
    }

    const deliveries: Array<Record<string, any>> = [];
    let deliveredCount = 0;
    for (const recipient of recipientsBundle.recipients) {
      const idempotencyKey = `workspace_summary:${input.cadence}:${compiled.window.periodKey}:${recipient.email}`;
      if (input.dryRun) {
        deliveries.push({
          email: recipient.email,
          source: recipient.source,
          categories: recipient.categories,
          delivered: false,
          status: 'preview',
          reason: 'Preview only',
        });
        continue;
      }

      const existing = await (this.prisma as any).notification.findFirst({
        where: { companyId: input.companyId, idempotencyKey },
      });
      if (existing?.metaJson?.status === 'sent') {
        deliveries.push({
          email: recipient.email,
          source: recipient.source,
          categories: recipient.categories,
          delivered: false,
          status: 'already_sent',
          reason: 'Summary already sent for this period.',
        });
        continue;
      }

      const tracking = await this.prepareTrackedEmailNotification({
        companyId: input.companyId,
        userId: input.actorUserId,
        type: 'workspace_summary_email',
        title: `${compiled.window.label} summary pending`,
        body: 'Workspace summary email is being prepared for delivery.',
        entityType: 'tenant',
        entityId: input.companyId,
        idempotencyKey,
        reasonKey: `workspace_summary_${input.cadence}`,
        to: recipient.email,
        summary: `${compiled.window.label} summary for ${compiled.workspaceName}`,
        stableSeed: idempotencyKey,
        context: {
          cadence: input.cadence,
          sections: summarySettings.enabledSections,
          periodKey: compiled.window.periodKey,
          scheduledFor: asOf.toISOString(),
        },
      });
      const delivery = await this.email.sendTransactionalEmail(
        null,
        {
          to: recipient.email,
          subject: emailBody.subject,
          text: emailBody.text,
          html: emailBody.html,
        },
        {
          ownership: 'system',
          category: 'summary_email',
          templateKey: 'workspace_summary_email',
          actorUserId: input.actorUserId,
          dedupeWindowMinutes: 60,
        },
      );
      await this.finalizeTrackedEmailNotification(tracking.id, delivery, {
        title: delivery.delivered ? `${compiled.window.label} summary sent` : `${compiled.window.label} summary pending`,
        body: delivery.delivered
          ? `${compiled.window.label} summary sent to ${recipient.email}.`
          : 'Workspace summary email was not delivered in this environment.',
      });
      deliveries.push({
        email: recipient.email,
        source: recipient.source,
        categories: recipient.categories,
        delivered: delivery.delivered,
        status: delivery.status,
        reason: delivery.reason,
      });
      if (delivery.delivered) deliveredCount += 1;
    }

    if (!input.dryRun && deliveredCount > 0) {
      const db = this.prisma as any;
      const settings = await db.tenantSetting.findUnique({ where: { tenantId: input.companyId } });
      const currentBusinessConfig = settings?.businessConfigJson && typeof settings.businessConfigJson === 'object'
        ? settings.businessConfigJson
        : {};
      const nextSummary = getSummaryEmailSettings(settings);
      nextSummary.lastDispatchedAtByCadence = {
        ...nextSummary.lastDispatchedAtByCadence,
        [input.cadence]: asOf.toISOString(),
      };
      await db.tenantSetting.update({
        where: { tenantId: input.companyId },
        data: {
          businessConfigJson: {
            ...currentBusinessConfig,
            summaryEmails: nextSummary,
          },
        },
      });
    }

    await this.audit.log(
      input.companyId,
      'notification.summary.dispatch',
      `${compiled.window.label} summary ${input.dryRun ? 'previewed' : 'processed'} for ${deliveries.length} recipients`,
      input.actorUserId,
    );

    const failedDeliveries = deliveries.filter((delivery) => !delivery.delivered && !['preview', 'already_sent'].includes(String(delivery.status || '')));
    if (!input.dryRun && failedDeliveries.length > 0) {
      await this.notifyOperationalAlert({
        companyId: input.companyId,
        category: 'workspace_alerts',
        reasonKey: 'summary_dispatch_failed',
        title: `${compiled.window.label} summary needs attention`,
        body: 'One or more summary emails were not delivered. Review sender readiness, recipients, and recent notification failures.',
        emailSubject: `MyTitan operational alert: ${compiled.window.label.toLowerCase()} summary needs attention`,
        emailBody: [
          `Cadence: ${input.cadence}`,
          `Period: ${compiled.window.dateLabel}`,
          `Failed deliveries: ${failedDeliveries.length}`,
          'Review summary email readiness and recent notification failures in the workspace.',
        ].join('\n'),
        entityType: 'tenant',
        entityId: input.companyId,
        metaJson: {
          failedDeliveries: failedDeliveries.length,
          cadence: input.cadence,
          periodKey: compiled.window.periodKey,
        },
      });
    }

    return {
      ok: true,
      enabled: true,
      cadence: input.cadence,
      dryRun: input.dryRun === true,
      sender: senderReadiness,
      recipients: deliveries,
      preview: {
        subject: emailBody.subject,
        text: emailBody.text,
        sections: summarySettings.enabledSections,
        window: compiled.window,
        data: compiled.data,
      },
      runtimeNote: 'Schedule `npm run summary:dispatch -- <cadence>` in your runtime to send summaries automatically. MyTitan will not send them on its own until you wire that scheduler.',
    };
  }

  private formatUtcDateLabel(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(parsed);
  }

  private formatDaysRemainingLabel(daysRemaining: number) {
    if (daysRemaining <= 1) return 'in about 1 day';
    return `in ${daysRemaining} days`;
  }

  private buildTrialLifecycleCandidate(input: {
    status: string;
    startedAt?: string | null;
    endsAt?: string | null;
    daysRemaining: number;
  }): TrialLifecycleCandidate | null {
    const startedAt = String(input.startedAt || '').trim();
    const endsAt = String(input.endsAt || '').trim();
    if (!startedAt || !endsAt) return null;

    if (input.status === 'expired') {
      return {
        stage: 'trial_expired',
        reasonKey: 'trial_expired',
        idempotencyKey: `trial_lifecycle:expired:${endsAt}`,
        title: 'Trial ended',
        summary: 'Trial ended. Billing action is needed to restore billing-enabled workflows.',
        daysRemaining: 0,
        startedAt,
        endsAt,
      };
    }

    if (input.status !== 'active') return null;

    if (input.daysRemaining <= 1) {
      return {
        stage: 'trial_final_reminder',
        reasonKey: 'trial_final_reminder',
        idempotencyKey: `trial_lifecycle:final:${endsAt}`,
        title: 'Final trial reminder',
        summary: 'Final trial reminder before trial access ends.',
        daysRemaining: input.daysRemaining,
        startedAt,
        endsAt,
      };
    }

    if (input.daysRemaining <= 3) {
      return {
        stage: 'trial_ending_soon',
        reasonKey: 'trial_ending_soon',
        idempotencyKey: `trial_lifecycle:ending_soon:${endsAt}`,
        title: 'Trial ending soon',
        summary: 'Trial is ending soon. Billing review is needed to preserve continuity.',
        daysRemaining: input.daysRemaining,
        startedAt,
        endsAt,
      };
    }

    return {
      stage: 'trial_started',
      reasonKey: 'trial_started',
      idempotencyKey: `trial_lifecycle:started:${startedAt}`,
      title: 'Trial started',
      summary: 'Trial started. The workspace should be guided toward first value and billing continuity.',
      daysRemaining: input.daysRemaining,
      startedAt,
      endsAt,
    };
  }

  private async getTrialLifecycleRecipient(companyId: string) {
    const db = this.prisma as any;
    const owners = await db.user.findMany({
      where: { companyId, role: 'OWNER' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true },
    });
    const routableOwner = owners.find((user: { email?: string | null }) => !classifyNonRoutableRecipientEmail(user?.email));
    if (routableOwner?.id && routableOwner?.email) return routableOwner;
    if (owners[0]?.id && owners[0]?.email) return owners[0];

    const admins = await db.user.findMany({
      where: { companyId, role: 'ADMIN' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true },
    });
    const routableAdmin = admins.find((user: { email?: string | null }) => !classifyNonRoutableRecipientEmail(user?.email));
    if (routableAdmin?.id && routableAdmin?.email) return routableAdmin;
    if (admins[0]?.id && admins[0]?.email) return admins[0];

    return null;
  }

  async prepareTrackedEmailNotification(input: {
    companyId: string;
    userId: string;
    type: string;
    title: string;
    body?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    idempotencyKey?: string | null;
    reasonKey: string;
    to: string;
    summary?: string | null;
    ctaHref?: string | null;
    trackingExpiresAt?: Date | null;
    stableSeed?: string | null;
    context?: Record<string, any>;
  }) {
    const db = this.prisma as any;
    const existing =
      input.idempotencyKey
        ? await db.notification.findFirst({
            where: { companyId: input.companyId, idempotencyKey: input.idempotencyKey },
          })
        : null;
    const expiresAt = input.trackingExpiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const inputContext = this.sanitizeStoredTrackingContext(input.context || {});
    const context = {
      ...(inputContext || {}),
      summary: input.summary || null,
      trackingExpiresAt: input.ctaHref ? expiresAt.toISOString() : null,
      ctaCiphertext: input.ctaHref ? this.encryptTrackingDestination(input.ctaHref) : null,
      deliveryStatus: existing?.metaJson?.context?.deliveryStatus || 'queued',
      failureReason: existing?.metaJson?.context?.failureReason || null,
    };
    const metaJson = {
      channel: 'email',
      status: existing?.metaJson?.status || 'queued',
      reasonKey: input.reasonKey,
      to: input.to,
      context,
    };

    let row = existing;
    if (row?.id) {
      row = await db.notification.update({
        where: { id: row.id },
        data: {
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          entityType: input.entityType || null,
          entityId: input.entityId || null,
          metaJson,
        },
      });
    } else {
      const stableId = input.stableSeed ? this.buildStableTrackedNotificationId(input.companyId, input.stableSeed) : undefined;
      try {
        row = await db.notification.create({
          data: {
            ...(stableId ? { id: stableId } : {}),
            companyId: input.companyId,
            userId: input.userId,
            type: input.type,
            title: input.title,
            body: input.body ?? null,
            entityType: input.entityType || null,
            entityId: input.entityId || null,
            idempotencyKey: input.idempotencyKey || null,
            metaJson,
          },
        });
      } catch (error: any) {
        if (stableId && error?.code === 'P2002') {
          row = await db.notification.findFirst({ where: { id: stableId, companyId: input.companyId } });
          if (!row?.id) throw error;
          row = await db.notification.update({
            where: { id: row.id },
            data: {
              type: input.type,
              title: input.title,
              body: input.body ?? null,
              entityType: input.entityType || null,
              entityId: input.entityId || null,
              idempotencyKey: input.idempotencyKey || null,
              metaJson,
            },
          });
        } else {
          throw error;
        }
      }
    }

    return {
      id: row.id,
      trackedHref: input.ctaHref ? buildAppUrl(`/t/c/${encodeURIComponent(this.buildTrackedClickId(row.id, expiresAt))}`) : null,
    };
  }

  async finalizeTrackedEmailNotification(
    notificationId: string,
    delivery: { delivered: boolean; status?: string; reason?: string | null },
    input?: { title?: string | null; body?: string | null },
  ) {
    const db = this.prisma as any;
    const row = await db.notification.findFirst({ where: { id: notificationId } });
    if (!row?.id) return null;
    const nextMeta = {
      ...(row.metaJson || {}),
      channel: 'email',
      status: delivery.delivered ? 'sent' : 'failed',
      context: {
        ...(this.sanitizeStoredTrackingContext(row.metaJson?.context || {}) || {}),
        deliveryStatus: delivery.status || (delivery.delivered ? 'sent' : 'failed'),
        failureReason: delivery.delivered ? null : delivery.reason || 'Email delivery failed',
      },
    };
    return db.notification.update({
      where: { id: row.id },
      data: {
        ...(input?.title ? { title: input.title } : {}),
        ...(Object.prototype.hasOwnProperty.call(input || {}, 'body') ? { body: input?.body ?? null } : {}),
        metaJson: nextMeta,
        deliveredAt: delivery.delivered ? row.deliveredAt || new Date() : row.deliveredAt,
      },
    });
  }

  async resolveTrackedDestinationForFixture(notificationId: string) {
    const row = await (this.prisma as any).notification.findFirst({
      where: { id: notificationId },
      select: { metaJson: true },
    });
    return this.decryptTrackingDestination(row?.metaJson?.context?.ctaCiphertext);
  }

  async trackEmailClick(id: string) {
    const parsed = this.parseTrackedClickId(id);
    if (!parsed) return buildAppUrl('/login');

    const db = this.prisma as any;
    const row = await db.notification.findFirst({
      where: { id: parsed.notificationId },
      select: { id: true, clickedAt: true, metaJson: true },
    });
    if (!row?.id) return buildAppUrl('/login');

    const destination = this.decryptTrackingDestination(row?.metaJson?.context?.ctaCiphertext);
    if (!destination) return buildAppUrl('/login');

    if (!row.clickedAt) {
      await db.notification.update({
        where: { id: row.id },
        data: { clickedAt: new Date() },
      });
    }

    return destination;
  }

  async markLifecycleConversion(companyId: string, convertedAt: Date) {
    const db = this.prisma as any;
    const recentClick = await db.notification.findFirst({
      where: {
        companyId,
        type: 'trial_lifecycle_email',
        clickedAt: { gte: new Date(convertedAt.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { clickedAt: 'desc' },
      select: { id: true, conversionAt: true },
    });
    if (!recentClick?.id) return null;
    if (recentClick.conversionAt) return recentClick;
    return db.notification.update({
      where: { id: recentClick.id },
      data: { conversionAt: convertedAt },
    });
  }

  async syncTrialLifecycleEmail(
    companyId: string,
    input: { status: string; startedAt?: string | null; endsAt?: string | null; daysRemaining: number },
  ) {
    const candidate = this.buildTrialLifecycleCandidate(input);
    if (!candidate) return null;

    const db = this.prisma as any;
    const recipient = await this.getTrialLifecycleRecipient(companyId);
    if (!recipient?.email) return null;

    const existing = await db.notification.findFirst({
      where: { companyId, idempotencyKey: candidate.idempotencyKey },
    });
    if (existing?.metaJson?.status === 'sent' || existing?.metaJson?.context?.deliveryStatus === 'suppressed') {
      return this.mapNotification(existing);
    }

    const billingUrl = buildAppUrl('/dashboard/billing');
    const startUrl = buildAppUrl('/start');
    const ctaHref = candidate.stage === 'trial_started' ? startUrl : billingUrl;
    const notification = await this.prepareTrackedEmailNotification({
      companyId,
      userId: recipient.id,
      type: 'trial_lifecycle_email',
      title: `${candidate.title} email pending`,
      body: 'Trial lifecycle email is being prepared for delivery.',
      entityType: 'tenant',
      entityId: companyId,
      idempotencyKey: candidate.idempotencyKey,
      reasonKey: candidate.reasonKey,
      to: recipient.email,
      summary: candidate.summary,
      ctaHref,
      trackingExpiresAt: new Date(new Date(candidate.endsAt).getTime() + 7 * 24 * 60 * 60 * 1000),
      stableSeed: candidate.idempotencyKey,
      context: {
        stage: candidate.stage,
        startedAt: candidate.startedAt,
        endsAt: candidate.endsAt,
        daysRemaining: candidate.daysRemaining,
      },
    });
    const branding = await this.email.getBranding(null, { ownership: 'system' });
    const endsAtLabel = this.formatUtcDateLabel(candidate.endsAt);
    const template =
      candidate.stage === 'trial_started'
        ? buildTrialStartedEmailTemplate(branding, {
            startUrl,
            billingUrl,
            htmlStartUrl: notification.trackedHref || startUrl,
            htmlBillingUrl: notification.trackedHref || billingUrl,
            endsAtLabel,
          })
        : candidate.stage === 'trial_ending_soon'
          ? buildTrialEndingSoonEmailTemplate(branding, {
              billingUrl,
              htmlBillingUrl: notification.trackedHref || billingUrl,
              daysRemainingLabel: this.formatDaysRemainingLabel(candidate.daysRemaining),
              endsAtLabel,
            })
          : candidate.stage === 'trial_final_reminder'
            ? buildTrialFinalReminderEmailTemplate(branding, {
                billingUrl,
                htmlBillingUrl: notification.trackedHref || billingUrl,
                endsAtLabel,
              })
            : buildTrialExpiredEmailTemplate(branding, {
                billingUrl,
                htmlBillingUrl: notification.trackedHref || billingUrl,
                endsAtLabel,
              });

    const delivery = await this.email.sendTransactionalEmail(null, {
      to: recipient.email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    }, {
      ownership: 'system',
      category: 'trial_lifecycle',
      templateKey: 'trial_lifecycle_email',
      actorUserId: recipient.id,
      dedupeWindowMinutes: 60,
    });

    const row = await this.finalizeTrackedEmailNotification(notification.id, delivery, {
      title: delivery.delivered ? `${candidate.title} email sent` : `${candidate.title} email pending`,
      body: delivery.delivered ? candidate.summary : 'Trial lifecycle email was not delivered in this environment.',
    });

    await this.audit.log(
      companyId,
      'notification.trial_lifecycle.dispatch',
      `Trial lifecycle ${candidate.stage} processed for ${recipient.email}: ${delivery.status}`,
      recipient.id,
    );

    return row ? this.mapNotification(row) : null;
  }

  private async sendNotificationEmail(
    companyId: string,
    to: string,
    subject: string,
    text: string,
    html?: string,
    overrides?: NotificationEmailOverrides,
    options?: NotificationEmailOptions,
  ): Promise<{ delivered: boolean; status: NotificationDeliveryStatus; reason: string; senderOwnership?: any; usedFallback?: boolean; notice?: string | null }> {
    const normalizedRecipient = this.normalizeDeliverableEmail(to);
    if (!normalizedRecipient) {
      await this.audit.log(companyId, 'notification.email.skipped', 'Recipient resolution produced no deliverable address', null);
      return { delivered: false, status: 'skipped_no_recipient', reason: 'No deliverable recipient resolved.', senderOwnership: undefined, usedFallback: false, notice: null };
    }

    if (isAutomationsV1Enabled()) {
      const mode = await this.automations.getDeliveryMode(companyId);
      if (mode !== 'live_send') {
        await this.audit.log(companyId, 'notification.email.skipped', 'Delivery mode metadata_only', null);
        return { delivered: false, status: 'queued', reason: 'Delivery mode metadata_only', senderOwnership: undefined, usedFallback: false, notice: null };
      }
    }

    const result = await this.email.sendOperationalEmail(companyId, {
      to: normalizedRecipient,
      subject,
      text,
      html,
      fromName: overrides?.fromName,
      replyToEmail: overrides?.replyToEmail,
    }, {
      category: options?.category || 'notification',
      templateKey: options?.templateKey || undefined,
      actorUserId: options?.actorUserId || null,
    });
    const status = this.mapNotificationDeliveryStatus(result);
    if (!result.delivered) {
      await this.audit.log(companyId, 'notification.email.failed', `Notification email failed with status=${status}`, null);
      if (!options?.suppressFailureAlert) {
        await this.notifyOperationalAlert({
          companyId,
          category: 'workspace_alerts',
          reasonKey: 'email_delivery_failed',
          title: 'Email delivery needs attention',
          body: 'An outbound operational email could not be delivered. Review sender readiness, SMTP setup, and recent notification failures.',
          emailSubject: 'MyTitan operational alert: email delivery needs attention',
          emailBody: [
            'MyTitan could not deliver an operational email.',
            `Status: ${status}`,
            'Review sender readiness and recent notification failures in the workspace.',
          ].join('\n'),
          metaJson: {
            channel: 'email',
            failureStatus: status,
          },
        }).catch(() => undefined);
      }
      return {
        delivered: false,
        status,
        reason: result.reason,
        senderOwnership: result.senderOwnership,
        usedFallback: result.usedFallback,
        notice: result.notice || null,
      };
    }

    return {
      delivered: true as const,
      status,
      reason: result.reason,
      senderOwnership: result.senderOwnership,
      usedFallback: result.usedFallback,
      notice: result.notice || null,
    };
  }

  async notifyOperationalAlert(input: {
    companyId: string;
    category: InternalNotificationCategory;
    reasonKey: string;
    title: string;
    body: string;
    opsCategory?: OperationalAlertCategory;
    severity?: OperationalAlertSeverity;
    recommendedAction?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    emailSubject?: string | null;
    emailBody?: string | null;
    metaJson?: Record<string, any> | null;
  }) {
    if (!isNotificationsV1Enabled()) return { ok: false, recipients: [] as string[] };
    const db = this.prisma as any;
    const opsCategory = input.opsCategory || this.mapReasonKeyToOperationalAlertCategory(input.reasonKey);
    const severity = input.severity || 'warning';
    const ownersAndAdmins = await this.getActiveOperationalAlertUsers(input.companyId);
    const ownerAdminIds = ownersAndAdmins.map((user: { id: string }) => user.id).filter(Boolean);
    if (ownerAdminIds.length > 0) {
      await this.createForUsers(input.companyId, ownerAdminIds, {
        type: 'workspace.alert',
        title: input.title,
        body: input.body,
        entityType: input.entityType || null,
        entityId: input.entityId || null,
        metaJson: {
          reasonKey: `operational_alert.${input.reasonKey}`,
          category: input.category,
          severity,
          opsCategory,
          recommendedAction: input.recommendedAction || null,
          ...(input.metaJson || {}),
        },
      });
    }

    const configuredRecipients = (await this.getWorkspaceInternalEmailRecipients(input.companyId, input.category)).recipients;
    const attemptedRecipients = new Set<string>();
    for (const email of configuredRecipients) {
      const normalized = this.normalizeEmail(email || '');
      if (!normalized || attemptedRecipients.has(normalized)) continue;
      attemptedRecipients.add(normalized);
      await this.sendNotificationEmail(
        input.companyId,
        normalized,
        String(input.emailSubject || input.title).trim() || 'MyTitan operational alert',
        String(input.emailBody || input.body || input.title).trim(),
        undefined,
        undefined,
        { suppressFailureAlert: true },
      );
    }

    const externalAlertConfig = await this.resolveOperationalAlertRecipients(input.companyId, opsCategory, severity);
    const externalRecipients = new Set<string>();
    for (const recipient of externalAlertConfig.recipients) {
      if (externalRecipients.has(recipient.email)) continue;
      externalRecipients.add(recipient.email);
      const message = this.buildExternalOperationalAlertEmail({
        workspaceName: externalAlertConfig.workspaceName,
        companyId: input.companyId,
        opsCategory,
        severity,
        title: input.title,
        reasonKey: input.reasonKey,
        recommendedAction: input.recommendedAction,
      });
      await this.email.sendSystemOperationalEmail({
        to: recipient.email,
        subject: message.subject,
        text: message.text,
      }, {
        category: 'ops_alert',
        templateKey: 'platform_operational_alert',
      });
    }

    await this.audit.log(
      input.companyId,
      'notification.operational_alert',
      `${input.title} (${input.category})`,
      null,
    );

    return {
      ok: true,
      recipients: Array.from(attemptedRecipients),
      externalRecipients: Array.from(externalRecipients),
      opsCategory,
      severity,
      recipientCounts: {
        internalNotificationEmailCount: attemptedRecipients.size,
        ownerAdminCount: externalAlertConfig.ownerAdminRecipients.length,
        extraRecipientCount: externalAlertConfig.extraRecipients.length,
        platformCriticalCopyCount: externalAlertConfig.platformRecipients.length,
        resolvedExternalRecipientCount: externalRecipients.size,
      },
    };
  }

  async getOperationalAlertStatus(companyId: string) {
    const readiness = await this.email.getReadiness(null, { ownership: 'system', probe: true });
    const config = await this.resolveOperationalAlertRecipients(companyId, 'health_degraded', 'critical');
    return {
      enabled: config.recipients.length > 0,
      systemSender: readiness,
      ownerAdminRecipientCount: config.ownerAdminRecipients.length,
      extraRecipientCount: config.extraRecipients.length,
      resolvedRecipientCount: config.recipients.length,
      platformRecipientCount: config.platformRecipients.length,
      enabledCategories: config.enabledCategories,
      configured: {
        ownerAdminRecipients: config.ownerAdminRecipients.length > 0,
        workspaceExtraRecipients: config.extraRecipients.length > 0,
        platformRecipients: config.platformRecipients.length > 0,
      },
      runtimeNote:
        config.ownerAdminRecipients.length > 0
          ? 'Active verified owners and admins receive tenant ops alerts automatically. Extra recipients are optional and category-filtered.'
          : 'No active verified owner/admin recipients are available yet. Add or verify an owner/admin to restore automatic tenant ops alert routing.',
      platformCriticalCopiesEnabled: config.platformCriticalCopiesEnabled,
    };
  }

  async sendOperationalAlertSmokeTest(companyId: string) {
    const result = await this.notifyOperationalAlert({
      companyId,
      category: 'workspace_alerts',
      reasonKey: 'health_degraded',
      title: 'Operational alert smoke test',
      body: 'This is a sanitized MyTitan tenant ops alert smoke test.',
      severity: 'critical',
      recommendedAction: 'Confirm the current owner/admin team received the MyTitan test alert.',
      emailSubject: 'MyTitan operational alert smoke test',
      emailBody: 'Operational alert smoke test\nThis is a sanitized MyTitan tenant ops alert smoke test.',
      entityType: 'tenant',
      entityId: companyId,
      metaJson: { source: 'ops_alert_smoke_test' },
    });

    return {
      ok: result.ok,
      opsCategory: result.opsCategory,
      severity: result.severity,
      ownerAdminRecipientCount: result.recipientCounts?.ownerAdminCount ?? 0,
      extraRecipientCount: result.recipientCounts?.extraRecipientCount ?? 0,
      platformCriticalCopyCount: result.recipientCounts?.platformCriticalCopyCount ?? 0,
      resolvedExternalRecipientCount: result.recipientCounts?.resolvedExternalRecipientCount ?? 0,
      internalNotificationEmailCount: result.recipientCounts?.internalNotificationEmailCount ?? 0,
      message: 'Sanitized operational alert smoke test sent. Recipient counts only are exposed.',
    };
  }

  private sanitizeInAppMessage(value: unknown, maxLength = 220) {
    return String(value || '')
      .replace(/\bhttps?:\/\/\S+\b/gi, '[redacted-link]')
      .replace(/\b(sk|rk|whsec)_[a-z0-9_]+\b/gi, '[redacted-secret]')
      .replace(/\b(cs|pi|ch|re|evt|sub|cus|in|price)_[a-z0-9_]+\b/gi, '[redacted-reference]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  private toSafeDashboardPath(value: unknown) {
    const normalized = String(value || '').trim();
    if (!normalized.startsWith('/dashboard')) return null;
    if (normalized.includes('://')) return null;
    if (normalized.includes('\n')) return null;
    return normalized;
  }

  private readNotificationMeta(row: any) {
    return row?.metaJson && typeof row.metaJson === 'object' && !Array.isArray(row.metaJson) ? row.metaJson : {};
  }

  private isDismissedNotification(row: any) {
    const meta = this.readNotificationMeta(row);
    return Boolean(meta?.dismissedAt);
  }

  private isExpiredNotification(row: any) {
    const meta = this.readNotificationMeta(row);
    const expiresAt = String(meta?.expiresAt || '').trim();
    if (!expiresAt) return false;
    const parsed = new Date(expiresAt);
    return !Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now();
  }

  private deriveNotificationCategory(row: any): InAppNotificationCategory {
    const meta = this.readNotificationMeta(row);
    const explicit = String(meta?.category || '').trim().toLowerCase();
    if (explicit === 'payments') return 'payments';
    if (explicit === 'bookings') return 'bookings';
    if (explicit === 'jobs') return 'jobs';
    if (explicit === 'workspace_alerts') return 'platform';
    if (explicit === 'customer_messages') return 'customers';

    const reasonKey = String(meta?.reasonKey || row?.type || '').trim().toLowerCase();
    const entityType = String(row?.entityType || '').trim().toLowerCase();
    if (reasonKey.includes('payment') || reasonKey.includes('refund') || entityType === 'payment') return 'payments';
    if (reasonKey.includes('booking') || entityType === 'booking') return 'bookings';
    if (reasonKey.includes('template') || entityType === 'job_sheet_template') return 'templates';
    if (reasonKey.includes('integration') || entityType === 'integration') return 'integrations';
    if (reasonKey.includes('email') || reasonKey.includes('summary') || reasonKey.includes('support')) return 'email';
    if (reasonKey.includes('team') || reasonKey.includes('access')) return 'team';
    if (reasonKey.includes('customer') || entityType === 'trade_account' || entityType === 'customer') return 'customers';
    return 'jobs';
  }

  private deriveNotificationPriority(row: any): InAppNotificationPriority {
    const meta = this.readNotificationMeta(row);
    const explicit = String(meta?.priority || '').trim().toLowerCase();
    if (explicit === 'urgent' || explicit === 'attention' || explicit === 'success' || explicit === 'info') {
      return explicit as InAppNotificationPriority;
    }
    const severity = String(meta?.severity || '').trim().toLowerCase();
    if (severity === 'critical') return 'urgent';
    if (severity === 'warning') return 'attention';

    const reasonKey = String(meta?.reasonKey || row?.type || '').trim().toLowerCase();
    if (reasonKey.includes('failed') || reasonKey.includes('paused') || reasonKey.includes('degraded')) return 'urgent';
    if (reasonKey.includes('attention') || reasonKey.includes('overdue') || reasonKey.includes('approval')) return 'attention';
    if (reasonKey.includes('completed') || reasonKey.includes('paid') || reasonKey.includes('approved')) return 'success';
    return 'info';
  }

  private deriveNotificationAction(row: any) {
    const meta = this.readNotificationMeta(row);
    const explicitUrl = this.toSafeDashboardPath(meta?.actionUrl);
    if (explicitUrl) {
      return {
        actionUrl: explicitUrl,
        actionLabel: this.sanitizeInAppMessage(meta?.actionLabel || 'Open', 48) || 'Open',
      };
    }

    const entityId = String(row?.entityId || '').trim();
    const entityType = String(row?.entityType || '').trim().toLowerCase();
    if (!entityId && entityType !== 'tenant' && entityType !== 'integration') {
      return { actionUrl: null, actionLabel: null };
    }

    if (entityType === 'job') return { actionUrl: `/dashboard/jobs/${entityId}`, actionLabel: 'Open job' };
    if (entityType === 'booking') return { actionUrl: `/dashboard/bookings/${entityId}`, actionLabel: 'Open booking' };
    if (entityType === 'trade_account' || entityType === 'customer') {
      return { actionUrl: `/dashboard/trade-accounts/${entityId}`, actionLabel: 'Open customer' };
    }
    if (entityType === 'integration') return { actionUrl: '/dashboard/integrations', actionLabel: 'Open tools' };
    if (entityType === 'job_sheet_template') return { actionUrl: '/dashboard/settings?tab=jobs', actionLabel: 'Open templates' };
    if (entityType === 'tenant') return { actionUrl: '/dashboard/settings/operations', actionLabel: 'Open operations' };
    return { actionUrl: null, actionLabel: null };
  }

  private deriveNotificationTitle(row: any) {
    const meta = this.readNotificationMeta(row);
    const current = this.sanitizeInAppMessage(row?.title || '', 96);
    if (current && !/ queued$/i.test(current)) return current;

    const reasonKey = String(meta?.reasonKey || row?.type || '').trim().toLowerCase();
    if (reasonKey === 'booking.requested') return 'Booking request received';
    if (reasonKey === 'booking.confirmed') return 'Booking confirmed';
    if (reasonKey === 'booking.cancelled') return 'Booking cancelled';
    if (reasonKey === 'calendar_reschedule') return 'Booking updated';
    if (reasonKey === 'approval_request') return 'Completion review requested';
    if (reasonKey.includes('job_complete') || reasonKey.includes('completed')) return current || 'Job completed';
    if (reasonKey.includes('payment_received') || reasonKey.includes('deposit_paid')) return 'Payment received';
    if (reasonKey.includes('support_request')) return 'Support request update';
    if (reasonKey.includes('integration')) return 'Integration attention needed';
    if (reasonKey.includes('email') || reasonKey.includes('summary')) return 'Email delivery attention';
    if (reasonKey.includes('template')) return 'Template review update';
    return current || 'Workspace update';
  }

  private deriveNotificationBody(row: any) {
    const meta = this.readNotificationMeta(row);
    const current = this.sanitizeInAppMessage(row?.body || '', 220);
    if (current) return current;
    const note = this.sanitizeInAppMessage(meta?.note || meta?.recommendedAction || '', 220);
    if (note) return note;
    const context = meta?.context && typeof meta.context === 'object' ? meta.context : null;
    if (context?.customerName) {
      return this.sanitizeInAppMessage(`Customer: ${context.customerName}`, 220);
    }
    return '';
  }

  private serializeNotification(row: any) {
    const meta = this.readNotificationMeta(row);
    const action = this.deriveNotificationAction(row);
    return {
      id: row.id,
      type: row.type,
      title: this.deriveNotificationTitle(row),
      message: this.deriveNotificationBody(row),
      category: this.deriveNotificationCategory(row),
      priority: this.deriveNotificationPriority(row),
      actionUrl: action.actionUrl,
      actionLabel: action.actionLabel,
      entityType: row.entityType || null,
      entityId: row.entityId || null,
      isRead: Boolean(row.isRead),
      readAt: row.readAt || null,
      dismissedAt: meta?.dismissedAt || null,
      createdAt: row.createdAt,
    };
  }

  async getWorkspaceInternalEmailRecipients(
    companyId: string,
    category: InternalNotificationCategory,
  ): Promise<{ workspaceName: string; recipients: string[] }> {
    const db = this.prisma as any;
    const [settings, ownersAndAdmins] = await Promise.all([
      db.tenantSetting.findUnique({
        where: { tenantId: companyId },
        select: { businessConfigJson: true, emailNotificationRecipients: true, companyName: true },
      }),
      this.getActiveOperationalAlertUsers(companyId),
    ]);

    const configuredRecipients: string[] = getInternalNotificationSettings(settings).internalRecipients
      .filter((recipient) => recipient.enabled && recipient.categories.includes(category))
      .map((recipient) => recipient.email);

    const fallbackRecipients: string[] = ownersAndAdmins
      .map((user: { email?: string | null }) => this.normalizeEmail(user?.email || ''))
      .filter((email) => Boolean(email) && !classifyNonRoutableRecipientEmail(email));

    return {
      workspaceName: String(settings?.companyName || '').trim() || 'MyTitan',
      recipients: Array.from(new Set(configuredRecipients.length > 0 ? configuredRecipients : fallbackRecipients)),
    };
  }

  async getPreferences(companyId: string, userId: string) {
    const db = this.prisma as any;
    const pref = await db.notificationPreference.upsert({
      where: { userId },
      update: {},
      create: {
        companyId,
        userId,
      },
    });
    return pref;
  }

  async updatePreferences(companyId: string, userId: string, dto: UpdateNotificationPreferenceDto) {
    const db = this.prisma as any;
    await this.getPreferences(companyId, userId);
    return db.notificationPreference.update({
      where: { userId },
      data: {
        ...(typeof dto.jobComplete === 'boolean' ? { jobComplete: dto.jobComplete } : {}),
        ...(typeof dto.paymentReceived === 'boolean' ? { paymentReceived: dto.paymentReceived } : {}),
        ...(typeof dto.emailEnabled === 'boolean' ? { emailEnabled: dto.emailEnabled } : {}),
      },
    });
  }

  async listRecent(companyId: string, userId: string, take = 30) {
    const db = this.prisma as any;
    const rows = await db.notification.findMany({
      where: { companyId, userId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(10, Math.min(120, Number(take || 30) * 3)),
    });
    return rows
      .filter((row: any) => !this.isDismissedNotification(row))
      .filter((row: any) => !this.isExpiredNotification(row))
      .slice(0, Math.max(1, Math.min(50, Number(take || 30))))
      .map((row: any) => this.serializeNotification(row));
  }

  async markRead(companyId: string, userId: string, id: string, read: boolean) {
    const db = this.prisma as any;
    const existing = await db.notification.findFirst({ where: { id, companyId, userId } });
    if (!existing) return { ok: false, message: 'Notification not found' };
    const row = await db.notification.update({
      where: { id },
      data: {
        isRead: read,
        readAt: read ? new Date() : null,
      },
    });
    return this.serializeNotification(row);
  }

  async markAllRead(companyId: string, userId: string, read: boolean) {
    const db = this.prisma as any;
    const now = new Date();
    const result = await db.notification.updateMany({
      where: { companyId, userId, isRead: !read },
      data: {
        isRead: read,
        readAt: read ? now : null,
      },
    });
    return {
      ok: true,
      updatedCount: Number(result?.count || 0),
      read,
    };
  }

  async dismiss(companyId: string, userId: string, id: string) {
    const db = this.prisma as any;
    const existing = await db.notification.findFirst({ where: { id, companyId, userId } });
    if (!existing) return { ok: false, message: 'Notification not found' };
    const meta = this.readNotificationMeta(existing);
    const row = await db.notification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: existing.readAt || new Date(),
        metaJson: {
          ...meta,
          dismissedAt: new Date().toISOString(),
        },
      },
    });
    return this.serializeNotification(row);
  }

  async createForUsers(companyId: string, userIds: string[], input: NotificationInput) {
    if (!isNotificationsV1Enabled()) return;
    const db = this.prisma as any;
    const unique = Array.from(new Set((userIds || []).filter(Boolean)));
    if (unique.length === 0) return;

    await db.notification.createMany({
      data: unique.map((userId) => ({
        companyId,
        userId,
        type: input.type,
        title: input.title,
        body: input.body || null,
        entityType: input.entityType || null,
        entityId: input.entityId || null,
        metaJson: input.metaJson || null,
      })),
      skipDuplicates: false,
    });
  }

  async notifyJobCompleted(companyId: string, jobId: string) {
    const db = this.prisma as any;
    const [job, tenantSettings] = await Promise.all([
      db.job.findFirst({
        where: { id: jobId, companyId },
        include: {
          company: true,
          assignedUser: true,
          createdByUser: true,
          customer: true,
          tradeAccount: {
            include: {
              contacts: {
                include: {
                  preferences: true,
                },
              },
            },
          },
          assets: true,
          signatures: true,
          pdf: true,
        },
      }),
      db.tenantSetting.findUnique({
        where: { tenantId: companyId },
        select: { emailNotificationRecipients: true, businessConfigJson: true, emailSenderName: true, emailReplyTo: true, companyName: true, logoUrl: true },
      }),
    ]);
    if (!job) return;

    const ownersAndAdmins = await this.getActiveOperationalAlertUsers(companyId);
    const recipientMap = new Map<string, string>();
    ownersAndAdmins.forEach((user: any) => {
      const email = this.normalizeDeliverableEmail(user?.email || '');
      if (email) recipientMap.set(user.id, email);
    });
    const assignedUserEmail = await this.getActiveAssignedUserEmail(companyId, job.assignedUserId || null);
    if (job.assignedUserId && assignedUserEmail) {
      recipientMap.set(job.assignedUserId, assignedUserEmail);
    }

    const recipientIds = Array.from(recipientMap.keys());
    await this.createForUsers(companyId, recipientIds, {
      type: 'job.complete',
      title: `Job completed: ${job.jobRef || job.id}`,
      body: `${job.customerName || 'Customer'} job is now completed.`,
      entityType: 'job',
      entityId: job.id,
      metaJson: { jobRef: job.jobRef, status: job.status },
    });

    const prefs = await db.notificationPreference.findMany({ where: { companyId, userId: { in: recipientIds } } });
    const prefMap = new Map<string, any>(prefs.map((p: any) => [p.userId, p]));
    const configuredRecipients = (await this.getWorkspaceInternalEmailRecipients(companyId, 'jobs')).recipients;

    const completionOverview = buildJobCompletionOverview({
      job,
      formData: (job.formData || {}) as Record<string, any>,
      workspaceName: job.company?.name || null,
      apiPublicUrl: getApiPublicUrl(),
      appPublicUrl: getAppPublicUrl(),
    });
    const attemptedEmails = new Set<string>();

    for (const [userId, email] of recipientMap.entries()) {
      const pref = prefMap.get(userId);
      const emailEnabled = Boolean(pref?.emailEnabled);
      const eventEnabled = pref?.jobComplete !== false;
      if (!emailEnabled || !eventEnabled || !email) continue;
      attemptedEmails.add(String(email).trim().toLowerCase());

      await this.sendNotificationEmail(
        companyId,
        email,
        `Service record ready: ${job.jobRef || job.id}`,
        buildJobCompletionEmailLines(completionOverview).join('\n'),
      );
    }

    const knownEmails = new Set(Array.from(attemptedEmails));
    for (const email of configuredRecipients) {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!normalizedEmail || knownEmails.has(normalizedEmail)) continue;
      attemptedEmails.add(normalizedEmail);

      await this.sendNotificationEmail(
        companyId,
        normalizedEmail,
        `Service record ready: ${job.jobRef || job.id}`,
        buildJobCompletionEmailLines(completionOverview).join('\n'),
      );
    }

    await this.audit.log(companyId, 'notification.job_complete.dispatch', `Job ${job.jobRef || job.id} completion ${this.summarizeRecipients(new Map(Array.from(attemptedEmails).map((email) => [email, new Set(['internal'])])))}`, null);

    const formData = (job.formData || {}) as Record<string, any>;
    const serviceRecordSettings = getServiceRecordEmailSettings(tenantSettings);
    const customerFeedbackSettings = getCustomerFeedbackSettings(tenantSettings);
    const customerProfile = resolveCustomerOutputFields({
      job,
      tradeAccount: job.tradeAccount || null,
      formData,
    });
    const customerPresentation = buildCustomerOutputPresentation(customerProfile);
    const serviceRecordEmail = buildServiceRecordEmailContent({
      overview: completionOverview,
      workspaceName: job.company?.name || null,
      customerPresentation,
      serviceSummaryRows: [
        ...(completionOverview.vehicleSummary ? [{ label: 'Vehicle', value: completionOverview.vehicleSummary }] : []),
        ...(completionOverview.serviceSummary ? [{ label: 'Services', value: completionOverview.serviceSummary }] : []),
        ...(formData.torqueSetting ? [{ label: 'Torque setting', value: String(formData.torqueSetting) }] : []),
        ...(formData.tyrePressure ? [{ label: 'Tyre pressure', value: String(formData.tyrePressure) }] : []),
      ],
      evidenceSummaryRows: [
        {
          label: 'Before photos',
          value: String((Array.isArray(job.assets) ? job.assets.filter((asset: any) => asset.kind === 'BEFORE').length : 0) || '0'),
        },
        {
          label: 'After photos',
          value: String((Array.isArray(job.assets) ? job.assets.filter((asset: any) => asset.kind === 'AFTER').length : 0) || '0'),
        },
        {
          label: 'Torque proof',
          value: String(
            (Array.isArray(job.assets) ? job.assets.filter((asset: any) => asset.kind === 'TORQUE').length : 0) ||
              (formData.torqueEvidenceLink ? 'External proof link recorded' : '0'),
          ),
        },
      ],
      signatureSummaryRows: [
        ...(formData.technicianSignatureName || formData.technicianName
          ? [{ label: 'Technician sign-off', value: String(formData.technicianSignatureName || formData.technicianName) }]
          : []),
        ...(job.signatureName || formData.customerSignatureName
          ? [{ label: 'Customer sign-off', value: String(job.signatureName || formData.customerSignatureName) }]
          : []),
        ...((job.signatures || []).some((signature: any) => signature.signerType === 'TECHNICIAN' && signature.dataUrl)
          ? [{ label: 'Technician signature image', value: 'Captured' }]
          : []),
        ...((job.signatures || []).some((signature: any) => signature.signerType === 'CUSTOMER' && signature.dataUrl) || job.signatureDataUrl
          ? [{ label: 'Customer signature image', value: 'Captured' }]
          : []),
      ],
      feedbackRequest: customerFeedbackSettings,
      policy: {
        includeBusinessDetails: serviceRecordSettings.includeBusinessDetails,
        includeContactDetails: serviceRecordSettings.includeContactDetails,
        includeBillingDetails: serviceRecordSettings.includeBillingDetails,
        includePaymentSummary: serviceRecordSettings.includePaymentSummary,
        includeEvidenceSummary: serviceRecordSettings.includeEvidenceSummary,
        includeSignatureSummary: serviceRecordSettings.includeSignatureSummary,
        includePortalLink: serviceRecordSettings.includePortalLink,
        includePdfLink: serviceRecordSettings.includePdfLink,
        signatureEnabled: serviceRecordSettings.signatureEnabled,
        signatureText: serviceRecordSettings.signatureText,
      },
    });
    const commsActor =
      job.createdByUser ||
      job.assignedUser ||
      (job.createdByUserId || job.assignedUserId || ownersAndAdmins[0]?.id
        ? await db.user.findFirst({
            where: {
              companyId,
              id: job.createdByUserId || job.assignedUserId || ownersAndAdmins[0]?.id || undefined,
            },
            select: { id: true, name: true, email: true },
          })
        : null);
    const operationalIdentity = this.buildOperationalEmailIdentity({
      workspaceName: tenantSettings?.companyName || job.company?.name || 'MyTitan',
      workspaceSenderName: tenantSettings?.emailSenderName || null,
      workspaceReplyToEmail: tenantSettings?.emailReplyTo || null,
      actorUser: commsActor,
    });

    const serviceRecordTemplate = buildServiceRecordEmailTemplate(
      {
        workspaceName: tenantSettings?.companyName || job.company?.name || 'MyTitan',
        logoUrl: tenantSettings?.logoUrl || null,
        senderName: operationalIdentity.senderName,
        replyToEmail: operationalIdentity.replyToEmail,
      },
      serviceRecordEmail,
    );

    const serviceRecipientSources = new Map<string, Set<string>>();
    const rememberRecipient = (emailValue: unknown, source: string) => {
      const normalized = String(emailValue || '').trim().toLowerCase();
      if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return;
      if (!serviceRecipientSources.has(normalized)) {
        serviceRecipientSources.set(normalized, new Set<string>());
      }
      serviceRecipientSources.get(normalized)?.add(source);
    };

    for (const email of serviceRecordSettings.defaultRecipients) {
      rememberRecipient(email, 'workspace_default');
    }
    if (serviceRecordSettings.includeJobCustomerEmail) {
      const customerRecipient = this.resolveJobCustomerRecipients(job, 'general').selected;
      if (customerRecipient?.email) {
        rememberRecipient(customerRecipient.email, customerRecipient.source);
      }
    }
    for (const contact of Array.isArray(job.tradeAccount?.contacts) ? job.tradeAccount.contacts : []) {
      const enabled = Array.isArray(contact?.preferences)
        ? contact.preferences.some((preference: any) =>
            String(preference?.event || '').toUpperCase() === 'JOB_COMPLETION' &&
            String(preference?.channel || '').toUpperCase() === 'EMAIL' &&
            preference?.enabled !== false)
        : false;
      if (enabled) {
        rememberRecipient(contact?.email, 'trade_account_contact');
      }
    }

    const commsActorUserId = commsActor?.id || job.createdByUserId || job.assignedUserId || ownersAndAdmins[0]?.id || null;
    const serviceRecordRecipients = Array.from(serviceRecipientSources.entries());
    for (const [email, sources] of serviceRecordRecipients) {
      const delivery = await this.sendNotificationEmail(
        companyId,
        email,
        serviceRecordTemplate.subject,
        serviceRecordEmail.lines.join('\n'),
        serviceRecordTemplate.html,
        {
          fromName: operationalIdentity.senderName,
          replyToEmail: operationalIdentity.replyToEmail,
        },
      );
      if (commsActorUserId) {
        await db.notification.create({
          data: {
            companyId,
            userId: commsActorUserId,
            type: 'service_record_email',
            title: delivery.delivered ? 'Service record email sent' : 'Service record email failed',
            body: null,
            entityType: 'job',
            entityId: job.id,
            metaJson: {
              channel: 'email',
              status: delivery.delivered ? 'sent' : 'failed',
              reasonKey: 'service_record_email',
              to: email,
              context: {
                previewLines: this.sanitizePreviewLines(serviceRecordEmail.lines),
                includedSectionKeys: serviceRecordEmail.includedSectionKeys,
                recipientSources: Array.from(sources),
                replyTo: operationalIdentity.replyToEmail,
                senderName: operationalIdentity.senderName,
                failureReason: delivery.delivered ? null : delivery.reason,
                deliveryStatus: delivery.status || (delivery.delivered ? 'sent' : 'failed'),
                senderOwnership: delivery.senderOwnership || null,
                usedFallback: Boolean(delivery.usedFallback),
                deliveryNotice: delivery.notice || null,
              },
            },
            deliveredAt: delivery.delivered ? new Date() : null,
          },
        });
      }
    }

    await this.audit.log(
      companyId,
      'notification.service_record_email.dispatch',
      `Job ${job.jobRef || job.id} service_record ${this.summarizeRecipients(serviceRecipientSources)} | sections=${serviceRecordEmail.includedSectionKeys.join(',') || 'none'} | footer=${serviceRecordSettings.signatureEnabled && serviceRecordSettings.signatureText ? 'enabled' : 'disabled'}`,
      null,
    );
  }

  async notifyPaymentReceived(companyId: string, jobId: string) {
    if (!isNotificationsV1Enabled()) return;
    const db = this.prisma as any;
    const job = await db.job.findFirst({
      where: { id: jobId, companyId },
      include: { createdByUser: true },
    });
    if (!job) return;

    const owners = await this.getActiveOperationalAlertUsers(companyId);

    const recipientMap = new Map<string, string>();
    owners.forEach((o: any) => {
      const email = this.normalizeDeliverableEmail(o.email || '');
      if (email) recipientMap.set(o.id, email);
    });
    const creatorEmail = this.normalizeDeliverableEmail(job.createdByUser?.email || '');
    if (job.createdByUserId && creatorEmail) recipientMap.set(job.createdByUserId, creatorEmail);

    const recipientIds = Array.from(recipientMap.keys());
    await this.createForUsers(companyId, recipientIds, {
      type: 'payment.received',
      title: `Payment received: ${job.jobRef || job.id}`,
      body: `${job.customerName || 'Customer'} payment marked as received.`,
      entityType: 'job',
      entityId: job.id,
      metaJson: {
        jobRef: job.jobRef,
        totalCents: job.totalCents,
        currency: job.currency,
      },
    });

    const prefs = await db.notificationPreference.findMany({ where: { companyId, userId: { in: recipientIds } } });
    const prefMap = new Map<string, any>(prefs.map((p: any) => [p.userId, p]));
    const configuredRecipients = (await this.getWorkspaceInternalEmailRecipients(companyId, 'payments')).recipients;
    const attemptedEmails = new Set<string>();

    for (const [userId, email] of recipientMap.entries()) {
      const pref = prefMap.get(userId);
      const emailEnabled = Boolean(pref?.emailEnabled);
      const eventEnabled = pref?.paymentReceived !== false;
      if (!emailEnabled || !eventEnabled || !email) continue;
      attemptedEmails.add(String(email).trim().toLowerCase());

      await this.sendNotificationEmail(
        companyId,
        email,
        `Payment received: ${job.jobRef || job.id}`,
        `Payment has been received for ${job.jobRef || job.id}.`,
      );
    }

    for (const email of configuredRecipients) {
      const normalized = String(email || '').trim().toLowerCase();
      if (!normalized || attemptedEmails.has(normalized)) continue;
      attemptedEmails.add(normalized);
      await this.sendNotificationEmail(
        companyId,
        normalized,
        `Payment received: ${job.jobRef || job.id}`,
        `Payment has been received for ${job.jobRef || job.id}.`,
      );
    }
  }

  async notifyBillingRefundRecorded(input: {
    companyId: string;
    jobId: string;
    amountCents: number;
    currency: string;
    mode: 'manual_record' | 'stripe';
    status: 'refunded' | 'partially_refunded' | 'pending';
    reason?: string | null;
    notifyCustomer?: boolean;
  }) {
    if (!isNotificationsV1Enabled()) return;
    const db = this.prisma as any;
    const job = await db.job.findFirst({
      where: { id: input.jobId, companyId: input.companyId },
      include: { createdByUser: true, company: true, customer: true, tradeAccount: { include: { contacts: { include: { preferences: true } } } } },
    });
    if (!job) return;

    const owners = await this.getActiveOperationalAlertUsers(input.companyId);
    const recipientMap = new Map<string, string>();
    owners.forEach((owner: any) => {
      const email = this.normalizeDeliverableEmail(owner.email || '');
      if (email) recipientMap.set(owner.id, email);
    });
    const creatorEmail = this.normalizeDeliverableEmail(job.createdByUser?.email || '');
    if (job.createdByUserId && creatorEmail) {
      recipientMap.set(job.createdByUserId, creatorEmail);
    }
    const recipientIds = Array.from(recipientMap.keys());
    const amountLabel = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: String(input.currency || 'GBP').toUpperCase(),
    }).format(Math.max(0, Number(input.amountCents || 0)) / 100);
    const summary = `${amountLabel} ${input.status === 'pending' ? 'refund is pending' : 'refund recorded'} for ${job.jobRef || job.id}.`;

    await this.createForUsers(input.companyId, recipientIds, {
      type: 'billing.refund.recorded',
      title: `Refund recorded: ${job.jobRef || job.id}`,
      body: summary,
      entityType: 'job',
      entityId: job.id,
      metaJson: {
        jobRef: job.jobRef,
        amountCents: input.amountCents,
        currency: input.currency,
        mode: input.mode,
        status: input.status,
      },
    });

    const configuredRecipients = (await this.getWorkspaceInternalEmailRecipients(input.companyId, 'payments')).recipients;
    const attemptedEmails = new Set<string>();
    for (const email of [...recipientMap.values(), ...configuredRecipients]) {
      const normalized = this.normalizeEmail(email || '');
      if (!normalized || attemptedEmails.has(normalized)) continue;
      attemptedEmails.add(normalized);
      await this.sendNotificationEmail(
        input.companyId,
        normalized,
        `Refund recorded: ${job.jobRef || job.id}`,
        [summary, input.reason ? `Reason: ${input.reason}` : '', `Mode: ${input.mode === 'stripe' ? 'Stripe refund' : 'Manual record'}`]
          .filter(Boolean)
          .join('\n'),
      );
    }

    const customerRecipient = this.resolveJobCustomerRecipients(job, 'billing').selected;
    if (input.notifyCustomer && customerRecipient?.email) {
      await this.sendNotificationEmail(
        input.companyId,
        customerRecipient.email,
        `Refund update for ${job.jobRef || job.id}`,
        [summary, input.reason ? `Reason: ${input.reason}` : '', 'If you have questions, reply to this email.']
          .filter(Boolean)
          .join('\n'),
      );
    }
  }

  async notifyBookingDepositRefundRequested(input: {
    companyId: string;
    bookingId: string;
    amountCents: number;
    currency: string;
    notifyCustomer?: boolean;
  }) {
    if (!isNotificationsV1Enabled()) return;
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({
      where: { id: input.bookingId, companyId: input.companyId },
      select: {
        id: true,
        customerEmail: true,
        customerName: true,
        serviceName: true,
        tradeAccount: {
          select: {
            contactEmail: true,
            billingEmail: true,
          },
        },
      },
    });
    if (!booking) return;

    const owners = await this.getActiveOperationalAlertUsers(input.companyId);
    const amountLabel = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: String(input.currency || 'GBP').toUpperCase(),
    }).format(Math.max(0, Number(input.amountCents || 0)) / 100);
    const summary = `${amountLabel} deposit refund is being processed for ${booking.serviceName || 'booking'}.`;
    const recipientIds = owners.map((owner: any) => owner.id).filter(Boolean);

    if (recipientIds.length) {
      await this.createForUsers(input.companyId, recipientIds, {
        type: 'booking.deposit.refund_requested',
        title: 'Deposit refund requested',
        body: summary,
        entityType: 'booking',
        entityId: booking.id,
        metaJson: {
          amountCents: input.amountCents,
          currency: input.currency,
        },
      });
    }

    const configuredRecipients = (await this.getWorkspaceInternalEmailRecipients(input.companyId, 'payments')).recipients;
    const attemptedEmails = new Set<string>();
    for (const email of [...owners.map((owner: any) => owner.email), ...configuredRecipients]) {
      const normalized = this.normalizeEmail(email || '');
      if (!normalized || attemptedEmails.has(normalized)) continue;
      attemptedEmails.add(normalized);
      await this.sendNotificationEmail(
        input.companyId,
        normalized,
        'Deposit refund requested',
        summary,
      );
    }

    const bookingRecipient = this.resolveBookingCustomerRecipient(booking, 'billing');
    if (input.notifyCustomer && bookingRecipient?.email) {
      await this.sendNotificationEmail(
        input.companyId,
        bookingRecipient.email,
        'Deposit refund update',
        [
          `We have started processing your deposit refund for ${booking.serviceName || 'your booking'}.`,
          `${amountLabel} is pending confirmation from the payment provider.`,
          'We will confirm again once the refund completes.',
        ].join('\n'),
      );
    }
  }

  async notifyBookingDepositRefundCompleted(input: {
    companyId: string;
    bookingId: string;
    amountCents: number;
    currency: string;
    partial?: boolean;
    refundedAt?: string | null;
    notifyCustomer?: boolean;
  }) {
    if (!isNotificationsV1Enabled()) return;
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({
      where: { id: input.bookingId, companyId: input.companyId },
      select: {
        id: true,
        customerEmail: true,
        serviceName: true,
        tradeAccount: {
          select: {
            contactEmail: true,
            billingEmail: true,
          },
        },
      },
    });
    if (!booking) return;
    const owners = await this.getActiveOperationalAlertUsers(input.companyId);
    const amountLabel = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: String(input.currency || 'GBP').toUpperCase(),
    }).format(Math.max(0, Number(input.amountCents || 0)) / 100);
    const summary = input.partial
      ? `${amountLabel} of the booking deposit has been refunded.`
      : `${amountLabel} booking deposit refund completed.`;

    const recipientIds = owners.map((owner: any) => owner.id).filter(Boolean);
    if (recipientIds.length) {
      await this.createForUsers(input.companyId, recipientIds, {
        type: 'booking.deposit.refund_completed',
        title: 'Deposit refund completed',
        body: summary,
        entityType: 'booking',
        entityId: booking.id,
        metaJson: {
          amountCents: input.amountCents,
          currency: input.currency,
          partial: Boolean(input.partial),
          refundedAt: input.refundedAt || null,
        },
      });
    }

    const configuredRecipients = (await this.getWorkspaceInternalEmailRecipients(input.companyId, 'payments')).recipients;
    const attemptedEmails = new Set<string>();
    for (const email of [...owners.map((owner: any) => owner.email), ...configuredRecipients]) {
      const normalized = this.normalizeEmail(email || '');
      if (!normalized || attemptedEmails.has(normalized)) continue;
      attemptedEmails.add(normalized);
      await this.sendNotificationEmail(
        input.companyId,
        normalized,
        'Deposit refund completed',
        summary,
      );
    }

    const bookingRecipient = this.resolveBookingCustomerRecipient(booking, 'billing');
    if (input.notifyCustomer && bookingRecipient?.email) {
      await this.sendNotificationEmail(
        input.companyId,
        bookingRecipient.email,
        'Deposit refund completed',
        [
          `Your deposit refund for ${booking.serviceName || 'your booking'} has completed.`,
          `Refunded amount: ${amountLabel}.`,
          'If you have any questions, reply to this email.',
        ].join('\n'),
      );
    }
  }

  async notifyBillingAdjustmentRecorded(input: {
    companyId: string;
    jobId: string;
    amountCents: number;
    currency: string;
    direction: 'credit' | 'debit';
    reason?: string | null;
    notifyCustomer?: boolean;
  }) {
    if (!isNotificationsV1Enabled()) return;
    const db = this.prisma as any;
    const job = await db.job.findFirst({
      where: { id: input.jobId, companyId: input.companyId },
      include: { createdByUser: true, company: true, customer: true, tradeAccount: { include: { contacts: true } } },
    });
    if (!job) return;

    const owners = await this.getActiveOperationalAlertUsers(input.companyId);
    const recipientMap = new Map<string, string>();
    owners.forEach((owner: any) => {
      const email = this.normalizeDeliverableEmail(owner.email || '');
      if (email) recipientMap.set(owner.id, email);
    });
    const creatorEmail = this.normalizeDeliverableEmail(job.createdByUser?.email || '');
    if (job.createdByUserId && creatorEmail) {
      recipientMap.set(job.createdByUserId, creatorEmail);
    }
    const recipientIds = Array.from(recipientMap.keys());
    const amountLabel = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: String(input.currency || 'GBP').toUpperCase(),
    }).format(Math.max(0, Number(input.amountCents || 0)) / 100);
    const summary = `${input.direction === 'credit' ? 'Credit' : 'Debit'} adjustment recorded for ${job.jobRef || job.id}: ${amountLabel}.`;

    await this.createForUsers(input.companyId, recipientIds, {
      type: 'billing.adjustment.recorded',
      title: `Billing adjustment: ${job.jobRef || job.id}`,
      body: summary,
      entityType: 'job',
      entityId: job.id,
      metaJson: {
        jobRef: job.jobRef,
        amountCents: input.amountCents,
        currency: input.currency,
        direction: input.direction,
      },
    });

    const configuredRecipients = (await this.getWorkspaceInternalEmailRecipients(input.companyId, 'payments')).recipients;
    const attemptedEmails = new Set<string>();
    for (const email of [...recipientMap.values(), ...configuredRecipients]) {
      const normalized = this.normalizeEmail(email || '');
      if (!normalized || attemptedEmails.has(normalized)) continue;
      attemptedEmails.add(normalized);
      await this.sendNotificationEmail(
        input.companyId,
        normalized,
        `Billing adjustment: ${job.jobRef || job.id}`,
        [summary, input.reason ? `Reason: ${input.reason}` : ''].filter(Boolean).join('\n'),
      );
    }

    const customerRecipient = this.resolveJobCustomerRecipients(job, 'billing').selected;
    if (input.notifyCustomer && customerRecipient?.email) {
      await this.sendNotificationEmail(
        input.companyId,
        customerRecipient.email,
        `Invoice update for ${job.jobRef || job.id}`,
        [summary, input.reason ? `Reason: ${input.reason}` : '', 'If you have questions, reply to this email.']
          .filter(Boolean)
          .join('\n'),
      );
    }
  }

  async listByEntity(companyId: string, entityType: string, entityId: string) {
    const db = this.prisma as any;
    const rows = await db.notification.findMany({
      where: { companyId, entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row: any) => ({
      ...this.mapNotification(row),
      title: row.title,
      to: row?.metaJson?.to || null,
      context: this.sanitizeNotificationContext(row?.metaJson?.context || null),
    }));
  }

  private mapNotification(row: any) {
    return {
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      channel: row?.metaJson?.channel || 'in_app',
      status: row?.metaJson?.status || 'sent',
      reasonKey: row?.metaJson?.reasonKey || row.type,
      createdAt: row.createdAt,
      clickedAt: row.clickedAt || null,
      deliveredAt: row.deliveredAt || null,
      conversionAt: row.conversionAt || null,
    };
  }

  async findByIdempotency(companyId: string, idempotencyKey: string) {
    const db = this.prisma as any;
    const row = await db.notification.findFirst({
      where: { companyId, idempotencyKey },
    });
    if (!row) return null;
    return this.mapNotification(row);
  }
  async listCommsByTenant(
    companyId: string,
    options: { since?: Date; reasonKey?: string; reasonKeyPrefix?: string; status?: string; take?: number },
  ) {
    const db = this.prisma as any;
    const since = options.since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const take = Math.max(1, Math.min(100, Number(options.take || 100)));
    const where: any = {
      companyId,
      createdAt: { gte: since },
    };

    const metaFilters: any[] = [];
    if (options.reasonKey) {
      metaFilters.push({ metaJson: { path: ['reasonKey'], equals: options.reasonKey } });
    }
    if (options.reasonKeyPrefix) {
      metaFilters.push({ metaJson: { path: ['reasonKey'], string_starts_with: options.reasonKeyPrefix } });
    }
    if (options.status) {
      metaFilters.push({ metaJson: { path: ['status'], equals: options.status } });
    }
    if (metaFilters.length > 0) {
      where.AND = metaFilters;
    }

    const rows = await db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
    });

    return rows.map((row: any) => ({
      id: row.id,
      title: this.sanitizeInAppMessage(row.title || row.type || 'Workspace message', 120),
      message: this.deriveNotificationBody(row),
      entityType: row.entityType,
      entityId: row.entityId,
      channel: row?.metaJson?.channel || 'in_app',
      status: row?.metaJson?.status || 'queued',
      reasonKey: row?.metaJson?.reasonKey || row.type,
      to: row?.metaJson?.to || null,
      context: this.sanitizeNotificationContext(row?.metaJson?.context || null),
      isRead: Boolean(row.isRead),
      createdAt: row.createdAt,
      scheduledFor: row?.metaJson?.context?.scheduledFor || null,
      clickedAt: row.clickedAt || null,
      deliveredAt: row.deliveredAt || null,
      conversionAt: row.conversionAt || null,
    }));
  }

  async listCommsAutomationsAggregate(
    companyId: string,
    options: { since?: Date },
  ) {
    const db = this.prisma as any;
    const since = options.since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const baseWhere = {
      companyId,
      createdAt: { gte: since },
    };

    const reminders = await db.notification.count({
      where: {
        ...baseWhere,
        AND: [{ metaJson: { path: ['reasonKey'], string_starts_with: 'booking_reminder_' } }],
      },
    });

    const approval = await db.notification.count({
      where: {
        ...baseWhere,
        AND: [{ metaJson: { path: ['reasonKey'], equals: 'approval_request' } }],
      },
    });

    const reviews = await db.notification.count({
      where: {
        ...baseWhere,
        AND: [{ metaJson: { path: ['reasonKey'], equals: 'review_request' } }],
      },
    });

    const failed = await db.notification.count({
      where: {
        ...baseWhere,
        AND: [{ metaJson: { path: ['status'], equals: 'failed' } }],
        OR: [
          { metaJson: { path: ['reasonKey'], string_starts_with: 'booking_reminder_' } },
          { metaJson: { path: ['reasonKey'], equals: 'approval_request' } },
          { metaJson: { path: ['reasonKey'], equals: 'review_request' } },
        ],
      },
    });

    return {
      since: since.toISOString(),
      reminders,
      approval,
      reviews,
      failed,
    };
  }


  async sendEntityUpdate(
    companyId: string,
    actorUserId: string,
    payload: {
      entityType: string;
      entityId: string;
      templateKey: string;
      channel?: string;
      note?: string;
      to?: string;
      context?: Record<string, any>;
      idempotencyKey?: string;
    },
  ) {
    const db = this.prisma as any;
    if (payload.idempotencyKey) {
      const existing = await this.findByIdempotency(companyId, payload.idempotencyKey);
      if (existing) return existing;
    }
    const templateKey = payload.templateKey;
    const channel = payload.channel || 'in_app';
    const note = payload.note ? String(payload.note).slice(0, 500) : null;
    const metaJson = {
      channel,
      status: 'queued',
      reasonKey: templateKey,
      to: payload.to || null,
      context: payload.context || null,
      note,
    };

    let created: any;
    try {
      created = await db.notification.create({
        data: {
          companyId,
          userId: actorUserId,
          type: templateKey,
          title: `${templateKey.replace(/[_\.]/g, ' ')} queued`,
          body: null,
          entityType: payload.entityType,
          entityId: payload.entityId,
          idempotencyKey: payload.idempotencyKey || null,
          metaJson,
        },
      });
    } catch (error: any) {
      if (payload.idempotencyKey && error?.code === 'P2002') {
        const existing = await this.findByIdempotency(companyId, payload.idempotencyKey);
        if (existing) return existing;
      }
      throw error;
    }

    return {
      id: created.id,
      entityType: created.entityType,
      entityId: created.entityId,
      channel,
      status: 'queued',
      reasonKey: templateKey,
      createdAt: created.createdAt,
    };
  }

  async notifyBookingDepositConfirmed(companyId: string, bookingId: string) {
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({
      where: { id: bookingId, companyId },
      select: {
        id: true,
        customerEmail: true,
        customerName: true,
        startsAt: true,
        publicStatusToken: true,
        paymentStateJson: true,
      },
    });
    if (!booking) return null;

    const paymentState =
      booking.paymentStateJson && typeof booking.paymentStateJson === 'object'
        ? booking.paymentStateJson
        : {};
    const amountCents = Math.max(0, Number(paymentState.depositPaidCents || paymentState.depositDueCents || 0));
    const currency = String(paymentState.currency || 'GBP').toUpperCase();
    const amount = new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amountCents / 100);
    const statusUrl = booking.publicStatusToken
      ? buildAppUrl(`/portal/booking/status/${booking.publicStatusToken}`)
      : null;
    const appointment = booking.startsAt
      ? new Date(booking.startsAt).toLocaleString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

    const owners = await db.user.findMany({
      where: { companyId, role: { in: ['OWNER', 'ADMIN'] } },
      select: { id: true },
    });
    await this.createForUsers(
      companyId,
      owners.map((owner: { id: string }) => owner.id),
      {
        type: 'booking.confirmed',
        title: 'Booking confirmed',
        body: 'A customer booking was confirmed after the deposit was paid.',
        entityType: 'booking',
        entityId: booking.id,
        metaJson: {
          reasonKey: 'booking_deposit_confirmed',
          amountCents,
          currency,
        },
      },
    );

    const recipient = this.normalizeDeliverableEmail(booking.customerEmail);
    if (!recipient) return null;
    const lines = [
      `Hello ${String(booking.customerName || 'there').trim()},`,
      '',
      'Your booking is confirmed and your deposit has been paid.',
      appointment ? `Appointment: ${appointment}` : null,
      `Deposit paid: ${amount}`,
      statusUrl ? `View booking: ${statusUrl}` : null,
    ].filter(Boolean);
    return this.sendNotificationEmail(
      companyId,
      recipient,
      'Your booking is confirmed',
      lines.join('\n'),
      undefined,
      undefined,
      {
        category: 'booking_lifecycle',
        templateKey: 'booking_deposit_confirmed',
        suppressFailureAlert: true,
      },
    );
  }

  async submitSupportRequest(input: SupportRequestInput) {
    const supportRecipient = this.normalizeEmail(process.env.SUPPORT_EMAIL || 'support@mytitan.co.uk') || 'support@mytitan.co.uk';
    const safeSubject = this.sanitizeSupportField(input.subject, 140);
    const safeMessage = this.sanitizeSupportField(input.message, 4000);
    const requesterEmail = this.normalizeEmail(input.requesterEmail);
    const requesterName = this.sanitizeSupportField(input.requesterName || '', 120);
    const workspaceName = this.sanitizeSupportField(input.companyName || '', 160);
    const categoryLabel = this.supportCategoryLabel(input.category);
    const subject = `[MyTitan ${input.route === 'workspace' ? 'Workspace' : 'Contact'}] ${categoryLabel}: ${safeSubject || 'Support request'}`;
    const lines = [
      `Route: ${input.route}`,
      `Category: ${categoryLabel}`,
      `Requester: ${requesterName || 'Not provided'}`,
      `Email: ${requesterEmail || 'Not provided'}`,
      `Workspace: ${workspaceName || 'Not provided'}`,
      `Tenant: ${this.sanitizeSupportField(input.companyId || '', 64) || 'Not provided'}`,
      '',
      safeMessage || 'No message provided.',
    ];

    const delivery = await this.email.sendSystemOperationalEmail({
      to: supportRecipient,
      subject,
      text: lines.join('\n'),
      replyToEmail: requesterEmail || null,
    }, {
      category: 'support_request',
      templateKey: 'support_request',
      actorUserId: input.userId || null,
    });

    if (input.companyId && input.userId) {
      await this.createForUsers(input.companyId, [input.userId], {
        type: 'support_request',
        title: delivery.delivered ? 'Support request sent to MyTitan' : 'Support request could not be sent',
        body: delivery.delivered
          ? 'MyTitan received your request and will follow up through the configured support path.'
          : delivery.reason,
        metaJson: {
          category: input.category,
          route: input.route,
          deliveryStatus: delivery.status,
        },
      });
      await this.audit.log(
        input.companyId,
        'support.request',
        `${categoryLabel} request submitted via ${input.route}: ${safeSubject || 'Support request'}`,
        input.userId,
      );
    }

    return {
      ok: delivery.delivered,
      deliveryStatus: delivery.status,
      message: delivery.delivered
        ? 'Your request was sent to MyTitan Support.'
        : delivery.reason || 'MyTitan could not send the request right now.',
    };
  }
}
