import { JwtPayload } from '../auth/auth.types';
import { AddCrmNoteDto, AddCrmTaskDto, CrmSearchQueryDto, PatchCrmAccountDto } from './dto';
import { TradeAccountsService } from './trade-accounts.service';
export declare class CrmController {
    private readonly tradeAccountsService;
    constructor(tradeAccountsService: TradeAccountsService);
    search(user: JwtPayload, query: CrmSearchQueryDto): Promise<any>;
    full(user: JwtPayload, id: string): Promise<{
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
    addNote(user: JwtPayload, id: string, dto: AddCrmNoteDto): Promise<any>;
    addTask(user: JwtPayload, id: string, dto: AddCrmTaskDto): Promise<any>;
    patch(user: JwtPayload, id: string, dto: PatchCrmAccountDto): Promise<any>;
}
