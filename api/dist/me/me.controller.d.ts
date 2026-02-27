import { JwtPayload } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class MeController {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    me(user: JwtPayload): JwtPayload;
    getLocationContext(user: JwtPayload): Promise<{
        activeLocationId: any;
        onlyMyLocation: boolean;
        available: any[];
    }>;
    setLocationContext(user: JwtPayload, body: {
        locationId?: string | null;
    }): Promise<{
        activeLocationId: string;
    }>;
}
