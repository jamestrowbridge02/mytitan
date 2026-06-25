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
  Patch,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import * as crypto from "crypto";
import type { Request, Response } from "express";
import { JwtService } from "@nestjs/jwt";
import { AutomationsService } from "../automations/automations.service";
import { AuditService } from "../audit/audit.service";
import { BillingService } from "../billing/billing.service";
import { buildCustomerOutputPresentation, resolveCustomerOutputFields } from "../common/customer-fields";
import { isMarketplaceEnabled, isMediaSignatureV1Enabled, requireMarketplaceEnabled } from "../common/feature-flags";
import { buildAppUrl } from "../common/public-url";
import { getCustomerFeedbackSettings, getPortalControlSettings, getPortalCopy } from "../common/business-config";
import { PrismaService } from "../prisma/prisma.service";
import { ActivityService } from "../events/activity.service";
import { ArtifactsService } from "../artifacts/artifacts.service";
import { BookingsService } from "../bookings/bookings.service";
import { CustomerWorkspaceService } from "../customer-workspace/customer-workspace.service";
import { CustomerJourneyService } from "../jobs/customer-journey.service";
import { JobExecutionService } from "../jobs/job-execution.service";
import { ServicePlansService } from "../service-plans/service-plans.service";
import { JobCompletionLinkService } from "../jobs/job-completion-link.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SubmitPublicSupportRequestDto } from "../notifications/dto";
import { ApproveJobDto, DeclineJobDto, SaveCompletionQuickLinkDto, SignJobDto, SubmitCompletionQuickLinkDto } from "./public.dto";

