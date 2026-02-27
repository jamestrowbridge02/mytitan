import { PrismaService } from '../prisma/prisma.service';
export declare class AuditService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    log(companyId: string, type: string, message: string, userId?: string): Promise<void>;
}
