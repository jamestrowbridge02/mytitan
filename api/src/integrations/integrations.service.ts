import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';
import { IntegrationConnectionScope, IntegrationCredentialStatus, IntegrationCredentialType, TenantIntegrationProvider } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_PLAN_CODE, PLAN_DEFINITIONS } from '../billing/billing.constants';
import { isBillingEnforced } from '../common/billing-mode';
import { isTenantOwnerAllowlisted } from '../common/billing-entitlement';
import { isBillingAllowlisted } from '../common/billing-allowlist';
import { resolveBookingsEnabled } from '../common/workspace-features';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { BYOG_PROVIDER_MAP, BYOG_PROVIDER_ORDER, resolveByogProvider, toByogProviderSlug, toByogScopeLabel } from './byog-integrations';
import { IntegrationClientFactory } from './integration-client.factory';
import { decryptText, encryptText } from './integrations.crypto';
import { buildApiUrl } from '../common/public-url';

export type IntegrationProviderKey = 'XERO' | 'QBO' | 'GOOGLE_CALENDAR';
type IntegrationOwnership = 'WORKSPACE' | 'USER';

type ProviderConfig = {
  clientId: string;
  clientSecret: string;
  redirectUrl: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
};

type XeroOrganisation = {
  tenantId: string;
  tenantName: string | null;
  tenantType?: string | null;
};

