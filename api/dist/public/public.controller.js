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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicController = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const audit_service_1 = require("../audit/audit.service");
const billing_service_1 = require("../billing/billing.service");
const feature_flags_1 = require("../common/feature-flags");
const prisma_service_1 = require("../prisma/prisma.service");
const public_dto_1 = require("./public.dto");
let PublicController = class PublicController {
    constructor(prisma, audit, billingService, jwtService) {
        this.prisma = prisma;
        this.audit = audit;
        this.billingService = billingService;
        this.jwtService = jwtService;
        this.demoBuckets = new Map();
        this.demoWindowMs = 60 * 1000;
        this.demoMaxRequests = 10;
    }
    async resolveToken(token) {
        const db = this.prisma;
        const record = await db.publicJobToken.findUnique({
            where: { token },
            include: { job: { include: { media: true, assets: true, signatures: true, pdf: true, company: true } } },
        });
        if (!record) {
            throw new common_1.NotFoundException("Token not found");
        }
        if (record.expiresAt < new Date()) {
            throw new common_1.BadRequestException("Token expired");
        }
        return record;
    }
    async getJob(token) {
        const record = await this.resolveToken(token);
        const db = this.prisma;
        const settings = await db.tenantSetting.findUnique({ where: { tenantId: record.job.companyId } });
        const paymentsEnabled = Boolean(settings?.paymentsEnabled);
        const portalEnabled = Boolean(settings?.featureCustomerPortal || settings?.paymentsEnabled);
        const stripeReady = this.billingService.isStripeConfigured();
        await this.audit.log(record.job.companyId, "portal.view", `Portal view for job ${record.job.jobRef}`, null);
        const formData = record.job.formData;
        const paymentMethod = formData?.paymentMethod ?? null;
        const paymentStatus = formData?.paymentStatus ?? null;
        const pdfReady = Boolean(record.job.pdf?.contentBase64);
        return {
            job: {
                id: record.job.id,
                jobRef: record.job.jobRef,
                status: record.job.status,
                customerName: record.job.customerName,
                customerEmail: record.job.customerEmail,
                customerPhone: record.job.customerPhone,
                vehicleMake: record.job.vehicleMake,
                vehicleModel: record.job.vehicleModel,
                vehicleReg: record.job.vehicleReg,
                serviceName: record.job.serviceName,
                subtotalCents: record.job.subtotalCents,
                taxCents: record.job.taxCents,
                totalCents: record.job.totalCents,
                currency: record.job.currency,
                invoicePdfUrl: record.job.invoicePdfUrl,
                invoiceIssuedAt: record.job.invoiceIssuedAt,
                invoicePaidAt: record.job.invoicePaidAt,
                paymentLinkUrl: paymentsEnabled ? record.job.paymentLinkUrl : null,
                approvedAt: record.job.approvedAt,
                approvedByName: record.job.approvedByName,
                signedAt: record.job.signedAt,
                signatureName: record.job.signatureName,
                signatureDataUrl: record.job.signatureDataUrl,
                declinedAt: record.job.declinedAt,
                declinedReason: record.job.declinedReason,
                paymentReceiptUrl: record.job.paymentReceiptUrl,
                jobType: record.job.jobType,
                tradeCode: record.job.tradeCode,
                formData: record.job.formData,
                whatsappCompletionLink: record.job.whatsappCompletionLink,
            },
            media: record.job.media,
            assets: record.job.assets,
            signatures: record.job.signatures,
            pdf: record.job.pdf,
            portal: {
                enabled: portalEnabled,
                paymentsEnabled,
                stripeConfigured: stripeReady,
                featureFlag: (0, feature_flags_1.isMarketplaceEnabled)(),
                pdfDownloadAllowed: portalEnabled,
                supportEmail: process.env.SUPPORT_EMAIL || null,
                supportPhone: settings?.supportPhone || null,
                brand: {
                    tenantName: settings?.companyName || record.job.company?.name || "MyTitan",
                    logoUrl: settings?.logoUrl || null,
                    primaryColor: settings?.brandPrimaryColor || null,
                },
                summary: {
                    approvedAt: record.job.approvedAt,
                    approvedByName: record.job.approvedByName,
                    declinedAt: record.job.declinedAt,
                    signedAt: record.job.signedAt,
                    signatureName: record.job.signatureName,
                    invoiceIssuedAt: record.job.invoiceIssuedAt,
                    invoicePaidAt: record.job.invoicePaidAt,
                    totalCents: record.job.totalCents,
                    currency: record.job.currency,
                    paymentMethod,
                    paymentStatus,
                    pdfReady,
                },
            },
        };
    }
    async getJobPdf(token, res) {
        const record = await this.resolveToken(token);
        const db = this.prisma;
        const settings = await db.tenantSetting.findUnique({ where: { tenantId: record.job.companyId } });
        const portalEnabled = Boolean(settings?.featureCustomerPortal || settings?.paymentsEnabled);
        if (!portalEnabled) {
            throw new common_1.BadRequestException("PDF download is not enabled for this tenant");
        }
        const pdf = record.job.pdf;
        if (!pdf?.contentBase64) {
            throw new common_1.NotFoundException("PDF is not ready yet. Please check back shortly.");
        }
        const fileName = `${record.job.jobRef || record.job.id}.pdf`;
        const buffer = Buffer.from(pdf.contentBase64, "base64");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
        res.setHeader("Cache-Control", "private, max-age=300");
        res.send(buffer);
    }
    async approve(token, dto) {
        const record = await this.resolveToken(token);
        const db = this.prisma;
        const updated = await db.job.update({
            where: { id: record.jobId },
            data: {
                approvedAt: new Date(),
                approvedByName: dto.name ?? null,
                declinedAt: null,
                declinedReason: null,
            },
        });
        await this.audit.log(record.job.companyId, "portal.approve", `Job ${record.job.jobRef} approved`, null);
        return { approvedAt: updated.approvedAt };
    }
    async decline(token, dto) {
        (0, feature_flags_1.requireMarketplaceEnabled)();
        const record = await this.resolveToken(token);
        const db = this.prisma;
        const updated = await db.job.update({
            where: { id: record.jobId },
            data: {
                declinedAt: new Date(),
                declinedReason: dto.reason ?? null,
                approvedAt: null,
            },
        });
        await this.audit.log(record.job.companyId, "portal.decline", `Job ${record.job.jobRef} declined`, null);
        return { declinedAt: updated.declinedAt };
    }
    async sign(token, dto) {
        const record = await this.resolveToken(token);
        if (dto.signatureDataUrl && !dto.signatureDataUrl.startsWith("data:image")) {
            throw new common_1.BadRequestException("Invalid signature data");
        }
        if (dto.signatureDataUrl && dto.signatureDataUrl.length > 300_000) {
            throw new common_1.BadRequestException("Signature data too large");
        }
        const db = this.prisma;
        const updated = await db.job.update({
            where: { id: record.jobId },
            data: {
                signedAt: new Date(),
                signatureName: dto.name ?? null,
                signatureDataUrl: dto.signatureDataUrl ?? null,
            },
        });
        if (dto.signatureDataUrl) {
            await db.jobAsset.create({
                data: {
                    jobId: record.jobId,
                    kind: "SIGN_CUSTOMER",
                    url: dto.signatureDataUrl,
                    mime: "image/png",
                },
            });
            if ((0, feature_flags_1.isMediaSignatureV1Enabled)() && db.jobSignature) {
                await db.jobSignature.upsert({
                    where: { jobId_signerType: { jobId: record.jobId, signerType: "CUSTOMER" } },
                    update: {
                        signerName: dto.name || null,
                        dataUrl: dto.signatureDataUrl,
                        mime: "image/png",
                        bytes: Math.round(dto.signatureDataUrl.length * 0.75),
                    },
                    create: {
                        companyId: record.job.companyId,
                        jobId: record.jobId,
                        signerType: "CUSTOMER",
                        signerName: dto.name || null,
                        dataUrl: dto.signatureDataUrl,
                        mime: "image/png",
                        bytes: Math.round(dto.signatureDataUrl.length * 0.75),
                    },
                });
            }
        }
        await this.audit.log(record.job.companyId, "portal.sign", `Signature captured for job ${record.job.jobRef}`, null);
        return { signedAt: updated.signedAt };
    }
    async checkout(token) {
        (0, feature_flags_1.requireMarketplaceEnabled)();
        const record = await this.resolveToken(token);
        const db = this.prisma;
        const settings = await db.tenantSetting.findUnique({ where: { tenantId: record.job.companyId } });
        const portalEnabled = Boolean(settings?.featureCustomerPortal || settings?.paymentsEnabled);
        if (!portalEnabled) {
            throw new common_1.BadRequestException("Customer portal is not enabled for this tenant");
        }
        if (!settings?.paymentsEnabled) {
            throw new common_1.BadRequestException("Payments not configured for this tenant");
        }
        if (!this.billingService.isStripeConfigured()) {
            throw new common_1.ServiceUnavailableException("Payments are not configured");
        }
        return this.billingService.createJobPaymentSession(record.job.companyId, record.jobId, token);
    }
    async paymentStatus(token, sessionId) {
        (0, feature_flags_1.requireMarketplaceEnabled)();
        const record = await this.resolveToken(token);
        if (!this.billingService.isStripeConfigured()) {
            return {
                configured: false,
                status: record.job.invoicePaidAt ? "paid" : "unpaid",
                receiptUrl: record.job.paymentReceiptUrl ?? null,
            };
        }
        const activeSessionId = sessionId || record.job.paymentCheckoutSessionId || undefined;
        if (!activeSessionId) {
            return {
                configured: true,
                status: record.job.invoicePaidAt ? "paid" : "unpaid",
                receiptUrl: record.job.paymentReceiptUrl ?? null,
            };
        }
        const status = await this.billingService.getJobPaymentStatus(record.job.companyId, record.jobId, activeSessionId);
        return {
            configured: true,
            ...status,
        };
    }
    async demoLogin(req, _body) {
        if (!(0, feature_flags_1.isPublicDemoEnabled)()) {
            throw new common_1.NotFoundException("Not found");
        }
        const ip = String(req.ip || "unknown").trim();
        const now = Date.now();
        const bucket = this.demoBuckets.get(ip);
        if (!bucket || bucket.resetAt <= now) {
            this.demoBuckets.set(ip, { count: 1, resetAt: now + this.demoWindowMs });
        }
        else {
            if (bucket.count >= this.demoMaxRequests) {
                throw new common_1.HttpException("Too many  login attempts. Please wait.", common_1.HttpStatus.TOO_MANY_REQUESTS);
            }
            bucket.count += 1;
            this.demoBuckets.set(ip, bucket);
        }
        const db = this.prisma;
        const demoUser = await db.user.findFirst({
            where: { email: "@mytitan.co.uk", company: { name: "" } },
            include: { company: true },
        });
        if (!demoUser) {
            throw new common_1.NotFoundException("account is not available");
        }
        const payload = {
            sub: demoUser.id,
            companyId: demoUser.companyId,
            role: demoUser.role,
            email: demoUser.email,
            emailVerified: Boolean(demoUser.emailVerified),
            demoUser: true,
        };
        const token = await this.jwtService.signAsync(payload, { expiresIn: "30m" });
        await this.audit.log(demoUser.companyId, "public.-login", "Public  login issued", demoUser.id);
        return {
            token,
            expiresInSeconds: 1800,
            user: {
                id: demoUser.id,
                email: demoUser.email,
                role: demoUser.role,
            },
            company: {
                id: demoUser.companyId,
                name: demoUser.company?.name || "",
            },
        };
    }
};
exports.PublicController = PublicController;
__decorate([
    (0, common_1.Get)("job/:token"),
    __param(0, (0, common_1.Param)("token")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PublicController.prototype, "getJob", null);
__decorate([
    (0, common_1.Get)("job/:token/pdf"),
    __param(0, (0, common_1.Param)("token")),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PublicController.prototype, "getJobPdf", null);
__decorate([
    (0, common_1.Post)("job/:token/approve"),
    __param(0, (0, common_1.Param)("token")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, public_dto_1.ApproveJobDto]),
    __metadata("design:returntype", Promise)
], PublicController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)("job/:token/decline"),
    __param(0, (0, common_1.Param)("token")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, public_dto_1.DeclineJobDto]),
    __metadata("design:returntype", Promise)
], PublicController.prototype, "decline", null);
__decorate([
    (0, common_1.Post)("job/:token/sign"),
    __param(0, (0, common_1.Param)("token")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, public_dto_1.SignJobDto]),
    __metadata("design:returntype", Promise)
], PublicController.prototype, "sign", null);
__decorate([
    (0, common_1.Post)("job/:token/checkout"),
    __param(0, (0, common_1.Param)("token")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PublicController.prototype, "checkout", null);
__decorate([
    (0, common_1.Get)("job/:token/payment-status"),
    __param(0, (0, common_1.Param)("token")),
    __param(1, (0, common_1.Query)("session_id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], PublicController.prototype, "paymentStatus", null);
__decorate([
    (0, common_1.Post)("-login"),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PublicController.prototype, "demoLogin", null);
exports.PublicController = PublicController = __decorate([
    (0, common_1.Controller)("public"),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        billing_service_1.BillingService,
        jwt_1.JwtService])
], PublicController);
//# sourceMappingURL=public.controller.js.map