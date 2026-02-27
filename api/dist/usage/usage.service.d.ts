import { PrismaService } from '../prisma/prisma.service';
export declare class UsageService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getUsage(tenantId: string): Promise<{
        periodStart: Date;
        usage: any;
        limits: {
            aiRequestsLimitMonthly: any;
            aiTokensLimitMonthly: any;
            storageBytesLimit: any;
            jobsCreatedLimit: any;
        };
    }>;
}
