import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { EnterpriseFeatureFlagsService } from './enterprise-feature-flags.service';

const ACCOUNTING_PROVIDERS = ['xero', 'quickbooks', 'sage'] as const;
const CALENDAR_PROVIDERS = ['google_calendar', 'microsoft_calendar', 'apple_ical'] as const;
const LIVE_ACCOUNTING_PROVIDERS = ['xero', 'quickbooks'] as const;
const EMAIL_SYNC_PROVIDERS = ['gmail', 'outlook'] as const;
const OFFLINE_MUTATION_TYPES = ['status_change', 'photo_metadata', 'signature_metadata', 'completion_notes', 'material_usage', 'payment_note', 'binary_attachment'] as const;
const OFFLINE_EVIDENCE_TYPES = ['before_photo', 'after_photo', 'video', 'document', 'signature', 'supporting_document', 'payment_evidence', 'compliance_document'];
const OFFLINE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime', 'application/pdf', 'text/plain'];
const DEFAULT_WIDGETS = [
  'outstanding_payments',
  'low_stock',
  'booking_conversion',
  'job_completion_velocity',
] as const;

type AccountingProvider = (typeof ACCOUNTING_PROVIDERS)[number];
type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];
type OfflineMutationType = (typeof OFFLINE_MUTATION_TYPES)[number];

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function cleanId(value: unknown, label: string) {
  const clean = String(value || '').trim();
  if (!clean || clean.length > 160) throw new BadRequestException(`${label} is required`);
  return clean;
}

