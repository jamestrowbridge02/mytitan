import { JwtPayload } from "../auth/auth.types";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateAutomationsSettingsDto } from "./automations.dto";
export declare class AutomationsService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    private normalizeSettings;
    getSettings(tenantId: string): Promise<{
        bookingRemindersEnabled: boolean;
        approvalRequestEnabled: boolean;
        reviewRequestEnabled: boolean;
        deliveryMode: string;
    }>;
    updateSettings(user: JwtPayload, dto: UpdateAutomationsSettingsDto): Promise<{
        bookingRemindersEnabled: boolean;
        approvalRequestEnabled: boolean;
        reviewRequestEnabled: boolean;
        deliveryMode: string;
    }>;
    isApprovalRequestEnabled(tenantId: string): Promise<boolean>;
    getDeliveryMode(tenantId: string): Promise<"metadata_only" | "live_send">;
    isLiveSendEnabled(tenantId: string): Promise<boolean>;
    preview(tenantId: string, windowDays: number): Promise<{
        windowDays: number;
        bookingReminders: {
            reminders24h: any;
            reminders2h: any;
            total: any;
        };
        approvalRequests: {
            jobsAwaitingApproval: any;
        };
        reviewRequests: {
            jobsEligible: any;
        };
    }>;
}
