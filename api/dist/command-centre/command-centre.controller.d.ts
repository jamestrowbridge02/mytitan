import { JwtPayload } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
export declare class CommandCentreController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    summary(user: JwtPayload): Promise<{
        quickActions: {
            key: string;
            label: string;
            href: string;
        }[];
        todayBookings: any;
        dueAndOverdueJobs: any;
        unpaidJobs: any;
        drafts: {
            jobs: any;
            crm: any;
        };
        money: {
            unpaidCount: any;
            unpaidTotalCents: any;
            subscriptionStatus: any;
        };
        setup: {
            guidedSetupCompletedAt: any;
            onboardingCompleted: boolean;
            onboardingStep: number;
        };
    }>;
    listViews(user: JwtPayload): Promise<any>;
    createView(user: JwtPayload, body: {
        name: string;
        filters: Record<string, any>;
        isDefault?: boolean;
    }): Promise<any>;
    updateView(user: JwtPayload, id: string, body: {
        name?: string;
        filters?: Record<string, any>;
        isDefault?: boolean;
    }): Promise<any>;
    deleteView(user: JwtPayload, id: string): Promise<{
        ok: boolean;
        message: string;
    } | {
        ok: boolean;
        message?: undefined;
    }>;
}
