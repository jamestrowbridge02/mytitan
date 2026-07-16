import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildApiUrl } from '../common/public-url';
import { resolveBookingsEnabled } from '../common/workspace-features';
import { decryptText, encryptText } from './integrations.crypto';

const TOKEN_PREFIX = 'mtit';
const WEBHOOK_SECRET_PREFIX = 'whsec';
const DELIVERY_BODY_LIMIT = 4000;

export const INTEGRATION_PLATFORM_EVENT_TYPES = [
  'booking.converted',
  'job.created',
  'job.completed',
  'invoice.issued',
  'invoice.overdue',
  'quote.sent',
  'quote.approved',
  'technician.arrived',
  'portal.document_signed',
  'automation.rule_applied',
  'automation.rule_ran',
  'integration.test',
] as const;

export type IntegrationPlatformEventType = (typeof INTEGRATION_PLATFORM_EVENT_TYPES)[number];

type ActivityEventRecord = {
  id: string;
  type: string;
  label: string;
  at: Date;
  tenantId?: string | null;
  customerId?: string | null;
  jobId?: string | null;
  jobRef?: string | null;
  customerName?: string | null;
  status?: string | null;
  vehicleReg?: string | null;
  technicianId?: string | null;
  payloadJson?: any;
};

type PlatformEventPayload = {
  id: string;
  type: IntegrationPlatformEventType;
  occurredAt: string;
  label: string;
  tenantId: string;
  entity: {
    customerId: string | null;
    jobId: string | null;
    jobRef: string | null;
    customerName: string | null;
    status: string | null;
    vehicleReg: string | null;
    technicianId: string | null;
  };
  payload: Record<string, any> | null;
};

type DeliveryAttemptInput = {
  eventType: IntegrationPlatformEventType;
  eventId?: string | null;
  requestUrl: string;
  payloadJson: Record<string, any> | null;
};

