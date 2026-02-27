import type { Request, Response } from "express";
import { JwtService } from "@nestjs/jwt";
import { AuditService } from "../audit/audit.service";
import { BillingService } from "../billing/billing.service";
import { PrismaService } from "../prisma/prisma.service";
import { ApproveJobDto, DeclineJobDto, SignJobDto } from "./public.dto";
export declare class PublicController {
    private readonly prisma;
    private readonly audit;
    private readonly billingService;
    private readonly jwtService;
    private readonly demoBuckets;
    private readonly demoWindowMs;
    private readonly demoMaxRequests;
    constructor(prisma: PrismaService, audit: AuditService, billingService: BillingService, jwtService: JwtService);
    private resolveToken;
    getJob(token: string): Promise<{
        job: {
            id: any;
            jobRef: any;
            status: any;
            customerName: any;
            customerEmail: any;
            customerPhone: any;
            vehicleMake: any;
            vehicleModel: any;
            vehicleReg: any;
            serviceName: any;
            subtotalCents: any;
            taxCents: any;
            totalCents: any;
            currency: any;
            invoicePdfUrl: any;
            invoiceIssuedAt: any;
            invoicePaidAt: any;
            paymentLinkUrl: any;
            approvedAt: any;
            approvedByName: any;
            signedAt: any;
            signatureName: any;
            signatureDataUrl: any;
            declinedAt: any;
            declinedReason: any;
            paymentReceiptUrl: any;
            jobType: any;
            tradeCode: any;
            formData: any;
            whatsappCompletionLink: any;
        };
        media: any;
        assets: any;
        signatures: any;
        pdf: any;
        portal: {
            enabled: boolean;
            paymentsEnabled: boolean;
            stripeConfigured: boolean;
            featureFlag: boolean;
            pdfDownloadAllowed: boolean;
            supportEmail: string;
            supportPhone: any;
            brand: {
                tenantName: any;
                logoUrl: any;
                primaryColor: any;
            };
            summary: {
                approvedAt: any;
                approvedByName: any;
                declinedAt: any;
                signedAt: any;
                signatureName: any;
                invoiceIssuedAt: any;
                invoicePaidAt: any;
                totalCents: any;
                currency: any;
                paymentMethod: any;
                paymentStatus: any;
                pdfReady: boolean;
            };
        };
    }>;
    getJobPdf(token: string, res: Response): Promise<void>;
    approve(token: string, dto: ApproveJobDto): Promise<{
        approvedAt: any;
    }>;
    decline(token: string, dto: DeclineJobDto): Promise<{
        declinedAt: any;
    }>;
    sign(token: string, dto: SignJobDto): Promise<{
        signedAt: any;
    }>;
    checkout(token: string): Promise<{
        url: string;
    }>;
    paymentStatus(token: string, sessionId?: string): Promise<{
        configured: boolean;
        status: string;
        receiptUrl: any;
    }>;
    demoLogin(req: Request, _body: Record<string, never>): Promise<{
        token: string;
        expiresInSeconds: number;
        user: {
            id: any;
            email: any;
            role: any;
        };
        company: {
            id: any;
            name: any;
        };
    }>;
}
