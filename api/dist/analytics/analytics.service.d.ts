import { PrismaService } from '../prisma/prisma.service';
type CashflowBucket = {
    count: number;
    amountCents: number;
};
type FunnelCounts = {
    bookings: number;
    jobs: number;
    invoiced: number;
    paid: number;
};
export declare class AnalyticsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private startOfDay;
    private endOfDay;
    private normalizeAggregate;
    private medianHours;
    getOpsInsights(companyId: string, windowDays: number): Promise<{
        windowDays: number;
        cashAtRisk7d: number;
        revenueCollected7d: number;
        workloadToday: {
            jobs: any;
            unassigned: any;
            overdue: any;
        };
        funnel7d: {
            bookings: any;
            jobs: any;
            invoiced: any;
            paid: any;
        };
    }>;
    getUtilization(companyId: string, windowDays: number): Promise<{
        userId: any;
        name: any;
        jobsAssigned: number;
        minutesScheduled: number;
        minutesFromBookings: number;
        minutesFromJobs: number;
        jobsWithoutEstimate: number;
        bookings: number;
    }[]>;
    getCashflow(companyId: string, windowDays: number): Promise<{
        windowDays: number;
        dueDatesSupported: boolean;
        overdue: any;
        dueThisWindow: any;
        paidToday: any;
        paymentInference?: undefined;
    } | {
        windowDays: number;
        dueDatesSupported: boolean;
        overdue: CashflowBucket;
        dueThisWindow: CashflowBucket;
        paidToday: CashflowBucket;
        paymentInference: string;
    }>;
    getFunnel(companyId: string, windowDays: number): Promise<{
        windowDays: number;
        counts: FunnelCounts;
        mediansHours: {
            bookingToJob: number;
            jobToInvoiced: number;
            invoicedToPaid: number;
        };
        dropoffs: {
            bookingsNotConverted: {
                cancelled: any;
                pending: any;
                noShow: number;
                other: any;
            };
            invoicesUnpaid: {
                total: any;
                overdue: any;
                notOverdue: number;
            };
        };
    }>;
}
export {};
