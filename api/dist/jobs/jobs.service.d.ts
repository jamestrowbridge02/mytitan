import { AuditService } from "../audit/audit.service";
import { JobStatus } from "../common/constants";
import { NotificationsService } from "../notifications/notifications.service";
import { AutomationsService } from "../automations/automations.service";
import { PrismaService } from "../prisma/prisma.service";
import { TemplatesService } from "../templates/templates.service";
import { BulkJobsDto, BulkJobsV2Dto, CreateJobDto, CreateJobReminderDto, JobsBoardQueryDto, PatchJobDto } from "./dto";
export declare class JobsService {
    private readonly prisma;
    private readonly audit;
    private readonly templatesService;
    private readonly notifications;
    private readonly automations;
    constructor(prisma: PrismaService, audit: AuditService, templatesService: TemplatesService, notifications: NotificationsService, automations: AutomationsService);
    private asNumber;
    private computeTotals;
    private computeWheelsTotals;
    private nextJobRef;
    private isWheelsFlowEnabled;
    private recordUndo;
    private logActivity;
    private restrictedLocationId;
    private maxMediaBytes;
    private decodeDataUrl;
    private validateMediaDataUrl;
    private normalizeAssetInput;
    private persistAssets;
    private splitIntoColumns;
    private createSimplePdf;
    private ensurePublicToken;
    private buildAndStorePdf;
    create(companyId: string, userId: string, dto: CreateJobDto): Promise<any>;
    list(companyId: string): any;
    getById(companyId: string, id: string): Promise<any>;
    generatePdf(companyId: string, userId: string, id: string): Promise<{
        url: string;
        pdfUrl: string;
        generatedAt: string;
    }>;
    updateStatus(companyId: string, userId: string, id: string, newStatus: JobStatus): Promise<any>;
    patchPartial(companyId: string, userId: string, id: string, dto: PatchJobDto): Promise<any>;
    board(companyId: string, userId: string, query: JobsBoardQueryDto): Promise<{
        grouped: Record<string, any[]>;
        counts: {
            [k: string]: number;
        };
        page: number;
        pageSize: number;
    }>;
    bulk(companyId: string, userId: string, dto: BulkJobsDto): Promise<{
        successCount: number;
        failed: {
            id: string;
            reason: string;
        }[];
    }>;
    undoLastChange(companyId: string, userId: string): Promise<{
        ok: boolean;
        message: string;
        count?: undefined;
    } | {
        ok: boolean;
        count: any;
        message?: undefined;
    }>;
    boardV2(companyId: string, userId: string, query: JobsBoardQueryDto): Promise<{
        grouped: Record<string, any[]>;
        counts: {
            [k: string]: number;
        };
        total: any;
    }>;
    bulkV2(companyId: string, userId: string, dto: BulkJobsV2Dto): Promise<any>;
    createReminder(companyId: string, userId: string, dto: CreateJobReminderDto): Promise<any>;
    activity(companyId: string, jobId: string): Promise<any>;
}
