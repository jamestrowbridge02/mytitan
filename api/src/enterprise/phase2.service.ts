import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { getBackupReadinessSnapshot } from '../common/backup-readiness';
import { EnterpriseFeatureFlagsService } from './enterprise-feature-flags.service';

const INTEGRATION_PROVIDERS = [
  'xero',
  'quickbooks',
  'google_calendar',
  'microsoft_calendar',
  'apple_ical',
  'gmail',
  'outlook',
] as const;

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function money(cents: number) {
  return Math.round(Number(cents || 0));
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function providerEnum(provider: string) {
  if (provider === 'quickbooks') return 'QUICKBOOKS';
  if (provider === 'google_calendar') return 'GOOGLE_CALENDAR';
  if (provider === 'microsoft_calendar') return 'MICROSOFT_CALENDAR';
  if (provider === 'apple_ical') return 'APPLE_ICAL';
  return provider.toUpperCase();
}

@Injectable()
export class Phase2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly flags: EnterpriseFeatureFlagsService,
  ) {}

  private async tenantSettings(tenantId: string) {
    return (this.prisma as any).tenantSetting.findUnique({ where: { tenantId } }).catch(() => null);
  }

  private async flagState(tenantId: string, userId?: string | null) {
    const keys = [
      'phase2_category_leader_v1',
      'accounting_sync_v1',
      'accounting_live_xero_v1',
      'accounting_live_quickbooks_v1',
      'offline_field_service_v2',
      'enterprise_report_builder_v1',
      'operational_ai_readiness_v1',
      'white_label_readiness_v1',
    ] as const;
    const rows = await Promise.all(keys.map((key) => this.flags.resolve({ tenantId, userId: userId || undefined, key })));
    return rows.reduce((acc, row) => {
      acc[row.key] = { enabled: row.enabled, source: row.source };
      return acc;
    }, {} as Record<string, { enabled: boolean; source: string }>);
  }

  private async baseData(tenantId: string) {
    const db = this.prisma as any;
    const [
      settings,
      credentials,
      jobs,
      bookings,
      users,
      locations,
      stock,
      jobParts,
      artifacts,
      executions,
      notifications,
      auditEvents,
    ] = await Promise.all([
      this.tenantSettings(tenantId),
      db.integrationCredential.findMany({ where: { tenantId } }).catch(() => []),
      db.job.findMany({ where: { companyId: tenantId }, orderBy: { createdAt: 'desc' }, take: 250 }).catch(() => []),
      db.booking.findMany({ where: { companyId: tenantId }, orderBy: { createdAt: 'desc' }, take: 250 }).catch(() => []),
      db.user.findMany({ where: { companyId: tenantId }, select: { id: true, name: true, email: true, role: true, active: true } }).catch(() => []),
      db.location.findMany({ where: { companyId: tenantId }, orderBy: { createdAt: 'asc' }, take: 100 }).catch(() => []),
      db.inventoryStock.findMany({ where: { tenantId }, take: 250 }).catch(() => []),
      db.jobPart.findMany({ where: { tenantId }, take: 250 }).catch(() => []),
      db.documentArtifact.findMany({ where: { tenantId }, take: 250 }).catch(() => []),
      db.jobExecutionRecord.findMany({ where: { tenantId }, take: 250 }).catch(() => []),
      db.notification.findMany({ where: { companyId: tenantId }, orderBy: { createdAt: 'desc' }, take: 100 }).catch(() => []),
      db.auditEvent.findMany({ where: { companyId: tenantId }, orderBy: { createdAt: 'desc' }, take: 100 }).catch(() => []),
    ]);
    return { settings, credentials, jobs, bookings, users, locations, stock, jobParts, artifacts, executions, notifications, auditEvents };
  }

  private buildIntegrations(data: any, flags: Record<string, { enabled: boolean }>) {
    return {
      liveProviderMutation: false,
      tenantOwnedByog: true,
      providers: INTEGRATION_PROVIDERS.map((provider) => {
        const credential = data.credentials.find((row: any) => String(row.provider) === providerEnum(provider));
        const accountingLiveFlag = provider === 'xero'
          ? 'accounting_live_xero_v1'
          : provider === 'quickbooks'
            ? 'accounting_live_quickbooks_v1'
            : null;
        const supported = provider !== 'apple_ical' || true;
        const connected = Boolean(credential?.status === 'CONNECTED');
        const liveEnabled = provider === 'xero' || provider === 'quickbooks'
          ? Boolean(flags.accounting_sync_v1?.enabled && accountingLiveFlag && flags[accountingLiveFlag]?.enabled && connected && credential?.lastVerifiedAt)
          : false;
        const lastCheckedAt = credential?.lastVerifiedAt || credential?.updatedAt || null;
        const safeErrorCategory = credential?.status === 'NEEDS_RECONNECT'
          ? 'needs_reconnect'
          : credential?.lastErrorCode
            ? 'provider_setup_error'
            : connected
              ? 'none'
              : 'setup_needed';
        return {
          provider,
          status: connected ? 'connected' : 'setup_needed',
          connectionState: connected ? 'connected' : 'not_connected',
          capabilityState: liveEnabled ? 'live_gated_ready' : connected ? 'dry_run_ready' : 'setup_needed',
          connected,
          liveEnabled,
          supported,
          lastCheckedAt,
          setupAction: connected ? 'Review mappings and run dry-run validation.' : 'Connect tenant-owned provider credentials.',
          reconnectAction: connected ? 'Reconnect only if health check reports needs_reconnect.' : 'Connect provider account before reconnect is available.',
          dryRunValidation: {
            available: provider !== 'apple_ical',
            status: connected ? 'ready_to_run' : 'setup_needed',
            submitsLiveData: false,
          },
          safeErrorCategory,
          auditTrail: {
            required: true,
            events: ['connect', 'reconnect', 'disconnect', 'dry_run', 'live_sync_attempt'],
          },
          encryptedServerSide: connected ? Boolean(credential?.encryptedSecretMaterial || credential?.encryptedPayload) : true,
          tokensReturnedToClient: false,
          featureFlagRequired: accountingLiveFlag || `${provider}_byog_v1`,
          capabilities: provider === 'apple_ical'
            ? ['safe_ical_feed_contract', 'private_token_required', 'no_public_booking_data']
            : ['tenant_owned_oauth', 'dry_run_preview', 'export_queue', 'audit_trail'],
          nextAction: liveEnabled
            ? 'Monitor first live sync through the tenant-owned provider queue.'
            : connected
              ? 'Run dry-run validation and enable the explicit live flag only after provider verification.'
              : 'Connect the tenant-owned provider account and verify scopes.',
        };
      }),
    };
  }

  private buildAccountingPreLaunch(data: any, flags: Record<string, { enabled: boolean }>) {
    const invoices = data.jobs.filter((job: any) => job.invoiceIssuedAt || money(job.totalCents) > 0);
    const payments = data.jobs.filter((job: any) => job.invoicePaidAt);
    const customers = new Set(data.jobs.map((job: any) => job.customerId).filter(Boolean));
    const duplicateRefs = new Set<string>();
    const seenRefs = new Set<string>();
    for (const job of data.jobs) {
      const ref = String(job.invoiceNumber || job.jobRef || '').trim();
      if (!ref) continue;
      if (seenRefs.has(ref)) duplicateRefs.add(ref);
      seenRefs.add(ref);
    }
    return {
      status: flags.accounting_sync_v1?.enabled ? 'pre_launch_ready' : 'pre_launch_feature_gated',
      liveSubmissionEnabled: false,
      liveSubmissionRequires: ['tenant_oauth_verified', 'provider_mapping_ready', 'explicit_live_provider_flag'],
      invoiceExportPreview: {
        count: invoices.length,
        sampleRefs: invoices.slice(0, 5).map((job: any) => job.invoiceNumber || job.jobRef || job.id),
      },
      paymentExportPreview: {
        count: payments.length,
        sampleRefs: payments.slice(0, 5).map((job: any) => job.invoiceNumber || job.jobRef || job.id),
      },
      customerContactMappingPreview: {
        count: customers.size,
        strategy: 'match_by_tenant_customer_id_then_email_when_available',
      },
      vatTaxCodeMappingPreview: {
        status: 'mapping_required_before_live_sync',
        overwritesLedger: false,
      },
      duplicateDetection: {
        status: duplicateRefs.size ? 'manual_review_required' : 'ready',
        duplicateRefs: Array.from(duplicateRefs).slice(0, 10),
        idempotencyKeySource: 'tenant_provider_invoice_ref',
      },
      queues: {
        syncConflict: { status: 'ready_for_manual_review', count: duplicateRefs.size },
        failedSyncRetry: { status: 'ready_with_backoff', count: 0 },
        manualReview: { status: duplicateRefs.size ? 'required' : 'available', count: duplicateRefs.size },
      },
    };
  }

  private buildOffline(data: any, flags: Record<string, { enabled: boolean }>) {
    const assignedJobs = data.jobs.filter((job: any) => job.assignedUserId && !['COMPLETED', 'CANCELLED'].includes(String(job.status)));
    const evidenceCount = data.artifacts.length + data.executions.length;
    return {
      status: flags.offline_field_service_v2?.enabled ? 'ready_for_controlled_beta' : 'foundation_ready_feature_gated',
      fullAuthenticatedAppCaching: false,
      storesSecretsOrTokens: false,
      packetScope: 'assigned_jobs_only',
      packetDownload: {
        status: 'available_for_assigned_jobs',
        includes: ['customer_job_summary', 'services', 'materials', 'completion_notes', 'evidence_queue_metadata'],
        excludes: ['secrets', 'oauth_tokens', 'unassigned_jobs', 'full_authenticated_app_cache'],
      },
      architecture: ['service_worker_registration', 'indexeddb_binary_queue', 'idempotent_sync_endpoint', 'conflict_review'],
      supportedActions: ['view_assigned_jobs', 'complete_job', 'capture_photos', 'capture_signature', 'record_materials', 'record_payment_notes', 'sync_on_reconnect'],
      queues: [
        { key: 'before_photos', state: 'queued', retryable: true, conflictAware: true },
        { key: 'after_photos', state: 'queued', retryable: true, conflictAware: true },
        { key: 'signature', state: 'queued', retryable: true, conflictAware: true },
        { key: 'materials', state: 'queued', retryable: true, conflictAware: true },
        { key: 'payment_note', state: 'queued', retryable: true, conflictAware: true },
      ],
      queueControls: ['clear_failed_item', 'retry_failed_item', 'retry_all', 'review_conflict'],
      syncStates: ['saved_offline', 'queued', 'syncing', 'conflict', 'uploaded', 'synced'],
      evidence: {
        assignedJobCount: assignedJobs.length,
        retainedEvidenceRecords: evidenceCount,
        materialUsageRows: data.jobParts.length,
      },
      nextAction: flags.offline_field_service_v2?.enabled
        ? 'Run controlled mobile beta with conflict review enabled.'
        : 'Enable offline_field_service_v2 only after mobile beta acceptance.',
    };
  }

  private buildReports(data: any, flags: Record<string, { enabled: boolean }>) {
    const completed = data.jobs.filter((job: any) => job.completedAt || String(job.status) === 'COMPLETED');
    const paid = data.jobs.filter((job: any) => job.invoicePaidAt);
    const invoiced = data.jobs.filter((job: any) => job.invoiceIssuedAt);
    const unpaid = invoiced.filter((job: any) => !job.invoicePaidAt);
    const totalRevenue = data.jobs.reduce((sum: number, job: any) => sum + money(job.totalCents), 0);
    const materialCost = data.jobParts.reduce((sum: number, part: any) => sum + money(part.unitCostCents) * Number(part.quantityUsed || 0), 0);
    const byService = new Map<string, { jobs: number; revenueCents: number; materialCostCents: number }>();
    const byLocation = new Map<string, { jobs: number; revenueCents: number }>();
    const byTechnician = new Map<string, { jobs: number; completed: number; revenueCents: number }>();
    for (const job of data.jobs) {
      const service = String(job.serviceName || job.jobType || 'Unspecified service');
      const location = String(job.locationId || 'unassigned');
      const tech = String(job.assignedUserId || 'unassigned');
      byService.set(service, {
        jobs: (byService.get(service)?.jobs || 0) + 1,
        revenueCents: (byService.get(service)?.revenueCents || 0) + money(job.totalCents),
        materialCostCents: byService.get(service)?.materialCostCents || 0,
      });
      byLocation.set(location, {
        jobs: (byLocation.get(location)?.jobs || 0) + 1,
        revenueCents: (byLocation.get(location)?.revenueCents || 0) + money(job.totalCents),
      });
      byTechnician.set(tech, {
        jobs: (byTechnician.get(tech)?.jobs || 0) + 1,
        completed: (byTechnician.get(tech)?.completed || 0) + (job.completedAt || String(job.status) === 'COMPLETED' ? 1 : 0),
        revenueCents: (byTechnician.get(tech)?.revenueCents || 0) + money(job.totalCents),
      });
    }
    const lowStock = data.stock.filter((row: any) => Number(row.quantityOnHand || 0) <= Number(row.reorderPoint || 0));
    const repeatCustomers = new Set<string>();
    const seenCustomers = new Set<string>();
    for (const job of data.jobs) {
      if (!job.customerId) continue;
      if (seenCustomers.has(job.customerId)) repeatCustomers.add(job.customerId);
      seenCustomers.add(job.customerId);
    }
    return {
      status: flags.enterprise_report_builder_v1?.enabled ? 'ready' : 'ready_feature_gated',
      realDataOnly: true,
      fakeForecasting: false,
      savedReportsSupported: true,
      savedTemplates: [
        'profit_by_service',
        'profit_by_location',
        'profit_by_technician',
        'utilisation',
        'repeat_booking_rate',
        'customer_lifetime_value',
        'unpaid_invoices',
        'low_stock',
        'completion_velocity',
        'payment_collection_time',
      ],
      roleScopedAccess: true,
      exportAuditAction: 'phase2.report.export',
      scheduledReports: { status: 'readiness_only', requires: ['recipient_scope', 'export_schedule', 'email_readiness'] },
      exports: ['csv', 'pdf_readiness'],
      metrics: {
        profitByService: Array.from(byService.entries()).slice(0, 6).map(([name, row]) => ({ name, ...row, profitCents: row.revenueCents - row.materialCostCents })),
        profitByLocation: Array.from(byLocation.entries()).slice(0, 6).map(([locationId, row]) => ({ locationId, ...row })),
        profitByTechnician: Array.from(byTechnician.entries()).slice(0, 6).map(([technicianId, row]) => ({ technicianId, ...row })),
        utilisation: { assignedJobs: data.jobs.filter((job: any) => job.assignedUserId).length, totalJobs: data.jobs.length, rate: percent(data.jobs.filter((job: any) => job.assignedUserId).length, data.jobs.length) },
        repeatBookingRate: percent(repeatCustomers.size, seenCustomers.size),
        customerLifetimeValueCents: seenCustomers.size ? Math.round(totalRevenue / seenCustomers.size) : 0,
        unpaidInvoices: { count: unpaid.length, amountCents: unpaid.reduce((sum: number, job: any) => sum + money(job.totalCents), 0) },
        lowStock: { count: lowStock.length },
        completionVelocity: { completed: completed.length, total: data.jobs.length, rate: percent(completed.length, data.jobs.length) },
        invoiceCollectionRate: percent(paid.length, invoiced.length),
      },
    };
  }

  private buildTechnicianMobile(data: any) {
    return {
      home: 'My Day',
      hiddenNoise: ['admin_accounting_setup', 'platform_diagnostics', 'billing_catalog'],
      primaryActions: ['My Day', 'Next Job', 'Get Directions', 'Start Work', 'Add Before Photos', 'Complete Job', 'Add After Photos', 'Capture Signature', 'Record Materials', 'Sync Status'],
      touchTargetPolicy: 'large_field_safe_controls',
      assignedJobs: data.jobs.filter((job: any) => job.assignedUserId && !['COMPLETED', 'CANCELLED'].includes(String(job.status))).slice(0, 8).map((job: any) => ({
        id: job.id,
        jobRef: job.jobRef,
        status: job.status,
        customerName: job.customerName,
        scheduledAt: job.scheduledAt,
      })),
    };
  }

  private buildAiReadiness(data: any, flags: Record<string, { enabled: boolean }>) {
    const overdueInvoices = data.jobs.filter((job: any) => job.invoiceIssuedAt && !job.invoicePaidAt && job.invoiceDueAt && new Date(job.invoiceDueAt).getTime() < Date.now());
    const missingPhotos = data.jobs.filter((job: any) => (job.completedAt || String(job.status) === 'COMPLETED') && !data.artifacts.some((artifact: any) => artifact.entityId === job.id));
    const incompletePaperwork = data.jobs.filter((job: any) => (job.completedAt || String(job.status) === 'COMPLETED') && !data.executions.some((record: any) => record.jobId === job.id));
    const openBookings = data.bookings.filter((booking: any) => !booking.jobId && !['CANCELLED', 'NO_SHOW'].includes(String(booking.status)));
    return {
      status: flags.operational_ai_readiness_v1?.enabled ? 'ready_optional_recommendations' : 'readiness_only',
      modelCallsEnabled: false,
      autonomousChanges: false,
      recommendations: [
        { key: 'scheduling_suggestions', label: 'Scheduling suggestions', evidenceCount: openBookings.length, action: 'Review open bookings and technician capacity.' },
        { key: 'technician_match', label: 'Technician match suggestions', evidenceCount: data.users.filter((user: any) => ['STAFF', 'TECHNICIAN'].includes(String(user.role))).length, action: 'Use role, assignment, and location evidence before assigning.' },
        { key: 'missing_photo_warning', label: 'Missing-photo warnings', evidenceCount: missingPhotos.length, action: 'Ask technician to attach before/after evidence.' },
        { key: 'incomplete_paperwork', label: 'Incomplete-paperwork warnings', evidenceCount: incompletePaperwork.length, action: 'Complete the job sheet before sharing or invoicing.' },
        { key: 'overdue_invoice_risk', label: 'Overdue invoice risk signals', evidenceCount: overdueInvoices.length, action: 'Review unpaid invoices and safe reminder settings.' },
        { key: 'rebooking_opportunity', label: 'Rebooking opportunity signals', evidenceCount: data.jobs.filter((job: any) => job.completedAt).length, action: 'Offer a repeat booking only when opt-out and rate limits allow.' },
      ],
    };
  }

  private buildMultiLocation(data: any) {
    return {
      model: ['parent_company', 'region', 'branch', 'depot', 'location', 'team'],
      currentLocations: data.locations.map((location: any) => ({ id: location.id, name: location.name, kind: location.kind || 'location' })),
      branchPermissions: 'role_scoped_reporting_and_location_memberships',
      crossBranchDashboard: 'authorised_roles_only',
      tenantIsolation: true,
      reportingScopes: ['tenant', 'location', 'team', 'technician'],
    };
  }

  private buildWhiteLabel(data: any, flags: Record<string, { enabled: boolean }>) {
    const settings = data.settings || {};
    const config = asObject(settings.businessConfigJson);
    return {
      status: flags.white_label_readiness_v1?.enabled ? 'ready' : 'ready_feature_gated',
      tenantLogo: Boolean(settings.logoUrl),
      brandColours: {
        primaryConfigured: Boolean(settings.brandPrimaryColor),
        secondaryConfigured: Boolean(settings.brandSecondaryColor),
        accentConfigured: Boolean(settings.brandAccentColor),
      },
      surfaces: ['booking_portal', 'customer_portal', 'email_branding'],
      customDomain: {
        status: config.customDomain?.hostname ? 'configured_pending_dns_verification' : 'readiness_only',
        hostnameConfigured: Boolean(config.customDomain?.hostname),
        privateDnsValuesExposed: false,
      },
      poweredByControls: {
        status: 'tier_gated',
        allowedTiers: ['enterprise', 'custom'],
      },
    };
  }

  private buildGrowth(data: any) {
    const completedJobs = data.jobs.filter((job: any) => job.completedAt || String(job.status) === 'COMPLETED');
    const abandonedBookings = data.bookings.filter((booking: any) => !booking.jobId && ['PLANNED', 'REQUESTED'].includes(String(booking.status)));
    return {
      safety: { optOutRequired: true, rateLimited: true, tenantSettingsRespected: true, noSpamLoops: true },
      tools: [
        { key: 'review_requests', status: 'ready_safe_queue', evidenceCount: completedJobs.length },
        { key: 'review_request_after_completed_job', status: 'ready_safe_queue', evidenceCount: completedJobs.length },
        { key: 'google_review_prompts', status: 'readiness_only', evidenceCount: completedJobs.length },
        { key: 'rebooking_automation', status: 'ready_safe_queue', evidenceCount: completedJobs.length },
        { key: 'seasonal_reminder', status: 'ready_safe_queue', evidenceCount: completedJobs.length },
        { key: 'abandoned_booking_recovery', status: 'ready_safe_queue', evidenceCount: abandonedBookings.length },
        { key: 'campaign_readiness', status: 'readiness_only', evidenceCount: data.notifications.length },
        { key: 'lead_attribution', status: 'ready_from_booking_source', evidenceCount: data.bookings.length },
        { key: 'customer_win_back', status: 'ready_safe_queue', evidenceCount: completedJobs.length },
      ],
    };
  }

  private buildAccreditation(data: any) {
    const backup = getBackupReadinessSnapshot();
    return {
      backupRestoreEvidence: {
        status: backup.status,
        lastBackupAt: backup.lastBackupAt,
        lastRestoreDrillAt: backup.lastRestoreDrillAt,
      },
      externalMonitoringVisibleToTenant: false,
      platformMonitorSetup: 'platform_admin_only_intentionally_deferred',
      trustPack: [
        'audit_exports',
        'sla_reporting_readiness',
        'security_control_register',
        'incident_response_checklist',
        'disaster_recovery_docs',
        'data_retention_overview',
        'access_review_reports',
        'penetration_test_readiness_checklist',
        'soc2_style_evidence_folder',
      ],
      evidence: {
        auditEvents: data.auditEvents.length,
        documentArtifacts: data.artifacts.length,
        tenantIsolation: true,
      },
    };
  }

  async getOverview(tenantId: string, userId?: string | null) {
    const [flags, data] = await Promise.all([this.flagState(tenantId, userId), this.baseData(tenantId)]);
    return {
      stage: 'phase_2_category_leader_readiness',
      generatedAt: new Date().toISOString(),
      truthContract: {
        stripeMutation: false,
        liveExternalMutationWithoutExplicitConfig: false,
        secretsReturnedToClient: false,
        fakeAiOrReporting: false,
        tenantIsolation: true,
      },
      featureFlags: flags,
      integrations: this.buildIntegrations(data, flags),
      offlineFieldService: this.buildOffline(data, flags),
      reportBuilder: this.buildReports(data, flags),
      accountingPreLaunch: this.buildAccountingPreLaunch(data, flags),
      technicianMobile: this.buildTechnicianMobile(data),
      aiReadiness: this.buildAiReadiness(data, flags),
      multiLocation: this.buildMultiLocation(data),
      whiteLabel: this.buildWhiteLabel(data, flags),
      customerAcquisition: this.buildGrowth(data),
      accreditation: this.buildAccreditation(data),
      designSystemV2: {
        status: 'consolidated_foundation',
        tokens: ['spacing', 'typography', 'surface', 'status_chip', 'table', 'form', 'button', 'focus', 'mobile_rhythm'],
        target: 'premium_enterprise_operational_os',
      },
    };
  }

  async exportReportCsv(tenantId: string, userId: string | undefined, report: string) {
    const overview = await this.getOverview(tenantId, userId);
    const safeReport = String(report || 'summary').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60) || 'summary';
    const rows = [
      ['report', safeReport],
      ['generated_at', overview.generatedAt],
      ['real_data_only', String(overview.reportBuilder.realDataOnly)],
      ['jobs_total', String(overview.reportBuilder.metrics.completionVelocity.total)],
      ['jobs_completed', String(overview.reportBuilder.metrics.completionVelocity.completed)],
      ['unpaid_invoice_count', String(overview.reportBuilder.metrics.unpaidInvoices.count)],
      ['low_stock_count', String(overview.reportBuilder.metrics.lowStock.count)],
    ];
    await this.audit.log(tenantId, 'phase2.report.export', `Exported Phase 2 report ${safeReport}`, userId);
    return {
      filename: `mytitan-phase2-${safeReport}.csv`,
      csv: rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n'),
    };
  }
}
