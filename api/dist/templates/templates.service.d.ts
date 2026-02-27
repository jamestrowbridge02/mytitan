import { PrismaService } from "../prisma/prisma.service";
export declare class TemplatesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private requireFeature;
    ensureWheelsDefaultTemplate(): Promise<any>;
    getDefaultTemplate(tenantId: string, trade?: string): Promise<{
        template: any;
        fields: any[];
        reason: string;
    } | {
        template: any;
        fields: any;
        reason?: undefined;
    }>;
}
