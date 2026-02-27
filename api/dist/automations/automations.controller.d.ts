import { JwtPayload } from "../auth/auth.types";
import { UpdateAutomationsSettingsDto } from "./automations.dto";
import { AutomationsService } from "./automations.service";
export declare class AutomationsController {
    private readonly automations;
    constructor(automations: AutomationsService);
    getSettings(user: JwtPayload): Promise<{
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
    preview(user: JwtPayload, windowDays?: string): Promise<{
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