function csvEscape(value: unknown) {
  const clean = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
  return /[",]/.test(clean) ? `"${clean.replace(/"/g, '""')}"` : clean;
}

@Injectable()
export class Phase1KService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly enterpriseFlags: EnterpriseFeatureFlagsService,
  ) {}

  private providerStatus(connected: any, featureEnabled: boolean) {
    if (!featureEnabled) return 'setup_needed';
    if (!connected) return 'setup_needed';
    if (connected.status === 'NEEDS_REAUTH' || connected.status === 'needs_reconnect') return 'needs_reconnect';
    if (connected.status === 'ERROR' || connected.status === 'error') return 'error';
    return 'ready';
  }

  private async tenantSettings(tenantId: string) {
    return (this.prisma as any).tenantSetting.findUnique({ where: { tenantId } });
  }

  private async accountingFlagState(tenantId: string, userId?: string | null) {
    const [sync, xero, quickbooks] = await Promise.all([
      this.enterpriseFlags.resolve({ tenantId, userId: userId || undefined, key: 'accounting_sync_v1' }),
      this.enterpriseFlags.resolve({ tenantId, userId: userId || undefined, key: 'accounting_live_xero_v1' }),
      this.enterpriseFlags.resolve({ tenantId, userId: userId || undefined, key: 'accounting_live_quickbooks_v1' }),
    ]);
    return {
      accounting_sync_v1: Boolean(sync.enabled),
      accounting_live_xero_v1: Boolean(xero.enabled),
      accounting_live_quickbooks_v1: Boolean(quickbooks.enabled),
      sources: {
        accounting_sync_v1: sync.source,
        accounting_live_xero_v1: xero.source,
        accounting_live_quickbooks_v1: quickbooks.source,
      },
    };
  }

  private accountingProviderEnum(provider: string) {
    return provider === 'quickbooks' ? 'QUICKBOOKS' : provider.toUpperCase();
  }

  private accountingLiveFlagKey(provider: string) {
    return provider === 'xero' ? 'accounting_live_xero_v1' : provider === 'quickbooks' ? 'accounting_live_quickbooks_v1' : null;
  }

  private credentialVerified(credential: any) {
    return Boolean(credential && credential.status === 'CONNECTED' && credential.encryptedSecretMaterial && credential.lastVerifiedAt);
  }

  private safeCredentialMetadata(metadata: unknown) {
    const meta = asObject(metadata);
    return {
      tenantProviderAccountIdPresent: Boolean(meta.tenantId || meta.realmId || meta.organisationId || meta.accountId),
      scopesPresent: Array.isArray(meta.scopes) ? meta.scopes.length : 0,
      liveSyncOptIn: Boolean(meta.liveSyncOptIn),
      mappingVersion: typeof meta.mappingVersion === 'string' ? meta.mappingVersion.slice(0, 40) : null,
      lastSyncAt: typeof meta.lastSyncAt === 'string' ? meta.lastSyncAt : null,
    };
  }

  private idempotencyKey(provider: string, entityType: string, entityId: string, body: any) {
    const provided = String(body?.idempotencyKey || '').trim();
    if (provided) return provided.slice(0, 160);
    return `${provider}:${entityType}:${entityId}`.slice(0, 160);
  }

  async getAudit(tenantId: string) {
    const db = this.prisma as any;
    const [settings, integrations, artifacts, notifications, jobs, users] = await Promise.all([
      this.tenantSettings(tenantId),
      db.integrationCredential.findMany({
        where: { tenantId },
        select: { provider: true, credentialType: true, scope: true, status: true, lastVerifiedAt: true, lastErrorCategory: true },
        orderBy: { updatedAt: 'desc' },
      }).catch(() => []),
      db.documentArtifact.groupBy({ by: ['entityType', 'kind', 'portalVisible'], where: { tenantId }, _count: { _all: true } }).catch(() => []),
      db.notification.count({ where: { companyId: tenantId } }).catch(() => 0),
      db.job.groupBy({ by: ['status'], where: { companyId: tenantId }, _count: { _all: true } }).catch(() => []),
      db.user.groupBy({ by: ['role'], where: { companyId: tenantId }, _count: { _all: true } }).catch(() => []),
    ]);
    const config = asObject(settings?.businessConfigJson);
    return {
      generatedAt: new Date().toISOString(),
      currentState: {
        byogIntegrations: integrations.map((row: any) => ({
          provider: row.provider,
          type: row.credentialType,
          scope: row.scope,
          status: row.status,
          lastVerifiedAt: row.lastVerifiedAt,
          lastErrorCategory: row.lastErrorCategory || null,
        })),
        accountingPaymentModels: {
          tenantOwnedPaymentProviders: integrations.filter((row: any) => ['STRIPE_CUSTOMER_PAYMENTS', 'WORLDPAY', 'SUMUP'].includes(row.provider)).length,
          myTitanStripeBoundary: 'SaaS billing and job packs only; customer-money export/sync paths remain tenant-owned.',
          accountingFeatureEnabled: Boolean(settings?.featureAccounting ?? settings?.accountingEnabled),
        },
        calendarScheduling: {
          bookingFeatureEnabled: Boolean(settings?.featureBookings ?? settings?.bookingsEnabled),
          connectedCalendarCredentials: integrations.filter((row: any) => String(row.provider).includes('CALENDAR')).length,
        },
        jobInvoicePaymentContinuity: jobs.map((row: any) => ({ status: row.status, count: row._count?._all || 0 })),
        fileArtifactStorage: artifacts.map((row: any) => ({
          entityType: row.entityType,
          kind: row.kind,
          portalVisible: Boolean(row.portalVisible),
          count: row._count?._all || 0,
        })),
        analyticsDashboard: {
          customWidgets: Array.isArray(config?.phase1k?.dashboardWidgets) ? config.phase1k.dashboardWidgets : DEFAULT_WIDGETS,
        },
        notifications: { inAppCount: notifications, outboundEmailSafety: 'existing tracked notification and email safety controls are retained' },
        mobileShell: { offlinePacket: 'scoped assigned-job packets only', fullAppCache: false },
        rolePermissions: users.map((row: any) => ({ role: row.role, count: row._count?._all || 0 })),
        guidedSetup: {
          onboardingCompleted: Boolean(settings?.onboardingCompleted),
          walkthroughState: asObject(config?.phase1k?.walkthroughs),
        },
      },
      partial: [
        'Accounting and calendar bridges expose readiness and dry-run queues only.',
        'Offline mode is a scoped packet/sync contract with browser-local binary queues; it is not a broad offline app cache.',
        'Folder organisation is derived from artifact entity/kind metadata until deeper document taxonomy is migrated.',
      ],
      conflictRisks: [
        'Live accounting/calendar writes must stay disabled until tenant-owned OAuth/provider credentials and scopes are verified.',
        'Offline status updates can conflict when a job version changed after the packet was issued.',
        'Customer-visible artifacts require explicit portal visibility; private evidence must remain internal.',
      ],
      safeBridgeStrategy: [
        'Queue export intents in IntegrationOrchestrationEvent with dry_run/queued results.',
        'Use tenant-scoped reads and existing RBAC before every packet, export, and folder action.',
        'Expose provider health without leaking tokens, secrets, private URLs, SMTP values, or internal hosts.',
      ],
      rollbackPlan: [
        'Disable Phase 1K feature surfaces through navigation/feature flags.',
        'Delete queued IntegrationOrchestrationEvent rows for phase1k.* actions if a rollout must be unwound.',
        'Retain original artifact files and tenant settings; folder moves only alter safe metadata.',
      ],
    };
  }

  async getAccountingReadiness(tenantId: string, userId?: string | null) {
    const db = this.prisma as any;
    const settings = await this.tenantSettings(tenantId);
    const featureEnabled = Boolean(settings?.featureAccounting ?? settings?.accountingEnabled);
    const flags = await this.accountingFlagState(tenantId, userId);
    const credentials = await db.integrationCredential.findMany({
      where: { tenantId, provider: { in: ['XERO', 'QUICKBOOKS', 'SAGE'] } },
      select: {
        provider: true,
        status: true,
        scope: true,
        lastVerifiedAt: true,
        lastErrorCategory: true,
        metadataJson: true,
        encryptedSecretMaterial: true,
        updatedAt: true,
      },
    }).catch(() => []);
    const recentEvents = await db.integrationOrchestrationEvent.findMany({
      where: { tenantId, provider: { in: ['XERO', 'QUICKBOOKS', 'SAGE'] }, action: { startsWith: 'phase1' } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { provider: true, action: true, result: true, safeCategory: true, message: true, metadataJson: true, createdAt: true },
    }).catch(() => []);
    return {
      stage: 'phase_1n_live_gated_bridge',
      liveSyncEnabled: false,
      liveProviderMutation: false,
      moneyBoundary: 'Customer payments are tenant-owned; MyTitan Stripe is not used for customer funds.',
      featureFlags: flags,
      setupFlow: ['Connect accounting', 'Check mappings', 'Preview export', 'Ready to sync', 'Needs reconnecting'],
      stage1Audit: {
        ready: [
          'Tenant-owned IntegrationCredential records support encrypted provider material server-side only.',
          'IntegrationOrchestrationEvent supports tenant-scoped export queues, idempotency metadata, retries, safe categories, and audit history.',
          'Invoice, payment, contact/customer, and VAT mapping previews are available without provider mutation.',
          'RBAC requires dashboard intelligence for readiness and billing management for export/sync actions.',
        ],
        dryRunOnly: [
          'Sage remains readiness contract only.',
          'Xero and QuickBooks live export is blocked unless accounting_sync_v1 and the provider live flag are enabled.',
          'Provider API clients are not called when OAuth is missing, stale, or unverified.',
        ],
        safeToBecomeLive: [
          'Xero invoice/payment/contact export after tenant OAuth verification and explicit live flag.',
          'QuickBooks invoice/payment/contact export after tenant OAuth verification and explicit live flag.',
        ],
        requiredProviderCredentials: [
          'Tenant-owned OAuth access and refresh material encrypted server-side.',
          'Provider tenant/account identifier stored as sanitized metadata only.',
          'Accounting scopes for invoices, contacts/customers, payments, and tax/settings reads.',
        ],
        rollbackStrategy: [
          'Disable accounting_sync_v1 or provider live flag.',
          'Leave queued events intact for review; do not delete tenant audit history.',
          'Mark failed events manual_review and retry after reconnect instead of overwriting ledger data.',
        ],
      },
      dryRunValidation: {
        liveProviderMutation: false,
        oauthTokensExposed: false,
        overwritesTaxLedger: false,
        supportedStates: ['setup_needed', 'ready', 'syncing', 'synced', 'failed', 'needs_reconnect'],
      },
      providers: ACCOUNTING_PROVIDERS.map((provider) => {
        const enumProvider = this.accountingProviderEnum(provider);
        const credential = credentials.find((row: any) => row.provider === enumProvider);
        const liveFlagKey = this.accountingLiveFlagKey(provider);
        const providerLiveFlag = liveFlagKey ? Boolean((flags as any)[liveFlagKey]) : false;
        const verified = this.credentialVerified(credential);
        const providerEvents = recentEvents.filter((row: any) => row.provider === enumProvider);
        const latestEvent = providerEvents[0] || null;
        const syncing = latestEvent?.result === 'syncing' || latestEvent?.result === 'queued';
        const failed = latestEvent?.result === 'failed' || latestEvent?.safeCategory === 'provider_error';
        const liveBlockedReasons = [
          !featureEnabled ? 'accounting_module_disabled' : null,
          !flags.accounting_sync_v1 ? 'accounting_sync_v1_disabled' : null,
          liveFlagKey && !providerLiveFlag ? `${liveFlagKey}_disabled` : null,
          provider === 'sage' ? 'sage_live_sync_not_enabled' : null,
          !credential ? 'provider_connection_missing' : null,
          credential && !verified ? 'provider_connection_not_verified' : null,
        ].filter(Boolean);
        const bridgeStatus = failed
          ? 'failed'
          : credential?.status === 'NEEDS_REAUTH'
          ? 'needs_reconnect'
          : syncing
          ? 'syncing'
          : providerEvents.some((row: any) => row.result === 'synced')
          ? 'synced'
          : this.providerStatus(credential, featureEnabled);
        return {
          provider,
          displayName: provider === 'quickbooks' ? 'QuickBooks' : provider[0].toUpperCase() + provider.slice(1),
          status: bridgeStatus,
          tenantOwned: true,
          dryRunOnly: provider === 'sage' || liveBlockedReasons.length > 0,
          liveBridge: {
            supported: LIVE_ACCOUNTING_PROVIDERS.includes(provider as any),
            enabled: LIVE_ACCOUNTING_PROVIDERS.includes(provider as any) && liveBlockedReasons.length === 0,
            liveProviderMutation: false,
            explicitFlagRequired: liveFlagKey,
            blockedReasons: liveBlockedReasons,
            tokenStorage: 'encrypted_server_side_only',
            tokensReturnedToClient: false,
            safeErrorCategories: ['setup_needed', 'needs_reconnect', 'duplicate_detected', 'mapping_missing', 'provider_error', 'rate_limited', 'manual_review'],
          },
          capabilities: [
            'ledger_mapping_preview',
            'invoice_export_queue',
            'payment_export_queue',
            'tax_vat_mapping_readiness',
            'contact_customer_mapping_readiness',
            'sync_conflict_preview',
            'dry_run_validation',
            'idempotency_keys',
            'failed_sync_queue',
            'retry_backoff',
            'manual_review_state',
            ...(LIVE_ACCOUNTING_PROVIDERS.includes(provider as any) ? ['live_gated_bridge'] : []),
          ],
          lastVerifiedAt: credential?.lastVerifiedAt || null,
          lastErrorCategory: credential?.lastErrorCategory || null,
          lastSyncAt: this.safeCredentialMetadata(credential?.metadataJson).lastSyncAt,
          connectionState: {
            connected: Boolean(credential),
            verified,
            status: credential?.status || 'SETUP_NEEDED',
            metadata: this.safeCredentialMetadata(credential?.metadataJson),
          },
          readiness: {
            ledgerMapping: featureEnabled ? (credential ? 'ready' : 'setup_needed') : 'setup_needed',
            invoiceExportQueue: 'ready',
            paymentExportQueue: 'ready',
            taxVatMapping: featureEnabled ? 'setup_needed' : 'setup_needed',
            contactCustomerMapping: 'ready',
            conflictPreview: 'ready',
            exportLock: syncing ? 'locked_while_syncing' : 'available',
            failedQueue: failed ? 'manual_review' : 'clear',
          },
          mappingPreview: {
            contact: {
              source: ['customerName', 'customerEmail', 'customerPhone'],
              target: provider === 'quickbooks' ? 'CustomerRef draft lookup' : 'Contact draft lookup',
              conflictRule: 'match by tenant-scoped customer id/email before creating any provider draft',
            },
            invoice: {
              source: ['jobRef', 'serviceName', 'lineItems', 'totalCents', 'currency', 'invoiceIssuedAt', 'invoiceDueAt'],
              target: provider === 'quickbooks' ? 'Invoice draft payload' : 'Sales invoice draft payload',
              queue: 'IntegrationOrchestrationEvent phase1k.accounting.invoice.dry_run_export',
            },
            payment: {
              source: ['invoicePaidAt', 'paymentReceiptUrl', 'customerPaymentRequests', 'manual reconciliation notes'],
              target: provider === 'quickbooks' ? 'Payment draft payload' : 'Payment allocation draft payload',
              queue: 'IntegrationOrchestrationEvent phase1k.accounting.payment.dry_run_export',
            },
            tax: {
              source: ['tenant VAT/tax defaults', 'job line tax metadata when present'],
              target: 'read-only tax/VAT code preview',
              overwriteLedger: false,
            },
          },
          conflictPreview: [
            'missing_contact_mapping',
            'invoice_already_exported',
            'payment_without_invoice_match',
            'tax_code_not_mapped',
            'provider_needs_reconnect',
          ],
          duplicateDetection: {
            idempotencyKeyFormat: `${provider}:entityType:entityId`,
            externalIdMapping: 'tenant-scoped provider external ids are stored only as safe metadata on orchestration events until live sync is enabled',
            destructiveOverwrite: false,
          },
          recentSafeEvents: providerEvents.slice(0, 5).map((event: any) => ({
            action: event.action,
            result: event.result,
            safeCategory: event.safeCategory,
            message: event.message,
            createdAt: event.createdAt,
            idempotencyKey: asObject(event.metadataJson).idempotencyKey || null,
          })),
        };
      }),
    };
  }

  async queueAccountingDryRun(tenantId: string, userId: string, providerInput: string, body: any) {
    const provider = String(providerInput || '').trim().toLowerCase() as AccountingProvider;
    if (!ACCOUNTING_PROVIDERS.includes(provider)) throw new BadRequestException('Unsupported accounting provider');
    const entityType = String(body?.entityType || 'invoice').trim().toLowerCase() === 'payment' ? 'payment' : 'invoice';
    const entityId = cleanId(body?.entityId, 'entityId');
    const idempotencyKey = this.idempotencyKey(provider, entityType, entityId, body);
    const enumProvider = this.accountingProviderEnum(provider);
    const db = this.prisma as any;
    const existing = await db.integrationOrchestrationEvent.findFirst({
      where: {
        tenantId,
        provider: enumProvider,
        action: `phase1k.accounting.${entityType}.dry_run_export`,
        metadataJson: { path: ['idempotencyKey'], equals: idempotencyKey },
      },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);
    if (existing) {
      await this.audit.log(tenantId, 'phase1n.accounting.dry_run_idempotent', `${provider} ${entityType} dry-run export reused existing idempotency key`, userId);
      return { queued: false, reused: true, id: existing.id, provider, entityType, entityId, idempotencyKey, liveSync: false };
    }
    const event = await (this.prisma as any).integrationOrchestrationEvent.create({
      data: {
        tenantId,
        provider: enumProvider,
        action: `phase1k.accounting.${entityType}.dry_run_export`,
        safeCategory: 'dry_run_queue',
        result: 'queued',
        message: `${provider} ${entityType} export dry-run queued; no live accounting data was submitted.`,
        metadataJson: { provider, entityType, entityId, idempotencyKey, liveSync: false, queuedByUserId: userId, destructiveOverwrite: false },
      },
    });
    await this.audit.log(tenantId, 'phase1k.accounting.dry_run_queued', `${provider} ${entityType} dry-run export queued`, userId);
    return { queued: true, id: event.id, provider, entityType, entityId, idempotencyKey, liveSync: false };
  }

  async queueAccountingLiveSync(tenantId: string, userId: string, providerInput: string, body: any) {
    const provider = String(providerInput || '').trim().toLowerCase() as AccountingProvider;
    if (!ACCOUNTING_PROVIDERS.includes(provider)) throw new BadRequestException('Unsupported accounting provider');
    if (!LIVE_ACCOUNTING_PROVIDERS.includes(provider as any)) {
      throw new BadRequestException('Live accounting sync is not available for this provider yet');
    }
    const entityType = ['invoice', 'payment', 'contact'].includes(String(body?.entityType || '').trim().toLowerCase())
      ? String(body.entityType).trim().toLowerCase()
      : 'invoice';
    const entityId = cleanId(body?.entityId, 'entityId');
    const idempotencyKey = this.idempotencyKey(provider, entityType, entityId, body);
    const flags = await this.accountingFlagState(tenantId, userId);
    const enumProvider = this.accountingProviderEnum(provider);
    const db = this.prisma as any;
    const credential = await db.integrationCredential.findFirst({
      where: { tenantId, provider: enumProvider, scope: 'WORKSPACE' },
      select: { id: true, status: true, encryptedSecretMaterial: true, lastVerifiedAt: true, metadataJson: true, lastErrorCategory: true },
    }).catch(() => null);
    const liveFlagKey = this.accountingLiveFlagKey(provider);
    const blockedReasons = [
      !flags.accounting_sync_v1 ? 'accounting_sync_v1_disabled' : null,
      liveFlagKey && !(flags as any)[liveFlagKey] ? `${liveFlagKey}_disabled` : null,
      !credential ? 'provider_connection_missing' : null,
      credential && !this.credentialVerified(credential) ? 'provider_connection_not_verified' : null,
    ].filter(Boolean);

    const existing = await db.integrationOrchestrationEvent.findFirst({
      where: {
        tenantId,
        provider: enumProvider,
        action: `phase1n.accounting.${entityType}.live_sync_bridge`,
        metadataJson: { path: ['idempotencyKey'], equals: idempotencyKey },
      },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);
    if (existing) {
      return {
        queued: false,
        reused: true,
        id: existing.id,
        provider,
        entityType,
        entityId,
        idempotencyKey,
        liveProviderMutation: false,
        status: existing.result,
        blockedReasons,
      };
    }

    const blocked = blockedReasons.length > 0;
    const event = await db.integrationOrchestrationEvent.create({
      data: {
        tenantId,
        provider: enumProvider,
        action: `phase1n.accounting.${entityType}.live_sync_bridge`,
        safeCategory: blocked ? 'live_sync_blocked' : 'live_sync_ready_queue',
        result: blocked ? 'setup_needed' : 'queued',
        message: blocked
          ? `${provider} ${entityType} live sync blocked until tenant-owned OAuth and explicit feature flags are verified.`
          : `${provider} ${entityType} live sync bridge queued; provider mutation remains disabled until worker verification executes.`,
        metadataJson: {
          provider,
          entityType,
          entityId,
          idempotencyKey,
          liveSyncRequested: true,
          liveProviderMutation: false,
          queuedByUserId: userId,
          destructiveOverwrite: false,
          blockedReasons,
          retry: { attempts: 0, nextBackoffSeconds: blocked ? null : 60 },
          manualReview: blocked,
        },
      },
    });
    await this.audit.log(tenantId, blocked ? 'phase1n.accounting.live_sync_blocked' : 'phase1n.accounting.live_sync_queued', `${provider} ${entityType} live-sync bridge ${blocked ? 'blocked' : 'queued'}`, userId);
    return {
      queued: !blocked,
      id: event.id,
      provider,
      entityType,
      entityId,
      idempotencyKey,
      liveSyncRequested: true,
      liveProviderMutation: false,
      status: blocked ? 'setup_needed' : 'queued',
      blockedReasons,
      tokensReturned: false,
      destructiveOverwrite: false,
    };
  }

  async getCalendarReadiness(tenantId: string) {
    const db = this.prisma as any;
    const settings = await this.tenantSettings(tenantId);
    const featureEnabled = Boolean(settings?.featureBookings ?? settings?.bookingsEnabled);
    const credentials = await db.integrationCredential.findMany({
      where: { tenantId, provider: { in: ['GOOGLE_CALENDAR', 'MICROSOFT_CALENDAR'] } },
      select: { provider: true, status: true, scope: true, lastVerifiedAt: true, lastErrorCategory: true },
    }).catch(() => []);
    return {
      liveMutationEnabled: false,
      publicFeedSafety: 'No unsafe public tokens are emitted. iCal is metadata-only until tenant feed-token infrastructure is configured.',
      providers: CALENDAR_PROVIDERS.map((provider) => {
        const enumProvider = provider === 'microsoft_calendar' ? 'MICROSOFT_CALENDAR' : provider === 'google_calendar' ? 'GOOGLE_CALENDAR' : null;
        const credential = enumProvider ? credentials.find((row: any) => row.provider === enumProvider) : null;
        return {
          provider,
          status: provider === 'apple_ical' ? (featureEnabled ? 'ready' : 'setup_needed') : this.providerStatus(credential, featureEnabled),
          tenantOwned: true,
          capabilities: provider === 'apple_ical' ? ['ical_export_queue'] : ['read_capability_declared', 'write_capability_declared', 'job_booking_export_queue'],
          readWrite: provider === 'apple_ical' ? 'read_only_feed_export' : 'declared_not_live',
          lastVerifiedAt: credential?.lastVerifiedAt || null,
          lastErrorCategory: credential?.lastErrorCategory || null,
        };
      }),
    };
  }

  async getSyncControlRoom(tenantId: string, userId?: string | null) {
    const db = this.prisma as any;
    const [accounting, calendar, credentials, recentEvents] = await Promise.all([
      this.getAccountingReadiness(tenantId, userId),
      this.getCalendarReadiness(tenantId),
      db.integrationCredential.findMany({
        where: { tenantId },
        select: { provider: true, status: true, scope: true, lastVerifiedAt: true, lastErrorCategory: true, metadataJson: true, encryptedSecretMaterial: true },
      }).catch(() => []),
      db.integrationOrchestrationEvent.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { provider: true, action: true, result: true, safeCategory: true, message: true, metadataJson: true, createdAt: true },
      }).catch(() => []),
    ]);
    const providerStatus = (provider: string) => {
      const credential = credentials.find((row: any) => row.provider === provider);
      const metadata = asObject(credential?.metadataJson);
      const expiresAt = metadata.expiresAt || metadata.expiry || metadata.oauthExpiresAt || null;
      const tokenExpiryStatus = !credential
        ? 'not_connected'
        : expiresAt && !Number.isNaN(new Date(expiresAt).getTime())
        ? new Date(expiresAt).getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000
          ? 'expires_soon'
          : 'valid'
        : 'not_available';
      return {
        connected: Boolean(credential),
        verified: this.credentialVerified(credential),
        status: credential?.status || 'SETUP_NEEDED',
        lastVerifiedAt: credential?.lastVerifiedAt || null,
        lastErrorCategory: credential?.lastErrorCategory || null,
        oauthStatus: !credential ? 'not_connected' : this.credentialVerified(credential) ? 'verified' : 'needs_reconnect_or_verification',
        tokenExpiryStatus,
        reconnectState: credential && ['NEEDS_REAUTH', 'ERROR', 'needs_reconnect', 'error'].includes(String(credential.status)) ? 'reconnect_required' : credential ? 'connected' : 'not_connected',
        tokensReturnedToFrontend: false,
      };
    };
    const eventRows = recentEvents.map((event: any) => ({
      provider: event.provider,
      action: event.action,
      result: event.result,
      safeCategory: event.safeCategory,
      message: event.message,
      createdAt: event.createdAt,
      idempotencyKey: asObject(event.metadataJson).idempotencyKey || null,
      liveProviderMutation: Boolean(asObject(event.metadataJson).liveProviderMutation),
    }));
    const failed = eventRows.filter((event: any) => event.result === 'failed' || event.safeCategory === 'provider_error' || event.safeCategory === 'manual_review');
    const pending = eventRows.filter((event: any) => event.result === 'queued' || event.result === 'syncing');
    const conflicts = eventRows.filter((event: any) => String(event.safeCategory || '').includes('conflict') || String(event.message || '').toLowerCase().includes('conflict'));
    const retryable = failed.filter((event: any) => event.idempotencyKey || event.safeCategory === 'provider_error' || event.safeCategory === 'manual_review');
    const providerEvents = (provider: string) => eventRows.filter((event: any) => String(event.provider || '').toLowerCase().includes(provider.toLowerCase()));
    const providerHealth = (provider: string, verified: boolean, blockedReasons: string[]) => {
      const rows = providerEvents(provider);
      if (blockedReasons.length || !verified) return 'blocked';
      if (rows.some((event: any) => event.result === 'failed' || event.safeCategory === 'provider_error')) return 'failed_exports';
      if (rows.some((event: any) => String(event.safeCategory || '').includes('conflict'))) return 'conflict_review';
      if (rows.some((event: any) => event.result === 'queued' || event.result === 'syncing')) return 'syncing';
      return 'ready_for_dry_run';
    };
    const accountingRows = accounting.providers.map((provider: any) => {
      const enumProvider = provider.provider === 'quickbooks' ? 'QUICKBOOKS' : String(provider.provider || '').toUpperCase();
      const status = providerStatus(enumProvider);
      const blockedReasons = provider.liveBridge?.blockedReasons || [];
      return {
        provider: provider.provider,
        displayName: provider.displayName,
        status: provider.status,
        readiness: provider.readiness,
        oauthStatus: status.oauthStatus,
        tokenExpiryStatus: status.tokenExpiryStatus,
        reconnectState: status.reconnectState,
        syncHealth: providerHealth(enumProvider, Boolean(provider.connectionState?.verified), blockedReasons),
        tenantOwnedOAuthVerified: Boolean(provider.connectionState?.verified),
        explicitLiveFlagEnabled: Boolean(provider.liveBridge?.enabled),
        liveSyncEnabled: Boolean(provider.liveBridge?.enabled && provider.connectionState?.verified && !blockedReasons.length),
        liveProviderMutation: false,
        dryRunPreviewAvailable: true,
        idempotencyKeys: provider.duplicateDetection?.idempotencyKeyFormat || `${provider.provider}:entityType:entityId`,
        blockedReasons,
        retryBackoff: { available: true, nextBackoffSeconds: pending.length ? 60 : null },
        failedSyncQueue: failed.filter((event: any) => String(event.provider || '').toLowerCase().includes(enumProvider.toLowerCase())).slice(0, 5),
        conflictQueue: conflicts.filter((event: any) => String(event.provider || '').toLowerCase().includes(enumProvider.toLowerCase())).slice(0, 5),
        retryQueue: retryable.filter((event: any) => String(event.provider || '').toLowerCase().includes(enumProvider.toLowerCase())).slice(0, 5),
        lastSyncAt: provider.lastSyncAt || status.lastVerifiedAt || null,
        nextSyncAt: null,
        tokensReturnedToFrontend: false,
      };
    });
    const calendarRows = calendar.providers.map((provider: any) => {
      const enumProvider = provider.provider === 'google_calendar' ? 'GOOGLE_CALENDAR' : provider.provider === 'microsoft_calendar' ? 'MICROSOFT_CALENDAR' : 'GENERIC_API';
      const status = providerStatus(enumProvider);
      const blockedReasons = provider.provider === 'apple_ical' ? ['read_only_feed_export'] : status.verified ? ['calendar_live_flag_disabled'] : ['provider_connection_missing_or_unverified'];
      return {
        ...provider,
        oauthStatus: status.oauthStatus,
        tokenExpiryStatus: status.tokenExpiryStatus,
        reconnectState: status.reconnectState,
        syncHealth: providerHealth(enumProvider, status.verified, blockedReasons),
        tenantOwnedOAuthVerified: status.verified,
        explicitLiveFlagEnabled: false,
        liveSyncEnabled: false,
        liveProviderMutation: false,
        dryRunPreviewAvailable: true,
        idempotencyKeys: `${provider.provider}:job_or_booking:id`,
        blockedReasons,
        failedSyncQueue: failed.filter((event: any) => String(event.provider || '').includes(enumProvider)).slice(0, 5),
        conflictQueue: conflicts.filter((event: any) => String(event.provider || '').includes(enumProvider)).slice(0, 5),
        retryQueue: retryable.filter((event: any) => String(event.provider || '').includes(enumProvider)).slice(0, 5),
        lastSyncAt: status.lastVerifiedAt || null,
        nextSyncAt: null,
        tokensReturnedToFrontend: false,
      };
    });
    const emailRows = EMAIL_SYNC_PROVIDERS.map((provider) => {
      const enumProvider = provider === 'gmail' ? 'GOOGLE_GMAIL' : 'MICROSOFT_OUTLOOK';
      const status = providerStatus(enumProvider);
      return {
        provider,
        displayName: provider === 'gmail' ? 'Gmail' : 'Outlook',
        status: status.verified ? 'ready_live_gated' : 'setup_needed',
        oauthStatus: status.oauthStatus,
        tokenExpiryStatus: status.tokenExpiryStatus,
        reconnectState: status.reconnectState,
        syncHealth: providerHealth(enumProvider, status.verified, status.verified ? ['email_live_flag_disabled'] : ['provider_connection_missing_or_unverified']),
        tenantOwnedOAuthVerified: status.verified,
        explicitLiveFlagEnabled: false,
        liveSyncEnabled: false,
        liveProviderMutation: false,
        dryRunPreviewAvailable: true,
        idempotencyKeys: `${provider}:communication:id`,
        blockedReasons: status.verified ? ['email_live_flag_disabled'] : ['provider_connection_missing_or_unverified'],
        failedSyncQueue: failed.filter((event: any) => String(event.provider || '').includes(enumProvider)).slice(0, 5),
        conflictQueue: conflicts.filter((event: any) => String(event.provider || '').includes(enumProvider)).slice(0, 5),
        retryQueue: retryable.filter((event: any) => String(event.provider || '').includes(enumProvider)).slice(0, 5),
        lastSyncAt: status.lastVerifiedAt || null,
        nextSyncAt: null,
        tokensReturnedToFrontend: false,
      };
    });
    return {
      generatedAt: new Date().toISOString(),
      scope: 'tenant_sync_control_room',
      platformDiagnosticsVisible: false,
      liveSyncGlobalEnabled: false,
      liveProviderMutation: false,
      tokensReturnedToFrontend: false,
      customerMoneyBoundary: 'Customer payments remain tenant-owned; MyTitan Stripe is not used for customer invoice payment.',
      sections: {
        accounting: accountingRows,
        calendar: calendarRows,
        email: emailRows,
      },
      summary: {
        pendingExports: pending.length,
        failedExports: failed.length,
        conflicts: conflicts.length,
        dryRunPreviewAvailable: true,
        safeLiveEnableStatus: 'blocked_until_tenant_oauth_and_explicit_flags_are_verified',
      },
      controls: ['dry_run_preview', 'retry_failed_export', 'review_conflict', 'disconnect_reconnect', 'enable_live_after_verified_flags'],
      advancedDetails: {
        recentSafeEvents: eventRows.slice(0, 12),
        sanitizedProviderErrorsOnly: true,
        noTokensOrSecretsInPayload: true,
      },
    };
  }

  async queueCalendarExport(tenantId: string, userId: string, providerInput: string, body: any) {
    const provider = String(providerInput || '').trim().toLowerCase() as CalendarProvider;
    if (!CALENDAR_PROVIDERS.includes(provider)) throw new BadRequestException('Unsupported calendar provider');
    const entityType = String(body?.entityType || 'job').trim().toLowerCase() === 'booking' ? 'booking' : 'job';
    const entityId = cleanId(body?.entityId, 'entityId');
    const event = await (this.prisma as any).integrationOrchestrationEvent.create({
      data: {
        tenantId,
        provider: provider === 'microsoft_calendar' ? 'MICROSOFT_CALENDAR' : provider === 'google_calendar' ? 'GOOGLE_CALENDAR' : 'GENERIC_API',
        action: `phase1k.calendar.${entityType}.export_queue`,
        safeCategory: 'calendar_export_queue',
        result: 'queued',
        message: `${provider} ${entityType} calendar export queued; no external calendar was mutated.`,
        metadataJson: { provider, entityType, entityId, liveMutation: false, queuedByUserId: userId },
      },
    });
    await this.audit.log(tenantId, 'phase1k.calendar.export_queued', `${provider} ${entityType} calendar export queued`, userId);
    return { queued: true, id: event.id, provider, entityType, entityId, liveMutation: false };
  }

  async getOfflinePacket(tenantId: string, userId: string) {
    const db = this.prisma as any;
    const jobs = await db.job.findMany({
      where: { companyId: tenantId, assignedUserId: userId, status: { in: ['OPEN', 'SCHEDULED', 'IN_PROGRESS'] } },
      select: {
        id: true,
        jobRef: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        serviceName: true,
        formData: true,
        status: true,
        scheduledAt: true,
        completedAt: true,
        totalCents: true,
        invoiceIssuedAt: true,
        invoicePaidAt: true,
        updatedAt: true,
        lineItems: { select: { description: true, qty: true, unitPrice: true, total: true }, take: 20 },
        jobParts: { select: { quantityPlanned: true, quantityUsed: true, stockItem: { select: { name: true, sku: true, unit: true } } }, take: 20 },
        assets: { select: { id: true, kind: true, mime: true, bytes: true, createdAt: true }, take: 40 },
        signatures: { select: { id: true, signerType: true, createdAt: true }, take: 10 },
        activities: { orderBy: { createdAt: 'desc' }, take: 3, select: { eventType: true, message: true, createdAt: true } },
      },
      orderBy: [{ scheduledAt: 'asc' }, { updatedAt: 'desc' }],
      take: 50,
    });
    return {
      packetVersion: new Date().toISOString(),
      scope: 'assigned_jobs_only',
      cachePolicy: { fullAuthenticatedAppCaching: false, storesSecrets: false, storesPortalTokens: false },
      syncStates: ['saved_offline', 'queued', 'syncing', 'conflict', 'uploaded', 'synced', 'failed'],
      fieldOperation: {
        usableOffline: true,
        assignedJobsOnly: true,
        serverSourceOfTruth: true,
        supportedActions: [
          'open_assigned_job',
          'view_customer_job_summary',
          'view_services_materials',
          'start_job',
          'add_before_photos',
          'add_after_photos',
          'capture_signature_metadata',
          'record_materials_used',
          'add_completion_notes',
          'record_manual_payment_note',
          'mark_complete_pending_sync',
          'review_queue',
          'sync_on_reconnect',
          'resolve_conflicts',
          'queue_videos',
          'queue_documents',
          'partial_sync_recovery',
          'failed_upload_recovery',
        ],
        unavailableOffline: ['full_authenticated_app_cache', 'secret_storage', 'portal_link_access', 'live_provider_sync'],
      },
      completionGuarantee: {
        noLostCompletedWork: true,
        storesBinary: false,
        storesBinaryInServerPacket: false,
        browserBinaryQueue: 'IndexedDB preferred with localStorage metadata fallback',
        queuedEvidenceTypes: OFFLINE_EVIDENCE_TYPES,
        queuedMetadataOnly: ['status_change', 'completion_notes', 'material_usage', 'payment_note'],
      },
      binaryQueuePolicy: {
        architecture: 'service_worker_indexeddb_foundation',
        authenticatedPageCaching: false,
        storesSecrets: false,
        storesTokens: false,
        assignedUserScoped: true,
        uploadResumesOnReconnect: true,
        duplicateSuppression: 'clientMutationId + sha256 where available',
        maxItemBytes: Number(process.env.ARTIFACT_MAX_BYTES ?? 10 * 1024 * 1024),
        acceptedMimeTypes: OFFLINE_MIME_TYPES,
        visibleStates: ['saved offline', 'queued', 'syncing', 'conflict', 'uploaded', 'failed'],
      },
      queueMonitoring: {
        enabled: true,
        maxItems: 100,
        healthStates: ['clear', 'queued', 'syncing', 'conflict_review', 'failure_review'],
        visibleRoute: '/dashboard/technician/offline',
      },
      retryStrategy: {
        available: true,
        backoffSeconds: [30, 60, 120, 300],
        userCanRetry: true,
        userCanClearFailures: true,
      },
      partialSyncRecovery: {
        enabled: true,
        syncedItemsRemovedIndividually: true,
        unsyncedItemsRemainQueued: true,
        conflictsRequireReview: true,
      },
      failedUploadRecovery: {
        enabled: true,
        preservesLocalEvidenceUntilUserClears: true,
        retryOrDiscardOnly: true,
      },
      conflictResolution: [
        { key: 'stale_job_packet', issue: 'The offline packet is older than the server job record.', safeOptions: ['review server changes', 'retry after refresh', 'discard local update'], overwritesBlindly: false },
        { key: 'job_changed_by_another_user', issue: 'Another user changed the job while this device was offline.', safeOptions: ['compare changes', 'save as new note', 'discard local update'], overwritesBlindly: false },
        { key: 'duplicate_photo_upload', issue: 'The queued evidence appears to match an existing item.', safeOptions: ['skip duplicate', 'upload as separate evidence after review'], overwritesBlindly: false },
        { key: 'deleted_or_archived_job', issue: 'The assigned job is no longer active.', safeOptions: ['review job record online', 'discard local update'], overwritesBlindly: false },
        { key: 'technician_no_longer_assigned', issue: 'This user is no longer assigned to the job.', safeOptions: ['request reassignment', 'discard local update'], overwritesBlindly: false },
        { key: 'payment_state_changed', issue: 'Payment state changed while the device was offline.', safeOptions: ['record manual note only', 'review finance state'], overwritesBlindly: false },
        { key: 'material_stock_changed', issue: 'Material stock changed while the device was offline.', safeOptions: ['review stock impact', 'save usage as pending adjustment'], overwritesBlindly: false },
      ],
      jobs: jobs.map((job: any) => ({
        id: job.id,
        jobRef: job.jobRef,
        serviceName: job.serviceName,
        status: job.status,
        scheduledAt: job.scheduledAt,
        completedAt: job.completedAt,
        version: job.updatedAt,
        customer: {
          name: job.customerName,
          email: job.customerEmail ? 'available_online_only' : null,
          phone: job.customerPhone ? 'available_online_only' : null,
        },
        site: {
          location: 'assigned_job_summary_only',
          addressSummary: [asObject(job.formData).addressLine1, asObject(job.formData).city || asObject(job.formData).town, asObject(job.formData).postcode].filter(Boolean).join(', ') || 'available_online_only',
        },
        services: Array.isArray(job.lineItems) && job.lineItems.length
          ? job.lineItems.map((line: any) => ({ description: line.description, quantity: line.qty, total: line.total }))
          : [{ description: job.serviceName || 'Service', quantity: 1, totalCents: job.totalCents || null }],
        materials: Array.isArray(job.jobParts)
          ? job.jobParts.map((part: any) => ({
              name: part.stockItem?.name || 'Material',
              sku: part.stockItem?.sku || null,
              unit: part.stockItem?.unit || null,
              quantityPlanned: part.quantityPlanned,
              quantityUsed: part.quantityUsed,
            }))
          : [],
        evidence: {
          beforePhotos: (job.assets || []).filter((asset: any) => asset.kind === 'BEFORE').map((asset: any) => ({ id: asset.id, mime: asset.mime, bytes: asset.bytes, queuedBinary: false })),
          afterPhotos: (job.assets || []).filter((asset: any) => asset.kind === 'AFTER').map((asset: any) => ({ id: asset.id, mime: asset.mime, bytes: asset.bytes, queuedBinary: false })),
          signatures: (job.signatures || []).map((signature: any) => ({ id: signature.id, signerType: signature.signerType, capturedAt: signature.createdAt })),
        },
        payment: {
          invoiceIssued: Boolean(job.invoiceIssuedAt),
          paid: Boolean(job.invoicePaidAt),
          manualCollectionNoteQueued: false,
        },
        completionNotes: { queued: false, serverSnapshot: typeof asObject(job.formData).completionNotes === 'string' ? asObject(job.formData).completionNotes.slice(0, 500) : null },
        recentEvents: job.activities || [],
        allowedOfflineMutations: OFFLINE_MUTATION_TYPES,
        offlineActions: {
          startJob: true,
          completePendingSync: true,
          beforePhotos: true,
          afterPhotos: true,
          signatureMetadata: true,
          materialUsage: true,
          completionNotes: true,
          manualPaymentNote: true,
          videos: true,
          documents: true,
          retryQueue: true,
          clearFailedQueue: true,
        },
      })),
    };
  }

  async syncOfflineMutations(tenantId: string, userId: string, body: any) {
    const db = this.prisma as any;
    const mutations = Array.isArray(body?.mutations) ? body.mutations.slice(0, 50) : [];
    const results = [];
    for (const mutation of mutations) {
      const clientMutationId = cleanId(mutation?.clientMutationId, 'clientMutationId');
      const type = String(mutation?.type || '').trim() as OfflineMutationType;
      if (!OFFLINE_MUTATION_TYPES.includes(type)) throw new BadRequestException('Unsupported offline mutation type');
      const jobId = cleanId(mutation?.jobId, 'jobId');
      const job = await db.job.findFirst({ where: { id: jobId, companyId: tenantId, assignedUserId: userId }, select: { id: true, status: true, updatedAt: true, jobRef: true } });
      if (!job) throw new NotFoundException('Assigned job not found');
      const baseVersion = mutation?.baseVersion ? new Date(mutation.baseVersion) : null;
      if (baseVersion && !Number.isNaN(baseVersion.getTime()) && new Date(job.updatedAt).getTime() > baseVersion.getTime()) {
        await db.jobActivity.create({
          data: {
            companyId: tenantId,
            jobId,
            actorUserId: userId,
            eventType: 'offline.conflict',
            message: `Offline mutation ${clientMutationId} needs conflict review`,
            payloadJson: { type, clientMutationId, baseVersion: mutation.baseVersion, serverVersion: job.updatedAt },
          },
        });
        results.push({
          clientMutationId,
          jobId,
          state: 'conflict',
          serverVersion: job.updatedAt,
          conflict: {
            key: 'stale_job_packet',
            issue: 'The server job changed after this offline packet was created.',
            impact: 'MyTitan will not overwrite the newer job record blindly.',
            safeOptions: ['review server changes', 'retry after refreshing the packet', 'discard local update'],
            overwritesBlindly: false,
          },
        });
        continue;
      }
      const message = type === 'status_change'
        ? `Offline status update queued: ${String(mutation?.payload?.status || '').slice(0, 40)}`
        : type === 'signature_metadata'
        ? 'Offline signature metadata queued'
        : type === 'completion_notes'
        ? 'Offline completion notes queued'
        : type === 'material_usage'
        ? 'Offline material usage metadata queued'
        : type === 'payment_note'
        ? 'Offline manual payment note queued'
        : type === 'binary_attachment'
        ? 'Offline binary attachment sync metadata queued'
        : 'Offline photo metadata queued';
      await db.jobActivity.create({
        data: {
          companyId: tenantId,
          jobId,
          actorUserId: userId,
          eventType: `offline.${type}`,
          message,
          payloadJson: {
            clientMutationId,
            source: 'phase1k_offline_sync',
            payload: asObject(mutation?.payload),
            storesBinary: false,
            storesSecrets: false,
            binaryQueueState: type === 'binary_attachment' ? 'server_sync_audited' : undefined,
          },
        },
      });
      results.push({ clientMutationId, jobId, state: 'synced', serverVersion: job.updatedAt });
    }
    await this.audit.log(tenantId, 'phase1k.offline.sync', `${results.length} offline mutation(s) processed`, userId);
    return { processed: results.length, results };
  }

  async getWorkflowAutomationEngine(tenantId: string) {
    const settings = await this.tenantSettings(tenantId);
    const config = asObject(settings?.businessConfigJson);
    const workflow = asObject(config.bookingWorkflow);
    const automationConfig = asObject(config.workflowAutomation);
    const rule = (key: string, label: string, trigger: string, action: string, configured: boolean, href: string) => ({
      key,
      label,
      trigger,
      action,
      status: configured ? 'enabled' : 'available_to_configure',
      tenantConfigurable: true,
      audited: true,
      reversible: true,
      idempotent: true,
      duplicatePolicy: 'source_entity_id_and_client_mutation_id_prevent_duplicate_records',
      liveProviderMutation: false,
      href,
    });
    return {
      generatedAt: new Date().toISOString(),
      scope: 'tenant_workflow_automation_engine',
      platformDiagnosticsVisible: false,
      rules: [
        rule('booking_created_create_job', 'Booking created -> create job', 'booking.created', 'job.create_from_booking', Boolean(workflow.autoCreateJobFromBooking), '/dashboard/booking/settings#workflow'),
        rule('job_completed_draft_invoice', 'Job completed -> draft invoice', 'job.completed', 'invoice.create_draft', Boolean(workflow.autoCreateInvoiceDraftOnCompletion), '/dashboard/booking/settings#workflow'),
        rule('invoice_paid_request_review', 'Invoice paid -> request review', 'invoice.paid', 'review.request', Boolean(automationConfig.invoicePaidReviewRequest), '/dashboard/settings?tab=advanced#automations'),
        rule('customer_inactive_winback', 'Customer inactive -> win-back reminder', 'customer.inactive', 'campaign.win_back_reminder', Boolean(automationConfig.customerInactiveWinback), '/dashboard/settings?tab=advanced#automations'),
      ],
      guarantees: {
        idempotencyRequired: true,
        duplicateCreationBlocked: true,
        auditEventsRequired: true,
        reversibleByOwnerOrAdmin: true,
        liveProviderMutation: false,
      },
    };
  }

  async getUploadReadiness() {
    return {
      maxUploadBytes: Number(process.env.ARTIFACT_MAX_BYTES ?? 10 * 1024 * 1024),
      clientRequirements: ['compress_image_before_upload', 'show_size_warning', 'queue_upload', 'retry_with_backoff', 'show_progress', 'memory_safe_preview'],
      acceptedMimeTypes: OFFLINE_MIME_TYPES,
      serverStoresBinaryInOfflinePacket: false,
      offlineBinaryQueue: {
        enabled: true,
        storage: 'IndexedDB',
        serviceWorker: 'sync-message-only-no-authenticated-page-cache',
        states: ['saved_offline', 'queued', 'syncing', 'conflict', 'uploaded', 'failed'],
        payloadRules: ['assigned_job_only', 'no_tokens', 'no_secrets', 'file_size_type_checked_before_queue', 'clearable_by_user'],
        evidenceTypes: OFFLINE_EVIDENCE_TYPES,
        acceptedMimeTypes: OFFLINE_MIME_TYPES,
      },
    };
  }

  async getWidgetConfig(tenantId: string, userId: string) {
    const settings = await this.tenantSettings(tenantId);
    const config = asObject(settings?.businessConfigJson);
    const phase = asObject(config.phase1k);
    const perUser = asObject(phase.dashboardWidgetsByUser);
    const selected = Array.isArray(perUser[userId]) ? perUser[userId] : Array.isArray(phase.dashboardWidgets) ? phase.dashboardWidgets : DEFAULT_WIDGETS;
    return {
      selectedWidgets: selected,
      availableWidgets: [
        'technician_conversion_rate',
        'profit_margin_by_job_type',
        'outstanding_payments',
        'low_stock',
        'booking_conversion',
        'job_completion_velocity',
      ],
      dataPolicy: 'real_data_only',
    };
  }

  async saveWidgetConfig(tenantId: string, userId: string, widgets: unknown) {
    const allowed = new Set((await this.getWidgetConfig(tenantId, userId)).availableWidgets);
    const selected = Array.isArray(widgets)
      ? Array.from(new Set(widgets.map((item) => String(item || '').trim()).filter((item) => allowed.has(item)))).slice(0, 8)
      : [];
    if (!selected.length) throw new BadRequestException('At least one supported widget is required');
    const settings = await this.tenantSettings(tenantId);
    const config = asObject(settings?.businessConfigJson);
    const phase = asObject(config.phase1k);
    phase.dashboardWidgetsByUser = { ...asObject(phase.dashboardWidgetsByUser), [userId]: selected };
    await (this.prisma as any).tenantSetting.upsert({
      where: { tenantId },
      update: { businessConfigJson: { ...config, phase1k: phase } },
      create: { tenantId, businessConfigJson: { ...config, phase1k: phase } },
    });
    await this.audit.log(tenantId, 'phase1k.dashboard_widgets.saved', 'Custom dashboard widgets saved', userId);
    return { selectedWidgets: selected };
  }

  async getKpiWidgets(tenantId: string, userId: string) {
    const db = this.prisma as any;
    const config = await this.getWidgetConfig(tenantId, userId);
    const [jobs, bookings, lowStock, outstanding] = await Promise.all([
      db.job.findMany({ where: { companyId: tenantId }, select: { status: true, totalCents: true, costCents: true, serviceName: true, createdAt: true, completedAt: true, invoiceIssuedAt: true, invoicePaidAt: true } }).catch(() => []),
      db.booking.findMany({ where: { companyId: tenantId }, select: { status: true } }).catch(() => []),
      db.inventoryStock.findMany({
        where: { tenantId },
        select: { quantityOnHand: true, reorderPoint: true },
        take: 5000,
      }).catch(() => []),
      db.job.count({ where: { companyId: tenantId, invoiceIssuedAt: { not: null }, invoicePaidAt: null } }).catch(() => 0),
    ]);
    const completed = jobs.filter((job: any) => job.status === 'COMPLETED' || job.completedAt);
    const convertedBookings = bookings.filter((booking: any) => booking.status === 'COMPLETED' || booking.status === 'CONFIRMED').length;
    const widgets = {
      outstanding_payments: { label: 'Outstanding payments', value: outstanding, source: 'jobs.invoiceIssuedAt unpaid' },
      low_stock: {
        label: 'Low stock',
        value: Array.isArray(lowStock)
          ? lowStock.filter((row: any) => Number(row.quantityOnHand || 0) <= Number(row.reorderPoint || 0)).length
          : 0,
        source: 'inventoryStock quantityOnHand <= reorderPoint',
      },
      booking_conversion: { label: 'Booking conversion', value: bookings.length ? `${Math.round((convertedBookings / bookings.length) * 100)}%` : 'No bookings', source: 'booking statuses' },
      job_completion_velocity: { label: 'Completion velocity', value: `${completed.length}/${Math.max(jobs.length, 1)}`, source: 'completed jobs / total jobs' },
      technician_conversion_rate: { label: 'Technician conversion', value: `${completed.length} completed`, source: 'assigned/completed job records' },
      profit_margin_by_job_type: {
        label: 'Margin by job type',
        value: jobs.some((job: any) => Number(job.totalCents || 0) || Number(job.costCents || 0)) ? 'available' : 'Needs cost/revenue',
        source: 'real totalCents/costCents only',
      },
    } as Record<string, any>;
    return { selectedWidgets: config.selectedWidgets, widgets: config.selectedWidgets.map((key: string) => ({ key, ...widgets[key] })).filter((item: any) => item.label) };
  }

  async getClientCommsReadiness(tenantId: string) {
    const settings = await this.tenantSettings(tenantId);
    const config = asObject(settings?.businessConfigJson);
    return {
      mode: asObject(config?.automations?.v1).deliveryMode === 'live_send' ? 'provider_ready_live_send' : 'in_app_first_metadata_only',
      triggers: [
        'technician_on_route_manual_eta',
        'technician_10_minutes_away_when_real_eta_exists',
        'job_completed',
        'review_request',
        'seasonal_maintenance_reminder',
        'payment_reminder',
        'estimate_approved',
      ],
      safeguards: ['dedupe_key_required', 'rate_limited', 'opt_out_respected', 'audit_trail', 'no_spam_loops'],
      outboundChannels: { inApp: true, emailSms: 'existing_safe_sender_controls_only' },
    };
  }

  async queueClientComm(tenantId: string, userId: string, body: any) {
    const trigger = cleanId(body?.trigger, 'trigger').slice(0, 80);
    const entityId = cleanId(body?.entityId, 'entityId');
    const dedupeKey = `${trigger}:${entityId}:${new Date().toISOString().slice(0, 10)}`;
    const recent = await (this.prisma as any).integrationOrchestrationEvent.findFirst({
      where: { tenantId, action: 'phase1k.client_comms.queue', metadataJson: { path: ['dedupeKey'], equals: dedupeKey } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);
    if (recent) return { queued: false, deduped: true, dedupeKey };
    const event = await (this.prisma as any).integrationOrchestrationEvent.create({
      data: {
        tenantId,
        provider: 'GENERIC_API',
        action: 'phase1k.client_comms.queue',
        safeCategory: 'in_app_first_comms',
        result: 'queued',
        message: `${trigger} client communication queued with safe sender controls`,
        metadataJson: { trigger, entityId, dedupeKey, queuedByUserId: userId, outboundLiveSend: false },
      },
    });
    await this.audit.log(tenantId, 'phase1k.client_comms.queued', `${trigger} client communication queued`, userId);
    return { queued: true, id: event.id, dedupeKey, outboundLiveSend: false };
  }

  async getWalkthroughs(tenantId: string, user: JwtPayload) {
    const settings = await this.tenantSettings(tenantId);
    const config = asObject(settings?.businessConfigJson);
    const state = asObject(asObject(config.phase1k).walkthroughsByUser)?.[user.sub] || {};
    const role = String(user.role || '').toUpperCase();
    const steps = role === 'TECHNICIAN'
      ? ['technician_first_login', 'complete_job', 'upload_photo', 'mark_payment_evidence', 'use_live_work', 'use_notifications']
      : ['create_job', 'complete_job', 'upload_photo', 'mark_payment_evidence', 'use_live_work', 'use_notifications'];
    return {
      role,
      intrusivePopups: false,
      mobileSafe: true,
      dismissible: true,
      resumeLater: true,
      steps: steps.map((step) => ({ key: step, status: state?.[step] || 'available' })),
    };
  }

  async saveWalkthroughs(tenantId: string, user: JwtPayload, body: any) {
    const step = cleanId(body?.step, 'step').slice(0, 80);
    const status = ['dismissed', 'completed', 'available'].includes(String(body?.status)) ? String(body.status) : 'available';
    const settings = await this.tenantSettings(tenantId);
    const config = asObject(settings?.businessConfigJson);
    const phase = asObject(config.phase1k);
    const byUser = asObject(phase.walkthroughsByUser);
    byUser[user.sub] = { ...asObject(byUser[user.sub]), [step]: status };
    phase.walkthroughsByUser = byUser;
    await (this.prisma as any).tenantSetting.upsert({
      where: { tenantId },
      update: { businessConfigJson: { ...config, phase1k: phase } },
      create: { tenantId, businessConfigJson: { ...config, phase1k: phase } },
    });
    await this.audit.log(tenantId, 'phase1k.walkthrough.saved', `${step} walkthrough ${status}`, user.sub);
    return this.getWalkthroughs(tenantId, user);
  }

  async getTechnicianSurface() {
    return {
      simplified: true,
      visible: ['assigned_work', 'job_actions', 'photos_evidence', 'eta_status', 'stock_used', 'notifications', 'customer_safe_context'],
      hiddenForFrontline: ['deep_accounting', 'admin_tools', 'provider_secrets', 'billing_catalog_controls'],
      rbacPreserved: true,
    };
  }

  async exportCsv(tenantId: string, userId: string, type: string) {
    const db = this.prisma as any;
    const normalized = String(type || '').trim().toLowerCase();
    let filename = `${normalized || 'export'}.csv`;
    let rows: unknown[][] = [];
    if (normalized === 'contacts') {
      filename = 'contacts.csv';
      const contacts = await db.customer.findMany({ where: { companyId: tenantId }, select: { name: true, email: true, phone: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 5000 });
      rows = [['name', 'email', 'phone', 'createdAt'], ...contacts.map((row: any) => [row.name, row.email, row.phone, row.createdAt])];
    } else if (normalized === 'job-history') {
      filename = 'job-history.csv';
      const jobs = await db.job.findMany({ where: { companyId: tenantId }, select: { jobRef: true, customerName: true, serviceName: true, status: true, scheduledAt: true, completedAt: true }, orderBy: { createdAt: 'desc' }, take: 5000 });
      rows = [['jobRef', 'customerName', 'serviceName', 'status', 'scheduledAt', 'completedAt'], ...jobs.map((row: any) => [row.jobRef, row.customerName, row.serviceName, row.status, row.scheduledAt, row.completedAt])];
    } else if (normalized === 'inventory') {
      filename = 'inventory.csv';
      const stocks = await db.inventoryStock.findMany({
        where: { tenantId },
        select: {
          quantityOnHand: true,
          quantityReserved: true,
          reorderPoint: true,
          updatedAt: true,
          stockItem: { select: { sku: true, name: true, unit: true, category: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 5000,
      }).catch(() => []);
      rows = [
        ['sku', 'name', 'category', 'unit', 'quantityOnHand', 'quantityReserved', 'reorderPoint', 'updatedAt'],
        ...stocks.map((row: any) => [row.stockItem?.sku, row.stockItem?.name, row.stockItem?.category, row.stockItem?.unit, row.quantityOnHand, row.quantityReserved, row.reorderPoint, row.updatedAt]),
      ];
    } else if (normalized === 'payments') {
      filename = 'payment-reconciliation.csv';
      const jobs = await db.job.findMany({ where: { companyId: tenantId }, select: { jobRef: true, customerName: true, totalCents: true, invoiceIssuedAt: true, invoicePaidAt: true }, orderBy: { updatedAt: 'desc' }, take: 5000 });
      rows = [['jobRef', 'customerName', 'totalCents', 'invoiceIssuedAt', 'invoicePaidAt'], ...jobs.map((row: any) => [row.jobRef, row.customerName, row.totalCents, row.invoiceIssuedAt, row.invoicePaidAt])];
    } else {
      throw new BadRequestException('Unsupported export type');
    }
    await this.audit.log(tenantId, 'phase1k.export.csv', `${filename} exported with sanitized fields`, userId);
    return { filename, csv: rows.map((row) => row.map(csvEscape).join(',')).join('\n') + '\n' };
  }
}
