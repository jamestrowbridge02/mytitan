import { JwtPayload } from '../auth/auth.types';
import { AnalyticsService } from './analytics.service';
export declare class AnalyticsController {
    private readonly analytics;
    constructor(analytics: AnalyticsService);
    getOpsInsights(user: JwtPayload, windowDays?: string): Promise<{
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
    getUtilization(user: JwtPayload, windowDays?: string): Promise<{
        userId: any;
        name: any;
        jobsAssigned: number;
        minutesScheduled: number;
        minutesFromBookings: number;
        minutesFromJobs: number;
        jobsWithoutEstimate: number;
        bookings: number;
    }[]>;
    getCashflow(user: JwtPayload, windowDays?: string): Promise<{
        windowDays: number;
        dueDatesSupported: boolean;
        overdue: any;
        dueThisWindow: any;
        paidToday: any;
        paymentInference?: undefined;
    } | {
        windowDays: number;
        dueDatesSupported: boolean;
        overdue: {
            count: number;
            amountCents: number;
        };
        dueThisWindow: {
            count: number;
            amountCents: number;
        };
        paidToday: {
            count: number;
            amountCents: number;
        };
        paymentInference: string;
    }>;
    getFunnel(user: JwtPayload, windowDays?: string): Promise<{
        windowDays: number;
        counts: {
            bookings: number;
            jobs: number;
            invoiced: number;
            paid: number;
        };
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
