import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertCatalogItemDto } from './catalog.dto';
export declare class CatalogService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    list(tenantId: string): any;
    getById(tenantId: string, id: string): Promise<any>;
    create(tenantId: string, userId: string, dto: UpsertCatalogItemDto): Promise<any>;
    update(tenantId: string, userId: string, id: string, dto: UpsertCatalogItemDto): Promise<any>;
    remove(tenantId: string, userId: string, id: string): Promise<{
        deleted: boolean;
    }>;
}
