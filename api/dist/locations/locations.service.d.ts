import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertLocationDto } from './dto';
export declare class LocationsService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    private defaultHours;
    list(companyId: string): Promise<any>;
    create(companyId: string, userId: string, dto: UpsertLocationDto): Promise<any>;
    update(companyId: string, userId: string, id: string, dto: UpsertLocationDto): Promise<any>;
    archive(companyId: string, userId: string, id: string): Promise<any>;
    setOnlyMyLocation(companyId: string, userId: string, enabled: boolean): Promise<{
        ok: boolean;
        onlyMyLocation: boolean;
    }>;
}
