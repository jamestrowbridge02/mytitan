import { JwtPayload } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
export declare class AuditController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(user: JwtPayload, page?: string, pageSize?: string, userId?: string, type?: string, from?: string, to?: string): Promise<{
        items: any;
        page: number;
        pageSize: number;
        total: any;
    }>;
}
