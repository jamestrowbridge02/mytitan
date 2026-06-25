import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationConnectionScope, IntegrationCredentialStatus, TenantIntegrationProvider } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { hasPermission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { BYOG_PROVIDER_MAP, BYOG_PROVIDER_ORDER, resolveByogProvider, toByogProviderSlug, toByogScopeLabel } from './byog-integrations';
import { IntegrationClientFactory, ResolvedIntegrationClient } from './integration-client.factory';

type OrchestrationHealthKey =
  | 'connected'
  | 'needs_reconnecting'
  | 'webhook_not_seen'
  | 'setup_needed'
  | 'action_required'
  | 'working_normally';

type OrchestrationActionKey =
  | 'open_setup'
  | 'reconnect_tool'
  | 'verify_connection'
  | 'test_webhook_safely'
  | 'review_failed_events'
  | 'view_last_successful_update';

type SafeAction = {
  key: OrchestrationActionKey;
  label: string;
  variant: 'link' | 'action';
  href?: string;
  enabled: boolean;
  description: string;
};

type SafeCredentialRow = {
  id: string | null;
  provider: TenantIntegrationProvider;
  scope: IntegrationConnectionScope;
  scopeOwnerKey: string;
  userId: string | null;
  displayName: string | null;
  status: IntegrationCredentialStatus;
  metadataJson: Record<string, any>;
  routeId: string | null;
  lastVerifiedAt: Date | null;
  lastWebhookReceivedAt: Date | null;
  lastErrorCategory: string | null;
};

@Injectable()
export class IntegrationOrchestrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clientFactory: IntegrationClientFactory,
  ) {}

  private sanitizeObject(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const safe: Record<string, any> = {};
    for (const [key, value] of Object.entries(input as Record<string, any>)) {
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey || /(secret|token|key|password|credential|payload|signature|url)/i.test(normalizedKey)) {
        continue;
      }
      if (value == null) {
        safe[normalizedKey] = null;
        continue;
      }
      if (typeof value === 'string') {
        safe[normalizedKey] = value.trim().slice(0, 240);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        safe[normalizedKey] = value;
      } else if (Array.isArray(value)) {
        safe[normalizedKey] = value
          .filter((entry) => ['string', 'number', 'boolean'].includes(typeof entry))
          .map((entry) => (typeof entry === 'string' ? String(entry).trim().slice(0, 120) : entry))
          .slice(0, 20);
      }
    }
    return safe;
  }

  private normalizeErrorCategory(input?: string | null) {
    return String(input || '').trim().toLowerCase().replace(/[^a-z0-9_:-]/g, '').slice(0, 80) || null;
  }

  private normalizeScope(input: unknown, provider: TenantIntegrationProvider) {
    const raw = String(input || '').trim().toUpperCase();
    if (raw === 'USER' || raw === 'PERSONAL') return 'USER';
    if (raw === 'WORKSPACE' || raw === 'BUSINESS') return 'WORKSPACE';
    return BYOG_PROVIDER_MAP[provider]?.defaultScope || 'WORKSPACE';
  }

  private scopeOwnerKey(scope: IntegrationConnectionScope, userId?: string | null) {
    return scope === 'USER' ? String(userId || '').trim() : 'workspace';
  }

  private friendlyHealthLabel(input: OrchestrationHealthKey) {
    if (input === 'needs_reconnecting') return 'Reconnect needed';
    if (input === 'setup_needed') return 'Ready to use';
    if (input === 'connected' || input === 'working_normally') return 'Connected';
    return 'Needs attention';
  }

  private technicalHealthLabel(input: OrchestrationHealthKey) {
    if (input === 'needs_reconnecting') return 'needs reconnecting';
    if (input === 'webhook_not_seen') return 'webhook not seen';
    if (input === 'setup_needed') return 'setup needed';
    if (input === 'action_required') return 'action required';
    if (input === 'working_normally') return 'working normally';
    return 'connected';
  }

  private extractGrantedScopes(source: Record<string, any>) {
    const raw = [
      ...(Array.isArray(source.permissions) ? source.permissions : []),
      ...(Array.isArray(source.scopes) ? source.scopes : []),
      ...(Array.isArray(source.scopeList) ? source.scopeList : []),
      ...(typeof source.scope === 'string' ? String(source.scope).split(/[,\s]+/) : []),
    ];
    return Array.from(
      new Set(
        raw
          .map((value) => String(value || '').trim().toLowerCase())
          .filter(Boolean),
      ),
    );
  }

  private async recordEvent(input: {
    tenantId: string;
    provider: TenantIntegrationProvider;
    scope: IntegrationConnectionScope;
    scopeOwnerKey: string;
    userId?: string | null;
    action: string;
    safeCategory: string;
    result: string;
    message: string;
    metadata?: Record<string, any>;
  }) {
    await (this.prisma as any).integrationOrchestrationEvent.create({
      data: {
        tenantId: input.tenantId,
        provider: input.provider,
        scope: input.scope,
        scopeOwnerKey: input.scopeOwnerKey,
        userId: input.userId || null,
        action: input.action,
        safeCategory: input.safeCategory,
        result: input.result,
        message: input.message.slice(0, 240),
        metadataJson: this.sanitizeObject(input.metadata),
      },
    }).catch(() => undefined);

    await this.audit.log(
      input.tenantId,
      `integrations.orchestration.${input.action}`,
      `${input.provider} ${toByogScopeLabel(input.scope)} ${input.result}: ${input.message}`,
      input.userId || undefined,
    );
  }

  private async resolveRowForAction(tenantId: string, actorUserId: string, providerInput: string, scopeInput?: string | null) {
    const provider = resolveByogProvider(providerInput);
    if (!provider) {
      throw new BadRequestException('Unknown integration provider.');
    }
    const scope = this.normalizeScope(scopeInput, provider);
    const scopeOwnerKey = this.scopeOwnerKey(scope, scope === 'USER' ? actorUserId : null);
    if (scope === 'USER' && !scopeOwnerKey) {
      throw new ForbiddenException('This integration requires a current user context.');
    }
    const row = await (this.prisma as any).integrationCredential.findUnique({
      where: {
        tenantId_provider_scope_scopeOwnerKey: {
          tenantId,
          provider,
          scope,
          scopeOwnerKey,
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Integration orchestration state was not found.');
    }
    return {
      provider,
      scope,
      scopeOwnerKey,
      row: row as SafeCredentialRow,
    };
  }

  private buildSyntheticRow(provider: TenantIntegrationProvider, userId: string) {
    const descriptor = BYOG_PROVIDER_MAP[provider];
    return {
      id: null,
      provider,
      scope: descriptor.defaultScope,
      scopeOwnerKey: descriptor.defaultScope === 'USER' ? userId : 'workspace',
      userId: descriptor.defaultScope === 'USER' ? userId : null,
      displayName: null,
      status: 'SETUP_NEEDED' as IntegrationCredentialStatus,
      metadataJson: {},
      routeId: null,
      lastVerifiedAt: null,
      lastWebhookReceivedAt: null,
      lastErrorCategory: null,
    };
  }

  private buildActions(input: {
    row: SafeCredentialRow;
    canManage: boolean;
    healthKey: OrchestrationHealthKey;
  }): SafeAction[] {
    const descriptor = BYOG_PROVIDER_MAP[input.row.provider];
    const scope = toByogScopeLabel(input.row.scope);
    const setupDescription = scope === 'personal' ? 'Open your personal setup flow.' : 'Open the business setup flow.';
    return [
      {
        key: 'open_setup',
        label: 'Open setup',
        variant: 'link',
        href: descriptor.setupUrl,
        enabled: true,
        description: setupDescription,
      },
      {
        key: 'reconnect_tool',
        label: 'Reconnect tool',
        variant: 'link',
        href: descriptor.setupUrl,
        enabled: input.canManage && ['needs_reconnecting', 'action_required'].includes(input.healthKey),
        description: 'Return to setup without exposing stored credentials.',
      },
      {
        key: 'verify_connection',
        label: 'Verify connection',
        variant: 'action',
        enabled: input.canManage && input.row.status !== 'SETUP_NEEDED',
        description: 'Re-check credential availability without mutating the provider.',
      },
      {
        key: 'test_webhook_safely',
        label: 'Test webhook safely',
        variant: 'action',
        enabled: input.canManage && descriptor.supportsInboundWebhook && Boolean(input.row.routeId),
        description: 'Prepare a dry-run webhook check that does not mark the provider verified.',
      },
      {
        key: 'review_failed_events',
        label: 'Review failed events',
        variant: 'action',
        enabled: input.canManage,
        description: 'Review failed or dead-lettered webhook receipts only.',
      },
      {
        key: 'view_last_successful_update',
        label: 'View last successful update',
        variant: 'action',
        enabled: input.canManage,
        description: 'Inspect the most recent verified success signal for this provider.',
      },
    ];
  }

  private async buildMapRow(input: {
    row: SafeCredentialRow;
    tenantId: string;
    actorUserId: string;
    canManage: boolean;
    lastProcessedByCredential: Map<string, any>;
    lastFailedByCredential: Map<string, any>;
  }) {
    const { row, tenantId, actorUserId } = input;
    const descriptor = BYOG_PROVIDER_MAP[row.provider];
    const resolved = row.id
      ? await this.clientFactory.resolveScopedClient({
          tenantId,
          provider: row.provider,
          scope: row.scope,
          userId: row.scope === 'USER' ? actorUserId : null,
          scopeOwnerKey: row.scopeOwnerKey,
        })
      : { ok: false as const, provider: row.provider, category: 'not_found' as const };
    const credentialsValid = Boolean(resolved.ok);
    const receiptSuccess = row.id ? input.lastProcessedByCredential.get(row.id) : null;
    const receiptFailure = row.id ? input.lastFailedByCredential.get(row.id) : null;
    const grantedScopes = this.extractGrantedScopes({
      ...row.metadataJson,
      ...(resolved.ok ? resolved.payload : {}),
    });
    const requiredScopesPresent =
      descriptor.requiredScopes.length === 0
        ? true
        : descriptor.requiredScopes.every((scope) => grantedScopes.includes(scope.toLowerCase()));
    const webhookVerified = descriptor.supportsInboundWebhook ? Boolean(row.lastWebhookReceivedAt) : true;

    const healthKey: OrchestrationHealthKey =
      row.status === 'NEEDS_REAUTH'
        ? 'needs_reconnecting'
        : row.status === 'SETUP_NEEDED'
          ? 'setup_needed'
          : row.status === 'DISABLED' || row.status === 'ERROR'
            ? 'action_required'
            : row.lastErrorCategory
              ? 'action_required'
              : descriptor.supportsInboundWebhook && row.status === 'CONNECTED' && !row.lastWebhookReceivedAt
                ? 'webhook_not_seen'
                : credentialsValid
                  ? 'working_normally'
                  : 'action_required';

    const safeToAutomate =
      descriptor.supportsAutomation &&
      row.status === 'CONNECTED' &&
      credentialsValid &&
      webhookVerified &&
      requiredScopesPresent;

    const recommendedNextAction =
      healthKey === 'setup_needed'
        ? 'Open setup'
        : healthKey === 'needs_reconnecting'
          ? 'Reconnect tool'
          : healthKey === 'webhook_not_seen'
            ? 'Test webhook safely'
            : healthKey === 'action_required'
              ? 'Review failed events'
              : safeToAutomate
                ? 'Ready to automate next'
                : 'Verify connection';

    return {
      provider: toByogProviderSlug(row.provider),
      providerKey: row.provider,
      providerName: descriptor.advancedLabel,
      safeProviderName: descriptor.safeName,
      scope: toByogScopeLabel(row.scope),
      connected: row.status === 'CONNECTED',
      availableActions: this.buildActions({ row, canManage: input.canManage, healthKey }),
      requiredPermissions: descriptor.requiredPermissions,
      lastVerified: row.lastVerifiedAt,
      webhookHealth: {
        status: descriptor.supportsInboundWebhook ? (row.lastWebhookReceivedAt ? 'verified' : row.routeId ? 'not_seen' : 'not_configured') : 'not_applicable',
        label:
          descriptor.supportsInboundWebhook
            ? row.lastWebhookReceivedAt
              ? 'Connected'
              : row.routeId
                ? 'Needs attention'
                : 'Ready to use'
            : 'Connected',
      },
      automationSafeStatus: safeToAutomate ? 'yes' : 'no',
      healthStatus: healthKey,
      healthLabel: this.friendlyHealthLabel(healthKey),
      technicalStatus: this.technicalHealthLabel(healthKey),
      lastSuccessfulUpdateAt: receiptSuccess?.processedAt || row.lastVerifiedAt || null,
      lastSuccessfulUpdateType: receiptSuccess?.eventType || (row.lastVerifiedAt ? 'credential_verification' : null),
      recommendedNextAction,
      diagnostics: {
        supportsAutomation: descriptor.supportsAutomation,
        credentialsValid,
        webhookVerified,
        requiredScopesPresent,
        requiredScopes: descriptor.requiredScopes,
        grantedScopes,
        lastEventReceivedAt: row.lastWebhookReceivedAt,
        lastErrorCategory: this.normalizeErrorCategory(row.lastErrorCategory),
        lastFailedEventAt: receiptFailure?.lastAttemptAt || receiptFailure?.receivedAt || null,
      },
      automationReadiness: {
        providerSupportsAutomation: descriptor.supportsAutomation,
        credentialsValid,
        webhookVerified,
        requiredScopesPresent,
        lastEventReceivedAt: row.lastWebhookReceivedAt,
        safeToAutomate,
      },
    };
  }

  async getOrchestrationMap(tenantId: string, actorUserId: string, role: string) {
    const canManage = hasPermission(role as any, 'settings.manage');
    const rows = (await (this.prisma as any).integrationCredential.findMany({
      where: {
        tenantId,
        OR: [
          { scope: 'WORKSPACE' },
          { scope: 'USER', userId: actorUserId },
        ],
      },
      orderBy: [{ scope: 'asc' }, { provider: 'asc' }],
    })) as SafeCredentialRow[];

    const visibleProviders = BYOG_PROVIDER_ORDER.filter((provider) => {
      const descriptor = BYOG_PROVIDER_MAP[provider];
      return descriptor.defaultScope === 'WORKSPACE' || !['VIEWER', 'READ_ONLY'].includes(String(role || ''));
    });
    const rowMap = new Map(
      rows.map((row: SafeCredentialRow) => [`${row.provider}:${row.scopeOwnerKey}`, row]),
    );
    const credentialIds = rows.map((row: SafeCredentialRow) => row.id).filter(Boolean);
    const receipts = credentialIds.length
      ? await (this.prisma as any).integrationWebhookReceipt.findMany({
          where: {
            tenantId,
            integrationCredentialId: { in: credentialIds },
          },
          orderBy: [{ processedAt: 'desc' }, { receivedAt: 'desc' }],
          take: 200,
          select: {
            integrationCredentialId: true,
            eventType: true,
            status: true,
            errorCategory: true,
            processedAt: true,
            receivedAt: true,
            lastAttemptAt: true,
          },
        })
      : [];

    const lastProcessedByCredential = new Map<string, any>();
    const lastFailedByCredential = new Map<string, any>();
    for (const receipt of receipts) {
      const key = String(receipt.integrationCredentialId || '');
      if (receipt.status === 'processed' && !lastProcessedByCredential.has(key)) {
        lastProcessedByCredential.set(key, receipt);
      }
      if ((receipt.status === 'failed' || receipt.errorCategory) && !lastFailedByCredential.has(key)) {
        lastFailedByCredential.set(key, receipt);
      }
    }

    const providers = await Promise.all(
      visibleProviders.map((provider) =>
        this.buildMapRow({
          row: rowMap.get(`${provider}:${this.scopeOwnerKey(BYOG_PROVIDER_MAP[provider].defaultScope, actorUserId)}`) || this.buildSyntheticRow(provider, actorUserId),
          tenantId,
          actorUserId,
          canManage,
          lastProcessedByCredential,
          lastFailedByCredential,
        }),
      ),
    );

    const summary = {
      connected: providers.filter((row) => row.healthLabel === 'Connected').length,
      needsAttention: providers.filter((row) => row.healthLabel === 'Needs attention').length,
      readyToUse: providers.filter((row) => row.healthLabel === 'Ready to use').length,
      reconnectNeeded: providers.filter((row) => row.healthLabel === 'Reconnect needed').length,
      automationReady: providers.filter((row) => row.automationReadiness.safeToAutomate).length,
    };

    const recommendedNextAction =
      providers.find((row) => row.recommendedNextAction === 'Reconnect tool')?.recommendedNextAction ||
      providers.find((row) => row.recommendedNextAction === 'Test webhook safely')?.recommendedNextAction ||
      providers.find((row) => row.recommendedNextAction === 'Open setup')?.recommendedNextAction ||
      'Verify connection';

    return {
      summary,
      recommendedNextAction,
      providers,
    };
  }

  async verifyConnection(tenantId: string, actorUserId: string, providerInput: string, scopeInput?: string | null) {
    const resolved = await this.resolveRowForAction(tenantId, actorUserId, providerInput, scopeInput);
    const client = await this.clientFactory.resolveScopedClient({
      tenantId,
      provider: resolved.provider,
      scope: resolved.scope,
      userId: resolved.scope === 'USER' ? actorUserId : null,
      scopeOwnerKey: resolved.scopeOwnerKey,
    });
    let failureCategory: string | null = null;
    if (!client.ok) {
      failureCategory = (client as Extract<ResolvedIntegrationClient, { ok: false }>).category;
    }
    await (this.prisma as any).integrationCredential.update({
      where: { id: resolved.row.id },
      data: {
        lastVerifiedAt: client.ok ? new Date() : resolved.row.lastVerifiedAt,
        lastErrorCategory: failureCategory,
      },
    });
    await this.recordEvent({
      tenantId,
      provider: resolved.provider,
      scope: resolved.scope,
      scopeOwnerKey: resolved.scopeOwnerKey,
      userId: actorUserId,
      action: 'verify_connection',
      safeCategory: 'verification',
      result: client.ok ? 'verified' : 'failed_closed',
      message: client.ok ? 'Credential verification completed safely.' : `Credential verification failed closed (${failureCategory}).`,
      metadata: client.ok ? { status: resolved.row.status } : { category: failureCategory },
    });

    return {
      ok: client.ok,
      provider: toByogProviderSlug(resolved.provider),
      scope: toByogScopeLabel(resolved.scope),
      result: client.ok ? 'verified' : 'failed_closed',
      category: client.ok ? 'verification' : failureCategory,
      verifiedAt: client.ok ? new Date().toISOString() : resolved.row.lastVerifiedAt?.toISOString() || null,
      message: client.ok ? 'Connection verified safely.' : 'Connection verification failed closed.',
    };
  }

  async testWebhookSafely(tenantId: string, actorUserId: string, providerInput: string, scopeInput?: string | null) {
    const resolved = await this.resolveRowForAction(tenantId, actorUserId, providerInput, scopeInput);
    const descriptor = BYOG_PROVIDER_MAP[resolved.provider];
    if (!descriptor.supportsInboundWebhook) {
      throw new BadRequestException('This provider does not expose inbound webhook verification.');
    }
    const client = await this.clientFactory.resolveScopedClient({
      tenantId,
      provider: resolved.provider,
      scope: resolved.scope,
      userId: resolved.scope === 'USER' ? actorUserId : null,
      scopeOwnerKey: resolved.scopeOwnerKey,
    });
    const hasSecret = Boolean(client.ok && client.secretMaterial && resolved.row.routeId);
    await this.recordEvent({
      tenantId,
      provider: resolved.provider,
      scope: resolved.scope,
      scopeOwnerKey: resolved.scopeOwnerKey,
      userId: actorUserId,
      action: 'test_webhook_safely',
      safeCategory: 'webhook_dry_run',
      result: hasSecret ? 'dry_run_ready' : 'not_ready',
      message: hasSecret
        ? 'Prepared a dry-run webhook route check without marking the provider verified.'
        : 'Webhook dry-run is not ready because the route is not safely configured.',
      metadata: {
        routeReady: hasSecret,
        routeId: resolved.row.routeId,
      },
    });

    return {
      ok: hasSecret,
      provider: toByogProviderSlug(resolved.provider),
      scope: toByogScopeLabel(resolved.scope),
      mode: 'dry_run',
      routeReady: hasSecret,
      routeId: resolved.row.routeId,
      routePath: `/integrations/webhooks/${toByogProviderSlug(resolved.provider)}/${resolved.row.routeId}`,
      expectedSignatureHeader: 'x-provider-signature',
      sampleEvent: {
        id: 'dry_run_example',
        type: 'integration.test',
      },
      message: hasSecret
        ? 'Dry-run route check is ready. This does not mark webhook health verified or enable automation.'
        : 'Dry-run route check is blocked until the webhook route is safely configured.',
    };
  }

  async listFailedEvents(tenantId: string, actorUserId: string, providerInput: string, scopeInput?: string | null) {
    const resolved = await this.resolveRowForAction(tenantId, actorUserId, providerInput, scopeInput);
    const rows = await (this.prisma as any).integrationWebhookReceipt.findMany({
      where: {
        tenantId,
        integrationCredentialId: resolved.row.id,
        OR: [
          { status: 'failed' },
          { errorCategory: { not: null } },
        ],
      },
      orderBy: { receivedAt: 'desc' },
      take: 20,
      select: {
        eventId: true,
        eventType: true,
        status: true,
        errorCategory: true,
        receivedAt: true,
        lastAttemptAt: true,
      },
    });
    await this.recordEvent({
      tenantId,
      provider: resolved.provider,
      scope: resolved.scope,
      scopeOwnerKey: resolved.scopeOwnerKey,
      userId: actorUserId,
      action: 'review_failed_events',
      safeCategory: 'diagnostics',
      result: rows.length ? 'failed_events_found' : 'no_failed_events',
      message: rows.length ? 'Reviewed failed provider events safely.' : 'No failed provider events were found.',
      metadata: { failedEventCount: rows.length },
    });
    return {
      provider: toByogProviderSlug(resolved.provider),
      scope: toByogScopeLabel(resolved.scope),
      count: rows.length,
      events: rows,
    };
  }

  async getLastSuccessfulUpdate(tenantId: string, actorUserId: string, providerInput: string, scopeInput?: string | null) {
    const resolved = await this.resolveRowForAction(tenantId, actorUserId, providerInput, scopeInput);
    const receipt = await (this.prisma as any).integrationWebhookReceipt.findFirst({
      where: {
        tenantId,
        integrationCredentialId: resolved.row.id,
        status: 'processed',
      },
      orderBy: { processedAt: 'desc' },
      select: {
        eventType: true,
        processedAt: true,
        receivedAt: true,
      },
    });
    const successAt = receipt?.processedAt || resolved.row.lastVerifiedAt || null;
    await this.recordEvent({
      tenantId,
      provider: resolved.provider,
      scope: resolved.scope,
      scopeOwnerKey: resolved.scopeOwnerKey,
      userId: actorUserId,
      action: 'view_last_successful_update',
      safeCategory: 'diagnostics',
      result: successAt ? 'success_visible' : 'no_success_signal',
      message: successAt ? 'Last successful provider update reviewed safely.' : 'No successful provider update was available.',
      metadata: {
        source: receipt?.eventType ? 'webhook_receipt' : resolved.row.lastVerifiedAt ? 'credential_verification' : 'none',
      },
    });
    return {
      provider: toByogProviderSlug(resolved.provider),
      scope: toByogScopeLabel(resolved.scope),
      successAt,
      source: receipt?.eventType ? 'webhook_receipt' : resolved.row.lastVerifiedAt ? 'credential_verification' : 'none',
      eventType: receipt?.eventType || null,
    };
  }
}
