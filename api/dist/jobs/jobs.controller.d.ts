import { JwtPayload } from "../auth/auth.types";
import { BulkJobsDto, BulkJobsV2Dto, CreateJobDto, CreateJobReminderDto, JobsBoardQueryDto, PatchJobDto, UpdateJobStatusDto } from "./dto";
import { JobsService } from "./jobs.service";
export declare class JobsController {
    private readonly jobsService;
    constructor(jobsService: JobsService);
    create(user: JwtPayload, dto: CreateJobDto): Promise<any>;
    list(user: JwtPayload): any;
    board(user: JwtPayload, query: JobsBoardQueryDto): {
        grouped: {};
        counts: {};
    } | Promise<{
        grouped: Record<string, any[]>;
        counts: {
            [k: string]: number;
        };
        page: number;
        pageSize: number;
    }>;
    boardV2(user: JwtPayload, query: JobsBoardQueryDto): Promise<{
        grouped: Record<string, any[]>;
        counts: {
            [k: string]: number;
        };
        total: any;
    }>;
    getById(user: JwtPayload, id: string): Promise<any>;
    generatePdf(user: JwtPayload, id: string): Promise<{
        url: string;
        pdfUrl: string;
        generatedAt: string;
    }>;
    updateStatus(user: JwtPayload, id: string, dto: UpdateJobStatusDto): Promise<any>;
    patchInline(user: JwtPayload, id: string, dto: PatchJobDto): Promise<any>;
    bulk(user: JwtPayload, dto: BulkJobsDto): Promise<{
        successCount: number;
        failed: {
            id: string;
            reason: string;
        }[];
    }>;
    bulkV2(user: JwtPayload, dto: BulkJobsV2Dto): Promise<any>;
    reminder(user: JwtPayload, dto: CreateJobReminderDto): Promise<any>;
    activity(user: JwtPayload, id: string): Promise<any>;
    undoLast(user: JwtPayload): Promise<{
        ok: boolean;
        message: string;
        count?: undefined;
    } | {
        ok: boolean;
        count: any;
        message?: undefined;
    }>;
}
