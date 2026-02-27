import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TradePacksService } from '../trade-packs/trade-packs.service';
import { OnboardingTrade } from './onboarding.dto';
declare const INTEGRATION_KEYS: readonly ["payments", "bookings", "accounting", "social", "ai", "customer_portal", "whatsapp"];
type IntegrationKey = (typeof INTEGRATION_KEYS)[number];
export declare class OnboardingService {
    private readonly prisma;
    private readonly audit;
    private readonly tradePacks;
    constructor(prisma: PrismaService, audit: AuditService, tradePacks: TradePacksService);
    private getPlanCode;
    getIntegrations(tenantId: string): Promise<{
        key: "payments" | "bookings" | "accounting" | "social" | "ai" | "customer_portal" | "whatsapp";
        name: string;
        description: string;
        configureUrl: string;
        enabled: boolean;
        allowed: boolean;
    }[]>;
    toggleIntegration(tenantId: string, userId: string, role: string, key: IntegrationKey, enabled: boolean): Promise<{
        key: "payments" | "bookings" | "accounting" | "social" | "ai" | "customer_portal" | "whatsapp";
        enabled: boolean;
    }>;
    selectTrade(tenantId: string, userId: string, trade: OnboardingTrade): Promise<{
        trade: "WHEELS" | "BODYSHOP" | "GARAGE" | "MOBILE";
        packCode: string;
    }>;
    getTradeSelection(tenantId: string): Promise<{
        trade: OnboardingTrade | null;
        installedPacks: any;
    }>;
    getChecklist(tenantId: string): Promise<{
        items: {
            key: string;
            title: string;
            description: string;
            completed: boolean;
            href: string;
        }[];
        completedCount: number;
        total: number;
    }>;
    advanceOnboardingStep(tenantId: string, userId: string, role: string, step: number): Promise<{
        onboardingStep: number;
    }>;
    completeOnboarding(tenantId: string, userId: string): Promise<{
        completed: boolean;
    }>;
}
export {};
