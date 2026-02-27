import { JwtPayload } from '../auth/auth.types';
import { MarkNotificationReadDto, UpdateNotificationPreferenceDto } from './dto';
import { NotificationsService } from './notifications.service';
export declare class NotificationsController {
    private readonly notifications;
    constructor(notifications: NotificationsService);
    list(user: JwtPayload): Promise<any>;
    listByEntity(user: JwtPayload, entityType: string, entityId: string): Promise<any>;
    listComms(user: JwtPayload, scope?: string, since?: string, reasonKey?: string, reasonKeyPrefix?: string, status?: string, aggregate?: string, limit?: string): Promise<any>;
    send(user: JwtPayload, idempotencyKey: string | undefined, body: {
        entityType?: string;
        entityId?: string;
        templateKey?: string;
        channel?: string;
        note?: string;
        to?: string;
        context?: Record<string, any>;
    }): Promise<{
        id: any;
        entityType: any;
        entityId: any;
        channel: any;
        status: any;
        reasonKey: any;
        createdAt: any;
    }>;
    preferences(user: JwtPayload): Promise<any>;
    updatePreferences(user: JwtPayload, dto: UpdateNotificationPreferenceDto): Promise<any>;
    markRead(user: JwtPayload, id: string, dto: MarkNotificationReadDto): Promise<any>;
}
