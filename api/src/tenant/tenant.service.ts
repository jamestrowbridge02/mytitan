import { isSettingsPrimaryTradeV1Enabled } from '../common/feature-flags';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_PLAN_CODE, PLAN_DEFINITIONS } from '../billing/billing.constants';
import { getBusinessConfig, getInternalNotificationSettings, getOperationalAlertSettings, getPortalControlSettings, normalizeInternalNotificationSettings, normalizePortalControlSettings, normalizeServiceRecordEmailSettings } from '../common/business-config';
import { Role } from '../common/constants';
import { classifyNonRoutableRecipientEmail } from '../common/email-recipient-hygiene';
import { assertPermission } from '../common/permissions';
import { DEFAULT_WORKSPACE_CURRENCY, DEFAULT_WORKSPACE_LOCALE, DEFAULT_WORKSPACE_TIMEZONE } from '../common/geo-defaults';
import {
  getInternalMonitoringSnapshot,
  type InternalMonitoringAction,
  runInternalMonitoringAction,
} from '../common/internal-monitoring';
import { resolveBookingsEnabled } from '../common/workspace-features';
import { getSummarySchedulerStatusSnapshot } from '../common/summary-scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { isPublicBookingRateLimitConfigured } from '../public/public-booking-rate-limit';
import { RedisService } from '../redis/redis.service';
import { UpdateTenantSettingsDto } from './tenant.dto';

