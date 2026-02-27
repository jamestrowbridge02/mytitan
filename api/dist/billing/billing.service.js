"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var BillingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingService = void 0;
const common_1 = require("@nestjs/common");
const stripe_1 = require("stripe");
const audit_service_1 = require("../audit/audit.service");
const feature_flags_1 = require("../common/feature-flags");
const notifications_service_1 = require("../notifications/notifications.service");
const automations_service_1 = require("../automations/automations.service");
const prisma_service_1 = require("../prisma/prisma.service");
const billing_constants_1 = require("./billing.constants");
let BillingService = BillingService_1 = class BillingService {
    constructor(prisma, audit, notifications, automations) {
        this.prisma = prisma;
        this.audit = audit;
        this.notifications = notifications;
        this.automations = automations;
        this.logger = new common_1.Logger(BillingService_1.name);
        const secret = process.env.STRIPE_SECRET_KEY?.trim();
        this.stripe = secret ? new stripe_1.default(secret, { apiVersion: '2023-10-16' }) : null;
    }
    requireStripe() {
        if (!this.stripe) {
            throw new common_1.ServiceUnavailableException('Stripe is not configured');
        }
        return this.stripe;
    }
    async maybeQueueReviewRequest(companyId, jobId) {
        if (!(0, feature_flags_1.isAutomationsV1Enabled)())
            return;
        const enabled = await this.automations.getSettings(companyId);
        if (!enabled.reviewRequestEnabled)
            return;
        const db = this.prisma;
        const recent = await db.notification.findFirst({
            where: {
                companyId,
                entityType: 'job',
                entityId: jobId,
                metaJson: { path: ['reasonKey'], equals: 'review_request' },
            },
        });
        if (recent)
            return;
        const owner = await db.user.findFirst({ where: { companyId, role: 'OWNER' }, select: { id: true } });
        if (!owner?.id)
            return;
        await this.notifications.sendEntityUpdate(companyId, owner.id, {
            entityType: 'job',
            entityId: jobId,
            templateKey: 'review_request',
            channel: 'in_app',
            note: 'Automation review request',
        });
    }
    isStripeConfigured() {
        return Boolean(this.stripe);
    }
    getReturnUrl() {
        return process.env.STRIPE_BILLING_RETURN_URL || 'https://app.mytitan.co.uk/dashboard/billing';
    }
    async ensurePlans() {
        const db = this.prisma;
        const defs = Object.values(billing_constants_1.PLAN_DEFINITIONS);
        await Promise.all(defs.map((plan) => db.plan.upsert({
            where: { code: plan.code },
            update: {
                name: plan.name,
                stripePriceMonthlyId: this.priceIdFor(plan.code, 'MONTHLY') || '',
                stripePriceAnnualId: this.priceIdFor(plan.code, 'ANNUAL') || '',
                featuresJson: plan.features,
                aiRequestsLimitMonthly: plan.aiRequestsLimitMonthly,
                aiTokensLimitMonthly: plan.aiTokensLimitMonthly,
            },
            create: {
                code: plan.code,
                name: plan.name,
                stripePriceMonthlyId: this.priceIdFor(plan.code, 'MONTHLY') || '',
                stripePriceAnnualId: this.priceIdFor(plan.code, 'ANNUAL') || '',
                featuresJson: plan.features,
                aiRequestsLimitMonthly: plan.aiRequestsLimitMonthly,
                aiTokensLimitMonthly: plan.aiTokensLimitMonthly,
            },
        })));
    }
    priceIdFor(planCode, interval) {
        if (planCode === 'SOLE_TRADER') {
            return interval === 'MONTHLY'
                ? process.env.STRIPE_PRICE_SOLE_TRADER_MONTHLY
                : process.env.STRIPE_PRICE_SOLE_TRADER_ANNUAL;
        }
        if (planCode === 'BUSINESS') {
            return interval === 'MONTHLY'
                ? process.env.STRIPE_PRICE_BUSINESS_MONTHLY
                : process.env.STRIPE_PRICE_BUSINESS_ANNUAL;
        }
        if (planCode === 'ENTERPRISE') {
            return interval === 'MONTHLY'
                ? process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY
                : process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL;
        }
        return undefined;
    }
    async createCheckoutSession(tenantId, userId, planCode, interval) {
        const stripe = this.requireStripe();
        await this.ensurePlans();
        const priceId = this.priceIdFor(planCode, interval);
        if (!priceId) {
            throw new common_1.BadRequestException('Invalid plan or Stripe price not configured');
        }
        const db = this.prisma;
        const user = await db.user.findUnique({ where: { id: userId } });
        const subscription = await db.tenantSubscription.findUnique({ where: { tenantId } });
        let customerId = subscription?.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user?.email ?? undefined,
                metadata: { tenantId },
            });
            customerId = customer.id;
        }
        const plan = await db.plan.findUnique({ where: { code: planCode } });
        if (!plan) {
            throw new common_1.BadRequestException('Plan not found');
        }
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: customerId,
            line_items: [{ price: priceId, quantity: 1 }],
            client_reference_id: tenantId,
            success_url: `${this.getReturnUrl()}?checkout=success`,
            cancel_url: `${this.getReturnUrl()}?checkout=cancel`,
            metadata: {
                tenantId,
                planCode,
                interval,
            },
            subscription_data: {
                metadata: {
                    tenantId,
                    planCode,
                    interval,
                },
            },
        });
        await db.tenantSubscription.upsert({
            where: { tenantId },
            update: { stripeCustomerId: customerId },
            create: {
                tenantId,
                stripeCustomerId: customerId,
                planId: plan.id,
                status: 'incomplete',
            },
        });
        await db.tenantSetting.updateMany({
            where: { tenantId },
            data: { planId: plan.id, planBillingInterval: interval },
        });
        await this.audit.log(tenantId, 'billing.checkout', `Checkout session created for plan ${planCode}`, userId);
        return { url: session.url };
    }
    async createBillingPortal(tenantId, userId) {
        const stripe = this.requireStripe();
        const db = this.prisma;
        const subscription = await db.tenantSubscription.findUnique({ where: { tenantId } });
        if (!subscription?.stripeCustomerId) {
            throw new common_1.BadRequestException('No Stripe customer configured for this tenant');
        }
        const portal = await stripe.billingPortal.sessions.create({
            customer: subscription.stripeCustomerId,
            return_url: this.getReturnUrl(),
        });
        await this.audit.log(tenantId, 'billing.portal', 'Billing portal opened', userId);
        return { url: portal.url };
    }
    async createJobPaymentSession(tenantId, jobId, token) {
        const stripe = this.requireStripe();
        const db = this.prisma;
        const job = await db.job.findFirst({ where: { id: jobId, companyId: tenantId } });
        if (!job) {
            throw new common_1.BadRequestException('Job not found');
        }
        if (!job.totalCents || job.totalCents <= 0) {
            throw new common_1.BadRequestException('Job has no payable total');
        }
        const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
        if (!settings?.paymentsEnabled) {
            throw new common_1.BadRequestException('Payments are not enabled for this tenant');
        }
        const appUrl = process.env.APP_PUBLIC_URL || 'https://app.mytitan.co.uk';
        const returnUrl = `${appUrl}/portal/job/${token}`;
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: job.customerEmail ?? undefined,
            line_items: [
                {
                    price_data: {
                        currency: (job.currency || 'GBP').toLowerCase(),
                        unit_amount: job.totalCents,
                        product_data: {
                            name: `Job ${job.jobRef}`,
                            description: job.serviceName || undefined,
                        },
                    },
                    quantity: 1,
                },
            ],
            client_reference_id: tenantId,
            metadata: {
                type: 'job_payment',
                tenantId,
                jobId,
            },
            success_url: `${returnUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${returnUrl}?payment=cancel`,
        });
        await db.job.update({
            where: { id: jobId },
            data: { paymentCheckoutSessionId: session.id },
        });
        await this.audit.log(tenantId, 'portal.payment.start', `Checkout started for job ${job.jobRef}`, null);
        return { url: session.url };
    }
    async getJobPaymentStatus(tenantId, jobId, sessionId) {
        const stripe = this.requireStripe();
        const db = this.prisma;
        const job = await db.job.findFirst({ where: { id: jobId, companyId: tenantId } });
        if (!job) {
            throw new common_1.BadRequestException('Job not found');
        }
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['payment_intent'],
        });
        if (session.metadata?.jobId && session.metadata.jobId !== jobId) {
            throw new common_1.BadRequestException('Session does not match this job');
        }
        let receiptUrl = null;
        const paymentIntent = session.payment_intent;
        const charge = paymentIntent?.charges?.data?.[0];
        if (charge?.receipt_url) {
            receiptUrl = charge.receipt_url;
        }
        if (session.payment_status === 'paid' && !job.invoicePaidAt) {
            await db.job.update({
                where: { id: jobId },
                data: {
                    invoicePaidAt: new Date(),
                    paymentReceiptUrl: receiptUrl,
                },
            });
            await this.audit.log(tenantId, 'portal.payment.complete', `Payment received for job ${job.jobRef}`, null);
            if ((0, feature_flags_1.isNotificationsV1Enabled)()) {
                await this.notifications.notifyPaymentReceived(tenantId, jobId);
            }
            await this.maybeQueueReviewRequest(tenantId, jobId);
        }
        return {
            status: session.payment_status,
            receiptUrl,
        };
    }
    async getBillingInfo(tenantId) {
        const db = this.prisma;
        await this.ensurePlans();
        const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
        const subscription = await db.tenantSubscription.findUnique({
            where: { tenantId },
            include: { plan: true },
        });
        let plan = subscription?.plan ?? null;
        if (!plan) {
            plan = await db.plan.findUnique({ where: { code: billing_constants_1.DEFAULT_PLAN_CODE } });
        }
        const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
        const usage = await db.usageMeter.findUnique({
            where: { tenantId_periodStart: { tenantId, periodStart } },
        });
        const planFeatures = (plan?.featuresJson ?? billing_constants_1.PLAN_DEFINITIONS[billing_constants_1.DEFAULT_PLAN_CODE].features);
        const tenantFlags = {
            bookings_enabled: settings?.bookingsEnabled,
            accounting_enabled: settings?.accountingEnabled,
            payments_enabled: settings?.paymentsEnabled,
            social_enabled: settings?.socialEnabled,
            ai_enabled: settings?.aiEnabled,
        };
        const effective = Object.fromEntries(Object.entries(planFeatures).map(([key, value]) => {
            if (key in tenantFlags) {
                return [key, Boolean(value) && Boolean(tenantFlags[key])];
            }
            return [key, value];
        }));
        return {
            plan,
            subscription,
            usage: usage ?? { aiRequestsUsed: 0, aiTokensUsed: 0, periodStart },
            features: effective,
            interval: settings?.planBillingInterval ?? billing_constants_1.DEFAULT_INTERVAL,
        };
    }
    truncateWebhookError(error) {
        const message = error instanceof Error ? error.message : String(error || 'unknown webhook error');
        return message.slice(0, 500);
    }
    async reserveWebhookEvent(eventId, type, requestId) {
        const db = this.prisma;
        try {
            return await db.webhookEvent.create({
                data: {
                    provider: 'stripe',
                    eventId,
                    type,
                    status: 'received',
                    requestId: requestId || null,
                },
            });
        }
        catch (error) {
            if (error?.code === 'P2002') {
                return db.webhookEvent.findUnique({ where: { provider_eventId: { provider: 'stripe', eventId } } });
            }
            throw error;
        }
    }
    async markWebhookProcessed(eventId, type, requestId) {
        const db = this.prisma;
        await db.webhookEvent.updateMany({
            where: { provider: 'stripe', eventId },
            data: {
                type,
                status: 'processed',
                processedAt: new Date(),
                requestId: requestId || null,
                error: null,
            },
        });
    }
    async markWebhookFailed(eventId, type, error, requestId) {
        const db = this.prisma;
        await db.webhookEvent.updateMany({
            where: { provider: 'stripe', eventId },
            data: {
                type,
                status: 'failed',
                requestId: requestId || null,
                error: this.truncateWebhookError(error),
            },
        });
    }
    async handleStripeWebhook(req) {
        const signature = req.headers['stripe-signature'];
        const payload = Buffer.isBuffer(req.body) ? req.body : req.rawBody ?? Buffer.from('');
        const requestId = String(req.requestId || req.headers['x-request-id'] || '').trim() || undefined;
        try {
            return await this.handleWebhook(signature, payload, requestId);
        }
        catch {
            throw new common_1.BadRequestException('Invalid Stripe webhook payload or signature.');
        }
    }
    async handleWebhook(signature, payload, requestId) {
        const stripe = this.requireStripe();
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) {
            throw new common_1.ServiceUnavailableException('STRIPE_WEBHOOK_SECRET is not configured');
        }
        const event = stripe.webhooks.constructEvent(payload, signature, secret);
        return this.handleStripeEvent(event, requestId);
    }
    async handleStripeEvent(event, requestId) {
        const db = this.prisma;
        const eventId = String(event.id || '').trim();
        if (!eventId) {
            throw new common_1.BadRequestException('Stripe event id missing');
        }
        const stripe = this.requireStripe();
        const webhookEvent = await this.reserveWebhookEvent(eventId, event.type, requestId);
        if (webhookEvent?.processedAt || webhookEvent?.status === 'processed') {
            this.logger.log(`requestId=${requestId || 'unknown'} provider=stripe eventId=${eventId} dedupe=hit status=processed`);
            return { received: true, duplicate: true };
        }
        try {
            if (event.type === 'checkout.session.completed') {
                const session = event.data.object;
                if (session.metadata?.type === 'job_payment' && session.metadata?.jobId && session.metadata?.tenantId) {
                    const job = await db.job.findFirst({
                        where: { id: session.metadata.jobId, companyId: session.metadata.tenantId },
                    });
                    if (!job) {
                        await this.markWebhookProcessed(eventId, event.type, requestId);
                        return { received: true };
                    }
                    let receiptUrl = null;
                    if (session.payment_intent) {
                        const intent = await stripe.paymentIntents.retrieve(session.payment_intent, { expand: ['charges'] });
                        const charge = intent?.charges?.data?.[0];
                        if (charge?.receipt_url) {
                            receiptUrl = charge.receipt_url;
                        }
                    }
                    await db.job.update({
                        where: { id: job.id },
                        data: {
                            invoicePaidAt: job.invoicePaidAt ?? new Date(),
                            paymentReceiptUrl: receiptUrl,
                        },
                    });
                    await this.audit.log(job.companyId, 'portal.payment.complete', `Payment received for job ${job.jobRef}`, null);
                    if ((0, feature_flags_1.isNotificationsV1Enabled)()) {
                        await this.notifications.notifyPaymentReceived(job.companyId, job.id);
                    }
                    await this.maybeQueueReviewRequest(job.companyId, job.id);
                    await this.markWebhookProcessed(eventId, event.type, requestId);
                    return { received: true };
                }
                const tenantId = (session.client_reference_id || session.metadata?.tenantId);
                const planCode = session.metadata?.planCode ?? null;
                const interval = session.metadata?.interval ?? billing_constants_1.DEFAULT_INTERVAL;
                if (!tenantId) {
                    await this.markWebhookProcessed(eventId, event.type, requestId);
                    return { received: true };
                }
                const plan = planCode
                    ? await db.plan.findUnique({ where: { code: planCode } })
                    : await db.plan.findUnique({ where: { code: billing_constants_1.DEFAULT_PLAN_CODE } });
                if (!plan) {
                    throw new common_1.BadRequestException('Plan not found');
                }
                await db.tenantSubscription.upsert({
                    where: { tenantId },
                    update: {
                        stripeCustomerId: String(session.customer || ''),
                        stripeSubscriptionId: String(session.subscription || ''),
                        status: session.status ?? 'active',
                        planId: plan.id,
                    },
                    create: {
                        tenantId,
                        stripeCustomerId: String(session.customer || ''),
                        stripeSubscriptionId: String(session.subscription || ''),
                        status: session.status ?? 'active',
                        planId: plan.id,
                    },
                });
                await db.tenantSetting.updateMany({
                    where: { tenantId },
                    data: { planId: plan.id, planBillingInterval: interval },
                });
            }
            if (event.type === 'customer.subscription.created' ||
                event.type === 'customer.subscription.updated' ||
                event.type === 'customer.subscription.deleted') {
                const subscription = event.data.object;
                const tenantId = subscription.metadata?.tenantId;
                const priceId = subscription.items.data[0]?.price?.id;
                const plan = (priceId
                    ? await db.plan.findFirst({
                        where: {
                            OR: [
                                { stripePriceMonthlyId: priceId },
                                { stripePriceAnnualId: priceId },
                            ],
                        },
                    })
                    : null) ??
                    (subscription.metadata?.planCode
                        ? await db.plan.findUnique({ where: { code: subscription.metadata.planCode } })
                        : null) ??
                    (await db.plan.findUnique({ where: { code: billing_constants_1.DEFAULT_PLAN_CODE } }));
                if (!tenantId) {
                    await this.markWebhookProcessed(eventId, event.type, requestId);
                    return { received: true };
                }
                const interval = plan && plan.stripePriceAnnualId === priceId ? 'ANNUAL' : 'MONTHLY';
                await db.tenantSubscription.upsert({
                    where: { tenantId },
                    update: {
                        stripeCustomerId: subscription.customer,
                        stripeSubscriptionId: subscription.id,
                        status: subscription.status,
                        currentPeriodEnd: subscription.current_period_end
                            ? new Date(subscription.current_period_end * 1000)
                            : null,
                        planId: plan?.id,
                        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
                    },
                    create: {
                        tenantId,
                        stripeCustomerId: subscription.customer,
                        stripeSubscriptionId: subscription.id,
                        status: subscription.status,
                        currentPeriodEnd: subscription.current_period_end
                            ? new Date(subscription.current_period_end * 1000)
                            : null,
                        planId: plan?.id,
                        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
                    },
                });
                if (plan?.id) {
                    await db.tenantSetting.updateMany({
                        where: { tenantId },
                        data: { planId: plan.id, planBillingInterval: interval },
                    });
                }
            }
            if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
                const invoice = event.data.object;
                const customerId = String(invoice.customer || '');
                if (customerId) {
                    const result = await db.tenantSubscription.updateMany({
                        where: { stripeCustomerId: customerId },
                        data: { status: event.type === 'invoice.paid' ? 'active' : 'past_due' },
                    });
                    if (event.type === 'invoice.paid' && (0, feature_flags_1.isNotificationsV1Enabled)() && result.count > 0) {
                        const subs = await db.tenantSubscription.findMany({ where: { stripeCustomerId: customerId }, select: { tenantId: true } });
                        for (const sub of subs) {
                            const owners = await db.user.findMany({
                                where: { companyId: sub.tenantId, role: 'OWNER' },
                                select: { id: true },
                            });
                            await this.notifications.createForUsers(sub.tenantId, owners.map((u) => u.id), {
                                type: 'payment.received',
                                title: 'Payment received',
                                body: 'Stripe confirmed a successful payment.',
                                entityType: 'billing',
                                entityId: String(invoice.id || ''),
                            });
                        }
                    }
                }
            }
            await this.markWebhookProcessed(eventId, event.type, requestId);
            return { received: true };
        }
        catch (error) {
            await this.markWebhookFailed(eventId, event.type, error, requestId);
            throw error;
        }
    }
};
exports.BillingService = BillingService;
exports.BillingService = BillingService = BillingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        notifications_service_1.NotificationsService,
        automations_service_1.AutomationsService])
], BillingService);
//# sourceMappingURL=billing.service.js.map