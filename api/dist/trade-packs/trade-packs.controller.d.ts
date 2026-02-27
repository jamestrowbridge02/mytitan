import { JwtPayload } from '../auth/auth.types';
import { TradePackMutationDto } from './trade-packs.dto';
import { TradePacksService } from './trade-packs.service';
export declare class TradePacksController {
    private readonly tradePacks;
    constructor(tradePacks: TradePacksService);
    list(user: JwtPayload): Promise<{
        code: import("./trade-packs.data").TradePackCode;
        name: string;
        description: string;
        tags: string[];
        includes: string[];
        installed: boolean;
        planCode: string;
        planLimit: number;
    }[]>;
    installed(user: JwtPayload): Promise<{
        items: any;
        count: any;
    }> | {
        items: any[];
        count: number;
    };
    install(user: JwtPayload, dto: TradePackMutationDto): Promise<{
        ok: boolean;
        packCode: import("./trade-packs.data").TradePackCode;
        planCode: string;
        installedCount: any;
        limit: number;
    }>;
    uninstall(user: JwtPayload, dto: TradePackMutationDto): Promise<{
        ok: boolean;
        packCode: import("./trade-packs.data").TradePackCode;
        wasInstalled: boolean;
    }>;
}
