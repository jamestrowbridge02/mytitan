import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TradePackCode } from './trade-packs.data';
export declare class TradePacksService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    ensurePackDefinitions(): Promise<void>;
    private getPackOrThrow;
    private getPlanCode;
    listAvailable(tenantId: string): Promise<{
        code: TradePackCode;
        name: string;
        description: string;
        tags: string[];
        includes: string[];
        installed: boolean;
        planCode: string;
        planLimit: number;
    }[]>;
    getInstalled(tenantId: string): Promise<{
        items: any;
        count: any;
    }>;
    private assertPlanLimit;
    private seedCatalog;
    private seedTemplatePresets;
    private seedEmailTemplates;
    private seedBookingDefaults;
    private updateTenantDefaults;
    install(tenantId: string, userId: string, packCode: string): Promise<{
        ok: boolean;
        packCode: TradePackCode;
        planCode: string;
        installedCount: any;
        limit: number;
    }>;
    uninstall(tenantId: string, userId: string, packCode: string): Promise<{
        ok: boolean;
        packCode: TradePackCode;
        wasInstalled: boolean;
    }>;
}
