import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantSettingsDto } from './tenant.dto';
export declare class TenantService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    private normalizeRecipients;
    ensureTenantSettings(tenantId: string): Promise<any>;
    getSettings(tenantId: string): Promise<any>;
    updateSettings(tenantId: string, userId: string, role: string, dto: UpdateTenantSettingsDto): Promise<any>;
    saveUploadedLogo(tenantId: string, userId: string, fileName: string): Promise<{
        logoUrl: any;
    }>;
    setLogoUrl(tenantId: string, userId: string, logoUrl: string): Promise<{
        logoUrl: any;
    }>;
}
