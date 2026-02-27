import { JwtPayload } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { IntegrationToggleDto, OnboardingStepDto, SelectTradeDto } from './onboarding.dto';
import { OnboardingService } from './onboarding.service';
export declare class OnboardingController {
    private readonly tenantService;
    private readonly onboardingService;
    private readonly prisma;
    constructor(tenantService: TenantService, onboardingService: OnboardingService, prisma: PrismaService);
    status(user: JwtPayload): Promise<{
        onboardingCompleted: boolean;
        onboardingStep: number;
        checklist: {
            items: {
                key: string;
                title: string;
                description: string;
                completed: boolean;
                href: string;
            }[];
            completedCount: number;
            total: number;
        };
    }>;
    trade(user: JwtPayload): Promise<{
        trade: import("./onboarding.dto").OnboardingTrade | null;
        installedPacks: any;
    }>;
    selectTrade(user: JwtPayload, dto: SelectTradeDto): Promise<{
        trade: "WHEELS" | "BODYSHOP" | "GARAGE" | "MOBILE";
        packCode: string;
    }>;
    step(user: JwtPayload, dto: OnboardingStepDto): Promise<{
        ok: boolean;
        onboardingStep: number;
    }>;
    complete(user: JwtPayload, _body: any): Promise<{
        completed: boolean;
    }>;
}
export declare class SetupController {
    private readonly onboardingService;
    constructor(onboardingService: OnboardingService);
    checklist(user: JwtPayload): Promise<{
        items: {
            key: string;
            title: string;
            description: string;
            completed: boolean;
            href: string;
        }[];
        completedCount: number;
        total: number;
    }> | {
        items: any[];
        completedCount: number;
        total: number;
    };
}
export declare class IntegrationsController {
    private readonly onboardingService;
    constructor(onboardingService: OnboardingService);
    list(user: JwtPayload): any[] | Promise<{
        key: "payments" | "bookings" | "accounting" | "social" | "ai" | "customer_portal" | "whatsapp";
        name: string;
        description: string;
        configureUrl: string;
        enabled: boolean;
        allowed: boolean;
    }[]>;
    toggle(user: JwtPayload, dto: IntegrationToggleDto): Promise<{
        key: "payments" | "bookings" | "accounting" | "social" | "ai" | "customer_portal" | "whatsapp";
        enabled: boolean;
    }>;
}