type RolloutIssueKey =
  | 'personal_save_failure'
  | 'workspace_save_failure'
  | 'encryption_readiness_failure'
  | 'cross_scope_access_attempt'
  | 'provider_setup_error';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly clientFactory: IntegrationClientFactory,
  ) {}

  private normalizeSafeStatus(input?: string | null): IntegrationCredentialStatus {
    const value = String(input || '').trim().toUpperCase();
    if (value === 'CONNECTED') return 'CONNECTED';
    if (value === 'NEEDS_REAUTH') return 'NEEDS_REAUTH';
    if (value === 'DISABLED') return 'DISABLED';
    if (value === 'ERROR') return 'ERROR';
    return 'SETUP_NEEDED';
  }

  private isLocalPaymentSetup(provider: TenantIntegrationProvider) {
    return provider === 'BANK_TRANSFER' || provider === 'MANUAL_CARD_TERMINAL';
  }

  private normalizeByogScope(input: unknown, provider: TenantIntegrationProvider): IntegrationConnectionScope {
    const raw = String(input || '').trim().toUpperCase();
    if (raw === 'PERSONAL' || raw === 'USER') return 'USER';
    if (raw === 'WORKSPACE') return 'WORKSPACE';
    return BYOG_PROVIDER_MAP[provider]?.defaultScope || 'WORKSPACE';
  }

  private normalizeByogCredentialType(input: unknown, provider: TenantIntegrationProvider): IntegrationCredentialType {
    const raw = String(input || '').trim().toUpperCase();
    if (raw === 'OAUTH') return 'OAUTH';
    if (raw === 'API_KEY') return 'API_KEY';
    if (raw === 'WEBHOOK_SECRET') return 'WEBHOOK_SECRET';
    if (raw === 'MERCHANT_PAYMENT_GATEWAY_CONFIG') return 'MERCHANT_PAYMENT_GATEWAY_CONFIG';
    if (raw === 'ACCOUNTING_CONFIG') return 'ACCOUNTING_CONFIG';
    if (raw === 'CALENDAR_CONFIG') return 'CALENDAR_CONFIG';
    return BYOG_PROVIDER_MAP[provider]?.credentialType || 'API_KEY';
  }

  private normalizeScopeOwnerKey(scope: IntegrationConnectionScope, userId?: string | null) {
    return scope === 'USER' ? String(userId || '').trim() : 'workspace';
  }

  private buildRouteId(provider: TenantIntegrationProvider, tenantId: string, scopeOwnerKey: string) {
    return crypto.createHash('sha256').update(`${provider}:${tenantId}:${scopeOwnerKey}`).digest('hex').slice(0, 24);
  }

  private sanitizeMetadata(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const source = input as Record<string, any>;
    const safe: Record<string, any> = {};
    for (const [key, value] of Object.entries(source)) {
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey) continue;
      if (/(secret|token|key|password|credential|url)/i.test(normalizedKey)) {
        continue;
      }
      if (value == null) {
        safe[normalizedKey] = null;
        continue;
      }
      if (['string', 'number', 'boolean'].includes(typeof value)) {
        safe[normalizedKey] = typeof value === 'string' ? String(value).trim().slice(0, 240) : value;
      }
    }
    return safe;
  }

  private sanitizeErrorCategory(input?: string | null) {
    return String(input || '').trim().toLowerCase().replace(/[^a-z0-9_:-]/g, '').slice(0, 80) || null;
  }

  private parseSecretBody(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { payload: null, secretMaterial: null };
    const source = input as Record<string, any>;
    const payload =
      source.credentials && typeof source.credentials === 'object' && !Array.isArray(source.credentials)
        ? source.credentials
        : source.payload && typeof source.payload === 'object' && !Array.isArray(source.payload)
          ? source.payload
          : null;
    const secretMaterial =
      typeof source.secretMaterial === 'string'
        ? source.secretMaterial
        : typeof source.secret === 'string'
          ? source.secret
          : null;
    return { payload, secretMaterial };
  }

  private toSafeByogRow(row: any) {
    const provider = String(row?.provider || '') as TenantIntegrationProvider;
    const descriptor = BYOG_PROVIDER_MAP[provider];
    const metadata =
      row?.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
        ? row.metadataJson
        : {};
    const stripeCustomerReady = provider !== 'STRIPE_CUSTOMER_PAYMENTS' || Boolean(
      row.status === 'CONNECTED' &&
      !row.lastErrorCategory &&
      metadata.chargesEnabled === true &&
      metadata.detailsSubmitted === true &&
      metadata.verificationMode === 'live',
    );
    return {
      id: row.id,
      provider: toByogProviderSlug(provider),
      providerKey: provider,
      safeProviderName: descriptor?.safeName || provider,
      advancedProviderName: descriptor?.advancedLabel || provider,
      category: descriptor?.category || 'api',
      scopeOwner: toByogScopeLabel(row.scope),
      credentialType: String(row.credentialType || '').toLowerCase(),
      status: String(row.status || '').toLowerCase(),
      connected: row.status === 'CONNECTED' && stripeCustomerReady,
      needsReauth: row.status === 'NEEDS_REAUTH' || (provider === 'STRIPE_CUSTOMER_PAYMENTS' && !stripeCustomerReady && row.status !== 'SETUP_NEEDED'),
      lastChecked: row.lastVerifiedAt ?? null,
      lastWebhookReceivedAt: row.lastWebhookReceivedAt ?? null,
      webhookHealth:
        descriptor?.supportsInboundWebhook
          ? row.lastWebhookReceivedAt
            ? 'healthy'
            : row.status === 'CONNECTED'
              ? 'waiting'
              : 'not_configured'
          : 'not_applicable',
      lastSafeErrorCategory:
        provider === 'STRIPE_CUSTOMER_PAYMENTS' && row.lastErrorCategory
          ? 'provider_verification_required'
          : this.sanitizeErrorCategory(row.lastErrorCategory),
      routeId: row.routeId,
      displayName: row.displayName || null,
      metadata,
      scopeUserId: row.scope === 'USER' ? row.userId || null : null,
      supportsInboundWebhook: Boolean(descriptor?.supportsInboundWebhook),
    };
  }

  private async recordRolloutIssue(
    tenantId: string,
    issue: RolloutIssueKey,
    input: {
      provider: IntegrationProviderKey;
      scope: IntegrationOwnership;
      title: string;
      body: string;
      recommendedAction: string;
      userId?: string | null;
      severity?: 'warning' | 'critical';
    },
  ) {
    const safeProvider = String(input.provider || '').trim();
    const safeScope = input.scope === 'USER' ? 'personal' : 'workspace';
    await this.audit.log(
      tenantId,
      `integrations.rollout.${issue}`,
      `${safeProvider} ${safeScope}: ${input.title}`,
      input.userId || undefined,
    );
    await this.notifications
      .notifyOperationalAlert({
        companyId: tenantId,
        category: 'workspace_alerts',
        reasonKey: `integration_${issue}`,
        title: input.title,
        body: input.body,
        severity: input.severity || 'warning',
        recommendedAction: input.recommendedAction,
        entityType: 'integration',
        entityId: safeProvider,
        metaJson: {
          provider: safeProvider,
          scope: safeScope,
          source: 'integration_rollout_monitoring',
        },
      })
      .catch(() => undefined);
  }

  async getRolloutMonitoring(tenantId: string) {
    const db = this.prisma as any;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await db.auditEvent.findMany({
      where: {
        companyId: tenantId,
        createdAt: { gte: since },
        type: {
          in: [
            'integrations.rollout.personal_save_failure',
            'integrations.rollout.workspace_save_failure',
            'integrations.rollout.encryption_readiness_failure',
            'integrations.rollout.cross_scope_access_attempt',
            'integrations.rollout.provider_setup_error',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { type: true, createdAt: true },
    });
    const countFor = (type: string) => rows.filter((row: { type: string }) => row.type === type).length;
    return {
      windowDays: 7,
      counts: {
        personalIntegrationSaveFailures: countFor('integrations.rollout.personal_save_failure'),
        workspaceIntegrationSaveFailures: countFor('integrations.rollout.workspace_save_failure'),
        encryptionReadinessFailures: countFor('integrations.rollout.encryption_readiness_failure'),
        crossScopeAccessAttempts: countFor('integrations.rollout.cross_scope_access_attempt'),
        providerSetupErrors: countFor('integrations.rollout.provider_setup_error'),
      },
      latestAt: rows[0]?.createdAt ?? null,
    };
  }

  private getProviderOwnership(provider: IntegrationProviderKey): IntegrationOwnership {
    return provider === 'GOOGLE_CALENDAR' ? 'USER' : 'WORKSPACE';
  }

  private getScopeOwnerKey(scope: IntegrationOwnership, userId?: string | null) {
    return scope === 'USER' ? String(userId || '').trim() : 'workspace';
  }

  private getScopedConnectionWhere(tenantId: string, provider: IntegrationProviderKey, userId?: string | null) {
    const scope = this.getProviderOwnership(provider);
    const scopeOwnerKey = this.getScopeOwnerKey(scope, userId);
    if (scope === 'USER' && !scopeOwnerKey) {
      return null;
    }
    return {
      tenantId_provider_scope_scopeOwnerKey: {
        tenantId,
        provider,
        scope,
        scopeOwnerKey,
      },
    };
  }

  private maskExternalReference(value?: string | null) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (raw.length <= 10) return `${raw.slice(0, 2)}••${raw.slice(-2)}`;
    return `${raw.slice(0, 6)}••••${raw.slice(-4)}`;
  }

  private sanitizeXeroOrganisations(input: unknown): XeroOrganisation[] {
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    return input
      .map((entry: any) => ({
        tenantId: String(entry?.tenantId || entry?.id || '').trim(),
        tenantName: String(entry?.tenantName || entry?.name || '').trim() || null,
        tenantType: String(entry?.tenantType || '').trim() || null,
      }))
      .filter((entry) => {
        if (!entry.tenantId || seen.has(entry.tenantId)) return false;
        seen.add(entry.tenantId);
        return true;
      })
      .slice(0, 20);
  }

  private async fetchXeroOrganisations(accessToken: string, tenantId?: string | null): Promise<XeroOrganisation[]> {
    if (this.isE2ETenant(tenantId)) {
      return [{ tenantId: 'e2e-xero-organisation', tenantName: 'E2E Xero Organisation', tenantType: 'ORGANISATION' }];
    }
    const res = await fetch('https://api.xero.com/connections', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json().catch(() => []);
    if (!res.ok) {
      throw new BadRequestException('Xero organisation lookup failed');
    }
    return this.sanitizeXeroOrganisations(data);
  }

  private safeConnectionMetadata(connection: any) {
    const metadata = connection?.metadataJson && typeof connection.metadataJson === 'object' && !Array.isArray(connection.metadataJson)
      ? connection.metadataJson
      : {};
    const pendingOrganisations = this.sanitizeXeroOrganisations((metadata as any).pendingOrganisations);
    return {
      pendingOrganisations: pendingOrganisations.map((organisation) => ({
        selectionId: crypto.createHash('sha256').update(`${connection?.id || 'connection'}:${organisation.tenantId}`).digest('hex').slice(0, 16),
        tenantName: organisation.tenantName,
        tenantType: organisation.tenantType || null,
      })),
      syncOwnership: (metadata as any).syncOwnership || {
        contacts: 'mytitan_authoritative_push_preview',
        invoices: 'mytitan_authoritative_export_preview',
        payments: 'xero_status_import_review_required',
        taxRates: 'xero_authoritative_read_only',
        accounts: 'xero_authoritative_read_only',
      },
      mappingState: (metadata as any).mappingState || 'not_configured',
      liveProviderMutation: false,
    };
  }

  private isE2ETenant(tenantId?: string | null) {
    return String(tenantId || '').startsWith('e2e-');
  }

  private getE2EOAuthConfig(provider: IntegrationProviderKey): ProviderConfig | null {
    if (provider !== 'XERO' && provider !== 'QBO') return null;
    const slug = provider === 'XERO' ? 'xero' : 'qbo';
    const apiBase = String(process.env.API_PUBLIC_URL || 'https://api.mytitan.co.uk').replace(/\/+$/, '');
    return {
      clientId: `mytitan-e2e-${slug}-client`,
      clientSecret: `mytitan-e2e-${slug}-server-only`,
      redirectUrl: `${apiBase}/integrations/${slug}/callback`,
      authUrl: provider === 'XERO' ? 'https://login.xero.com/identity/connect/authorize' : 'https://appcenter.intuit.com/connect/oauth2',
      tokenUrl: 'https://example.invalid/oauth/token',
      scopes: provider === 'XERO'
        ? ['offline_access', 'accounting.transactions', 'accounting.settings', 'accounting.contacts', 'accounting.reports.read']
        : ['com.intuit.quickbooks.accounting'],
    };
  }

  private getProviderConfig(provider: IntegrationProviderKey, tenantId?: string | null): ProviderConfig {
    if (provider === 'XERO') {
      const clientId = process.env.XERO_CLIENT_ID?.trim();
      const clientSecret = process.env.XERO_CLIENT_SECRET?.trim();
      const redirectUrl = (process.env.XERO_REDIRECT_URI || process.env.XERO_REDIRECT_URL)?.trim();
      if (!clientId || !clientSecret || !redirectUrl) {
        const e2eConfig = this.isE2ETenant(tenantId) ? this.getE2EOAuthConfig(provider) : null;
        if (e2eConfig) return e2eConfig;
        throw new ServiceUnavailableException('Xero OAuth is not configured');
      }
      return {
        clientId,
        clientSecret,
        redirectUrl,
        authUrl: 'https://login.xero.com/identity/connect/authorize',
        tokenUrl: 'https://identity.xero.com/connect/token',
        scopes: ['offline_access', 'accounting.transactions', 'accounting.settings', 'accounting.contacts', 'accounting.reports.read'],
      };
    }

    if (provider === 'QBO') {
      const clientId = process.env.QBO_CLIENT_ID?.trim();
      const clientSecret = process.env.QBO_CLIENT_SECRET?.trim();
      const redirectUrl = (process.env.QBO_REDIRECT_URI || process.env.QBO_REDIRECT_URL)?.trim();
      if (!clientId || !clientSecret || !redirectUrl) {
        const e2eConfig = this.isE2ETenant(tenantId) ? this.getE2EOAuthConfig(provider) : null;
        if (e2eConfig) return e2eConfig;
        throw new ServiceUnavailableException('QuickBooks OAuth is not configured');
      }
      return {
        clientId,
        clientSecret,
        redirectUrl,
        authUrl: 'https://appcenter.intuit.com/connect/oauth2',
        tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
        scopes: ['com.intuit.quickbooks.accounting'],
      };
    }

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
    const redirectUrl = process.env.GOOGLE_OAUTH_REDIRECT_URL?.trim();
    if (!clientId || !clientSecret || !redirectUrl) {
      throw new ServiceUnavailableException('Google OAuth is not configured');
    }
    return {
      clientId,
      clientSecret,
      redirectUrl,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    };
  }

  private async getFeatureAccess(tenantId: string, provider: IntegrationProviderKey) {
    const db = this.prisma as any;
    const settings = await this.tenantService.ensureTenantSettings(tenantId);
    const subscription = await db.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    const plan = subscription?.plan ?? (await db.plan.findFirst({ where: { code: DEFAULT_PLAN_CODE } }));
    const features = (plan?.featuresJson ?? PLAN_DEFINITIONS[DEFAULT_PLAN_CODE].features) as Record<string, any>;
    if (this.isE2ETenant(tenantId) && provider !== 'GOOGLE_CALENDAR') {
      return { allowed: true, enabled: Boolean(settings.featureAccounting ?? settings.accountingEnabled) };
    }
    if (!isBillingEnforced() || await isTenantOwnerAllowlisted(this.prisma, tenantId)) {
      if (provider === 'GOOGLE_CALENDAR') {
        return { allowed: true, enabled: true };
      }
      const enabled = Boolean(settings.featureAccounting ?? settings.accountingEnabled);
      return { allowed: true, enabled };
    }

    if (provider === 'GOOGLE_CALENDAR') {
      const allowed = Boolean(features.bookings_enabled);
      return { allowed, enabled: true };
    }

    const enabled = Boolean(settings.featureAccounting ?? settings.accountingEnabled);
    const allowed = Boolean(features.accounting_enabled);
    return { allowed, enabled };
  }

  async getStatus(tenantId: string, provider: IntegrationProviderKey, userId?: string | null) {
    const db = this.prisma as any;
    const scopedWhere = this.getScopedConnectionWhere(tenantId, provider, userId);
    const connection = scopedWhere
      ? await db.integrationConnection.findUnique({
          where: scopedWhere,
        })
      : null;
    const access = await this.getFeatureAccess(tenantId, provider);
    let setupAvailable = false;
    try {
      this.getProviderConfig(provider, tenantId);
      setupAvailable = true;
    } catch {
      setupAvailable = false;
    }
    const scope = this.getProviderOwnership(provider);
    const connectedUserCount =
      scope === 'USER'
        ? await db.integrationConnection.count({
            where: {
              tenantId,
              provider,
              scope: 'USER',
              status: 'connected',
            },
          })
        : 0;

    return {
      provider,
      ownership: scope === 'USER' ? 'personal' : 'workspace',
      connected: Boolean(connection && connection.status === 'connected'),
      connectionState:
        connection?.status === 'connected'
          ? 'ready'
          : connection?.status === 'organization_selection_required'
            ? 'select_organisation'
          : connection?.status === 'needs_reconnect' || connection?.status === 'needs_reauth'
            ? 'needs_reconnect'
            : 'setup_needed',
      connectedAt: connection?.connectedAt ?? null,
      lastCheckedAt: connection?.lastVerifiedAt ?? connection?.updatedAt ?? null,
      lastVerifiedAt: connection?.lastVerifiedAt ?? null,
      lastSuccessfulSyncAt: connection?.lastSuccessfulSyncAt ?? null,
      lastFailedSyncAt: connection?.lastFailedSyncAt ?? null,
      scopes: connection?.scopes ?? null,
      externalTenantId: provider === 'XERO' ? null : connection?.externalTenantId ? this.maskExternalReference(connection.externalTenantId) : null,
      realmId: connection?.realmId ? this.maskExternalReference(connection.realmId) : null,
      providerAccountName:
        provider === 'XERO' && connection?.externalTenantName
          ? connection.externalTenantName
          : provider === 'XERO' && connection?.externalTenantId
          ? 'Selected Xero organisation'
          : provider === 'QBO' && connection?.realmId
            ? 'Connected QuickBooks company'
            : null,
      credentialStorage: connection?.accessTokenEncrypted || connection?.refreshTokenEncrypted ? 'server_encrypted' : 'not_stored',
      tokensReturnedToClient: false,
      liveSyncEnabled: false,
      healthState: connection?.healthState ?? (connection?.status === 'connected' ? 'connected' : null),
      disconnectState: connection?.disconnectState ?? null,
      diagnostics:
        provider === 'XERO'
          ? {
              callbackUrl: (() => {
                try {
                  return this.getProviderConfig(provider, tenantId).redirectUrl;
                } catch {
                  return buildApiUrl('/integrations/xero/callback');
                }
              })(),
              setupInstructions: setupAvailable
                ? 'Connect Xero, select the organisation, then run read-only verification before enabling mapping previews.'
                : 'Platform Admin must configure Xero client ID, client secret and redirect URI before tenant admins can connect.',
              nextAction:
                connection?.status === 'organization_selection_required'
                  ? 'Select the Xero organisation to bind to this MyTitan business.'
                  : connection?.status === 'connected'
                    ? 'Configure mappings and run previews before any live export.'
                    : setupAvailable
                      ? 'Start Xero OAuth connection.'
                      : 'Complete external Xero app registration and platform runtime configuration.',
              ...this.safeConnectionMetadata(connection),
            }
          : undefined,
      setupAvailable,
      allowed: access.allowed,
      enabled: access.enabled,
      connectedUserCount,
    };
  }

  async checkConnectionHealth(tenantId: string, provider: IntegrationProviderKey, userId?: string | null) {
    const status = await this.getStatus(tenantId, provider, userId);
    await this.audit.log(tenantId, 'integrations.health_check', `Checked ${provider} connection health`, userId || undefined);
    return {
      ok: true,
      provider,
      state: status.connectionState,
      connected: status.connected,
      lastCheckedAt: new Date().toISOString(),
      tokenStorage: status.credentialStorage,
      tokensReturnedToClient: false,
      liveProviderMutation: false,
      readOnlyVerification: status.connected,
      nextAction: status.connected
        ? 'Check mappings and preview export before enabling live sync flags.'
        : status.connectionState === 'select_organisation'
          ? 'Select and confirm the Xero organisation before verification can complete.'
        : 'Connect account before dry-run accounting validation.',
    };
  }

  async getOpsOverview(tenantId: string) {
    const providers: IntegrationProviderKey[] = ['XERO', 'QBO', 'GOOGLE_CALENDAR'];
    const rows = await Promise.all(
      providers.map(async (provider) => {
        const status = await this.getStatus(tenantId, provider);
        let oauthConfigured = true;
        try {
          this.getProviderConfig(provider, tenantId);
        } catch {
          oauthConfigured = false;
        }

        const blockers = [
          !status.allowed ? 'Plan or feature access required' : null,
          status.allowed && status.enabled && !oauthConfigured ? 'Provider OAuth is not configured on this deployment' : null,
        ].filter(Boolean) as string[];

        return {
          provider,
          ownership: status.ownership,
          connected: status.connected,
          allowed: status.allowed,
          enabled: status.enabled,
          oauthConfigured,
          connectedAt: status.connectedAt,
          connectedUserCount: status.connectedUserCount || 0,
          nextStep: status.connected
            ? 'Connected'
            : blockers.length > 0
            ? blockers[0]
            : 'Ready to connect',
          blockers,
        };
      }),
    );

    return {
      summary: {
        connected: rows.filter((row) => row.connected).length,
        ready: rows.filter((row) => !row.connected && row.allowed && row.enabled && row.oauthConfigured).length,
        blocked: rows.filter((row) => row.blockers.length > 0).length,
      },
      providers: rows,
    };
  }

  async createAuthUrl(tenantId: string, provider: IntegrationProviderKey, userId?: string | null) {
    const access = await this.getFeatureAccess(tenantId, provider);
    if (!access.allowed) {
      throw new ForbiddenException('Upgrade required to connect this integration.');
    }
    const scope = this.getProviderOwnership(provider);
    const scopeOwnerKey = this.getScopeOwnerKey(scope, userId);
    if (scope === 'USER' && !scopeOwnerKey) {
      await this.recordRolloutIssue(tenantId, 'cross_scope_access_attempt', {
        provider,
        scope,
        title: 'Personal integration access was blocked',
        body: 'MyTitan blocked a personal integration action because it was missing a valid user context.',
        recommendedAction: 'Retry the connection while signed in as the intended user.',
        userId,
      });
      throw new ForbiddenException('This integration requires an active user context.');
    }

    let config: ProviderConfig;
    try {
      config = this.getProviderConfig(provider, tenantId);
    } catch (error) {
      await this.recordRolloutIssue(tenantId, 'provider_setup_error', {
        provider,
        scope,
        title: 'Integration provider setup needs attention',
        body: 'MyTitan could not start an integration connection because provider OAuth setup is incomplete on this deployment.',
        recommendedAction: 'Review the provider configuration for this deployment before retrying the connection.',
        userId,
      });
      throw error;
    }
    const state = crypto.randomBytes(18).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const db = this.prisma as any;
    await db.integrationAuthState.create({
      data: {
        tenantId,
        provider,
        scope,
        ownerUserId: scope === 'USER' ? scopeOwnerKey : null,
        state,
        expiresAt,
      },
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUrl,
      scope: config.scopes.join(' '),
      state,
    });

    if (provider === 'GOOGLE_CALENDAR') {
      params.set('access_type', 'offline');
      params.set('prompt', 'consent');
    }

    return {
      url: `${config.authUrl}?${params.toString()}`,
      requestId: state.slice(0, 12),
      expiresAt,
      tokensReturnedToClient: false,
    };
  }

  private async exchangeToken(provider: IntegrationProviderKey, code: string, tenantId?: string | null) {
    const config = this.getProviderConfig(provider, tenantId);
    if (this.isE2ETenant(tenantId) && /^e2e_[a-z0-9_-]+$/i.test(String(code || '')) && (provider === 'XERO' || provider === 'QBO')) {
      return {
        access_token: `e2e-${provider.toLowerCase()}-access-material`,
        refresh_token: `e2e-${provider.toLowerCase()}-refresh-material`,
        expires_in: 3600,
        scope: config.scopes.join(' '),
        external_tenant_id: provider === 'XERO' ? 'e2e-xero-organisation' : null,
      };
    }
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUrl,
    });

    const authHeader = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (provider !== 'GOOGLE_CALENDAR') {
      headers.Authorization = `Basic ${authHeader}`;
    }

    if (provider === 'GOOGLE_CALENDAR') {
      body.set('client_id', config.clientId);
      body.set('client_secret', config.clientSecret);
    }

    const res = await fetch(config.tokenUrl, {
      method: 'POST',
      headers,
      body: body.toString(),
    });
    const data = (await res.json()) as any;
    if (!res.ok) {
      throw new BadRequestException('OAuth token exchange failed');
    }
    return data;
  }

  async handleCallback(provider: IntegrationProviderKey, code?: string, state?: string, realmId?: string) {
    if (!code || !state) {
      throw new BadRequestException('Missing OAuth code/state');
    }

    const db = this.prisma as any;
    const authState = await db.integrationAuthState.findUnique({ where: { state } });
    if (!authState || authState.provider !== provider) {
      throw new BadRequestException('Invalid OAuth state');
    }
    if (authState.expiresAt < new Date()) {
      throw new BadRequestException('OAuth state expired');
    }
    await db.integrationAuthState.delete({ where: { state } });
    const tenantId = authState.tenantId;
    const scope = String(authState.scope || 'WORKSPACE') as IntegrationOwnership;
    const ownerUserId = scope === 'USER' ? String(authState.ownerUserId || '').trim() : null;
    const scopeOwnerKey = this.getScopeOwnerKey(scope, ownerUserId);
    if (scope === 'USER' && !scopeOwnerKey) {
      await this.recordRolloutIssue(tenantId, 'cross_scope_access_attempt', {
        provider,
        scope,
        title: 'Personal integration callback was blocked',
        body: 'MyTitan blocked an integration callback because the personal connection owner could not be resolved safely.',
        recommendedAction: 'Restart the personal integration connection from the signed-in user account.',
        userId: ownerUserId,
      });
      throw new BadRequestException('Invalid OAuth state owner');
    }

    let tokenData: any;
    try {
      tokenData = await this.exchangeToken(provider, code, tenantId);
    } catch (error) {
      await this.recordRolloutIssue(tenantId, 'provider_setup_error', {
        provider,
        scope,
        title: 'Integration token exchange failed',
        body: 'MyTitan could not complete an integration callback because the provider token exchange failed.',
        recommendedAction: 'Review provider OAuth setup and retry the connection if the provider is expected to be available.',
        userId: ownerUserId,
      });
      throw error;
    }
    const accessToken = tokenData.access_token as string | undefined;
    const refreshToken = tokenData.refresh_token as string | undefined;

    if (!accessToken) {
      throw new BadRequestException('Missing access token');
    }

    let externalTenantId: string | null = null;
    let externalTenantName: string | null = null;
    let pendingOrganisations: XeroOrganisation[] = [];
    if (provider === 'XERO') {
      try {
        pendingOrganisations = await this.fetchXeroOrganisations(accessToken, tenantId);
      } catch (error) {
        await this.recordRolloutIssue(tenantId, 'provider_setup_error', {
          provider,
          scope,
          title: 'Xero organisation lookup failed',
          body: 'MyTitan received OAuth tokens but could not read available Xero organisations.',
          recommendedAction: 'Retry connection after confirming Xero app scopes and organisation access.',
          userId: ownerUserId,
        });
        throw error;
      }
    } else if (provider === 'QBO') {
      externalTenantId = null;
    }
    if (provider !== 'XERO' && tokenData.external_tenant_id) {
      externalTenantId = String(tokenData.external_tenant_id || '').trim() || null;
    }

    let encryptedAccess: string;
    let encryptedRefresh: string | null;
    try {
      encryptedAccess = encryptText(accessToken);
      encryptedRefresh = refreshToken ? encryptText(refreshToken) : null;
    } catch (error) {
      await this.recordRolloutIssue(tenantId, 'encryption_readiness_failure', {
        provider,
        scope,
        title: 'Integration secret storage is unavailable',
        body: 'MyTitan could not store integration credentials because integration secret encryption is not ready on this runtime.',
        recommendedAction: 'Confirm INTEGRATIONS_ENCRYPTION_KEY is present on the API runtime before retrying the connection.',
        userId: ownerUserId,
        severity: 'critical',
      });
      throw error;
    }

    const scopeValue = tokenData.scope ?? this.getProviderConfig(provider, tenantId).scopes.join(' ');
    const expiresInSeconds = Number(tokenData.expires_in || 0);
    const accessTokenExpiresAt = expiresInSeconds > 0 ? new Date(Date.now() + expiresInSeconds * 1000) : null;
    const connectionStatus = provider === 'XERO' ? 'organization_selection_required' : 'connected';
    const connectionHealth = provider === 'XERO' ? 'organization_selection_required' : 'connected';
    const metadataJson = provider === 'XERO'
      ? {
          pendingOrganisations,
          syncOwnership: {
            contacts: 'mytitan_authoritative_push_preview',
            invoices: 'mytitan_authoritative_export_preview',
            payments: 'xero_status_import_review_required',
            taxRates: 'xero_authoritative_read_only',
            accounts: 'xero_authoritative_read_only',
          },
          mappingState: 'not_configured',
          tokenSource: 'oauth_authorization_code',
          liveProviderMutation: false,
        }
      : undefined;
    try {
      await db.integrationConnection.upsert({
        where: {
          tenantId_provider_scope_scopeOwnerKey: {
            tenantId,
            provider,
            scope,
            scopeOwnerKey,
          },
        },
        update: {
          scope,
          scopeOwnerKey,
          ownerUserId,
          status: connectionStatus,
          accessTokenEncrypted: encryptedAccess,
          refreshTokenEncrypted: encryptedRefresh,
          scopes: scopeValue ?? null,
          externalTenantId,
          externalTenantName,
          realmId: realmId ?? null,
          accessTokenExpiresAt,
          lastRefreshedAt: null,
          lastVerifiedAt: provider === 'XERO' ? null : new Date(),
          healthState: connectionHealth,
          disconnectState: null,
          ...(metadataJson !== undefined ? { metadataJson } : {}),
          connectedAt: new Date(),
        },
        create: {
          tenantId,
          provider,
          scope,
          scopeOwnerKey,
          ownerUserId,
          status: connectionStatus,
          accessTokenEncrypted: encryptedAccess,
          refreshTokenEncrypted: encryptedRefresh,
          scopes: scopeValue ?? null,
          externalTenantId,
          externalTenantName,
          realmId: realmId ?? null,
          accessTokenExpiresAt,
          lastVerifiedAt: provider === 'XERO' ? null : new Date(),
          healthState: connectionHealth,
          disconnectState: null,
          ...(metadataJson !== undefined ? { metadataJson } : {}),
          connectedAt: new Date(),
        },
      });
    } catch (error) {
      await this.recordRolloutIssue(
        tenantId,
        scope === 'USER' ? 'personal_save_failure' : 'workspace_save_failure',
        {
          provider,
          scope,
          title: 'Integration connection could not be saved',
          body:
            scope === 'USER'
              ? 'MyTitan could not save a personal integration connection after provider authorization completed.'
              : 'MyTitan could not save a workspace integration connection after provider authorization completed.',
          recommendedAction: 'Retry the connection. If the issue persists, review database health and deployment logs.',
          userId: ownerUserId,
        },
      );
      throw error;
    }

    await this.audit.log(
      tenantId,
      provider === 'XERO' ? 'integrations.connect.pending_organisation' : 'integrations.connect',
      provider === 'XERO' ? 'Xero OAuth completed; organisation selection required' : `Connected ${provider}`,
      ownerUserId || undefined,
    );

    return { ok: true, provider, state: connectionStatus, organisationSelectionRequired: provider === 'XERO' };
  }

  async listXeroOrganisations(tenantId: string, userId?: string | null) {
    const db = this.prisma as any;
    const scopedWhere = this.getScopedConnectionWhere(tenantId, 'XERO', userId);
    if (!scopedWhere) throw new BadRequestException('Xero connection scope could not be resolved.');
    const connection = await db.integrationConnection.findUnique({ where: scopedWhere });
    if (!connection) {
      throw new BadRequestException('Connect Xero before selecting an organisation.');
    }
    const metadata = this.safeConnectionMetadata(connection);
    return {
      ok: true,
      provider: 'xero',
      state: connection.status,
      organisations: metadata.pendingOrganisations,
      selectedOrganisation: connection.externalTenantId
        ? {
            tenantName: connection.externalTenantName || 'Selected Xero organisation',
          }
        : null,
      tokensReturnedToClient: false,
    };
  }

  async selectXeroOrganisation(tenantId: string, userId: string, selectionId: string) {
    const db = this.prisma as any;
    const scopedWhere = this.getScopedConnectionWhere(tenantId, 'XERO', userId);
    if (!scopedWhere) throw new BadRequestException('Xero connection scope could not be resolved.');
    const connection = await db.integrationConnection.findUnique({ where: scopedWhere });
    if (!connection?.accessTokenEncrypted) {
      throw new BadRequestException('Connect Xero before selecting an organisation.');
    }
    const requested = String(selectionId || '').trim();
    const metadata = connection.metadataJson && typeof connection.metadataJson === 'object' && !Array.isArray(connection.metadataJson)
      ? connection.metadataJson
      : {};
    let organisations = this.sanitizeXeroOrganisations((metadata as any).pendingOrganisations);
    if (!organisations.length) {
      try {
        organisations = await this.fetchXeroOrganisations(decryptText(connection.accessTokenEncrypted), tenantId);
      } catch {
        throw new BadRequestException('Xero organisation list could not be refreshed for selection.');
      }
    }
    const selected = organisations.find((organisation) => (
      crypto.createHash('sha256').update(`${connection.id}:${organisation.tenantId}`).digest('hex').slice(0, 16) === requested
    ));
    if (!selected) {
      throw new BadRequestException('Selected Xero organisation is not available for this connection attempt.');
    }
    const nextMetadata = {
      ...metadata,
      pendingOrganisations: organisations,
      selectedOrganisation: { tenantId: selected.tenantId, tenantName: selected.tenantName, tenantType: selected.tenantType || null },
      mappingState: (metadata as any).mappingState || 'not_configured',
      liveProviderMutation: false,
    };
    await db.integrationConnection.update({
      where: scopedWhere,
      data: {
        status: 'connected',
        externalTenantId: selected.tenantId,
        externalTenantName: selected.tenantName || 'Xero organisation',
        healthState: 'connected_read_only_verified',
        lastVerifiedAt: new Date(),
        metadataJson: nextMetadata,
      },
    });
    await this.audit.log(tenantId, 'integrations.xero.organisation_select', 'Selected and read-only verified Xero organisation', userId);
    return {
      ok: true,
      provider: 'xero',
      connected: true,
      organisation: {
        tenantName: selected.tenantName || 'Xero organisation',
      },
      tokensReturnedToClient: false,
      liveProviderMutation: false,
    };
  }

  async disconnect(tenantId: string, provider: IntegrationProviderKey, userId?: string | null) {
    const db = this.prisma as any;
    const scope = this.getProviderOwnership(provider);
    if (scope === 'USER' && !String(userId || '').trim()) {
      await this.recordRolloutIssue(tenantId, 'cross_scope_access_attempt', {
        provider,
        scope,
        title: 'Personal integration disconnect was blocked',
        body: 'MyTitan blocked a personal integration disconnect because it was missing a valid user context.',
        recommendedAction: 'Retry the disconnect while signed in as the user who owns the connection.',
        userId,
      });
      throw new ForbiddenException('This integration requires an active user context.');
    }
    await db.integrationConnection.updateMany({
      where: {
        tenantId,
        provider,
        scope,
        ...(scope === 'USER' ? { ownerUserId: String(userId || '').trim() } : {}),
      },
      data: {
        status: 'disconnected',
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        healthState: 'disconnected',
        disconnectState: 'operator_requested',
        lastVerifiedAt: null,
      },
    });
    await this.audit.log(tenantId, 'integrations.disconnect', `Disconnected ${provider}`, userId || undefined);
    return { ok: true };
  }

  async syncStub() {
    throw new BadRequestException('Not implemented');
  }

  async queueAccountingSyncCheck(tenantId: string, userId: string, provider: 'XERO' | 'QUICKBOOKS') {
    const db = this.prisma as any;
    const connectionProvider = provider === 'QUICKBOOKS' ? 'QBO' : 'XERO';
    const connection = await db.integrationConnection.findUnique({
      where: {
        tenantId_provider_scope_scopeOwnerKey: {
          tenantId,
          provider: connectionProvider,
          scope: 'WORKSPACE',
          scopeOwnerKey: 'workspace',
        },
      },
      select: { id: true, status: true, lastVerifiedAt: true, externalTenantId: true },
    });
    const ready = connection?.status === 'connected' && Boolean(connection.lastVerifiedAt) && (provider === 'QUICKBOOKS' || Boolean(connection.externalTenantId));
    const event = await db.integrationOrchestrationEvent.create({
      data: {
        tenantId,
        provider,
        scope: 'WORKSPACE',
        scopeOwnerKey: 'workspace',
        userId,
        action: 'accounting.sync.check',
        safeCategory: ready ? 'live_gated' : 'setup_needed',
        result: ready ? 'manual_review' : 'blocked',
        message: ready
          ? 'Provider setup is verified. Use the accounting mapping preview and explicit live-sync gate before sending ledger data.'
          : 'Provider setup must be connected and verified before accounting sync.',
        metadataJson: { liveProviderMutation: false, source: 'integration_connection', syncMode: 'read_only_gate' },
      },
    });
    await this.audit.log(tenantId, 'integrations.accounting.sync_check', `${provider} sync check ${ready ? 'queued for review' : 'blocked'}`, userId);
    return {
      ok: ready,
      queued: ready,
      provider: provider === 'QUICKBOOKS' ? 'quickbooks' : 'xero',
      eventId: event.id,
      liveProviderMutation: false,
      state: ready ? 'manual_review' : 'setup_needed',
      nextAction: ready ? 'Review mappings and run the explicit live-gated sync.' : 'Connect and verify the provider.',
    };
  }

  async listByogConnections(tenantId: string, userId: string, role: string) {
    const db = this.prisma as any;
    const rows = await db.integrationCredential.findMany({
      where: {
        tenantId,
        OR: [
          { scope: 'WORKSPACE' },
          { scope: 'USER', userId },
        ],
      },
      orderBy: [{ scope: 'asc' }, { provider: 'asc' }],
    });

    const rowMap = new Map(rows.map((row: any) => [String(row.provider), row]));
    return BYOG_PROVIDER_ORDER
      .filter((provider) => {
        const scope = BYOG_PROVIDER_MAP[provider].defaultScope;
        return scope === 'WORKSPACE' || !['VIEWER', 'READ_ONLY'].includes(String(role || ''));
      })
      .map((provider) => {
        const existing = rowMap.get(provider);
        if (existing) {
          return this.toSafeByogRow(existing);
        }
        const descriptor = BYOG_PROVIDER_MAP[provider];
        return {
          id: null,
          provider: descriptor.slug,
          providerKey: provider,
          safeProviderName: descriptor.safeName,
          advancedProviderName: descriptor.advancedLabel,
          category: descriptor.category,
          scopeOwner: toByogScopeLabel(descriptor.defaultScope),
          credentialType: String(descriptor.credentialType).toLowerCase(),
          status: 'setup_needed',
          connected: false,
          needsReauth: false,
          lastChecked: null,
          lastWebhookReceivedAt: null,
          webhookHealth: descriptor.supportsInboundWebhook ? 'not_configured' : 'not_applicable',
          lastSafeErrorCategory: null,
          routeId: null,
          displayName: null,
          metadata: {},
          scopeUserId: descriptor.defaultScope === 'USER' ? userId : null,
          supportsInboundWebhook: descriptor.supportsInboundWebhook,
        };
      });
  }

  async upsertByogConnection(
    tenantId: string,
    actorUserId: string,
    role: string,
    providerInput: string,
    input: Record<string, any>,
  ) {
    const db = this.prisma as any;
    const provider = resolveByogProvider(providerInput);
    if (!provider) {
      throw new BadRequestException('Unknown integration provider.');
    }
    const scope = this.normalizeByogScope(input.scope, provider);
    if (scope === 'USER' && ['VIEWER', 'READ_ONLY'].includes(String(role || ''))) {
      throw new ForbiddenException('This personal integration cannot be managed from the current role.');
    }
    const scopeOwnerKey = this.normalizeScopeOwnerKey(scope, scope === 'USER' ? actorUserId : null);
    if (scope === 'USER' && !scopeOwnerKey) {
      throw new BadRequestException('A personal integration owner is required.');
    }

    const credentialType = this.normalizeByogCredentialType(input.credentialType, provider);
    const { payload, secretMaterial } = this.parseSecretBody(input);
    const encryptedPayload =
      payload && Object.keys(payload).length
        ? encryptText(JSON.stringify(payload))
        : undefined;
    const encryptedSecretMaterial =
      typeof secretMaterial === 'string' && secretMaterial.trim()
        ? encryptText(secretMaterial.trim())
        : undefined;

    const metadata = this.sanitizeMetadata(input.metadata);
    const requestedStatus = this.normalizeSafeStatus(input.status);
    const status =
      requestedStatus === 'DISABLED' || requestedStatus === 'NEEDS_REAUTH' || requestedStatus === 'ERROR'
        ? requestedStatus
        : this.isLocalPaymentSetup(provider) && (encryptedPayload || encryptedSecretMaterial)
          ? 'CONNECTED'
          : 'SETUP_NEEDED';
    const routeId = this.buildRouteId(provider, tenantId, scopeOwnerKey);

    const row = await db.integrationCredential.upsert({
      where: {
        tenantId_provider_scope_scopeOwnerKey: {
          tenantId,
          provider,
          scope,
          scopeOwnerKey,
        },
      },
      create: {
        tenantId,
        provider,
        credentialType,
        scope,
        scopeOwnerKey,
        userId: scope === 'USER' ? actorUserId : null,
        displayName: String(input.displayName || '').trim() || null,
        status,
        encryptedPayload,
        encryptedSecretMaterial,
        metadataJson: metadata,
        routeId,
        lastVerifiedAt: status === 'CONNECTED' ? new Date() : null,
        lastErrorCategory: this.sanitizeErrorCategory(input.lastErrorCategory),
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
      update: {
        credentialType,
        userId: scope === 'USER' ? actorUserId : null,
        displayName: String(input.displayName || '').trim() || null,
        status,
        ...(encryptedPayload !== undefined ? { encryptedPayload } : {}),
        ...(encryptedSecretMaterial !== undefined ? { encryptedSecretMaterial } : {}),
        metadataJson: metadata,
        lastVerifiedAt: status === 'CONNECTED' ? new Date() : null,
        lastErrorCategory: this.sanitizeErrorCategory(input.lastErrorCategory),
        updatedByUserId: actorUserId,
      },
    });

    await this.audit.log(tenantId, 'integrations.byog.upsert', `Saved ${provider} ${toByogScopeLabel(scope)} integration`, actorUserId);
    return this.toSafeByogRow(row);
  }

  async getByogConnection(tenantId: string, actorUserId: string, role: string, providerInput: string, scopeInput?: string | null) {
    const provider = resolveByogProvider(providerInput);
    if (!provider) {
      throw new BadRequestException('Unknown integration provider.');
    }
    const scope = this.normalizeByogScope(scopeInput, provider);
    if (scope === 'USER' && ['VIEWER', 'READ_ONLY'].includes(String(role || ''))) {
      throw new ForbiddenException('This personal integration cannot be viewed from the current role.');
    }
    const result = await this.clientFactory.resolveScopedClient({
      tenantId,
      provider,
      scope,
      userId: scope === 'USER' ? actorUserId : null,
    });
    if (!result.ok) {
      const failed = result as Extract<Awaited<ReturnType<IntegrationClientFactory['resolveScopedClient']>>, { ok: false }>;
      return { ok: false, category: failed.category, provider: toByogProviderSlug(provider) };
    }
    return {
      ok: true,
      provider: toByogProviderSlug(provider),
      status: String(result.status || '').toLowerCase(),
      routeId: result.routeId,
      metadata: this.sanitizeMetadata(result.metadata),
      lastChecked: result.credential.lastVerifiedAt ?? null,
      lastWebhookReceivedAt: result.credential.lastWebhookReceivedAt ?? null,
    };
  }

  async checkByogConnection(tenantId: string, actorUserId: string, role: string, providerInput: string, scopeInput?: string | null) {
    const provider = resolveByogProvider(providerInput);
    if (!provider) throw new BadRequestException('Unknown integration provider.');
    const scope = this.normalizeByogScope(scopeInput, provider);
    if (scope === 'USER' && ['VIEWER', 'READ_ONLY'].includes(String(role || ''))) {
      throw new ForbiddenException('This personal integration cannot be checked from the current role.');
    }
    const scopeOwnerKey = this.normalizeScopeOwnerKey(scope, scope === 'USER' ? actorUserId : null);
    const result = await this.clientFactory.resolveScopedClient({
      tenantId,
      provider,
      scope,
      userId: scope === 'USER' ? actorUserId : null,
    });
    if (!result.ok) {
      const failed = result as Extract<typeof result, { ok: false }>;
      await this.audit.log(tenantId, 'integrations.byog.check_failed', `Checked ${provider}: ${failed.category}`, actorUserId);
      return { ok: false, provider: toByogProviderSlug(provider), category: failed.category, liveMutation: false };
    }
    const descriptor = BYOG_PROVIDER_MAP[provider];
    if (provider === 'STRIPE_CUSTOMER_PAYMENTS') {
      const metadata =
        result.metadata && typeof result.metadata === 'object' && !Array.isArray(result.metadata)
          ? result.metadata
          : {};
      const verified = Boolean(
        result.status === 'CONNECTED' &&
        !result.credential.lastErrorCategory &&
        metadata.chargesEnabled === true &&
        metadata.detailsSubmitted === true &&
        metadata.verificationMode === 'live',
      );
      await this.audit.log(
        tenantId,
        verified ? 'integrations.byog.check' : 'integrations.byog.check_pending',
        verified
          ? 'Checked tenant Stripe customer payments: ready'
          : 'Checked tenant Stripe customer payments: billing readiness verification required',
        actorUserId,
      );
      return verified
        ? { ok: true, provider: toByogProviderSlug(provider), liveMutation: false, connection: this.toSafeByogRow(result.credential) }
        : {
            ok: false,
            provider: toByogProviderSlug(provider),
            category: 'provider_verification_required',
            liveMutation: false,
          };
    }
    const verified =
      this.isLocalPaymentSetup(provider) ||
      (descriptor.supportsInboundWebhook && Boolean(result.credential.lastWebhookReceivedAt));
    if (!verified) {
      await this.audit.log(tenantId, 'integrations.byog.check_pending', `Checked ${provider}: provider verification still required`, actorUserId);
      return {
        ok: false,
        provider: toByogProviderSlug(provider),
        category: 'provider_verification_required',
        liveMutation: false,
      };
    }
    const row = await (this.prisma as any).integrationCredential.update({
      where: {
        tenantId_provider_scope_scopeOwnerKey: { tenantId, provider, scope, scopeOwnerKey },
      },
      data: { status: 'CONNECTED', lastVerifiedAt: new Date(), lastErrorCategory: null, updatedByUserId: actorUserId },
    });
    await this.audit.log(tenantId, 'integrations.byog.check', `Verified stored setup for ${provider}`, actorUserId);
    return { ok: true, provider: toByogProviderSlug(provider), liveMutation: false, connection: this.toSafeByogRow(row) };
  }

  async disconnectByogConnection(tenantId: string, actorUserId: string, role: string, providerInput: string, scopeInput?: string | null) {
    const provider = resolveByogProvider(providerInput);
    if (!provider) throw new BadRequestException('Unknown integration provider.');
    const scope = this.normalizeByogScope(scopeInput, provider);
    if (scope === 'USER' && ['VIEWER', 'READ_ONLY'].includes(String(role || ''))) {
      throw new ForbiddenException('This personal integration cannot be disconnected from the current role.');
    }
    const scopeOwnerKey = this.normalizeScopeOwnerKey(scope, scope === 'USER' ? actorUserId : null);
    await (this.prisma as any).integrationCredential.deleteMany({
      where: { tenantId, provider, scope, scopeOwnerKey },
    });
    await this.audit.log(tenantId, 'integrations.byog.disconnect', `Disconnected ${provider} ${toByogScopeLabel(scope)} integration`, actorUserId);
    return { ok: true, provider: toByogProviderSlug(provider) };
  }

  async handleInboundWebhook(providerInput: string, routeId: string, payload: Buffer, headers: Record<string, any>) {
    const db = this.prisma as any;
    const credential = await this.clientFactory.resolveWebhookRoute(providerInput, routeId);
    const secret = credential.encryptedSecretMaterial ? this.clientFactory.decryptSecretMaterial(credential.encryptedSecretMaterial) : null;
    if (!secret) {
      await db.integrationCredential.update({
        where: { id: credential.id },
        data: { lastErrorCategory: 'missing_webhook_secret' },
      });
      throw new ForbiddenException('Webhook signature was not accepted.');
    }

    const providedSignature =
      headers['x-mytitan-signature'] ||
      headers['x-provider-signature'] ||
      headers['x-signature'] ||
      headers['x-worldpay-signature'] ||
      headers['x-sumup-signature'];
    const valid = this.clientFactory.verifyHmacSignature({
      secret,
      payload,
      providedSignature,
    });
    if (!valid) {
      await db.integrationCredential.update({
        where: { id: credential.id },
        data: { lastErrorCategory: 'invalid_signature' },
      });
      throw new ForbiddenException('Webhook signature was not accepted.');
    }

    let body: any = {};
    try {
      body = JSON.parse(payload.toString('utf8') || '{}');
    } catch {
      body = {};
    }
    const eventId =
      String(body?.eventId || body?.id || headers['x-event-id'] || '').trim() ||
      crypto.createHash('sha256').update(payload).digest('hex');
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
      if (error?.code === 'P2002') {
        return { received: true, duplicate: true };
      }
      throw error;
    }

    try {
      const paymentProviders = new Set([
        'OPEN_BANKING', 'GOCARDLESS', 'WORLDPAY', 'SUMUP', 'ZETTLE', 'SQUARE',
        'PAYPAL_BUSINESS', 'REVOLUT_BUSINESS', 'ADYEN', 'MOLLIE', 'KLARNA',
      ]);
      const eventStatus = String(body?.status || body?.paymentStatus || '').trim().toLowerCase();
      const paymentRequestId = String(body?.paymentRequestId || body?.metadata?.paymentRequestId || '').trim();
      if (paymentProviders.has(String(credential.provider)) && paymentRequestId && ['paid', 'succeeded', 'payment_succeeded', 'completed'].includes(eventStatus)) {
        const request = await db.customerPaymentRequest.findFirst({
          where: { id: paymentRequestId, tenantId: credential.tenantId },
        });
        if (!request) throw new BadRequestException('Payment request was not found for this workspace.');
        const reportedAmount = Number(body?.amountCents ?? body?.amount?.value);
        if (Number.isFinite(reportedAmount) && Math.round(reportedAmount) !== Number(request.amountCents)) {
          throw new BadRequestException('Payment webhook amount does not match the request.');
        }
        await db.customerPaymentRequest.update({
          where: { id: request.id },
          data: {
            status: 'paid',
            paidAt: new Date(),
            providerEventId: eventId,
            providerState: eventStatus,
          },
        });
        await db.job.update({
          where: { id: request.jobId },
          data: { invoicePaidAt: new Date() },
        });
        await db.jobActivity.create({
          data: {
            companyId: credential.tenantId,
            jobId: request.jobId,
            eventType: 'payment.provider.confirmed',
            message: `${credential.provider} confirmed customer payment`,
            payloadJson: { paymentRequestId: request.id, providerEventId: eventId },
          },
        });
        await this.audit.log(credential.tenantId, 'payments.webhook.confirmed', `${credential.provider} confirmed payment request ${request.id}`, null);
      }

      if (credential.provider === 'WHATSAPP_BUSINESS') {
        const jobId = String(body?.jobId || body?.metadata?.jobId || '').trim();
        const message = String(body?.message?.text || body?.text || body?.message || '').trim().slice(0, 2000);
        if (jobId && message) {
          const job = await db.job.findFirst({
            where: { id: jobId, companyId: credential.tenantId },
            select: { id: true, jobRef: true },
          });
          if (!job) throw new BadRequestException('WhatsApp reply job was not found for this workspace.');
          await db.jobActivity.create({
            data: {
              companyId: credential.tenantId,
              jobId: job.id,
              eventType: 'communications.whatsapp.inbound',
              message,
              payloadJson: { providerEventId: eventId, direction: 'inbound', channel: 'whatsapp' },
            },
          });
          await this.notifications.notifyOperationalAlert({
            companyId: credential.tenantId,
            category: 'customer_messages',
            reasonKey: 'whatsapp_inbound_reply',
            title: `WhatsApp reply for ${job.jobRef || 'job'}`,
            body: message,
            severity: 'warning',
            recommendedAction: 'Open the job timeline and respond.',
            entityType: 'job',
            entityId: job.id,
            metaJson: { channel: 'whatsapp', providerEventId: eventId },
          });
          await this.audit.log(credential.tenantId, 'communications.whatsapp.inbound', `WhatsApp reply routed to job ${job.id}`, null);
        }
      }

      await db.integrationWebhookReceipt.update({
        where: { id: receipt.id },
        data: {
          status: 'processed',
          processedAt: new Date(),
          lastAttemptAt: new Date(),
          errorCategory: null,
        },
      });
      await db.integrationCredential.update({
        where: { id: credential.id },
        data: {
          lastWebhookReceivedAt: new Date(),
          lastErrorCategory: null,
        },
      });
      await this.audit.log(credential.tenantId, 'integrations.webhook.received', `${credential.provider} webhook ${eventType}`, null);
      return { received: true };
    } catch {
      await db.integrationWebhookReceipt.update({
        where: { id: receipt.id },
        data: {
          status: 'failed',
          errorCategory: 'processing_failed',
          lastAttemptAt: new Date(),
        },
      });
      await db.integrationCredential.update({
        where: { id: credential.id },
        data: {
          lastWebhookReceivedAt: new Date(),
          lastErrorCategory: 'processing_failed',
        },
      });
      return { received: true, deadLettered: true };
    }
  }
}
