import { CRM_TASK_STATUS_INPUTS, TRADE_ACCOUNT_STATUSES } from '../common/constants';
export declare class UpsertTradeAccountDto {
    id?: string;
    name: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    creditLimit: number;
    outstandingBalance?: number;
    status?: (typeof TRADE_ACCOUNT_STATUSES)[number];
    nextActionType?: 'CALL' | 'EMAIL' | 'WHATSAPP' | 'FOLLOW_UP' | 'MEETING';
    nextActionDueAt?: string;
    nextActionUserId?: string;
}
export declare class TradeAccountsQueryDto {
    q?: string;
    status?: (typeof TRADE_ACCOUNT_STATUSES)[number];
    page?: number;
    pageSize?: number;
}
export declare class AddTradeAccountNoteDto {
    body: string;
    attachmentsMeta?: Record<string, any>;
}
export declare class UpdateNextActionDto {
    type?: 'CALL' | 'EMAIL' | 'WHATSAPP' | 'FOLLOW_UP' | 'MEETING';
    dueAt?: string;
    assignedUserId?: string;
}
export declare class CrmSearchQueryDto {
    q?: string;
    segmentId?: string;
    tag?: string;
}
export declare class AddCrmNoteDto {
    bodyJson?: Record<string, any>;
    attachmentsJson?: Record<string, any>;
}
export declare class AddCrmTaskDto {
    title: string;
    details?: string;
    dueAt?: string;
    assigneeUserId?: string;
    status?: (typeof CRM_TASK_STATUS_INPUTS)[number];
}
export declare class PatchCrmAccountDto {
    name?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    status?: (typeof TRADE_ACCOUNT_STATUSES)[number];
    lastContactedAt?: string;
}
