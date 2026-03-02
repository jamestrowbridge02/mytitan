import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { JwtService } from "@nestjs/jwt";
import { AuditService } from "../audit/audit.service";
import { BillingService } from "../billing/billing.service";
import { isMarketplaceEnabled, isMediaSignatureV1Enabled, isPublicDemoEnabled, requireMarketplaceEnabled } from "../common/feature-flags";
import { PrismaService } from "../prisma/prisma.service";
import { ApproveJobDto, DeclineJobDto, SignJobDto } from "./public.dto";

@Controller("public")
export class PublicController {
  private readonly demoBuckets = new Map<string, { count: number; resetAt: number }>();
  private readonly demoWindowMs = 60 * 1000;
  private readonly demoMaxRequests = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billingService: BillingService,
    private readonly jwtService: JwtService,
  ) {}

  private async resolveToken(token: string) {
    const db = this.prisma as any;
    const record = await db.publicJobToken.findUnique({
      where: { token },
      include: { job: { include: { media: true, assets: true, signatures: true, pdf: true, company: true } } },
    });
    if (!record) {
      throw new NotFoundException("Token not found");
    }
    if (record.expiresAt < new Date()) {
      throw new BadRequestException("Token expired");
    }
    return record;
  }

  @Get("job/:token")
  async getJob(@Param("token") token: string) {
    const record = await this.resolveToken(token);
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId: record.job.companyId } });
    const paymentsEnabled = Boolean(settings?.paymentsEnabled);
    const portalEnabled = Boolean(settings?.featureCustomerPortal || settings?.paymentsEnabled);
    const stripeReady = this.billingService.isStripeConfigured();

    await this.audit.log(record.job.companyId, "portal.view", `Portal view for job ${record.job.jobRef}`, null);

    const formData = record.job.formData as Record<string, any> | null;
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
        featureFlag: isMarketplaceEnabled(),
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

  @Get("job/:token/pdf")
  async getJobPdf(@Param("token") token: string, @Res() res: Response) {
    const record = await this.resolveToken(token);
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId: record.job.companyId } });
    const portalEnabled = Boolean(settings?.featureCustomerPortal || settings?.paymentsEnabled);
    if (!portalEnabled) {
      throw new BadRequestException("PDF download is not enabled for this tenant");
    }

    const pdf = record.job.pdf;
    if (!pdf?.contentBase64) {
      throw new NotFoundException("PDF is not ready yet. Please check back shortly.");
    }

    const fileName = `${record.job.jobRef || record.job.id}.pdf`;
    const buffer = Buffer.from(pdf.contentBase64, "base64");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(buffer);
  }

  @Post("job/:token/approve")
  async approve(@Param("token") token: string, @Body() dto: ApproveJobDto) {
    const record = await this.resolveToken(token);
    const db = this.prisma as any;
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

  @Post("job/:token/decline")
  async decline(@Param("token") token: string, @Body() dto: DeclineJobDto) {
    requireMarketplaceEnabled();
    const record = await this.resolveToken(token);
    const db = this.prisma as any;
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

  @Post("job/:token/sign")
  async sign(@Param("token") token: string, @Body() dto: SignJobDto) {
    const record = await this.resolveToken(token);
    if (dto.signatureDataUrl && !dto.signatureDataUrl.startsWith("data:image")) {
      throw new BadRequestException("Invalid signature data");
    }
    if (dto.signatureDataUrl && dto.signatureDataUrl.length > 300_000) {
      throw new BadRequestException("Signature data too large");
    }
    const db = this.prisma as any;
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
      if (isMediaSignatureV1Enabled() && db.jobSignature) {
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

  @Post("job/:token/checkout")
  async checkout(@Param("token") token: string) {
    requireMarketplaceEnabled();
    const record = await this.resolveToken(token);
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId: record.job.companyId } });
    const portalEnabled = Boolean(settings?.featureCustomerPortal || settings?.paymentsEnabled);
    if (!portalEnabled) {
      throw new BadRequestException("Customer portal is not enabled for this tenant");
    }
    if (!settings?.paymentsEnabled) {
      throw new BadRequestException("Payments not configured for this tenant");
    }
    if (!this.billingService.isStripeConfigured()) {
      throw new ServiceUnavailableException("Payments are not configured");
    }

    return this.billingService.createJobPaymentSession(record.job.companyId, record.jobId, token);
  }

  @Get("job/:token/payment-status")
  async paymentStatus(@Param("token") token: string, @Query("session_id") sessionId?: string) {
    requireMarketplaceEnabled();
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

  @Post("-login")
  @HttpCode(200)
  async demoLogin(@Req() req: Request, @Body() _body: Record<string, never>) {
    if (!isPublicDemoEnabled()) {
      throw new NotFoundException("Not found");
    }
    const ip = String(req.ip || "unknown").trim();
    const now = Date.now();
    const bucket = this.demoBuckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      this.demoBuckets.set(ip, { count: 1, resetAt: now + this.demoWindowMs });
    } else {
      if (bucket.count >= this.demoMaxRequests) {
        throw new HttpException("Too many  login attempts. Please wait.", HttpStatus.TOO_MANY_REQUESTS);
      }
      bucket.count += 1;
      this.demoBuckets.set(ip, bucket);
    }

    const db = this.prisma as any;
    const demoUser = await db.user.findFirst({
      where: { email: "@mytitan.co.uk", company: { name: "" } },
      include: { company: true },
    });
    if (!demoUser) {
      throw new NotFoundException("account is not available");
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
}
