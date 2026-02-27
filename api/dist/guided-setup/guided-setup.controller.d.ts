import { JwtPayload } from "../auth/auth.types";
import { GuidedSetupStepDto } from "./guided-setup.dto";
import { GuidedSetupService } from "./guided-setup.service";
export declare class GuidedSetupController {
    private readonly guidedSetupService;
    constructor(guidedSetupService: GuidedSetupService);
    private assertEnabled;
    status(user: JwtPayload): Promise<{
        primaryTrade: any;
        currentStep: number;
        completedSteps: string[];
        skippedSteps: string[];
        completedAt: any;
        guidedSetupCompletedAt: any;
        branding: {
            companyName: any;
            logoUrl: any;
            brandPrimaryColor: any;
            brandSecondaryColor: any;
            brandAccentColor: any;
        };
        supportEmail: any;
        supportPhone: any;
        chargingDefaults: {
            pricePerWheel: boolean;
            vatEnabled: boolean;
            vatRateBps: number;
            defaultTorqueSetting: any;
            defaultTyrePressure: any;
        };
        services: any;
        stripeConfigured: boolean;
    }>;
    reset(user: JwtPayload): Promise<{
        ok: boolean;
    }>;
    step(user: JwtPayload, dto: GuidedSetupStepDto): Promise<{
        ok: boolean;
    }>;
    complete(user: JwtPayload): Promise<{
        nextUrl: string;
    }>;
}