@Injectable()
export class IntegrationPlatformService {
  private readonly logger = new Logger(IntegrationPlatformService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  private cleanName(value: string, label: string) {
    const clean = String(value || '').trim();
    if (!clean) {
      throw new BadRequestException(`${label} is required`);
    }
    return clean.slice(0, 120);
  }

  private normalizeEventTypes(input: unknown) {
    const values = Array.isArray(input) ? input : [];
    const normalized = Array.from(
      new Set(
        values
          .map((value) => String(value || '').trim())
          .filter((value): value is IntegrationPlatformEventType =>
            INTEGRATION_PLATFORM_EVENT_TYPES.includes(value as IntegrationPlatformEventType),
          ),
      ),
    );
    if (normalized.length === 0) {
      throw new BadRequestException('At least one subscribed event type is required');
    }
    return normalized;
  }

  private normalizeWebhookUrl(value: string) {
    let url: URL;
    try {
      url = new URL(String(value || '').trim());
    } catch {
      throw new BadRequestException('Webhook URL must be a valid URL');
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new BadRequestException('Webhook URL must use http or https');
    }
    return url.toString();
  }

  private generatePublicId() {
    return crypto.randomBytes(6).toString('hex');
  }

  private generateSecret(bytes = 18) {
    return crypto.randomBytes(bytes).toString('base64url');
  }

  private hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private buildApiToken(publicId: string) {
    const secret = this.generateSecret(24);
    return `${TOKEN_PREFIX}_${publicId}_${secret}`;
  }

  private buildWebhookSecret() {
    return `${WEBHOOK_SECRET_PREFIX}_${this.generateSecret(24)}`;
  }

  private signWebhook(secret: string, payload: string) {
    return `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
  }

  private mapActivityToPlatformEvent(activity: ActivityEventRecord): PlatformEventPayload | null {
    if (!activity.tenantId) return null;
    const mappedType = (() => {
      switch (activity.type) {
        case 'booking.converted':
          return 'booking.converted';
        case 'job.created':
          return 'job.created';
        case 'job.completed':
          return 'job.completed';
        case 'billing.invoice.issued':
          return 'invoice.issued';
        case 'billing.invoice.overdue':
          return 'invoice.overdue';
        case 'quote.sent':
          return 'quote.sent';
        case 'quote.approved':
          return 'quote.approved';
        case 'technician.arrived':
          return 'technician.arrived';
        case 'portal.document_signed':
          return 'portal.document_signed';
        case 'automation.rule_applied':
          return 'automation.rule_applied';
        case 'automation.rule_run':
          return 'automation.rule_ran';
        case 'integration.test':
          return 'integration.test';
        default:
          return null;
      }
    })();

    if (!mappedType) return null;

    return {
      id: activity.id,
      type: mappedType,
      occurredAt: new Date(activity.at).toISOString(),
      label: activity.label,
      tenantId: activity.tenantId,
      entity: {
        customerId: activity.customerId ?? null,
        jobId: activity.jobId ?? null,
        jobRef: activity.jobRef ?? null,
        customerName: activity.customerName ?? null,
        status: activity.status ?? null,
        vehicleReg: activity.vehicleReg ?? null,
        technicianId: activity.technicianId ?? null,
      },
      payload:
        activity.payloadJson && typeof activity.payloadJson === 'object' && !Array.isArray(activity.payloadJson)
          ? activity.payloadJson
          : null,
    };
  }

  private serializeApiToken(row: any) {
    return {
      id: row.id,
      name: row.name,
      publicId: row.publicId,
      tokenPrefix: row.tokenPrefix,
      lastUsedAt: row.lastUsedAt ?? null,
      revokedAt: row.revokedAt ?? null,
      createdByUserId: row.createdByUserId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private serializeWebhookEndpoint(row: any) {
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      active: Boolean(row.active),
      subscribedEventTypes: Array.isArray(row.subscribedEventTypes) ? row.subscribedEventTypes : [],
      secretLastFour: row.secretLastFour ?? null,
      createdByUserId: row.createdByUserId ?? null,
      lastDeliveryAt: row.lastDeliveryAt ?? null,
      lastSuccessAt: row.lastSuccessAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private serializeWebhookDelivery(row: any) {
    return {
      id: row.id,
      endpointId: row.endpointId,
      endpointName: row.endpoint?.name ?? null,
      eventType: row.eventType,
      eventId: row.eventId ?? null,
      requestUrl: row.requestUrl,
      status: row.status,
      responseStatus: row.responseStatus ?? null,
      responseBody: row.responseBody ?? null,
      errorMessage: row.errorMessage ?? null,
      durationMs: row.durationMs ?? null,
      attemptedAt: row.attemptedAt ?? null,
      deliveredAt: row.deliveredAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private getEncryptionStatus() {
    const integrationKey = String(process.env.INTEGRATIONS_ENCRYPTION_KEY || '').trim();
    if (integrationKey) {
      return {
        configured: true,
        source: 'integrations_key',
        guidance: 'Webhook secrets are protected with the dedicated integrations key.',
      } as const;
    }
    return {
      configured: false,
      source: 'missing',
      guidance: 'Inject INTEGRATIONS_ENCRYPTION_KEY on the server before creating or rotating webhook secrets.',
    } as const;
  }

  private normalizeAutomationDeliveryMode(configJson: any): 'metadata_only' | 'live_send' {
    return configJson?.automations?.v1?.deliveryMode === 'live_send' ? 'live_send' : 'metadata_only';
  }

  async listWorkspaceModules(tenantId: string) {
    const settings = await this.prisma.tenantSetting.findUnique({
      where: { tenantId },
      select: {
        featureAccounting: true,
        accountingEnabled: true,
        featureBookings: true,
        bookingsEnabled: true,
      },
    });
    const accountingEnabled = Boolean(settings?.featureAccounting ?? settings?.accountingEnabled);
    return [
      {
        key: 'xero',
        name: 'Xero',
        description: 'Sync invoices and payouts to your accounting ledger.',
        configureUrl: '/dashboard/settings?tab=general',
        enabled: accountingEnabled,
        allowed: true,
        ownership: 'workspace',
      },
      {
        key: 'qbo',
        name: 'QuickBooks Online',
        description: 'Send invoices and payments straight into QBO.',
        configureUrl: '/dashboard/settings?tab=general',
        enabled: accountingEnabled,
        allowed: true,
        ownership: 'workspace',
      },
    ];
  }

  async listPersonalModules(tenantId: string, userId: string) {
    const settings = await this.prisma.tenantSetting.findUnique({
      where: { tenantId },
      select: {
        featureBookings: true,
        bookingsEnabled: true,
      },
    });
    return [
      {
        key: 'google',
        name: 'Google Calendar',
        description: 'Mirror your assigned bookings into your own calendar.',
        configureUrl: '/dashboard/integrations',
        enabled: resolveBookingsEnabled(settings),
        allowed: true,
        ownership: 'personal',
        currentUserId: userId,
      },
    ];
  }

  async updateWorkspaceModule(tenantId: string, key: string, enabled: boolean) {
    const moduleKey = String(key || '').trim().toLowerCase();
    const patch =
      moduleKey === 'google'
        ? { featureBookings: true, bookingsEnabled: true }
        : moduleKey === 'xero' || moduleKey === 'qbo'
          ? { featureAccounting: enabled, accountingEnabled: enabled }
          : null;
    if (!patch) {
      throw new BadRequestException('Unsupported integration module');
    }
    await this.prisma.tenantSetting.upsert({
      where: { tenantId },
      create: {
        tenantId,
        ...patch,
      },
      update: patch,
    });
    await this.audit.log(
      tenantId,
      'integrations.module.update',
      moduleKey === 'google' ? 'Google Calendar readiness reviewed' : `Integration module ${moduleKey} ${enabled ? 'enabled' : 'disabled'}`,
      null,
    );
    return { ok: true, enabled: moduleKey === 'google' ? true : enabled };
  }

  async listApiTokens(tenantId: string) {
    const rows = await (this.prisma as any).apiToken.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row: any) => this.serializeApiToken(row));
  }

  async createApiToken(tenantId: string, userId: string, name: string) {
    const cleanName = this.cleanName(name, 'Token name');
    let publicId = this.generatePublicId();
    let token = this.buildApiToken(publicId);
    let tokenHash = this.hashToken(token);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const created = await (this.prisma as any).apiToken.create({
          data: {
            tenantId,
            name: cleanName,
            publicId,
            tokenPrefix: `${TOKEN_PREFIX}_${publicId}`,
            tokenHash,
            createdByUserId: userId,
          },
        });
        await this.audit.log(tenantId, 'integrations.api_token.create', `Created API token ${cleanName}`, userId);
        return {
          token,
          tokenMeta: this.serializeApiToken(created),
        };
      } catch (error: any) {
        if (attempt === 4) throw error;
        publicId = this.generatePublicId();
        token = this.buildApiToken(publicId);
        tokenHash = this.hashToken(token);
      }
    }
    throw new BadRequestException('Unable to create API token');
  }

  async revokeApiToken(tenantId: string, userId: string, tokenId: string) {
    const existing = await (this.prisma as any).apiToken.findFirst({
      where: { id: tokenId, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('API token not found');
    }
    await (this.prisma as any).apiToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });
    await this.audit.log(tenantId, 'integrations.api_token.revoke', `Revoked API token ${existing.name}`, userId);
    return { ok: true };
  }

  async authenticateApiToken(rawToken: string) {
    const token = String(rawToken || '').trim();
    const match = token.match(/^mtit_([a-z0-9]+)_(.+)$/i);
    if (!match) {
      throw new UnauthorizedException('Invalid API token');
    }
    const [, publicId] = match;
    const row = await (this.prisma as any).apiToken.findFirst({
      where: {
        publicId,
        revokedAt: null,
      },
    });
    if (!row) {
      throw new UnauthorizedException('Invalid API token');
    }
    if (row.tokenHash !== this.hashToken(token)) {
      throw new UnauthorizedException('Invalid API token');
    }
    void (this.prisma as any).apiToken.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => undefined);
    return {
      tokenId: row.id,
      tenantId: row.tenantId,
      name: row.name,
      publicId: row.publicId,
    };
  }

  async listRecentPlatformActivity(tenantId: string, limit = 20) {
    const rows = await this.prisma.activityEvent.findMany({
      where: { tenantId },
      orderBy: { at: 'desc' },
      take: Math.max(1, Math.min(limit, 50)),
    });
    return rows
      .map((row) =>
        this.mapActivityToPlatformEvent({
          ...row,
          tenantId: row.tenantId,
        } as ActivityEventRecord),
      )
      .filter(Boolean);
  }

  async listWebhookEndpoints(tenantId: string) {
    const rows = await (this.prisma as any).webhookEndpoint.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row: any) => this.serializeWebhookEndpoint(row));
  }

  async createWebhookEndpoint(
    tenantId: string,
    userId: string,
    input: { name: string; url: string; subscribedEventTypes: unknown; active?: boolean },
  ) {
    const secret = this.buildWebhookSecret();
    const created = await (this.prisma as any).webhookEndpoint.create({
      data: {
        tenantId,
        name: this.cleanName(input.name, 'Webhook name'),
        url: this.normalizeWebhookUrl(input.url),
        subscribedEventTypes: this.normalizeEventTypes(input.subscribedEventTypes),
        active: input.active !== false,
        secretEncrypted: encryptText(secret),
        secretLastFour: secret.slice(-4),
        createdByUserId: userId,
      },
    });
    await this.audit.log(tenantId, 'integrations.webhook.create', `Created webhook endpoint ${created.name}`, userId);
    return {
      endpoint: this.serializeWebhookEndpoint(created),
      secret,
    };
  }

  async updateWebhookEndpoint(
    tenantId: string,
    userId: string,
    endpointId: string,
    input: { name?: string; url?: string; subscribedEventTypes?: unknown; active?: boolean; rotateSecret?: boolean },
  ) {
    const existing = await (this.prisma as any).webhookEndpoint.findFirst({
      where: { id: endpointId, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    const nextSecret = input.rotateSecret ? this.buildWebhookSecret() : null;
    const updated = await (this.prisma as any).webhookEndpoint.update({
      where: { id: endpointId },
      data: {
        name: input.name !== undefined ? this.cleanName(input.name, 'Webhook name') : undefined,
        url: input.url !== undefined ? this.normalizeWebhookUrl(input.url) : undefined,
        subscribedEventTypes:
          input.subscribedEventTypes !== undefined ? this.normalizeEventTypes(input.subscribedEventTypes) : undefined,
        active: input.active !== undefined ? Boolean(input.active) : undefined,
        secretEncrypted: nextSecret ? encryptText(nextSecret) : undefined,
        secretLastFour: nextSecret ? nextSecret.slice(-4) : undefined,
      },
    });
    await this.audit.log(tenantId, 'integrations.webhook.update', `Updated webhook endpoint ${updated.name}`, userId);
    return {
      endpoint: this.serializeWebhookEndpoint(updated),
      secret: nextSecret,
    };
  }

  async deleteWebhookEndpoint(tenantId: string, userId: string, endpointId: string) {
    const existing = await (this.prisma as any).webhookEndpoint.findFirst({
      where: { id: endpointId, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    await (this.prisma as any).webhookEndpoint.delete({
      where: { id: endpointId },
    });
    await this.audit.log(tenantId, 'integrations.webhook.delete', `Deleted webhook endpoint ${existing.name}`, userId);
    return { ok: true };
  }

  async listWebhookDeliveries(tenantId: string, options?: { endpointId?: string | null; limit?: number }) {
    const rows = await (this.prisma as any).webhookDelivery.findMany({
      where: {
        tenantId,
        endpointId: options?.endpointId || undefined,
      },
      include: {
        endpoint: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(Number(options?.limit || 25), 100)),
    });
    return rows.map((row: any) => this.serializeWebhookDelivery(row));
  }

  async getAdminHealth(tenantId: string) {
    const [tenantSetting, automationsSetting, endpoints, recentDeliveries, xeroConnections, xeroPendingSelections, xeroErrorConnections, accountingRequestEvents] = await Promise.all([
      this.prisma.tenantSetting.findUnique({
        where: { tenantId },
        select: {
          bookingsEnabled: true,
          featureBookings: true,
          accountingEnabled: true,
          featureAccounting: true,
        },
      }),
      (this.prisma as any).automationsSetting.findUnique({
        where: { tenantId },
        select: { configJson: true },
      }),
      (this.prisma as any).webhookEndpoint.findMany({
        where: { tenantId },
        select: {
          id: true,
          active: true,
          lastSuccessAt: true,
        },
      }),
      (this.prisma as any).webhookDelivery.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          status: true,
        },
      }),
      (this.prisma as any).integrationConnection.count({
        where: { tenantId, provider: 'XERO' },
      }),
      (this.prisma as any).integrationConnection.count({
        where: { tenantId, provider: 'XERO', status: 'organization_selection_required' },
      }),
      (this.prisma as any).integrationConnection.count({
        where: { tenantId, provider: 'XERO', OR: [{ status: { in: ['needs_reconnect', 'needs_reauth'] } }, { healthState: { in: ['error', 'needs_attention'] } }] },
      }),
      (this.prisma as any).auditEvent.count({
        where: {
          companyId: tenantId,
          type: 'support.request',
          message: { contains: 'Integration' },
        },
      }),
    ]);

    const encryption = this.getEncryptionStatus();
    const smtp = await this.email.getReadiness(tenantId);
    const deliveryMode = this.normalizeAutomationDeliveryMode(automationsSetting?.configJson || null);
    const failedRecentDeliveries = recentDeliveries.filter((row: any) => row.status === 'FAILED').length;
    const lastSuccessAt =
      endpoints
        .map((row: any) => row.lastSuccessAt)
        .filter(Boolean)
        .sort((left: Date, right: Date) => right.getTime() - left.getTime())[0] ?? null;

    const webhookState = !endpoints.length
      ? 'disabled'
      : failedRecentDeliveries > 0 || encryption.source !== 'integrations_key'
        ? 'needs_attention'
        : 'connected';
    const automationState =
      deliveryMode === 'metadata_only'
        ? 'disabled'
        : smtp.canSend
          ? 'connected'
          : 'needs_attention';

    return {
      webhookPlatform: {
        state: webhookState,
        endpointCount: endpoints.length,
        activeEndpointCount: endpoints.filter((row: any) => row.active).length,
        failedRecentDeliveries,
        lastSuccessAt,
        encryptionConfigured: encryption.configured,
        encryptionSource: encryption.source,
        guidance:
          webhookState === 'connected'
            ? 'Webhook delivery is ready for active endpoints in this workspace.'
            : !endpoints.length
              ? 'Create an endpoint when an external system is ready to receive events.'
              : encryption.guidance,
      },
      automationDelivery: {
        state: automationState,
        deliveryMode,
        smtpConfigured: smtp.canSend,
        smtpSource: smtp.source,
        guidance:
          deliveryMode === 'metadata_only'
            ? 'Automations are recording activity only. Enable live send when delivery channels are ready.'
            : smtp.guidance,
      },
      moduleFlags: {
        bookingsEnabled: resolveBookingsEnabled(tenantSetting),
        accountingEnabled: Boolean(tenantSetting?.featureAccounting ?? tenantSetting?.accountingEnabled),
      },
      accountingReadiness: {
        xero: {
          clientIdPresent: Boolean(String(process.env.XERO_CLIENT_ID || '').trim()),
          clientSecretPresent: Boolean(String(process.env.XERO_CLIENT_SECRET || '').trim()),
          redirectUrl: String(process.env.XERO_REDIRECT_URI || process.env.XERO_REDIRECT_URL || '').trim() || buildApiUrl('/integrations/xero/callback'),
          encryptionKeyPresent: Boolean(String(process.env.INTEGRATIONS_ENCRYPTION_KEY || '').trim()),
          callbackReachability: 'configured_route',
          connectionStateCounts: {
            total: xeroConnections,
            pendingOrganisationSelections: xeroPendingSelections,
            staleOrErrorConnections: xeroErrorConnections,
          },
          lastSafeVerification: 'presence_and_connection_count_only',
        },
        unsupportedProviders: [
          { provider: 'QuickBooks', implementationState: 'planned_or_scaffolded', owner: 'Accounting integrations', readinessRequirements: ['production OAuth credentials', 'mapping review', 'tenant-gated sync tests'], requestCount: accountingRequestEvents, roadmapClassification: 'coming_soon' },
          { provider: 'Sage', implementationState: 'not_implemented', owner: 'Accounting integrations', readinessRequirements: ['OAuth journey', 'mapping review', 'tenant-gated sync tests'], requestCount: accountingRequestEvents, roadmapClassification: 'coming_soon' },
        ],
      },
    };
  }

  private async queueWebhookDeliveryAttempt(tenantId: string, endpoint: any, attempt: DeliveryAttemptInput) {
    const payload =
      attempt.payloadJson &&
      typeof attempt.payloadJson === 'object' &&
      !Array.isArray(attempt.payloadJson)
        ? (attempt.payloadJson as PlatformEventPayload)
        : null;
    if (!payload || !INTEGRATION_PLATFORM_EVENT_TYPES.includes(attempt.eventType)) {
      throw new BadRequestException('Webhook delivery payload could not be retried safely');
    }
    const delivery = await (this.prisma as any).webhookDelivery.create({
      data: {
        tenantId,
        endpointId: endpoint.id,
        eventType: attempt.eventType,
        eventId: attempt.eventId || payload.id,
        requestUrl: endpoint.url || attempt.requestUrl,
        payloadJson: payload as any,
        status: 'PENDING',
      },
    });
    void this.deliverWebhook(delivery.id, endpoint, payload);
    return this.serializeWebhookDelivery(delivery);
  }

  private async deliverWebhook(deliveryId: string, endpoint: any, event: PlatformEventPayload) {
    const payload = JSON.stringify(event);
    const startedAt = Date.now();
    let signature: string | null = null;
    try {
      const secret = endpoint.secretEncrypted ? decryptText(endpoint.secretEncrypted) : null;
      signature = secret ? this.signWebhook(secret, payload) : null;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let response: Response;
      try {
        response = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-mytitan-event': event.type,
            'x-mytitan-delivery-id': deliveryId,
            ...(signature ? { 'x-mytitan-signature': signature } : {}),
          },
          body: payload,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const body = (await response.text()).slice(0, DELIVERY_BODY_LIMIT);
      const success = response.ok;
      const now = new Date();
      await (this.prisma as any).webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: success ? 'SUCCESS' : 'FAILED',
          signature,
          responseStatus: response.status,
          responseBody: body || null,
          errorMessage: success ? null : `HTTP ${response.status}`,
          durationMs: Date.now() - startedAt,
          attemptedAt: now,
          deliveredAt: success ? now : null,
        },
      });
      await (this.prisma as any).webhookEndpoint.update({
        where: { id: endpoint.id },
        data: {
          lastDeliveryAt: now,
          lastSuccessAt: success ? now : endpoint.lastSuccessAt ?? null,
        },
      });
    } catch (error: any) {
      const now = new Date();
      await (this.prisma as any).webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'FAILED',
          signature,
          errorMessage: String(error?.message || 'Webhook delivery failed').slice(0, DELIVERY_BODY_LIMIT),
          durationMs: Date.now() - startedAt,
          attemptedAt: now,
          deliveredAt: null,
        },
      }).catch(() => undefined);
      await (this.prisma as any).webhookEndpoint.update({
        where: { id: endpoint.id },
        data: {
          lastDeliveryAt: now,
        },
      }).catch(() => undefined);
      this.logger.warn(`webhook_delivery_failed endpoint=${endpoint.id} delivery=${deliveryId} error=${String(error?.message || error)}`);
    }
  }

  async publishPlatformEvent(event: PlatformEventPayload) {
    const endpoints = await (this.prisma as any).webhookEndpoint.findMany({
      where: {
        tenantId: event.tenantId,
        active: true,
        subscribedEventTypes: {
          has: event.type,
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!endpoints.length) {
      return { matched: 0 };
    }
    await Promise.all(
      endpoints.map(async (endpoint: any) => {
        const delivery = await (this.prisma as any).webhookDelivery.create({
          data: {
            tenantId: event.tenantId,
            endpointId: endpoint.id,
            eventType: event.type,
            eventId: event.id,
            requestUrl: endpoint.url,
            payloadJson: event as any,
            status: 'PENDING',
          },
        });
        void this.deliverWebhook(delivery.id, endpoint, event);
      }),
    );
    return { matched: endpoints.length };
  }

  async publishActivityEvent(activity: ActivityEventRecord) {
    const event = this.mapActivityToPlatformEvent(activity);
    if (!event) {
      return { matched: 0 };
    }
    return this.publishPlatformEvent(event);
  }

  async sendTestWebhook(tenantId: string, userId: string, endpointId: string) {
    const endpoint = await (this.prisma as any).webhookEndpoint.findFirst({
      where: { id: endpointId, tenantId },
    });
    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    await this.audit.log(tenantId, 'integrations.webhook.test', `Sent test webhook for ${endpoint.name}`, userId);
    return this.publishPlatformEvent({
      id: `integration-test-${Date.now()}`,
      type: 'integration.test',
      occurredAt: new Date().toISOString(),
      label: `Integration test webhook for ${endpoint.name}`,
      tenantId,
      entity: {
        customerId: null,
        jobId: null,
        jobRef: null,
        customerName: null,
        status: null,
        vehicleReg: null,
        technicianId: null,
      },
      payload: {
        endpointId: endpoint.id,
        triggeredByUserId: userId,
      },
    });
  }

  async retryWebhookDelivery(tenantId: string, userId: string, deliveryId: string) {
    const delivery = await (this.prisma as any).webhookDelivery.findFirst({
      where: { id: deliveryId, tenantId },
      include: {
        endpoint: true,
      },
    });
    if (!delivery?.endpoint) {
      throw new NotFoundException('Webhook delivery not found');
    }
    const queued = await this.queueWebhookDeliveryAttempt(tenantId, delivery.endpoint, {
      eventType: delivery.eventType,
      eventId: delivery.eventId ?? null,
      requestUrl: delivery.requestUrl,
      payloadJson:
        delivery.payloadJson && typeof delivery.payloadJson === 'object' && !Array.isArray(delivery.payloadJson)
          ? delivery.payloadJson
          : null,
    });
    await this.audit.log(tenantId, 'integrations.webhook.retry', `Retried webhook delivery for ${delivery.endpoint.name}`, userId);
    return { ok: true, delivery: queued };
  }
}
