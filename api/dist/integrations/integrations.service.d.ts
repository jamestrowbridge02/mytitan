import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
export type IntegrationProviderKey = 'XERO' | 'QBO' | 'GOOGLE_CALENDAR';
export declare class IntegrationsService {
    private readonly prisma;
    private readonly tenantService;
    private readonly audit;
    constructor(prisma: PrismaService, tenantService: TenantService, audit: AuditService);
    private getProviderConfig;
    private getFeatureAccess;
    getStatus(tenantId: string, provider: IntegrationProviderKey): Promise<{
        provider: IntegrationProviderKey;
        connected: boolean;
        connectedAt: any;
        scopes: any;
        externalTenantId: any;
        realmId: any;
        allowed: boolean;
        enabled: boolean;
    }>;
    createAuthUrl(tenantId: string, provider: IntegrationProviderKey): Promise<{
        url: string;
    }>;
    private exchangeToken;
    handleCallback(provider: IntegrationProviderKey, code?: string, state?: string, realmId?: string): Promise<{
        ok: boolean;
        provider: IntegrationProviderKey;
    }>;
    disconnect(tenantId: string, provider: IntegrationProviderKey): Promise<{
        ok: boolean;
    }>;
    syncStub(): Promise<void>;
}