@Controller("public")
export class PublicController {
  private readonly demoBuckets = new Map<string, { count: number; resetAt: number }>();
  private readonly supportBuckets = new Map<string, { count: number; resetAt: number }>();
  private readonly demoWindowMs = 60 * 1000;
  private readonly demoMaxRequests = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billingService: BillingService,
    private readonly jwtService: JwtService,
    private readonly automations: AutomationsService,
    private readonly activity: ActivityService,
    private readonly artifacts: ArtifactsService,
    private readonly bookings: BookingsService,
    private readonly customerWorkspace: CustomerWorkspaceService,
    private readonly jobExecution: JobExecutionService,
    private readonly jobCompletionLinks: JobCompletionLinkService,
    private readonly servicePlans: ServicePlansService,
    private readonly notifications: NotificationsService,
    private readonly customerJourney: CustomerJourneyService,
  ) {}

  private appBaseUrl() {
    return buildAppUrl("/");
  }

  private hashSegment(value: string) {
    return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
  }

  private enforceSupportRateLimit(req: Request, email: string) {
    const key = `public-support:${this.hashSegment(String(req.ip || "unknown"))}:${this.hashSegment(String(email || "unknown"))}`;
    const now = Date.now();
    const current = this.supportBuckets.get(key);
    if (!current || current.resetAt <= now) {
      this.supportBuckets.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
      return;
    }
    if (current.count >= 4) {
      throw new HttpException("Too many attempts. Please wait a moment and try again.", HttpStatus.TOO_MANY_REQUESTS);
    }
    current.count += 1;
    this.supportBuckets.set(key, current);
  }

  private buildCustomerScopeWhere(job: any) {
    if (job?.customerId) {
      return { companyId: job.companyId, customerId: job.customerId };
    }
    if (job?.tradeAccountId) {
      return { companyId: job.companyId, tradeAccountId: job.tradeAccountId };
    }
    return null;
  }

  private buildPortalBookingUrl(token: string, job: any, options?: { serviceId?: string | null; date?: string | null }) {
    const params = new URLSearchParams();
    if (job?.customerName) params.set("customerName", String(job.customerName));
    if (job?.customerEmail) params.set("customerEmail", String(job.customerEmail));
    if (job?.customerPhone) params.set("customerPhone", String(job.customerPhone));
    if (job?.tradeAccountId) params.set("tradeAccountId", String(job.tradeAccountId));
    if (options?.serviceId) params.set("serviceId", String(options.serviceId));
    if (options?.date) params.set("date", String(options.date));
    const query = params.toString();
    return `${this.appBaseUrl().replace(/\/$/, "")}/portal/booking/${token}${query ? `?${query}` : ""}`;
  }

  private async buildPortalBookingContext(settings: any, job: any) {
    if (!isMarketplaceEnabled()) {
      return {
        enabled: false,
        available: false,
        bookingUrl: null,
        message: "Online booking is unavailable in this environment.",
        services: [],
        nextSlots: [],
      };
    }

    if (!settings?.bookingPublicEnabled || !settings?.bookingPublicToken) {
      return {
        enabled: false,
        available: false,
        bookingUrl: null,
        message: "Online booking is not enabled for this workspace right now.",
        services: [],
        nextSlots: [],
      };
    }

    const config = await this.bookings.getPublicConfig(settings.bookingPublicToken).catch(() => null);
    const services = Array.isArray(config?.services) ? config.services : [];
    const bookingUrl = this.buildPortalBookingUrl(settings.bookingPublicToken, job);

    if (!services.length) {
      return {
        enabled: true,
        available: false,
        bookingUrl,
        message: "Online booking is enabled, but no services are currently published.",
        services: [],
        nextSlots: [],
      };
    }

    const preferredService =
      services.find((service: any) => service?.id && (service.id === job?.proServiceId || service.id === job?.serviceId)) ||
      services[0];
    const nextSlots: Array<Record<string, any>> = [];
    for (let offset = 0; offset < 14 && nextSlots.length < 3; offset += 1) {
      const target = new Date();
      target.setUTCDate(target.getUTCDate() + offset);
      const day = target.toISOString().slice(0, 10);
      const slots = await this.bookings.getAvailableSlots(settings.bookingPublicToken, day, preferredService.id).catch(() => []);
      for (const slot of Array.isArray(slots) ? slots : []) {
        if (nextSlots.length >= 3) break;
        nextSlots.push({
          serviceId: preferredService.id,
          serviceName: preferredService.name,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          date: String(slot.startsAt || "").slice(0, 10),
          bookingUrl: this.buildPortalBookingUrl(settings.bookingPublicToken, job, {
            serviceId: preferredService.id,
            date: String(slot.startsAt || "").slice(0, 10),
          }),
        });
      }
    }

    return {
      enabled: true,
      available: nextSlots.length > 0,
      bookingUrl,
      message:
        nextSlots.length > 0
          ? "Availability below is live. Choose a slot to continue with booking."
          : "Online booking is enabled, but there are no open appointment slots in the current window.",
      services: services.slice(0, 6).map((service: any) => ({
        id: service.id,
        name: service.name,
        description: service.description || null,
        durationMinutes: Number(service.durationMinutes || 0) || null,
      })),
      nextSlots,
    };
  }

  private async buildPortalWorkHistory(job: any) {
    const scopeWhere = this.buildCustomerScopeWhere(job);
    if (!scopeWhere) {
      return {
        available: false,
        summary: {
          totalJobs: 0,
          outstandingInvoices: 0,
          paidJobs: 0,
        },
        jobs: [],
      };
    }

    const rows = await (this.prisma as any).job.findMany({
      where: {
        ...scopeWhere,
        deletedAt: null,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 6,
      select: {
        id: true,
        jobRef: true,
        status: true,
        serviceName: true,
        createdAt: true,
        completedAt: true,
        approvedAt: true,
        declinedAt: true,
        invoiceIssuedAt: true,
        invoiceDueAt: true,
        invoicePaidAt: true,
        totalCents: true,
        currency: true,
        vehicleMake: true,
        vehicleModel: true,
        vehicleReg: true,
      },
    });

    return {
      available: rows.length > 0,
      summary: {
        totalJobs: rows.length,
        outstandingInvoices: rows.filter((entry: any) => entry.invoiceIssuedAt && !entry.invoicePaidAt).length,
        paidJobs: rows.filter((entry: any) => entry.invoicePaidAt).length,
      },
      jobs: rows.map((entry: any) => ({
        id: entry.id,
        jobRef: entry.jobRef || entry.id,
        status: entry.status || null,
        serviceName: entry.serviceName || null,
        createdAt: entry.createdAt,
        completedAt: entry.completedAt,
        invoiceIssuedAt: entry.invoiceIssuedAt,
        invoiceDueAt: entry.invoiceDueAt,
        invoicePaidAt: entry.invoicePaidAt,
        totalCents: entry.totalCents,
        currency: entry.currency,
        approvalState: entry.declinedAt ? "DECLINED" : entry.approvedAt ? "APPROVED" : "PENDING",
        billingState: entry.invoicePaidAt ? "paid" : entry.invoiceIssuedAt ? "invoice_issued" : "pre_invoice",
        vehicleLabel: [entry.vehicleMake, entry.vehicleModel, entry.vehicleReg].filter(Boolean).join(" ") || null,
        active: entry.id === job.id,
      })),
    };
  }

  @Post("contact-mytitan")
  @HttpCode(HttpStatus.OK)
  async contactMyTitan(@Req() req: Request, @Body() dto: SubmitPublicSupportRequestDto) {
    this.enforceSupportRateLimit(req, dto.email);
    return this.notifications.submitSupportRequest({
      category: dto.category,
      subject: dto.subject,
      message: dto.message,
      requesterEmail: dto.email,
      requesterName: dto.name,
      companyName: dto.companyName,
      route: "marketing",
    });
  }

  private async resolveToken(token: string) {
    const db = this.prisma as any;
    const record = await db.publicJobToken.findUnique({
      where: { token },
      include: {
        job: {
          include: {
            media: true,
            assets: true,
            signatures: true,
            pdf: true,
            company: true,
            assignedUser: {
              select: { id: true, email: true },
            },
            tradeAccount: {
              include: {
                locations: {
                  orderBy: [{ isPrimary: "desc" }, { isBilling: "desc" }, { createdAt: "asc" }],
                },
                contacts: {
                  orderBy: [{ isPrimary: "desc" }, { isBilling: "desc" }, { createdAt: "asc" }],
                  include: {
                    preferences: {
                      orderBy: [{ event: "asc" }, { channel: "asc" }],
                    },
                  },
                },
              },
            },
            activities: {
              orderBy: { createdAt: 'desc' },
              take: 12,
              select: { eventType: true, message: true, createdAt: true },
            },
          },
        },
      },
    });
    if (!record) {
      throw new NotFoundException("Token not found");
    }
    if (record.job?.deletedAt) {
      throw new NotFoundException("Job not found");
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
    const stripeReady = false;
    const portalCopy = getPortalCopy(settings);
    const portalControls = getPortalControlSettings(settings);
    const customerFeedback = getCustomerFeedbackSettings(settings);

    await this.audit.log(record.job.companyId, "portal.view", `Portal view for job ${record.job.jobRef}`, null);

    const formData = record.job.formData as Record<string, any> | null;
    const customerProfile = resolveCustomerOutputFields({
      job: record.job,
      tradeAccount: record.job.tradeAccount || null,
      formData,
    });
    const customerPresentation = buildCustomerOutputPresentation(customerProfile);
    const paymentMethod = formData?.paymentMethod ?? null;
    const paymentStatus = formData?.paymentStatus ?? null;
    const portalDocuments = portalControls.allowCustomerDocumentDownload
      ? await this.artifacts.listPortalArtifactsForJob(record.job.companyId, record.job.id, token, {
      invoicePdfUrl: record.job.invoicePdfUrl,
      paymentReceiptUrl: record.job.paymentReceiptUrl,
        createdAt: record.job.createdAt,
      })
      : [];
    const portalServicePlans = record.job.customerId
      ? await this.servicePlans.listPortalVisibleForCustomer(record.job.companyId, record.job.customerId)
      : [];
    const executionRecord = record.job.customerId
      ? await this.jobExecution.getCustomerVisibleExecution(record.job.companyId, record.job.customerId, record.job.id).catch(() => null)
      : null;
    const [portalBooking, workHistory, paymentRequest, customerJourney] = await Promise.all([
      this.buildPortalBookingContext(settings, record.job),
      this.buildPortalWorkHistory(record.job),
      this.billingService.getPublicPaymentRequestForJob(record.job.companyId, record.job.id),
      this.customerJourney.buildCustomerJourney(record.job.companyId, record.job, { publicView: true }).catch(() => ({ enabled: false })),
    ]);
    const pdfReady = Boolean(record.job.pdf?.contentBase64 || portalDocuments.some((item: any) => item.kind === "INVOICE" || item.kind === "PORTAL_DOCUMENT"));
    const paymentAvailable = Boolean(paymentRequest?.actionAvailable);
    const invoiceOverdue = Boolean(record.job.invoiceDueAt && !record.job.invoicePaidAt && new Date(record.job.invoiceDueAt).getTime() < Date.now());
    const billingState = record.job.invoicePaidAt
      ? 'paid'
      : record.job.invoiceIssuedAt
      ? invoiceOverdue
        ? 'invoice_overdue'
        : 'invoice_issued'
      : record.job.status === 'COMPLETED' || record.job.status === 'INVOICED'
      ? 'invoice_ready'
      : 'pre_invoice';
    const nextCustomerStep = record.job.declinedAt
      ? 'This job is paused while the scope is reviewed. Contact the team if anything needs correcting before work continues.'
      : !record.job.approvedAt
      ? 'Review the completed work summary and confirm it when you are happy for the job to continue.'
      : !record.job.signedAt
      ? 'Add your signature to confirm the approved work and keep the service record complete.'
      : record.job.invoicePaidAt
      ? String(portalCopy.paidMessage || 'Payment is complete. Your receipt and service record are ready below.')
      : record.job.invoiceIssuedAt
      ? invoiceOverdue
        ? String(portalCopy.invoiceOverdueMessage || 'Your invoice is overdue. Please complete payment or contact the team if anything needs checking first.')
        : paymentAvailable
        ? String(portalCopy.invoiceReadyMessage || 'Your invoice is ready. Customer payments go through the business payment setup, not MyTitan billing.')
        : String(portalCopy.paymentUnavailableMessage || 'Your invoice is ready. Contact the team to complete payment or ask them to finish payment setup.')
      : record.job.status === 'COMPLETED' || record.job.status === 'INVOICED'
      ? String(portalCopy.preInvoiceMessage || 'The work is complete. We are preparing the final customer documents now.')
      : 'Track progress here while the job moves through service delivery.';

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
        subtotalCents: portalControls.displayInvoicesPayments ? record.job.subtotalCents : null,
        taxCents: portalControls.displayInvoicesPayments ? record.job.taxCents : null,
        totalCents: portalControls.displayInvoicesPayments ? record.job.totalCents : null,
        currency: record.job.currency,
        invoicePdfUrl: portalControls.displayInvoicesPayments ? record.job.invoicePdfUrl : null,
        invoiceIssuedAt: portalControls.displayInvoicesPayments ? record.job.invoiceIssuedAt : null,
        invoiceDueAt: portalControls.displayInvoicesPayments ? record.job.invoiceDueAt : null,
        invoicePaidAt: portalControls.displayInvoicesPayments ? record.job.invoicePaidAt : null,
        paymentLinkUrl: null,
        approvedAt: record.job.approvedAt,
        approvedByName: record.job.approvedByName,
        signedAt: record.job.signedAt,
        signatureName: record.job.signatureName,
        signatureDataUrl: record.job.signatureDataUrl,
        declinedAt: record.job.declinedAt,
        declinedReason: record.job.declinedReason,
        paymentReceiptUrl: portalControls.displayInvoicesPayments ? record.job.paymentReceiptUrl : null,
        jobType: record.job.jobType,
        tradeCode: record.job.tradeCode,
        formData: record.job.formData,
        customerProfile,
        customerPresentation,
        mergeFields: customerProfile.mergeFields,
        whatsappCompletionLink: record.job.whatsappCompletionLink,
      },
      media: portalControls.displayBeforeAfterPhotos ? record.job.media : [],
      assets: portalControls.displayBeforeAfterPhotos ? record.job.assets : [],
      signatures: record.job.signatures,
      pdf: record.job.pdf,
      portal: {
        enabled: portalEnabled,
        controls: portalControls,
        paymentsEnabled,
        stripeConfigured: false,
        featureFlag: isMarketplaceEnabled(),
        pdfDownloadAllowed: portalEnabled && portalControls.allowCustomerDocumentDownload,
        supportEmail: process.env.SUPPORT_EMAIL || null,
        supportPhone: settings?.supportPhone || null,
        brand: {
          tenantName: settings?.companyName || record.job.company?.name || "MyTitan",
          logoUrl: settings?.logoUrl || null,
          primaryColor: portalControls.brandPrimaryColor || settings?.brandPrimaryColor || null,
        },
        feedbackRequest: customerFeedback.enabled
          ? {
              enabled: true,
              promptText: customerFeedback.promptText,
              publicReviewUrl: customerFeedback.publicReviewUrl,
              thankYouText: customerFeedback.thankYouText,
            }
          : {
              enabled: false,
              promptText: customerFeedback.promptText,
              publicReviewUrl: customerFeedback.publicReviewUrl,
              thankYouText: customerFeedback.thankYouText,
            },
        summary: {
          approvedAt: record.job.approvedAt,
          approvedByName: record.job.approvedByName,
          declinedAt: record.job.declinedAt,
          signedAt: record.job.signedAt,
          signatureName: record.job.signatureName,
          invoiceIssuedAt: portalControls.displayInvoicesPayments ? record.job.invoiceIssuedAt : null,
          invoiceDueAt: portalControls.displayInvoicesPayments ? record.job.invoiceDueAt : null,
          invoicePaidAt: portalControls.displayInvoicesPayments ? record.job.invoicePaidAt : null,
          totalCents: portalControls.displayInvoicesPayments ? record.job.totalCents : null,
          currency: record.job.currency,
          paymentMethod: portalControls.displayInvoicesPayments ? paymentMethod : null,
          paymentStatus: portalControls.displayInvoicesPayments ? paymentStatus : null,
          paymentAvailable: portalControls.displayInvoicesPayments ? paymentAvailable : false,
          paymentRequest: portalControls.displayInvoicesPayments ? paymentRequest : null,
          billingState: portalControls.displayInvoicesPayments ? billingState : 'hidden_by_workspace',
          nextCustomerStep: portalControls.customerContactMessage || nextCustomerStep,
          invoiceOverdue: portalControls.displayInvoicesPayments ? invoiceOverdue : false,
          receiptReady: portalControls.displayInvoicesPayments && Boolean(record.job.paymentReceiptUrl || portalDocuments.some((item: any) => item.kind === "RECEIPT")),
          pdfReady,
        },
        documents: portalDocuments,
        booking: portalBooking,
        workHistory,
        servicePlans: portalServicePlans,
        executionRecord: portalControls.displayEtaWindow ? executionRecord : null,
        journey: customerJourney,
        timeline: (record.job.activities || [])
          .filter((item: any) => ['job.status', 'job.reminder.create', 'job.reminder.completed', 'tech.arrived', 'customer_eta.update', 'customer_eta.delayed', 'customer_eta.on_route', 'customer_eta.arrived', 'booking.converted', 'billing.invoice.issued', 'billing.payment.received', 'billing.follow_up.escalated'].includes(String(item.eventType || '')))
          .map((item: any) => ({
            eventType: item.eventType,
            message: item.eventType === 'tech.arrived' ? 'Technician arrived on site.' : item.message,
            createdAt: item.createdAt,
          })),
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

  @Get("job/:token/artifacts/:artifactId")
  async getPortalArtifact(
    @Param("token") token: string,
    @Param("artifactId") artifactId: string,
    @Res() res: Response,
  ) {
    const record = await this.resolveToken(token);
    const { artifact, filePath } = await this.artifacts.getPortalArtifactForJob(record.job.companyId, record.job.id, artifactId);
    if (artifact.mimeType) {
      res.setHeader("Content-Type", artifact.mimeType);
    }
    if (artifact.fileName) {
      res.setHeader("Content-Disposition", `inline; filename="${artifact.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`);
    }
    return res.sendFile(filePath);
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
    await this.customerWorkspace.syncPortalJobApproval({
      tenantId: record.job.companyId,
      customerId: record.job.customerId || null,
      jobId: record.jobId,
      decision: "approve",
      actorName: dto.name ?? null,
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
    await this.customerWorkspace.syncPortalJobApproval({
      tenantId: record.job.companyId,
      customerId: record.job.customerId || null,
      jobId: record.jobId,
      decision: "decline",
      actorName: dto.name ?? null,
      note: dto.reason ?? null,
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
    await this.activity.push({
      tenantId: record.job.companyId,
      type: "portal.document_signed",
      label: `Portal document signed for ${updated.jobRef || updated.id}`,
      jobId: updated.id,
      jobRef: updated.jobRef || null,
      customerId: updated.customerId || null,
      customerName: updated.customerName || null,
      status: updated.status || null,
      payloadJson: {
        signerName: dto.name || null,
      },
    });
    await this.automations.evaluateRuleTrigger(record.job.companyId, "portal.document_signed", {
      actorUserId: null,
      jobId: updated.id,
      jobRef: updated.jobRef || null,
      customerId: updated.customerId || null,
      customerName: updated.customerName || null,
      status: updated.status || null,
      assignedUserId: updated.assignedUserId || null,
    });
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
    throw new BadRequestException("Customer payments must be collected through the business payment setup. MyTitan billing is separate from customer payments.");
  }

  @Get("job/:token/payment-status")
  async paymentStatus(@Param("token") token: string, @Query("session_id") sessionId?: string) {
    requireMarketplaceEnabled();
    const record = await this.resolveToken(token);
    return {
      configured: false,
      status: record.job.invoicePaidAt ? "paid" : "unpaid",
      receiptUrl: record.job.paymentReceiptUrl ?? null,
    };
  }

  @Get('job-completion/:token')
  async getCompletionLink(@Param('token') token: string) {
    return this.jobCompletionLinks.getPublicContext(token);
  }

  @Patch('job-completion/:token')
  async saveCompletionLink(@Param('token') token: string, @Body() dto: SaveCompletionQuickLinkDto) {
    return this.jobCompletionLinks.saveFromPublicLink(token, dto);
  }

  @Post('job-completion/:token/submit')
  async submitCompletionLink(@Param('token') token: string, @Body() dto: SubmitCompletionQuickLinkDto) {
    return this.jobCompletionLinks.submitFromPublicLink(token, dto);
  }

}
