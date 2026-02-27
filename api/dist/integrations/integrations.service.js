"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationsService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const audit_service_1 = require("../audit/audit.service");
const billing_constants_1 = require("../billing/billing.constants");
const prisma_service_1 = require("../prisma/prisma.service");
const tenant_service_1 = require("../tenant/tenant.service");
const integrations_crypto_1 = require("./integrations.crypto");
let IntegrationsService = class IntegrationsService {
    constructor(prisma, tenantService, audit) {
        this.prisma = prisma;
        this.tenantService = tenantService;
        this.audit = audit;
    }
    getProviderConfig(provider) {
        if (provider === 'XERO') {
            const clientId = process.env.XERO_CLIENT_ID?.trim();
            const clientSecret = process.env.XERO_CLIENT_SECRET?.trim();
            const redirectUrl = process.env.XERO_REDIRECT_URL?.trim();
            if (!clientId || !clientSecret || !redirectUrl) {
                throw new common_1.ServiceUnavailableException('Xero OAuth is not configured');
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
                throw new common_1.ServiceUnavailableException('QuickBooks OAuth is not configured');
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
            throw new common_1.ServiceUnavailableException('Google OAuth is not configured');
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
    async getFeatureAccess(tenantId, provider) {
        const db = this.prisma;
        const settings = await this.tenantService.ensureTenantSettings(tenantId);
        const subscription = await db.tenantSubscription.findUnique({
            where: { tenantId },
            include: { plan: true },
        });
        const plan = subscription?.plan ?? (await db.plan.findFirst({ where: { code: billing_constants_1.DEFAULT_PLAN_CODE } }));
        const features = (plan?.featuresJson ?? billing_constants_1.PLAN_DEFINITIONS[billing_constants_1.DEFAULT_PLAN_CODE].features);
        if (provider === 'GOOGLE_CALENDAR') {
            const enabled = Boolean(settings.featureBookings ?? settings.bookingsEnabled);
            const allowed = Boolean(features.bookings_enabled);
            return { allowed, enabled };
        }
        const enabled = Boolean(settings.featureAccounting ?? settings.accountingEnabled);
        const allowed = Boolean(features.accounting_enabled);
        return { allowed, enabled };
    }
    async getStatus(tenantId, provider) {
        const db = this.prisma;
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
    async createAuthUrl(tenantId, provider) {
        const access = await this.getFeatureAccess(tenantId, provider);
        if (!access.allowed) {
            throw new common_1.ForbiddenException('Upgrade required to connect this integration.');
        }
        if (!access.enabled) {
            throw new common_1.ForbiddenException('Enable this integration in settings first.');
        }
        const config = this.getProviderConfig(provider);
        const state = crypto_1.default.randomBytes(18).toString('hex');
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        const db = this.prisma;
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
    async exchangeToken(provider, code) {
        const config = this.getProviderConfig(provider);
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: config.redirectUrl,
        });
        const authHeader = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
        const headers = {
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
        const data = (await res.json());
        if (!res.ok) {
            throw new common_1.BadRequestException('OAuth token exchange failed');
        }
        return data;
    }
    async handleCallback(provider, code, state, realmId) {
        if (!code || !state) {
            throw new common_1.BadRequestException('Missing OAuth code/state');
        }
        const db = this.prisma;
        const authState = await db.integrationAuthState.findUnique({ where: { state } });
        if (!authState || authState.provider !== provider) {
            throw new common_1.BadRequestException('Invalid OAuth state');
        }
        if (authState.expiresAt < new Date()) {
            throw new common_1.BadRequestException('OAuth state expired');
        }
        await db.integrationAuthState.delete({ where: { state } });
        const tenantId = authState.tenantId;
        const tokenData = await this.exchangeToken(provider, code);
        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;
        if (!accessToken) {
            throw new common_1.BadRequestException('Missing access token');
        }
        let externalTenantId = null;
        if (provider === 'XERO') {
            try {
                const res = await fetch('https://api.xero.com/connections', {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                const connections = (await res.json());
                externalTenantId = connections?.[0]?.tenantId ?? null;
            }
            catch {
                externalTenantId = null;
            }
        }
        const encryptedAccess = (0, integrations_crypto_1.encryptText)(accessToken);
        const encryptedRefresh = refreshToken ? (0, integrations_crypto_1.encryptText)(refreshToken) : null;
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
    async disconnect(tenantId, provider) {
        const db = this.prisma;
        await db.integrationConnection.deleteMany({ where: { tenantId, provider } });
        await this.audit.log(tenantId, 'integrations.disconnect', `Disconnected ${provider}`, null);
        return { ok: true };
    }
    async syncStub() {
        throw new common_1.BadRequestException('Not implemented');
    }
};
exports.IntegrationsService = IntegrationsService;
exports.IntegrationsService = IntegrationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        tenant_service_1.TenantService,
        audit_service_1.AuditService])
], IntegrationsService);
//# sourceMappingURL=integrations.service.js.map