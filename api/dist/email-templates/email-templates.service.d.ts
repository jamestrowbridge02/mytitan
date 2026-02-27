import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertEmailTemplateDto } from './email-templates.dto';
export declare class EmailTemplatesService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    list(tenantId: string): any;
    getById(tenantId: string, id: string): Promise<any>;
    create(tenantId: string, userId: string, dto: UpsertEmailTemplateDto): Promise<any>;
    update(tenantId: string, userId: string, id: string, dto: UpsertEmailTemplateDto): Promise<any>;
    remove(tenantId: string, userId: string, id: string): Promise<{
        deleted: boolean;
    }>;
}
