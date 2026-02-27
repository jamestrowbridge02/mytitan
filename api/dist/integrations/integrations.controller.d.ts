import type { Response } from 'express';
import { JwtPayload } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from './integrations.service';
export declare class IntegrationsController {
    private readonly integrations;
    private readonly prisma;
    constructor(integrations: IntegrationsService, prisma: PrismaService);
    private assertEmailVerified;
    statusXero(user: JwtPayload): Promise<{
        provider: import("./integrations.service").IntegrationProviderKey;
        connected: boolean;
        connectedAt: any;
        scopes: any;
        externalTenantId: any;
        realmId: any;
        allowed: boolean;
        enabled: boolean;
    }> | {
        provider: string;
        connected: boolean;
        allowed: boolean;
        enabled: boolean;
    };
    connectXero(user: JwtPayload): Promise<{
        url: string;
    }>;
    disconnectXero(user: JwtPayload): Promise<{
        ok: boolean;
    }>;
    syncXero(): void;
    statusQbo(user: JwtPayload): Promise<{
        provider: import("./integrations.service").IntegrationProviderKey;
        connected: boolean;
        connectedAt: any;
        scopes: any;
        externalTenantId: any;
        realmId: any;
        allowed: boolean;
        enabled: boolean;
    }> | {
        provider: string;
        connected: boolean;
        allowed: boolean;
        enabled: boolean;
    };
    connectQbo(user: JwtPayload): Promise<{
        url: string;
    }>;
    disconnectQbo(user: JwtPayload): Promise<{
        ok: boolean;
    }>;
    syncQbo(): void;
    statusGoogle(user: JwtPayload): Promise<{
        provider: import("./integrations.service").IntegrationProviderKey;
        connected: boolean;
        connectedAt: any;
        scopes: any;
        externalTenantId: any;
        realmId: any;
        allowed: boolean;
        enabled: boolean;
    }> | {
        provider: string;
        connected: boolean;
        allowed: boolean;
        enabled: boolean;
    };
    connectGoogle(user: JwtPayload): Promise<{
        url: string;
    }>;
    disconnectGoogle(user: JwtPayload): Promise<{
        ok: boolean;
    }>;
    syncGoogle(): void;
}
export declare class IntegrationsCallbackController {
    private readonly integrations;
    constructor(integrations: IntegrationsService);
    xeroCallback(code: string, state: string, res: Response): Promise<void>;
    qboCallback(code: string, state: string, realmId: string, res: Response): Promise<void>;
    googleCallback(code: string, state: string, res: Response): Promise<void>;
}
