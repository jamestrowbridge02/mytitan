import { JwtPayload } from '../auth/auth.types';
import { UsageService } from './usage.service';
export declare class UsageController {
    private readonly usage;
    constructor(usage: UsageService);
    me(user: JwtPayload): Promise<{
        periodStart: Date;
        usage: any;
        limits: {
            aiRequestsLimitMonthly: any;
            aiTokensLimitMonthly: any;
            storageBytesLimit: any;
            jobsCreatedLimit: any;
        };
    }>;
}
