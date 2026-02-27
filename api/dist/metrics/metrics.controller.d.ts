import { JwtPayload } from '../auth/auth.types';
import { MetricsService } from './metrics.service';
export declare class MetricsController {
    private readonly metrics;
    constructor(metrics: MetricsService);
    overview(user: JwtPayload): Promise<{
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
    }> | {
        jobsCreatedThisMonth: number;
        bookingsNext7Days: number;
        outstandingInvoices: {
            count: number;
            totalCents: number;
        };
        revenueThisMonth: number;
        aiUsageThisMonth: {
            requests: number;
            tokens: number;
        };
        storageUsageBytes: any;
    };
}
