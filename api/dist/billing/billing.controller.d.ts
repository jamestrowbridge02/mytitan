import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutSessionDto } from './billing.dto';
import { BillingService } from './billing.service';
export declare class BillingController {
    private readonly billing;
    private readonly prisma;
    private readonly audit;
    constructor(billing: BillingService, prisma: PrismaService, audit: AuditService);
    private assertEmailVerified;
    createCheckout(user: JwtPayload, dto: CheckoutSessionDto, req: Request & {
        requestId?: string;
    }): Promise<{
        url: string;
    }>;
    createPortal(user: JwtPayload, req: Request & {
        requestId?: string;
    }): Promise<{
        url: string;
    }>;
    me(user: JwtPayload): Promise<{
        plan: any;
        subscription: any;
        usage: any;
        features: {
            [k: string]: any;
        };
        interval: any;
    }>;
}
export declare class StripeWebhookController {
    private readonly billing;
    constructor(billing: BillingService);
    webhook(req: Request & {
        rawBody?: Buffer;
        body?: unknown;
    }): Promise<{
        received: boolean;
        duplicate: boolean;
    } | {
        received: boolean;
        duplicate?: undefined;
    }>;
}
