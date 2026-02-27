import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
export declare class AiService {
    private readonly prisma;
    private readonly tenantService;
    private readonly audit;
    private readonly openai;
    private readonly model;
    private readonly maxRequests;
    private readonly windowMs;
    private readonly buckets;
    constructor(prisma: PrismaService, tenantService: TenantService, audit: AuditService);
    private enforceRateLimit;
    private getPeriodStart;
    private summarize;
    private sanitizeMessage;
    private isSensitiveRequest;
    private enforceUsageLimit;
    chat(tenantId: string, userId: string, message: string, purpose?: string): Promise<{
        model: string;
        message: string;
        usage?: undefined;
    } | {
        model: string;
        message: string;
        usage: {
            inputTokens: any;
            outputTokens: any;
            totalTokens: any;
        };
    }>;
}
