import { JOB_STATUSES } from "../common/constants";
export declare const JOB_ASSET_KINDS: readonly ["BEFORE", "AFTER", "TORQUE", "SIGN_TECH", "SIGN_CUSTOMER"];
export declare class CreateJobAssetDto {
    kind: (typeof JOB_ASSET_KINDS)[number];
    url?: string;
    dataUrl?: string;
    mime?: string;
    bytes?: number;
}
export declare class CreateJobMediaPayloadDto {
    data: string;
    filename: string;
    mimeType: string;
}
export declare class CreateJobDto {
    locationId?: string;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleReg?: string;
    laborCents?: number;
    partsCents?: number;
    miscCents?: number;
    taxRateBps?: number;
    serviceName?: string;
    wheelPricingMode?: "PER_WHEEL" | "SET";
    whatsappTemplate?: string;
    invoiceDueAt?: string;
    scheduledAt?: string;
    tradeCode?: string;
    jobType?: string;
    formData?: Record<string, any>;
    torqueEvidenceMedia?: CreateJobMediaPayloadDto | null;
    beforeMedia?: CreateJobMediaPayloadDto[];
    afterMedia?: CreateJobMediaPayloadDto[];
    assets?: CreateJobAssetDto[];
}
export declare class UpdateJobStatusDto {
    status: string;
}
export declare class JobsBoardQueryDto {
    status?: string;
    locationId?: string;
    locationIds?: string;
    search?: string;
    trade?: string;
    assignedTo?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
}
export declare class BulkJobsDto {
    jobIds: string[];
    operation: 'setStatus' | 'assignTechnician' | 'setLocation' | 'addTag' | 'removeTag' | 'setDueDate' | 'closeJobs' | 'markComplete';
    status?: (typeof JOB_STATUSES)[number];
    assignedUserId?: string;
    locationId?: string;
    tag?: string;
    dueAt?: string;
}
export declare class PatchJobDto {
    status?: (typeof JOB_STATUSES)[number];
    assignedUserId?: string;
    locationId?: string;
    pricingNotes?: string;
    invoiceDueAt?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    completedAt?: string | null;
    scheduledAt?: string | null;
}
export declare class CreateJobReminderDto {
    jobId: string;
    remindAt: string;
    channel?: string;
    note?: string;
}
export declare class BulkJobsV2Dto {
    jobIds: string[];
    operation: 'setStatus' | 'assignTechnician' | 'setLocation' | 'addTag' | 'removeTag' | 'setDueDate' | 'closeJobs' | 'markComplete';
    status?: (typeof JOB_STATUSES)[number];
    assignedUserId?: string;
    locationId?: string;
    tag?: string;
    dueAt?: string;
}