@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  private normalizeRecipients(recipients?: string[]) {
    if (!recipients) {
      return undefined;
    }
    return Array.from(
      new Set(
        recipients
          .map((value) => value.trim().toLowerCase())
          .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
          .filter((value) => !classifyNonRoutableRecipientEmail(value)),
      ),
    );
  }

  private sanitizeTenantSettings(settings: any) {
    if (!settings) return settings;
    const {
      smtpHost,
      smtpPort,
      smtpUsername,
      smtpPasswordEncrypted,
      bookingPublicToken,
      bookingIcsToken,
      ...safeSettings
    } = settings;
    return safeSettings;
  }

  private isSafeSignupEmail(user: any) {
    const email = String(user?.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    if (user?.emailVerified === false) return null;
    if (email.includes('support@mytitan') || email.includes('system@mytitan')) return null;
    return email;
  }

  private accountHealthIssue(input: {
    key: string;
    issue: string;
    impact: string;
    safeFix: string;
    action: string;
    actionHref: string;
    autoFixAvailable?: boolean;
    autoFixed?: boolean;
  }) {
    return {
      severity: input.autoFixAvailable ? 'fixable' : 'action_required',
      autoFixAvailable: Boolean(input.autoFixAvailable),
      autoFixed: Boolean(input.autoFixed),
      reviewed: false,
      dismissed: false,
      ...input,
    };
  }

  async ensureTenantSettings(tenantId: string) {
    const db = this.prisma as any;
    const company = await db.company.findUnique({ where: { id: tenantId } });
    if (!company) {
      throw new NotFoundException('Tenant not found');
    }

    const defaultPlan = await db.plan.findFirst({ where: { code: DEFAULT_PLAN_CODE } });

    return db.tenantSetting.upsert({
      where: { tenantId },
      update: {},
      create: {
        tenantId,
        planId: defaultPlan?.id ?? null,
        companyName: company.name,
        defaultCurrency: company.currency ?? DEFAULT_WORKSPACE_CURRENCY,
        defaultLocale: DEFAULT_WORKSPACE_LOCALE,
        defaultTimezone: company.timezone ?? DEFAULT_WORKSPACE_TIMEZONE,
      },
    });
  }

  getSettings(tenantId: string) {
    return this.ensureTenantSettings(tenantId).then((settings: any) => {
      const safeSettings = this.sanitizeTenantSettings(settings);
      return {
        ...safeSettings,
        bookingsEnabled: resolveBookingsEnabled(settings),
        featureBookings: resolveBookingsEnabled(settings),
      };
    });
  }

  async getOperationsReadiness(tenantId: string) {
    const settings = await this.ensureTenantSettings(tenantId);
    const businessConfig = getBusinessConfig(settings);
    const summaryScheduler = getSummarySchedulerStatusSnapshot();
    return {
      checkedAt: new Date().toISOString(),
      scope: 'tenant_business',
      platformDiagnosticsVisible: false,
      runtime: {
        summarySchedulerDeclared: summaryScheduler.status === 'ready',
        summarySchedulerStatus: summaryScheduler.status,
        summarySchedulerDetail:
          summaryScheduler.status === 'ready'
            ? 'Automated business summaries are ready.'
            : 'Automated business summaries need platform attention.',
      },
      workspace: {
        publicBookingConfigured: Boolean(settings?.bookingPublicEnabled && settings?.bookingPublicToken),
        publicBookingEnabled: Boolean(settings?.bookingPublicEnabled),
        customerSenderNameConfigured: Boolean(String(settings?.emailSenderName || '').trim()),
        customerReplyToConfigured: Boolean(String(settings?.emailReplyTo || '').trim()),
        internalNotificationRecipientCount: Array.isArray(settings?.emailNotificationRecipients) ? settings.emailNotificationRecipients.length : 0,
        operationalAlertCategoryCount: Array.isArray((businessConfig as any)?.operationalAlerts?.enabledCategories)
          ? (businessConfig as any).operationalAlerts.enabledCategories.length
          : 0,
      },
      abuseProtection: {
        authThrottleConfigured: true,
        passwordResetThrottleConfigured: true,
        globalBurstThrottleConfigured: true,
        uploadLimitConfigured: true,
        webhookSignatureVerificationConfigured: true,
        publicBookingRateLimitConfigured: isPublicBookingRateLimitConfigured(),
      },
      platformOnly: {
        health: 'available_in_platform_admin',
        uptime: 'available_in_platform_admin',
        backups: 'available_in_platform_admin',
        billingCatalog: 'available_in_platform_admin',
        systemReadiness: 'available_in_platform_admin',
      },
    };
  }

  async getAccountHealth(tenantId: string) {
    const db = this.prisma as any;
    const settings = await this.ensureTenantSettings(tenantId);
    const owners = await db.user.findMany({
      where: { companyId: tenantId, role: { in: ['OWNER', 'ADMIN'] } },
      select: { id: true, email: true, role: true, emailVerified: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      take: 10,
    });
    const safeOwnerEmail = owners.map((owner: any) => this.isSafeSignupEmail(owner)).find(Boolean) || null;
    const businessConfig = getBusinessConfig(settings);
    const portalControls = getPortalControlSettings(settings);
    const bookingWorkflow = (businessConfig as any).bookingWorkflow && typeof (businessConfig as any).bookingWorkflow === 'object'
      ? (businessConfig as any).bookingWorkflow
      : {};
    const visibleBookingServices = await db.service.count({
      where: { companyId: tenantId, isActive: true },
    }).catch(() => 0);
    const [integrationCredentials, syncFailures, mediaStorage, completedEvidenceSample] = await Promise.all([
      db.integrationCredential.findMany({
        where: { tenantId },
        select: { provider: true, status: true, lastErrorCategory: true, lastVerifiedAt: true },
      }).catch(() => []),
      db.integrationOrchestrationEvent.findMany({
        where: {
          tenantId,
          OR: [
            { result: { in: ['failed', 'manual_review'] } },
            { safeCategory: { in: ['provider_error', 'manual_review'] } },
          ],
        },
        select: { provider: true, action: true, result: true, safeCategory: true, message: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }).catch(() => []),
      db.documentArtifact.aggregate({
        where: { tenantId },
        _sum: { sizeBytes: true },
        _count: { _all: true },
      }).catch(() => ({ _sum: { sizeBytes: 0 }, _count: { _all: 0 } })),
      db.job.findMany({
        where: { companyId: tenantId, status: 'COMPLETED' },
        select: { id: true, jobRef: true, assets: { select: { id: true, kind: true }, take: 10 }, signatures: { select: { id: true }, take: 5 } },
        take: 25,
      }).catch(() => []),
    ]);
    const credentialNeedsReconnect = (providers: string[]) =>
      integrationCredentials.some((row: any) => providers.includes(row.provider) && ['NEEDS_REAUTH', 'ERROR', 'needs_reconnect', 'error'].includes(String(row.status)));
    const syncFailureFor = (providers: string[]) => syncFailures.find((row: any) => providers.includes(row.provider));
    const mediaGovernance = (businessConfig as any).mediaGovernance && typeof (businessConfig as any).mediaGovernance === 'object'
      ? (businessConfig as any).mediaGovernance
      : {};
    const storageLimitBytes = Number(mediaGovernance.storageLimitBytes || process.env.ARTIFACT_STORAGE_WARNING_BYTES || 2 * 1024 * 1024 * 1024);
    const storageBytes = Number(mediaStorage?._sum?.sizeBytes || 0);
    const missingEvidenceJob = completedEvidenceSample.find((job: any) => {
      const hasPhoto = Array.isArray(job.assets) && job.assets.some((asset: any) => ['BEFORE', 'AFTER'].includes(asset.kind));
      const hasSignature = Array.isArray(job.signatures) && job.signatures.length > 0;
      return !hasPhoto || !hasSignature;
    });
    const issues: any[] = [];

    if (!String(settings.emailReplyTo || '').trim() && safeOwnerEmail) {
      issues.push(this.accountHealthIssue({
        key: 'company_email_from_verified_owner',
        issue: 'Customer reply-to email is missing.',
        impact: 'Booking, invoice, and portal emails may not give customers a dependable reply path.',
        safeFix: `Use the verified owner/admin sign-up email ${safeOwnerEmail}.`,
        action: 'Fill reply-to email',
        actionHref: '/dashboard/settings#email',
        autoFixAvailable: true,
      }));
    }

    const recipients = Array.isArray(settings.emailNotificationRecipients) ? settings.emailNotificationRecipients : [];
    if (recipients.length === 0 && safeOwnerEmail) {
      issues.push(this.accountHealthIssue({
        key: 'booking_recipient_from_verified_owner',
        issue: 'Booking notification recipient is missing.',
        impact: 'New booking requests may arrive without an internal email recipient.',
        safeFix: `Add ${safeOwnerEmail} as a bookings recipient.`,
        action: 'Add booking recipient',
        actionHref: '/dashboard/settings#notifications',
        autoFixAvailable: true,
      }));
    }

    if (!businessConfig.portalControls) {
      issues.push(this.accountHealthIssue({
        key: 'portal_controls_safe_defaults',
        issue: 'Customer portal controls are not reviewed.',
        impact: 'The public portal will use safe defaults, but owners have not explicitly decided what customers can see or do.',
        safeFix: 'Apply customer-safe portal defaults without enabling private notes or payment-provider changes.',
        action: 'Apply safe portal defaults',
        actionHref: '/dashboard/portal#portal-controls',
        autoFixAvailable: true,
      }));
    }

    if (!(businessConfig as any).bookingWorkflow) {
      issues.push(this.accountHealthIssue({
        key: 'booking_defaults_safe',
        issue: 'Booking workflow defaults have not been reviewed.',
        impact: 'Bookings still work, but location-first assignment, optional technician assignment, and manual review defaults should be explicit.',
        safeFix: 'Apply safe booking defaults: location-first, technician optional, manual review, no customer-money provider changes.',
        action: 'Apply safe booking defaults',
        actionHref: '/dashboard/booking/settings#workflow',
        autoFixAvailable: true,
      }));
    }

    if (!String(settings.billingEmail || '').trim()) {
      issues.push(this.accountHealthIssue({
        key: 'billing_contact_missing',
        issue: 'Billing contact is missing.',
        impact: 'Finance exports and payment follow-up may not have a named business contact.',
        safeFix: 'Choose an owner/admin as the billing contact. MyTitan will not guess or change billing provider settings.',
        action: 'Choose billing contact',
        actionHref: '/dashboard/billing/readiness',
        autoFixAvailable: false,
      }));
    }

    if (portalControls.depositsRequired && !portalControls.allowBookingWithoutDeposit) {
      issues.push(this.accountHealthIssue({
        key: 'deposit_required_provider_readiness',
        issue: 'Deposits are required, but payment readiness must be reviewed.',
        impact: 'Customers may need a safe fallback if tenant-owned collection is not ready. MyTitan Stripe will not collect customer money.',
        safeFix: 'Review customer payment setup or allow booking without deposit until the tenant provider is ready.',
        action: 'Review payment setup',
        actionHref: '/dashboard/billing#customer-payments',
        autoFixAvailable: false,
      }));
    }

    if (portalControls.customerBookingEnabled && visibleBookingServices === 0) {
      issues.push(this.accountHealthIssue({
        key: 'booking_enabled_no_visible_services',
        issue: 'Customer booking is enabled but no active services are visible.',
        impact: 'Customers can reach booking, but may have nothing safe to select.',
        safeFix: 'Publish at least one booking service or temporarily disable customer booking.',
        action: 'Open booking settings',
        actionHref: '/dashboard/booking/settings#services',
        autoFixAvailable: false,
      }));
    }

    if ((bookingWorkflow.autoCreateInvoiceDraftOnCompletion || bookingWorkflow.autoSendInvoiceOnCompletion) && !String(settings.billingEmail || '').trim()) {
      issues.push(this.accountHealthIssue({
        key: 'invoice_automation_missing_billing_contact',
        issue: 'Invoice automation is enabled without a billing contact.',
        impact: 'Drafts can still be created, but customer follow-up has no clear finance contact.',
        safeFix: 'Add a billing contact before relying on invoice automation.',
        action: 'Choose billing contact',
        actionHref: '/dashboard/billing/readiness',
        autoFixAvailable: false,
      }));
    }

    if (syncFailureFor(['XERO', 'QUICKBOOKS']) || credentialNeedsReconnect(['XERO', 'QUICKBOOKS'])) {
      issues.push(this.accountHealthIssue({
        key: 'accounting_reconnect_needed',
        issue: 'Accounting sync needs review or reconnect.',
        impact: 'Invoice/payment export will stay gated until the tenant-owned provider connection is healthy.',
        safeFix: 'Reconnect the accounting provider or review the failed export queue. MyTitan will not submit live accounting data automatically.',
        action: 'Open sync control room',
        actionHref: '/dashboard/integrations#sync-control-room',
        autoFixAvailable: false,
      }));
    }

    if (syncFailureFor(['GOOGLE_CALENDAR', 'MICROSOFT_CALENDAR']) || credentialNeedsReconnect(['GOOGLE_CALENDAR', 'MICROSOFT_CALENDAR'])) {
      issues.push(this.accountHealthIssue({
        key: 'calendar_reconnect_needed',
        issue: 'Calendar sync needs review or reconnect.',
        impact: 'Calendar exports remain queued/dry-run until the tenant-owned calendar connection is healthy.',
        safeFix: 'Reconnect the calendar provider or review calendar conflicts before enabling any live sync flag.',
        action: 'Open sync control room',
        actionHref: '/dashboard/integrations#sync-control-room',
        autoFixAvailable: false,
      }));
    }

    if (syncFailureFor(['GOOGLE_GMAIL', 'MICROSOFT_OUTLOOK']) || credentialNeedsReconnect(['GOOGLE_GMAIL', 'MICROSOFT_OUTLOOK'])) {
      issues.push(this.accountHealthIssue({
        key: 'email_sync_paused',
        issue: 'Email sync is paused or needs reconnecting.',
        impact: 'Communication sync will not run live until tenant-owned OAuth and explicit live flags are ready.',
        safeFix: 'Reconnect email or keep metadata-only communication tracking.',
        action: 'Open sync control room',
        actionHref: '/dashboard/integrations#sync-control-room',
        autoFixAvailable: false,
      }));
    }

    if (storageLimitBytes > 0 && storageBytes >= storageLimitBytes * 0.8) {
      issues.push(this.accountHealthIssue({
        key: 'media_storage_near_limit',
        issue: 'Media storage is nearing the configured warning limit.',
        impact: 'Field uploads may need retention review before evidence volume grows further.',
        safeFix: 'Review retention/export policy. MyTitan will not delete completed-job evidence without explicit action.',
        action: 'Review media governance',
        actionHref: '/dashboard/settings/operations#media-governance',
        autoFixAvailable: false,
      }));
    }

    if (portalControls.portalEnabled && !portalControls.customerBookingEnabled) {
      issues.push(this.accountHealthIssue({
        key: 'portal_enabled_booking_disabled',
        issue: 'Customer portal is enabled while customer booking is disabled.',
        impact: 'Customers can view shared records but cannot self-book from the hub.',
        safeFix: 'Enable customer booking or keep the portal contact message clear.',
        action: 'Review portal controls',
        actionHref: '/dashboard/portal#portal-controls',
        autoFixAvailable: false,
      }));
    }

    if (missingEvidenceJob) {
      issues.push(this.accountHealthIssue({
        key: 'completed_job_missing_required_evidence',
        issue: `Completed job ${missingEvidenceJob.jobRef || missingEvidenceJob.id} is missing required evidence.`,
        impact: 'The permanent job record may be weaker for audit, warranty, or customer handoff.',
        safeFix: 'Open the completed job record and add the missing photo/signature evidence if it exists.',
        action: 'Review job evidence',
        actionHref: `/dashboard/jobs/${missingEvidenceJob.id}`,
        autoFixAvailable: false,
      }));
    }

    return {
      checkedAt: new Date().toISOString(),
      scope: 'tenant_account_health',
      platformDiagnosticsVisible: false,
      summary: {
        openIssues: issues.length,
        autoFixable: issues.filter((issue) => issue.autoFixAvailable).length,
        actionRequired: issues.filter((issue) => !issue.autoFixAvailable).length,
      },
      portalControls,
      issues,
    };
  }

  async applyAccountHealthFix(tenantId: string, userId: string, key: string) {
    const db = this.prisma as any;
    const settings = await this.ensureTenantSettings(tenantId);
    const owner = await db.user.findFirst({
      where: { companyId: tenantId, role: { in: ['OWNER', 'ADMIN'] } },
      select: { email: true, emailVerified: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
    const safeOwnerEmail = this.isSafeSignupEmail(owner);
    const businessConfig = getBusinessConfig(settings);

    if (key === 'company_email_from_verified_owner') {
      if (!safeOwnerEmail) throw new BadRequestException('No verified owner/admin email is available for an automatic fix.');
      const updated = await db.tenantSetting.update({
        where: { tenantId },
        data: { emailReplyTo: safeOwnerEmail },
      });
      await this.audit.log(tenantId, 'tenant.account_health.autofix', 'Filled reply-to email from verified owner/admin sign-up email', userId);
      return { fixed: true, key, settings: this.sanitizeTenantSettings(updated) };
    }

    if (key === 'booking_recipient_from_verified_owner') {
      if (!safeOwnerEmail) throw new BadRequestException('No verified owner/admin email is available for an automatic fix.');
      const nextRecipients = Array.from(new Set([...(Array.isArray(settings.emailNotificationRecipients) ? settings.emailNotificationRecipients : []), safeOwnerEmail]));
      const updated = await db.tenantSetting.update({
        where: { tenantId },
        data: { emailNotificationRecipients: nextRecipients },
      });
      await this.audit.log(tenantId, 'tenant.account_health.autofix', 'Added verified owner/admin email to booking notifications', userId);
      return { fixed: true, key, settings: this.sanitizeTenantSettings(updated) };
    }

    if (key === 'portal_controls_safe_defaults') {
      const portalControls = normalizePortalControlSettings((businessConfig as any).portalControls, settings);
      const updated = await db.tenantSetting.update({
        where: { tenantId },
        data: {
          businessConfigJson: {
            ...businessConfig,
            portalControls,
          },
        },
      });
      await this.audit.log(tenantId, 'tenant.account_health.autofix', 'Applied safe customer portal control defaults', userId);
      return { fixed: true, key, settings: this.sanitizeTenantSettings(updated) };
    }

    if (key === 'booking_defaults_safe') {
      const updated = await db.tenantSetting.update({
        where: { tenantId },
        data: {
          businessConfigJson: {
            ...businessConfig,
            bookingWorkflow: {
              autoCreateJobFromBooking: false,
              autoPopulateJobSheetFromBooking: true,
              autoCreateInvoiceDraftOnCompletion: false,
              autoSendInvoiceOnCompletion: false,
              technicianAssignmentRequired: false,
              manualReviewMode: true,
              autoConfirmPublicBookings: false,
            },
          },
        },
      });
      await this.audit.log(tenantId, 'tenant.account_health.autofix', 'Applied safe booking workflow defaults', userId);
      return { fixed: true, key, settings: this.sanitizeTenantSettings(updated) };
    }

    throw new BadRequestException('This account health item needs manual review before changing data.');
  }

  async getInternalMonitoring(_tenantId: string, options?: { forceRefresh?: boolean }) {
    return getInternalMonitoringSnapshot(this.prisma, this.redis, options);
  }

  async runInternalMonitoringAction(_tenantId: string, action: InternalMonitoringAction) {
    return runInternalMonitoringAction(action, this.prisma, this.redis);
  }

  async getEntitlements(tenantId: string) {
    const db = this.prisma as any;
    const settings = await this.ensureTenantSettings(tenantId);
    const subscription = await db.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });

    let plan = subscription?.plan ?? null;
    if (!plan && settings.planId) {
      plan = await db.plan.findUnique({ where: { id: settings.planId } });
    }
    if (!plan) {
      plan = await db.plan.findFirst({ where: { code: DEFAULT_PLAN_CODE } });
    }

    const planCode = plan?.code || DEFAULT_PLAN_CODE;
    const planFeatures = (plan?.featuresJson ?? PLAN_DEFINITIONS[DEFAULT_PLAN_CODE].features) as Record<string, any>;
    const tenantFlags: Record<string, boolean> = {
      bookings_enabled: resolveBookingsEnabled(settings),
      accounting_enabled: Boolean(settings.featureAccounting ?? settings.accountingEnabled),
      payments_enabled: Boolean(settings.featurePayments ?? settings.paymentsEnabled),
      social_enabled: Boolean(settings.featureSocial ?? settings.socialEnabled),
      ai_enabled: Boolean(settings.featureAI ?? settings.aiEnabled),
    };

    const features = Object.fromEntries(
      Object.entries(planFeatures).map(([key, value]) => {
        if (key in tenantFlags) {
          return [key, Boolean(value) && tenantFlags[key]];
        }
        return [key, value];
      }),
    );

    return {
      planCode,
      features,
    };
  }

  async updateSettings(tenantId: string, userId: string, role: Role, dto: UpdateTenantSettingsDto) {
    const db = this.prisma as any;
    const user = { companyId: tenantId, sub: userId, role, email: '' } as const;

    const settings = await this.ensureTenantSettings(tenantId);
    let plan = null;
    if (settings.planId) {
      plan = await db.plan.findUnique({ where: { id: settings.planId } });
    } else {
      plan = await db.plan.findFirst({ where: { code: DEFAULT_PLAN_CODE } });
    }

    const planLimit = plan?.aiRequestsLimitMonthly ?? PLAN_DEFINITIONS[DEFAULT_PLAN_CODE].aiRequestsLimitMonthly;
    const isEnterprise = plan?.code === 'ENTERPRISE';

    if (dto.defaultCurrency) {
      dto.defaultCurrency = dto.defaultCurrency.toUpperCase().trim();
    }
    if (dto.invoiceCurrency) {
      dto.invoiceCurrency = dto.invoiceCurrency.toUpperCase().trim();
    }
    if (dto.tenantCountry) {
      dto.tenantCountry = dto.tenantCountry.toUpperCase().trim().slice(0, 2);
    }
    if (dto.publicBookingLocale) {
      dto.publicBookingLocale = dto.publicBookingLocale.trim();
    }
    if (dto.phoneCountryCode) {
      dto.phoneCountryCode = dto.phoneCountryCode.trim().slice(0, 8);
    }
    if (dto.taxLabel) {
      dto.taxLabel = dto.taxLabel.trim().slice(0, 40);
    }
    if (dto.invoiceLegalFooter) {
      dto.invoiceLegalFooter = dto.invoiceLegalFooter.trim().slice(0, 1000);
    }

    if (typeof dto.aiRequestsLimit === 'number') {
      if (!isEnterprise && dto.aiRequestsLimit > planLimit) {
        throw new BadRequestException('AI request limit cannot exceed your plan cap.');
      }
      if (isEnterprise && role !== 'OWNER') {
        throw new BadRequestException('Only OWNER can change Enterprise AI limits.');
      }
    }

    const existingBusinessConfig = getBusinessConfig(settings);
    const nextBusinessConfig = dto.businessConfigJson;
    const mergedBusinessConfig =
      nextBusinessConfig && typeof nextBusinessConfig === 'object'
        ? {
            ...existingBusinessConfig,
            ...nextBusinessConfig,
          }
        : null;
    if (
      mergedBusinessConfig &&
      'workflowStages' in mergedBusinessConfig
    ) {
      await assertPermission({
        user,
        permission: 'workflow.manage',
        audit: this.audit,
        action: 'tenant.settings.workflow',
      });
    }

    const shouldNormalizeNotificationRouting =
      Object.prototype.hasOwnProperty.call(dto, 'emailNotificationRecipients') ||
      Boolean(mergedBusinessConfig);
    const rawBusinessConfigSource =
      mergedBusinessConfig
        ? getBusinessConfig({ businessConfigJson: mergedBusinessConfig })
        : existingBusinessConfig;
    const normalizedBusinessConfig =
      mergedBusinessConfig
        ? (() => {
            const raw = rawBusinessConfigSource;
            return {
              ...raw,
              ...(Object.prototype.hasOwnProperty.call(raw, 'serviceRecordEmail')
                ? { serviceRecordEmail: normalizeServiceRecordEmailSettings((raw as any).serviceRecordEmail) }
                : {}),
              ...(Object.prototype.hasOwnProperty.call(raw, 'operationalAlerts')
                ? { operationalAlerts: getOperationalAlertSettings({ businessConfigJson: { operationalAlerts: (raw as any).operationalAlerts } }) }
                : {}),
              ...(shouldNormalizeNotificationRouting
                ? {
                    notificationRouting: normalizeInternalNotificationSettings(
                      (raw as any).notificationRouting,
                      dto.emailNotificationRecipients,
                    ),
                  }
                : {}),
            };
          })()
        : shouldNormalizeNotificationRouting
          ? {
              ...rawBusinessConfigSource,
              notificationRouting: normalizeInternalNotificationSettings(
                (rawBusinessConfigSource as any).notificationRouting,
                dto.emailNotificationRecipients,
              ),
            }
          : undefined;
    const normalizedNotificationRecipients = getInternalNotificationSettings({
      businessConfigJson: normalizedBusinessConfig ?? settings.businessConfigJson,
      emailNotificationRecipients: dto.emailNotificationRecipients,
    }).internalRecipients
      .filter((recipient) => recipient.enabled)
      .map((recipient) => recipient.email);

    const payload: Record<string, any> = {
      ...dto,
      emailNotificationRecipients:
        Object.prototype.hasOwnProperty.call(dto, 'emailNotificationRecipients') || normalizedBusinessConfig
          ? normalizedNotificationRecipients
          : this.normalizeRecipients(dto.emailNotificationRecipients),
      businessConfigJson: normalizedBusinessConfig,
      defaultItems: dto.defaultItems ?? undefined,
      defaultServiceNamePresets: dto.defaultServiceNamePresets ?? undefined,
    };

    if (typeof dto.bookingsEnabled === 'boolean' || typeof dto.featureBookings === 'boolean') {
      const bookingsEnabled = typeof dto.bookingsEnabled === 'boolean' ? dto.bookingsEnabled : Boolean(dto.featureBookings);
      payload.bookingsEnabled = bookingsEnabled;
      payload.featureBookings = bookingsEnabled;
    }

    if (dto.bookingPublicEnabled && !settings.bookingPublicToken) {
      payload.bookingPublicToken = crypto.randomBytes(24).toString('base64url');
    }
    if (dto.bookingPublicEnabled && !settings.bookingIcsToken) {
      payload.bookingIcsToken = crypto.randomBytes(24).toString('base64url');
    }

    const updated = await db.tenantSetting.upsert({
      where: { tenantId },
      update: payload,
      create: {
        tenantId,
        ...payload,
      },
    });

    const companyName = typeof dto.companyName === 'string' ? dto.companyName.trim() : '';
    if (companyName) {
      await db.company.update({
        where: { id: tenantId },
        data: { name: companyName },
      });
    }

    await this.audit.log(tenantId, 'tenant.settings.update', 'Tenant settings updated', userId);
    const safeUpdated = this.sanitizeTenantSettings(updated);
    return {
      ...safeUpdated,
      bookingsEnabled: resolveBookingsEnabled(updated),
      featureBookings: resolveBookingsEnabled(updated),
    };
  }

  async saveUploadedLogo(tenantId: string, userId: string, fileName: string) {
    const db = this.prisma as any;
    if (!fileName) {
      throw new BadRequestException('File name is required');
    }

    const logoUrl = `/tenant/public-logo/${encodeURIComponent(fileName)}`;
    const updated = await db.tenantSetting.upsert({
      where: { tenantId },
      update: { logoUrl },
      create: { tenantId, logoUrl },
    });

    await this.audit.log(tenantId, 'tenant.logo.upload', `Uploaded tenant logo ${fileName}`, userId);

    return { logoUrl: updated.logoUrl };
  }

  async setLogoUrl(tenantId: string, userId: string, logoUrl: string) {
    const db = this.prisma as any;
    const updated = await db.tenantSetting.upsert({
      where: { tenantId },
      update: { logoUrl },
      create: { tenantId, logoUrl },
    });

    await this.audit.log(tenantId, 'tenant.logo.set', 'Tenant logo URL updated', userId);

    return { logoUrl: updated.logoUrl };
  }
}
