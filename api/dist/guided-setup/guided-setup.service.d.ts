import { AuditService } from "../audit/audit.service";
import { BillingService } from "../billing/billing.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantService } from "../tenant/tenant.service";
import { TradePacksService } from "../trade-packs/trade-packs.service";
export declare class GuidedSetupService {
    private readonly prisma;
    private readonly audit;
    private readonly tenantService;
    private readonly tradePacksService;
    private readonly billingService;
    constructor(prisma: PrismaService, audit: AuditService, tenantService: TenantService, tradePacksService: TradePacksService, billingService: BillingService);
    getStatus(tenantId: string): Promise<{
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
    reset(tenantId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    private ensureWheelsPack;
    private seedDefaultServices;
    private upsertServices;
    applyStep(tenantId: string, userId: string, role: string, step: number, data: Record<string, any>, skipped: boolean): Promise<{
        ok: boolean;
    }>;
    complete(tenantId: string, userId: string): Promise<{
        nextUrl: string;
    }>;
}
