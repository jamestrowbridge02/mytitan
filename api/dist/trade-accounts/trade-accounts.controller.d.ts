import { JwtPayload } from '../auth/auth.types';
import { AddTradeAccountNoteDto, TradeAccountsQueryDto, UpdateNextActionDto, UpsertTradeAccountDto } from './dto';
import { TradeAccountsService } from './trade-accounts.service';
export declare class TradeAccountsController {
    private readonly tradeAccountsService;
    constructor(tradeAccountsService: TradeAccountsService);
    upsert(user: JwtPayload, dto: UpsertTradeAccountDto): Promise<any>;
    list(user: JwtPayload, query: TradeAccountsQueryDto): Promise<any[]>;
    get(user: JwtPayload, id: string): Promise<{
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
    timeline(user: JwtPayload, id: string, page?: string, pageSize?: string): Promise<{
        account: any;
        timeline: any[];
        page: number;
        pageSize: number;
    }>;
    addNote(user: JwtPayload, id: string, dto: AddTradeAccountNoteDto): Promise<any>;
    updateNextAction(user: JwtPayload, id: string, dto: UpdateNextActionDto): Promise<any>;
}
