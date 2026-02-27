import type { Request } from 'express';
import Stripe from 'stripe';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AutomationsService } from '../automations/automations.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class BillingService {
    private readonly prisma;
    private readonly audit;
    private readonly notifications;
    private readonly automations;
    private readonly stripe;
    private readonly logger;
    constructor(prisma: PrismaService, audit: AuditService, notifications: NotificationsService, automations: AutomationsService);
    private requireStripe;
    private maybeQueueReviewRequest;
    isStripeConfigured(): boolean;
    private getReturnUrl;
    ensurePlans(): Promise<void>;
    private priceIdFor;
    createCheckoutSession(tenantId: string, userId: string, planCode: string, interval: 'MONTHLY' | 'ANNUAL'): Promise<{
        url: string;
    }>;
    createBillingPortal(tenantId: string, userId: string): Promise<{
        url: string;
    }>;
    createJobPaymentSession(tenantId: string, jobId: string, token: string): Promise<{
        url: string;
    }>;
    getJobPaymentStatus(tenantId: string, jobId: string, sessionId: string): Promise<{
        status: Stripe.Checkout.Session.PaymentStatus;
        receiptUrl: string;
    }>;
    getBillingInfo(tenantId: string): Promise<{
        plan: any;
        subscription: any;
        usage: any;
        features: {
            [k: string]: any;
        };
        interval: any;
    }>;
    private truncateWebhookError;
    private reserveWebhookEvent;
    private markWebhookProcessed;
    private markWebhookFailed;
    handleStripeWebhook(req: Request & {
        rawBody?: Buffer;
        body?: unknown;
        requestId?: string;
    }): Promise<{
        received: boolean;
        duplicate: boolean;
    } | {
        received: boolean;
        duplicate?: undefined;
    }>;
    handleWebhook(signature: string | string[] | undefined, payload: Buffer, requestId?: string): Promise<{
        received: boolean;
        duplicate: boolean;
    } | {
        received: boolean;
        duplicate?: undefined;
    }>;
    handleStripeEvent(event: Stripe.Event, requestId?: string): Promise<{
        received: boolean;
        duplicate: boolean;
    } | {
        received: boolean;
        duplicate?: undefined;
    }>;
}
