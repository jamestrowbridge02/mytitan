import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddCrmNoteDto, AddCrmTaskDto, AddTradeAccountNoteDto, CrmSearchQueryDto, PatchCrmAccountDto, TradeAccountsQueryDto, UpdateNextActionDto, UpsertTradeAccountDto } from './dto';
export declare class TradeAccountsService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    upsert(companyId: string, userId: string, dto: UpsertTradeAccountDto): Promise<any>;
    list(companyId: string, query?: TradeAccountsQueryDto): Promise<any[]>;
    get(companyId: string, id: string): Promise<{
        account: any;
        recentJobs: any;
        recentBookings: any;
        notes: any;
        summary: {
            unpaidCount: number;
            unpaidTotalCents: number;
            paidTotalCents: number;
        };
    }>;
    addNote(companyId: string, userId: string, accountId: string, dto: AddTradeAccountNoteDto): Promise<any>;
    updateNextAction(companyId: string, userId: string, accountId: string, dto: UpdateNextActionDto): Promise<any>;
    timeline(companyId: string, accountId: string, page?: number, pageSize?: number): Promise<{
        account: any;
        timeline: any[];
        page: number;
        pageSize: number;
    }>;
    crmSearch(companyId: string, query: CrmSearchQueryDto): Promise<any>;
    crmFull(companyId: string, accountId: string): Promise<{
        account: any;
        financialSummary: {
            unpaidCount: number;
            unpaidTotalCents: number;
            paidTotalCents: number;
        };
        timeline: any[];
        notes: any;
        tasks: any;
        attachments: any;
        tags: any;
    }>;
    addCrmNote(companyId: string, userId: string, accountId: string, dto: AddCrmNoteDto): Promise<any>;
    addCrmTask(companyId: string, userId: string, accountId: string, dto: AddCrmTaskDto): Promise<any>;
    patchCrmAccount(companyId: string, userId: string, accountId: string, dto: PatchCrmAccountDto): Promise<any>;
}
