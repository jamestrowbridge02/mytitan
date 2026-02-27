import { JwtPayload } from '../auth/auth.types';
import { PricingPresetsService } from './pricing-presets.service';
export declare class PricingPresetsController {
    private readonly pricingPresetsService;
    constructor(pricingPresetsService: PricingPresetsService);
    list(user: JwtPayload): Promise<{
        items: any;
    }>;
}
