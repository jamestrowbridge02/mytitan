import { PrismaService } from '../prisma/prisma.service';
export declare class MetricsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private getMonthStart;
    getOverview(tenantId: string): Promise<{
        jobsCreatedThisMonth: any;
        bookingsNext7Days: any;
        outstandingInvoices: {
            count: any;
            totalCents: any;
        };
        revenueThisMonth: any;
        aiUsageThisMonth: {
            requests: any;
            tokens: any;
        };
        storageUsageBytes: any;
    }>;
}
