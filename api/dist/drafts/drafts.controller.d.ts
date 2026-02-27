import { JwtPayload } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
export declare class DraftsController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(user: JwtPayload): Promise<{
        items: any[];
    }>;
    latest(user: JwtPayload, kind?: string): Promise<{
        id: string;
        draftKind: string;
        trade: any;
        payload: any;
        updatedAt: any;
        tradeAccountId?: undefined;
    } | {
        id: string;
        draftKind: string;
        tradeAccountId: any;
        payload: any;
        updatedAt: any;
        trade?: undefined;
    }>;
    getJobDraft(user: JwtPayload, trade: string): Promise<any>;
    upsertJobDraft(user: JwtPayload, body: {
        trade?: string;
        payload?: Record<string, any>;
    }): Promise<any>;
    upsertCrmDraft(user: JwtPayload, body: {
        tradeAccountId?: string | null;
        payload?: Record<string, any>;
    }): Promise<any>;
    getJobDrafts(user: JwtPayload): Promise<any>;
    saveJobDraftCompat(user: JwtPayload, body: {
        trade?: string;
        payload?: Record<string, any>;
    }): Promise<any>;
    saveJobDraft(user: JwtPayload, body: {
        trade?: string;
        payload?: Record<string, any>;
    }): Promise<any>;
    deleteJobDraft(user: JwtPayload, trade: string): Promise<{
        ok: boolean;
    }>;
    getCrmDrafts(user: JwtPayload): Promise<any>;
    saveCrmDraftCompat(user: JwtPayload, body: {
        tradeAccountId?: string;
        payload?: Record<string, any>;
    }): Promise<any>;
    saveCrmDraft(user: JwtPayload, body: {
        tradeAccountId?: string;
        payload?: Record<string, any>;
    }): Promise<any>;
    deleteDraftById(user: JwtPayload, id: string): Promise<{
        ok: boolean;
    }>;
}
