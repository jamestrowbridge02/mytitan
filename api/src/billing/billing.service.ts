import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';
import * as crypto from 'crypto';
import Stripe from 'stripe';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_WORKSPACE_CURRENCY } from '../common/geo-defaults';
import { isAutomationsV1Enabled, isNotificationsV1Enabled } from '../common/feature-flags';
import { NotificationsService } from '../notifications/notifications.service';
import { AutomationsService } from '../automations/automations.service';
import { buildAppUrl } from '../common/public-url';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationClientFactory } from '../integrations/integration-client.factory';
import { encryptText } from '../integrations/integrations.crypto';
import { EnterpriseFeatureFlagsService } from '../enterprise/enterprise-feature-flags.service';
import { PlatformPaymentProviderConfigService } from '../platform-config/platform-payment-provider-config.service';
import { DEFAULT_INTERVAL, DEFAULT_PLAN_CODE, PLAN_DEFINITIONS, getPricingModelSummary } from './billing.constants';
import { BillingBalanceAdjustmentDto, CustomerPaymentRequestDto, FinanceReportQueryDto, ManualPaymentRequestPaidDto, PricingAdjustmentDto, RefundBookingDepositDto, RefundPaymentDto, TrialOverrideDto, UpdatePaymentCollectionDto } from './billing.dto';
import { DocumentControlService } from '../document-control/document-control.service';
import {
  buildDefaultJobCompletionPackSnapshot,
  extractJobCompletionPackCodeFromMetadata,
  formatJobCompletionPackPrice,
  JOB_COMPLETION_PACK_CATALOG_KEY,
  JOB_COMPLETION_PACK_DEFINITIONS,
  normalizeJobCompletionPackCode,
  sanitizeJobCompletionPackSnapshot,
  summarizeJobCompletionPackSnapshot,
  type JobCompletionPackLookupSource,
  type JobCompletionPackSnapshot,
  type JobCompletionPackSnapshotRow,
  type JobCompletionPackSyncStatus,
} from './job-completion-products';
import {
  buildPaymentCollectionOptions,
  readPaymentCollectionConfig,
  summarizeCustomerCollectionReadiness,
  writePaymentCollectionConfig,
} from './payment-collection';
import { buildPaymentProviderCanaryFramework } from './payment-provider-canaries';
import { formatCurrencyMinorUnits, getPlanBasePriceCents, normalizeStoredPricingAdjustment, parseCurrencyToMinorUnits, resolvePricingState } from './billing-pricing';

@Injectable()
export class BillingService {
  private readonly stripe: Stripe | null;
  private stripeConnectClient: Stripe | null = null;
  private stripeConnectSecretFingerprint = '';
  private readonly logger = new Logger(BillingService.name);
  private readonly tenantStripeReadinessCache = new Map<string, { expiresAt: number; ready: boolean; runtimeReloadedAt: string | null }>();

  clearTenantPaymentReadinessCache(tenantId?: string | null) {
    const before = this.tenantStripeReadinessCache.size;
    if (tenantId) this.tenantStripeReadinessCache.delete(tenantId);
    else this.tenantStripeReadinessCache.clear();
    return { before, after: this.tenantStripeReadinessCache.size, tenantId: tenantId || null };
  }

  private resolveStripeSecretKey(rawValue?: string | null) {
    const value = rawValue?.trim();
    if (!value) return null;
    if (/^(sk|rk)_(test|live)_/.test(value)) {
      return value;
    }
    if (/^pk_(test|live)_/.test(value)) {
      this.logger.warn('STRIPE_SECRET_KEY is set to a publishable key. Stripe server-side features will remain disabled until a secret key is configured.');
      return null;
    }
    this.logger.warn('STRIPE_SECRET_KEY does not look like a valid Stripe secret key. Stripe server-side features will remain disabled.');
    return null;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly automations: AutomationsService,
    private readonly integrationClientFactory: IntegrationClientFactory,
    private readonly enterpriseFlags: EnterpriseFeatureFlagsService,
    private readonly platformPaymentProviderConfig: PlatformPaymentProviderConfigService,
    private readonly documents: DocumentControlService,
  ) {
    const billingSecret = this.resolveStripeSecretKey(process.env.STRIPE_SECRET_KEY);
    this.stripe = billingSecret ? new Stripe(billingSecret, { apiVersion: '2023-10-16' }) : null;
  }

  private get stripeConnect() {
    const configured = this.platformPaymentProviderConfig.getRuntimeConfig().platformSecret;
    const connectSecret = this.resolveStripeSecretKey(configured);
    if (!connectSecret) {
      this.stripeConnectClient = null;
      this.stripeConnectSecretFingerprint = '';
      return null;
    }
    const fingerprint = crypto.createHash('sha256').update(connectSecret).digest('hex');
    if (!this.stripeConnectClient || this.stripeConnectSecretFingerprint !== fingerprint) {
      this.stripeConnectClient = new Stripe(connectSecret, { apiVersion: '2023-10-16' });
      this.stripeConnectSecretFingerprint = fingerprint;
    }
    return this.stripeConnectClient;
  }

  private requireStripe() {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }
    return this.stripe;
  }

  private requireStripeConnect() {
    if (!this.stripeConnect) {
      throw new ServiceUnavailableException('Stripe Connect is not configured');
    }
    return this.stripeConnect;
  }

  private getExpectedJobCompletionPackCurrency() {
    return (
      String(process.env.STRIPE_JOB_COMPLETION_PACK_CURRENCY || process.env.DEFAULT_WORKSPACE_CURRENCY || DEFAULT_WORKSPACE_CURRENCY)
        .trim()
        .toUpperCase() || DEFAULT_WORKSPACE_CURRENCY
    );
  }

  private buildSimplePdf(lines: string[]) {
    const escaped = lines.slice(0, 52).map((line) =>
      String(line || '')
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/[^\x20-\x7E]/g, '?'),
    );
    const operations = ['BT', '/F1 10 Tf', '40 800 Td'];
    escaped.forEach((line, index) => {
      if (index > 0) operations.push('0 -14 Td');
      operations.push(`(${line}) Tj`);
    });
    operations.push('ET');
    const stream = operations.join('\n');
    const objects = [
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
      '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
      `5 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`,
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (const object of objects) {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += `${object}\n`;
    }
    const xrefStart = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index <= objects.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    return Buffer.from(pdf, 'utf8');
  }

  private formatMoneyLabel(cents: number, currency: string) {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: String(currency || DEFAULT_WORKSPACE_CURRENCY).toUpperCase(),
    }).format(Number(cents || 0) / 100);
  }

  private async readStoredJobCompletionPackSnapshot() {
    const db = this.prisma as any;
    const row = await db.billingCatalogSync?.findUnique({
      where: { key: JOB_COMPLETION_PACK_CATALOG_KEY },
    });
    if (!row?.snapshotJson || typeof row.snapshotJson !== 'object') {
      return null;
    }
    return row.snapshotJson as JobCompletionPackSnapshot;
  }

  private maskStripeId(value?: string | null) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (raw.length <= 10) return `${raw.slice(0, 2)}••${raw.slice(-2)}`;
    return `${raw.slice(0, 6)}••••${raw.slice(-4)}`;
  }

  private buildCatalogOverrideKey(kind: string, code: string, interval?: string | null) {
    return [kind, code, interval || 'none'].join(':').toLowerCase();
  }

  private resolveCatalogExpectedAmountCents(input: Record<string, any>, currency: string | null) {
    const humanAmount = input.expectedAmount ?? input.expectedAmountDisplay ?? input.expectedAmountHuman;
    if (humanAmount != null && humanAmount !== '') {
      try {
        return parseCurrencyToMinorUnits(humanAmount, { currency: currency || 'GBP', fieldLabel: 'Expected amount' });
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Expected amount must be a currency amount like £19.00.');
      }
    }

    const rawCents = input.expectedAmountCents;
    if (rawCents == null || rawCents === '') {
      return null;
    }
    if (typeof rawCents === 'string' && /[£.]/.test(rawCents)) {
      try {
        return parseCurrencyToMinorUnits(rawCents, { currency: currency || 'GBP', fieldLabel: 'Expected amount' });
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Expected amount must be a currency amount like £19.00.');
      }
    }

    const cents = Number(rawCents);
    if (!Number.isFinite(cents) || !Number.isInteger(cents) || cents <= 0) {
      throw new BadRequestException('Expected amount must be greater than £0.00. Enter £19.00.');
    }
    return cents;
  }

  private async listBillingCatalogOverrides(kind?: string) {
    const db = this.prisma as any;
    return db.billingCatalogOverride.findMany({
      where: kind ? { kind } : undefined,
      orderBy: [{ kind: 'asc' }, { code: 'asc' }, { interval: 'asc' }],
    });
  }

  private async listBillingCatalogOverrideHistory(overrideKeys?: string[]) {
    const db = this.prisma as any;
    return db.billingCatalogOverrideHistory.findMany({
      where: overrideKeys?.length ? { overrideKey: { in: overrideKeys } } : undefined,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  private async findBillingCatalogOverride(kind: string, code: string, interval?: string | null) {
    const db = this.prisma as any;
    return db.billingCatalogOverride.findUnique({
      where: {
        key: this.buildCatalogOverrideKey(kind, code, interval),
      },
    });
  }

  private async resolveJobCompletionPackCatalogSource(definition: (typeof JOB_COMPLETION_PACK_DEFINITIONS)[number]) {
    const override = await this.findBillingCatalogOverride('job_pack', definition.code, null);
    return {
      priceId: String(override?.stripePriceId || process.env[definition.envPriceId] || '').trim() || null,
      productId: String(override?.stripeProductId || process.env[definition.envProductId] || '').trim() || null,
      lookupKey: String(override?.lookupKey || definition.code).trim() || definition.code,
      currency: String(override?.currency || '').trim().toUpperCase() || null,
      expectedAmountCents:
        Number.isFinite(Number(override?.expectedAmountCents)) && override?.expectedAmountCents != null
          ? Number(override.expectedAmountCents)
          : definition.amountCents,
      active: override?.active !== false,
      override,
    };
  }

  private async writeStoredJobCompletionPackSnapshot(snapshot: JobCompletionPackSnapshot) {
    const db = this.prisma as any;
    await db.billingCatalogSync?.upsert({
      where: { key: JOB_COMPLETION_PACK_CATALOG_KEY },
      update: {
        status: snapshot.status,
        snapshotJson: snapshot,
        lastCheckedAt: snapshot.lastCheckedAt ? new Date(snapshot.lastCheckedAt) : new Date(),
      },
      create: {
        key: JOB_COMPLETION_PACK_CATALOG_KEY,
        status: snapshot.status,
        snapshotJson: snapshot,
        lastCheckedAt: snapshot.lastCheckedAt ? new Date(snapshot.lastCheckedAt) : new Date(),
      },
    });
  }

  private buildUnsyncedJobCompletionPackSnapshot(message?: string) {
    return buildDefaultJobCompletionPackSnapshot({
      expectedCurrency: this.getExpectedJobCompletionPackCurrency(),
      message,
    });
  }

  private async resolveCustomerCollectionStatuses(tenantId: string) {
    const rows = await (this.prisma as any).integrationCredential.findMany({
      where: {
        tenantId,
        scope: 'WORKSPACE',
        provider: {
          in: ['STRIPE_CUSTOMER_PAYMENTS', 'SUMUP', 'WORLDPAY'],
        },
      },
      select: {
        provider: true,
        status: true,
      },
    });
    return rows.reduce((acc: Record<string, string>, row: { provider: string; status: string }) => {
      if (row.provider === 'STRIPE_CUSTOMER_PAYMENTS') {
        acc.STRIPE = String(row.status || '').toLowerCase();
      } else {
        acc[String(row.provider || '').toUpperCase()] = String(row.status || '').toLowerCase();
      }
      return acc;
    }, {});
  }

  private maskProviderReference(value?: string | null) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (raw.length <= 10) return `${raw.slice(0, 2)}••${raw.slice(-2)}`;
    return `${raw.slice(0, 6)}••••${raw.slice(-4)}`;
  }

  private generatePublicPaymentToken() {
    return crypto.randomBytes(24).toString('base64url');
  }

  private hashPublicPaymentToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private normalizeTenantPaymentProvider(input?: string | null) {
    const raw = String(input || '').trim().toLowerCase();
    if (['stripe', 'stripe_connect', 'stripe-connect', 'stripe-customer-payments'].includes(raw)) return 'stripe-connect';
    if (['openbanking', 'open_banking', 'open-banking'].includes(raw)) return 'open-banking';
    if (['paypal'].includes(raw)) return 'paypal';
    if (['gocardless', 'go-cardless', 'go_cardless'].includes(raw)) return 'gocardless';
    if (['sumup'].includes(raw)) return 'sumup';
    if (['worldpay'].includes(raw)) return 'worldpay';
    return 'manual';
  }

  private mapCredentialStatusToReadiness(row?: any | null) {
    const status = String(row?.status || '').trim().toUpperCase();
    if (!row) return 'setup_needed';
    if (status === 'CONNECTED' && !row.lastVerifiedAt) return 'verification_required';
    if (status === 'CONNECTED') return 'connected';
    if (status === 'NEEDS_REAUTH') return 'needs_reconnect';
    if (status === 'DISABLED') return 'disabled';
    if (status === 'ERROR') return 'error';
    return 'setup_needed';
  }

  private providerReadyForCustomerCheckout(provider: any) {
    return Boolean(
      provider?.ready &&
      provider?.liveCapture &&
      provider?.checkoutEligible &&
      provider?.readinessState === 'ready',
    );
  }

  private tenantPaymentDiagnostic(category?: string | null) {
    const raw = String(category || '').trim().toLowerCase();
    if (!raw) return 'ready';
    const mapping: Record<string, string> = {
      missing_connected_account: 'tenant_stripe_account_missing',
      credential_not_connected: 'tenant_provider_not_enabled',
      credential_missing: 'missing_tenant_provider',
      provider_verification_required: 'tenant_provider_webhook_unverified',
      missing_webhook_secret: 'tenant_provider_webhook_unverified',
      invalid_signature: 'tenant_provider_webhook_unverified',
      stripe_runtime_missing: 'platform_connect_secret_mismatch',
      stripe_connect_platform_account_required: 'platform_connect_secret_mismatch',
      stripe_connected_account_invalid: 'tenant_stripe_account_missing',
      stripe_account_verify_failed: 'platform_connect_secret_mismatch',
      account_invalid: 'tenant_stripe_account_missing',
    };
    if (mapping[raw]) return mapping[raw];
    if (raw.includes('details')) return 'tenant_stripe_details_missing';
    if (raw.includes('charges')) return 'tenant_stripe_charges_disabled';
    if (raw.includes('onboarding') || raw.includes('requirements')) return 'tenant_stripe_onboarding_incomplete';
    if (raw.includes('currency') || raw.includes('country')) return 'country_or_currency_unsupported';
    if (raw.includes('mode')) return 'mode_mismatch';
    return 'tenant_stripe_onboarding_incomplete';
  }

  private tenantPaymentReadinessState(input: {
    hasCredential: boolean;
    enabled: boolean;
    storedState: string;
    checkoutEligible: boolean;
  }) {
    if (!input.hasCredential || input.storedState === 'disabled') return 'not_connected';
    if (!input.enabled || input.storedState === 'setup_needed' || input.storedState === 'verification_required') {
      return 'needs_setup';
    }
    if (!input.checkoutEligible) return 'needs_attention';
    return 'ready';
  }

  private async recordPlatformStripeDiagnostic(input: {
    credentialId?: string | null;
    diagnostic: string;
  }) {
    const db = this.prisma as any;
    const sourceRef = `stripe-connect:${String(input.credentialId || 'runtime')}`;
    const existing = await db.platformSafeErrorLog.findFirst({
      where: { category: 'customer_payment_provider', sourceRef, status: 'open' },
      orderBy: { lastSeenAt: 'desc' },
    }).catch(() => null);
    const details = {
      provider: 'stripe_connect',
      diagnostic: input.diagnostic,
      reason: 'current platform secret cannot verify tenant connected account',
      required_action: 'configure_matching_stripe_connect_platform_secret',
      checkout_blocked: true,
    };
    if (existing) {
      await db.platformSafeErrorLog.update({
        where: { id: existing.id },
        data: {
          summary: 'Stripe Connect platform credential does not match the tenant connected account.',
          sanitizedDetailsJson: details,
          lastSeenAt: new Date(),
          occurrenceCount: { increment: 1 },
        },
      }).catch(() => null);
      return;
    }
    await db.platformSafeErrorLog.create({
      data: {
        category: 'customer_payment_provider',
        area: 'stripe_connect',
        summary: 'Stripe Connect platform credential does not match the tenant connected account.',
        sanitizedDetailsJson: details,
        sourceKind: 'integration_credential',
        sourceRef,
        severity: 'critical',
        clearable: false,
        auditProtected: true,
      },
    }).catch(() => null);
  }

  private tenantStripeConnectMode() {
    const raw = String(
      this.platformPaymentProviderConfig.getRuntimeConfig().mode ||
      process.env.MYTITAN_TENANT_STRIPE_CONNECT_MODE ||
      '',
    ).trim().toLowerCase();
    if (raw === 'live') return 'live';
    return 'dry_run';
  }

  private tenantStripeConnectLiveEnabled() {
    return this.tenantStripeConnectMode() === 'live';
  }

  private tenantStripeConnectWebhookSecret() {
    return this.platformPaymentProviderConfig.getRuntimeConfig().webhookSecret;
  }

  private async resolveTenantPaymentsFlag(tenantId: string, userId?: string | null) {
    try {
      return await this.enterpriseFlags.resolve({ tenantId, userId, key: 'tenant_payments_byog_v1' });
    } catch {
      return {
        key: 'tenant_payments_byog_v1',
        enabled: false,
        source: 'unavailable',
      };
    }
  }

  private extractTenantStripeAccountId(source?: Record<string, any> | null) {
    if (!source || typeof source !== 'object') return null;
    const raw = String(
      source.connectedAccountId ||
        source.stripeAccountId ||
        source.accountReference ||
        source.accountLabel ||
        source.accountId ||
        source.account ||
        '',
    ).trim();
    if (!raw) return null;
    return /^acct_[A-Za-z0-9_]+$/.test(raw) ? raw : null;
  }

  private maskStripeAccountId(value?: string | null) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (!raw.startsWith('acct_')) return this.maskProviderReference(raw);
    return `${raw.slice(0, 9)}••••${raw.slice(-4)}`;
  }

  private redactStripeDiagnosticMessage(value?: string | null) {
    return String(value || 'provider_request_failed')
      .replace(/\b(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9_]+\b/g, '[redacted_key]')
      .replace(/\bwhsec_[A-Za-z0-9_]+\b/g, '[redacted_webhook_secret]')
      .replace(/\bacct_[A-Za-z0-9_]+\b/g, '[redacted_account]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted_email]')
      .slice(0, 180);
  }

  private verifyStripeSignatureHeader(input: { secret: string; payload: Buffer; header?: string | string[] | null }) {
    const header = Array.isArray(input.header)
      ? String(input.header[0] || '').trim()
      : String(input.header || '').trim();
    if (!header.includes('v1=') || !header.includes('t=')) return null;
    const parts = header.split(',').reduce<Record<string, string[]>>((acc, part) => {
      const [key, ...rest] = part.split('=');
      const normalizedKey = String(key || '').trim();
      const value = rest.join('=').trim();
      if (!normalizedKey || !value) return acc;
      acc[normalizedKey] = [...(acc[normalizedKey] || []), value];
      return acc;
    }, {});
    const timestamp = Number(parts.t?.[0] || 0);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
    if (ageSeconds > 300) return false;
    const expected = crypto.createHmac('sha256', input.secret).update(`${timestamp}.${input.payload.toString('utf8')}`).digest('hex');
    return (parts.v1 || []).some((signature) => {
      const left = Buffer.from(String(signature || '').trim());
      const right = Buffer.from(expected);
      return left.length === right.length && crypto.timingSafeEqual(left, right);
    });
  }

  private async resolveTenantStripeConnectClient(tenantId: string, options?: { allowDisabled?: boolean }) {
    const result = await this.integrationClientFactory.resolveScopedClient({
      tenantId,
      provider: 'STRIPE_CUSTOMER_PAYMENTS',
      scope: 'WORKSPACE',
      allowNeedsReauth: true,
      allowDisabled: Boolean(options?.allowDisabled),
    });
    if (!result.ok) {
      const failed = result as Extract<Awaited<ReturnType<IntegrationClientFactory['resolveScopedClient']>>, { ok: false }>;
      return { ok: false as const, category: failed.category };
    }
    const connectedAccountId = this.extractTenantStripeAccountId(result.payload) || this.extractTenantStripeAccountId(result.metadata);
    if (!connectedAccountId) return { ok: false as const, category: 'missing_connected_account' };
    return {
      ok: true as const,
      connectedAccountId,
      accountMasked: this.maskStripeAccountId(connectedAccountId),
      routeId: result.routeId,
      status: result.status,
      metadata: result.metadata,
      credential: result.credential,
      webhookSecretConfigured: Boolean(this.tenantStripeConnectWebhookSecret() || result.secretMaterial),
    };
  }

  private stripeConnectRuntimeReloadedAt() {
    const value = this.platformPaymentProviderConfig.getRuntimeStatus().lastReloadedAt;
    return value ? new Date(value).toISOString() : null;
  }

  private async recordStripeConnectOnboardingAttempt(input: {
    tenantId: string;
    userId: string;
    result: string;
    actionUrlReturned: boolean;
    stripeAccountCreated: boolean;
    accountLinkCreated: boolean;
    failureReason?: string | null;
  }) {
    const db = this.prisma as any;
    await db.platformAutopilotEvent.create({
      data: {
        kind: 'stripe_connect_onboarding',
        key: input.tenantId,
        status: input.actionUrlReturned ? 'resolved' : 'warning',
        summary: input.actionUrlReturned
          ? 'Stripe Connect onboarding URL returned'
          : 'Stripe Connect onboarding did not return a URL',
        detail: input.failureReason || null,
        nextAction: input.actionUrlReturned ? 'Tenant continues setup in Stripe' : 'Review the redacted failure reason and retry onboarding',
        affectedRef: input.tenantId,
        actorUserId: input.userId,
        metadataJson: {
          tenantId: input.tenantId,
          result: input.result,
          actionUrlReturned: input.actionUrlReturned,
          stripeAccountCreated: input.stripeAccountCreated,
          accountLinkCreated: input.accountLinkCreated,
          failureReason: input.failureReason || null,
        },
      },
    }).catch(() => null);
  }

  async getLatestStripeConnectOnboardingAttempt() {
    const db = this.prisma as any;
    const row = await db.platformAutopilotEvent.findFirst({
      where: { kind: 'stripe_connect_onboarding' },
      orderBy: { checkedAt: 'desc' },
    });
    if (!row) return null;
    const metadata = row.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
      ? row.metadataJson as Record<string, any>
      : {};
    const tenant = row.affectedRef
      ? await db.company.findUnique({ where: { id: row.affectedRef }, select: { id: true, name: true } })
      : null;
    return {
      tenant: tenant || (row.affectedRef ? { id: row.affectedRef, name: row.affectedRef } : null),
      result: String(metadata.result || row.status || 'unknown'),
      actionUrlReturned: metadata.actionUrlReturned === true,
      stripeAccountCreated: metadata.stripeAccountCreated === true,
      accountLinkCreated: metadata.accountLinkCreated === true,
      failureReason: metadata.failureReason ? String(metadata.failureReason).slice(0, 160) : null,
      attemptedAt: row.checkedAt,
    };
  }

  private async refreshTenantStripeCheckoutReadiness(tenantId: string, options?: { force?: boolean; actorUserId?: string | null }) {
    const cached = this.tenantStripeReadinessCache.get(tenantId);
    const runtimeReloadedAt = this.stripeConnectRuntimeReloadedAt();
    if (!options?.force && cached && cached.expiresAt > Date.now() && cached.runtimeReloadedAt === runtimeReloadedAt) return cached.ready;
    if (!this.stripeConnect) {
      this.tenantStripeReadinessCache.set(tenantId, { ready: false, expiresAt: Date.now() + 15_000, runtimeReloadedAt });
      return false;
    }
    const client = await this.resolveTenantStripeConnectClient(tenantId);
    if (!client.ok) {
      const category = client.category;
      const db = this.prisma as any;
      await db.integrationCredential.updateMany({
        where: { tenantId, provider: 'STRIPE_CUSTOMER_PAYMENTS', scope: 'WORKSPACE' },
        data: { lastVerifiedAt: new Date(), lastErrorCategory: category },
      }).catch(() => null);
      this.tenantStripeReadinessCache.set(tenantId, { ready: false, expiresAt: Date.now() + 15_000, runtimeReloadedAt });
      return false;
    }
    try {
      const account = await this.stripeConnect.accounts.retrieve(client.connectedAccountId);
      const chargesEnabled = Boolean((account as any).charges_enabled);
      const payoutsEnabled = Boolean((account as any).payouts_enabled);
      const detailsSubmitted = Boolean((account as any).details_submitted);
      const disabledReason = String((account as any).requirements?.disabled_reason || '').trim() || null;
      const readinessError = !detailsSubmitted
        ? 'tenant_stripe_details_missing'
        : !chargesEnabled
          ? 'tenant_stripe_charges_disabled'
          : !payoutsEnabled
            ? 'tenant_stripe_payouts_disabled'
          : disabledReason
            ? 'tenant_stripe_onboarding_incomplete'
            : null;
      const ready = !readinessError;
      const db = this.prisma as any;
      await db.integrationCredential.update({
        where: { id: client.credential.id },
        data: {
          status: ready ? 'CONNECTED' : 'NEEDS_REAUTH',
          lastVerifiedAt: new Date(),
          lastErrorCategory: readinessError,
          metadataJson: {
            ...(client.metadata || {}),
            accountMasked: client.accountMasked,
            chargesEnabled,
            payoutsEnabled,
            detailsSubmitted,
            verificationMode: 'live',
            ownership: 'tenant_owned',
          },
        },
      });
      this.tenantStripeReadinessCache.set(tenantId, { ready, expiresAt: Date.now() + 60_000, runtimeReloadedAt });
      if (options?.actorUserId) {
        await this.audit.log(
          tenantId,
          'billing.tenant_stripe_connect.verify_live',
          `Stripe Connect account ${ready ? 'ready' : 'needs reconnect'}`,
          options.actorUserId,
        );
      }
      return ready;
    } catch (error: any) {
      const category = String(error?.code || '').toLowerCase() === 'platform_account_required'
        ? 'stripe_connect_platform_account_required'
        : String(error?.code || '').toLowerCase() === 'account_invalid'
          ? 'stripe_connected_account_invalid'
          : 'stripe_account_verify_failed';
      const db = this.prisma as any;
      await db.integrationCredential.update({
        where: { id: client.credential.id },
        data: {
          status: 'NEEDS_REAUTH',
          lastVerifiedAt: new Date(),
          lastErrorCategory: category,
        },
      }).catch(() => null);
      if (category === 'stripe_connect_platform_account_required' || category === 'stripe_account_verify_failed') {
        await this.recordPlatformStripeDiagnostic({
          credentialId: client.credential.id,
          diagnostic: String(error?.code || '').toLowerCase() === 'platform_account_required'
            ? 'platform_account_required'
            : 'platform_connect_secret_mismatch',
        });
      }
      await this.audit.log(
        tenantId,
        'billing.tenant_stripe_connect.verify_failed',
        'Tenant Stripe customer-payment verification failed',
        options?.actorUserId || undefined,
      ).catch(() => null);
      this.tenantStripeReadinessCache.set(tenantId, { ready: false, expiresAt: Date.now() + 15_000, runtimeReloadedAt });
      return false;
    }
  }

  private async createTenantStripeCheckoutSession(input: {
    tenantId: string;
    job: any;
    requestId: string;
    providerRequestRef: string;
  }) {
    const flag = await this.resolveTenantPaymentsFlag(input.tenantId);
    if (!flag.enabled) {
      return {
        actionUrl: null,
        providerRequestRef: input.providerRequestRef,
        status: 'provider_pending',
        lifecycleState: 'feature_disabled',
        detail: 'Tenant-owned payment checkout is feature-gated; no customer checkout session was created.',
      };
    }
    if (!this.tenantStripeConnectLiveEnabled()) {
      return {
        actionUrl: null,
        providerRequestRef: input.providerRequestRef,
        status: 'provider_pending',
        lifecycleState: 'dry_run_ready',
        detail: 'Stripe Connect dry-run is enabled; no customer checkout session was created.',
      };
    }
    if (!this.stripeConnect) {
      return {
        actionUrl: null,
        providerRequestRef: input.providerRequestRef,
        status: 'provider_unavailable',
        lifecycleState: 'runtime_not_configured',
        detail: 'Stripe Connect checkout requires the server-side Stripe runtime to be configured.',
      };
    }
    const client = await this.resolveTenantStripeConnectClient(input.tenantId);
    if (!client.ok) {
      return {
        actionUrl: null,
        providerRequestRef: input.providerRequestRef,
        status: 'provider_unavailable',
        lifecycleState: client.category,
        detail: 'The tenant-owned Stripe account is not ready for checkout.',
      };
    }
    const currency = String(input.job.currency || DEFAULT_WORKSPACE_CURRENCY).toLowerCase();
    const token = input.job.publicTokens?.[0]?.token || null;
    const successUrl = token
      ? buildAppUrl(`/portal/job/${token}?payment=processing`)
      : buildAppUrl(`/dashboard/jobs/${input.job.id}?payment=processing`);
    const cancelUrl = token
      ? buildAppUrl(`/portal/job/${token}?payment=cancelled`)
      : buildAppUrl(`/dashboard/jobs/${input.job.id}?payment=cancelled`);
    const session = await this.stripeConnect.checkout.sessions.create(
      {
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: input.requestId,
        customer_email: String(input.job.customerEmail || '').trim() || undefined,
        payment_intent_data: {
          metadata: {
            type: 'customer_payment_request',
            tenantId: input.tenantId,
            jobId: input.job.id,
            paymentRequestId: input.requestId,
            paymentRequestRef: input.providerRequestRef,
          },
        },
        metadata: {
          type: 'customer_payment_request',
          tenantId: input.tenantId,
          jobId: input.job.id,
          paymentRequestId: input.requestId,
          paymentRequestRef: input.providerRequestRef,
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: Number(input.job.totalCents || 0),
              product_data: {
                name: `Invoice ${input.job.invoiceNumber || input.job.jobRef || input.job.id}`,
                metadata: {
                  tenantId: input.tenantId,
                  jobId: input.job.id,
                },
              },
            },
          },
        ],
      },
      {
        stripeAccount: client.connectedAccountId,
        idempotencyKey: `customer-payment:${input.tenantId}:${input.requestId}`,
      },
    );
    return {
      actionUrl: session.url || null,
      providerRequestRef: session.id || input.providerRequestRef,
      status: 'payment_processing',
      lifecycleState: 'checkout_session_created',
      detail: 'Checkout session created on the tenant-owned Stripe account.',
      sessionIdMasked: this.maskProviderReference(session.id),
      accountMasked: client.accountMasked,
    };
  }

  private sanitizePaymentRequest(row: any | null, options?: { includeProviderRef?: boolean }) {
    if (!row) return null;
    return {
      id: row.id,
      jobId: row.jobId,
      customerId: row.customerId || null,
      provider: row.provider,
      providerState: row.providerState,
      status: row.status,
      amountCents: Number(row.amountCents || 0),
      currency: row.currency,
      providerRequestRef: options?.includeProviderRef ? this.maskProviderReference(row.providerRequestRef) : null,
      actionUrl: row.actionUrl || null,
      dueAt: row.dueAt || null,
      sentAt: row.sentAt || null,
      paidAt: row.paidAt || null,
      manualReference: row.manualReference ? this.maskProviderReference(row.manualReference) : null,
      manualMethod: row.manualMethod || null,
      amountReceivedCents: row.amountReceivedCents == null ? null : Number(row.amountReceivedCents || 0),
      receivedAt: row.receivedAt || null,
      evidenceAttached: Boolean(row.evidenceArtifactId),
      internalNote: options?.includeProviderRef ? row.internalNote || null : null,
      customerReceiptNote: row.customerReceiptNote || null,
      reviewedAt: row.reviewedAt || null,
      reviewNote: options?.includeProviderRef ? row.reviewNote || null : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      separation: {
        myTitanStripe: 'not_used_for_customer_money',
        customerPayments: 'tenant_owned_provider_or_manual_collection',
      },
    };
  }

  private async createTenantNotification(input: {
    tenantId: string;
    userRoles: string[];
    type: string;
    title: string;
    body: string;
    entityId: string;
    idempotencyKey: string;
    actionUrl?: string | null;
    meta?: Record<string, unknown>;
  }) {
    const db = this.prisma as any;
    if (!isNotificationsV1Enabled()) return;
    const users = await db.user.findMany({
      where: {
        companyId: input.tenantId,
        role: { in: input.userRoles },
      },
      select: { id: true },
    });
    for (const user of users) {
      await db.notification.upsert({
        where: {
          companyId_idempotencyKey: {
            companyId: input.tenantId,
            idempotencyKey: `${input.idempotencyKey}:${user.id}`,
          },
        },
        update: {
          title: input.title,
          body: input.body,
          metaJson: {
            ...(input.meta || {}),
            actionUrl: input.actionUrl || null,
          },
        },
        create: {
          companyId: input.tenantId,
          userId: user.id,
          type: input.type,
          title: input.title,
          body: input.body,
          entityType: 'job',
          entityId: input.entityId,
          idempotencyKey: `${input.idempotencyKey}:${user.id}`,
          metaJson: {
            ...(input.meta || {}),
            actionUrl: input.actionUrl || null,
          },
        },
      });
    }
  }

  async getTenantPaymentProviderReadiness(tenantId: string) {
    const db = this.prisma as any;
    await this.refreshTenantStripeCheckoutReadiness(tenantId).catch(() => false);
    const connectRuntime = this.platformPaymentProviderConfig.getRuntimeStatus();
    const [settings, credentials, flag] = await Promise.all([
      db.tenantSetting.findUnique({ where: { tenantId } }),
      db.integrationCredential.findMany({
        where: {
          tenantId,
          scope: 'WORKSPACE',
          provider: { in: ['STRIPE_CUSTOMER_PAYMENTS', 'SUMUP', 'WORLDPAY'] },
        },
        select: {
          id: true,
          provider: true,
          status: true,
          routeId: true,
          metadataJson: true,
          lastVerifiedAt: true,
          lastWebhookReceivedAt: true,
          lastErrorCategory: true,
        },
      }),
      this.resolveTenantPaymentsFlag(tenantId),
    ]);
    const credentialByProvider = new Map<string, any>(credentials.map((row: any) => [String(row.provider), row]));
    const config = readPaymentCollectionConfig(settings);
    const preferredFromSettings = config.preferredProvider === 'STRIPE'
      ? 'stripe-connect'
      : config.preferredProvider
        ? this.normalizeTenantPaymentProvider(config.preferredProvider)
        : 'manual';

    const liveProvider = (input: {
      provider: string;
      providerKey: string;
      label: string;
      category: string;
      placeholder?: boolean;
      liveCapture?: boolean;
    }) => {
      const row = credentialByProvider.get(input.providerKey);
      const state = this.mapCredentialStatusToReadiness(row);
      const metadata = row?.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
        ? row.metadataJson
        : {};
      const stripeAccountMasked = input.providerKey === 'STRIPE_CUSTOMER_PAYMENTS'
        ? this.maskStripeAccountId(String(metadata.accountMasked || metadata.connectedAccountMasked || '').trim() || null)
        : null;
      const liveCheckoutAllowed = input.providerKey === 'STRIPE_CUSTOMER_PAYMENTS'
        ? Boolean(
            flag.enabled &&
            connectRuntime.runtimeLoaded &&
            this.tenantStripeConnectLiveEnabled() &&
            this.stripeConnect &&
            this.tenantStripeConnectWebhookSecret(),
          )
        : false;
      const diagnostic = input.providerKey === 'STRIPE_CUSTOMER_PAYMENTS'
        ? this.tenantPaymentDiagnostic(row?.lastErrorCategory)
        : row?.lastErrorCategory
          ? 'tenant_provider_not_enabled'
          : 'ready';
      const checkoutEligible = Boolean(
        input.providerKey === 'STRIPE_CUSTOMER_PAYMENTS' &&
        state === 'connected' &&
        liveCheckoutAllowed &&
        row?.routeId &&
        diagnostic === 'ready',
      );
      const accountLinked = Boolean(row && state !== 'disabled' && state !== 'setup_needed');
      const businessVerified = Boolean(metadata.detailsSubmitted);
      const customerPaymentsEnabled = Boolean(metadata.chargesEnabled);
      const payoutsEnabled = Boolean(metadata.payoutsEnabled);
      const paymentEventsVerified = Boolean(this.tenantStripeConnectWebhookSecret());
      const readinessState = this.tenantPaymentReadinessState({
        hasCredential: Boolean(row),
        enabled: Boolean(flag.enabled),
        storedState: state,
        checkoutEligible,
      });
      const onboardingAvailable = input.providerKey === 'STRIPE_CUSTOMER_PAYMENTS'
        ? Boolean(flag.enabled && connectRuntime.runtimeLoaded && connectRuntime.mode === 'live' && this.stripeConnect)
        : false;
      return {
        provider: input.provider,
        providerKey: input.providerKey,
        label: input.label,
        category: input.category,
        state,
        readinessState,
        readinessLabel:
          readinessState === 'ready'
            ? 'Ready to take customer payments'
            : readinessState === 'needs_attention'
              ? 'Needs attention'
              : readinessState === 'needs_setup'
                ? 'Needs setup'
                : 'Not connected',
        checkoutEligible,
        ready: checkoutEligible,
        liveCapture: Boolean(input.liveCapture && checkoutEligible),
        mode: input.providerKey === 'STRIPE_CUSTOMER_PAYMENTS' ? connectRuntime.mode : null,
        dryRun: input.providerKey === 'STRIPE_CUSTOMER_PAYMENTS' ? connectRuntime.mode !== 'live' : true,
        featureEnabled: input.providerKey === 'STRIPE_CUSTOMER_PAYMENTS' ? Boolean(flag.enabled) : false,
        platformConfigAvailable: input.providerKey === 'STRIPE_CUSTOMER_PAYMENTS' ? connectRuntime.runtimeLoaded : false,
        onboardingAvailable,
        accountMasked: stripeAccountMasked,
        webhookConfigured: Boolean(row?.routeId),
        webhookVerified: Boolean(row?.lastWebhookReceivedAt),
        verificationRequired: state === 'verification_required',
        checks: input.providerKey === 'STRIPE_CUSTOMER_PAYMENTS'
          ? {
              accountLinked,
              businessVerified,
              customerPaymentsEnabled,
              payoutsEnabled,
              depositCheckoutReady: checkoutEligible,
              paymentEventsVerified,
            }
          : undefined,
        lastCheckedAt: row?.lastVerifiedAt || row?.lastWebhookReceivedAt || null,
        tenantAction:
          input.providerKey === 'STRIPE_CUSTOMER_PAYMENTS' && !onboardingAvailable && !accountLinked
            ? null
            : readinessState === 'ready'
            ? 'Manage Stripe'
            : readinessState === 'not_connected'
              ? 'Connect Stripe'
              : 'Fix Stripe setup',
        placeholder: Boolean(input.placeholder),
        summary:
          input.providerKey === 'STRIPE_CUSTOMER_PAYMENTS' && !onboardingAvailable && !accountLinked
            ? 'Stripe setup is not available yet.'
            : readinessState === 'ready'
            ? 'Stripe is ready to take customer payments for this business.'
            : readinessState === 'not_connected'
              ? 'Connect Stripe before customers can pay online.'
              : diagnostic === 'platform_connect_secret_mismatch'
                ? 'Stripe is linked, but payments cannot be verified in this workspace yet. Reconnect or verify again from payment settings.'
                : 'Stripe needs to be verified before customers can pay online.',
      };
    };

    const providers = [
      {
        provider: 'manual',
        providerKey: 'MANUAL',
        label: 'Manual collection',
        category: 'manual',
        state: 'connected',
        readinessState: 'ready',
        readinessLabel: 'Ready for manual recording',
        checkoutEligible: false,
        ready: true,
        liveCapture: false,
        webhookConfigured: false,
        webhookVerified: false,
        verificationRequired: false,
        lastCheckedAt: null,
        lastErrorCategory: null,
        placeholder: false,
        summary: 'Manual collection is always available and records payment only after an authorised user confirms it.',
      },
      liveProvider({
        provider: 'stripe-connect',
        providerKey: 'STRIPE_CUSTOMER_PAYMENTS',
        label: 'Business Stripe setup',
        category: 'stripe_connect',
        liveCapture: true,
      }),
      liveProvider({
        provider: 'sumup',
        providerKey: 'SUMUP',
        label: 'SumUp',
        category: 'card_present_or_remote',
        liveCapture: true,
      }),
      liveProvider({
        provider: 'worldpay',
        providerKey: 'WORLDPAY',
        label: 'Worldpay',
        category: 'card_provider',
        liveCapture: true,
      }),
      {
        provider: 'open-banking',
        providerKey: 'OPEN_BANKING',
        label: 'Open Banking',
        category: 'bank_payment',
        state: 'setup_needed',
        ready: false,
        liveCapture: false,
        webhookConfigured: false,
        webhookVerified: false,
        verificationRequired: false,
        lastCheckedAt: null,
        lastErrorCategory: null,
        placeholder: true,
        summary: 'Open Banking is a reserved tenant-owned provider contract. It is not live in this workspace.',
      },
      {
        provider: 'paypal',
        providerKey: 'PAYPAL',
        label: 'PayPal',
        category: 'wallet_payment',
        state: 'setup_needed',
        ready: false,
        liveCapture: false,
        webhookConfigured: false,
        webhookVerified: false,
        verificationRequired: false,
        lastCheckedAt: null,
        lastErrorCategory: null,
        placeholder: true,
        summary: 'PayPal is a reserved tenant-owned provider contract. It is not live in this workspace.',
      },
      {
        provider: 'gocardless',
        providerKey: 'GOCARDLESS',
        label: 'GoCardless',
        category: 'direct_debit',
        state: 'setup_needed',
        ready: false,
        liveCapture: false,
        webhookConfigured: false,
        webhookVerified: false,
        verificationRequired: false,
        lastCheckedAt: null,
        lastErrorCategory: null,
        placeholder: true,
        summary: 'GoCardless is a reserved tenant-owned provider contract. It is not live in this workspace.',
      },
    ];
    const preferred = providers.find((provider) => provider.provider === preferredFromSettings) || providers[0];
    const selected = this.providerReadyForCustomerCheckout(preferred) || preferred.provider === 'manual'
      ? preferred
      : providers[0];

    return {
      status: selected.provider === 'manual' ? 'manual_collection' : 'provider_ready',
      preferredProvider: preferred.provider,
      selectedProvider: selected.provider,
      fallbackReason:
        selected.provider === preferred.provider
          ? null
          : `${preferred.label} is ${String(preferred.state || 'setup_needed').replace(/_/g, ' ')}, so customer payment requests stay manual.`,
      providers,
      separation: {
        customerPayments: 'tenant_owned_byog_provider_or_manual_collection',
        fallback: 'never_fallback_to_mytitan_stripe',
      },
      nextAction:
        selected.provider === 'manual'
          ? 'Connect a tenant-owned customer payment provider, or keep manual collection and record payment only when received.'
          : 'Send customer payment requests through the verified tenant-owned provider.',
    };
  }

  async verifyTenantStripeConnectReadiness(tenantId: string, userId: string) {
    const flag = await this.resolveTenantPaymentsFlag(tenantId, userId);
    const client = await this.resolveTenantStripeConnectClient(tenantId);
    if (!client.ok) {
      await this.audit.log(tenantId, 'billing.tenant_stripe_connect.verify_blocked', `Stripe Connect verification blocked: ${client.category}`, userId);
      return {
        ok: false,
        state: client.category,
        featureEnabled: Boolean(flag.enabled),
        mode: this.tenantStripeConnectMode(),
        liveMutation: false,
        summary: 'Tenant-owned Stripe is not ready. Manual collection remains available.',
      };
    }

    if (!this.stripeConnect) {
      const db = this.prisma as any;
      await db.integrationCredential.update({
        where: { id: client.credential.id },
        data: { status: 'NEEDS_REAUTH', lastErrorCategory: 'stripe_runtime_missing' },
      });
      this.tenantStripeReadinessCache.delete(tenantId);
      return {
        ok: false,
        state: 'needs_attention',
        accountMasked: client.accountMasked,
        featureEnabled: true,
        mode: 'live',
        liveMutation: false,
        summary: 'Stripe is linked, but payments cannot be verified in this workspace yet. Reconnect or verify again from payment settings.',
      };
    }

    try {
      const ready = await this.refreshTenantStripeCheckoutReadiness(tenantId, { force: true, actorUserId: userId });
      const refreshed = await (this.prisma as any).integrationCredential.findUnique({
        where: { id: client.credential.id },
        select: { lastErrorCategory: true },
      }).catch(() => null);
      const diagnostic = this.tenantPaymentDiagnostic(refreshed?.lastErrorCategory);
      return {
        ok: ready,
        state: ready ? 'ready' : 'needs_attention',
        accountMasked: client.accountMasked,
        featureEnabled: Boolean(flag.enabled),
        mode: 'live',
        liveMutation: false,
        summary: ready
          ? 'Ready to take customer payments.'
          : diagnostic === 'platform_connect_secret_mismatch'
            ? 'Stripe is linked, but payments cannot be verified in this workspace yet. Reconnect or verify again from payment settings.'
            : 'Stripe needs to be verified before customers can pay online.',
      };
    } catch {
      const db = this.prisma as any;
      await db.integrationCredential.update({
        where: { id: client.credential.id },
        data: { status: 'ERROR', lastErrorCategory: 'stripe_account_verify_failed' },
      });
      await this.audit.log(tenantId, 'billing.tenant_stripe_connect.verify_failed', 'Stripe Connect account verification failed', userId);
      return {
        ok: false,
        state: 'error',
        accountMasked: client.accountMasked,
        featureEnabled: true,
        mode: 'live',
        liveMutation: false,
        summary: 'Tenant-owned Stripe could not be verified. Manual collection remains available.',
      };
    }
  }

  async testTenantStripeConnectCheckoutReadiness(tenantId: string, userId: string) {
    const verification = await this.verifyTenantStripeConnectReadiness(tenantId, userId);
    const readiness = await this.getTenantPaymentProviderReadiness(tenantId);
    const provider = readiness.providers.find((candidate: any) => candidate.provider === 'stripe-connect');
    const ready = Boolean(
      verification.ok
      && provider?.readinessState === 'ready'
      && provider?.checkoutEligible,
    );
    await this.audit.log(
      tenantId,
      'billing.tenant_stripe_connect.test_checkout',
      ready ? 'Stripe checkout readiness dry-run passed' : 'Stripe checkout readiness dry-run needs attention',
      userId,
    );
    return {
      ok: ready,
      state: ready ? 'ready' : 'needs_attention',
      dryRun: true,
      liveMutation: false,
      checks: (provider as any)?.checks || null,
      summary: ready
        ? 'Deposit checkout is ready. No customer payment was created.'
        : 'Deposit checkout is not ready. Review the checklist before offering online deposits.',
    };
  }

  private tenantStripeConnectOnboardingUrls() {
    const refreshUrl = buildAppUrl('/dashboard/settings/payments/stripe?stripe=refresh');
    const returnUrl = buildAppUrl('/dashboard/settings/payments/stripe?stripe=return');
    const validate = (value: string) => {
      const parsed = new URL(value);
      const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
      if (!local && parsed.protocol !== 'https:') throw new Error('public_app_url_must_use_https');
      return parsed.toString();
    };
    return {
      refreshUrl: validate(refreshUrl),
      returnUrl: validate(returnUrl),
    };
  }

  private async createTenantStripeConnectedAccount(tenantId: string, userId: string) {
    const stripeConnect = this.requireStripeConnect();
    const db = this.prisma as any;
    const [company, owner] = await Promise.all([
      db.company.findUnique({
        where: { id: tenantId },
        include: { tenantSetting: true },
      }),
      db.user.findFirst({
        where: { companyId: tenantId, role: 'OWNER' },
        orderBy: { createdAt: 'asc' },
        select: { email: true },
      }),
    ]);
    const country = String(company?.tenantSetting?.tenantCountry || 'GB').trim().toUpperCase();
    const account = await stripeConnect.accounts.create({
      type: 'express',
      country: /^[A-Z]{2}$/.test(country) ? country : 'GB',
      email: String(owner?.email || '').trim() || undefined,
      business_profile: {
        name: String(company?.tenantSetting?.companyName || company?.name || '').trim() || undefined,
        product_description: 'Customer payments for services supplied by the connected business.',
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        mytitanTenantId: tenantId,
        ownership: 'tenant_owned',
      },
    });
    const routeId = crypto
      .createHash('sha256')
      .update(`STRIPE_CUSTOMER_PAYMENTS:${tenantId}:workspace`)
      .digest('hex')
      .slice(0, 24);
    await db.integrationCredential.upsert({
      where: {
        tenantId_provider_scope_scopeOwnerKey: {
          tenantId,
          provider: 'STRIPE_CUSTOMER_PAYMENTS',
          scope: 'WORKSPACE',
          scopeOwnerKey: 'workspace',
        },
      },
      create: {
        tenantId,
        provider: 'STRIPE_CUSTOMER_PAYMENTS',
        credentialType: 'MERCHANT_PAYMENT_GATEWAY_CONFIG',
        scope: 'WORKSPACE',
        scopeOwnerKey: 'workspace',
        displayName: 'Stripe customer payments',
        status: 'NEEDS_REAUTH',
        encryptedPayload: encryptText(JSON.stringify({ connectedAccountId: account.id })),
        metadataJson: {
          accountMasked: this.maskStripeAccountId(account.id),
          ownership: 'tenant_owned',
          setupSource: 'stripe_connect_onboarding',
        },
        routeId,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
      update: {
        displayName: 'Stripe customer payments',
        status: 'NEEDS_REAUTH',
        encryptedPayload: encryptText(JSON.stringify({ connectedAccountId: account.id })),
        metadataJson: {
          accountMasked: this.maskStripeAccountId(account.id),
          ownership: 'tenant_owned',
          setupSource: 'stripe_connect_onboarding',
        },
        lastErrorCategory: null,
        updatedByUserId: userId,
      },
    });
    this.tenantStripeReadinessCache.delete(tenantId);
    return account;
  }

  async createTenantStripeConnectOnboardingLink(tenantId: string, userId: string) {
    this.tenantStripeReadinessCache.delete(tenantId);
    let stripeAccountCreated = false;
    const flag = await this.resolveTenantPaymentsFlag(tenantId, userId);
    const runtime = this.platformPaymentProviderConfig.getRuntimeConfig();
    if (!flag.enabled) {
      await this.audit.log(tenantId, 'billing.tenant_stripe_connect.onboarding_guidance', 'Stripe Connect onboarding guidance shown without live account-link creation', userId);
      await this.recordStripeConnectOnboardingAttempt({
        tenantId,
        userId,
        result: 'feature_disabled',
        actionUrlReturned: false,
        stripeAccountCreated,
        accountLinkCreated: false,
        failureReason: 'feature_disabled',
      });
      return {
        ok: false,
        actionUrl: null,
        featureEnabled: false,
        mode: runtime.mode,
        accountMasked: null,
        state: 'feature_disabled',
        summary: 'Stripe setup is not available yet.',
      };
    }
    if (!runtime.platformSecret || !runtime.webhookSecret) {
      await this.audit.log(tenantId, 'billing.tenant_stripe_connect.onboarding_guidance', 'Stripe Connect onboarding blocked because platform configuration is missing', userId);
      await this.recordStripeConnectOnboardingAttempt({
        tenantId,
        userId,
        result: 'missing_config',
        actionUrlReturned: false,
        stripeAccountCreated,
        accountLinkCreated: false,
        failureReason: 'missing_config',
      });
      return {
        ok: false,
        actionUrl: null,
        featureEnabled: true,
        mode: runtime.mode,
        accountMasked: null,
        state: 'missing_config',
        summary: 'Stripe setup is not available yet.',
      };
    }
    if (runtime.mode !== 'live' || !this.stripeConnect) {
      await this.audit.log(tenantId, 'billing.tenant_stripe_connect.onboarding_guidance', 'Stripe Connect onboarding blocked because runtime is unavailable', userId);
      await this.recordStripeConnectOnboardingAttempt({
        tenantId,
        userId,
        result: 'runtime_unavailable',
        actionUrlReturned: false,
        stripeAccountCreated,
        accountLinkCreated: false,
        failureReason: 'runtime_unavailable',
      });
      return {
        ok: false,
        actionUrl: null,
        featureEnabled: true,
        mode: runtime.mode,
        accountMasked: null,
        state: 'runtime_unavailable',
        summary: 'Stripe setup is not available yet.',
      };
    }
    let client = await this.resolveTenantStripeConnectClient(tenantId, { allowDisabled: true });
    if (!client.ok && ['not_found', 'missing_credentials', 'missing_connected_account'].includes(String(client.category))) {
      try {
        await this.createTenantStripeConnectedAccount(tenantId, userId);
        stripeAccountCreated = true;
      } catch (error: any) {
        const failureReason = this.redactStripeDiagnosticMessage(error?.message);
        await this.platformPaymentProviderConfig.recordOnboardingCapability({ ok: false, failureReason });
        await this.audit.log(
          tenantId,
          'billing.tenant_stripe_connect.account_create_failed',
          'Stripe connected account creation failed',
          userId,
        );
        await this.recordStripeConnectOnboardingAttempt({
          tenantId,
          userId,
          result: 'account_creation_failed',
          actionUrlReturned: false,
          stripeAccountCreated,
          accountLinkCreated: false,
          failureReason: `account_creation: ${failureReason}`,
        });
        return {
          ok: false,
          actionUrl: null,
          featureEnabled: true,
          mode: 'live',
          accountMasked: null,
          state: 'account_creation_failed',
          summary: 'Stripe setup could not start. Retry in a moment.',
        };
      }
      client = await this.resolveTenantStripeConnectClient(tenantId, { allowDisabled: true });
    }
    if (!client.ok) {
      await this.recordStripeConnectOnboardingAttempt({
        tenantId,
        userId,
        result: String(client.category),
        actionUrlReturned: false,
        stripeAccountCreated,
        accountLinkCreated: false,
        failureReason: String(client.category),
      });
      return {
        ok: false,
        actionUrl: null,
        featureEnabled: true,
        mode: 'live',
        accountMasked: null,
        state: client.category,
        summary: 'Stripe setup could not continue. Disconnect the existing setup and try again.',
      };
    }
    let link;
    let onboardingUrls: { refreshUrl: string; returnUrl: string };
    try {
      onboardingUrls = this.tenantStripeConnectOnboardingUrls();
    } catch {
      await this.recordStripeConnectOnboardingAttempt({
        tenantId,
        userId,
        result: 'invalid_public_app_url',
        actionUrlReturned: false,
        stripeAccountCreated,
        accountLinkCreated: false,
        failureReason: 'invalid_public_app_url',
      });
      return {
        ok: false,
        actionUrl: null,
        featureEnabled: true,
        mode: 'live',
        accountMasked: client.accountMasked,
        state: 'invalid_public_app_url',
        summary: 'Stripe setup could not open because the secure return address is unavailable.',
      };
    }
    try {
      link = await this.stripeConnect.accountLinks.create({
        account: client.connectedAccountId,
        refresh_url: onboardingUrls.refreshUrl,
        return_url: onboardingUrls.returnUrl,
        type: 'account_onboarding',
      });
    } catch (error: any) {
      let finalError = error;
      let failureStage: 'account_link' | 'account_creation' = 'account_link';
      const errorCode = String(error?.code || '').toLowerCase();
      const errorType = String(error?.type || '').toLowerCase();
      const errorParam = String(error?.param || '').toLowerCase();
      const errorMessage = String(error?.message || '').toLowerCase();
      const staleAccount =
        ['resource_missing', 'account_invalid'].includes(errorCode)
        || (
          errorType === 'stripeinvalidrequesterror'
          && (
            client.status === 'DISABLED'
            ||
            errorParam === 'account'
            || errorMessage.includes('connected account')
            || errorMessage.includes('no such account')
          )
        );
      if (staleAccount) {
        try {
          await this.createTenantStripeConnectedAccount(tenantId, userId);
          stripeAccountCreated = true;
          client = await this.resolveTenantStripeConnectClient(tenantId, { allowDisabled: true });
          if (!client.ok) throw new Error(String(client.category));
          link = await this.stripeConnect.accountLinks.create({
            account: client.connectedAccountId,
            refresh_url: onboardingUrls.refreshUrl,
            return_url: onboardingUrls.returnUrl,
            type: 'account_onboarding',
          });
          await this.audit.log(
            tenantId,
            'billing.tenant_stripe_connect.stale_account_replaced',
            'Stale Stripe connected account reference was replaced before onboarding',
            userId,
          );
        } catch (retryError: any) {
          finalError = retryError;
          if (!stripeAccountCreated) failureStage = 'account_creation';
        }
      }
      if (link) finalError = null;
      if (finalError) {
        const finalCode = String(finalError?.code || '').toLowerCase();
        const finalType = String(finalError?.type || '').toLowerCase();
        const platformCredentialFailure =
          finalCode === 'platform_account_required'
          || finalCode === 'api_key_expired'
          || finalType === 'stripeauthenticationerror';
        const diagnostic = finalCode === 'platform_account_required'
          ? 'platform_account_required'
          : platformCredentialFailure
            ? 'platform_connect_secret_mismatch'
            : `${failureStage}: ${this.redactStripeDiagnosticMessage(finalError?.message)} (${finalCode || finalType || 'failed'}${finalError?.param ? `, param=${String(finalError.param).slice(0, 40)}` : ''})`;
        if (platformCredentialFailure) {
          await this.recordPlatformStripeDiagnostic({
            credentialId: client.credential.id,
            diagnostic,
          });
        }
        if (failureStage === 'account_creation') {
          await this.platformPaymentProviderConfig.recordOnboardingCapability({
            ok: false,
            failureReason: this.redactStripeDiagnosticMessage(finalError?.message),
          });
        }
        await this.audit.log(
          tenantId,
          'billing.tenant_stripe_connect.onboarding_blocked',
          'Stripe Connect onboarding link could not be created with the current platform configuration',
          userId,
        );
        await this.recordStripeConnectOnboardingAttempt({
          tenantId,
          userId,
          result: platformCredentialFailure
            ? 'platform_configuration_needed'
            : failureStage === 'account_creation'
              ? 'account_creation_failed'
              : 'account_link_failed',
          actionUrlReturned: false,
          stripeAccountCreated,
          accountLinkCreated: false,
          failureReason: diagnostic,
        });
        return {
          ok: false,
          actionUrl: null,
          featureEnabled: true,
          mode: 'live',
          accountMasked: client.accountMasked,
          state: platformCredentialFailure
            ? 'platform_configuration_needed'
            : failureStage === 'account_creation'
              ? 'account_creation_failed'
              : 'account_link_failed',
          summary: platformCredentialFailure
            ? 'Stripe is linked, but a new setup session cannot be opened yet. Verify again or disconnect and reconnect after payment configuration is updated.'
            : failureStage === 'account_creation'
              ? 'Stripe setup cannot create a connected account with the current platform configuration.'
            : 'Stripe setup could not open a new secure session. Retry from this page.',
        };
      }
    }
    const actionUrl = String(link?.url || '').trim();
    if (!actionUrl.startsWith('https://connect.stripe.com/')) {
      await this.recordStripeConnectOnboardingAttempt({
        tenantId,
        userId,
        result: 'invalid_action_url',
        actionUrlReturned: false,
        stripeAccountCreated,
        accountLinkCreated: true,
        failureReason: 'invalid_action_url',
      });
      return {
        ok: false,
        actionUrl: null,
        featureEnabled: true,
        mode: 'live',
        accountMasked: client.accountMasked,
        state: 'invalid_action_url',
        summary: 'Stripe setup could not open a secure onboarding session. Retry in a moment.',
      };
    }
    await this.audit.log(tenantId, 'billing.tenant_stripe_connect.onboarding_link', 'Stripe Connect onboarding link created for tenant-owned account', userId);
    await this.platformPaymentProviderConfig.recordOnboardingCapability({ ok: true });
    await (this.prisma as any).integrationCredential.update({
      where: { id: client.credential.id },
      data: {
        status: 'NEEDS_REAUTH',
        lastErrorCategory: null,
        updatedByUserId: userId,
      },
    });
    this.tenantStripeReadinessCache.delete(tenantId);
    await this.recordStripeConnectOnboardingAttempt({
      tenantId,
      userId,
      result: 'onboarding_link_created',
      actionUrlReturned: true,
      stripeAccountCreated,
      accountLinkCreated: true,
    });
    return {
      ok: true,
      actionUrl,
      featureEnabled: true,
      mode: 'live',
      accountMasked: client.accountMasked,
      state: 'onboarding_link_created',
      summary: 'Continue in Stripe to finish tenant-owned customer payment setup.',
    };
  }

  async disconnectTenantStripeConnect(tenantId: string, userId: string) {
    const db = this.prisma as any;
    const row = await db.integrationCredential.findUnique({
      where: {
        tenantId_provider_scope_scopeOwnerKey: {
          tenantId,
          provider: 'STRIPE_CUSTOMER_PAYMENTS',
          scope: 'WORKSPACE',
          scopeOwnerKey: 'workspace',
        },
      },
    });
    if (!row) {
      return { ok: true, state: 'setup_needed', summary: 'No tenant-owned Stripe connection was stored.' };
    }
    await db.integrationCredential.update({
      where: { id: row.id },
      data: {
        status: 'DISABLED',
        lastErrorCategory: null,
        updatedByUserId: userId,
      },
    });
    this.tenantStripeReadinessCache.delete(tenantId);
    await this.audit.log(tenantId, 'billing.tenant_stripe_connect.disconnect', 'Tenant-owned Stripe customer payment connection disabled', userId);
    return {
      ok: true,
      state: 'disabled',
      summary: 'Tenant-owned Stripe customer payments are disabled. Manual collection remains available.',
    };
  }

  private async resolveStripeConnectCredential(accountId: string) {
    const rows = await (this.prisma as any).integrationCredential.findMany({
      where: {
        provider: 'STRIPE_CUSTOMER_PAYMENTS',
        scope: 'WORKSPACE',
        status: { not: 'DISABLED' },
      },
    });
    for (const row of rows) {
      try {
        const payload = row.encryptedPayload
          ? JSON.parse(this.integrationClientFactory.decryptSecretMaterial(row.encryptedPayload) || '{}')
          : {};
        if (this.extractTenantStripeAccountId(payload) === accountId) return row;
      } catch {
        continue;
      }
    }
    return null;
  }

  async handleStripeConnectWebhook(payload: Buffer, headers: Record<string, any>) {
    if (!this.stripeConnect) throw new ServiceUnavailableException('Payment event verification is unavailable.');
    const secret = this.tenantStripeConnectWebhookSecret();
    if (!secret) throw new ServiceUnavailableException('Payment event verification is unavailable.');
    const signature = String(headers['stripe-signature'] || '').trim();
    let event: Stripe.Event;
    try {
      event = this.stripeConnect.webhooks.constructEvent(payload, signature, secret);
    } catch {
      throw new ForbiddenException('Webhook signature was not accepted.');
    }
    const accountId = String((event as any).account || '').trim();
    if (!accountId) return { received: true, ignored: true };
    const credential = await this.resolveStripeConnectCredential(accountId);
    if (!credential) return { received: true, ignored: true };

    const db = this.prisma as any;
    let receipt;
    try {
      receipt = await db.integrationWebhookReceipt.create({
        data: {
          tenantId: credential.tenantId,
          integrationCredentialId: credential.id,
          provider: credential.provider,
          routeId: credential.routeId,
          eventId: event.id,
          eventType: event.type,
          status: 'received',
          lastAttemptAt: new Date(),
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        receipt = await db.integrationWebhookReceipt.findFirst({
          where: {
            provider: credential.provider,
            integrationCredentialId: credential.id,
            eventId: event.id,
          },
        });
        if (receipt?.status === 'processed') return { received: true, duplicate: true };
        if (!receipt) throw error;
      } else {
        throw error;
      }
    }

    try {
      if (event.type === 'account.updated') {
        const account = event.data.object as Stripe.Account;
        const chargesEnabled = Boolean(account.charges_enabled);
        const payoutsEnabled = Boolean(account.payouts_enabled);
        const detailsSubmitted = Boolean(account.details_submitted);
        const ready = chargesEnabled && payoutsEnabled && detailsSubmitted && !account.requirements?.disabled_reason;
        await db.integrationCredential.update({
          where: { id: credential.id },
          data: {
            status: ready ? 'CONNECTED' : 'NEEDS_REAUTH',
            lastVerifiedAt: new Date(),
            lastWebhookReceivedAt: new Date(),
            lastErrorCategory: ready ? null : 'tenant_stripe_onboarding_incomplete',
            metadataJson: {
              ...(credential.metadataJson || {}),
              accountMasked: this.maskStripeAccountId(accountId),
              chargesEnabled,
              payoutsEnabled,
              detailsSubmitted,
              verificationMode: 'live',
              ownership: 'tenant_owned',
            },
          },
        });
      } else {
        const object: any = event.data.object || {};
        const metadata = object.metadata || {};
        const paymentRequestId = String(metadata.paymentRequestId || '').trim();
        const checkoutSessionId = event.type.startsWith('checkout.session.')
          ? String(object.id || '').trim()
          : String(metadata.stripeCheckoutSessionId || '').trim();
        const paymentIntentId = event.type.startsWith('payment_intent.')
          ? String(object.id || '').trim()
          : String(object.payment_intent || '').trim();
        const providerRequestRef = String(metadata.paymentRequestRef || checkoutSessionId || '').trim();
        const jobId = String(metadata.jobId || '').trim();
        const request = paymentRequestId || providerRequestRef || paymentIntentId || jobId
          ? await db.customerPaymentRequest.findFirst({
              where: {
                tenantId: credential.tenantId,
                OR: [
                  paymentRequestId ? { id: paymentRequestId } : undefined,
                  providerRequestRef ? { providerRequestRef } : undefined,
                  paymentIntentId
                    ? { metadataJson: { path: ['stripePaymentIntentId'], equals: paymentIntentId } }
                    : undefined,
                  jobId ? { jobId } : undefined,
                ].filter(Boolean),
              },
              orderBy: { createdAt: 'desc' },
            })
          : null;

        const bookingTarget = await this.resolveBookingDepositCheckoutTarget({
          companyId: credential.tenantId,
          bookingId: metadata.bookingId,
          publicStatusToken: metadata.publicStatusToken,
          checkoutSessionId,
          paymentIntentId,
        });
        const successfulCheckout =
          event.type === 'checkout.session.completed' &&
          String(object.payment_status || '').toLowerCase() === 'paid';
        const successfulPayment =
          event.type === 'payment_intent.succeeded' ||
          event.type === 'checkout.session.async_payment_succeeded' ||
          successfulCheckout;
        const failedPayment =
          event.type === 'payment_intent.payment_failed' ||
          event.type === 'payment_intent.canceled' ||
          event.type === 'checkout.session.async_payment_failed' ||
          event.type === 'checkout.session.expired';

        if (bookingTarget && successfulPayment) {
          const paymentState = this.normalizeBookingPaymentState(bookingTarget.paymentStateJson);
          await this.markBookingDepositPaid({
            companyId: bookingTarget.companyId,
            bookingId: bookingTarget.id,
            sessionId: checkoutSessionId || String(paymentState.stripeCheckoutSessionId || '').trim(),
            paymentIntentId: paymentIntentId || String(paymentState.stripePaymentIntentId || '').trim() || null,
            chargeId: String(object.latest_charge || object.charge || '').trim() || null,
            amountPaidCents: Math.max(
              0,
              Number(object.amount_total || object.amount_received || object.amount || paymentState.depositDueCents || 0),
            ),
            eventId: event.id,
          });
        } else if (bookingTarget && failedPayment) {
          await this.markBookingDepositNeedsAttention({
            companyId: bookingTarget.companyId,
            bookingId: bookingTarget.id,
            eventId: event.id,
            sessionId: checkoutSessionId || String(this.normalizeBookingPaymentState(bookingTarget.paymentStateJson).stripeCheckoutSessionId || '').trim() || null,
            status: event.type === 'checkout.session.expired' ? 'expired' : 'failed',
            label: event.type === 'checkout.session.expired' ? 'Deposit checkout expired' : 'Deposit payment failed',
            note: event.type === 'checkout.session.expired'
              ? 'The previous payment link expired before payment. Start a new secure payment to continue.'
              : 'The deposit payment failed. Start a new secure payment to try again.',
          });
        } else if (request && successfulPayment && !request.paidAt) {
          const paidAmount = Math.max(0, Number(object.amount_total || object.amount_received || object.amount || 0));
          const paidCurrency = String(object.currency || request.currency || '').trim().toUpperCase();
          if (paidAmount !== Number(request.amountCents || 0) || paidCurrency !== String(request.currency || '').toUpperCase()) {
            throw new BadRequestException('Stripe customer payment amount or currency does not match the request.');
          }
          const paidAt = new Date();
          const job = await db.job.findFirst({
            where: { id: request.jobId, companyId: credential.tenantId },
          });
          if (job) {
            let receiptUrl: string | null = null;
            let chargeId = String(object.latest_charge || object.charge || '').trim() || null;
            if (paymentIntentId) {
              const paymentIntent = await this.stripeConnect.paymentIntents.retrieve(
                paymentIntentId,
                { expand: ['latest_charge'] },
                { stripeAccount: accountId },
              ).catch(() => null);
              const latestCharge = paymentIntent?.latest_charge as Stripe.Charge | string | null;
              if (latestCharge && typeof latestCharge !== 'string') {
                chargeId = latestCharge.id;
                receiptUrl = latestCharge.receipt_url || null;
              }
            }
            await db.job.update({
              where: { id: job.id },
              data: {
                status: 'INVOICED',
                invoicePaidAt: job.invoicePaidAt || paidAt,
                invoiceIssuedAt: job.invoiceIssuedAt || paidAt,
                completedAt: job.completedAt || paidAt,
                paymentCheckoutSessionId: checkoutSessionId || job.paymentCheckoutSessionId || null,
                paymentReceiptUrl: receiptUrl || job.paymentReceiptUrl || null,
              },
            });
            await db.customerPaymentRequest.update({
              where: { id: request.id },
              data: {
                status: 'paid',
                paidAt,
                providerEventId: event.id,
                providerRequestRef: checkoutSessionId || request.providerRequestRef,
                metadataJson: {
                  ...((request.metadataJson && typeof request.metadataJson === 'object' && !Array.isArray(request.metadataJson)) ? request.metadataJson : {}),
                  stripeCheckoutSessionId: checkoutSessionId || request.providerRequestRef || null,
                  stripePaymentIntentId: paymentIntentId || null,
                  stripeChargeId: chargeId,
                  stripeReceiptUrlRecorded: Boolean(receiptUrl),
                  stripeConnectedAccountIdMasked: this.maskStripeAccountId(accountId),
                },
              },
            });
            await this.audit.log(
              credential.tenantId,
              'billing.customer_payment_request.webhook_paid',
              `Verified Stripe customer payment received for ${job.jobRef || job.id}`,
              null,
            );
            await this.resolveBillingFollowUp(credential.tenantId, null, job.id, 'payment_received');
            if (isNotificationsV1Enabled()) await this.notifications.notifyPaymentReceived(credential.tenantId, job.id);
            await this.maybeQueueReviewRequest(credential.tenantId, job.id);
          }
        } else if (request && failedPayment) {
          await db.customerPaymentRequest.update({
            where: { id: request.id },
            data: {
              status: 'provider_attention',
              providerEventId: event.id,
              metadataJson: {
                ...((request.metadataJson && typeof request.metadataJson === 'object' && !Array.isArray(request.metadataJson)) ? request.metadataJson : {}),
                stripeFailureEventType: event.type,
                stripePaymentIntentId: paymentIntentId || null,
              },
            },
          });
          await this.audit.log(
            credential.tenantId,
            'billing.customer_payment_request.provider_attention',
            `Stripe customer payment needs attention for ${request.jobId}`,
            null,
          );
        } else if (event.type === 'refund.created' || event.type === 'refund.updated') {
          const refund = object as Stripe.Refund;
          const refundId = String(refund.id || '').trim();
          const refundPaymentIntentId = String((refund as any).payment_intent || '').trim();
          const refundMetadata = refund.metadata || {};
          const bookingRefundTarget = await this.resolveBookingDepositRefundTarget({
            companyId: credential.tenantId,
            bookingId: refundMetadata.bookingId,
            publicStatusToken: refundMetadata.publicStatusToken,
            paymentIntentId: refundPaymentIntentId,
            refundId,
          });
          const refundStatus = String(refund.status || '').trim().toLowerCase();
          if (bookingRefundTarget) {
            if (refundStatus === 'succeeded') {
              await this.markBookingDepositRefundCompleted({
                companyId: bookingRefundTarget.companyId,
                bookingId: bookingRefundTarget.id,
                refundId,
                amountCents: Math.max(0, Number(refund.amount || 0)),
                paymentIntentId: refundPaymentIntentId || null,
                eventId: event.id,
              });
            } else if (refundStatus === 'failed' || refundStatus === 'canceled') {
              await this.markBookingDepositRefundFailed({
                companyId: bookingRefundTarget.companyId,
                bookingId: bookingRefundTarget.id,
                refundId,
                eventId: event.id,
                reason: String((refund as any).failure_reason || refundStatus),
              });
            } else {
              await this.markBookingDepositRefundPending({
                companyId: bookingRefundTarget.companyId,
                bookingId: bookingRefundTarget.id,
                refundId,
                amountCents: Math.max(0, Number(refund.amount || 0)),
                paymentIntentId: refundPaymentIntentId || null,
                eventId: event.id,
              });
            }
          } else {
            const refundRequest = await db.customerPaymentRequest.findFirst({
              where: {
                tenantId: credential.tenantId,
                OR: [
                  refundMetadata.paymentRequestId ? { id: String(refundMetadata.paymentRequestId) } : undefined,
                  refundPaymentIntentId
                    ? { metadataJson: { path: ['stripePaymentIntentId'], equals: refundPaymentIntentId } }
                    : undefined,
                  refundMetadata.jobId ? { jobId: String(refundMetadata.jobId) } : undefined,
                ].filter(Boolean),
              },
              orderBy: { createdAt: 'desc' },
            });
            if (refundRequest) {
              const previousMetadata =
                refundRequest.metadataJson && typeof refundRequest.metadataJson === 'object' && !Array.isArray(refundRequest.metadataJson)
                  ? refundRequest.metadataJson
                  : {};
              const processedRefundIds = Array.isArray(previousMetadata.stripeProcessedRefundIds)
                ? previousMetadata.stripeProcessedRefundIds.map((value: unknown) => String(value || '').trim()).filter(Boolean)
                : [];
              const previousRefunded = Math.max(0, Number(previousMetadata.refundedAmountCents || 0));
              const nextRefunded =
                refundStatus === 'succeeded' && !processedRefundIds.includes(refundId)
                  ? Math.min(Number(refundRequest.amountCents || 0), previousRefunded + Math.max(0, Number(refund.amount || 0)))
                  : previousRefunded;
              await db.customerPaymentRequest.update({
                where: { id: refundRequest.id },
                data: {
                  status:
                    refundStatus === 'failed' || refundStatus === 'canceled'
                      ? 'refund_failed'
                      : refundStatus === 'succeeded'
                        ? nextRefunded >= Number(refundRequest.amountCents || 0) ? 'refunded' : 'partially_refunded'
                        : 'refund_pending',
                  providerEventId: event.id,
                  metadataJson: {
                    ...previousMetadata,
                    stripePaymentIntentId: refundPaymentIntentId || previousMetadata.stripePaymentIntentId || null,
                    stripeRefundId: refundId,
                    stripeRefundIds: this.appendUniqueStateList(previousMetadata.stripeRefundIds, refundId),
                    stripeProcessedRefundIds:
                      refundStatus === 'succeeded'
                        ? this.appendUniqueStateList(previousMetadata.stripeProcessedRefundIds, refundId)
                        : previousMetadata.stripeProcessedRefundIds || [],
                    refundedAmountCents: nextRefunded,
                    stripeRefundStatus: refundStatus || 'pending',
                    stripeRefundFailureReason: String((refund as any).failure_reason || '').trim() || null,
                  },
                },
              });
            }
          }
        } else if (event.type === 'charge.refunded') {
          const charge = object as Stripe.Charge;
          const chargePaymentIntentId = String((charge as any).payment_intent || '').trim();
          const bookingRefundTarget = await this.resolveBookingDepositRefundTarget({
            companyId: credential.tenantId,
            bookingId: charge.metadata?.bookingId,
            publicStatusToken: charge.metadata?.publicStatusToken,
            paymentIntentId: chargePaymentIntentId,
          });
          if (bookingRefundTarget && Number(charge.amount_refunded || 0) > 0) {
            const paymentState = this.normalizeBookingPaymentState(bookingRefundTarget.paymentStateJson);
            const delta = Math.max(0, Number(charge.amount_refunded || 0) - Number(paymentState.refundedAmountCents || 0));
            if (delta > 0) {
              await this.markBookingDepositRefundCompleted({
                companyId: bookingRefundTarget.companyId,
                bookingId: bookingRefundTarget.id,
                refundId: String(paymentState.stripeRefundId || charge.id || '').trim(),
                amountCents: delta,
                paymentIntentId: chargePaymentIntentId || null,
                eventId: event.id,
                reason: 'charge.refunded',
              });
            }
          } else if (request && Number(charge.amount_refunded || 0) > 0) {
            const previousMetadata =
              request.metadataJson && typeof request.metadataJson === 'object' && !Array.isArray(request.metadataJson)
                ? request.metadataJson
                : {};
            const refundedAmountCents = Math.min(
              Number(request.amountCents || 0),
              Math.max(0, Number(charge.amount_refunded || 0)),
            );
            await db.customerPaymentRequest.update({
              where: { id: request.id },
              data: {
                status: refundedAmountCents >= Number(request.amountCents || 0) ? 'refunded' : 'partially_refunded',
                providerEventId: event.id,
                metadataJson: {
                  ...previousMetadata,
                  stripePaymentIntentId: chargePaymentIntentId || previousMetadata.stripePaymentIntentId || null,
                  stripeChargeId: String(charge.id || '').trim() || previousMetadata.stripeChargeId || null,
                  refundedAmountCents,
                  stripeRefundStatus: 'succeeded',
                  stripeLastRefundEventType: event.type,
                },
              },
            });
          }
        }
        await db.integrationCredential.update({
          where: { id: credential.id },
          data: { lastWebhookReceivedAt: new Date(), lastErrorCategory: null },
        });
      }
      await db.integrationWebhookReceipt.update({
        where: { id: receipt.id },
        data: { status: 'processed', processedAt: new Date(), lastAttemptAt: new Date(), errorCategory: null },
      });
      this.tenantStripeReadinessCache.delete(credential.tenantId);
      return { received: true };
    } catch (error) {
      await db.integrationWebhookReceipt.update({
        where: { id: receipt.id },
        data: { status: 'failed', errorCategory: 'processing_failed', lastAttemptAt: new Date() },
      });
      throw error;
    }
  }

  private readJobCompletionPackEnvFallback(definition: (typeof JOB_COMPLETION_PACK_DEFINITIONS)[number]) {
    return {
      priceId: String(process.env[definition.envPriceId] || '').trim() || null,
      productId: String(process.env[definition.envProductId] || '').trim() || null,
    };
  }

  private buildJobCompletionPackMetadataCodes(...sources: Array<Record<string, unknown> | null | undefined>) {
    return sources
      .map((source) => extractJobCompletionPackCodeFromMetadata(source))
      .filter(Boolean);
  }

  private extractJobCompletionPackJobCount(...sources: Array<Record<string, unknown> | null | undefined>) {
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      const candidates = [
        source.job_count,
        source.jobCount,
        source.completed_jobs,
        source.completedJobs,
        source.extra_job_completions,
      ];
      for (const candidate of candidates) {
        const value = Number(candidate);
        if (Number.isFinite(value) && value > 0) return Math.round(value);
      }
    }
    return null;
  }

  private extractJobCompletionPackAmountCents(price?: any) {
    const value = Number(price?.unit_amount);
    return Number.isFinite(value) ? value : null;
  }

  private buildJobCompletionPackCreatePlan(definition: (typeof JOB_COMPLETION_PACK_DEFINITIONS)[number]) {
    return {
      lookupKey: definition.code,
      productName: definition.label,
      amountCents: definition.amountCents,
      currency: this.getExpectedJobCompletionPackCurrency(),
      metadata: {
        mytitan_kind: 'job_completion_pack',
        job_completion_count: String(definition.jobCount),
        job_completion_pack_code: definition.code,
        lookup_key: definition.code,
      },
    };
  }

  private async ensureJobCompletionPackProduct(definition: (typeof JOB_COMPLETION_PACK_DEFINITIONS)[number], product: any | null) {
    if (product) return product;
    return this.requireStripe().products.create({
      name: definition.label,
      metadata: {
        mytitan_kind: 'job_completion_pack',
        job_completion_count: String(definition.jobCount),
        job_completion_pack_code: definition.code,
        lookup_key: definition.code,
      },
    });
  }

  private async ensureJobCompletionPackPrice(definition: (typeof JOB_COMPLETION_PACK_DEFINITIONS)[number], productId: string, prices: any[]) {
    const matchingExisting = prices.find((price: any) => {
      const product = price?.product && typeof price.product === 'object' ? price.product : null;
      const productRef = String(product?.id || price?.product || '').trim();
      return (
        productRef === productId &&
        String(price?.currency || '').trim().toUpperCase() === this.getExpectedJobCompletionPackCurrency() &&
        Number(price?.unit_amount || 0) === definition.amountCents &&
        normalizeJobCompletionPackCode(price?.lookup_key) === definition.code
      );
    });
    if (matchingExisting) return matchingExisting;
    return this.requireStripe().prices.create({
      currency: this.getExpectedJobCompletionPackCurrency().toLowerCase(),
      unit_amount: definition.amountCents,
      lookup_key: definition.code,
      product: productId,
      metadata: {
        mytitan_kind: 'job_completion_pack',
        job_completion_count: String(definition.jobCount),
        job_completion_pack_code: definition.code,
        lookup_key: definition.code,
      },
    });
  }

  private buildJobCompletionPackRow(input: {
    definition: (typeof JOB_COMPLETION_PACK_DEFINITIONS)[number];
    price?: any;
    product?: any;
    status: JobCompletionPackSyncStatus;
    source: JobCompletionPackLookupSource;
    expectedCurrency: string;
  }): JobCompletionPackSnapshotRow {
    const price = input.price || null;
    const product = input.product || null;
    const rawProduct = price?.product && typeof price.product === 'object' ? price.product : product;
    const active = Boolean(price?.active && rawProduct?.active !== false);
    const currency = String(price?.currency || '').trim().toUpperCase() || null;
    const displayPrice = formatJobCompletionPackPrice(price?.unit_amount ?? null, currency);
    const productName = String(rawProduct?.name || product?.name || '').trim() || null;
    const jobCount = input.definition.jobCount;
    const observedAmountCents = this.extractJobCompletionPackAmountCents(price);
    const amountMatches = observedAmountCents === input.definition.amountCents;

    let message = 'Stripe product mapping has not been found yet.';
    if (input.status === 'found') {
      message = 'Stripe product metadata was found, but no usable price is ready yet.';
    } else if (input.status === 'inactive') {
      message = 'Stripe product mapping exists, but the product or price is inactive.';
    } else if (input.status === 'currency_mismatch') {
      message = `Stripe product mapping exists, but the price currency does not match ${input.expectedCurrency}.`;
    } else if (input.status === 'job_count_mismatch') {
      message = `Stripe product mapping exists, but the configured job-count metadata does not match the expected ${jobCount} jobs.`;
    } else if (input.status === 'price_mismatch') {
      message = `Stripe product mapping exists, but the configured price does not match ${formatJobCompletionPackPrice(input.definition.amountCents, input.expectedCurrency)}.`;
    } else if (input.status === 'ready') {
      message = 'Stripe product mapping is ready. Add-on checkout stays blocked until checkout wiring and webhook-backed granting are both enabled.';
    }

    return {
      code: input.definition.code,
      label: input.definition.label,
      jobCount,
      status: input.status,
      source: input.source,
      active,
      currency,
      displayPrice,
      productName,
      productId: String(rawProduct?.id || product?.id || '').trim() || null,
      priceId: String(price?.id || '').trim() || null,
      message: input.status === 'ready' && amountMatches ? message : message,
    };
  }

  private buildJobCompletionPackSnapshot(rows: JobCompletionPackSnapshotRow[]) {
    const status = summarizeJobCompletionPackSnapshot(rows);
    const grantingReadiness = this.auditJobCompletionPackGrantingReadiness();
    const catalogReady = rows.length > 0 && rows.every((row) => row.status === 'ready' && row.active && Boolean(row.priceId));
    const checkoutConfirmed = process.env.MYTITAN_CONFIRM_JOB_PACK_CHECKOUT === '1';
    const checkoutEnabled =
      catalogReady &&
      grantingReadiness.status === 'ready' &&
      checkoutConfirmed;
    const lastCanaryResult = String(process.env.MYTITAN_LAST_STRIPE_CANARY_STATUS || '').trim() || null;
    const canaryStatus =
      checkoutEnabled && lastCanaryResult?.includes('success')
        ? ('last_run_ok' as const)
        : checkoutEnabled && lastCanaryResult
          ? ('last_run_attention' as const)
          : checkoutEnabled
            ? ('ready_for_monitored_canary' as const)
            : checkoutConfirmed
              ? ('not_run' as const)
              : ('blocked' as const);
    const enablementSteps = [
      'Verify all six Stripe job-pack products are active, correctly priced, and currency-aligned.',
      'Keep webhook-backed granting, duplicate protection, refund reversal, and allowance-ledger checks green.',
      checkoutConfirmed
        ? 'Checkout confirmation is present for this runtime. Run a monitored canary only when the release window and key mode are appropriate.'
        : 'Set MYTITAN_CONFIRM_JOB_PACK_CHECKOUT=1 only after an operator approves live checkout for this runtime.',
    ];
    return {
      key: JOB_COMPLETION_PACK_CATALOG_KEY,
      status,
      checkoutEnabled,
      checkoutStatus: checkoutEnabled ? ('enabled' as const) : checkoutConfirmed ? ('not_enabled' as const) : ('setup_required' as const),
      grantingReadiness,
      enablementSteps,
      canary: {
        status: canaryStatus,
        lastResult: lastCanaryResult,
        message:
          canaryStatus === 'last_run_ok'
            ? 'The latest recorded Stripe canary succeeded. Keep monitored purchase/refund verification in the release runbook.'
            : canaryStatus === 'last_run_attention'
              ? `The latest recorded Stripe canary needs review: ${lastCanaryResult?.replace(/_/g, ' ')}.`
              : canaryStatus === 'ready_for_monitored_canary'
                ? 'Checkout is enabled. Run a monitored Stripe purchase/refund canary only when the release window and key mode are appropriate.'
                : canaryStatus === 'not_run'
                  ? 'Checkout confirmation is present, but no Stripe canary result is recorded yet for this runtime.'
                  : 'Checkout remains blocked until the catalog is ready and an operator explicitly confirms job-pack checkout.',
      },
      summary:
        status === 'ready' && grantingReadiness.status === 'ready' && checkoutEnabled
          ? 'Stripe add-on products are synced, checkout is enabled, and allowance only increases after verified Stripe webhooks.'
          : status === 'ready' && grantingReadiness.status === 'ready'
            ? 'Stripe add-on products are synced and webhook-backed granting is ready, but checkout remains blocked until explicit job-pack checkout confirmation is enabled.'
          : status === 'ready'
            ? 'Stripe add-on products are synced, but checkout remains blocked until webhook-backed granting and refund reversal are verified ready.'
          : status === 'partial'
            ? 'Some Stripe add-on products are mapped, but setup is still incomplete before extra completions can be enabled.'
            : 'Extra job completion packs remain setup-required until Stripe product mappings and webhook-backed granting are ready.',
      lastCheckedAt: new Date().toISOString(),
      expectedCurrency: this.getExpectedJobCompletionPackCurrency(),
      packs: rows,
    };
  }

  private getCurrentBillingPeriodStart(now = new Date()) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  private getCurrentBillingPeriodEnd(periodStart: Date) {
    return new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1));
  }

  private resolveJobCompletionPackDefinition(code: string) {
    return JOB_COMPLETION_PACK_DEFINITIONS.find((definition) => definition.code === normalizeJobCompletionPackCode(code)) || null;
  }

  private normalizeJobCompletionPackPurchaseState(metadataJson: any) {
    return metadataJson && typeof metadataJson === 'object' ? { ...metadataJson } : {};
  }

  private normalizeStateNumber(value: unknown) {
    return Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
  }

  private normalizeStateObject(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
  }

  private computeJobCompletionPackRefundedJobs(input: {
    amountCents: number;
    purchaseAmountCents: number;
    purchasedJobCompletionCount: number;
  }) {
    const purchaseAmountCents = Math.max(0, Number(input.purchaseAmountCents || 0));
    const purchasedJobCompletionCount = Math.max(0, Number(input.purchasedJobCompletionCount || 0));
    const amountCents = Math.min(purchaseAmountCents, Math.max(0, Number(input.amountCents || 0)));
    if (!purchaseAmountCents || !purchasedJobCompletionCount) {
      return {
        refundedJobCompletionCount: 0,
        remainderAmountCents: amountCents,
      };
    }
    const rawRefundedJobs = Math.floor((amountCents * purchasedJobCompletionCount) / purchaseAmountCents);
    const refundedJobCompletionCount = Math.min(purchasedJobCompletionCount, Math.max(0, rawRefundedJobs));
    const appliedAmountCents = Math.floor((refundedJobCompletionCount * purchaseAmountCents) / purchasedJobCompletionCount);
    return {
      refundedJobCompletionCount,
      remainderAmountCents: Math.max(0, amountCents - appliedAmountCents),
    };
  }

  private buildJobCompletionPackPendingRefundMap(metadataJson: any) {
    const state = this.normalizeJobCompletionPackPurchaseState(metadataJson);
    const source = this.normalizeStateObject(state.pendingRefundsById);
    const pendingRefundsById: Record<string, number> = {};
    for (const [refundId, rawAmount] of Object.entries(source)) {
      const normalizedId = String(refundId || '').trim();
      const normalizedAmount = this.normalizeStateNumber(rawAmount);
      if (normalizedId && normalizedAmount > 0) {
        pendingRefundsById[normalizedId] = normalizedAmount;
      }
    }
    return pendingRefundsById;
  }

  private summarizePendingJobCompletionPackRefunds(metadataJson: any, purchase: any) {
    const pendingRefundsById = this.buildJobCompletionPackPendingRefundMap(metadataJson);
    const pendingRefundAmountCents = Object.values(pendingRefundsById).reduce(
      (sum, amount) => sum + this.normalizeStateNumber(amount),
      0,
    );
    const pendingRefundJobs = this.computeJobCompletionPackRefundedJobs({
      amountCents: pendingRefundAmountCents,
      purchaseAmountCents: this.normalizeStateNumber(purchase?.amountCents),
      purchasedJobCompletionCount: this.normalizeStateNumber(purchase?.jobCompletionCount),
    });

    return {
      pendingRefundsById,
      pendingRefundAmountCents,
      pendingRefundJobCompletionCount: pendingRefundJobs.refundedJobCompletionCount,
      pendingRefundRemainderAmountCents: pendingRefundJobs.remainderAmountCents,
    };
  }

  private summarizeJobCompletionPackPurchaseRefundState(purchase: any) {
    const state = this.normalizeJobCompletionPackPurchaseState(purchase?.metadataJson);
    const refundedAmountCents = Math.min(
      this.normalizeStateNumber(purchase?.amountCents),
      this.normalizeStateNumber(state.refundedAmountCents),
    );
    const refundedJobs = this.computeJobCompletionPackRefundedJobs({
      amountCents: refundedAmountCents,
      purchaseAmountCents: this.normalizeStateNumber(purchase?.amountCents),
      purchasedJobCompletionCount: this.normalizeStateNumber(purchase?.jobCompletionCount),
    });
    const pendingRefundSummary = this.summarizePendingJobCompletionPackRefunds(state, purchase);

    return {
      refundedAmountCents,
      refundedJobCompletionCount: refundedJobs.refundedJobCompletionCount,
      refundedRemainderAmountCents: refundedJobs.remainderAmountCents,
      pendingRefundAmountCents: pendingRefundSummary.pendingRefundAmountCents,
      pendingRefundJobCompletionCount: pendingRefundSummary.pendingRefundJobCompletionCount,
      pendingRefundRemainderAmountCents: pendingRefundSummary.pendingRefundRemainderAmountCents,
      pendingRefundsById: pendingRefundSummary.pendingRefundsById,
      stripeRefundIds: this.appendUniqueStateList(state.stripeRefundIds),
      stripeProcessedRefundIds: this.appendUniqueStateList(state.stripeProcessedRefundIds),
    };
  }

  private deriveJobCompletionPackPurchaseStatus(input: {
    purchase: any;
    refundedAmountCents: number;
  }) {
    const purchaseAmountCents = this.normalizeStateNumber(input.purchase?.amountCents);
    if (input.refundedAmountCents >= purchaseAmountCents && purchaseAmountCents > 0) {
      return 'refunded';
    }
    if (input.refundedAmountCents > 0) {
      return 'partially_refunded';
    }
    return 'paid';
  }

  private auditJobCompletionPackGrantingReadiness() {
    const purchaseVerification = this.isStripeConfigured() && Boolean(this.resolveStripeWebhookSecret());
    const duplicateProtection = true;
    const refundReversal = true;
    const allowanceLedger = true;
    const webhookIdempotency = Boolean(this.resolveStripeWebhookSecret());
    const status =
      purchaseVerification && duplicateProtection && refundReversal && allowanceLedger && webhookIdempotency
        ? ('ready' as const)
        : ('setup_required' as const);

    return {
      status,
      purchaseVerification,
      duplicateProtection,
      refundReversal,
      allowanceLedger,
      webhookIdempotency,
      message:
        status === 'ready'
          ? 'Verified Stripe purchase events, duplicate protection, refund reversal, allowance ledger, and webhook idempotency are all ready.'
          : 'Checkout must remain blocked until job-pack refund reversal is wired into the allowance ledger and webhook-backed granting is fully audit-ready.',
    };
  }

  private isJobCompletionPackCheckoutReady(snapshot: JobCompletionPackSnapshot | null | undefined) {
    return Boolean(
      snapshot &&
      snapshot.checkoutEnabled &&
      snapshot.status === 'ready' &&
      snapshot.grantingReadiness?.status === 'ready' &&
      snapshot.packs.every((pack) => pack.status === 'ready' && pack.active && Boolean(pack.priceId)),
    );
  }

  private formatJobCompletionUsageMonthKey(dateLike: Date | string) {
    const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private async resolveMonthlyIncludedJobCompletionAllowance(tenantId: string, dbOverride?: any) {
    const db = dbOverride || (this.prisma as any);
    const settings = await db.tenantSetting.findUnique({
      where: { tenantId },
      select: { planId: true },
    });
    const subscription = await db.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    let plan = subscription?.plan || null;
    if (!plan && settings?.planId) {
      plan = await db.plan.findUnique({ where: { id: settings.planId } });
    }
    if (!plan) {
      plan = await db.plan.findUnique({ where: { code: DEFAULT_PLAN_CODE } });
    }
    const planCode = String(plan?.code || DEFAULT_PLAN_CODE).trim() || DEFAULT_PLAN_CODE;
    return (
      Number(plan?.featuresJson?.completed_jobs_monthly_limit || 0) ||
      Number(PLAN_DEFINITIONS[planCode as keyof typeof PLAN_DEFINITIONS]?.features.completed_jobs_monthly_limit || 0) ||
      0
    );
  }

  private normalizeAllowanceReason(reason: unknown) {
    const text = String(reason || '').trim().replace(/\s+/g, ' ');
    if (text.length < 6) {
      throw new BadRequestException('A clear change reason is required.');
    }
    return text.slice(0, 500);
  }

  private async resolveJobAllowanceControlState(db: any, tenantId: string, now = new Date()) {
    const [override, credits] = await Promise.all([
      db.tenantJobAllowanceOverride?.findUnique?.({ where: { tenantId } }),
      db.tenantJobAllowanceCredit?.findMany?.({
        where: {
          tenantId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);
    const activeCredits = Array.isArray(credits) ? credits : [];
    const manualCreditsTotal = activeCredits.reduce((sum: number, row: any) => sum + Number(row.creditCount || 0), 0);
    const temporaryCreditsTotal = activeCredits
      .filter((row: any) => row.creditType === 'temporary_bonus')
      .reduce((sum: number, row: any) => sum + Math.max(0, Number(row.creditCount || 0)), 0);
    return {
      override: override || null,
      activeCredits,
      manualCreditsTotal,
      temporaryCreditsTotal,
      unlimitedJobs: Boolean(override?.unlimitedJobs),
      monthlyJobAllowance:
        override && override.monthlyJobAllowance !== null && override.monthlyJobAllowance !== undefined
          ? Math.max(0, Number(override.monthlyJobAllowance || 0))
          : null,
      recurringExtraAllowance: Math.max(0, Number(override?.recurringExtraAllowance || 0)),
      enterprisePlanNote: override?.enterprisePlanNote || null,
    };
  }

  async getTenantJobAllowanceControl(tenantId: string) {
    const db = this.prisma as any;
    const company = await db.company.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
    if (!company) throw new NotFoundException('Tenant not found');
    const [summary, override, credits] = await Promise.all([
      this.getJobCompletionAllowanceSummary(tenantId),
      db.tenantJobAllowanceOverride?.findUnique?.({ where: { tenantId } }),
      db.tenantJobAllowanceCredit?.findMany?.({
        where: { tenantId },
        orderBy: [{ createdAt: 'desc' }],
        take: 25,
      }),
    ]);
    return {
      ok: true,
      tenant: company,
      override: override || null,
      credits: Array.isArray(credits) ? credits : [],
      summary,
    };
  }

  async updateTenantJobAllowanceControl(tenantId: string, actorUserId: string, input: Record<string, any>) {
    if (input?.confirmation !== true) throw new BadRequestException('Explicit confirmation is required.');
    const db = this.prisma as any;
    const company = await db.company.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
    if (!company) throw new NotFoundException('Tenant not found');
    const reason = this.normalizeAllowanceReason(input?.reason);
    const before = await this.getTenantJobAllowanceControl(tenantId);
    const now = new Date();
    const monthlyProvided = Object.prototype.hasOwnProperty.call(input || {}, 'monthlyJobAllowance');
    const unlimitedProvided = Object.prototype.hasOwnProperty.call(input || {}, 'unlimitedJobs');
    const recurringExtraProvided = Object.prototype.hasOwnProperty.call(input || {}, 'recurringExtraAllowance');
    const noteProvided = Object.prototype.hasOwnProperty.call(input || {}, 'enterprisePlanNote');
    const creditDelta = Number(input?.creditDelta || 0);
    const temporaryCreditCount = Number(input?.temporaryCreditCount || 0);
    const jobPackCreditCount = Number(input?.jobPackCreditCount || 0);
    const expiresAtRaw = String(input?.expiresAt || '').trim();
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
    if (expiresAtRaw && Number.isNaN(expiresAt?.getTime())) {
      throw new BadRequestException('Credit expiry date is invalid.');
    }

    const result = await db.$transaction(async (tx: any) => {
      if (monthlyProvided || unlimitedProvided || recurringExtraProvided || noteProvided) {
        const existing = await tx.tenantJobAllowanceOverride.findUnique({ where: { tenantId } });
        await tx.tenantJobAllowanceOverride.upsert({
          where: { tenantId },
          update: {
            monthlyJobAllowance: monthlyProvided
              ? input.monthlyJobAllowance === null || input.monthlyJobAllowance === ''
                ? null
                : Math.max(0, Math.floor(Number(input.monthlyJobAllowance || 0)))
              : existing?.monthlyJobAllowance ?? null,
            unlimitedJobs: unlimitedProvided ? input.unlimitedJobs === true : Boolean(existing?.unlimitedJobs),
            recurringExtraAllowance: recurringExtraProvided
              ? Math.max(0, Math.floor(Number(input.recurringExtraAllowance || 0)))
              : Math.max(0, Number(existing?.recurringExtraAllowance || 0)),
            enterprisePlanNote: noteProvided ? String(input.enterprisePlanNote || '').trim().slice(0, 500) || null : existing?.enterprisePlanNote ?? null,
            reason,
            createdByUserId: actorUserId,
          },
          create: {
            tenantId,
            monthlyJobAllowance:
              monthlyProvided && input.monthlyJobAllowance !== null && input.monthlyJobAllowance !== ''
                ? Math.max(0, Math.floor(Number(input.monthlyJobAllowance || 0)))
                : null,
            unlimitedJobs: unlimitedProvided ? input.unlimitedJobs === true : false,
            recurringExtraAllowance: recurringExtraProvided
              ? Math.max(0, Math.floor(Number(input.recurringExtraAllowance || 0)))
              : 0,
            enterprisePlanNote: noteProvided ? String(input.enterprisePlanNote || '').trim().slice(0, 500) || null : null,
            reason,
            createdByUserId: actorUserId,
          },
        });
      }
      if (Number.isFinite(creditDelta) && creditDelta !== 0) {
        await tx.tenantJobAllowanceCredit.create({
          data: {
            tenantId,
            creditCount: Math.trunc(creditDelta),
            creditType: creditDelta > 0 ? 'manual_add' : 'manual_remove',
            reason,
            createdByUserId: actorUserId,
          },
        });
      }
      if (Number.isFinite(temporaryCreditCount) && temporaryCreditCount > 0) {
        await tx.tenantJobAllowanceCredit.create({
          data: {
            tenantId,
            creditCount: Math.floor(temporaryCreditCount),
            creditType: 'temporary_bonus',
            expiresAt,
            reason,
            createdByUserId: actorUserId,
          },
        });
      }
      if (Number.isFinite(jobPackCreditCount) && jobPackCreditCount > 0) {
        await tx.tenantJobAllowanceCredit.create({
          data: {
            tenantId,
            creditCount: Math.floor(jobPackCreditCount),
            creditType: 'manual_job_pack',
            reason,
            createdByUserId: actorUserId,
          },
        });
      }
      const reverseCreditId = String(input?.reverseCreditId || '').trim();
      if (reverseCreditId) {
        const sourceCredit = await tx.tenantJobAllowanceCredit.findFirst({
          where: { id: reverseCreditId, tenantId },
        });
        if (!sourceCredit) throw new BadRequestException('Allowance ledger entry not found.');
        if (Number(sourceCredit.creditCount || 0) <= 0) throw new BadRequestException('Only a positive allowance grant can be reversed.');
        const priorReversal = await tx.tenantJobAllowanceCredit.findFirst({
          where: {
            tenantId,
            creditType: 'manual_reversal',
            reason: { contains: `Reversal of ${reverseCreditId}` },
          },
        });
        if (priorReversal) throw new BadRequestException('This allowance grant has already been reversed.');
        await tx.tenantJobAllowanceCredit.create({
          data: {
            tenantId,
            creditCount: -Math.abs(Number(sourceCredit.creditCount || 0)),
            creditType: 'manual_reversal',
            reason: `Reversal of ${reverseCreditId}. ${reason}`.slice(0, 500),
            createdByUserId: actorUserId,
          },
        });
      }
      return true;
    });
    void result;
    const after = await this.getTenantJobAllowanceControl(tenantId);
    await this.audit.log(
      tenantId,
      'platform.job_allowance.update',
      `Platform job allowance changed. Before=${JSON.stringify({
        override: before.override,
        manualCreditsTotal: before.summary?.manualCreditsTotal,
      })} After=${JSON.stringify({
        override: after.override,
        manualCreditsTotal: after.summary?.manualCreditsTotal,
      })} Reason=${reason}`,
      actorUserId,
    );
    return after;
  }

  async getJobCompletionAllowanceSummary(
    tenantId: string,
    options?: {
      db?: any;
      now?: Date;
      includedAllowance?: number | null;
    },
  ) {
    const db = options?.db || (this.prisma as any);
    const now = options?.now || new Date();
    const periodStart = this.getCurrentBillingPeriodStart(now);
    const periodEnd = this.getCurrentBillingPeriodEnd(periodStart);
    const allowanceControl = await this.resolveJobAllowanceControlState(db, tenantId, now);
    const planIncludedAllowance =
      Math.max(
        0,
        Number(
          options?.includedAllowance ??
          (await this.resolveMonthlyIncludedJobCompletionAllowance(tenantId, db)),
        ),
      ) || 0;
    const monthlyIncludedAllowance =
      (allowanceControl.monthlyJobAllowance ?? planIncludedAllowance) + allowanceControl.recurringExtraAllowance;

    const [completedJobs, purchases] = await Promise.all([
      db.job.findMany({
        where: {
          companyId: tenantId,
          completedAt: { not: null },
          status: { in: ['COMPLETED', 'INVOICED'] },
        },
        select: {
          id: true,
          completedAt: true,
          status: true,
        },
      }),
      db.jobCompletionPackPurchase?.findMany({
        where: {
          tenantId,
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);

    const monthCounts = new Map<string, number>();
    let completedJobsCount = 0;
    for (const job of Array.isArray(completedJobs) ? completedJobs : []) {
      if (!job?.completedAt) continue;
      const key = this.formatJobCompletionUsageMonthKey(job.completedAt);
      monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
      if (job.completedAt >= periodStart && job.completedAt < periodEnd) {
        completedJobsCount += 1;
      }
    }

    let purchasedCreditsUsed = 0;
    for (const count of monthCounts.values()) {
      purchasedCreditsUsed += Math.max(0, count - monthlyIncludedAllowance);
    }

    const rows = Array.isArray(purchases) ? purchases : [];
    const paidRows = rows.filter((purchase: any) =>
      ['paid', 'partially_refunded', 'refunded'].includes(String(purchase.status || '').trim()),
    );
    const pendingRows = rows.filter((purchase: any) => purchase.status === 'pending');
    const expiredRows = rows.filter((purchase: any) => purchase.status === 'expired');
    const cancelledRows = rows.filter((purchase: any) => purchase.status === 'cancelled' || purchase.status === 'failed');
    const webhookBackedCreditsTotal = paidRows.reduce((sum: number, purchase: any) => {
      const refundState = this.summarizeJobCompletionPackPurchaseRefundState(purchase);
      return sum + Math.max(0, Number(purchase.jobCompletionCount || 0) - refundState.refundedJobCompletionCount);
    }, 0);
    const manualCreditsTotal = allowanceControl.manualCreditsTotal;
    const purchasedCreditsTotal = Math.max(0, webhookBackedCreditsTotal + manualCreditsTotal);
    const pendingExtraAllowance = pendingRows.reduce(
      (sum: number, purchase: any) => sum + Math.max(0, Number(purchase.jobCompletionCount || 0)),
      0,
    );
    const monthlyIncludedUsed = Math.min(monthlyIncludedAllowance, completedJobsCount);
    const monthlyIncludedRemaining = Math.max(0, monthlyIncludedAllowance - monthlyIncludedUsed);
    const purchasedCreditsUsedThisMonth = Math.max(0, completedJobsCount - monthlyIncludedAllowance);
    const purchasedCreditsRemaining = purchasedCreditsTotal - purchasedCreditsUsed;
    const purchasedCreditsDeficit = Math.max(0, 0 - purchasedCreditsRemaining);
    const purchasedCreditsAvailableNow = Math.max(0, purchasedCreditsRemaining);
    const totalAvailableNow = allowanceControl.unlimitedJobs ? Number.MAX_SAFE_INTEGER : monthlyIncludedRemaining + purchasedCreditsAvailableNow;

    return {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      resetDate: periodEnd.toISOString(),
      completedJobsCount,
      monthlyIncludedAllowance,
      planIncludedAllowance,
      allowanceOverride: allowanceControl.override
        ? {
            monthlyJobAllowance: allowanceControl.monthlyJobAllowance,
            recurringExtraAllowance: allowanceControl.recurringExtraAllowance,
            unlimitedJobs: allowanceControl.unlimitedJobs,
            enterprisePlanNote: allowanceControl.enterprisePlanNote,
            reason: allowanceControl.override.reason,
            updatedAt: allowanceControl.override.updatedAt,
          }
        : null,
      unlimitedJobs: allowanceControl.unlimitedJobs,
      enterprisePlanNote: allowanceControl.enterprisePlanNote,
      monthlyIncludedUsed,
      monthlyIncludedRemaining,
      webhookBackedCreditsTotal,
      manualCreditsTotal,
      temporaryCreditsTotal: allowanceControl.temporaryCreditsTotal,
      recurringExtraAllowance: allowanceControl.recurringExtraAllowance,
      purchasedCreditsTotal,
      purchasedCreditsUsed,
      purchasedCreditsUsedThisMonth,
      purchasedCreditsRemaining,
      purchasedCreditsDeficit,
      totalAvailableNow,
      includedAllowance: monthlyIncludedAllowance,
      includedRemaining: monthlyIncludedRemaining,
      purchasedExtraAllowance: purchasedCreditsTotal,
      pendingExtraAllowance,
      remainingAllowance: totalAvailableNow,
      extraRemaining: purchasedCreditsAvailableNow,
      expiredPurchases: expiredRows.length,
      cancelledPurchases: cancelledRows.length,
      pendingPurchases: pendingRows.map((purchase: any) => ({
        id: purchase.id,
        packCode: purchase.packCode,
        jobCompletionCount: purchase.jobCompletionCount,
        amountCents: purchase.amountCents,
        currency: purchase.currency,
        status: purchase.status,
        createdAt: purchase.createdAt,
      })),
      purchaseStateSummary:
        purchasedCreditsDeficit > 0
          ? `Refunded purchased credits exceed the currently unused pack balance by ${purchasedCreditsDeficit}. Future pack purchases will offset this before adding new availability.`
          : allowanceControl.unlimitedJobs
            ? 'This workspace has a platform-approved unlimited completion allowance.'
            : pendingExtraAllowance > 0
            ? 'Pending pack purchases stay excluded until Stripe confirms payment.'
            : allowanceControl.enterprisePlanNote
              ? allowanceControl.enterprisePlanNote
              : 'Included monthly allowance resets each month. Purchased pack credits carry over until used or refunded.',
    };
  }

  async assertJobCompletionAllowanceAvailable(
    tenantId: string,
    options?: {
      db?: any;
      now?: Date;
      includedAllowance?: number | null;
      additionalCompletions?: number;
    },
  ) {
    const required = Math.max(1, Number(options?.additionalCompletions || 1));
    const summary = await this.getJobCompletionAllowanceSummary(tenantId, options);
    if (summary.unlimitedJobs) {
      return summary;
    }
    if (summary.totalAvailableNow < required) {
      throw new BadRequestException(
        summary.purchasedCreditsDeficit > 0
          ? 'No completion allowance remains. Refunded purchased credits have already been consumed, so future pack purchases must first offset the deficit.'
          : 'No completion allowance remains. Included monthly allowance is exhausted and no purchased credits are currently available.',
      );
    }
    return summary;
  }

  private async fetchStripeJobCompletionCatalogData(options?: {
    mockCatalog?: {
      prices?: any[];
      products?: any[];
    } | null;
  }) {
    if (options?.mockCatalog) {
      return {
        prices: Array.isArray(options.mockCatalog.prices) ? options.mockCatalog.prices : [],
        products: Array.isArray(options.mockCatalog.products) ? options.mockCatalog.products : [],
      };
    }

    const stripe = this.requireStripe();
    const [prices, products] = await Promise.all([
      stripe.prices.list({ limit: 100, expand: ['data.product'] }).autoPagingToArray({ limit: 250 }),
      stripe.products.list({ limit: 100 }).autoPagingToArray({ limit: 250 }),
    ]);
    return { prices, products };
  }

  private async resolveJobCompletionPackPriceByEnv(priceId: string | null) {
    if (!priceId) return null;
    try {
      return await this.requireStripe().prices.retrieve(priceId, { expand: ['product'] });
    } catch (error) {
      this.logger.warn(`Stripe job-completion pack env price lookup failed for a configured fallback id: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async resolveJobCompletionPackProductByEnv(productId: string | null) {
    if (!productId) return null;
    try {
      return await this.requireStripe().products.retrieve(productId);
    } catch (error) {
      this.logger.warn(`Stripe job-completion pack env product lookup failed for a configured fallback id: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async syncJobCompletionPackCatalog(options?: {
    dryRun?: boolean;
    allowCreate?: boolean;
    mockCatalog?: {
      prices?: any[];
      products?: any[];
    } | null;
  }) {
    if (!this.isStripeConfigured()) {
      return this.buildUnsyncedJobCompletionPackSnapshot('Stripe is not configured, so job-completion add-on products cannot be synced here yet.');
    }

    const expectedCurrency = this.getExpectedJobCompletionPackCurrency();
    const { prices, products } = await this.fetchStripeJobCompletionCatalogData(options);
    const rows: JobCompletionPackSnapshotRow[] = [];
    const allowCreate = options?.allowCreate === true && process.env.MYTITAN_CONFIRM_JOB_PACK_CREATE === '1';

    for (const definition of JOB_COMPLETION_PACK_DEFINITIONS) {
      const catalogSource = await this.resolveJobCompletionPackCatalogSource(definition);
      const envFallback = {
        priceId: catalogSource.priceId,
        productId: catalogSource.productId,
      };
      const lookupMatch = prices.find((price: any) => normalizeJobCompletionPackCode(price?.lookup_key) === catalogSource.lookupKey) || null;
      const metadataMatch =
        prices.find((price: any) =>
          this.buildJobCompletionPackMetadataCodes(
            price?.metadata,
            price?.product && typeof price.product === 'object' ? price.product.metadata : null,
          ).includes(definition.code),
        ) || null;
      const envPriceMatch =
        lookupMatch || metadataMatch || options?.mockCatalog ? null : await this.resolveJobCompletionPackPriceByEnv(envFallback.priceId);
      const price = lookupMatch || metadataMatch || envPriceMatch;
      const lookupSource: JobCompletionPackLookupSource = lookupMatch
        ? 'lookup_key'
        : metadataMatch
          ? 'metadata'
          : envPriceMatch
            ? 'env_fallback'
            : 'none';

      const productFromPrice = price?.product && typeof price.product === 'object' ? price.product : null;
      const productLookupMatch =
        products.find((product: any) =>
          this.buildJobCompletionPackMetadataCodes(product?.metadata).includes(definition.code),
        ) || null;
      const envProductMatch =
        productFromPrice || productLookupMatch || options?.mockCatalog
          ? null
          : await this.resolveJobCompletionPackProductByEnv(envFallback.productId);
      let product = productFromPrice || productLookupMatch || envProductMatch;
      const observedAmountCents = this.extractJobCompletionPackAmountCents(price);
      const inferredJobCountFromEnvFallback =
        lookupSource === 'env_fallback' &&
        observedAmountCents === catalogSource.expectedAmountCents &&
        normalizeJobCompletionPackCode(product?.name || productFromPrice?.name || '') === definition.code
          ? definition.jobCount
          : null;
      const declaredJobCount = this.extractJobCompletionPackJobCount(
        price?.metadata,
        product?.metadata,
        productFromPrice?.metadata,
      ) ?? inferredJobCountFromEnvFallback;

      let status: JobCompletionPackSyncStatus = 'missing';
      if (!price && product) {
        status = 'found';
      } else if (price) {
        const active = Boolean(price.active && (product?.active ?? productFromPrice?.active ?? true));
        const currency = String(price.currency || '').trim().toUpperCase();
        if (!active) {
          status = 'inactive';
        } else if ((catalogSource.currency || currency) && currency !== (catalogSource.currency || expectedCurrency)) {
          status = 'currency_mismatch';
        } else if (declaredJobCount == null || declaredJobCount !== definition.jobCount) {
          status = 'job_count_mismatch';
        } else if (observedAmountCents !== catalogSource.expectedAmountCents) {
          status = 'price_mismatch';
        } else {
          status = 'ready';
        }
      }

      if (allowCreate && !options?.mockCatalog && (status === 'missing' || status === 'found')) {
        product = await this.ensureJobCompletionPackProduct(definition, product);
        const createdPrice = await this.ensureJobCompletionPackPrice(definition, String(product.id), prices);
        rows.push(
          this.buildJobCompletionPackRow({
            definition,
            price: createdPrice,
            product,
            status: 'ready',
            source: normalizeJobCompletionPackCode(createdPrice?.lookup_key) === definition.code ? 'lookup_key' : 'metadata',
            expectedCurrency,
          }),
        );
        continue;
      }

      rows.push(
        this.buildJobCompletionPackRow({
          definition,
          price,
          product,
          status,
          source: lookupSource,
          expectedCurrency,
        }),
      );
    }

    const snapshot = this.buildJobCompletionPackSnapshot(rows);
    if (!options?.dryRun) {
      await this.writeStoredJobCompletionPackSnapshot(snapshot);
    }
    return snapshot;
  }

  async getJobCompletionPackCatalogSummary() {
    const stored = await this.readStoredJobCompletionPackSnapshot();
    if (stored) {
      return sanitizeJobCompletionPackSnapshot(stored);
    }
    return sanitizeJobCompletionPackSnapshot(this.buildUnsyncedJobCompletionPackSnapshot());
  }

  private getFinanceConfig(settings?: { businessConfigJson?: any } | null) {
    const raw = settings?.businessConfigJson && typeof settings.businessConfigJson === 'object'
      ? settings.businessConfigJson.finance
      : null;
    return {
      vatNumber: String(raw?.vatNumber || '').trim() || null,
      invoiceNumberPrefix: String(raw?.invoiceNumberPrefix || '').trim() || null,
      paymentTermsDays: Math.max(0, Number(raw?.paymentTermsDays || 7)) || 7,
      defaultVatCategory: String(raw?.defaultVatCategory || '').trim() || null,
    };
  }

  private buildInvoiceNumber(job: { jobRef?: string | null; id: string; invoiceNumber?: string | null }, prefix?: string | null) {
    if (job.invoiceNumber) return job.invoiceNumber;
    const prefixValue = String(prefix || '').trim();
    const reference = String(job.jobRef || job.id).trim();
    return prefixValue ? `${prefixValue}-${reference}` : reference;
  }

  private calculateAgingBucket(daysOverdue: number) {
    if (daysOverdue <= 0) return 'current';
    if (daysOverdue <= 30) return '1_30';
    if (daysOverdue <= 60) return '31_60';
    if (daysOverdue <= 90) return '61_90';
    return '90_plus';
  }

  private buildTrialState(subscription: any, now = new Date()) {
    const startedAt = subscription?.trialStartedAt ? new Date(subscription.trialStartedAt) : null;
    const endsAt = subscription?.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
    if (!startedAt || !endsAt) {
      return {
        status: 'not_applicable',
        isActive: false,
        startedAt: null,
        endsAt: null,
        daysRemaining: 0,
      };
    }

    const hasFutureWindow = endsAt.getTime() > now.getTime();
    const isActive = subscription?.status === 'trialing' && hasFutureWindow;
    const status = isActive ? 'active' : hasFutureWindow ? 'converted' : 'expired';
    const daysRemaining = isActive ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))) : 0;

    return {
      status,
      isActive,
      startedAt: startedAt.toISOString(),
      endsAt: endsAt.toISOString(),
      daysRemaining,
    };
  }

  private async maybeQueueReviewRequest(companyId: string, jobId: string) {
    if (!isAutomationsV1Enabled()) return;
    const enabled = await this.automations.getSettings(companyId);
    if (!enabled.reviewRequestEnabled) return;
    const db = this.prisma as any;
    const recent = await db.notification.findFirst({
      where: {
        companyId,
        entityType: 'job',
        entityId: jobId,
        metaJson: { path: ['reasonKey'], equals: 'review_request' },
      },
    });
    if (recent) return;
    const owner = await db.user.findFirst({ where: { companyId, role: 'OWNER' }, select: { id: true } });
    if (!owner?.id) return;
    await this.notifications.sendEntityUpdate(companyId, owner.id, {
      entityType: 'job',
      entityId: jobId,
      templateKey: 'review_request',
      channel: 'in_app',
      note: 'Automation review request',
    });
  }

  private async maybeMarkTrialConversion(db: any, tenantId: string, nextStatus?: string | null) {
    if (String(nextStatus || '').trim().toLowerCase() !== 'active') return;
    const subscription = await db.tenantSubscription.findUnique({
      where: { tenantId },
      select: {
        tenantId: true,
        convertedAt: true,
        trialStartedAt: true,
        trialEndsAt: true,
      },
    });
    if (!subscription?.trialStartedAt || !subscription?.trialEndsAt || subscription.convertedAt) return;

    const convertedAt = new Date();
    const lifecycleRow = await this.notifications.markLifecycleConversion(tenantId, convertedAt);
    await db.tenantSubscription.update({
      where: { tenantId },
      data: {
        convertedAt,
        conversionSource: lifecycleRow?.id ? 'LIFECYCLE_EMAIL' : 'MANUAL',
      },
    });
  }

  async getConversionMetrics() {
    const db = this.prisma as any;
    const [trialsStarted, trialsConverted, lifecycleEmailClicks, lifecycleEmailConversions] = await Promise.all([
      db.tenantSubscription.count({ where: { trialStartedAt: { not: null } } }),
      db.tenantSubscription.count({ where: { convertedAt: { not: null } } }),
      db.notification.count({ where: { type: 'trial_lifecycle_email', clickedAt: { not: null } } }),
      db.notification.count({ where: { type: 'trial_lifecycle_email', conversionAt: { not: null } } }),
    ]);
    return {
      trialsStarted,
      trialsConverted,
      conversionRate: trialsStarted > 0 ? Number((trialsConverted / trialsStarted).toFixed(4)) : 0,
      lifecycleEmailClicks,
      lifecycleEmailConversions,
    };
  }

  private getStripeConfigAudit() {
    const requiredPriceEnvNames = [
      'STRIPE_PRICE_SOLE_TRADER_MONTHLY',
      'STRIPE_PRICE_SOLE_TRADER_ANNUAL',
      'STRIPE_PRICE_BUSINESS_MONTHLY',
      'STRIPE_PRICE_BUSINESS_ANNUAL',
      'STRIPE_PRICE_ENTERPRISE_MONTHLY',
      'STRIPE_PRICE_ENTERPRISE_ANNUAL',
    ] as const;
    const normalizedSecretKey = this.resolveStripeSecretKey(process.env.STRIPE_SECRET_KEY);
    const configuredPriceEnvNames = requiredPriceEnvNames.filter((name) => Boolean(String(process.env[name] || '').trim()));
    const publishableKeyConfigured = Boolean(String(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '').trim());
    const missingConfigNames = [
      ...(!normalizedSecretKey ? ['STRIPE_SECRET_KEY'] : []),
      ...(!this.resolveStripeWebhookSecret() ? ['STRIPE_WEBHOOK_SECRET'] : []),
      ...(String(process.env.STRIPE_BILLING_RETURN_URL || '').trim() ? [] : ['STRIPE_BILLING_RETURN_URL']),
      ...requiredPriceEnvNames.filter((name) => !String(process.env[name] || '').trim()),
    ];

    return {
      stripeConfigured: this.isStripeConfigured(),
      backendKeyType:
        normalizedSecretKey?.startsWith('rk_')
          ? 'restricted'
          : normalizedSecretKey?.startsWith('sk_')
            ? 'standard_secret'
            : 'missing',
      webhookSecretConfigured: Boolean(this.resolveStripeWebhookSecret()),
      billingReturnUrlConfigured: Boolean(String(process.env.STRIPE_BILLING_RETURN_URL || '').trim()),
      publishableKeyConfigured,
      publishableKeyUsedByApp: false,
      portalConfigurationIdUsed: false,
      productIdEnvNamesUsed: [] as string[],
      configuredPriceEnvNames,
      missingConfigNames,
    };
  }

  async getPlatformMembershipDirectory() {
    const db = this.prisma as any;
    const users = await db.user.findMany({
      select: {
        id: true,
        email: true,
        emailVerified: true,
        role: true,
        createdAt: true,
        lastActiveAt: true,
        lastLoginAt: true,
        company: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            timezone: true,
            currency: true,
            tenantSetting: {
              select: {
                planBillingInterval: true,
                defaultCurrency: true,
              },
            },
            subscriptions: {
              select: {
                status: true,
                trialStartedAt: true,
                trialEndsAt: true,
                currentPeriodEnd: true,
                cancelAtPeriodEnd: true,
                convertedAt: true,
                conversionSource: true,
                stripeCustomerId: true,
                stripeSubscriptionId: true,
                plan: {
                  select: {
                    code: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ companyId: 'asc' }, { role: 'asc' }, { createdAt: 'asc' }],
    });

    const rows = users.map((user: any) => {
      const subscription = user.company?.subscriptions || null;
      const trial = this.buildTrialState(subscription);
      return {
        userId: user.id,
        workspaceId: user.company?.id || null,
        workspaceName: user.company?.name || 'Unknown workspace',
        workspaceCreatedAt: user.company?.createdAt || null,
        workspaceTimezone: user.company?.timezone || 'UTC',
        workspaceCurrency: user.company?.tenantSetting?.defaultCurrency || user.company?.currency || 'GBP',
        email: user.email,
        emailVerified: Boolean(user.emailVerified),
        role: user.role,
        createdAt: user.createdAt,
        lastActiveAt: user.lastActiveAt || null,
        lastLoginAt: user.lastLoginAt || null,
        planCode: subscription?.plan?.code || DEFAULT_PLAN_CODE,
        planName: subscription?.plan?.name || PLAN_DEFINITIONS[DEFAULT_PLAN_CODE].name,
        billingInterval: user.company?.tenantSetting?.planBillingInterval || DEFAULT_INTERVAL,
        subscriptionStatus: subscription?.status || 'inactive',
        cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
        trialStatus: trial.status,
        trialEndsAt: trial.endsAt,
        trialDaysRemaining: trial.daysRemaining,
        convertedAt: subscription?.convertedAt || null,
        conversionSource: subscription?.conversionSource || null,
        stripeLinked: Boolean(subscription?.stripeCustomerId || subscription?.stripeSubscriptionId),
        stripeCustomerLinked: Boolean(subscription?.stripeCustomerId),
        stripeSubscriptionLinked: Boolean(subscription?.stripeSubscriptionId),
      };
    });

    return {
      rows,
      summary: {
        members: rows.length,
        workspaces: new Set(rows.map((row: any) => row.workspaceId).filter(Boolean)).size,
        activePaidWorkspaces: new Set(
          rows.filter((row: any) => row.subscriptionStatus === 'active').map((row: any) => row.workspaceId).filter(Boolean),
        ).size,
        activeTrials: new Set(
          rows.filter((row: any) => row.trialStatus === 'active').map((row: any) => row.workspaceId).filter(Boolean),
        ).size,
      },
    };
  }

  async getPlatformRevenueDashboard() {
    const db = this.prisma as any;
    const [subscriptions, conversionMetrics, allowanceAdjustedTenants, jobPackPurchases] = await Promise.all([
      db.tenantSubscription.findMany({
        select: {
          tenantId: true,
          status: true,
          trialStartedAt: true,
          trialEndsAt: true,
          convertedAt: true,
          conversionSource: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          plan: {
            select: {
              code: true,
              name: true,
            },
          },
          tenant: {
            select: {
              name: true,
              currency: true,
              tenantSetting: {
                select: {
                  planBillingInterval: true,
                  defaultCurrency: true,
                  pricingAdjustmentJson: true,
                  pricingAdjustmentConsumedAt: true,
                  businessConfigJson: true,
                },
              },
            },
          },
        },
      }),
      this.getConversionMetrics(),
      db.tenantJobAllowanceOverride.count({
        where: {
          OR: [
            { monthlyJobAllowance: { not: null } },
            { recurringExtraAllowance: { gt: 0 } },
            { unlimitedJobs: true },
          ],
        },
      }),
      db.jobCompletionPackPurchase.findMany({
        where: { status: { in: ['paid', 'partially_refunded'] } },
        select: { currency: true, amountCents: true, metadataJson: true, stripePaymentIntentId: true, stripeEventId: true, checkoutSessionId: true },
      }),
    ]);

    const activeSubscriptionsByTier: Record<string, number> = {};
    const actualMonthlyRecurringRevenueByCurrency: Record<string, number> = {};
    const forecastedMonthlyRevenueByCurrency: Record<string, number> = {};
    let totalTrialWorkspaces = 0;
    let activePaidWorkspaces = 0;
    let expiredTrials = 0;
    let pausedSubscriptions = 0;
    let churnedTenants = 0;
    let overdueOrFailedBilling = 0;
    let customPriceTenants = 0;
    let discountedTenants = 0;

    for (const subscription of subscriptions) {
      const trial = this.buildTrialState(subscription);
      if (trial.isActive) totalTrialWorkspaces += 1;
      if (trial.status === 'expired' && !subscription.convertedAt) expiredTrials += 1;
      const subscriptionStatus = String(subscription.status || '').trim().toLowerCase();
      if (['paused', 'trial_paused'].includes(subscriptionStatus)) pausedSubscriptions += 1;
      if (['canceled', 'cancelled', 'churned'].includes(subscriptionStatus)) churnedTenants += 1;
      if (['past_due', 'unpaid', 'incomplete_expired'].includes(subscriptionStatus)) overdueOrFailedBilling += 1;
      const commercial = this.readTenantCommercialControls(subscription.tenant?.tenantSetting);
      if (commercial.customMonthlyPriceCents !== null || commercial.customAnnualPriceCents !== null) customPriceTenants += 1;
      const adjustment = normalizeStoredPricingAdjustment(subscription.tenant?.tenantSetting?.pricingAdjustmentJson);
      const adjustmentActive = Boolean(
        adjustment &&
        (adjustment.duration === 'recurring' ||
          (adjustment.duration === 'one_time' && !subscription.tenant?.tenantSetting?.pricingAdjustmentConsumedAt) ||
          (adjustment.duration === 'until_date' && adjustment.expiresAt && new Date(adjustment.expiresAt).getTime() > Date.now())),
      );
      if (adjustmentActive) {
        discountedTenants += 1;
      }
      const planCode = subscription.plan?.code || DEFAULT_PLAN_CODE;
      const interval = subscription.tenant?.tenantSetting?.planBillingInterval || DEFAULT_INTERVAL;
      const pricingState = resolvePricingState({
        planCode,
        planName: subscription.plan?.name,
        interval,
        currency: subscription.tenant?.tenantSetting?.defaultCurrency || subscription.tenant?.currency || 'GBP',
        adjustment: subscription.tenant?.tenantSetting?.pricingAdjustmentJson,
        consumedAt: subscription.tenant?.tenantSetting?.pricingAdjustmentConsumedAt,
        basePriceCentsOverride: interval === 'ANNUAL' ? commercial.customAnnualPriceCents : commercial.customMonthlyPriceCents,
      });
      const monthlyAmountCents =
        interval === 'ANNUAL' ? Math.round(pricingState.adjustedPriceCents / 12) : pricingState.adjustedPriceCents;
      if (subscriptionStatus === 'active') {
        forecastedMonthlyRevenueByCurrency[pricingState.currency] =
          (forecastedMonthlyRevenueByCurrency[pricingState.currency] || 0) + monthlyAmountCents;
      }

      const hasRealPlatformBilling =
        this.isLivePlatformStripeReference(subscription.stripeSubscriptionId, 'sub') &&
        this.isLivePlatformStripeReference(subscription.stripeCustomerId, 'cus');
      const countsAsActualRevenue = subscriptionStatus === 'active' && hasRealPlatformBilling && !trial.isActive;
      if (!countsAsActualRevenue) continue;

      activePaidWorkspaces += 1;
      activeSubscriptionsByTier[planCode] = (activeSubscriptionsByTier[planCode] || 0) + 1;
      actualMonthlyRecurringRevenueByCurrency[pricingState.currency] =
        (actualMonthlyRecurringRevenueByCurrency[pricingState.currency] || 0) + monthlyAmountCents;
    }

    const jobPackRevenueByCurrency = new Map<string, number>();
    let actualJobPackPurchases = 0;
    for (const purchase of jobPackPurchases) {
      if (
        !this.isLivePlatformStripeReference(purchase.stripePaymentIntentId, 'pi') ||
        !this.isLivePlatformStripeReference(purchase.stripeEventId, 'evt') ||
        !this.isLivePlatformStripeReference(purchase.checkoutSessionId, 'cs')
      ) {
        continue;
      }
      const refundedAmountCents = Math.max(0, Number((purchase.metadataJson as any)?.refundedAmountCents || 0));
      const netAmount = Math.max(0, Number(purchase.amountCents || 0) - refundedAmountCents);
      const currency = String(purchase.currency || 'GBP').toUpperCase();
      jobPackRevenueByCurrency.set(currency, (jobPackRevenueByCurrency.get(currency) || 0) + netAmount);
      actualJobPackPurchases += 1;
    }
    const actualMrrRows = this.platformRevenueRows(actualMonthlyRecurringRevenueByCurrency, activePaidWorkspaces === 0);
    const actualArrRows = actualMrrRows.map(({ currency, amountCents }) => ({ currency, amountCents: amountCents * 12 }));
    const actualJobPackRows = this.platformRevenueRows(Object.fromEntries(jobPackRevenueByCurrency.entries()), actualJobPackPurchases === 0);
    const forecastRows = this.platformRevenueRows(forecastedMonthlyRevenueByCurrency, false);

    return {
      totals: {
        totalTrialWorkspaces,
        activePaidWorkspaces,
        expiredTrials,
        conversionCount: conversionMetrics.trialsConverted,
        conversionRate: conversionMetrics.conversionRate,
        lifecycleEmailClicks: conversionMetrics.lifecycleEmailClicks,
        lifecycleEmailConversions: conversionMetrics.lifecycleEmailConversions,
        pausedSubscriptions,
        churnedTenants,
        overdueOrFailedBilling,
        customPriceTenants,
        discountedTenants,
        allowanceAdjustedTenants,
        actualMonthlyRecurringRevenueByCurrency: actualMrrRows,
        actualAnnualRecurringRevenueByCurrency: actualArrRows,
        actualJobPackRevenueByCurrency: actualJobPackRows,
        estimatedMonthlyRecurringRevenueByCurrency: actualMrrRows,
        estimatedAnnualRecurringRevenueByCurrency: actualArrRows,
        jobPackRevenueByCurrency: actualJobPackRows,
        forecastedMonthlyRevenueByCurrency: forecastRows,
        revenueSourceLabels: ['Actual revenue', 'Forecast', 'Tenant customer payments excluded'],
      },
      movement: {
        expansionRevenueByCurrency: [],
        contractionRevenueByCurrency: [],
        limitation: 'Expansion and contraction require authoritative period-over-period invoice snapshots; no synthetic movement is reported.',
        forecastBasis: 'Forecast is the configured active subscription run-rate only. Actual revenue requires real MyTitan Stripe subscription or job-pack payment records and excludes tenant customer payments, deposits, invoices, trials, and test payments.',
      },
      activeSubscriptionsByTier: Object.entries(activeSubscriptionsByTier)
        .map(([planCode, count]) => ({
          planCode,
          planName: PLAN_DEFINITIONS[planCode as keyof typeof PLAN_DEFINITIONS]?.name || planCode,
          count,
        }))
        .sort((left, right) => right.count - left.count || left.planCode.localeCompare(right.planCode)),
      stripeAlignment: this.getStripeConfigAudit(),
    };
  }

  private platformRevenueRows(values: Record<string, number>, includeZeroDefaults: boolean) {
    const entries = Object.entries(values)
      .map(([currency, amountCents]) => ({
        currency: String(currency || 'GBP').toUpperCase(),
        amountCents: Math.max(0, Math.round(Number(amountCents || 0))),
      }))
      .filter((row) => row.currency);
    if (!entries.length && includeZeroDefaults) {
      return [
        { currency: 'GBP', amountCents: 0 },
        { currency: 'USD', amountCents: 0 },
      ];
    }
    return entries.sort((left, right) => left.currency.localeCompare(right.currency));
  }

  private isLivePlatformStripeReference(value: unknown, expectedPrefix: string) {
    const raw = String(value || '').trim();
    if (!raw.startsWith(`${expectedPrefix}_`)) return false;
    return !/_(e2e|test|probe|fixture|mock|demo)(_|$)/i.test(raw);
  }

  private async resolveBillingFollowUp(companyId: string, userId: string | null, jobId: string, reason: 'invoice_issued' | 'payment_received') {
    const db = this.prisma as any;
    const openReminders = await db.jobReminder.findMany({
      where: {
        companyId,
        jobId,
        completedAt: null,
        note: { in: ['Automation billing follow-up', 'Automation dispatch follow-up'] },
      },
    });
    if (!openReminders.length) return 0;

    const completedAt = new Date();
    await db.jobReminder.updateMany({
      where: { id: { in: openReminders.map((row: any) => row.id) } },
      data: { completedAt },
    });
    await db.jobActivity.create({
      data: {
        companyId,
        jobId,
        actorUserId: userId,
        eventType: 'job.reminder.completed',
        message: reason === 'payment_received' ? 'Billing follow-up resolved after payment' : 'Billing follow-up resolved after invoice issue',
        payloadJson: {
          reason,
          reminderIds: openReminders.map((row: any) => row.id),
        },
      },
    });
    return openReminders.length;
  }

  private async logBillingActivity(companyId: string, jobId: string, actorUserId: string | null, eventType: string, message: string, payloadJson?: any) {
    const db = this.prisma as any;
    await db.jobActivity.create({
      data: {
        companyId,
        jobId,
        actorUserId: actorUserId || null,
        eventType,
        message,
        payloadJson: payloadJson ?? null,
      },
    });
  }

  private normalizeBillingReason(value?: string | null, fallback = 'Billing update recorded') {
    const normalized = String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);
    return normalized || fallback;
  }

  private readBillingAdjustmentPayload(payloadJson: any) {
    const type = String(payloadJson?.type || '').trim();
    const amountCents = Math.max(0, Number(payloadJson?.amountCents || 0));
    if (!type || !amountCents) return null;
    return {
      type,
      amountCents,
      direction: String(payloadJson?.direction || '').trim() || null,
      status: String(payloadJson?.status || '').trim() || null,
      mode: String(payloadJson?.mode || '').trim() || null,
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
      const payload = this.readBillingAdjustmentPayload(activity?.payloadJson);
      if (!payload) continue;
      if (payload.type === 'refund') {
        if (payload.status === 'pending') {
          summary.refundPendingCents += payload.amountCents;
        } else {
          summary.refundRecordedCents += payload.amountCents;
        }
      }
      if (payload.type === 'adjustment') {
        if (payload.direction === 'credit') {
          summary.adjustmentCreditCents += payload.amountCents;
        }
        if (payload.direction === 'debit') {
          summary.adjustmentDebitCents += payload.amountCents;
        }
      }
    }

    return summary;
  }

  private async loadBillableJobOrThrow(companyId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({
      where: { id: jobId, companyId },
      include: {
        activities: {
          where: {
            eventType: {
              in: ['billing.refund.recorded', 'billing.adjustment.recorded'],
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!job) {
      throw new BadRequestException('Job not found');
    }
    return job;
  }

  async recordRefund(companyId: string, userId: string, dto: RefundPaymentDto) {
    const mode = dto.mode || 'manual_record';
    const job = await this.loadBillableJobOrThrow(companyId, dto.jobId);
    if (!job.invoicePaidAt && !job.paymentCheckoutSessionId && !job.paymentReceiptUrl) {
      throw new BadRequestException('A recorded payment is required before a refund can be logged.');
    }

    const activitySummary = this.summarizeBillingActivities(job.activities || []);
    const grossCents = Math.max(0, Number(job.totalCents || 0));
    const adjustmentDelta = activitySummary.adjustmentDebitCents - activitySummary.adjustmentCreditCents;
    const effectiveGrossCents = Math.max(0, grossCents + adjustmentDelta);
    const refundableRemainingCents = Math.max(0, effectiveGrossCents - activitySummary.refundRecordedCents);
    const amountCents = Math.max(0, Math.round(Number(dto.amountCents || 0)));
    if (!amountCents) {
      throw new BadRequestException('Refund amount must be greater than zero.');
    }
    if (amountCents > refundableRemainingCents) {
      throw new BadRequestException('Refund amount exceeds the remaining paid balance.');
    }

    let providerReference: string | null = null;
    let status: 'refunded' | 'partially_refunded' | 'pending' = amountCents === refundableRemainingCents ? 'refunded' : 'partially_refunded';
    if (mode === 'stripe') {
      const stripe = this.requireStripeConnect();
      const client = await this.resolveTenantStripeConnectClient(companyId);
      if (!client.ok || !(await this.refreshTenantStripeCheckoutReadiness(companyId, { force: true, actorUserId: userId }))) {
        throw new BadRequestException('The business Stripe account must be verified before this refund can be requested.');
      }
      if (!job.paymentCheckoutSessionId) {
        throw new BadRequestException('Stripe refunds require a Stripe checkout session on the job.');
      }
      const paymentRequest = await (this.prisma as any).customerPaymentRequest.findFirst({
        where: {
          tenantId: companyId,
          jobId: job.id,
          provider: 'stripe-connect',
          paidAt: { not: null },
        },
        orderBy: { createdAt: 'desc' },
      });
      const session = await stripe.checkout.sessions.retrieve(
        job.paymentCheckoutSessionId,
        { expand: ['payment_intent.latest_charge'] },
        { stripeAccount: client.connectedAccountId },
      );
      const paymentIntent = session.payment_intent as Stripe.PaymentIntent | null;
      const paymentIntentId = String(paymentIntent?.id || '').trim();
      if (!paymentIntentId) {
        throw new BadRequestException('Stripe refund could not resolve the original payment intent.');
      }
      try {
        const refund = await stripe.refunds.create(
          {
            payment_intent: paymentIntentId,
            amount: amountCents,
            metadata: {
              type: 'customer_payment_refund',
              tenantId: companyId,
              jobId: job.id,
              jobRef: String(job.jobRef || ''),
              paymentRequestId: String(paymentRequest?.id || ''),
            },
          },
          { stripeAccount: client.connectedAccountId },
        );
        providerReference = refund.id;
        status = refund.status === 'pending' ? 'pending' : amountCents === refundableRemainingCents ? 'refunded' : 'partially_refunded';
      } catch (error: any) {
        await this.notifications.notifyOperationalAlert({
          companyId,
          category: 'payments',
          reasonKey: 'stripe_refund_failed',
          title: 'Stripe refund needs attention',
          body: 'MyTitan could not create a Stripe refund. Review payment state before confirming any customer refund outcome.',
          emailSubject: 'MyTitan operational alert: Stripe refund needs attention',
          emailBody: [
            `Job: ${job.jobRef || job.id}`,
            `Amount: ${amountCents}`,
            `Reason: ${this.truncateWebhookError(error)}`,
          ].join('\n'),
          entityType: 'job',
          entityId: job.id,
          metaJson: {
            provider: 'stripe',
            amountCents,
          },
        }).catch(() => undefined);
        throw error;
      }
    }

    const reason = this.normalizeBillingReason(dto.reason, 'Refund recorded');
    await this.logBillingActivity(companyId, job.id, userId, 'billing.refund.recorded', reason, {
      type: 'refund',
      amountCents,
      currency: String(job.currency || 'GBP').toUpperCase(),
      mode,
      status,
      providerReference,
      reference: dto.reference || null,
      reason,
    });
    await this.audit.log(companyId, 'billing.refund.record', `Refund recorded for ${job.jobRef || job.id}`, userId);
    await this.notifications.notifyBillingRefundRecorded({
      companyId,
      jobId: job.id,
      amountCents,
      currency: String(job.currency || 'GBP').toUpperCase(),
      mode,
      status,
      reason,
      notifyCustomer: dto.notifyCustomer !== false,
    });

    return {
      ok: true,
      jobId: job.id,
      amountCents,
      currency: String(job.currency || 'GBP').toUpperCase(),
      mode,
      status,
      providerReference,
      refundableRemainingCents: Math.max(0, refundableRemainingCents - amountCents),
    };
  }

  async recordBalanceAdjustment(companyId: string, userId: string, dto: BillingBalanceAdjustmentDto) {
    const job = await this.loadBillableJobOrThrow(companyId, dto.jobId);
    const amountCents = Math.max(0, Math.round(Number(dto.amountCents || 0)));
    if (!amountCents) {
      throw new BadRequestException('Adjustment amount must be greater than zero.');
    }

    const reason = this.normalizeBillingReason(
      dto.reason,
      dto.direction === 'credit' ? 'Billing credit adjustment recorded' : 'Billing debit adjustment recorded',
    );
    await this.logBillingActivity(companyId, job.id, userId, 'billing.adjustment.recorded', reason, {
      type: 'adjustment',
      direction: dto.direction,
      amountCents,
      currency: String(job.currency || 'GBP').toUpperCase(),
      status: 'adjusted',
      reference: dto.reference || null,
      reason,
    });
    await this.audit.log(companyId, 'billing.adjustment.record', `Billing adjustment recorded for ${job.jobRef || job.id}`, userId);
    await this.notifications.notifyBillingAdjustmentRecorded({
      companyId,
      jobId: job.id,
      amountCents,
      currency: String(job.currency || 'GBP').toUpperCase(),
      direction: dto.direction,
      reason,
      notifyCustomer: dto.notifyCustomer !== false,
    });

    return {
      ok: true,
      jobId: job.id,
      amountCents,
      currency: String(job.currency || 'GBP').toUpperCase(),
      direction: dto.direction,
      status: 'adjusted',
    };
  }

  async requestBookingDepositRefund(companyId: string, userId: string, bookingId: string, dto: RefundBookingDepositDto) {
    const stripe = this.requireStripeConnect();
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({
      where: { id: bookingId, companyId },
      select: {
        id: true,
        companyId: true,
        publicStatusToken: true,
        customerEmail: true,
        serviceName: true,
        pricingSnapshotJson: true,
        paymentStateJson: true,
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    const paymentState = this.normalizeBookingPaymentState(booking.paymentStateJson);
    const provider = String(paymentState.provider || booking.pricingSnapshotJson?.paymentProvider || '').trim().toUpperCase();
    if (provider !== 'STRIPE') {
      throw new BadRequestException('Only Stripe-backed booking deposits can be refunded here.');
    }
    if (String(paymentState.depositStatus || '').trim() !== 'paid') {
      throw new BadRequestException('A paid booking deposit is required before requesting a refund.');
    }

    const refundSummary = this.summarizeBookingDepositRefundState(paymentState);
    const amountCents = Math.max(0, Math.round(Number(dto.amountCents || 0)));
    if (!amountCents) {
      throw new BadRequestException('Refund amount must be greater than zero.');
    }
    if (amountCents > refundSummary.remainingPaidCents) {
      throw new BadRequestException('Refund amount exceeds the remaining paid booking deposit.');
    }

    const paymentIntentId = String(paymentState.stripePaymentIntentId || '').trim();
    if (!paymentIntentId) {
      throw new BadRequestException('Stripe payment intent is missing for this booking deposit.');
    }
    const client = await this.resolveTenantStripeConnectClient(companyId);
    if (!client.ok || !(await this.refreshTenantStripeCheckoutReadiness(companyId, { force: true, actorUserId: userId }))) {
      throw new BadRequestException('The business Stripe account must be verified before this refund can be requested.');
    }

    let refund: Stripe.Refund;
    try {
      refund = await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          amount: amountCents,
          metadata: {
            type: 'booking_deposit_refund',
            tenantId: companyId,
            bookingId: booking.id,
            publicStatusToken: String(booking.publicStatusToken || '').trim(),
          },
        },
        { stripeAccount: client.connectedAccountId },
      );
    } catch (error: any) {
      await this.notifications.notifyOperationalAlert({
        companyId,
        category: 'payments',
        reasonKey: 'booking_deposit_refund_failed',
        title: 'Booking deposit refund needs attention',
        body: 'MyTitan could not create the Stripe booking deposit refund. Review payment state before confirming any customer refund outcome.',
        emailSubject: 'MyTitan operational alert: booking deposit refund needs attention',
        emailBody: [
          `Booking: ${booking.id}`,
          `Amount: ${amountCents}`,
          `Reason: ${this.truncateWebhookError(error)}`,
        ].join('\n'),
        entityType: 'booking',
        entityId: booking.id,
        metaJson: {
          provider: 'stripe',
          amountCents,
        },
      }).catch(() => undefined);
      throw error;
    }

    const pendingAmountCents = refundSummary.pendingRefundCents + amountCents;
    await db.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CONFIRMED',
        paymentStateJson: {
          ...paymentState,
          depositRefundStatus: 'pending',
          depositRefundStatusLabel: 'Deposit refund pending',
          depositRefundRequestedAt: new Date().toISOString(),
          depositRefundRequestedAmountCents: amountCents,
          depositRefundPendingAmountCents: pendingAmountCents,
          depositRefundNotifyCustomer: dto.notifyCustomer !== false,
          stripeRefundId: String(refund.id || '').trim() || null,
          stripeRefundIds: this.appendUniqueStateList(paymentState.stripeRefundIds, String(refund.id || '').trim()),
          stripeLastEventId: String(refund.id || '').trim() || paymentState.stripeLastEventId || null,
          note: 'Stripe refund requested. The deposit is only marked refunded after Stripe confirms it.',
        },
      },
    });

    await this.audit.log(companyId, 'booking.deposit.refund_requested', `Stripe refund requested for booking ${booking.id}`, userId);
    await this.notifications.notifyBookingDepositRefundRequested({
      companyId,
      bookingId: booking.id,
      amountCents,
      currency: String(booking.pricingSnapshotJson?.currency || 'GBP').toUpperCase(),
      notifyCustomer: dto.notifyCustomer !== false,
    });

    return {
      ok: true,
      bookingId: booking.id,
      amountCents,
      currency: String(booking.pricingSnapshotJson?.currency || 'GBP').toUpperCase(),
      status: 'pending',
      refundId: String(refund.id || '').trim() || null,
      pendingRefundAmountCents: pendingAmountCents,
    };
  }

  isStripeConfigured() {
    return Boolean(this.stripe);
  }

  private getReturnUrl() {
    return process.env.STRIPE_BILLING_RETURN_URL || 'https://app.mytitan.co.uk/dashboard/billing';
  }

  async ensurePlans() {
    const db = this.prisma as any;
    const defs = Object.values(PLAN_DEFINITIONS);
    await Promise.all(
      defs.map((plan) =>
        db.plan.upsert({
          where: { code: plan.code },
          update: {
            name: plan.name,
            stripePriceMonthlyId: this.priceIdFor(plan.code, 'MONTHLY') || '',
            stripePriceAnnualId: this.priceIdFor(plan.code, 'ANNUAL') || '',
            featuresJson: plan.features,
            aiRequestsLimitMonthly: plan.aiRequestsLimitMonthly,
            aiTokensLimitMonthly: plan.aiTokensLimitMonthly,
          },
          create: {
            code: plan.code,
            name: plan.name,
            stripePriceMonthlyId: this.priceIdFor(plan.code, 'MONTHLY') || '',
            stripePriceAnnualId: this.priceIdFor(plan.code, 'ANNUAL') || '',
            featuresJson: plan.features,
            aiRequestsLimitMonthly: plan.aiRequestsLimitMonthly,
            aiTokensLimitMonthly: plan.aiTokensLimitMonthly,
          },
        }),
      ),
    );
  }

  private priceIdFor(planCode: string, interval: 'MONTHLY' | 'ANNUAL') {
    if (planCode === 'SOLE_TRADER') {
      return interval === 'MONTHLY'
        ? process.env.STRIPE_PRICE_SOLE_TRADER_MONTHLY
        : process.env.STRIPE_PRICE_SOLE_TRADER_ANNUAL;
    }
    if (planCode === 'BUSINESS') {
      return interval === 'MONTHLY'
        ? process.env.STRIPE_PRICE_BUSINESS_MONTHLY
        : process.env.STRIPE_PRICE_BUSINESS_ANNUAL;
    }
    if (planCode === 'ENTERPRISE') {
      return interval === 'MONTHLY'
        ? process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY
        : process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL;
    }
    return undefined;
  }

  private async resolveSubscriptionCatalogOverride(planCode: string, interval: 'MONTHLY' | 'ANNUAL') {
    return this.findBillingCatalogOverride('subscription_price', planCode, interval);
  }

  private async resolveSubscriptionPriceId(planCode: string, interval: 'MONTHLY' | 'ANNUAL') {
    const override = await this.resolveSubscriptionCatalogOverride(planCode, interval);
    return String(override?.stripePriceId || this.priceIdFor(planCode, interval) || '').trim() || null;
  }

  private formatStripeMoney(amountCents: number | null | undefined, currency: string | null | undefined) {
    if (!Number.isFinite(Number(amountCents)) || amountCents == null || !currency) return null;
    try {
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: String(currency).toUpperCase(),
        maximumFractionDigits: 2,
      }).format(Number(amountCents) / 100);
    } catch {
      return `${String(currency).toUpperCase()} ${(Number(amountCents) / 100).toFixed(2)}`;
    }
  }

  private buildSubscriptionPriceEnvName(planCode: string, interval: 'MONTHLY' | 'ANNUAL') {
    return `STRIPE_PRICE_${planCode}_${interval}`;
  }

  async verifySubscriptionPricing(options?: {
    mockPrices?: Record<string, any> | null;
    ignoreCatalogOverrides?: boolean;
  }) {
    const expectedCurrency = 'GBP';
    const ignoreCatalogOverrides = Boolean(options?.ignoreCatalogOverrides);
    const rows = (
      await Promise.all(
        Object.values(PLAN_DEFINITIONS).map(async (plan) => {
          const monthlyOverride = ignoreCatalogOverrides ? null : await this.resolveSubscriptionCatalogOverride(plan.code, 'MONTHLY');
          const annualOverride = ignoreCatalogOverrides ? null : await this.resolveSubscriptionCatalogOverride(plan.code, 'ANNUAL');
          return [
            {
              planCode: plan.code,
              planName: plan.name,
              interval: 'MONTHLY' as const,
              expectedAmountCents:
                Number.isFinite(Number(monthlyOverride?.expectedAmountCents)) && monthlyOverride?.expectedAmountCents != null
                  ? Number(monthlyOverride.expectedAmountCents)
                  : plan.pricesCents.MONTHLY,
              expectedCurrency: String(monthlyOverride?.currency || expectedCurrency).trim().toUpperCase() || expectedCurrency,
              configuredPriceId: String(monthlyOverride?.stripePriceId || this.priceIdFor(plan.code, 'MONTHLY') || '').trim() || null,
              envName: this.buildSubscriptionPriceEnvName(plan.code, 'MONTHLY'),
            },
            {
              planCode: plan.code,
              planName: plan.name,
              interval: 'ANNUAL' as const,
              expectedAmountCents:
                Number.isFinite(Number(annualOverride?.expectedAmountCents)) && annualOverride?.expectedAmountCents != null
                  ? Number(annualOverride.expectedAmountCents)
                  : plan.pricesCents.ANNUAL,
              expectedCurrency: String(annualOverride?.currency || expectedCurrency).trim().toUpperCase() || expectedCurrency,
              configuredPriceId: String(annualOverride?.stripePriceId || this.priceIdFor(plan.code, 'ANNUAL') || '').trim() || null,
              envName: this.buildSubscriptionPriceEnvName(plan.code, 'ANNUAL'),
            },
          ];
        }),
      )
    ).flat();

    if (!this.isStripeConfigured()) {
      return {
        status: 'setup_needed' as const,
        checkedAt: new Date().toISOString(),
        message: 'Stripe subscription billing is not configured in this environment yet.',
        prices: rows.map((row) => ({
          ...row,
          status: 'setup_needed' as const,
          active: false,
          observedAmountCents: null,
          observedCurrency: null,
          observedInterval: null,
          displayExpectedPrice: this.formatStripeMoney(row.expectedAmountCents, row.expectedCurrency),
          displayObservedPrice: null,
          detail: `Stripe is not configured. ${row.envName} cannot be verified yet.`,
          action:
            `Configure Stripe, then set ${row.envName} to a GBP ${row.interval === 'ANNUAL' ? 'annual' : 'monthly'} price for ${row.planName} at ${row.expectedAmountCents} pence.`,
        })),
      };
    }

    const stripe = this.requireStripe();
    const prices = await Promise.all(
      rows.map(async (row) => {
        const displayExpectedPrice = this.formatStripeMoney(row.expectedAmountCents, row.expectedCurrency);
        if (!row.configuredPriceId) {
          return {
            ...row,
            status: 'setup_needed' as const,
            active: false,
            observedAmountCents: null,
            observedCurrency: null,
            observedInterval: null,
            displayExpectedPrice,
            displayObservedPrice: null,
            detail: `${row.envName} is missing, so this plan price cannot be verified.`,
            action:
              `Create or map a GBP ${row.interval === 'ANNUAL' ? 'annual' : 'monthly'} Stripe price for ${row.planName} at ${row.expectedAmountCents} pence, then wire ${row.envName}.`,
          };
        }

        const mockPrice = options?.mockPrices?.[row.configuredPriceId] || null;
        let price: any = mockPrice;
        let retrieveError: string | null = null;
        if (!price) {
          try {
            price = await stripe.prices.retrieve(row.configuredPriceId);
          } catch (error) {
            retrieveError = error instanceof Error ? error.message : String(error);
          }
        }

        if (!price) {
          return {
            ...row,
            status: 'mismatch' as const,
            active: false,
            observedAmountCents: null,
            observedCurrency: null,
            observedInterval: null,
            displayExpectedPrice,
            displayObservedPrice: null,
            detail: `The configured Stripe price could not be read safely${retrieveError ? `: ${retrieveError}` : '.'}`,
            action:
              `Check ${row.envName}, confirm the Stripe price still exists, and remap it to a GBP ${row.interval === 'ANNUAL' ? 'annual' : 'monthly'} price for ${row.planName} at ${row.expectedAmountCents} pence.`,
          };
        }

        const observedCurrency = String(price.currency || '').trim().toUpperCase() || null;
        const observedAmountCents = Number.isFinite(Number(price.unit_amount)) ? Number(price.unit_amount) : null;
        const observedInterval =
          price.recurring?.interval === 'year' ? 'ANNUAL' : price.recurring?.interval === 'month' ? 'MONTHLY' : null;
        const active = Boolean(price.active);
        const matches =
          active &&
          observedCurrency === row.expectedCurrency &&
          observedAmountCents === row.expectedAmountCents &&
          observedInterval === row.interval;
        const displayObservedPrice = this.formatStripeMoney(observedAmountCents, observedCurrency);

        return {
          ...row,
          status: matches ? ('ready' as const) : ('mismatch' as const),
          active,
          observedAmountCents,
          observedCurrency,
          observedInterval,
          displayExpectedPrice,
          displayObservedPrice,
          detail: matches
            ? 'Configured Stripe price matches the public plan amount, currency, and interval.'
            : `Configured Stripe price does not match the expected ${row.expectedCurrency} ${row.interval === 'ANNUAL' ? 'annual' : 'monthly'} amount.`,
          action: matches
            ? 'No change required.'
            : `Create or remap a GBP ${row.interval === 'ANNUAL' ? 'annual' : 'monthly'} Stripe price for ${row.planName} at ${row.expectedAmountCents} pence, then update ${row.envName}.`,
        };
      }),
    );

    const hasMismatch = prices.some((row) => row.status === 'mismatch');
    const hasSetupNeeded = prices.some((row) => row.status === 'setup_needed');
    const status = hasMismatch ? 'mismatch' : hasSetupNeeded ? 'setup_needed' : 'ready';

    return {
      status,
      checkedAt: new Date().toISOString(),
      message:
        status === 'ready'
          ? 'Stripe subscription prices match the public plan values.'
          : status === 'mismatch'
            ? 'One or more Stripe subscription prices do not match the public plan values.'
            : 'One or more Stripe subscription prices still need setup before paid plans are ready.',
      prices,
    };
  }

  private validatePricingAdjustmentInput(input: PricingAdjustmentDto) {
    if (input.type === 'percentage' && input.value > 100) {
      throw new BadRequestException('Percentage adjustments cannot exceed 100%.');
    }
    if (input.duration === 'until_date') {
      if (!input.expiresAt) {
        throw new BadRequestException('An expiry date is required for until-date adjustments.');
      }
      const expiresAt = new Date(input.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('Expiry must be in the future.');
      }
    }
  }

  private buildStoredPricingAdjustment(input: PricingAdjustmentDto, userId: string, existingRaw?: unknown) {
    const existing = normalizeStoredPricingAdjustment(existingRaw);
    const now = new Date().toISOString();
    return {
      type: input.type,
      value: Number(input.value),
      duration: input.duration,
      expiresAt: input.duration === 'until_date' ? new Date(input.expiresAt as string).toISOString() : null,
      reason: input.reason?.trim() || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      appliedByUserId: userId,
    };
  }

  private readTenantCommercialControls(settings?: { businessConfigJson?: any } | null) {
    const source =
      settings?.businessConfigJson &&
      typeof settings.businessConfigJson === 'object' &&
      !Array.isArray(settings.businessConfigJson)
        ? settings.businessConfigJson
        : {};
    const commercial =
      source.commercialControls &&
      typeof source.commercialControls === 'object' &&
      !Array.isArray(source.commercialControls)
        ? source.commercialControls
        : {};
    const normalizePrice = (value: unknown) =>
      value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
        ? Math.round(Number(value))
        : null;
    return {
      customMonthlyPriceCents: normalizePrice(commercial.customMonthlyPriceCents),
      customAnnualPriceCents: normalizePrice(commercial.customAnnualPriceCents),
      grandfatheredPricing: commercial.grandfatheredPricing === true,
      paused: commercial.paused === true,
      billingNote: String(commercial.billingNote || '').trim().slice(0, 1000) || null,
      updatedAt: String(commercial.updatedAt || '').trim() || null,
      updatedByUserId: String(commercial.updatedByUserId || '').trim() || null,
    };
  }

  private writeTenantCommercialControls(settings: any, controls: Record<string, any>) {
    const source =
      settings?.businessConfigJson &&
      typeof settings.businessConfigJson === 'object' &&
      !Array.isArray(settings.businessConfigJson)
        ? settings.businessConfigJson
        : {};
    return {
      ...source,
      commercialControls: controls,
    };
  }

  private async getTenantBillingSnapshot(tenantId: string) {
    const db = this.prisma as any;
    await this.ensurePlans();
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const subscription = await db.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    let plan = subscription?.plan ?? null;
    if (!plan) {
      plan = await db.plan.findUnique({ where: { code: DEFAULT_PLAN_CODE } });
    }
    const planCode = plan?.code ?? DEFAULT_PLAN_CODE;
    const interval = settings?.planBillingInterval ?? DEFAULT_INTERVAL;
    const currency = settings?.defaultCurrency || 'GBP';
    const commercialControls = this.readTenantCommercialControls(settings);
    const pricingState = resolvePricingState({
      planCode,
      planName: plan?.name ?? PLAN_DEFINITIONS[planCode].name,
      interval,
      currency,
      adjustment: settings?.pricingAdjustmentJson,
      consumedAt: settings?.pricingAdjustmentConsumedAt,
      basePriceCentsOverride: interval === 'ANNUAL'
        ? commercialControls.customAnnualPriceCents
        : commercialControls.customMonthlyPriceCents,
    });
    return {
      settings,
      subscription,
      plan,
      planCode,
      interval,
      currency,
      pricingState,
      commercialControls,
    };
  }

  private async createAdjustedStripePrice(planCode: string, interval: 'MONTHLY' | 'ANNUAL', amountCents: number, currency: string) {
    const stripe = this.requireStripe();
    return stripe.prices.create({
      currency: currency.toLowerCase(),
      unit_amount: amountCents,
      recurring: { interval: interval === 'ANNUAL' ? 'year' : 'month' },
      product_data: {
        name: `MyTitan ${PLAN_DEFINITIONS[planCode as keyof typeof PLAN_DEFINITIONS]?.name || planCode}`,
      },
      metadata: {
        source: 'workspace_pricing_adjustment',
        planCode,
        interval,
        basePriceCents: String(getPlanBasePriceCents(planCode, interval)),
      },
    });
  }

  private async syncStripeSubscriptionPrice(tenantId: string, mode: 'current' | 'standard' = 'current') {
    if (!this.stripe) return;
    const stripe = this.requireStripe();
    const snapshot = await this.getTenantBillingSnapshot(tenantId);
    if (!snapshot.subscription?.stripeSubscriptionId) return;

    const subscription = await stripe.subscriptions.retrieve(snapshot.subscription.stripeSubscriptionId);
    const itemId = subscription.items.data[0]?.id;
    if (!itemId) return;

    const standardPriceId = await this.resolveSubscriptionPriceId(snapshot.planCode, snapshot.interval);
    let targetPriceId = standardPriceId;
    if (mode === 'current' && snapshot.pricingState.adjustment?.isActive) {
      const adjusted = await this.createAdjustedStripePrice(
        snapshot.planCode,
        snapshot.interval,
        snapshot.pricingState.adjustedPriceCents,
        snapshot.currency,
      );
      targetPriceId = adjusted.id;
    }

    if (!targetPriceId) {
      this.logger.warn(`Skipping Stripe subscription sync for tenant ${tenantId}: no target price is configured.`);
      return;
    }

    await stripe.subscriptions.update(snapshot.subscription.stripeSubscriptionId, {
      proration_behavior: 'none',
      metadata: {
        tenantId,
        planCode: snapshot.planCode,
        interval: snapshot.interval,
        pricingAdjustmentStatus: mode === 'current' ? snapshot.pricingState.adjustment?.status || 'none' : 'none',
      },
      items: [{ id: itemId, price: targetPriceId }],
    });
  }

  async getPricingState(tenantId: string) {
    const snapshot = await this.getTenantBillingSnapshot(tenantId);
    return {
      plan: snapshot.plan,
      interval: snapshot.interval,
      pricingState: snapshot.pricingState,
      stripeConfigured: this.isStripeConfigured(),
    };
  }

  private getCatalogStatusMeta(status: string) {
    switch (status) {
      case 'ready':
      case 'verified':
        return { status: 'ready', label: 'Ready', nextAction: 'No change required.' };
      case 'needs_mapping':
        return { status: 'needs_mapping', label: 'Needs mapping', nextAction: 'Add the Stripe product and price IDs, then run dry-run validation.' };
      case 'amount_mismatch':
        return { status: 'amount_mismatch', label: 'Amount mismatch', nextAction: 'Confirm the Stripe price amount and update the expected amount or remap the price.' };
      case 'currency_mismatch':
        return { status: 'currency_mismatch', label: 'Currency mismatch', nextAction: 'Use a price in the expected currency before enabling checkout readiness.' };
      case 'inactive':
        return { status: 'inactive', label: 'Inactive', nextAction: 'Reactivate the mapped Stripe product or price, or keep this row intentionally inactive.' };
      default:
        return { status: 'verification_failed', label: 'Verification failed', nextAction: 'Review the mapped identifiers and rerun dry-run validation.' };
    }
  }

  private async verifyPlatformBillingCatalogCandidate(input: {
    kind: string;
    code: string;
    interval: string | null;
    lookupKey: string | null;
    stripeProductId: string | null;
    stripePriceId: string | null;
    expectedAmountCents: number | null;
    currency: string | null;
    active: boolean;
  }) {
    if (input.currency && !/^[A-Z]{3}$/.test(input.currency)) {
      throw new BadRequestException('Currency must be a 3-letter ISO code.');
    }
    if (input.expectedAmountCents != null && (!Number.isFinite(input.expectedAmountCents) || !Number.isInteger(input.expectedAmountCents) || input.expectedAmountCents <= 0)) {
      throw new BadRequestException('Expected amount must be greater than £0.00. Enter £19.00.');
    }

    if (input.active === false) {
      return {
        status: 'inactive',
        message: 'This mapping is intentionally inactive and will not be treated as checkout-ready.',
        observed: null,
      };
    }
    if (!input.stripePriceId && !input.stripeProductId) {
      return {
        status: 'needs_mapping',
        message: 'Stripe product and price IDs are still missing for this row.',
        observed: null,
      };
    }
    if (!this.isStripeConfigured()) {
      return {
        status: 'verification_failed',
        message: 'Stripe verification is unavailable in this runtime, so save remains audit-safe but unverified.',
        observed: null,
      };
    }

    const stripe = this.requireStripe();
    let price: any = null;
    let product: any = null;

    if (input.stripePriceId) {
      try {
        price = await stripe.prices.retrieve(input.stripePriceId, { expand: ['product'] });
      } catch (error) {
        return {
          status: 'verification_failed',
          message: `Stripe price could not be verified safely: ${error instanceof Error ? error.message : String(error)}`,
          observed: null,
        };
      }
    }
    if (input.stripeProductId) {
      try {
        product = await stripe.products.retrieve(input.stripeProductId);
      } catch (error) {
        return {
          status: 'verification_failed',
          message: `Stripe product could not be verified safely: ${error instanceof Error ? error.message : String(error)}`,
          observed: null,
        };
      }
    } else if (price?.product && typeof price.product === 'object') {
      product = price.product;
    }

    if (price?.active === false || product?.active === false) {
      return {
        status: 'inactive',
        message: 'The mapped Stripe product or price is inactive.',
        observed: {
          observedAmountCents: Number(price?.unit_amount ?? 0) || null,
          observedCurrency: String(price?.currency || '').trim().toUpperCase() || null,
          observedLookupKey: String(price?.lookup_key || '').trim() || null,
        },
      };
    }
    if (input.currency && price && String(price.currency || '').trim().toUpperCase() !== input.currency) {
      return {
        status: 'currency_mismatch',
        message: 'The mapped Stripe price currency does not match the expected catalog currency.',
        observed: {
          observedAmountCents: Number(price?.unit_amount ?? 0) || null,
          observedCurrency: String(price?.currency || '').trim().toUpperCase() || null,
          observedLookupKey: String(price?.lookup_key || '').trim() || null,
        },
      };
    }
    if (input.expectedAmountCents != null && price && Number(price.unit_amount ?? -1) !== input.expectedAmountCents) {
      return {
        status: 'amount_mismatch',
        message: `The mapped Stripe price amount does not match the expected catalog amount (${formatCurrencyMinorUnits(input.expectedAmountCents, input.currency || 'GBP')}).`,
        observed: {
          observedAmountCents: Number(price?.unit_amount ?? 0) || null,
          observedAmountDisplay: formatCurrencyMinorUnits(Number(price?.unit_amount ?? 0) || 0, String(price?.currency || input.currency || 'GBP').trim().toUpperCase() || 'GBP'),
          observedCurrency: String(price?.currency || '').trim().toUpperCase() || null,
          observedLookupKey: String(price?.lookup_key || '').trim() || null,
        },
      };
    }
    if (input.lookupKey && price && String(price.lookup_key || '').trim() && String(price.lookup_key || '').trim() !== input.lookupKey) {
      return {
        status: 'verification_failed',
        message: 'The mapped Stripe price lookup key does not match the expected lookup key.',
        observed: {
          observedAmountCents: Number(price?.unit_amount ?? 0) || null,
          observedCurrency: String(price?.currency || '').trim().toUpperCase() || null,
          observedLookupKey: String(price?.lookup_key || '').trim() || null,
        },
      };
    }
    if (input.stripeProductId && price?.product) {
      const priceProductId = typeof price.product === 'string' ? price.product : price.product.id;
      if (priceProductId && priceProductId !== input.stripeProductId) {
        return {
          status: 'verification_failed',
          message: 'The mapped Stripe price belongs to a different Stripe product.',
          observed: {
            observedAmountCents: Number(price?.unit_amount ?? 0) || null,
            observedCurrency: String(price?.currency || '').trim().toUpperCase() || null,
            observedLookupKey: String(price?.lookup_key || '').trim() || null,
          },
        };
      }
    }

    return {
      status: 'ready',
      message: 'Validated against Stripe safely before saving.',
      observed: {
        observedAmountCents: Number(price?.unit_amount ?? 0) || null,
        observedAmountDisplay: formatCurrencyMinorUnits(Number(price?.unit_amount ?? 0) || 0, String(price?.currency || input.currency || 'GBP').trim().toUpperCase() || 'GBP'),
        observedCurrency: String(price?.currency || '').trim().toUpperCase() || null,
        observedLookupKey: String(price?.lookup_key || '').trim() || null,
        observedProductName: String(product?.name || '').trim() || null,
      },
    };
  }

  private async buildPlatformBillingCatalogHistoryEntries(historyRows: any[]) {
    const db = this.prisma as any;
    const userIds = Array.from(new Set(historyRows.map((row: any) => String(row.createdByUserId || '').trim()).filter(Boolean)));
    const users = userIds.length
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
      : [];
    const userMap = new Map(users.map((row: any) => [row.id, row.email]));
    return historyRows.map((entry: any) => ({
      overrideKey: entry.overrideKey,
      action: entry.action,
      changeNotes: entry.changeNotes || null,
      previousValues: entry.previousValuesJson || null,
      nextValues: entry.nextValuesJson || null,
        verification: entry.metadataJson?.verification || null,
        previousValuesAdvanced: entry.previousValuesJson
          ? {
              ...entry.previousValuesJson,
              expectedAmountDisplay:
                entry.previousValuesJson.expectedAmountCents != null
                  ? formatCurrencyMinorUnits(entry.previousValuesJson.expectedAmountCents, entry.previousValuesJson.currency || 'GBP')
                  : null,
            }
          : null,
        nextValuesAdvanced: entry.nextValuesJson
          ? {
              ...entry.nextValuesJson,
              expectedAmountDisplay:
                entry.nextValuesJson.expectedAmountCents != null
                  ? formatCurrencyMinorUnits(entry.nextValuesJson.expectedAmountCents, entry.nextValuesJson.currency || 'GBP')
                  : null,
            }
          : null,
      createdByUserId: entry.createdByUserId || null,
      actorEmail: entry.createdByUserId ? userMap.get(entry.createdByUserId) || null : null,
      createdAt: entry.createdAt,
    }));
  }

  async getPlatformBillingCatalogOverview() {
    const overrides = await this.listBillingCatalogOverrides();
    const storedJobPackSnapshot = (await this.readStoredJobCompletionPackSnapshot()) || this.buildUnsyncedJobCompletionPackSnapshot();
    const storedJobPackMap = new Map((storedJobPackSnapshot.packs || []).map((pack: any) => [pack.code, pack]));
    const overrideMap = new Map<string, any>(overrides.map((row: any) => [row.key, row]));
    const historyRows = await this.listBillingCatalogOverrideHistory(overrides.map((row: any) => row.key));
    const historyEntries = await this.buildPlatformBillingCatalogHistoryEntries(historyRows);
    const historyMap = new Map<string, any[]>();
    for (const row of historyEntries) {
      const current = historyMap.get(String((row as any).overrideKey || '')) || [];
      current.push(row);
      historyMap.set(String((row as any).overrideKey || ''), current);
    }
    const rawHistoryByKey = new Map<string, any[]>();
    for (const row of historyRows) {
      const current = rawHistoryByKey.get(row.overrideKey) || [];
      current.push(row);
      rawHistoryByKey.set(row.overrideKey, current);
    }

    const mapRow = (base: Record<string, any>, row: any, fallbackPriceId?: string | null, fallbackProductId?: string | null) => {
      const statusMeta = this.getCatalogStatusMeta(String(row?.verificationStatus || (!fallbackPriceId && !fallbackProductId ? 'needs_mapping' : row?.active === false ? 'inactive' : 'verification_failed')));
      const history = historyEntries
        .filter((entry: any) => {
          const currentRows = rawHistoryByKey.get(base.key) || [];
          return currentRows.some((rowItem: any) => rowItem.createdAt?.toISOString?.() === entry.createdAt?.toISOString?.() && rowItem.action === entry.action);
        })
        .slice(0, 8);
      return {
        ...base,
        active: row?.active !== false,
        lookupKey: row?.lookupKey || base.lookupKey || null,
        expectedLookupKey: base.lookupKey || null,
        expectedAmountDisplay: formatCurrencyMinorUnits(base.expectedAmountCents, base.currency || 'GBP'),
        stripePriceIdMasked: this.maskStripeId(row?.stripePriceId || fallbackPriceId),
        stripeProductIdMasked: this.maskStripeId(row?.stripeProductId || fallbackProductId),
        missingPriceId: !String(row?.stripePriceId || fallbackPriceId || '').trim(),
        missingProductId: !String(row?.stripeProductId || fallbackProductId || '').trim(),
        amountMismatch: statusMeta.status === 'amount_mismatch',
        currencyMismatch: statusMeta.status === 'currency_mismatch',
        inactiveMapping: statusMeta.status === 'inactive',
        verificationStatus: statusMeta.status,
        verificationLabel: statusMeta.label,
        verificationMessage: row?.verificationMessage || (statusMeta.status === 'needs_mapping' ? 'Stripe identifiers still need to be mapped for this row.' : null),
        lastVerifiedAt: row?.lastVerifiedAt || null,
        changeNotes: row?.changeNotes || null,
        source: row ? 'override' : 'environment',
        mismatchWarning: statusMeta.status !== 'ready' ? (row?.verificationMessage || statusMeta.label) : null,
        nextAction: statusMeta.nextAction,
        history,
      };
    };

    const subscriptionItems = Object.values(PLAN_DEFINITIONS).flatMap((plan) =>
      (['MONTHLY', 'ANNUAL'] as const).map((interval) => {
        const key = this.buildCatalogOverrideKey('subscription_price', plan.code, interval);
        const row = overrideMap.get(key);
        return mapRow({
          kind: 'subscription_price',
          key,
          code: plan.code,
          planName: plan.name,
          interval,
          expectedAmountCents:
            Number.isFinite(Number(row?.expectedAmountCents)) && row?.expectedAmountCents != null
              ? Number(row.expectedAmountCents)
              : plan.pricesCents[interval],
          currency: String(row?.currency || 'GBP').trim().toUpperCase() || 'GBP',
          lookupKey: row?.lookupKey || plan.code,
        }, row, this.priceIdFor(plan.code, interval), row?.stripeProductId || null);
      }),
    );
    const jobPackItems = JOB_COMPLETION_PACK_DEFINITIONS.map((definition) => {
      const key = this.buildCatalogOverrideKey('job_pack', definition.code, null);
      const row = overrideMap.get(key);
      const mapped = mapRow({
        kind: 'job_pack',
        key,
        code: definition.code,
        label: definition.label,
        jobCount: definition.jobCount,
        expectedAmountCents:
          Number.isFinite(Number(row?.expectedAmountCents)) && row?.expectedAmountCents != null
            ? Number(row.expectedAmountCents)
            : definition.amountCents,
        currency: String(row?.currency || this.getExpectedJobCompletionPackCurrency()).trim().toUpperCase() || this.getExpectedJobCompletionPackCurrency(),
        lookupKey: row?.lookupKey || definition.code,
      }, row, process.env[definition.envPriceId] || null, process.env[definition.envProductId] || null);
      const snapshotPack = storedJobPackMap.get(definition.code) as any;
      return {
        ...mapped,
        syncStatus: snapshotPack?.status || 'missing',
        syncMessage: snapshotPack?.message || null,
        webhookGrantReadiness: storedJobPackSnapshot.grantingReadiness?.status || 'setup_required',
        checkoutReadiness:
          snapshotPack?.status === 'ready' &&
          snapshotPack?.active === true &&
          Boolean(snapshotPack?.priceId) &&
          storedJobPackSnapshot.grantingReadiness?.status === 'ready' &&
          process.env.MYTITAN_CONFIRM_JOB_PACK_CHECKOUT === '1'
            ? 'ready'
            : 'setup_required',
        nextAction:
          !String(row?.stripePriceId || process.env[definition.envPriceId] || '').trim()
            ? 'Add the Stripe price ID for this pack, then dry-run validate.'
            : !String(row?.stripeProductId || process.env[definition.envProductId] || '').trim()
              ? 'Add the Stripe product ID for this pack, then dry-run validate.'
              : snapshotPack?.status !== 'ready'
                ? snapshotPack?.message || mapped.nextAction
                : storedJobPackSnapshot.grantingReadiness?.status !== 'ready'
                  ? 'Verify webhook-backed granting before checkout can be considered.'
                  : process.env.MYTITAN_CONFIRM_JOB_PACK_CHECKOUT === '1'
                    ? 'Mapping is ready. Keep checkout under canary monitoring.'
                    : 'Set MYTITAN_CONFIRM_JOB_PACK_CHECKOUT=1 only after operator approval.',
      };
    });
    const combinedItems = [...subscriptionItems, ...jobPackItems];
    const mismatchWarnings = combinedItems.filter((item: any) => item.verificationStatus !== 'ready').length;

    return {
      stripeConfigured: this.isStripeConfigured(),
      subscriptionItems,
      jobPackItems,
      groups: {
        subscriptions: subscriptionItems,
        jobCompletionPacks: jobPackItems,
      },
      checkoutReadiness: {
        status: mismatchWarnings === 0 ? 'ready' : 'needs_attention',
        summary: mismatchWarnings === 0 ? 'All tracked catalog rows are verification-ready.' : `${mismatchWarnings} catalog row(s) still need mapping or verification.`,
      },
      jobPackCheckoutReadiness: {
        status: this.isJobCompletionPackCheckoutReady(storedJobPackSnapshot) ? 'ready' : 'setup_required',
        summary: storedJobPackSnapshot.summary,
        catalogStatus: storedJobPackSnapshot.status,
        checkoutStatus: storedJobPackSnapshot.checkoutStatus,
        explicitCheckoutConfirm: process.env.MYTITAN_CONFIRM_JOB_PACK_CHECKOUT === '1',
        webhookGrantReadiness: storedJobPackSnapshot.grantingReadiness,
        blockers: [
          storedJobPackSnapshot.status !== 'ready' ? 'all_active_pack_mappings_required' : null,
          storedJobPackSnapshot.grantingReadiness?.status !== 'ready' ? 'webhook_granting_required' : null,
          process.env.MYTITAN_CONFIRM_JOB_PACK_CHECKOUT !== '1' ? 'explicit_checkout_confirmation_required' : null,
        ].filter(Boolean),
      },
      mappingHealth: {
        ready: combinedItems.filter((item: any) => item.verificationStatus === 'ready').length,
        needsMapping: combinedItems.filter((item: any) => item.verificationStatus === 'needs_mapping').length,
        amountMismatch: combinedItems.filter((item: any) => item.verificationStatus === 'amount_mismatch').length,
        currencyMismatch: combinedItems.filter((item: any) => item.verificationStatus === 'currency_mismatch').length,
        inactive: combinedItems.filter((item: any) => item.verificationStatus === 'inactive').length,
        verificationFailed: combinedItems.filter((item: any) => item.verificationStatus === 'verification_failed').length,
      },
      changeHistory: historyEntries.slice(0, 24),
      summary: {
        historyEvents: historyRows.length,
        mismatchWarnings,
      },
    };
  }

  async upsertPlatformBillingCatalogOverride(companyId: string, userId: string, input: Record<string, any>) {
    const kind = String(input.kind || '').trim();
    const code = String(input.code || '').trim();
    const interval = input.interval ? String(input.interval).trim().toUpperCase() : null;
    if (!['subscription_price', 'job_pack'].includes(kind)) {
      throw new BadRequestException('Unsupported catalog override kind');
    }
    if (!code) {
      throw new BadRequestException('Catalog code is required');
    }
    const stripePriceId = String(input.stripePriceId || '').trim() || null;
    const stripeProductId = String(input.stripeProductId || '').trim() || null;
    const lookupKey = String(input.lookupKey || '').trim() || null;
    const currency = String(input.currency || '').trim().toUpperCase() || null;
    const active = input.active !== false;
    const expectedAmountCents = this.resolveCatalogExpectedAmountCents(input, currency);
    const mode = String(input.mode || (input.dryRun === true ? 'validate' : 'save')).trim().toLowerCase();
    const verification = await this.verifyPlatformBillingCatalogCandidate({
      kind,
      code,
      interval,
      lookupKey,
      stripeProductId,
      stripePriceId,
      expectedAmountCents: Number.isFinite(expectedAmountCents as number) ? Number(expectedAmountCents) : null,
      currency,
      active,
    });
    if (mode === 'validate') {
      return {
        ok: true,
        dryRun: true,
        verification: {
          ...verification,
          ...this.getCatalogStatusMeta(String(verification.status || 'verification_failed')),
        },
        item: {
          kind,
          code,
          interval,
          lookupKey,
          expectedAmountCents: Number.isFinite(expectedAmountCents as number) ? Number(expectedAmountCents) : null,
          expectedAmountDisplay:
            expectedAmountCents != null ? formatCurrencyMinorUnits(expectedAmountCents, currency || 'GBP') : null,
          currency,
          active,
          stripePriceIdMasked: this.maskStripeId(stripePriceId),
          stripeProductIdMasked: this.maskStripeId(stripeProductId),
        },
      };
    }
    if (!String(input.changeNotes || '').trim()) {
      throw new BadRequestException('A change reason is required before saving a billing catalog mapping.');
    }

    const db = this.prisma as any;
    const overrideKey = this.buildCatalogOverrideKey(kind, code, interval);
    const existing = await db.billingCatalogOverride.findUnique({
      where: { key: overrideKey },
    });
    const nextValues = {
      kind,
      code,
      interval,
      lookupKey,
      stripeProductId,
      stripePriceId,
      expectedAmountCents: Number.isFinite(expectedAmountCents as number) ? Number(expectedAmountCents) : null,
      currency,
      active,
      state: 'active',
      lastVerifiedAt: new Date(),
      verificationStatus: verification.status,
      verificationMessage: verification.message,
      changeNotes: String(input.changeNotes || '').trim() || null,
      metadataJson: {
        verification,
      },
    };
    const saved = await db.billingCatalogOverride.upsert({
      where: { key: overrideKey },
      update: {
        ...nextValues,
        updatedByUserId: userId,
      },
      create: {
        key: overrideKey,
        ...nextValues,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
    });

    await db.billingCatalogOverrideHistory.create({
      data: {
        overrideKey,
        kind,
        code,
        interval,
        action: existing ? 'updated' : 'created',
        changeNotes: String(input.changeNotes || '').trim() || null,
        previousValuesJson: existing
          ? {
              lookupKey: existing.lookupKey,
              stripeProductIdMasked: this.maskStripeId(existing.stripeProductId),
              stripePriceIdMasked: this.maskStripeId(existing.stripePriceId),
              expectedAmountCents: existing.expectedAmountCents,
              expectedAmountDisplay:
                existing.expectedAmountCents != null
                  ? formatCurrencyMinorUnits(existing.expectedAmountCents, existing.currency || currency || 'GBP')
                  : null,
              currency: existing.currency,
              active: existing.active,
              verificationStatus: existing.verificationStatus,
              lastVerifiedAt: existing.lastVerifiedAt,
            }
          : null,
        nextValuesJson: {
          lookupKey: saved.lookupKey,
          stripeProductIdMasked: this.maskStripeId(saved.stripeProductId),
          stripePriceIdMasked: this.maskStripeId(saved.stripePriceId),
          expectedAmountCents: saved.expectedAmountCents,
          expectedAmountDisplay:
            saved.expectedAmountCents != null
              ? formatCurrencyMinorUnits(saved.expectedAmountCents, saved.currency || currency || 'GBP')
              : null,
          currency: saved.currency,
          active: saved.active,
          verificationStatus: saved.verificationStatus,
          lastVerifiedAt: saved.lastVerifiedAt,
        },
        metadataJson: {
          verification,
          previousRollbackTarget: existing
            ? {
                lookupKey: existing.lookupKey,
                stripeProductId: existing.stripeProductId,
                stripePriceId: existing.stripePriceId,
                expectedAmountCents: existing.expectedAmountCents,
                currency: existing.currency,
                active: existing.active,
              }
            : null,
          rollbackTarget: {
            lookupKey: saved.lookupKey,
            stripeProductId: saved.stripeProductId,
            stripePriceId: saved.stripePriceId,
            expectedAmountCents: saved.expectedAmountCents,
            currency: saved.currency,
            active: saved.active,
          },
        },
        createdByUserId: userId,
      },
    });

    await this.audit.log(companyId, 'billing.catalog_override.upsert', `Saved ${kind} catalog override for ${code}${interval ? ` ${interval}` : ''}`, userId);

    return {
      ok: true,
      item: {
        kind: saved.kind,
        code: saved.code,
        interval: saved.interval,
        lookupKey: saved.lookupKey,
        expectedAmountCents: saved.expectedAmountCents,
        expectedAmountDisplay:
          saved.expectedAmountCents != null
            ? formatCurrencyMinorUnits(saved.expectedAmountCents, saved.currency || currency || 'GBP')
            : null,
        currency: saved.currency,
        active: saved.active,
        verificationStatus: saved.verificationStatus,
        verificationMessage: saved.verificationMessage,
        lastVerifiedAt: saved.lastVerifiedAt,
        changeNotes: saved.changeNotes,
        stripePriceIdMasked: this.maskStripeId(saved.stripePriceId),
        stripeProductIdMasked: this.maskStripeId(saved.stripeProductId),
        nextAction: this.getCatalogStatusMeta(String(saved.verificationStatus || 'verification_failed')).nextAction,
      },
    };
  }

  async verifyAllJobCompletionPacksDryRun(companyId: string, userId: string) {
    const snapshot = await this.syncJobCompletionPackCatalog({ dryRun: true });
    await this.audit.log(companyId, 'billing.job_completion_pack.verify_all', 'Dry-run verified all job completion pack mappings', userId);
    return {
      ok: true,
      dryRun: true,
      checkoutEnabled: false,
      checkoutStatus: snapshot.checkoutStatus,
      status: snapshot.status,
      summary: snapshot.summary,
      packs: snapshot.packs.map((pack) => ({
        code: pack.code,
        label: pack.label,
        jobCount: pack.jobCount,
        status: pack.status,
        active: pack.active,
        currency: pack.currency,
        displayPrice: pack.displayPrice,
        source: pack.source,
        message: pack.message,
        priceIdMasked: this.maskStripeId(pack.priceId),
        productIdMasked: this.maskStripeId(pack.productId),
      })),
      grantingReadiness: snapshot.grantingReadiness,
      blockers: [
        snapshot.status !== 'ready' ? 'all_active_pack_mappings_required' : null,
        snapshot.grantingReadiness?.status !== 'ready' ? 'webhook_granting_required' : null,
        process.env.MYTITAN_CONFIRM_JOB_PACK_CHECKOUT !== '1' ? 'explicit_checkout_confirmation_required' : null,
      ].filter(Boolean),
    };
  }

  async rollbackPlatformBillingCatalogOverride(companyId: string, userId: string, overrideKey: string, input: Record<string, any>) {
    const reason = String(input?.reason || input?.changeNotes || '').trim();
    if (!reason) {
      throw new BadRequestException('A rollback reason is required before changing a billing catalog mapping.');
    }
    const db = this.prisma as any;
    const history = await db.billingCatalogOverrideHistory.findFirst({
      where: { overrideKey },
      orderBy: { createdAt: 'desc' },
    });
    const target = history?.metadataJson?.previousRollbackTarget;
    if (!target || typeof target !== 'object') {
      throw new BadRequestException('This mapping does not have a rollback target with stored identifiers yet.');
    }
    const [kind, code, intervalRaw] = overrideKey.split(':');
    return this.upsertPlatformBillingCatalogOverride(companyId, userId, {
      kind,
      code,
      interval: intervalRaw === 'none' ? null : intervalRaw,
      lookupKey: target.lookupKey || null,
      stripeProductId: target.stripeProductId || null,
      stripePriceId: target.stripePriceId || null,
      expectedAmountCents: target.expectedAmountCents || null,
      currency: target.currency || null,
      active: target.active !== false,
      changeNotes: `Rollback: ${reason}`,
    });
  }

  async revealPlatformBillingCatalogOverride(overrideKey: string, companyId?: string | null, userId?: string | null) {
    const db = this.prisma as any;
    const row = await db.billingCatalogOverride.findUnique({ where: { key: overrideKey } });
    if (!row) {
      return { ok: false, error: 'CATALOG_OVERRIDE_NOT_FOUND' };
    }
    if (companyId && userId) {
      await this.audit.log(companyId, 'billing.catalog_override.reveal', `Revealed catalog override ${overrideKey}`, userId);
    }
    return {
      ok: true,
      item: {
        key: row.key,
        stripePriceId: row.stripePriceId || null,
        stripeProductId: row.stripeProductId || null,
      },
    };
  }

  async getTenantCommercialControl(tenantId: string) {
    const db = this.prisma as any;
    await this.ensurePlans();
    const company = await db.company.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
    if (!company) throw new NotFoundException('Tenant not found');
    const [settings, subscription, plans, allowance, auditHistory] = await Promise.all([
      db.tenantSetting.findUnique({ where: { tenantId } }),
      db.tenantSubscription.findUnique({ where: { tenantId }, include: { plan: true } }),
      db.plan.findMany({ orderBy: { name: 'asc' } }),
      this.getTenantJobAllowanceControl(tenantId),
      db.auditEvent.findMany({
        where: {
          companyId: tenantId,
          type: {
            in: [
              'platform.tenant_commercial.update',
              'billing.trial.override',
              'billing.pricing_adjustment.upsert',
              'billing.pricing_adjustment.remove',
              'platform.job_allowance.update',
            ],
          },
        },
        select: { id: true, type: true, message: true, userId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    const controls = this.readTenantCommercialControls(settings);
    return {
      ok: true,
      tenant: company,
      plan: subscription?.plan
        ? {
            code: subscription.plan.code,
            name: subscription.plan.name,
            monthlyPriceCents: getPlanBasePriceCents(subscription.plan.code, 'MONTHLY'),
            annualPriceCents: getPlanBasePriceCents(subscription.plan.code, 'ANNUAL'),
          }
        : null,
      interval: settings?.planBillingInterval || DEFAULT_INTERVAL,
      subscription: subscription
        ? {
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            stripeLinked: Boolean(subscription.stripeSubscriptionId),
          }
        : null,
      controls,
      plans: plans.map((plan: any) => ({
        code: plan.code,
        name: plan.name,
        monthlyPriceCents: getPlanBasePriceCents(plan.code, 'MONTHLY'),
        annualPriceCents: getPlanBasePriceCents(plan.code, 'ANNUAL'),
      })),
      allowance,
      auditHistory,
    };
  }

  async updateTenantCommercialControl(tenantId: string, actorUserId: string, input: Record<string, any>) {
    if (input?.confirmation !== true) throw new BadRequestException('Explicit confirmation is required.');
    const reason = String(input?.reason || '').trim();
    if (reason.length < 8) throw new BadRequestException('A specific commercial-change reason is required.');
    const db = this.prisma as any;
    await this.ensurePlans();
    const company = await db.company.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
    if (!company) throw new NotFoundException('Tenant not found');
    const currentSettings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const currentSubscription = await db.tenantSubscription.findUnique({ where: { tenantId }, include: { plan: true } });
    const current = this.readTenantCommercialControls(currentSettings);
    const planCode = String(input?.planCode || '').trim();
    const plan = planCode ? await db.plan.findUnique({ where: { code: planCode } }) : null;
    if (planCode && !plan) throw new BadRequestException('Plan not found');
    const interval = input?.interval === 'ANNUAL' ? 'ANNUAL' : input?.interval === 'MONTHLY' ? 'MONTHLY' : currentSettings?.planBillingInterval || DEFAULT_INTERVAL;
    const normalizeOptionalPrice = (value: unknown, currentValue: number | null) => {
      if (value === undefined) return currentValue;
      if (value === null || value === '') return null;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) throw new BadRequestException('Custom prices must be valid non-negative minor-unit amounts.');
      return Math.round(parsed);
    };
    const next = {
      customMonthlyPriceCents: normalizeOptionalPrice(input?.customMonthlyPriceCents, current.customMonthlyPriceCents),
      customAnnualPriceCents: normalizeOptionalPrice(input?.customAnnualPriceCents, current.customAnnualPriceCents),
      grandfatheredPricing: input?.grandfatheredPricing === undefined ? current.grandfatheredPricing : input.grandfatheredPricing === true,
      paused: input?.paused === undefined ? current.paused : input.paused === true,
      billingNote: input?.billingNote === undefined ? current.billingNote : String(input.billingNote || '').trim().slice(0, 1000) || null,
      updatedAt: new Date().toISOString(),
      updatedByUserId: actorUserId,
    };
    const before = {
      planCode: currentSubscription?.plan?.code || null,
      interval: currentSettings?.planBillingInterval || DEFAULT_INTERVAL,
      ...current,
    };
    const after = {
      planCode: plan?.code || before.planCode,
      interval,
      ...next,
    };
    await db.$transaction(async (tx: any) => {
      const businessConfigJson = this.writeTenantCommercialControls(currentSettings, next);
      await tx.tenantSetting.upsert({
        where: { tenantId },
        create: {
          tenantId,
          businessConfigJson,
          planId: plan?.id || currentSubscription?.planId || null,
          planBillingInterval: interval,
        },
        update: {
          businessConfigJson,
          ...(plan ? { planId: plan.id } : {}),
          planBillingInterval: interval,
        },
      });
      if (plan) {
        await tx.tenantSubscription.upsert({
          where: { tenantId },
          create: {
            tenantId,
            planId: plan.id,
            status: 'active',
          },
          update: { planId: plan.id },
        });
      }
    });
    await this.audit.log(
      tenantId,
      'platform.tenant_commercial.update',
      `Tenant commercial controls changed. Before=${JSON.stringify(before)} After=${JSON.stringify(after)} Reason=${reason.slice(0, 240)}`,
      actorUserId,
    );
    if (plan && currentSubscription?.stripeSubscriptionId) {
      await this.syncStripeSubscriptionPrice(tenantId, 'current');
    }
    return this.getTenantCommercialControl(tenantId);
  }

  async upsertPricingAdjustment(tenantId: string, userId: string, input: PricingAdjustmentDto) {
    if (input.confirmation !== true) throw new BadRequestException('Explicit confirmation is required.');
    this.validatePricingAdjustmentInput(input);
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const pricingAdjustmentJson = this.buildStoredPricingAdjustment(input, userId, settings?.pricingAdjustmentJson);

    await db.tenantSetting.updateMany({
      where: { tenantId },
      data: {
        pricingAdjustmentJson,
        pricingAdjustmentConsumedAt: null,
      },
    });

    await this.audit.log(
      tenantId,
      'billing.pricing_adjustment.upsert',
      `Pricing adjustment ${input.type} ${input.value} (${input.duration}) saved`,
      userId,
    );

    await this.syncStripeSubscriptionPrice(tenantId, 'current');
    return this.getPricingState(tenantId);
  }

  async removePricingAdjustment(tenantId: string, userId: string, input?: Record<string, any>) {
    if (input?.confirmation !== true) throw new BadRequestException('Explicit confirmation is required.');
    const reason = String(input?.reason || '').trim();
    if (reason.length < 8) throw new BadRequestException('A specific pricing-removal reason is required.');
    const db = this.prisma as any;
    await db.tenantSetting.updateMany({
      where: { tenantId },
      data: {
        pricingAdjustmentJson: null,
        pricingAdjustmentConsumedAt: null,
      },
    });

    await this.audit.log(tenantId, 'billing.pricing_adjustment.remove', `Pricing adjustment removed. Reason=${reason.slice(0, 240)}`, userId);
    await this.syncStripeSubscriptionPrice(tenantId, 'standard');
    return this.getPricingState(tenantId);
  }

  async createCheckoutSession(tenantId: string, userId: string, planCode: string, interval: 'MONTHLY' | 'ANNUAL') {
    const commercial = await this.getTenantCommercialControl(tenantId);
    if (commercial.controls.paused) {
      throw new BadRequestException('This workspace commercial account is paused. Existing workspace data remains available.');
    }
    const stripe = this.requireStripe();
    await this.ensurePlans();

    const subscriptionPricing = await this.verifySubscriptionPricing();
    const requestedPrice = (subscriptionPricing.prices || []).find(
      (price: any) => price.planCode === planCode && price.interval === interval,
    );
    if (!requestedPrice || requestedPrice.status !== 'ready') {
      throw new BadRequestException('This subscription price is not ready yet. Review Stripe plan pricing before checkout.');
    }

    const priceId = await this.resolveSubscriptionPriceId(planCode, interval);

    if (!priceId) {
      throw new BadRequestException('Invalid plan or Stripe price not configured');
    }

    const db = this.prisma as any;
    const user = await db.user.findUnique({ where: { id: userId } });
    const subscription = await db.tenantSubscription.findUnique({ where: { tenantId } });
    let customerId = subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user?.email ?? undefined,
        metadata: { tenantId },
      });
      customerId = customer.id;
    }

    const plan = await db.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      throw new BadRequestException('Plan not found');
    }

    const billingSnapshot = await this.getTenantBillingSnapshot(tenantId);
    const pricingState = resolvePricingState({
      planCode,
      planName: plan.name,
      interval,
      currency: billingSnapshot.currency,
      adjustment: billingSnapshot.settings?.pricingAdjustmentJson,
      consumedAt: billingSnapshot.settings?.pricingAdjustmentConsumedAt,
      basePriceCentsOverride: interval === 'ANNUAL'
        ? billingSnapshot.commercialControls.customAnnualPriceCents
        : billingSnapshot.commercialControls.customMonthlyPriceCents,
    });
    const adjustedStripePrice =
      pricingState.adjustment?.isActive && pricingState.adjustedPriceCents !== pricingState.basePriceCents
        ? await this.createAdjustedStripePrice(planCode, interval, pricingState.adjustedPriceCents, pricingState.currency)
        : null;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: adjustedStripePrice?.id || priceId, quantity: 1 }],
      client_reference_id: tenantId,
      success_url: `${this.getReturnUrl()}?checkout=success`,
      cancel_url: `${this.getReturnUrl()}?checkout=cancel`,
      metadata: {
        tenantId,
        planCode,
        interval,
        pricingAdjustmentType: pricingState.adjustment?.type || '',
        pricingAdjustmentDuration: pricingState.adjustment?.duration || '',
        pricingAdjustedPriceCents: String(pricingState.adjustedPriceCents),
      },
      subscription_data: {
        metadata: {
          tenantId,
          planCode,
          interval,
          pricingAdjustmentType: pricingState.adjustment?.type || '',
          pricingAdjustmentDuration: pricingState.adjustment?.duration || '',
          pricingAdjustedPriceCents: String(pricingState.adjustedPriceCents),
        },
      },
    });

    const defaultPlan =
      billingSnapshot.plan ??
      (await db.plan.findUnique({ where: { code: DEFAULT_PLAN_CODE } })) ??
      plan;
    await db.tenantSubscription.upsert({
      where: { tenantId },
      update: { stripeCustomerId: customerId },
      create: {
        tenantId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: null,
        planId: defaultPlan.id,
        status: 'trialing',
        trialStartedAt: null,
        trialEndsAt: null,
      },
    });

    await this.audit.log(tenantId, 'billing.checkout', `Checkout session created for plan ${planCode}`, userId);

    return { url: session.url };
  }

  async createJobCompletionPackCheckoutSession(tenantId: string, userId: string, packCode: string) {
    const commercial = await this.getTenantCommercialControl(tenantId);
    if (commercial.controls.paused) {
      throw new BadRequestException('This workspace commercial account is paused. Existing workspace data remains available.');
    }
    const stripe = this.requireStripe();
    const definition = this.resolveJobCompletionPackDefinition(packCode);
    if (!definition) {
      throw new BadRequestException('Unknown job completion pack');
    }

    const storedSnapshot = (await this.readStoredJobCompletionPackSnapshot()) || (await this.syncJobCompletionPackCatalog({ dryRun: true }));
    if (!this.isJobCompletionPackCheckoutReady(storedSnapshot)) {
      throw new BadRequestException('Extra job packs are not ready for checkout yet.');
    }

    const pack = storedSnapshot.packs.find((entry) => entry.code === definition.code);
    if (!pack?.priceId || pack.status !== 'ready' || !pack.active) {
      throw new BadRequestException('This extra job pack is not ready for checkout yet.');
    }

    const db = this.prisma as any;
    const user = await db.user.findUnique({ where: { id: userId } });
    const subscription = await db.tenantSubscription.findUnique({ where: { tenantId } });
    let customerId = subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user?.email ?? undefined,
        metadata: { tenantId },
      });
      customerId = customer.id;
      await db.tenantSubscription.upsert({
        where: { tenantId },
        update: { stripeCustomerId: customerId },
        create: {
          tenantId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: null,
          planId: (await db.plan.findUnique({ where: { code: DEFAULT_PLAN_CODE } }))?.id,
          status: 'inactive',
        },
      });
    }

    const periodStart = this.getCurrentBillingPeriodStart();
    const periodEnd = this.getCurrentBillingPeriodEnd(periodStart);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{ price: pack.priceId, quantity: 1 }],
      client_reference_id: tenantId,
      success_url: `${this.getReturnUrl()}?packCheckout=success`,
      cancel_url: `${this.getReturnUrl()}?packCheckout=cancel`,
      metadata: {
        type: 'job_completion_pack',
        tenantId,
        packCode: definition.code,
        jobCompletionCount: String(definition.jobCount),
        amountCents: String(definition.amountCents),
        purchasePeriodStart: periodStart.toISOString(),
        purchasePeriodEnd: periodEnd.toISOString(),
      },
      payment_intent_data: {
        metadata: {
          type: 'job_completion_pack',
          tenantId,
          packCode: definition.code,
          jobCompletionCount: String(definition.jobCount),
        },
      },
    });

    await db.jobCompletionPackPurchase.create({
      data: {
        tenantId,
        packCode: definition.code,
        status: 'pending',
        checkoutSessionId: String(session.id || '').trim(),
        stripePaymentIntentId: String(session.payment_intent || '').trim() || null,
        productId: pack.productId || null,
        priceId: pack.priceId,
        currency: storedSnapshot.expectedCurrency,
        amountCents: definition.amountCents,
        jobCompletionCount: definition.jobCount,
        purchasePeriodStart: periodStart,
        expiresAt: periodEnd,
        metadataJson: {
          source: 'stripe_checkout',
        },
      },
    });

    await this.audit.log(tenantId, 'billing.job_completion_pack.checkout', `Checkout session created for ${definition.code}`, userId);
    return { url: session.url };
  }

  async createBillingPortal(tenantId: string, userId: string) {
    const stripe = this.requireStripe();
    const db = this.prisma as any;
    const subscription = await db.tenantSubscription.findUnique({ where: { tenantId } });
    if (!subscription?.stripeCustomerId) {
      throw new BadRequestException('No Stripe customer configured for this tenant');
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: this.getReturnUrl(),
    });

    await this.audit.log(tenantId, 'billing.portal', 'Billing portal opened', userId);
    return { url: portal.url };
  }

  async createJobPaymentSession(tenantId: string, jobId: string, token: string) {
    void tenantId;
    void jobId;
    void token;
    throw new BadRequestException(
      'Online payment is not available for this invoice. Please contact the business.',
    );
  }

  private normalizeBookingPaymentState(paymentStateJson: any) {
    return paymentStateJson && typeof paymentStateJson === 'object' ? { ...paymentStateJson } : {};
  }

  private summarizeBookingDepositRefundState(paymentStateJson: any) {
    const paymentState = this.normalizeBookingPaymentState(paymentStateJson);
    const paidCents = Math.max(0, Number(paymentState.depositPaidCents || paymentState.depositDueCents || 0));
    const refundedCents = Math.max(0, Number(paymentState.refundedAmountCents || 0));
    const pendingRefundCents = Math.max(0, Number(paymentState.depositRefundPendingAmountCents || 0));
    const pendingRequestedCents = Math.max(0, Number(paymentState.depositRefundRequestedAmountCents || pendingRefundCents || 0));
    return {
      paidCents,
      refundedCents,
      pendingRefundCents,
      pendingRequestedCents,
      remainingPaidCents: Math.max(0, paidCents - refundedCents - pendingRefundCents),
      status: String(paymentState.depositRefundStatus || '').trim() || null,
      label: String(paymentState.depositRefundStatusLabel || '').trim() || null,
    };
  }

  private appendUniqueStateList(values: unknown, nextValue?: string | null) {
    const items = Array.isArray(values)
      ? values.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    const normalized = String(nextValue || '').trim();
    return normalized ? Array.from(new Set([...items, normalized])) : Array.from(new Set(items));
  }

  private async resolveBookingDepositCheckoutTarget(input: {
    companyId?: string | null;
    bookingId?: string | null;
    publicStatusToken?: string | null;
    checkoutSessionId?: string | null;
    paymentIntentId?: string | null;
  }) {
    const db = this.prisma as any;
    const companyId = String(input.companyId || '').trim();
    const bookingId = String(input.bookingId || '').trim();
    const publicStatusToken = String(input.publicStatusToken || '').trim();
    const checkoutSessionId = String(input.checkoutSessionId || '').trim();
    const paymentIntentId = String(input.paymentIntentId || '').trim();

    if (companyId && bookingId) {
      const direct = await db.booking.findFirst({
        where: { id: bookingId, companyId },
        select: { id: true, companyId: true, publicStatusToken: true, paymentStateJson: true },
      });
      if (direct) return direct;
    }

    if (checkoutSessionId) {
      const bySession = await db.booking.findFirst({
        where: {
          ...(companyId ? { companyId } : {}),
          paymentStateJson: {
            path: ['stripeCheckoutSessionId'],
            equals: checkoutSessionId,
          },
        },
        select: { id: true, companyId: true, publicStatusToken: true, paymentStateJson: true },
      });
      if (bySession) return bySession;
    }

    if (paymentIntentId) {
      const byIntent = await db.booking.findFirst({
        where: {
          ...(companyId ? { companyId } : {}),
          paymentStateJson: {
            path: ['stripePaymentIntentId'],
            equals: paymentIntentId,
          },
        },
        select: { id: true, companyId: true, publicStatusToken: true, paymentStateJson: true },
      });
      if (byIntent) return byIntent;
    }

    if (publicStatusToken) {
      const byStatusToken = await db.booking.findFirst({
        where: {
          ...(companyId ? { companyId } : {}),
          publicStatusToken,
        },
        select: { id: true, companyId: true, publicStatusToken: true, paymentStateJson: true },
      });
      if (byStatusToken) return byStatusToken;
    }

    return null;
  }

  private async resolveBookingDepositRefundTarget(input: {
    companyId?: string | null;
    bookingId?: string | null;
    publicStatusToken?: string | null;
    paymentIntentId?: string | null;
    refundId?: string | null;
  }) {
    const direct = await this.resolveBookingDepositCheckoutTarget({
      companyId: input.companyId,
      bookingId: input.bookingId,
      publicStatusToken: input.publicStatusToken,
      paymentIntentId: input.paymentIntentId,
    });
    if (direct) return direct;

    const db = this.prisma as any;
    const companyId = String(input.companyId || '').trim();
    const refundId = String(input.refundId || '').trim();
    if (refundId) {
      const byRefundId = await db.booking.findFirst({
        where: {
          ...(companyId ? { companyId } : {}),
          paymentStateJson: {
            path: ['stripeRefundId'],
            equals: refundId,
          },
        },
        select: { id: true, companyId: true, publicStatusToken: true, paymentStateJson: true },
      });
      if (byRefundId) return byRefundId;
    }

    return null;
  }

  async createBookingDepositCheckoutSession(tenantId: string, bookingId: string) {
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({
      where: { id: bookingId, companyId: tenantId },
      select: {
        id: true,
        companyId: true,
        publicStatusToken: true,
        customerEmail: true,
        status: true,
        pricingSnapshotJson: true,
        paymentStateJson: true,
      },
    });
    if (!booking) throw new NotFoundException('Booking not found.');

    const paymentState = this.normalizeBookingPaymentState(booking.paymentStateJson);
    const depositDueCents = Math.max(0, Number(paymentState.depositDueCents || booking.pricingSnapshotJson?.depositDueCents || 0));
    if (!depositDueCents) {
      throw new BadRequestException('No online deposit is due for this booking.');
    }
    if (String(paymentState.depositStatus || '').toLowerCase() === 'paid') {
      return {
        actionUrl: null,
        status: 'paid',
        message: 'Deposit paid.',
      };
    }

    if (!this.stripeConnect) {
      throw new BadRequestException('Online payment is not available for this booking. Please contact the business.');
    }
    const client = await this.resolveTenantStripeConnectClient(tenantId);
    if (!client.ok || !(await this.refreshTenantStripeCheckoutReadiness(tenantId, { force: true }))) {
      throw new BadRequestException('Online payment is not available for this booking. Please contact the business.');
    }

    const existingSessionId = String(paymentState.stripeCheckoutSessionId || '').trim();
    if (existingSessionId && ['checkout_required', 'pending'].includes(String(paymentState.depositStatus || '').toLowerCase())) {
      const existing = await this.stripeConnect.checkout.sessions.retrieve(existingSessionId, {
        stripeAccount: client.connectedAccountId,
      }).catch(() => null);
      if (existing?.url && existing.status === 'open') {
        return {
          actionUrl: existing.url,
          status: 'checkout_required',
          checkoutReference: this.maskProviderReference(existing.id),
        };
      }
    }

    const publicStatusToken = String(booking.publicStatusToken || '').trim();
    if (!publicStatusToken) throw new BadRequestException('Booking payment link is not available.');
    const currency = String(booking.pricingSnapshotJson?.currency || paymentState.currency || DEFAULT_WORKSPACE_CURRENCY).toLowerCase();
    const attempt = Math.max(1, Number(paymentState.checkoutAttempt || 0) + 1);
    const idempotencyKey = `booking-deposit:${tenantId}:${booking.id}:${attempt}`;
    const session = await this.stripeConnect.checkout.sessions.create(
      {
        mode: 'payment',
        success_url: buildAppUrl(`/portal/booking/status/${publicStatusToken}?payment=processing`),
        cancel_url: buildAppUrl(`/portal/booking/status/${publicStatusToken}?payment=cancelled`),
        client_reference_id: booking.id,
        customer_email: String(booking.customerEmail || '').trim() || undefined,
        payment_intent_data: {
          metadata: {
            type: 'booking_deposit',
            tenantId,
            bookingId: booking.id,
            publicStatusToken,
          },
        },
        metadata: {
          type: 'booking_deposit',
          tenantId,
          bookingId: booking.id,
          publicStatusToken,
        },
        line_items: [{
          quantity: 1,
          price_data: {
            currency,
            unit_amount: depositDueCents,
            product_data: {
              name: 'Booking deposit',
              metadata: { tenantId, bookingId: booking.id },
            },
          },
        }],
      },
      {
        stripeAccount: client.connectedAccountId,
        idempotencyKey,
      },
    );

    await db.booking.update({
      where: { id: booking.id },
      data: {
        status: 'PENDING',
        paymentStateJson: {
          ...paymentState,
          provider: 'STRIPE',
          providerStatus: 'connected',
          collectionState: 'ready_for_checkout',
          depositStatus: 'checkout_required',
          depositStatusLabel: 'Deposit due',
          stripeCheckoutSessionId: session.id,
          checkoutAttempt: attempt,
          checkoutCreatedAt: new Date().toISOString(),
          currency: currency.toUpperCase(),
          note: 'Deposit payment is required to confirm the booking.',
        },
      },
    });
    await this.audit.log(tenantId, 'booking.deposit.checkout_created', `Created tenant Stripe checkout for booking ${booking.id}`, null);
    return {
      actionUrl: session.url || null,
      status: 'checkout_required',
      checkoutReference: this.maskProviderReference(session.id),
    };
  }

  async isTenantBookingDepositCheckoutReady(tenantId: string) {
    return this.refreshTenantStripeCheckoutReadiness(tenantId, { force: true });
  }

  async getJobPaymentStatus(tenantId: string, jobId: string, sessionId: string) {
    const stripe = this.requireStripeConnect();
    const client = await this.resolveTenantStripeConnectClient(tenantId);
    if (!client.ok || !(await this.refreshTenantStripeCheckoutReadiness(tenantId, { force: true }))) {
      throw new BadRequestException('Online payment is not available for this invoice. Please contact the business.');
    }
    const db = this.prisma as any;
    const job = await db.job.findFirst({
      where: { id: jobId, companyId: tenantId },
      include: {
        lineItems: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!job) {
      throw new BadRequestException('Job not found');
    }

    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      { expand: ['payment_intent'] },
      { stripeAccount: client.connectedAccountId },
    );

    if (session.metadata?.jobId && session.metadata.jobId !== jobId) {
      throw new BadRequestException('Session does not match this job');
    }

    let receiptUrl: string | null = null;
    const paymentIntent = session.payment_intent as Stripe.PaymentIntent | null;
    const charge = (paymentIntent as any)?.charges?.data?.[0];
    if (charge?.receipt_url) {
      receiptUrl = charge.receipt_url;
    }

    if (session.payment_status === 'paid' && !job.invoicePaidAt) {
      const paidAt = new Date();
      await db.job.update({
        where: { id: jobId },
        data: {
          invoicePaidAt: paidAt,
          invoiceIssuedAt: job.invoiceIssuedAt ?? paidAt,
          paymentReceiptUrl: receiptUrl,
        },
      });
      await this.audit.log(tenantId, 'portal.payment.complete', `Payment received for job ${job.jobRef}`, null);
      await this.logBillingActivity(tenantId, jobId, null, 'billing.payment.received', 'Payment received through the customer portal', {
        receiptUrl,
        source: 'portal_payment_status',
      });
      await this.resolveBillingFollowUp(tenantId, null, jobId, 'payment_received');
      if (isNotificationsV1Enabled()) {
        await this.notifications.notifyPaymentReceived(tenantId, jobId);
      }
      await this.maybeQueueReviewRequest(tenantId, jobId);
    }

    return {
      status: session.payment_status,
      receiptUrl,
    };
  }

  async getBillingInfo(tenantId: string, options?: { includeInternalPricingControls?: boolean; syncTrialLifecycleEmails?: boolean }) {
    await this.ensurePlans();
    const snapshot = await this.getTenantBillingSnapshot(tenantId);
    const settings = snapshot.settings;
    const subscription = snapshot.subscription;
    const plan = snapshot.plan;
    const trial = this.buildTrialState(subscription);
    const jobCompletionPacks = await this.getJobCompletionPackCatalogSummary();
    const subscriptionPricingReadiness = await this.verifySubscriptionPricing();
    const includedAllowance =
      Number(plan?.featuresJson?.completed_jobs_monthly_limit || 0) ||
      Number(PLAN_DEFINITIONS[(plan?.code as keyof typeof PLAN_DEFINITIONS) || DEFAULT_PLAN_CODE].features.completed_jobs_monthly_limit || 0) ||
      null;
    const jobCompletionAllowance = await this.getJobCompletionAllowanceSummary(tenantId, { includedAllowance });

    if (options?.syncTrialLifecycleEmails !== false) {
      await this.notifications.syncTrialLifecycleEmail(tenantId, trial);
    }

    const pricingTiers = getPricingModelSummary().tiers.map((tier) => ({
      ...tier,
      configuredIntervals:
        tier.checkoutMode === 'stripe_checkout'
          ? {
              MONTHLY: Boolean(this.priceIdFor(tier.code, 'MONTHLY')),
              ANNUAL: Boolean(this.priceIdFor(tier.code, 'ANNUAL')),
            }
          : {
              MONTHLY: false,
              ANNUAL: false,
            },
    }));
    const paymentCollection = buildPaymentCollectionOptions({
      paymentsEnabled: settings?.paymentsEnabled,
      stripeConfigured: this.isStripeConfigured(),
      settings,
      providerStatuses: await this.resolveCustomerCollectionStatuses(tenantId),
    });

    return {
      plan: plan
        ? {
            code: plan.code,
            name: plan.name,
            completedJobsPerMonth: Number(plan.featuresJson?.completed_jobs_monthly_limit || 0) || null,
            completedJobsLabel: String(plan.featuresJson?.completed_jobs_monthly_label || '').trim() || null,
            extraJobCompletionPacksStatus: String(plan.featuresJson?.extra_job_completion_packs_status || '').trim() || 'coming_soon',
          }
        : {
            code: DEFAULT_PLAN_CODE,
            name: PLAN_DEFINITIONS[DEFAULT_PLAN_CODE].name,
            completedJobsPerMonth: PLAN_DEFINITIONS[DEFAULT_PLAN_CODE].packaging.completedJobsPerMonth,
            completedJobsLabel: PLAN_DEFINITIONS[DEFAULT_PLAN_CODE].packaging.completedJobsLabel,
            extraJobCompletionPacksStatus: PLAN_DEFINITIONS[DEFAULT_PLAN_CODE].packaging.extraJobCompletionPacks.status,
          },
      subscription: subscription
        ? {
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : { status: 'inactive', currentPeriodEnd: null, cancelAtPeriodEnd: false },
      trial,
      interval: settings?.planBillingInterval ?? DEFAULT_INTERVAL,
      stripeConfigured: this.isStripeConfigured(),
      paymentCollection,
      tenantPaymentReadiness: await this.getTenantPaymentProviderReadiness(tenantId),
      providerCanaries: buildPaymentProviderCanaryFramework(paymentCollection),
      pricingModel: {
        tiers: pricingTiers,
        usageTracking: {
          authoritative: true,
          message: 'Included allowance is tracked live. Extra pack allowance only lands after confirmed Stripe webhook events.',
        },
        subscriptionPricingReadiness,
      },
      jobCompletionPacks,
      jobCompletionAllowance,
    };
  }

  async updatePaymentCollectionOptions(tenantId: string, userId: string, input: UpdatePaymentCollectionDto) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const current = readPaymentCollectionConfig(settings);
    const preferredProvider = input.preferredProvider || current.preferredProvider || 'MANUAL';
    const requestedProviders = Array.isArray(input.requestedProviders)
      ? Array.from(new Set(input.requestedProviders.map((provider) => String(provider).trim().toUpperCase()))).filter((provider) => ['SUMUP', 'WORLDPAY'].includes(provider))
      : current.requestedProviders;

    const businessConfigJson = writePaymentCollectionConfig(settings, {
      preferredProvider: preferredProvider as 'STRIPE' | 'MANUAL' | 'SUMUP' | 'WORLDPAY',
      requestedProviders: requestedProviders as Array<'SUMUP' | 'WORLDPAY'>,
    });

    await db.tenantSetting.upsert({
      where: { tenantId },
      update: { businessConfigJson },
      create: {
        tenantId,
        businessConfigJson,
      },
    });

    await this.audit.log(
      tenantId,
      'billing.payment_collection.update',
      `Customer payment collection updated to ${preferredProvider}${requestedProviders.length ? ` with requested providers ${requestedProviders.join(', ')}` : ''}`,
      userId,
    );
    this.tenantStripeReadinessCache.delete(tenantId);

    return buildPaymentCollectionOptions({
      paymentsEnabled: settings?.paymentsEnabled,
      stripeConfigured: this.isStripeConfigured(),
      settings: { ...(settings || {}), businessConfigJson },
      providerStatuses: await this.resolveCustomerCollectionStatuses(tenantId),
    });
  }

  async updateTrialState(tenantId: string, userId: string, input: TrialOverrideDto) {
    if (input.confirmation !== true) throw new BadRequestException('Explicit confirmation is required.');
    const reason = String(input.reason || '').trim();
    if (reason.length < 8) throw new BadRequestException('A specific trial-change reason is required.');
    const db = this.prisma as any;
    await this.ensurePlans();
    const tenant = await db.company.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const defaultPlan =
      await db.plan.findUnique({ where: { code: DEFAULT_PLAN_CODE } }) ??
      await db.plan.findFirst();
    if (!defaultPlan) {
      throw new BadRequestException('Billing plans are not configured');
    }

    const existing = await db.tenantSubscription.findUnique({ where: { tenantId } });
    const action = input.action || 'set';
    const now = new Date();
    if (existing?.stripeSubscriptionId && action !== 'set') {
      throw new BadRequestException('Trial lifecycle controls are only available before Stripe billing starts');
    }
    if (action === 'pause') {
      if (!existing?.trialEndsAt || existing.trialEndsAt.getTime() <= now.getTime() || existing.status !== 'trialing') {
        throw new BadRequestException('Only an active trial can be paused.');
      }
      const remainingSeconds = Math.max(1, Math.ceil((existing.trialEndsAt.getTime() - now.getTime()) / 1000));
      await db.tenantSubscription.update({
        where: { tenantId },
        data: {
          status: 'trial_paused',
          trialPausedAt: now,
          trialPausedRemainingSeconds: remainingSeconds,
          currentPeriodEnd: null,
        },
      });
      await this.audit.log(
        tenantId,
        'billing.trial.pause',
        `Trial changed. Before=${JSON.stringify({ status: existing.status, endsAt: existing.trialEndsAt })} After=${JSON.stringify({ status: 'trial_paused', remainingSeconds })} Reason=${reason.slice(0, 240)}`,
        userId,
      );
      return this.getBillingInfo(tenantId, { syncTrialLifecycleEmails: false });
    }
    if (action === 'resume') {
      if (existing?.status !== 'trial_paused' || !existing.trialPausedRemainingSeconds) {
        throw new BadRequestException('Only a paused trial can be resumed.');
      }
      const resumedEndsAt = new Date(now.getTime() + Math.max(1, existing.trialPausedRemainingSeconds) * 1000);
      await db.tenantSubscription.update({
        where: { tenantId },
        data: {
          status: 'trialing',
          trialEndsAt: resumedEndsAt,
          trialPausedAt: null,
          trialPausedRemainingSeconds: null,
          currentPeriodEnd: resumedEndsAt,
        },
      });
      await this.audit.log(
        tenantId,
        'billing.trial.resume',
        `Trial changed. Before=${JSON.stringify({ status: existing.status, pausedAt: existing.trialPausedAt })} After=${JSON.stringify({ status: 'trialing', endsAt: resumedEndsAt })} Reason=${reason.slice(0, 240)}`,
        userId,
      );
      return this.getBillingInfo(tenantId, { syncTrialLifecycleEmails: false });
    }
    if (action === 'expire') {
      await db.tenantSubscription.upsert({
        where: { tenantId },
        update: {
          planId: existing?.planId || defaultPlan.id,
          status: 'active',
          trialEndsAt: now,
          trialPausedAt: null,
          trialPausedRemainingSeconds: null,
          currentPeriodEnd: null,
        },
        create: {
          tenantId,
          planId: defaultPlan.id,
          status: 'active',
          trialStartedAt: now,
          trialEndsAt: now,
        },
      });
      await this.audit.log(
        tenantId,
        'billing.trial.expire',
        `Trial changed. Before=${JSON.stringify({ status: existing?.status || null, endsAt: existing?.trialEndsAt || null })} After=${JSON.stringify({ status: 'active', endsAt: now })} Reason=${reason.slice(0, 240)}`,
        userId,
      );
      return this.getBillingInfo(tenantId, { syncTrialLifecycleEmails: false });
    }
    const extendedEndsAt = action === 'extend'
      ? new Date(Math.max(now.getTime(), existing?.trialEndsAt?.getTime() || 0) + Math.max(1, Number(input.extendDays || 0)) * 86_400_000)
      : null;
    const startedAt = input.startedAt ? new Date(input.startedAt) : input.endsAt === null ? null : existing?.trialStartedAt || now;
    const endsAt = extendedEndsAt || (input.endsAt === null || input.endsAt === undefined ? null : new Date(input.endsAt));
    if (startedAt && Number.isNaN(startedAt.getTime())) {
      throw new BadRequestException('Trial start must be a valid date');
    }
    if (endsAt && Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Trial end must be a valid date');
    }
    if (startedAt && endsAt && endsAt.getTime() <= startedAt.getTime()) {
      throw new BadRequestException('Trial end must be after trial start');
    }
    if (existing?.stripeSubscriptionId && endsAt) {
      throw new BadRequestException('Trial overrides are only available before Stripe billing starts');
    }

    const nextStatus = endsAt && endsAt.getTime() > Date.now()
      ? 'trialing'
      : existing?.stripeSubscriptionId
        ? existing?.status || 'active'
        : 'active';
    const nextCurrentPeriodEnd = nextStatus === 'trialing'
      ? endsAt
      : existing?.stripeSubscriptionId
        ? existing?.currentPeriodEnd ?? null
        : null;

    await db.tenantSubscription.upsert({
      where: { tenantId },
      update: {
        planId: existing?.planId || defaultPlan.id,
        status: nextStatus,
        trialStartedAt: endsAt ? startedAt : null,
        trialEndsAt: endsAt,
        trialPausedAt: null,
        trialPausedRemainingSeconds: null,
        currentPeriodEnd: nextCurrentPeriodEnd,
      },
      create: {
        tenantId,
        planId: defaultPlan.id,
        status: nextStatus,
        trialStartedAt: endsAt ? startedAt : null,
        trialEndsAt: endsAt,
        trialPausedAt: null,
        trialPausedRemainingSeconds: null,
        currentPeriodEnd: nextCurrentPeriodEnd,
      },
    });

    await this.audit.log(
      tenantId,
      'billing.trial.override',
      `Trial changed from ${existing?.trialEndsAt?.toISOString?.() || 'none'} to ${endsAt?.toISOString() || 'none'}. Reason=${reason.slice(0, 240)}`,
      userId,
    );

    return this.getBillingInfo(tenantId, { syncTrialLifecycleEmails: false });
  }

  async getFinanceReport(tenantId: string, query: FinanceReportQueryDto) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const financeConfig = this.getFinanceConfig(settings);
    const from = query?.from ? new Date(query.from) : null;
    const to = query?.to ? new Date(query.to) : null;
    const createdAt: Record<string, Date> = {};
    if (from && !Number.isNaN(from.getTime())) createdAt.gte = from;
    if (to && !Number.isNaN(to.getTime())) {
      const endOfDay = new Date(to);
      endOfDay.setUTCHours(23, 59, 59, 999);
      createdAt.lte = endOfDay;
    }

    const jobs = await db.job.findMany({
      where: {
        companyId: tenantId,
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
        OR: [
          { invoiceIssuedAt: { not: null } },
          { invoicePaidAt: { not: null } },
          { totalCents: { gt: 0 } },
        ],
      },
      select: {
        id: true,
        jobRef: true,
        customerId: true,
        customerName: true,
        totalCents: true,
        subtotalCents: true,
        taxCents: true,
        taxRateBps: true,
        currency: true,
        status: true,
        invoiceNumber: true,
        invoiceIssuedAt: true,
        invoiceDueAt: true,
        invoicePaidAt: true,
        createdAt: true,
      },
      orderBy: [{ invoiceIssuedAt: 'desc' }, { createdAt: 'desc' }],
    });
    const jobIds = jobs.map((job: any) => job.id);
    const billingActivities = jobIds.length
      ? await db.jobActivity.findMany({
          where: {
            companyId: tenantId,
            jobId: { in: jobIds },
            eventType: {
              in: ['billing.refund.recorded', 'billing.adjustment.recorded'],
            },
          },
          select: {
            jobId: true,
            payloadJson: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const customerIds = Array.from(new Set(jobs.map((job: any) => String(job.customerId || '')).filter(Boolean)));
    const customers = customerIds.length
      ? await db.customer.findMany({
          where: { companyId: tenantId, id: { in: customerIds } },
          select: { id: true, name: true },
        })
      : [];
    const customerMap = new Map(customers.map((customer: any) => [customer.id, customer]));
    const billingActivitiesByJobId = new Map<string, any[]>();
    for (const activity of billingActivities) {
      const current = billingActivitiesByJobId.get(activity.jobId) || [];
      current.push(activity);
      billingActivitiesByJobId.set(activity.jobId, current);
    }

    const paymentRequests = jobIds.length
      ? await db.customerPaymentRequest.findMany({
          where: { tenantId, jobId: { in: jobIds }, cancelledAt: null },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        })
      : [];
    const latestPaymentRequestByJobId = new Map<string, any>();
    for (const request of paymentRequests) {
      if (!latestPaymentRequestByJobId.has(request.jobId)) {
        latestPaymentRequestByJobId.set(request.jobId, request);
      }
    }

    const now = Date.now();
    const agingBuckets: Record<string, { label: string; amountCents: number; count: number }> = {
      current: { label: 'Current', amountCents: 0, count: 0 },
      '1_30': { label: '1-30 days', amountCents: 0, count: 0 },
      '31_60': { label: '31-60 days', amountCents: 0, count: 0 },
      '61_90': { label: '61-90 days', amountCents: 0, count: 0 },
      '90_plus': { label: '90+ days', amountCents: 0, count: 0 },
    };
    const totalsByCurrency = new Map<string, { invoicedCents: number; paidCents: number; unpaidCents: number; overdueCents: number; taxCents: number; grossCents: number }>();
    const customerBalances = new Map<string, { customerId: string; customerName: string; currency: string; unpaidCents: number; overdueCents: number; invoiceCount: number; overdueCount: number }>();
    const bookingDepositsRaw = await db.booking.findMany({
      where: {
        companyId: tenantId,
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
      },
      select: {
        id: true,
        customerName: true,
        startsAt: true,
        createdAt: true,
        pricingSnapshotJson: true,
        paymentStateJson: true,
      },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
    });

    const rows = jobs.map((job: any) => {
      const currency = String(job.currency || settings?.defaultCurrency || 'GBP').toUpperCase();
      const customer = (job.customerId ? customerMap.get(job.customerId) : null) as any;
      const invoiceDate = job.invoiceIssuedAt || job.createdAt || null;
      const grossCents = Math.max(0, Number(job.totalCents || 0));
      const netAmountCents = Math.max(0, Number(job.subtotalCents || Math.max(grossCents - Number(job.taxCents || 0), 0)));
      const taxAmountCents = Math.max(0, Number(job.taxCents || 0));
      const paid = Boolean(job.invoicePaidAt);
      const issued = Boolean(job.invoiceIssuedAt);
      const activitySummary = this.summarizeBillingActivities(billingActivitiesByJobId.get(job.id) || []);
      const effectiveGrossCents = Math.max(0, grossCents + activitySummary.adjustmentDebitCents - activitySummary.adjustmentCreditCents);
      const netCollectedCents = paid ? Math.max(0, grossCents - activitySummary.refundRecordedCents) : 0;
      const unpaidCents = issued ? Math.max(0, effectiveGrossCents - netCollectedCents) : 0;
      const dueAt = job.invoiceDueAt ? new Date(job.invoiceDueAt) : null;
      const daysOverdue =
        dueAt && unpaidCents > 0
          ? Math.floor((now - dueAt.getTime()) / (24 * 60 * 60 * 1000))
          : 0;
      const agingBucket = this.calculateAgingBucket(daysOverdue);
      const overdue = unpaidCents > 0 && daysOverdue > 0;
      const hasRecordedRefund = activitySummary.refundRecordedCents > 0;
      const hasPendingRefund = activitySummary.refundPendingCents > 0;
      const hasAdjustment = activitySummary.adjustmentCreditCents > 0 || activitySummary.adjustmentDebitCents > 0;
      const nextAction = !issued
        ? 'Issue invoice'
        : hasPendingRefund
          ? 'Await refund settlement'
          : paid && unpaidCents === 0 && !hasRecordedRefund && !hasAdjustment
            ? 'Paid'
            : overdue
              ? 'Follow up overdue payment'
              : paid && hasRecordedRefund
                ? 'Review refund outcome'
                : hasAdjustment
                  ? 'Review adjusted balance'
                  : 'Await payment';
      const status =
        hasPendingRefund
          ? 'pending_refund'
          : paid && hasRecordedRefund && unpaidCents === 0 && activitySummary.refundRecordedCents >= effectiveGrossCents
            ? 'refunded'
            : paid && hasRecordedRefund
              ? 'partially_refunded'
              : hasAdjustment && unpaidCents > 0
                ? overdue
                  ? 'overdue'
                  : 'adjusted'
                : paid && unpaidCents === 0
                  ? 'paid'
                  : issued
                    ? overdue
                      ? 'overdue'
                      : 'money_owed'
                  : 'draft';
      const paymentRequest = latestPaymentRequestByJobId.get(job.id) || null;
      const manualReviewNeeded = Boolean(
        paymentRequest &&
          ['paid', 'partial_manual', 'provider_attention', 'payment_failed'].includes(String(paymentRequest.status || '')) &&
          !paymentRequest.reviewedAt,
      );
      const row = {
        id: job.id,
        jobId: job.id,
        jobRef: job.jobRef,
        customerId: job.customerId || null,
        customerName: customer?.name || job.customerName || 'Customer',
        invoiceNumber: this.buildInvoiceNumber(job, financeConfig.invoiceNumberPrefix),
        invoiceDate,
        dueAt,
        paidAt: job.invoicePaidAt || null,
        status,
        nextAction,
        agingBucket,
        daysOverdue: overdue ? daysOverdue : 0,
        netAmountCents,
        taxAmountCents,
        grossAmountCents: effectiveGrossCents,
        unpaidAmountCents: unpaidCents,
        currency,
        vatRateBps: Number(job.taxRateBps || 0),
        vatCategory: Number(job.taxCents || 0) > 0 ? financeConfig.defaultVatCategory || 'standard' : null,
        refundedAmountCents: activitySummary.refundRecordedCents,
        pendingRefundAmountCents: activitySummary.refundPendingCents,
        adjustmentCreditCents: activitySummary.adjustmentCreditCents,
        adjustmentDebitCents: activitySummary.adjustmentDebitCents,
        paymentRequestStatus: paymentRequest?.status || null,
        paymentMethod: paymentRequest?.manualMethod || null,
        amountReceivedCents: paymentRequest?.amountReceivedCents == null ? null : Number(paymentRequest.amountReceivedCents || 0),
        evidenceAttached: Boolean(paymentRequest?.evidenceArtifactId),
        reconciliationReviewNeeded: manualReviewNeeded,
      };

      const totals = totalsByCurrency.get(currency) || {
        invoicedCents: 0,
        paidCents: 0,
        unpaidCents: 0,
        overdueCents: 0,
        taxCents: 0,
        grossCents: 0,
      };
      totals.invoicedCents += issued ? effectiveGrossCents : 0;
      totals.paidCents += netCollectedCents;
      totals.unpaidCents += unpaidCents;
      totals.overdueCents += overdue ? unpaidCents : 0;
      totals.taxCents += taxAmountCents;
      totals.grossCents += effectiveGrossCents;
      totalsByCurrency.set(currency, totals);

      if (unpaidCents > 0) {
        agingBuckets[agingBucket].amountCents += unpaidCents;
        agingBuckets[agingBucket].count += 1;
        const customerKey = `${row.customerId || row.customerName}:${currency}`;
        const balance = customerBalances.get(customerKey) || {
          customerId: row.customerId || '',
          customerName: row.customerName,
          currency,
          unpaidCents: 0,
          overdueCents: 0,
          invoiceCount: 0,
          overdueCount: 0,
        };
        balance.unpaidCents += unpaidCents;
        balance.invoiceCount += 1;
        if (overdue) {
          balance.overdueCents += unpaidCents;
          balance.overdueCount += 1;
        }
        customerBalances.set(customerKey, balance);
      }

      return row;
    });

    const bookingDepositTotalsByCurrency = new Map<string, { paidCents: number; refundedCents: number; pendingRefundCents: number }>();
    const bookingDeposits = bookingDepositsRaw
      .map((booking: any) => {
        const paymentState = this.normalizeBookingPaymentState(booking.paymentStateJson);
        const summary = this.summarizeBookingDepositRefundState(paymentState);
        const currency = String(booking.pricingSnapshotJson?.currency || settings?.defaultCurrency || 'GBP').toUpperCase();
        const depositStatus = String(paymentState.depositStatus || '').trim();
        const refundStatus = String(paymentState.depositRefundStatus || '').trim();
        const hasRelevantDeposit =
          Math.max(0, Number(paymentState.depositDueCents || 0)) > 0 ||
          summary.paidCents > 0 ||
          summary.refundedCents > 0 ||
          summary.pendingRefundCents > 0;
        if (!hasRelevantDeposit) return null;

        const totals = bookingDepositTotalsByCurrency.get(currency) || {
          paidCents: 0,
          refundedCents: 0,
          pendingRefundCents: 0,
        };
        totals.paidCents += summary.paidCents;
        totals.refundedCents += summary.refundedCents;
        totals.pendingRefundCents += summary.pendingRefundCents;
        bookingDepositTotalsByCurrency.set(currency, totals);

        return {
          id: booking.id,
          bookingId: booking.id,
          customerName: booking.customerName || 'Customer',
          serviceName: String(booking.pricingSnapshotJson?.serviceName || 'Booking').trim() || 'Booking',
          startsAt: booking.startsAt,
          currency,
          depositDueCents: Math.max(0, Number(paymentState.depositDueCents || 0)),
          depositPaidCents: summary.paidCents,
          refundedAmountCents: summary.refundedCents,
          pendingRefundAmountCents: summary.pendingRefundCents,
          depositStatus,
          depositStatusLabel: String(paymentState.depositStatusLabel || '').trim() || null,
          depositRefundStatus: refundStatus || null,
          depositRefundStatusLabel: String(paymentState.depositRefundStatusLabel || '').trim() || null,
        };
      })
      .filter(Boolean);

    const reconciliationQueue = rows
      .map((row: any) => {
        const request = latestPaymentRequestByJobId.get(row.jobId) || null;
        const dueSoon = row.dueAt && !row.paidAt && new Date(row.dueAt).getTime() <= Date.now() + 48 * 60 * 60 * 1000;
        const reason =
          row.reconciliationReviewNeeded
            ? 'Manual/provider payment needs finance review'
            : row.status === 'overdue'
              ? 'Invoice is overdue'
              : row.paymentRequestStatus === 'provider_attention'
                ? 'Provider payment needs attention'
                : row.paymentRequestStatus === 'partial_manual'
                  ? 'Partial manual payment recorded'
                  : request && !request.manualReference && ['paid', 'partial_manual'].includes(String(request.status || ''))
                    ? 'Manual payment reference is missing'
                    : dueSoon
                      ? 'Invoice due soon'
                      : null;
        if (!reason) return null;
        return {
          id: request?.id || row.jobId,
          paymentRequestId: request?.id || null,
          jobId: row.jobId,
          jobRef: row.jobRef,
          customerName: row.customerName,
          status: request?.status || row.status,
          reason,
          amountCents: row.grossAmountCents,
          unpaidAmountCents: row.unpaidAmountCents,
          amountReceivedCents: request?.amountReceivedCents == null ? null : Number(request.amountReceivedCents || 0),
          currency: row.currency,
          dueAt: row.dueAt,
          paidAt: row.paidAt,
          method: request?.manualMethod || null,
          referenceMissing: Boolean(request && !request.manualReference && ['paid', 'partial_manual'].includes(String(request.status || ''))),
          evidenceAttached: Boolean(request?.evidenceArtifactId),
          reviewedAt: request?.reviewedAt || null,
          actionUrl: `/dashboard/jobs/${row.jobId}#payments`,
        };
      })
      .filter(Boolean);

    return {
      filters: {
        from: from?.toISOString() || null,
        to: to?.toISOString() || null,
      },
      settings: {
        currency: settings?.defaultCurrency || 'GBP',
        vatConfigured: Boolean(settings?.vatEnabledDefault),
        vatRateBps: Number(settings?.vatRateBpsDefault || 0),
        vatNumber: financeConfig.vatNumber,
        invoiceNumberPrefix: financeConfig.invoiceNumberPrefix,
        paymentTermsDays: financeConfig.paymentTermsDays,
      },
      summary: {
        moneyOwedCount: rows.filter((row: any) => row.unpaidAmountCents > 0).length,
        overdueCount: rows.filter((row: any) => row.status === 'overdue').length,
        paidCount: rows.filter((row: any) => row.status === 'paid').length,
        dueSoonCount: rows.filter((row: any) => row.dueAt && !row.paidAt && new Date(row.dueAt).getTime() <= Date.now() + 48 * 60 * 60 * 1000).length,
        manualReviewCount: reconciliationQueue.filter((row: any) => !row.reviewedAt && ['paid', 'partial_manual'].includes(String(row.status || ''))).length,
        paymentRequestsSent: paymentRequests.filter((row: any) => row.sentAt).length,
        paymentAttentionCount: paymentRequests.filter((row: any) => ['provider_attention', 'payment_failed', 'provider_unavailable'].includes(String(row.status || ''))).length,
        totalsByCurrency: Array.from(totalsByCurrency.entries()).map(([currency, totals]) => ({ currency, ...totals })),
        agingBuckets: Object.values(agingBuckets),
        moneyPendingInByCurrency: Array.from(totalsByCurrency.entries()).map(([currency, totals]) => ({
          currency,
          amountCents: totals.unpaidCents,
        })),
        bookingDepositsByCurrency: Array.from(bookingDepositTotalsByCurrency.entries()).map(([currency, totals]) => ({
          currency,
          ...totals,
        })),
        moneyPendingOut: {
          authoritative: false,
          amountByCurrency: [],
          note: 'No authoritative outbound-payables dataset is wired into this workspace yet.',
        },
      },
      taxSummary: {
        enabled: Boolean(settings?.vatEnabledDefault),
        configured: Boolean(settings?.vatEnabledDefault),
        guidance: settings?.vatEnabledDefault
          ? 'Record and export support only. Review filings with your accountant or tax adviser.'
          : 'VAT is not configured yet. Turn it on in Settings before relying on VAT totals.',
        totalsByCurrency: Array.from(totalsByCurrency.entries()).map(([currency, totals]) => ({
          currency,
          netAmountCents: rows.filter((row: any) => row.currency === currency).reduce((sum: number, row: any) => sum + row.netAmountCents, 0),
          taxAmountCents: totals.taxCents,
          grossAmountCents: totals.grossCents,
        })),
      },
      customerBalances: Array.from(customerBalances.values()).sort((a, b) => b.unpaidCents - a.unpaidCents),
      invoices: rows,
      reconciliationQueue,
      bookingDeposits,
    };
  }

  async getBillingReadiness(tenantId: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const collectionReadiness = summarizeCustomerCollectionReadiness({
      paymentsEnabled: Boolean(settings?.paymentsEnabled || settings?.featurePayments),
      stripeConfigured: this.isStripeConfigured(),
      settings,
    });
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const jobs = await db.job.findMany({
      where: {
        companyId: tenantId,
        status: { in: ['COMPLETED', 'INVOICED'] },
      },
      include: {
        publicTokens: {
          where: { expiresAt: { gt: now } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        reminders: {
          where: {
            completedAt: null,
            note: 'Automation billing follow-up',
          },
          orderBy: { remindAt: 'asc' },
          take: 1,
        },
        activities: {
          where: {
            eventType: {
              in: [
                'billing.invoice.issued',
                'billing.payment.received',
                'billing.follow_up.requeued',
                'billing.follow_up.escalated',
                'job.reminder.create',
                'job.reminder.completed',
              ],
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 4,
        },
      },
      orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 50,
    });

    const artifactRows = jobs.length
      ? await db.documentArtifact.findMany({
          where: {
            tenantId,
            entityType: 'JOB',
            entityId: { in: jobs.map((job: any) => job.id) },
            kind: { in: ['INVOICE', 'RECEIPT'] },
          },
          select: {
            entityId: true,
            kind: true,
          },
        })
      : [];
    const artifactKindsByJobId = new Map<string, Set<string>>();
    for (const row of artifactRows) {
      const current = artifactKindsByJobId.get(row.entityId) || new Set<string>();
      current.add(String(row.kind));
      artifactKindsByJobId.set(row.entityId, current);
    }

    const billingEscalationsLast7Days = await db.activityEvent.count({
      where: {
        tenantId,
        type: 'automation.billing_follow_up_escalation',
        at: { gte: last7Days },
      },
    });

    const rows = jobs.map((job: any) => {
      const token = job.publicTokens?.[0]?.token || null;
      const invoiceReady = Boolean(job.completedAt || job.status === 'COMPLETED' || job.status === 'INVOICED');
      const paymentReady = Boolean((job.totalCents || 0) > 0 && collectionReadiness.ready);
      const portalReady = Boolean((settings?.featureCustomerPortal || settings?.paymentsEnabled) && token);
      const billingFollowUpAt = job.reminders?.[0]?.remindAt || null;
      const invoiceDueAt = job.invoiceDueAt || null;
      const invoiceOverdue = Boolean(invoiceDueAt && !job.invoicePaidAt && new Date(invoiceDueAt).getTime() < now.getTime());
      const invoiceDueSoon = Boolean(
        invoiceDueAt &&
          !job.invoicePaidAt &&
          !invoiceOverdue &&
          new Date(invoiceDueAt).getTime() < now.getTime() + 48 * 60 * 60 * 1000,
      );
      const lifecycleState = job.invoicePaidAt
        ? 'paid'
        : job.invoiceIssuedAt
        ? invoiceOverdue
          ? 'invoice_overdue'
          : invoiceDueSoon
          ? 'invoice_due_soon'
          : 'invoice_issued'
        : invoiceReady
        ? 'invoice_ready'
        : 'pre_billing';
      const nextStep = job.invoicePaidAt
        ? 'Payment recorded. Share receipt or close billing follow-through.'
        : !job.invoiceIssuedAt
        ? 'Issue invoice to start collections and customer payment guidance.'
        : invoiceOverdue
        ? 'Escalate collections and refresh customer payment guidance now.'
        : billingFollowUpAt && new Date(billingFollowUpAt).getTime() < now.getTime()
        ? 'Escalate the overdue billing follow-up.'
        : paymentReady
        ? collectionReadiness.live
          ? 'Customer payment can move through the workspace payment provider once shared.'
          : 'Collect payment manually and record it against the completed work.'
        : collectionReadiness.detail;
      const artifactKinds = artifactKindsByJobId.get(job.id) || new Set<string>();
      return {
        id: job.id,
        jobRef: job.jobRef,
        customerName: job.customerName,
        status: job.status,
        totalCents: job.totalCents,
        currency: job.currency,
        completedAt: job.completedAt,
        invoiceIssuedAt: job.invoiceIssuedAt,
        invoiceDueAt,
        invoicePaidAt: job.invoicePaidAt,
        invoiceReady,
        paymentReady,
        portalReady,
        invoiceOverdue,
        lifecycleState,
        nextStep,
        billingFollowUpAt,
        billingFollowUpOverdue: Boolean(billingFollowUpAt && new Date(billingFollowUpAt).getTime() < now.getTime()),
        invoiceDocumentReady: Boolean(job.invoicePdfUrl || artifactKinds.has('INVOICE')),
        receiptReady: Boolean(job.paymentReceiptUrl || artifactKinds.has('RECEIPT')),
        billingTimeline: (job.activities || []).map((activity: any) => ({
          eventType: activity.eventType,
          message: activity.message,
          createdAt: activity.createdAt,
        })),
        portalUrl: token ? buildAppUrl(`/portal/job/${token}`) : null,
        paymentLinkUrl: null,
        paymentSetupLabel: collectionReadiness.label,
        paymentSetupDetail: collectionReadiness.detail,
      };
    });

    return {
      paymentsEnabled: Boolean(settings?.paymentsEnabled),
      stripeConfigured: this.isStripeConfigured(),
      paymentSetupLabel: collectionReadiness.label,
      paymentSetupDetail: collectionReadiness.detail,
      summary: {
        completedJobs: rows.length,
        invoiceReady: rows.filter((row) => row.invoiceReady).length,
        invoiceIssued: rows.filter((row) => Boolean(row.invoiceIssuedAt)).length,
        issuedAwaitingPayment: rows.filter((row) => Boolean(row.invoiceIssuedAt) && !row.invoicePaidAt).length,
        paid: rows.filter((row) => Boolean(row.invoicePaidAt)).length,
        paymentReady: rows.filter((row) => row.paymentReady).length,
        portalReady: rows.filter((row) => row.portalReady).length,
        overdueInvoices: rows.filter((row) => row.invoiceOverdue).length,
        overdueBillingFollowUps: rows.filter((row) => row.billingFollowUpOverdue).length,
        billingEscalationsLast7Days,
      },
      jobs: rows,
    };
  }

  async getCustomerPaymentRequest(tenantId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({
      where: { id: jobId, companyId: tenantId },
      select: {
        id: true,
        jobRef: true,
        customerId: true,
        customerName: true,
        totalCents: true,
        currency: true,
        status: true,
        invoiceIssuedAt: true,
        invoiceDueAt: true,
        invoicePaidAt: true,
      },
    });
    if (!job) throw new BadRequestException('Job not found');
    const request = await db.customerPaymentRequest.findFirst({
      where: { tenantId, jobId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      job: {
        id: job.id,
        jobRef: job.jobRef,
        customerId: job.customerId || null,
        customerName: job.customerName,
        amountCents: Number(job.totalCents || 0),
        currency: job.currency,
        status: job.status,
        invoiceIssuedAt: job.invoiceIssuedAt,
        invoiceDueAt: job.invoiceDueAt,
        invoicePaidAt: job.invoicePaidAt,
      },
      request: this.sanitizePaymentRequest(request, { includeProviderRef: true }),
      readiness: await this.getTenantPaymentProviderReadiness(tenantId),
    };
  }

  async createCustomerPaymentRequest(tenantId: string, userId: string, jobId: string, input: CustomerPaymentRequestDto = {}) {
    const db = this.prisma as any;
    let job = await db.job.findFirst({
      where: { id: jobId, companyId: tenantId },
      include: {
        publicTokens: {
          where: { expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!job) throw new BadRequestException('Job not found');
    if (job.invoicePaidAt) throw new BadRequestException('This invoice is already paid');
    if (Number(job.totalCents || 0) <= 0) throw new BadRequestException('Payment requests require an amount due above £0.00');
    if (!(job.status === 'COMPLETED' || job.status === 'INVOICED' || job.invoiceIssuedAt)) {
      throw new BadRequestException('Complete the job before preparing a customer payment request');
    }
    if (!job.invoiceIssuedAt || job.status !== 'INVOICED') {
      job = await this.issueInvoice(tenantId, userId, jobId);
    }

    const readiness = await this.getTenantPaymentProviderReadiness(tenantId);
    const requestedProvider = this.normalizeTenantPaymentProvider(input.provider || readiness.selectedProvider);
    const provider = readiness.providers.find((candidate: any) => candidate.provider === requestedProvider) || readiness.providers[0];
    const canUseProvider = provider.provider !== 'manual' && this.providerReadyForCustomerCheckout(provider);
    const activeRequest = await db.customerPaymentRequest.findFirst({
      where: {
        tenantId,
        jobId: job.id,
        cancelledAt: null,
        status: { in: ['manual_pending', 'provider_pending', 'payment_processing'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (activeRequest) {
      return {
        request: this.sanitizePaymentRequest(activeRequest, { includeProviderRef: true }),
        readiness,
        duplicatePrevented: true,
      };
    }
    const token = this.generatePublicPaymentToken();
    const tokenHash = this.hashPublicPaymentToken(token);
    const manualFallback = provider.provider === 'manual' || !canUseProvider;
    let status = manualFallback
      ? provider.provider === 'manual'
        ? 'manual_pending'
        : 'provider_unavailable'
      : 'provider_pending';
    let providerRequestRef = canUseProvider ? `cpr_${crypto.randomBytes(12).toString('hex')}` : null;
    let actionUrl: string | null = null;
    let providerLifecycleState: string | null = null;
    let providerSafeDetail: string | null = null;
    const metadataJson = {
      requestedProvider,
      providerLabel: provider.label,
      providerCategory: provider.category,
      sent: input.send !== false,
      notes: input.notes ? String(input.notes).slice(0, 240) : null,
      safeMetadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : null,
      myTitanStripe: 'not_used_for_customer_payments',
      fallbackReason: manualFallback && provider.provider !== 'manual'
        ? `${provider.label} is ${String(provider.state || 'setup_needed').replace(/_/g, ' ')}. Manual collection remains available.`
        : null,
    };

    let request = await db.customerPaymentRequest.create({
      data: {
        tenantId,
        jobId: job.id,
        customerId: job.customerId || null,
        provider: manualFallback ? (provider.provider === 'manual' ? 'manual' : provider.provider) : provider.provider,
        providerKey: provider.providerKey || null,
        providerState: String(provider.state || 'setup_needed'),
        status,
        amountCents: Number(job.totalCents || 0),
        currency: String(job.currency || DEFAULT_WORKSPACE_CURRENCY).toUpperCase(),
        publicTokenHash: tokenHash,
        publicTokenPrefix: token.slice(0, 8),
        providerRequestRef,
        actionUrl,
        dueAt: job.invoiceDueAt || null,
        sentAt: input.send === false ? null : new Date(),
        metadataJson,
        createdByUserId: userId,
      },
    });

    if (canUseProvider && provider.provider === 'stripe-connect' && providerRequestRef) {
      const session = await this.createTenantStripeCheckoutSession({
        tenantId,
        job,
        requestId: request.id,
        providerRequestRef,
      });
      status = session.status;
      providerRequestRef = session.providerRequestRef;
      actionUrl = session.actionUrl;
      providerLifecycleState = session.lifecycleState;
      providerSafeDetail = session.detail;
      request = await db.customerPaymentRequest.update({
        where: { id: request.id },
        data: {
          status,
          providerRequestRef,
          actionUrl,
          metadataJson: {
            ...metadataJson,
            providerLifecycleState,
            providerSafeDetail,
            stripeConnectMode: this.tenantStripeConnectMode(),
            stripeConnectSession: session.sessionIdMasked || null,
            stripeAccount: session.accountMasked || null,
          },
        },
      });
      if (session.actionUrl && session.providerRequestRef) {
        await db.job.update({
          where: { id: job.id },
          data: {
            paymentCheckoutSessionId: session.providerRequestRef,
          },
        });
      }
    }

    await this.audit.log(tenantId, 'billing.customer_payment_request.create', `Customer payment request prepared for ${job.jobRef || job.id}`, userId);
    await this.logBillingActivity(
      tenantId,
      job.id,
      userId,
      'billing.payment_request.prepared',
      manualFallback
        ? 'Customer payment request prepared for manual collection'
        : 'Customer payment request prepared through tenant-owned provider',
      {
        provider: request.provider,
        providerState: request.providerState,
        status: request.status,
        providerLifecycleState,
        myTitanStripe: 'not_used_for_customer_payments',
      },
    );
    await this.createTenantNotification({
      tenantId,
      userRoles: ['OWNER', 'ADMIN', 'FINANCE'],
      type: status === 'provider_unavailable' ? 'payment.provider.needs_attention' : 'payment.request.sent',
      title: status === 'provider_unavailable' ? 'Payment provider needs attention' : 'Payment request ready',
      body:
        status === 'provider_unavailable'
          ? `${provider.label} is not ready, so ${job.jobRef || 'this job'} remains on manual collection.`
          : `${job.jobRef || 'This job'} is ready for customer payment collection.`,
      entityId: job.id,
      idempotencyKey: `payment-request:${request.id}`,
      actionUrl: `/dashboard/jobs/${job.id}#payments`,
      meta: {
        provider: request.provider,
        status: request.status,
      },
    });

    return {
      request: this.sanitizePaymentRequest(request, { includeProviderRef: true }),
      readiness,
    };
  }

  async markCustomerPaymentRequestPaidManually(
    tenantId: string,
    userId: string,
    jobId: string,
    requestId: string,
    input: ManualPaymentRequestPaidDto = {},
  ) {
    const db = this.prisma as any;
    const request = await db.customerPaymentRequest.findFirst({
      where: { id: requestId, tenantId, jobId },
    });
    if (!request) throw new BadRequestException('Payment request not found');
    if (request.paidAt || request.status === 'paid') {
      return { request: this.sanitizePaymentRequest(request, { includeProviderRef: true }) };
    }
    const amountReceivedCents = Math.max(0, Math.trunc(Number(input.amountReceivedCents ?? request.amountCents ?? 0)));
    if (amountReceivedCents <= 0) throw new BadRequestException('Manual payment amount must be above £0.00');
    const jobRecord = await db.job.findFirst({ where: { id: jobId, companyId: tenantId } });
    if (!jobRecord) throw new BadRequestException('Job not found');
    if (!jobRecord.invoiceIssuedAt && jobRecord.status !== 'INVOICED') {
      throw new BadRequestException('Issue the invoice before recording a manual payment');
    }
    const evidenceArtifactId = String(input.evidenceArtifactId || '').trim() || null;
    if (evidenceArtifactId) {
      const artifact = await db.documentArtifact.findFirst({
        where: {
          id: evidenceArtifactId,
          tenantId,
          entityType: 'JOB',
          entityId: jobId,
        },
      });
      if (!artifact) throw new BadRequestException('Payment evidence was not found for this job');
    }
    const dueCents = Math.max(0, Number(request.amountCents || jobRecord.totalCents || 0));
    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
    if (Number.isNaN(receivedAt.getTime())) throw new BadRequestException('Received date is invalid');
    const paidInFull = amountReceivedCents >= dueCents;
    const overpaid = amountReceivedCents > dueCents;
    const nextStatus = paidInFull ? 'paid' : 'partial_manual';
    const job = paidInFull
      ? await this.markPaidOffline(tenantId, userId, jobId)
      : jobRecord;
    const updated = await db.customerPaymentRequest.update({
      where: { id: request.id },
      data: {
        status: nextStatus,
        paidAt: paidInFull ? job.invoicePaidAt || receivedAt : null,
        manualReference: input.reference ? String(input.reference).slice(0, 120) : request.manualReference,
        manualMethod: input.method || request.manualMethod || 'other',
        amountReceivedCents,
        receivedAt,
        receivedByUserId: userId,
        evidenceArtifactId,
        internalNote: input.internalNote ? String(input.internalNote).slice(0, 500) : request.internalNote,
        customerReceiptNote: input.customerReceiptNote ? String(input.customerReceiptNote).slice(0, 240) : request.customerReceiptNote,
        reviewedAt: null,
        reviewedByUserId: null,
        metadataJson: {
          ...((request.metadataJson && typeof request.metadataJson === 'object' && !Array.isArray(request.metadataJson)) ? request.metadataJson : {}),
          manualCollection: {
            method: input.method || 'other',
            amountReceivedCents,
            dueCents,
            overpaid,
            partial: !paidInFull,
            evidenceAttached: Boolean(evidenceArtifactId),
            scanner: 'not_configured',
          },
        },
      },
    });
    await this.audit.log(tenantId, paidInFull ? 'billing.customer_payment_request.manual_paid' : 'billing.customer_payment_request.manual_partial', `Manual payment recorded for ${job.jobRef || job.id}`, userId);
    if (evidenceArtifactId) {
      await this.audit.log(tenantId, 'billing.customer_payment_request.evidence_attached', `Payment evidence attached for ${job.jobRef || job.id}`, userId);
    }
    await this.logBillingActivity(tenantId, job.id, userId, paidInFull ? 'billing.payment_request.manual_paid' : 'billing.payment_request.manual_partial', paidInFull ? 'Manual payment request marked paid by an authorised user' : 'Partial manual payment recorded by an authorised user', {
      requestId: request.id,
      source: 'manual_authorized_action',
      method: updated.manualMethod,
      amountReceivedCents,
      overpaid,
      evidenceAttached: Boolean(evidenceArtifactId),
    });
    await this.createTenantNotification({
      tenantId,
      userRoles: ['OWNER', 'ADMIN', 'FINANCE'],
      type: paidInFull ? 'payment.manual.confirmed' : 'payment.manual.needs_review',
      title: paidInFull ? 'Manual payment recorded' : 'Partial manual payment needs review',
      body: paidInFull
        ? `${job.jobRef || 'This job'} was marked paid after an authorised manual payment record.`
        : `${job.jobRef || 'This job'} has a partial manual payment and needs reconciliation review.`,
      entityId: job.id,
      idempotencyKey: `payment-manual:${request.id}:${updated.updatedAt?.toISOString?.() || Date.now()}`,
      actionUrl: `/dashboard/finance#reconciliation`,
      meta: { requestId: request.id, status: updated.status },
    });
    if (evidenceArtifactId) {
      await this.createTenantNotification({
        tenantId,
        userRoles: ['OWNER', 'ADMIN', 'FINANCE'],
        type: 'payment.evidence.uploaded',
        title: 'Payment evidence attached',
        body: `${job.jobRef || 'This job'} has payment evidence ready for finance review.`,
        entityId: job.id,
        idempotencyKey: `payment-evidence:${request.id}:${evidenceArtifactId}`,
        actionUrl: `/dashboard/finance#reconciliation`,
        meta: { requestId: request.id, evidenceAttached: true, scanner: 'not_configured' },
      });
    }
    return { request: this.sanitizePaymentRequest(updated, { includeProviderRef: true }) };
  }

  async reviewCustomerPaymentRequest(
    tenantId: string,
    userId: string,
    jobId: string,
    requestId: string,
    input: { note?: string | null } = {},
  ) {
    const db = this.prisma as any;
    const request = await db.customerPaymentRequest.findFirst({ where: { id: requestId, tenantId, jobId } });
    if (!request) throw new BadRequestException('Payment request not found');
    const updated = await db.customerPaymentRequest.update({
      where: { id: request.id },
      data: {
        reviewedAt: new Date(),
        reviewedByUserId: userId,
        reviewNote: input.note ? String(input.note).slice(0, 240) : null,
      },
    });
    await this.audit.log(tenantId, 'billing.customer_payment_request.reviewed', `Payment reconciliation reviewed for ${jobId}`, userId);
    await this.logBillingActivity(tenantId, jobId, userId, 'billing.payment_request.reviewed', 'Payment reconciliation item reviewed by finance', {
      requestId: request.id,
      status: request.status,
    });
    return { request: this.sanitizePaymentRequest(updated, { includeProviderRef: true }) };
  }

  async getPublicPaymentRequestForJob(tenantId: string, jobId: string) {
    const db = this.prisma as any;
    const row = await db.customerPaymentRequest.findFirst({
      where: { tenantId, jobId, cancelledAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return null;
    const evidenceArtifact = row.evidenceArtifactId
      ? await db.documentArtifact.findFirst({
          where: {
            id: row.evidenceArtifactId,
            tenantId,
            entityType: 'JOB',
            entityId: jobId,
          },
          select: {
            id: true,
            label: true,
            kind: true,
            portalVisible: true,
          },
        })
      : null;
    const manual = row.status === 'manual_pending' || row.status === 'provider_unavailable';
    return {
      status: row.status,
      provider: row.provider,
      providerLabel:
        row.provider === 'manual'
          ? 'Manual collection'
          : row.provider === 'stripe-connect'
            ? 'Business payment provider'
            : String(row.metadataJson?.providerLabel || 'Business payment provider'),
      amountCents: Number(row.amountCents || 0),
      currency: row.currency,
      dueAt: row.dueAt || null,
      paidAt: row.paidAt || null,
      manualMethod: row.manualMethod || null,
      amountReceivedCents: row.amountReceivedCents == null ? null : Number(row.amountReceivedCents || 0),
      evidenceReceived: Boolean(evidenceArtifact?.portalVisible),
      evidenceLabel: evidenceArtifact?.portalVisible ? evidenceArtifact.label : null,
      receiptNote: row.customerReceiptNote || null,
      actionAvailable: Boolean(row.actionUrl && ['provider_pending', 'payment_processing'].includes(row.status)),
      actionUrl: ['provider_pending', 'payment_processing'].includes(row.status) ? row.actionUrl || null : null,
      manualInstructions: manual
        ? row.status === 'partial_manual'
          ? 'A manual payment has been recorded and the business is reconciling the remaining balance.'
          : 'The business will collect this payment directly and update the job once received. Use the bank details or payment instructions supplied by the business.'
        : null,
      separationMessage: 'Payment is handled by the business.',
    };
  }

  async handleTenantPaymentWebhook(providerInput: string, routeId: string, payload: Buffer, headers: Record<string, any>) {
    const db = this.prisma as any;
    const credential = await this.integrationClientFactory.resolveWebhookRoute(providerInput, routeId);
    const provider = String(credential.provider || '');
    if (!['STRIPE_CUSTOMER_PAYMENTS', 'SUMUP', 'WORLDPAY'].includes(provider)) {
      throw new NotFoundException('Unknown payment route.');
    }
    const secret = credential.encryptedSecretMaterial
      ? this.integrationClientFactory.decryptSecretMaterial(credential.encryptedSecretMaterial)
      : null;
    if (!secret) {
      await db.integrationCredential.update({ where: { id: credential.id }, data: { lastErrorCategory: 'missing_webhook_secret' } });
      throw new ForbiddenException('Webhook signature was not accepted.');
    }
    const providedSignature =
      headers['x-mytitan-signature'] ||
      headers['x-provider-signature'] ||
      headers['x-signature'] ||
      headers['x-worldpay-signature'] ||
      headers['x-sumup-signature'] ||
      headers['stripe-signature'];
    const stripeSignatureResult = provider === 'STRIPE_CUSTOMER_PAYMENTS'
      ? this.verifyStripeSignatureHeader({ secret, payload, header: headers['stripe-signature'] })
      : null;
    const valid = stripeSignatureResult === null
      ? this.integrationClientFactory.verifyHmacSignature({ secret, payload, providedSignature })
      : stripeSignatureResult;
    if (!valid) {
      await db.integrationCredential.update({ where: { id: credential.id }, data: { lastErrorCategory: 'invalid_signature' } });
      throw new ForbiddenException('Webhook signature was not accepted.');
    }

    let body: any = {};
    try {
      body = JSON.parse(payload.toString('utf8') || '{}');
    } catch {
      body = {};
    }
    const eventId = String(body?.eventId || body?.id || headers['x-event-id'] || '').trim() || crypto.createHash('sha256').update(payload).digest('hex');
    const eventType = String(body?.type || body?.eventType || headers['x-event-type'] || 'event').trim() || 'event';
    let receipt;
    try {
      receipt = await db.integrationWebhookReceipt.create({
        data: {
          tenantId: credential.tenantId,
          integrationCredentialId: credential.id,
          provider: credential.provider,
          routeId: credential.routeId,
          eventId,
          eventType,
          status: 'received',
          lastAttemptAt: new Date(),
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') return { received: true, duplicate: true };
      throw error;
    }

    const providerRequestRef =
      String(body?.providerRequestRef || body?.paymentRequestRef || body?.data?.object?.metadata?.paymentRequestRef || body?.data?.metadata?.paymentRequestRef || '').trim();
    const paymentRequestId =
      String(body?.paymentRequestId || body?.data?.object?.metadata?.paymentRequestId || body?.data?.metadata?.paymentRequestId || '').trim();
    const stateSource = String(body?.status || body?.payment_status || body?.data?.object?.payment_status || body?.data?.object?.status || eventType).toLowerCase();
    const paidEvent = ['paid', 'succeeded', 'payment.succeeded', 'checkout.session.completed', 'payment_received'].some((needle) => stateSource.includes(needle));
    const attentionEvent = ['refund', 'dispute', 'chargeback', 'failed', 'canceled', 'cancelled'].some((needle) => stateSource.includes(needle) || eventType.toLowerCase().includes(needle));

    try {
      const request = providerRequestRef || paymentRequestId
        ? await db.customerPaymentRequest.findFirst({
            where: {
              tenantId: credential.tenantId,
              OR: [
                providerRequestRef ? { providerRequestRef } : undefined,
                paymentRequestId ? { id: paymentRequestId } : undefined,
              ].filter(Boolean),
            },
          })
        : null;
      if (request && paidEvent && !request.paidAt) {
        const job = await db.job.findFirst({ where: { id: request.jobId, companyId: credential.tenantId } });
        if (job) {
          const paidAt = new Date();
          await db.job.update({
            where: { id: job.id },
            data: {
              status: 'INVOICED',
              invoicePaidAt: job.invoicePaidAt || paidAt,
              invoiceIssuedAt: job.invoiceIssuedAt || paidAt,
              completedAt: job.completedAt || paidAt,
            },
          });
          await db.customerPaymentRequest.update({
            where: { id: request.id },
            data: {
              status: 'paid',
              paidAt,
              providerEventId: eventId,
            },
          });
          await this.audit.log(credential.tenantId, 'billing.customer_payment_request.webhook_paid', `Verified tenant payment received for ${job.jobRef || job.id}`, null);
          await this.logBillingActivity(credential.tenantId, job.id, null, 'billing.payment.received', 'Payment received through verified tenant-owned provider webhook', {
            requestId: request.id,
            provider: request.provider,
            eventId: this.maskProviderReference(eventId),
            source: 'tenant_provider_webhook',
          });
          await this.resolveBillingFollowUp(credential.tenantId, null, job.id, 'payment_received');
          if (isNotificationsV1Enabled()) await this.notifications.notifyPaymentReceived(credential.tenantId, job.id);
          await this.maybeQueueReviewRequest(credential.tenantId, job.id);
        }
      } else if (request && attentionEvent) {
        await db.customerPaymentRequest.update({
          where: { id: request.id },
          data: {
            status: 'provider_attention',
            providerEventId: eventId,
          },
        });
        await this.audit.log(credential.tenantId, 'billing.customer_payment_request.provider_attention', `Tenant payment provider event needs attention for ${request.jobId}`, null);
      }
      await db.integrationWebhookReceipt.update({
        where: { id: receipt.id },
        data: { status: 'processed', processedAt: new Date(), lastAttemptAt: new Date(), errorCategory: null },
      });
      await db.integrationCredential.update({
        where: { id: credential.id },
        data: { lastWebhookReceivedAt: new Date(), lastErrorCategory: null },
      });
      this.tenantStripeReadinessCache.delete(credential.tenantId);
      return { received: true, processed: Boolean(request && (paidEvent || attentionEvent)) };
    } catch (error) {
      await db.integrationWebhookReceipt.update({
        where: { id: receipt.id },
        data: { status: 'failed', errorCategory: 'processing_failed', lastAttemptAt: new Date() },
      });
      await db.integrationCredential.update({
        where: { id: credential.id },
        data: { lastWebhookReceivedAt: new Date(), lastErrorCategory: 'processing_failed' },
      });
      this.tenantStripeReadinessCache.delete(credential.tenantId);
      return { received: true, deadLettered: true };
    }
  }

  private async resolveInvoicePaymentTermsDays(tenantId: string, job: any, explicitTermsDays?: number | null) {
    if (explicitTermsDays != null) return Math.max(0, Math.min(365, Number(explicitTermsDays)));
    const db = this.prisma as any;
    if (job.tradeAccountId) {
      const tradeAccount = await db.tradeAccount.findFirst({
        where: { id: job.tradeAccountId, companyId: tenantId },
        select: { paymentTermsDays: true },
      });
      if (tradeAccount?.paymentTermsDays != null) return Number(tradeAccount.paymentTermsDays);
    }
    if (job.customerId) {
      const customer = await db.customer.findFirst({
        where: { id: job.customerId, companyId: tenantId },
        select: { paymentTermsDays: true },
      });
      if (customer?.paymentTermsDays != null) return Number(customer.paymentTermsDays);
    }
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    return this.getFinanceConfig(settings).paymentTermsDays;
  }

  async issueInvoice(tenantId: string, userId: string, jobId: string, explicitTermsDays?: number | null) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: jobId, companyId: tenantId } });
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const financeConfig = this.getFinanceConfig(settings);
    if (!job) {
      throw new BadRequestException('Job not found');
    }
    if (!(job.status === 'COMPLETED' || job.status === 'INVOICED')) {
      throw new BadRequestException('Only completed jobs can move into invoice state');
    }

    const paymentTermsDays = await this.resolveInvoicePaymentTermsDays(tenantId, job, explicitTermsDays);
    const issuedAt = job.invoiceIssuedAt ?? new Date();
    const updated = await db.$transaction(async (tx: any) => {
      const invoiceNumber = job.invoiceNumber || await this.documents.allocate(tx, tenantId, 'INVOICE');
      return tx.job.update({
        where: { id: job.id },
        data: {
          status: 'INVOICED',
          invoiceNumber,
          invoiceIssuedAt: issuedAt,
          invoicePaymentTermsDays: paymentTermsDays,
          invoiceDueAt: new Date(issuedAt.getTime() + paymentTermsDays * 24 * 60 * 60 * 1000),
          completedAt: job.completedAt ?? new Date(),
          formData: {
            ...((job.formData && typeof job.formData === 'object') ? job.formData : {}),
            invoiceAutoPopulation: {
              source: 'completed_job',
              version: 'phase_13_invoice_numbering_v1',
              draftFirst: true,
              paymentState: 'not_paid',
              sourceJobId: job.id,
              sourceBookingId: (job.formData && typeof job.formData === 'object' ? (job.formData as any).sourceBookingId : null) || null,
              serviceName: job.serviceName || null,
              totalCents: Number(job.totalCents || 0),
              currency: String(job.currency || DEFAULT_WORKSPACE_CURRENCY).toUpperCase(),
              lineItems: (job.lineItems || []).map((line: any) => ({
                description: line.description || null,
                quantity: Number(line.qty || 0),
                unitPrice: Number(line.unitPrice || 0),
                total: Number(line.total || 0),
              })),
            },
          },
        },
      });
    });
    await this.audit.log(tenantId, 'billing.invoice.issue', `Invoice issued for ${job.jobRef || job.id}`, userId);
    await this.logBillingActivity(tenantId, job.id, userId, 'billing.invoice.issued', 'Invoice issued and moved into collections workflow', {
      invoiceIssuedAt: updated.invoiceIssuedAt,
      invoiceDueAt: updated.invoiceDueAt,
      autoPopulatedFrom: 'completed_job',
      draftFirst: true,
      customerPaymentsOwner: 'tenant',
    });
    await this.resolveBillingFollowUp(tenantId, userId, job.id, 'invoice_issued');
    await this.automations.evaluateRuleTrigger(tenantId, 'invoice.issued', {
      actorUserId: userId,
      jobId: updated.id,
      jobRef: updated.jobRef || null,
      customerId: updated.customerId || null,
      customerName: updated.customerName || null,
      status: updated.status || null,
      assignedUserId: updated.assignedUserId || null,
      invoiceIssuedAt: updated.invoiceIssuedAt || null,
      invoicePaidAt: updated.invoicePaidAt || null,
    });
    return updated;
  }

  async updateInvoicePaymentTerms(tenantId: string, userId: string, jobId: string, paymentTermsDays: number) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: jobId, companyId: tenantId } });
    if (!job) throw new NotFoundException('Invoice not found.');
    const termsDays = Math.max(0, Math.min(365, Number(paymentTermsDays || 0)));
    const issuedAt = job.invoiceIssuedAt || new Date();
    const updated = await db.job.update({
      where: { id: job.id },
      data: {
        invoicePaymentTermsDays: termsDays,
        invoiceDueAt: new Date(issuedAt.getTime() + termsDays * 24 * 60 * 60 * 1000),
      },
    });
    await this.audit.log(tenantId, 'billing.invoice.terms_update', `Invoice terms updated to ${termsDays} days for ${job.jobRef || job.id}`, userId);
    return updated;
  }

  async sendInvoice(tenantId: string, userId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({
      where: { id: jobId, companyId: tenantId },
      include: { customer: true, tradeAccount: true },
    });
    if (!job) throw new NotFoundException('Invoice not found.');
    if (!job.invoiceIssuedAt) throw new BadRequestException('Issue the invoice before sending it.');
    const recipient = String(job.customer?.email || job.tradeAccount?.billingEmail || job.tradeAccount?.contactEmail || job.customerEmail || '').trim();
    if (!recipient) throw new BadRequestException('Add a billing email before sending this invoice.');
    const invoiceNumber = String(job.invoiceNumber || job.jobRef || job.id);
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const showBusiness = settings?.businessDisplayJson?.customerEmails !== false
      && settings?.businessDisplayJson?.invoices !== false;
    const businessLines = showBusiness
      ? [
          settings?.tradingName || settings?.registeredBusinessName || settings?.companyName,
          settings?.companyNumber ? `Company number: ${settings.companyNumber}` : null,
          settings?.taxRegistrationNumber ? `Tax registration: ${settings.taxRegistrationNumber}` : null,
          settings?.contactEmail || null,
          settings?.contactPhone || null,
        ].filter(Boolean).map(String)
      : [];
    const result = await this.notifications.sendIssuedInvoice({
      companyId: tenantId,
      actorUserId: userId,
      to: recipient,
      invoiceNumber,
      customerName: String(job.customer?.name || job.tradeAccount?.name || job.customerName || 'Customer'),
      amountLabel: this.formatMoneyLabel(Number(job.totalCents || 0), String(job.currency || DEFAULT_WORKSPACE_CURRENCY)),
      dueDateLabel: job.invoiceDueAt ? new Date(job.invoiceDueAt).toLocaleDateString('en-GB') : 'On receipt',
      jobId: job.id,
      businessLines,
    });
    await this.logBillingActivity(tenantId, job.id, userId, 'billing.invoice.sent', `Invoice ${invoiceNumber} sent`, {
      recipient,
      deliveryStatus: result.status,
    });
    return { ...result, recipient, invoiceNumber };
  }

  async generateStatement(tenantId: string, userId: string, input: { customerId?: string; tradeAccountId?: string; from: string; to: string }) {
    const db = this.prisma as any;
    if (!input.customerId && !input.tradeAccountId) throw new BadRequestException('Choose a customer or trade account.');
    const fromDate = new Date(input.from);
    const toDate = new Date(input.to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate < fromDate) {
      throw new BadRequestException('Choose a valid statement date range.');
    }
    toDate.setUTCHours(23, 59, 59, 999);
    const jobs = await db.job.findMany({
      where: {
        companyId: tenantId,
        ...(input.customerId ? { customerId: input.customerId } : {}),
        ...(input.tradeAccountId ? { tradeAccountId: input.tradeAccountId } : {}),
        invoiceIssuedAt: { gte: fromDate, lte: toDate },
      },
      orderBy: { invoiceIssuedAt: 'asc' },
    });
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const currency = String(jobs[0]?.currency || settings?.invoiceCurrency || settings?.defaultCurrency || DEFAULT_WORKSPACE_CURRENCY).toUpperCase();
    const now = Date.now();
    const lines = jobs.map((job: any) => {
      const amountCents = Math.max(0, Number(job.totalCents || 0));
      const paid = Boolean(job.invoicePaidAt);
      const overdue = !paid && job.invoiceDueAt && new Date(job.invoiceDueAt).getTime() < now;
      return {
        jobId: job.id,
        invoiceNumber: job.invoiceNumber || job.jobRef || job.id,
        issuedAt: job.invoiceIssuedAt,
        dueAt: job.invoiceDueAt,
        paidAt: job.invoicePaidAt,
        amountCents,
        openCents: paid ? 0 : amountCents,
        status: paid ? 'paid' : overdue ? 'overdue' : 'unpaid',
      };
    });
    const reference = `STM-${new Date().getUTCFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const statement = await db.accountStatement.create({
      data: {
        tenantId,
        customerId: input.customerId || null,
        tradeAccountId: input.tradeAccountId || null,
        reference,
        fromDate,
        toDate,
        currency,
        openBalanceCents: lines.reduce((sum: number, line: any) => sum + line.openCents, 0),
        paidTotalCents: lines.filter((line: any) => line.status === 'paid').reduce((sum: number, line: any) => sum + line.amountCents, 0),
        overdueTotalCents: lines.filter((line: any) => line.status === 'overdue').reduce((sum: number, line: any) => sum + line.openCents, 0),
        invoiceCount: lines.length,
        linesJson: lines,
        createdByUserId: userId,
      },
    });
    await this.audit.log(tenantId, 'billing.statement.generate', `Generated statement ${reference}`, userId);
    return statement;
  }

  async listStatements(tenantId: string) {
    const db = this.prisma as any;
    return db.accountStatement.findMany({
      where: { tenantId },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        tradeAccount: { select: { id: true, name: true, billingEmail: true, contactEmail: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getStatementPdf(tenantId: string, statementId: string) {
    const db = this.prisma as any;
    const statement = await db.accountStatement.findFirst({
      where: { id: statementId, tenantId },
      include: { customer: true, tradeAccount: true, tenant: { include: { tenantSetting: true } } },
    });
    if (!statement) throw new NotFoundException('Statement not found.');
    const lines = Array.isArray(statement.linesJson) ? statement.linesJson as any[] : [];
    const business = statement.tenant?.tenantSetting;
    const showBusiness = business?.businessDisplayJson?.statements !== false;
    return {
      statement,
      pdf: this.buildSimplePdf([
        showBusiness ? String(business?.tradingName || business?.registeredBusinessName || business?.companyName || statement.tenant?.name || '') : '',
        showBusiness && business?.companyNumber ? `Company number: ${business.companyNumber}` : '',
        `Account statement ${statement.reference}`,
        `Account: ${statement.customer?.name || statement.tradeAccount?.name || 'Customer'}`,
        `Period: ${new Date(statement.fromDate).toLocaleDateString('en-GB')} - ${new Date(statement.toDate).toLocaleDateString('en-GB')}`,
        `Open balance: ${this.formatMoneyLabel(statement.openBalanceCents, statement.currency)}`,
        '',
        ...lines.map((line) => `${line.invoiceNumber} | ${line.status} | ${this.formatMoneyLabel(line.amountCents, statement.currency)}`),
      ].filter(Boolean)),
    };
  }

  async sendStatement(tenantId: string, userId: string, statementId: string, email?: string | null) {
    const db = this.prisma as any;
    const { statement, pdf } = await this.getStatementPdf(tenantId, statementId);
    const populated = await db.accountStatement.findFirst({
      where: { id: statement.id, tenantId },
      include: { customer: true, tradeAccount: true },
    });
    const recipient = String(email || populated?.customer?.email || populated?.tradeAccount?.billingEmail || populated?.tradeAccount?.contactEmail || '').trim();
    if (!recipient) throw new BadRequestException('Add an account email before sending the statement.');
    const result = await this.notifications.sendAccountStatement({
      companyId: tenantId,
      actorUserId: userId,
      to: recipient,
      reference: statement.reference,
      accountName: String(populated?.customer?.name || populated?.tradeAccount?.name || 'Customer'),
      balanceLabel: this.formatMoneyLabel(statement.openBalanceCents, statement.currency),
      pdf,
    });
    if (result.delivered) {
      await db.accountStatement.update({
        where: { id: statement.id },
        data: {
          status: 'sent',
          sentTo: recipient,
          sentAt: new Date(),
          sendDedupeKey: `${statement.id}:${recipient.toLowerCase()}`,
        },
      });
    }
    return { ...result, recipient, statementId: statement.id };
  }

  async markPaidOffline(tenantId: string, userId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: jobId, companyId: tenantId } });
    if (!job) {
      throw new BadRequestException('Job not found');
    }
    if (!job.invoiceIssuedAt && job.status !== 'INVOICED') {
      throw new BadRequestException('Issue the invoice before marking the job paid');
    }
    if (job.invoicePaidAt) {
      return job;
    }

    const updated = await db.job.update({
      where: { id: job.id },
      data: {
        status: 'INVOICED',
        invoicePaidAt: new Date(),
        invoiceIssuedAt: job.invoiceIssuedAt ?? new Date(),
        completedAt: job.completedAt ?? new Date(),
      },
    });
    await this.audit.log(tenantId, 'billing.invoice.mark_paid', `Offline payment recorded for ${job.jobRef || job.id}`, userId);
    await this.logBillingActivity(tenantId, job.id, userId, 'billing.payment.received', 'Offline payment recorded against issued invoice', {
      source: 'manual_offline',
      invoiceIssuedAt: updated.invoiceIssuedAt,
      invoicePaidAt: updated.invoicePaidAt,
    });
    await this.resolveBillingFollowUp(tenantId, userId, job.id, 'payment_received');
    if (isNotificationsV1Enabled()) {
      await this.notifications.notifyPaymentReceived(tenantId, job.id);
    }
    await this.maybeQueueReviewRequest(tenantId, job.id);
    return updated;
  }

  async queueBillingFollowUp(tenantId: string, userId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: jobId, companyId: tenantId } });
    if (!job) {
      throw new BadRequestException('Job not found');
    }
    if (job.invoicePaidAt) {
      throw new BadRequestException('Paid jobs do not need a billing follow-up');
    }
    if (!(job.completedAt || job.status === 'COMPLETED' || job.status === 'INVOICED')) {
      throw new BadRequestException('Only completed or invoiced jobs can enter billing follow-up');
    }

    const now = Date.now();
    const targetTime = job.invoiceDueAt
      ? new Date(job.invoiceDueAt).getTime() < now
        ? new Date(now + 2 * 60 * 60 * 1000)
        : new Date(job.invoiceDueAt)
      : new Date(now + 24 * 60 * 60 * 1000);

    const existing = await db.jobReminder.findFirst({
      where: {
        companyId: tenantId,
        jobId,
        completedAt: null,
        note: 'Automation billing follow-up',
      },
    });

    let reminder;
    if (existing) {
      reminder = await db.jobReminder.update({
        where: { id: existing.id },
        data: { remindAt: targetTime, channel: existing.channel || 'in_app' },
      });
      await this.logBillingActivity(tenantId, jobId, userId, 'billing.follow_up.requeued', 'Billing follow-up reminder refreshed', {
        remindAt: reminder.remindAt,
        reminderId: reminder.id,
      });
    } else {
      reminder = await db.jobReminder.create({
        data: {
          companyId: tenantId,
          jobId,
          remindAt: targetTime,
          channel: 'in_app',
          note: 'Automation billing follow-up',
        },
      });
      await this.logBillingActivity(tenantId, jobId, userId, 'job.reminder.create', 'Billing follow-up reminder queued from billing workflow', {
        remindAt: reminder.remindAt,
        reminderId: reminder.id,
        note: reminder.note,
      });
    }

    await this.audit.log(tenantId, 'billing.follow_up.queue', `Billing follow-up queued for ${job.jobRef || job.id}`, userId);
    return {
      jobId: job.id,
      reminderId: reminder.id,
      remindAt: reminder.remindAt,
      refreshed: Boolean(existing),
    };
  }

  async escalateBillingFollowUp(tenantId: string, userId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: jobId, companyId: tenantId } });
    if (!job) {
      throw new BadRequestException('Job not found');
    }
    if (job.invoicePaidAt) {
      throw new BadRequestException('Paid jobs do not need billing escalation');
    }
    if (!(job.completedAt || job.status === 'COMPLETED' || job.status === 'INVOICED')) {
      throw new BadRequestException('Only completed or invoiced jobs can enter billing escalation');
    }

    const now = Date.now();
    const reminderAt = new Date(now + 30 * 60 * 1000);
    const existing = await db.jobReminder.findFirst({
      where: {
        companyId: tenantId,
        jobId,
        completedAt: null,
        note: 'Automation billing follow-up',
      },
    });

    const reminder = existing
      ? await db.jobReminder.update({
          where: { id: existing.id },
          data: { remindAt: reminderAt, channel: existing.channel || 'in_app' },
        })
      : await db.jobReminder.create({
          data: {
            companyId: tenantId,
            jobId,
            remindAt: reminderAt,
            channel: 'in_app',
            note: 'Automation billing follow-up',
          },
        });

    await this.audit.log(tenantId, 'billing.follow_up.escalate', `Billing follow-up escalated for ${job.jobRef || job.id}`, userId);
    await this.logBillingActivity(tenantId, jobId, userId, 'billing.follow_up.escalated', 'Billing follow-up escalated for operator attention', {
      reminderId: reminder.id,
      remindAt: reminder.remindAt,
      previousRemindAt: existing?.remindAt || null,
      escalated: true,
    });
    await this.automations.handleBillingFollowUpEscalation(tenantId, userId, job, reminder);

    return {
      jobId: job.id,
      reminderId: reminder.id,
      remindAt: reminder.remindAt,
      escalated: true,
      created: !existing,
    };
  }

  private truncateWebhookError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || 'unknown webhook error');
    return message.slice(0, 500);
  }

  private normalizeStripeHeaderValue(value: string | string[] | undefined) {
    if (Array.isArray(value)) return String(value[0] || '').trim();
    return String(value || '').trim();
  }

  private resolveStripeWebhookSecret() {
    const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
    return secret || null;
  }

  private isTrustedStripeEventType(type: string) {
    return (
      type === 'checkout.session.completed' ||
      type === 'checkout.session.expired' ||
      type === 'payment_intent.payment_failed' ||
      type === 'refund.created' ||
      type === 'refund.updated' ||
      type === 'charge.refunded' ||
      type === 'invoice.payment_succeeded' ||
      type === 'customer.subscription.updated' ||
      type === 'customer.subscription.deleted'
    );
  }

  private async resolvePlanByPriceId(db: any, priceId?: string | null) {
    const normalized = String(priceId || '').trim();
    if (!normalized) return null;
    return db.plan.findFirst({
      where: {
        OR: [{ stripePriceMonthlyId: normalized }, { stripePriceAnnualId: normalized }],
      },
    });
  }

  private resolvePlanInterval(plan: any, priceId?: string | null): 'MONTHLY' | 'ANNUAL' | null {
    const normalized = String(priceId || '').trim();
    if (!plan?.id || !normalized) return null;
    if (plan.stripePriceAnnualId === normalized) return 'ANNUAL';
    if (plan.stripePriceMonthlyId === normalized) return 'MONTHLY';
    return null;
  }

  private async resolveExpectedRecurringCharge(tenantId: string, plan: any, interval: 'MONTHLY' | 'ANNUAL') {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const company = await db.company.findUnique({ where: { id: tenantId }, select: { currency: true } });
    const pricingState = resolvePricingState({
      planCode: plan.code,
      planName: plan.name,
      interval,
      currency: company?.currency || settings?.defaultCurrency || 'GBP',
      adjustment: settings?.pricingAdjustmentJson,
      consumedAt: settings?.pricingAdjustmentConsumedAt,
      basePriceCentsOverride: interval === 'ANNUAL'
        ? this.readTenantCommercialControls(settings).customAnnualPriceCents
        : this.readTenantCommercialControls(settings).customMonthlyPriceCents,
    });
    return pricingState.adjustedPriceCents;
  }

  private assertStripeCustomerMatchesTenant(subscription: any, customerId: string, tenantId: string) {
    const normalizedCustomerId = String(customerId || '').trim();
    if (!normalizedCustomerId) {
      throw new BadRequestException('Stripe customer missing');
    }
    if (subscription?.stripeCustomerId && String(subscription.stripeCustomerId) !== normalizedCustomerId) {
      throw new BadRequestException(`Stripe customer does not match tenant ${tenantId}`);
    }
  }

  private assertStripeSubscriptionMatchesTenant(subscription: any, subscriptionId?: string | null, tenantId?: string | null) {
    const normalizedSubscriptionId = String(subscriptionId || '').trim();
    if (!normalizedSubscriptionId || !subscription?.stripeSubscriptionId) return;
    if (String(subscription.stripeSubscriptionId) !== normalizedSubscriptionId) {
      throw new BadRequestException(`Stripe subscription does not match tenant ${tenantId || 'unknown'}`);
    }
  }

  private extractInvoicePriceId(invoice: Stripe.Invoice) {
    const recurringLine = Array.isArray(invoice.lines?.data)
      ? invoice.lines.data.find((line) => Boolean((line as any)?.price?.id))
      : null;
    return String((recurringLine as any)?.price?.id || '').trim() || null;
  }

  private async resolveTenantSubscriptionForStripeCustomer(db: any, customerId?: string | null) {
    const normalizedCustomerId = String(customerId || '').trim();
    if (!normalizedCustomerId) return null;
    return db.tenantSubscription.findFirst({
      where: { stripeCustomerId: normalizedCustomerId },
      include: { plan: true },
    });
  }

  private async consumePricingAdjustmentOnSuccessfulPayment(tenantId: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({
      where: { tenantId },
      select: {
        pricingAdjustmentJson: true,
        pricingAdjustmentConsumedAt: true,
      },
    });
    const adjustment = normalizeStoredPricingAdjustment(settings?.pricingAdjustmentJson);
    if (!adjustment) return;

    if (adjustment.duration === 'one_time' && !settings?.pricingAdjustmentConsumedAt) {
      await db.tenantSetting.updateMany({
        where: { tenantId },
        data: { pricingAdjustmentConsumedAt: new Date() },
      });
      await this.syncStripeSubscriptionPrice(tenantId, 'standard');
      await this.audit.log(tenantId, 'billing.pricing_adjustment.consumed', 'One-time pricing adjustment consumed on successful payment', null);
    }

    if (adjustment.duration === 'until_date' && adjustment.expiresAt && new Date(adjustment.expiresAt).getTime() <= Date.now()) {
      await db.tenantSetting.updateMany({
        where: { tenantId },
        data: {
          pricingAdjustmentJson: null,
          pricingAdjustmentConsumedAt: null,
        },
      });
      await this.syncStripeSubscriptionPrice(tenantId, 'standard');
      await this.audit.log(tenantId, 'billing.pricing_adjustment.expired', 'Expired pricing adjustment cleared after successful payment', null);
    }
  }

  private async markBookingDepositPaid(input: {
    companyId: string;
    bookingId: string;
    sessionId: string;
    paymentIntentId?: string | null;
    chargeId?: string | null;
    amountPaidCents: number;
    eventId: string;
  }) {
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({
      where: { id: input.bookingId, companyId: input.companyId },
      select: { id: true, paymentStateJson: true },
    });
    if (!booking) {
      throw new BadRequestException('Booking not found for Stripe deposit payment.');
    }
    const paymentState = this.normalizeBookingPaymentState(booking.paymentStateJson);
    if (String(paymentState.depositStatus || '').toLowerCase() === 'paid') {
      return;
    }
    const expectedDepositCents = Math.max(0, Number(paymentState.depositDueCents || 0));
    if (expectedDepositCents !== input.amountPaidCents) {
      throw new BadRequestException('Stripe deposit amount does not match the booking deposit due.');
    }

    await db.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CONFIRMED',
        paymentStateJson: {
          ...paymentState,
          provider: 'STRIPE',
          collectionState: 'collected',
          depositStatus: 'paid',
          depositStatusLabel: 'Deposit paid',
          depositPaidAt: new Date().toISOString(),
          depositPaidCents: input.amountPaidCents,
          stripeCheckoutSessionId: input.sessionId,
          stripePaymentIntentId: String(input.paymentIntentId || '').trim() || null,
          stripeChargeId: String(input.chargeId || '').trim() || null,
          refundedAmountCents: Math.max(0, Number(paymentState.refundedAmountCents || 0)),
          depositRefundPendingAmountCents: 0,
          stripeLastEventId: input.eventId,
          note: 'Deposit payment confirmed.',
        },
      },
    });

    const owners = await db.user.findMany({
      where: { companyId: input.companyId, role: { in: ['OWNER', 'ADMIN'] } },
      select: { id: true },
    });
    await this.notifications.createForUsers(
      input.companyId,
      owners.map((user: { id: string }) => user.id),
      {
        type: 'booking.deposit.paid',
        title: 'Booking deposit paid',
        body: 'Stripe confirmed a booking deposit payment.',
        entityType: 'booking',
        entityId: input.bookingId,
        metaJson: {
          reasonKey: 'booking_deposit_paid',
          amountCents: input.amountPaidCents,
          provider: 'stripe',
        },
      },
    );
    await this.audit.log(input.companyId, 'booking.deposit.paid', `Stripe confirmed a deposit payment for booking ${input.bookingId}`, null);
    await this.notifications.notifyBookingDepositConfirmed(input.companyId, input.bookingId).catch(() => undefined);
  }

  private async markBookingDepositNeedsAttention(input: {
    companyId: string;
    bookingId: string;
    eventId: string;
    sessionId?: string | null;
    status: 'failed' | 'expired';
    note: string;
    label: string;
  }) {
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({
      where: { id: input.bookingId, companyId: input.companyId },
      select: { id: true, paymentStateJson: true },
    });
    if (!booking) {
      throw new BadRequestException('Booking not found for Stripe deposit update.');
    }
    const paymentState = this.normalizeBookingPaymentState(booking.paymentStateJson);
    await db.booking.update({
      where: { id: booking.id },
      data: {
        paymentStateJson: {
          ...paymentState,
          provider: 'STRIPE',
          collectionState: 'ready_for_checkout',
          depositStatus: input.status,
          depositStatusLabel: input.label,
          stripeCheckoutSessionId: String(input.sessionId || paymentState.stripeCheckoutSessionId || '').trim() || null,
          stripeLastEventId: input.eventId,
          note: input.note,
        },
      },
    });
    await this.notifications.notifyOperationalAlert({
      companyId: input.companyId,
      category: 'payments',
      reasonKey: `booking_deposit_${input.status}`,
      title: `Booking deposit ${input.status}`,
      body: 'A Stripe-backed booking deposit did not complete cleanly. Review the booking payment state and customer follow-up.',
      emailSubject: `MyTitan operational alert: booking deposit ${input.status}`,
      emailBody: [
        `Booking: ${input.bookingId}`,
        `Status: ${input.label}`,
        input.note,
      ].join('\n'),
      entityType: 'booking',
      entityId: input.bookingId,
      metaJson: {
        provider: 'stripe',
        status: input.status,
      },
    });
    await this.audit.log(input.companyId, `booking.deposit.${input.status}`, `Stripe deposit ${input.status} for booking ${input.bookingId}`, null);
  }

  private async markBookingDepositRefundPending(input: {
    companyId: string;
    bookingId: string;
    refundId: string;
    amountCents: number;
    paymentIntentId?: string | null;
    eventId: string;
  }) {
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({
      where: { id: input.bookingId, companyId: input.companyId },
      select: { id: true, paymentStateJson: true, pricingSnapshotJson: true },
    });
    if (!booking) {
      throw new BadRequestException('Booking not found for Stripe deposit refund.');
    }
    const paymentState = this.normalizeBookingPaymentState(booking.paymentStateJson);
    const existingPending = Math.max(0, Number(paymentState.depositRefundPendingAmountCents || 0));
    const nextPending = Math.max(existingPending, Number(input.amountCents || 0));
    await db.booking.update({
      where: { id: booking.id },
      data: {
        paymentStateJson: {
          ...paymentState,
          depositRefundStatus: 'pending',
          depositRefundStatusLabel: 'Deposit refund pending',
          depositRefundPendingAmountCents: nextPending,
          stripeRefundId: input.refundId,
          stripeRefundIds: this.appendUniqueStateList(paymentState.stripeRefundIds, input.refundId),
          stripePaymentIntentId: String(input.paymentIntentId || paymentState.stripePaymentIntentId || '').trim() || null,
          stripeLastEventId: input.eventId,
          note: 'Stripe has accepted the refund request and is still processing the booking deposit refund.',
        },
      },
    });
  }

  private async markBookingDepositRefundCompleted(input: {
    companyId: string;
    bookingId: string;
    refundId: string;
    amountCents: number;
    paymentIntentId?: string | null;
    eventId: string;
    refundedAt?: string | null;
    reason?: string | null;
  }) {
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({
      where: { id: input.bookingId, companyId: input.companyId },
      select: {
        id: true,
        customerEmail: true,
        pricingSnapshotJson: true,
        paymentStateJson: true,
      },
    });
    if (!booking) {
      throw new BadRequestException('Booking not found for Stripe refund completion.');
    }
    const paymentState = this.normalizeBookingPaymentState(booking.paymentStateJson);
    const processedRefundIds = Array.isArray(paymentState.stripeProcessedRefundIds)
      ? paymentState.stripeProcessedRefundIds.map((value: unknown) => String(value || '').trim()).filter(Boolean)
      : [];
    if (processedRefundIds.includes(input.refundId)) {
      return;
    }
    const currentRefunded = Math.max(0, Number(paymentState.refundedAmountCents || 0));
    const nextRefundAmount = Math.max(0, Number(input.amountCents || 0));
    const totalRefunded = currentRefunded + nextRefundAmount;
    const depositPaidCents = Math.max(0, Number(paymentState.depositPaidCents || paymentState.depositDueCents || 0));
    const pendingCents = Math.max(0, Number(paymentState.depositRefundPendingAmountCents || 0));
    const remainingPending = Math.max(0, pendingCents - nextRefundAmount);
    const partiallyRefunded = totalRefunded > 0 && totalRefunded < depositPaidCents;
    await db.booking.update({
      where: { id: booking.id },
      data: {
        paymentStateJson: {
          ...paymentState,
          depositRefundStatus: partiallyRefunded ? 'partial' : 'refunded',
          depositRefundStatusLabel: partiallyRefunded ? 'Deposit partially refunded' : 'Deposit refunded',
          refundedAmountCents: totalRefunded,
          refundedAt: String(input.refundedAt || new Date().toISOString()),
          depositRefundPendingAmountCents: remainingPending,
          stripeRefundId: input.refundId,
          stripeRefundIds: this.appendUniqueStateList(paymentState.stripeRefundIds, input.refundId),
          stripeProcessedRefundIds: this.appendUniqueStateList(paymentState.stripeProcessedRefundIds, input.refundId),
          stripePaymentIntentId: String(input.paymentIntentId || paymentState.stripePaymentIntentId || '').trim() || null,
          stripeLastEventId: input.eventId,
          note: partiallyRefunded
            ? 'Stripe confirmed a partial booking deposit refund.'
            : 'Stripe confirmed the booking deposit refund.',
        },
      },
    });
    await this.notifications.notifyBookingDepositRefundCompleted({
      companyId: input.companyId,
      bookingId: booking.id,
      amountCents: nextRefundAmount,
      currency: String(booking.pricingSnapshotJson?.currency || 'GBP').toUpperCase(),
      partial: partiallyRefunded,
      refundedAt: input.refundedAt || new Date().toISOString(),
      notifyCustomer: booking.customerEmail ? paymentState.depositRefundNotifyCustomer !== false : false,
    });
    await this.audit.log(
      input.companyId,
      'booking.deposit.refund_completed',
      `Stripe refund completed for booking ${booking.id}${input.reason ? `: ${input.reason}` : ''}`,
      null,
    );
  }

  private async markBookingDepositRefundFailed(input: {
    companyId: string;
    bookingId: string;
    refundId: string;
    eventId: string;
    reason?: string | null;
  }) {
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({
      where: { id: input.bookingId, companyId: input.companyId },
      select: { id: true, paymentStateJson: true },
    });
    if (!booking) {
      throw new BadRequestException('Booking not found for Stripe refund failure.');
    }
    const paymentState = this.normalizeBookingPaymentState(booking.paymentStateJson);
    await db.booking.update({
      where: { id: booking.id },
      data: {
        paymentStateJson: {
          ...paymentState,
          depositRefundStatus: 'failed',
          depositRefundStatusLabel: 'Deposit refund failed',
          depositRefundPendingAmountCents: 0,
          stripeRefundId: input.refundId,
          stripeRefundIds: this.appendUniqueStateList(paymentState.stripeRefundIds, input.refundId),
          stripeLastEventId: input.eventId,
          note: 'Stripe reported that the booking deposit refund failed. Review the refund outcome before updating the customer.',
        },
      },
    });
    await this.notifications.notifyOperationalAlert({
      companyId: input.companyId,
      category: 'payments',
      reasonKey: 'booking_deposit_refund_failed',
      title: 'Booking deposit refund failed',
      body: 'Stripe reported that a booking deposit refund failed. Review the payment state before updating the customer.',
      emailSubject: 'MyTitan operational alert: booking deposit refund failed',
      emailBody: [
        `Booking: ${booking.id}`,
        `Reason: ${this.truncateWebhookError(input.reason)}`,
      ].join('\n'),
      entityType: 'booking',
      entityId: booking.id,
      metaJson: {
        provider: 'stripe',
      },
    }).catch(() => undefined);
    await this.audit.log(
      input.companyId,
      'booking.deposit.refund_failed',
      `Stripe refund failed for booking ${booking.id}${input.reason ? `: ${input.reason}` : ''}`,
      null,
    );
  }

  private async notifyJobCompletionPackPurchase(companyId: string, purchase: any, templateKey: string, note: string) {
    const db = this.prisma as any;
    const actor = await db.user.findFirst({
      where: { companyId, role: { in: ['OWNER', 'ADMIN'] }, isActive: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    if (!actor?.id) return;
    await this.notifications.sendEntityUpdate(companyId, actor.id, {
      entityType: 'billing',
      entityId: purchase.id,
      templateKey,
      note,
      idempotencyKey: `${templateKey}:${purchase.id}`,
      context: {
        packCode: purchase.packCode,
        jobCompletionCount: purchase.jobCompletionCount,
        amountCents: purchase.amountCents,
        currency: purchase.currency,
      },
    }).catch(() => undefined);
  }

  private async markJobCompletionPackPurchasePaid(input: {
    tenantId: string;
    checkoutSessionId: string;
    paymentIntentId?: string | null;
    eventId: string;
    purchasedAt?: string | null;
  }) {
    const db = this.prisma as any;
    const purchase = await db.jobCompletionPackPurchase.findUnique({
      where: { checkoutSessionId: input.checkoutSessionId },
    });
    if (!purchase) {
      throw new BadRequestException('Job completion pack purchase not found.');
    }
    if (purchase.status === 'paid') {
      return purchase;
    }
    const updated = await db.jobCompletionPackPurchase.update({
      where: { checkoutSessionId: input.checkoutSessionId },
      data: {
        status: 'paid',
        stripePaymentIntentId: String(input.paymentIntentId || '').trim() || purchase.stripePaymentIntentId || null,
        stripeEventId: input.eventId,
        purchasedAt: input.purchasedAt ? new Date(input.purchasedAt) : new Date(),
        failedAt: null,
      },
    });
    await this.audit.log(input.tenantId, 'billing.job_completion_pack.paid', `Job completion pack purchased: ${updated.packCode}`, null);
    await this.notifyJobCompletionPackPurchase(input.tenantId, updated, 'job_completion_pack_purchase_paid', 'Extra job pack purchase confirmed');
    return updated;
  }

  private async resolveJobCompletionPackRefundTarget(input: {
    tenantId?: string | null;
    paymentIntentId?: string | null;
    refundId?: string | null;
  }) {
    const db = this.prisma as any;
    const tenantId = String(input.tenantId || '').trim();
    const paymentIntentId = String(input.paymentIntentId || '').trim();
    const refundId = String(input.refundId || '').trim();

    if (paymentIntentId) {
      const byIntent = await db.jobCompletionPackPurchase.findFirst({
        where: {
          ...(tenantId ? { tenantId } : {}),
          stripePaymentIntentId: paymentIntentId,
        },
        orderBy: [{ createdAt: 'desc' }],
      });
      if (byIntent) return byIntent;
    }

    if (refundId) {
      const byRefund = await db.jobCompletionPackPurchase.findFirst({
        where: {
          ...(tenantId ? { tenantId } : {}),
          metadataJson: {
            path: ['stripeRefundId'],
            equals: refundId,
          },
        },
        orderBy: [{ createdAt: 'desc' }],
      });
      if (byRefund) return byRefund;
    }

    return null;
  }

  private async markJobCompletionPackRefundPending(input: {
    tenantId?: string | null;
    paymentIntentId?: string | null;
    refundId: string;
    amountCents: number;
    eventId: string;
  }) {
    const db = this.prisma as any;
    const purchase = await this.resolveJobCompletionPackRefundTarget({
      tenantId: input.tenantId,
      paymentIntentId: input.paymentIntentId,
      refundId: input.refundId,
    });
    if (!purchase || !['paid', 'partially_refunded'].includes(String(purchase.status || '').trim())) {
      return purchase;
    }

    const purchaseState = this.normalizeJobCompletionPackPurchaseState(purchase.metadataJson);
    const pendingRefundsById = this.buildJobCompletionPackPendingRefundMap(purchaseState);
    const nextAmountCents = this.normalizeStateNumber(input.amountCents);
    if (nextAmountCents <= 0) {
      return purchase;
    }
    pendingRefundsById[input.refundId] = Math.max(this.normalizeStateNumber(pendingRefundsById[input.refundId]), nextAmountCents);
    const pendingRefundSummary = this.summarizePendingJobCompletionPackRefunds(
      {
        ...purchaseState,
        pendingRefundsById,
      },
      purchase,
    );

    return db.jobCompletionPackPurchase.update({
      where: { checkoutSessionId: purchase.checkoutSessionId },
      data: {
        metadataJson: {
          ...purchaseState,
          refundStatus: 'pending',
          stripeRefundId: input.refundId,
          stripeRefundIds: this.appendUniqueStateList(purchaseState.stripeRefundIds, input.refundId),
          stripePaymentIntentId: String(input.paymentIntentId || purchaseState.stripePaymentIntentId || '').trim() || null,
          stripeLastEventId: input.eventId,
          pendingRefundAmountCents: pendingRefundSummary.pendingRefundAmountCents,
          pendingRefundJobCompletionCount: pendingRefundSummary.pendingRefundJobCompletionCount,
          pendingRefundRemainderAmountCents: pendingRefundSummary.pendingRefundRemainderAmountCents,
          pendingRefundsById,
          note: 'Stripe has accepted a job-pack refund request. Extra allowance is only reduced after Stripe confirms the refund.',
        },
      },
    });
  }

  private async markJobCompletionPackRefundCompleted(input: {
    tenantId?: string | null;
    paymentIntentId?: string | null;
    refundId: string;
    amountCents: number;
    eventId: string;
    refundedAt?: string | null;
    reason?: string | null;
  }) {
    const db = this.prisma as any;
    const purchase = await this.resolveJobCompletionPackRefundTarget({
      tenantId: input.tenantId,
      paymentIntentId: input.paymentIntentId,
      refundId: input.refundId,
    });
    if (!purchase) {
      return purchase;
    }

    const purchaseState = this.normalizeJobCompletionPackPurchaseState(purchase.metadataJson);
    const processedRefundIds = this.appendUniqueStateList(purchaseState.stripeProcessedRefundIds);
    if (processedRefundIds.includes(input.refundId)) {
      return purchase;
    }

    const pendingRefundsById = this.buildJobCompletionPackPendingRefundMap(purchaseState);
    delete pendingRefundsById[input.refundId];
    const currentRefundedAmountCents = this.normalizeStateNumber(purchaseState.refundedAmountCents);
    const nextRefundAmountCents = this.normalizeStateNumber(input.amountCents);
    const refundedAmountCents = Math.min(
      this.normalizeStateNumber(purchase.amountCents),
      currentRefundedAmountCents + nextRefundAmountCents,
    );
    const refundedJobs = this.computeJobCompletionPackRefundedJobs({
      amountCents: refundedAmountCents,
      purchaseAmountCents: this.normalizeStateNumber(purchase.amountCents),
      purchasedJobCompletionCount: this.normalizeStateNumber(purchase.jobCompletionCount),
    });
    const pendingRefundSummary = this.summarizePendingJobCompletionPackRefunds(
      {
        ...purchaseState,
        pendingRefundsById,
      },
      purchase,
    );
    const nextStatus = this.deriveJobCompletionPackPurchaseStatus({
      purchase,
      refundedAmountCents,
    });
    const remainderNote =
      refundedJobs.remainderAmountCents > 0
        ? ` ${refundedJobs.remainderAmountCents} pence remains outside whole-job reversal and should be reviewed manually.`
        : '';

    const updated = await db.jobCompletionPackPurchase.update({
      where: { checkoutSessionId: purchase.checkoutSessionId },
      data: {
        status: nextStatus,
        stripeEventId: input.eventId,
        metadataJson: {
          ...purchaseState,
          refundStatus: nextStatus === 'refunded' ? 'refunded' : 'partial',
          refundedAmountCents,
          refundedJobCompletionCount: refundedJobs.refundedJobCompletionCount,
          refundedRemainderAmountCents: refundedJobs.remainderAmountCents,
          refundedAt: String(input.refundedAt || new Date().toISOString()),
          pendingRefundAmountCents: pendingRefundSummary.pendingRefundAmountCents,
          pendingRefundJobCompletionCount: pendingRefundSummary.pendingRefundJobCompletionCount,
          pendingRefundRemainderAmountCents: pendingRefundSummary.pendingRefundRemainderAmountCents,
          pendingRefundsById,
          stripeRefundId: input.refundId,
          stripeRefundIds: this.appendUniqueStateList(purchaseState.stripeRefundIds, input.refundId),
          stripeProcessedRefundIds: this.appendUniqueStateList(purchaseState.stripeProcessedRefundIds, input.refundId),
          stripePaymentIntentId: String(input.paymentIntentId || purchaseState.stripePaymentIntentId || '').trim() || null,
          stripeLastEventId: input.eventId,
          note:
            nextStatus === 'refunded'
              ? `Stripe confirmed the full job-pack refund.${remainderNote}`
              : `Stripe confirmed a partial job-pack refund.${remainderNote}`,
        },
      },
    });
    await this.audit.log(
      updated.tenantId,
      'billing.job_completion_pack.refund_completed',
      `Stripe refund completed for ${updated.packCode}${input.reason ? `: ${input.reason}` : ''}`,
      null,
    );
    return updated;
  }

  private async markJobCompletionPackRefundFailed(input: {
    tenantId?: string | null;
    paymentIntentId?: string | null;
    refundId: string;
    eventId: string;
    reason?: string | null;
  }) {
    const db = this.prisma as any;
    const purchase = await this.resolveJobCompletionPackRefundTarget({
      tenantId: input.tenantId,
      paymentIntentId: input.paymentIntentId,
      refundId: input.refundId,
    });
    if (!purchase) {
      return purchase;
    }

    const purchaseState = this.normalizeJobCompletionPackPurchaseState(purchase.metadataJson);
    const pendingRefundsById = this.buildJobCompletionPackPendingRefundMap(purchaseState);
    delete pendingRefundsById[input.refundId];
    const refundedAmountCents = this.normalizeStateNumber(purchaseState.refundedAmountCents);
    const pendingRefundSummary = this.summarizePendingJobCompletionPackRefunds(
      {
        ...purchaseState,
        pendingRefundsById,
      },
      purchase,
    );
    const nextStatus = this.deriveJobCompletionPackPurchaseStatus({
      purchase,
      refundedAmountCents,
    });

    const updated = await db.jobCompletionPackPurchase.update({
      where: { checkoutSessionId: purchase.checkoutSessionId },
      data: {
        status: nextStatus,
        stripeEventId: input.eventId,
        metadataJson: {
          ...purchaseState,
          refundStatus: pendingRefundSummary.pendingRefundAmountCents > 0 ? 'pending' : refundedAmountCents > 0 ? 'partial' : 'failed',
          pendingRefundAmountCents: pendingRefundSummary.pendingRefundAmountCents,
          pendingRefundJobCompletionCount: pendingRefundSummary.pendingRefundJobCompletionCount,
          pendingRefundRemainderAmountCents: pendingRefundSummary.pendingRefundRemainderAmountCents,
          pendingRefundsById,
          stripeRefundId: input.refundId,
          stripeRefundIds: this.appendUniqueStateList(purchaseState.stripeRefundIds, input.refundId),
          stripePaymentIntentId: String(input.paymentIntentId || purchaseState.stripePaymentIntentId || '').trim() || null,
          stripeLastEventId: input.eventId,
          note: 'Stripe reported that the job-pack refund failed. Review the refund outcome before updating allowance expectations.',
        },
      },
    });
    await this.audit.log(
      updated.tenantId,
      'billing.job_completion_pack.refund_failed',
      `Stripe refund failed for ${updated.packCode}${input.reason ? `: ${input.reason}` : ''}`,
      null,
    );
    return updated;
  }

  private async markJobCompletionPackPurchaseExpired(input: {
    tenantId: string;
    checkoutSessionId?: string | null;
    paymentIntentId?: string | null;
    eventId: string;
    status: 'expired' | 'failed' | 'cancelled';
  }) {
    const db = this.prisma as any;
    const purchase = input.checkoutSessionId
      ? await db.jobCompletionPackPurchase.findUnique({
          where: { checkoutSessionId: input.checkoutSessionId },
        })
      : String(input.paymentIntentId || '').trim()
        ? await db.jobCompletionPackPurchase.findFirst({
            where: { tenantId: input.tenantId, stripePaymentIntentId: String(input.paymentIntentId || '').trim() },
          })
        : null;
    if (!purchase || ['paid', 'partially_refunded', 'refunded'].includes(String(purchase.status || '').trim())) return purchase;
    return db.jobCompletionPackPurchase.update({
      where: { checkoutSessionId: purchase.checkoutSessionId },
      data: {
        status: input.status,
        stripeEventId: input.eventId,
        failedAt: new Date(),
      },
    });
  }

  private async reserveWebhookEvent(eventId: string, type: string, requestId?: string) {
    const db = this.prisma as any;
    try {
      return await db.webhookEvent.create({
        data: {
          provider: 'stripe',
          eventId,
          type,
          status: 'received',
          requestId: requestId || null,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return db.webhookEvent.findUnique({ where: { provider_eventId: { provider: 'stripe', eventId } } });
      }
      throw error;
    }
  }

  private async markWebhookProcessed(eventId: string, type: string, requestId?: string) {
    const db = this.prisma as any;
    await db.webhookEvent.updateMany({
      where: { provider: 'stripe', eventId },
      data: {
        type,
        status: 'processed',
        processedAt: new Date(),
        requestId: requestId || null,
        error: null,
      },
    });
  }

  private async markWebhookFailed(eventId: string, type: string, error: unknown, requestId?: string) {
    const db = this.prisma as any;
    await db.webhookEvent.updateMany({
      where: { provider: 'stripe', eventId },
      data: {
        type,
        status: 'failed',
        requestId: requestId || null,
        error: this.truncateWebhookError(error),
      },
    });
  }

  async handleStripeWebhook(req: Request & { rawBody?: Buffer; body?: unknown; requestId?: string }) {
    const signature = req.headers['stripe-signature'];
    const payload = Buffer.isBuffer(req.body) ? req.body : req.rawBody ?? Buffer.from('');
    const requestId = String(req.requestId || req.headers['x-request-id'] || '').trim() || undefined;
    try {
      return await this.handleWebhook(signature, payload, requestId);
    } catch (error) {
      this.logger.warn(`requestId=${requestId || 'unknown'} provider=stripe webhook=rejected reason="${this.truncateWebhookError(error)}"`);
      throw new BadRequestException('Stripe webhook was not accepted.');
    }
  }

  async handleWebhook(signature: string | string[] | undefined, payload: Buffer, requestId?: string) {
    const secret = this.resolveStripeWebhookSecret();
    if (!secret) {
      throw new BadRequestException('Stripe webhook secret is not configured');
    }
    const normalizedSignature = this.normalizeStripeHeaderValue(signature);
    if (!normalizedSignature) {
      throw new BadRequestException('Stripe signature missing');
    }
    if (!payload?.length) {
      throw new BadRequestException('Stripe payload missing');
    }

    const event = Stripe.webhooks.constructEvent(payload, normalizedSignature, secret);
    return this.handleStripeEvent(event, requestId);
  }

  async handleStripeEvent(event: Stripe.Event, requestId?: string) {
    const db = this.prisma as any;
    const eventId = String(event.id || '').trim();
    if (!eventId) {
      throw new BadRequestException('Stripe event id missing');
    }
    if (String((event as any).account || '').trim()) {
      this.logger.warn(
        `requestId=${requestId || 'unknown'} provider=stripe eventId=${eventId} scope=connected_account route=platform_webhook ignored=true`,
      );
      return { received: true, ignored: true, scope: 'connected_account' };
    }

    const webhookEvent = await this.reserveWebhookEvent(eventId, event.type, requestId);
    if (webhookEvent?.processedAt || webhookEvent?.status === 'processed') {
      this.logger.log(`requestId=${requestId || 'unknown'} provider=stripe eventId=${eventId} dedupe=hit status=processed`);
      return { received: true, duplicate: true };
    }

    try {
      if (!this.isTrustedStripeEventType(event.type)) {
        await this.markWebhookProcessed(eventId, event.type, requestId);
        return { received: true, ignored: true };
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.type === 'job_completion_pack') {
          if (session.mode !== 'payment') {
            throw new BadRequestException('Stripe job-completion pack checkout mode is invalid');
          }
          await this.markJobCompletionPackPurchasePaid({
            tenantId: String(session.metadata?.tenantId || '').trim(),
            checkoutSessionId: String(session.id || '').trim(),
            paymentIntentId: String(session.payment_intent || '').trim() || null,
            eventId,
            purchasedAt: new Date().toISOString(),
          });
          await this.markWebhookProcessed(eventId, event.type, requestId);
          return { received: true };
        }
        const bookingDepositTarget = await this.resolveBookingDepositCheckoutTarget({
          companyId: session.metadata?.tenantId,
          bookingId: session.metadata?.bookingId,
          publicStatusToken: session.metadata?.publicStatusToken,
          checkoutSessionId: String(session.id || '').trim() || null,
          paymentIntentId: String(session.payment_intent || '').trim() || null,
        });
        if (bookingDepositTarget) {
          if (session.mode && session.mode !== 'payment') {
            throw new BadRequestException('Stripe booking deposit checkout mode is invalid');
          }
          const bookingPaymentState = this.normalizeBookingPaymentState(bookingDepositTarget.paymentStateJson);
          await this.markBookingDepositPaid({
            companyId: bookingDepositTarget.companyId,
            bookingId: bookingDepositTarget.id,
            sessionId: String(session.id || '').trim(),
            paymentIntentId: String(session.payment_intent || '').trim() || null,
            chargeId: String(session.metadata?.chargeId || '').trim() || null,
            amountPaidCents: Math.max(
              0,
              Number(
                session.amount_total ||
                bookingPaymentState.depositDueCents ||
                0,
              ),
            ),
            eventId,
          });
          await this.markWebhookProcessed(eventId, event.type, requestId);
          return { received: true };
        }
        if (session.metadata?.type === 'job_payment' && session.metadata?.jobId && session.metadata?.tenantId) {
          const job = await db.job.findFirst({
            where: { id: session.metadata.jobId, companyId: session.metadata.tenantId },
          });
          if (!job) {
            await this.markWebhookProcessed(eventId, event.type, requestId);
            return { received: true };
          }

          let receiptUrl: string | null = null;
          const stripe = this.stripe;
          if (stripe && session.payment_intent) {
            const intent = await stripe.paymentIntents.retrieve(session.payment_intent as string, { expand: ['charges'] });
            const charge = (intent as any)?.charges?.data?.[0];
            if (charge?.receipt_url) {
              receiptUrl = charge.receipt_url;
            }
          }

          await db.job.update({
            where: { id: job.id },
            data: {
              invoicePaidAt: job.invoicePaidAt ?? new Date(),
              invoiceIssuedAt: job.invoiceIssuedAt ?? new Date(),
              paymentReceiptUrl: receiptUrl,
            },
          });
          await this.audit.log(job.companyId, 'portal.payment.complete', `Payment received for job ${job.jobRef}`, null);
          await this.logBillingActivity(job.companyId, job.id, null, 'billing.payment.received', 'Payment received through Stripe checkout', {
            receiptUrl,
            source: 'stripe_webhook',
          });
          await this.resolveBillingFollowUp(job.companyId, null, job.id, 'payment_received');
          if (isNotificationsV1Enabled()) {
            await this.notifications.notifyPaymentReceived(job.companyId, job.id);
          }
          await this.maybeQueueReviewRequest(job.companyId, job.id);
          await this.markWebhookProcessed(eventId, event.type, requestId);
          return { received: true };
        }

        const tenantId = String(session.client_reference_id || session.metadata?.tenantId || '').trim();
        const customerId = String(session.customer || '').trim();
        const stripeSubscriptionId = String(session.subscription || '').trim();
        const planCode = String(session.metadata?.planCode || '').trim();
        const interval = String(session.metadata?.interval || '').trim() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
        const expectedAmount = Number(session.metadata?.pricingAdjustedPriceCents || '');

        if (!tenantId || !customerId || !stripeSubscriptionId || !planCode || !Number.isFinite(expectedAmount)) {
          throw new BadRequestException('Stripe checkout session metadata is incomplete');
        }
        if (session.mode !== 'subscription') {
          throw new BadRequestException('Stripe checkout session mode is invalid');
        }
        if (Number(session.amount_total || 0) !== expectedAmount) {
          throw new BadRequestException('Stripe checkout session amount does not match the expected plan price');
        }

        const existing = await db.tenantSubscription.findUnique({ where: { tenantId } });
        this.assertStripeCustomerMatchesTenant(existing, customerId, tenantId);
        this.assertStripeSubscriptionMatchesTenant(existing, stripeSubscriptionId, tenantId);
        await db.tenantSubscription.upsert({
          where: { tenantId },
          update: {
            stripeCustomerId: customerId,
            stripeSubscriptionId: stripeSubscriptionId,
          },
          create: {
            tenantId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: stripeSubscriptionId,
            planId:
              existing?.planId ||
              (await db.plan.findUnique({ where: { code: DEFAULT_PLAN_CODE } }))?.id,
            status: existing?.status || 'incomplete',
            trialStartedAt: existing?.trialStartedAt || null,
            trialEndsAt: existing?.trialEndsAt || null,
            currentPeriodEnd: existing?.currentPeriodEnd || null,
            cancelAtPeriodEnd: Boolean(existing?.cancelAtPeriodEnd),
          },
        });
      }

      if (event.type === 'checkout.session.expired') {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.type === 'job_completion_pack') {
          await this.markJobCompletionPackPurchaseExpired({
            tenantId: String(session.metadata?.tenantId || '').trim(),
            checkoutSessionId: String(session.id || '').trim(),
            eventId,
            status: 'expired',
          });
          await this.markWebhookProcessed(eventId, event.type, requestId);
          return { received: true };
        }
        const bookingDepositTarget = await this.resolveBookingDepositCheckoutTarget({
          companyId: session.metadata?.tenantId,
          bookingId: session.metadata?.bookingId,
          publicStatusToken: session.metadata?.publicStatusToken,
          checkoutSessionId: String(session.id || '').trim() || null,
          paymentIntentId: String(session.payment_intent || '').trim() || null,
        });
        if (bookingDepositTarget) {
          await this.markBookingDepositNeedsAttention({
            companyId: bookingDepositTarget.companyId,
            bookingId: bookingDepositTarget.id,
            eventId,
            sessionId: String(session.id || '').trim() || null,
            status: 'expired',
            label: 'Deposit checkout expired',
            note: 'The previous payment link expired before payment. Start a new secure payment to continue.',
          });
          await this.markWebhookProcessed(eventId, event.type, requestId);
          return { received: true };
        }
      }

      if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        if (paymentIntent.metadata?.type === 'job_completion_pack') {
          await this.markJobCompletionPackPurchaseExpired({
            tenantId: String(paymentIntent.metadata?.tenantId || '').trim(),
            checkoutSessionId: String(paymentIntent.metadata?.stripeCheckoutSessionId || '').trim() || null,
            paymentIntentId: String(paymentIntent.id || '').trim() || null,
            eventId,
            status: 'failed',
          });
          await this.markWebhookProcessed(eventId, event.type, requestId);
          return { received: true };
        }
        const bookingDepositTarget = await this.resolveBookingDepositCheckoutTarget({
          companyId: paymentIntent.metadata?.tenantId,
          bookingId: paymentIntent.metadata?.bookingId,
          publicStatusToken: paymentIntent.metadata?.publicStatusToken,
          checkoutSessionId: paymentIntent.metadata?.stripeCheckoutSessionId,
          paymentIntentId: String(paymentIntent.id || '').trim() || null,
        });
        if (bookingDepositTarget) {
          await this.markBookingDepositNeedsAttention({
            companyId: bookingDepositTarget.companyId,
            bookingId: bookingDepositTarget.id,
            eventId,
            sessionId:
              String(paymentIntent.metadata?.stripeCheckoutSessionId || '').trim() ||
              String(this.normalizeBookingPaymentState(bookingDepositTarget.paymentStateJson).stripeCheckoutSessionId || '').trim() ||
              null,
            status: 'failed',
            label: 'Deposit payment failed',
            note: 'The deposit payment failed. Start a new secure payment to try again.',
          });
          await this.markWebhookProcessed(eventId, event.type, requestId);
          return { received: true };
        }
      }

      if (event.type === 'refund.created') {
        const refund = event.data.object as Stripe.Refund;
        const jobCompletionPackTarget = await this.resolveJobCompletionPackRefundTarget({
          tenantId: refund.metadata?.tenantId,
          paymentIntentId: String((refund as any).payment_intent || '').trim() || null,
          refundId: String(refund.id || '').trim() || null,
        });
        if (jobCompletionPackTarget) {
          await this.markJobCompletionPackRefundPending({
            tenantId: jobCompletionPackTarget.tenantId,
            refundId: String(refund.id || '').trim(),
            amountCents: Math.max(0, Number(refund.amount || 0)),
            paymentIntentId: String((refund as any).payment_intent || '').trim() || null,
            eventId,
          });
          await this.markWebhookProcessed(eventId, event.type, requestId);
          return { received: true };
        }
        const bookingDepositTarget = await this.resolveBookingDepositRefundTarget({
          companyId: refund.metadata?.tenantId,
          bookingId: refund.metadata?.bookingId,
          publicStatusToken: refund.metadata?.publicStatusToken,
          paymentIntentId: String((refund as any).payment_intent || '').trim() || null,
          refundId: String(refund.id || '').trim() || null,
        });
        if (bookingDepositTarget) {
          await this.markBookingDepositRefundPending({
            companyId: bookingDepositTarget.companyId,
            bookingId: bookingDepositTarget.id,
            refundId: String(refund.id || '').trim(),
            amountCents: Math.max(0, Number(refund.amount || 0)),
            paymentIntentId: String((refund as any).payment_intent || '').trim() || null,
            eventId,
          });
          await this.markWebhookProcessed(eventId, event.type, requestId);
          return { received: true };
        }
      }

      if (event.type === 'refund.updated') {
        const refund = event.data.object as Stripe.Refund;
        const jobCompletionPackTarget = await this.resolveJobCompletionPackRefundTarget({
          tenantId: refund.metadata?.tenantId,
          paymentIntentId: String((refund as any).payment_intent || '').trim() || null,
          refundId: String(refund.id || '').trim() || null,
        });
        if (jobCompletionPackTarget) {
          const refundStatus = String(refund.status || '').trim().toLowerCase();
          if (refundStatus === 'succeeded') {
            await this.markJobCompletionPackRefundCompleted({
              tenantId: jobCompletionPackTarget.tenantId,
              refundId: String(refund.id || '').trim(),
              amountCents: Math.max(0, Number(refund.amount || 0)),
              paymentIntentId: String((refund as any).payment_intent || '').trim() || null,
              eventId,
              refundedAt: new Date().toISOString(),
            });
          } else if (refundStatus === 'failed' || refundStatus === 'canceled') {
            await this.markJobCompletionPackRefundFailed({
              tenantId: jobCompletionPackTarget.tenantId,
              refundId: String(refund.id || '').trim(),
              paymentIntentId: String((refund as any).payment_intent || '').trim() || null,
              eventId,
              reason: String((refund as any).failure_reason || refundStatus),
            });
          } else {
            await this.markJobCompletionPackRefundPending({
              tenantId: jobCompletionPackTarget.tenantId,
              refundId: String(refund.id || '').trim(),
              amountCents: Math.max(0, Number(refund.amount || 0)),
              paymentIntentId: String((refund as any).payment_intent || '').trim() || null,
              eventId,
            });
          }
          await this.markWebhookProcessed(eventId, event.type, requestId);
          return { received: true };
        }
        const bookingDepositTarget = await this.resolveBookingDepositRefundTarget({
          companyId: refund.metadata?.tenantId,
          bookingId: refund.metadata?.bookingId,
          publicStatusToken: refund.metadata?.publicStatusToken,
          paymentIntentId: String((refund as any).payment_intent || '').trim() || null,
          refundId: String(refund.id || '').trim() || null,
        });
        if (bookingDepositTarget) {
          const refundStatus = String(refund.status || '').trim().toLowerCase();
          if (refundStatus === 'succeeded') {
            await this.markBookingDepositRefundCompleted({
              companyId: bookingDepositTarget.companyId,
              bookingId: bookingDepositTarget.id,
              refundId: String(refund.id || '').trim(),
              amountCents: Math.max(0, Number(refund.amount || 0)),
              paymentIntentId: String((refund as any).payment_intent || '').trim() || null,
              eventId,
              refundedAt: new Date().toISOString(),
            });
          } else if (refundStatus === 'failed' || refundStatus === 'canceled') {
            await this.markBookingDepositRefundFailed({
              companyId: bookingDepositTarget.companyId,
              bookingId: bookingDepositTarget.id,
              refundId: String(refund.id || '').trim(),
              eventId,
              reason: String((refund as any).failure_reason || refundStatus),
            });
          } else {
            await this.markBookingDepositRefundPending({
              companyId: bookingDepositTarget.companyId,
              bookingId: bookingDepositTarget.id,
              refundId: String(refund.id || '').trim(),
              amountCents: Math.max(0, Number(refund.amount || 0)),
              paymentIntentId: String((refund as any).payment_intent || '').trim() || null,
              eventId,
            });
          }
          await this.markWebhookProcessed(eventId, event.type, requestId);
          return { received: true };
        }
      }

      if (event.type === 'charge.refunded') {
        const charge = event.data.object as Stripe.Charge;
        const jobCompletionPackTarget = await this.resolveJobCompletionPackRefundTarget({
          tenantId: charge.metadata?.tenantId,
          paymentIntentId: String((charge as any).payment_intent || '').trim() || null,
        });
        if (jobCompletionPackTarget && Number(charge.amount_refunded || 0) > 0) {
          const purchaseRefundState = this.summarizeJobCompletionPackPurchaseRefundState(jobCompletionPackTarget);
          const delta = Math.max(0, Number(charge.amount_refunded || 0) - purchaseRefundState.refundedAmountCents);
          if (delta > 0) {
            await this.markJobCompletionPackRefundCompleted({
              tenantId: jobCompletionPackTarget.tenantId,
              refundId: String(jobCompletionPackTarget.metadataJson?.stripeRefundId || charge.id || '').trim(),
              amountCents: delta,
              paymentIntentId: String((charge as any).payment_intent || '').trim() || null,
              eventId,
              refundedAt: new Date().toISOString(),
              reason: 'charge.refunded',
            });
          }
          await this.markWebhookProcessed(eventId, event.type, requestId);
          return { received: true };
        }
        const bookingDepositTarget = await this.resolveBookingDepositRefundTarget({
          companyId: charge.metadata?.tenantId,
          bookingId: charge.metadata?.bookingId,
          publicStatusToken: charge.metadata?.publicStatusToken,
          paymentIntentId: String((charge as any).payment_intent || '').trim() || null,
        });
        if (bookingDepositTarget && Number(charge.amount_refunded || 0) > 0) {
          const paymentState = this.normalizeBookingPaymentState(bookingDepositTarget.paymentStateJson);
          const currentRefunded = Math.max(0, Number(paymentState.refundedAmountCents || 0));
          const delta = Math.max(0, Number(charge.amount_refunded || 0) - currentRefunded);
          if (delta > 0) {
            await this.markBookingDepositRefundCompleted({
              companyId: bookingDepositTarget.companyId,
              bookingId: bookingDepositTarget.id,
              refundId: String(paymentState.stripeRefundId || charge.id || '').trim(),
              amountCents: delta,
              paymentIntentId: String((charge as any).payment_intent || '').trim() || null,
              eventId,
              refundedAt: new Date().toISOString(),
              reason: 'charge.refunded',
            });
          }
          await this.markWebhookProcessed(eventId, event.type, requestId);
          return { received: true };
        }
      }

      if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = String(subscription.customer || '').trim();
        const metadataTenantId = String(subscription.metadata?.tenantId || '').trim();
        const existingByCustomer = await this.resolveTenantSubscriptionForStripeCustomer(db, customerId);
        const tenantId = existingByCustomer?.tenantId || metadataTenantId;

        if (!tenantId) {
          throw new BadRequestException('Stripe subscription tenant could not be resolved');
        }
        if (existingByCustomer?.tenantId && metadataTenantId && existingByCustomer.tenantId !== metadataTenantId) {
          throw new BadRequestException('Stripe subscription tenant metadata does not match the stored customer');
        }

        const existing = existingByCustomer || (await db.tenantSubscription.findUnique({ where: { tenantId } }));
        this.assertStripeCustomerMatchesTenant(existing, customerId, tenantId);
        this.assertStripeSubscriptionMatchesTenant(existing, subscription.id, tenantId);

        const priceId = String(subscription.items?.data?.[0]?.price?.id || '').trim();
        const plan = event.type === 'customer.subscription.deleted' ? existing?.plan || null : await this.resolvePlanByPriceId(db, priceId);
        if (event.type !== 'customer.subscription.deleted' && !plan) {
          throw new BadRequestException('Stripe subscription price is not recognized');
        }

        const interval = plan ? this.resolvePlanInterval(plan, priceId) : null;
        if (event.type !== 'customer.subscription.deleted' && !interval) {
          throw new BadRequestException('Stripe subscription interval is not recognized');
        }
        if (event.type !== 'customer.subscription.deleted' && subscription.metadata?.planCode && plan?.code !== subscription.metadata.planCode) {
          throw new BadRequestException('Stripe subscription plan metadata does not match the configured price');
        }
        if (event.type !== 'customer.subscription.deleted' && subscription.metadata?.interval && interval !== subscription.metadata.interval) {
          throw new BadRequestException('Stripe subscription interval metadata does not match the configured price');
        }

        const nextStatus = event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status;
        await db.tenantSubscription.upsert({
          where: { tenantId },
          update: {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscription.id,
            status: nextStatus,
            currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
            planId: plan?.id || existing?.planId || null,
            cancelAtPeriodEnd: event.type === 'customer.subscription.deleted' ? false : Boolean(subscription.cancel_at_period_end),
          },
          create: {
            tenantId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscription.id,
            status: nextStatus,
            currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
            planId: plan?.id || (await db.plan.findUnique({ where: { code: DEFAULT_PLAN_CODE } }))?.id,
            cancelAtPeriodEnd: event.type === 'customer.subscription.deleted' ? false : Boolean(subscription.cancel_at_period_end),
          },
        });

        if (event.type === 'customer.subscription.updated') {
          await this.maybeMarkTrialConversion(db, tenantId, subscription.status);
          if (plan?.id && interval) {
            await db.tenantSetting.updateMany({
              where: { tenantId },
              data: { planId: plan.id, planBillingInterval: interval },
            });
          }
        }
      }

      if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = String(invoice.customer || '').trim();
        const existing = await this.resolveTenantSubscriptionForStripeCustomer(db, customerId);
        if (!existing?.tenantId) {
          throw new BadRequestException('Stripe invoice customer does not match a tenant');
        }
        this.assertStripeCustomerMatchesTenant(existing, customerId, existing.tenantId);
        this.assertStripeSubscriptionMatchesTenant(existing, String(invoice.subscription || '').trim(), existing.tenantId);

        const priceId = this.extractInvoicePriceId(invoice);
        const plan = await this.resolvePlanByPriceId(db, priceId);
        if (!plan) {
          throw new BadRequestException('Stripe invoice price is not recognized');
        }
        const interval = this.resolvePlanInterval(plan, priceId);
        if (!interval) {
          throw new BadRequestException('Stripe invoice interval is not recognized');
        }
        const expectedAmount = await this.resolveExpectedRecurringCharge(existing.tenantId, plan, interval);
        const invoiceAmount = Number(invoice.amount_paid ?? invoice.amount_due ?? 0);
        if (!Number.isFinite(invoiceAmount) || invoiceAmount !== expectedAmount) {
          throw new BadRequestException('Stripe invoice amount does not match the configured plan price');
        }

        await db.tenantSubscription.update({
          where: { tenantId: existing.tenantId },
          data: {
            stripeCustomerId: customerId,
            stripeSubscriptionId: String(invoice.subscription || existing.stripeSubscriptionId || '').trim() || existing.stripeSubscriptionId,
            status: 'active',
            planId: plan.id,
          },
        });
        await this.maybeMarkTrialConversion(db, existing.tenantId, 'active');
        await db.tenantSetting.updateMany({
          where: { tenantId: existing.tenantId },
          data: { planId: plan.id, planBillingInterval: interval },
        });

        if (isNotificationsV1Enabled()) {
          const owners = await db.user.findMany({
            where: { companyId: existing.tenantId, role: 'OWNER' },
            select: { id: true },
          });
          if (owners.length) {
            await this.notifications.createForUsers(
              existing.tenantId,
              owners.map((user: any) => user.id),
              {
                type: 'payment.received',
                title: 'Payment received',
                body: 'Stripe confirmed a successful payment.',
                entityType: 'billing',
                entityId: String(invoice.id || ''),
              },
            );
          }
        }
        await this.consumePricingAdjustmentOnSuccessfulPayment(existing.tenantId);
      }

      await this.markWebhookProcessed(eventId, event.type, requestId);
      return { received: true };
    } catch (error) {
      this.logger.warn(
        `requestId=${requestId || 'unknown'} provider=stripe eventId=${eventId} type=${event.type} status=failed reason="${this.truncateWebhookError(error)}"`,
      );
      await this.markWebhookFailed(eventId, event.type, error, requestId);
      const alertTenantId =
        String(
          (event.data.object as any)?.metadata?.tenantId ||
          ((event.data.object as any)?.client_reference_id || ''),
        ).trim() || null;
      if (alertTenantId) {
        await this.notifications.notifyOperationalAlert({
          companyId: alertTenantId,
          category: 'payments',
          reasonKey: 'stripe_webhook_failed',
          title: 'Stripe webhook needs attention',
          body: 'Stripe sent an event that MyTitan could not process cleanly. Review webhook health and payment state before taking follow-up actions.',
          emailSubject: 'MyTitan operational alert: Stripe webhook needs attention',
          emailBody: [
            `Event type: ${event.type}`,
            `Event id: ${eventId}`,
            `Reason: ${this.truncateWebhookError(error)}`,
          ].join('\n'),
          entityType: 'billing',
          entityId: eventId,
          metaJson: {
            provider: 'stripe',
            eventType: event.type,
          },
        }).catch(() => undefined);
      }
      throw error;
    }
  }
}
