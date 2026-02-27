import { AuditService } from '../audit/audit.service';
import { AutomationsService } from '../automations/automations.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNotificationPreferenceDto } from './dto';
type NotificationInput = {
    type: string;
    title: string;
    body?: string;
    entityType?: string;
    entityId?: string;
    metaJson?: Record<string, any>;
};
export declare class NotificationsService {
    private readonly prisma;
    private readonly audit;
    private readonly automations;
    constructor(prisma: PrismaService, audit: AuditService, automations: AutomationsService);
    private waitLine;
    private sendSmtpCommand;
    private sendViaSmtp;
    private sendNotificationEmail;
    getPreferences(companyId: string, userId: string): Promise<any>;
    updatePreferences(companyId: string, userId: string, dto: UpdateNotificationPreferenceDto): Promise<any>;
    listRecent(companyId: string, userId: string, take?: number): Promise<any>;
    markRead(companyId: string, userId: string, id: string, read: boolean): Promise<any>;
    createForUsers(companyId: string, userIds: string[], input: NotificationInput): Promise<void>;
    notifyJobCompleted(companyId: string, jobId: string): Promise<void>;
    notifyPaymentReceived(companyId: string, jobId: string): Promise<void>;
    listByEntity(companyId: string, entityType: string, entityId: string): Promise<any>;
    private mapNotification;
    findByIdempotency(companyId: string, idempotencyKey: string): Promise<{
        id: any;
        entityType: any;
        entityId: any;
        channel: any;
        status: any;
        reasonKey: any;
        createdAt: any;
    }>;
    listCommsByTenant(companyId: string, options: {
        since?: Date;
        reasonKey?: string;
        reasonKeyPrefix?: string;
        status?: string;
        take?: number;
    }): Promise<any>;
    listCommsAutomationsAggregate(companyId: string, options: {
        since?: Date;
    }): Promise<{
        since: string;
        reminders: any;
        approval: any;
        reviews: any;
        failed: any;
    }>;
    sendEntityUpdate(companyId: string, actorUserId: string, payload: {
        entityType: string;
        entityId: string;
        templateKey: string;
        channel?: string;
        note?: string;
        to?: string;
        context?: Record<string, any>;
        idempotencyKey?: string;
    }): Promise<{
        id: any;
        entityType: any;
        entityId: any;
        channel: any;
        status: any;
        reasonKey: any;
        createdAt: any;
    }>;
}
export {};
