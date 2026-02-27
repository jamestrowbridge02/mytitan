import { PrismaService } from '../prisma/prisma.service';
export declare class PricingPresetsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(tenantId: string): Promise<{
        items: any;
    }>;
}
