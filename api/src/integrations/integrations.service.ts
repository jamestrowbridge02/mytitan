import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import crypto from 'crypto';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_PLAN_CODE, PLAN_DEFINITIONS } from '../billing/billing.constants';
import { isBillingEnforced } from '../common/billing-mode';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { encryptText } from './integrations.crypto';

export type IntegrationProviderKey = 'XERO' | 'QBO' | 'GOOGLE_CALENDAR';

type ProviderConfig = {
  clientId: string;
  clientSecret: string;
  redirectUrl: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
};

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly audit: AuditService,
  ) {}

  private getProviderConfig(provider: IntegrationProviderKey): ProviderConfig {
    if (provider === 'XERO') {
      const clientId = process.env.XERO_CLIENT_ID?.trim();
      const clientSecret = process.env.XERO_CLIENT_SECRET?.trim();
      const redirectUrl = process.env.XERO_REDIRECT_URL?.trim();
      if (!clientId || !clientSecret || !redirectUrl) {
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
      const redirectUrl = process.env.QBO_REDIRECT_URL?.trim();
      if (!clientId || !clientSecret || !redirectUrl) {
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
    if (!isBillingEnforced()) {
      if (provider === 'GOOGLE_CALENDAR') {
        const enabled = Boolean(settings.featureBookings ?? settings.bookingsEnabled);
        return { allowed: true, enabled };
      }
      const enabled = Boolean(settings.featureAccounting ?? settings.accountingEnabled);
      return { allowed: true, enabled };
    }

    if (provider === 'GOOGLE_CALENDAR') {
      const enabled = Boolean(settings.featureBookings ?? settings.bookingsEnabled);
      const allowed = Boolean(features.bookings_enabled);
      return { allowed, enabled };
    }

    const enabled = Boolean(settings.featureAccounting ?? settings.accountingEnabled);
    const allowed = Boolean(features.accounting_enabled);
    return { allowed, enabled };
  }

  async getStatus(tenantId: string, provider: IntegrationProviderKey) {
    const db = this.prisma as any;
    const connection = await db.integrationConnection.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    const access = await this.getFeatureAccess(tenantId, provider);

    return {
      provider,
      connected: Boolean(connection && connection.status === 'connected'),
      connectedAt: connection?.connectedAt ?? null,
      scopes: connection?.scopes ?? null,
      externalTenantId: connection?.externalTenantId ?? null,
      realmId: connection?.realmId ?? null,
      allowed: access.allowed,
      enabled: access.enabled,
    };
  }

  async createAuthUrl(tenantId: string, provider: IntegrationProviderKey) {
    const access = await this.getFeatureAccess(tenantId, provider);
    if (!access.allowed) {
      throw new ForbiddenException('Upgrade required to connect this integration.');
    }
    if (!access.enabled) {
      throw new ForbiddenException('Enable this integration in settings first.');
    }

    const config = this.getProviderConfig(provider);
    const state = crypto.randomBytes(18).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const db = this.prisma as any;
    await db.integrationAuthState.create({
      data: {
        tenantId,
        provider,
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

    return { url: `${config.authUrl}?${params.toString()}` };
  }

  private async exchangeToken(provider: IntegrationProviderKey, code: string) {
    const config = this.getProviderConfig(provider);
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

    const tokenData = await this.exchangeToken(provider, code);
    const accessToken = tokenData.access_token as string | undefined;
    const refreshToken = tokenData.refresh_token as string | undefined;

    if (!accessToken) {
      throw new BadRequestException('Missing access token');
    }

    let externalTenantId: string | null = null;
    if (provider === 'XERO') {
      try {
        const res = await fetch('https://api.xero.com/connections', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const connections = (await res.json()) as Array<{ tenantId: string }>;
        externalTenantId = connections?.[0]?.tenantId ?? null;
      } catch {
        externalTenantId = null;
      }
    }

    const encryptedAccess = encryptText(accessToken);
    const encryptedRefresh = refreshToken ? encryptText(refreshToken) : null;

    const scopeValue = tokenData.scope ?? this.getProviderConfig(provider).scopes.join(' ');
    await db.integrationConnection.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      update: {
        status: 'connected',
        accessTokenEncrypted: encryptedAccess,
        refreshTokenEncrypted: encryptedRefresh,
        scopes: scopeValue ?? null,
        externalTenantId,
        realmId: realmId ?? null,
        connectedAt: new Date(),
      },
      create: {
        tenantId,
        provider,
        status: 'connected',
        accessTokenEncrypted: encryptedAccess,
        refreshTokenEncrypted: encryptedRefresh,
        scopes: scopeValue ?? null,
        externalTenantId,
        realmId: realmId ?? null,
        connectedAt: new Date(),
      },
    });

    await this.audit.log(tenantId, 'integrations.connect', `Connected ${provider}`, null);

    return { ok: true, provider };
  }

  async disconnect(tenantId: string, provider: IntegrationProviderKey) {
    const db = this.prisma as any;
    await db.integrationConnection.deleteMany({ where: { tenantId, provider } });
    await this.audit.log(tenantId, 'integrations.disconnect', `Disconnected ${provider}`, null);
    return { ok: true };
  }

  async syncStub() {
    throw new BadRequestException('Not implemented');
  }
}
