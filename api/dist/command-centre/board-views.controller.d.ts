import { JwtPayload } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
export declare class BoardViewsController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(user: JwtPayload): Promise<any>;
    create(user: JwtPayload, body: {
        name?: string;
        filters?: Record<string, any>;
        isDefault?: boolean;
        viewType?: string;
    }): Promise<any>;
    update(user: JwtPayload, id: string, body: {
        name?: string;
        filters?: Record<string, any>;
        isDefault?: boolean;
        viewType?: string;
    }): Promise<any>;
    remove(user: JwtPayload, id: string): Promise<{
        ok: boolean;
        message: string;
    } | {
        ok: boolean;
        message?: undefined;
    }>;
}
