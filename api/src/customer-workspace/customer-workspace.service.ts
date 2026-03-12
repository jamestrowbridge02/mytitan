import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { ActivityService } from "../events/activity.service";
import { PrismaService } from "../prisma/prisma.service";
import { RevenueService } from "../revenue/revenue.service";
import { ServicePlansService } from "../service-plans/service-plans.service";
import { CustomerJwtPayload } from "./customer-auth.types";
import type { CreateCustomerApprovalDto, CustomerServicePlanChangeRequestDto } from "./dto";

type ApprovalStatus = "PENDING" | "APPROVED" | "DECLINED";
type ApprovalEntityType = "JOB" | "DOCUMENT" | "SERVICE_PLAN" | "QUOTE";
type ApprovalKind = "WORK_AUTHORIZATION" | "DOCUMENT_ACKNOWLEDGEMENT" | "PLAN_APPROVAL" | "QUOTE_ACCEPTANCE";

@Injectable()
export class CustomerWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly activity: ActivityService,
    private readonly servicePlans: ServicePlansService,
    private readonly revenue: RevenueService,
  ) {}

  private tokenHash(token: string) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private makeInviteToken() {
    return `custinvite_${crypto.randomBytes(24).toString("hex")}`;
  }

  private buildCustomerToken(account: { id: string; tenantId: string; customerId: string; email: string }) {
    const payload: CustomerJwtPayload = {
      sub: account.id,
      tenantId: account.tenantId,
      customerId: account.customerId,
      email: account.email,
      scope: "customer",
    };
    return this.jwt.sign(payload);
  }

  private appBaseUrl() {
    return String(process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
  }

  private async resolveCustomer(tenantId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        companyId: tenantId,
        OR: [{ id: customerId }, { slug: customerId }],
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!customer) throw new NotFoundException("Customer not found");
    return customer;
  }

  private async resolveApprovalEntity(tenantId: string, dto: CreateCustomerApprovalDto) {
    if (dto.entityType === "JOB") {
      if (dto.kind !== "WORK_AUTHORIZATION") {
        throw new BadRequestException("Jobs support work authorization approvals only");
      }
      const job = await this.prisma.job.findFirst({
        where: {
          id: dto.entityId,
          companyId: tenantId,
          customerId: dto.customerId,
        },
        select: {
          id: true,
          jobRef: true,
          customerId: true,
          customerName: true,
          status: true,
        },
      });
      if (!job) throw new BadRequestException("Job not found for this customer");
      return {
        entityType: "JOB" as const,
        entityId: job.id,
        customerId: job.customerId || dto.customerId,
        label: job.jobRef || "Job approval",
        activity: {
          jobId: job.id,
          jobRef: job.jobRef || null,
          customerId: job.customerId || dto.customerId,
          customerName: job.customerName || null,
          status: job.status || null,
        },
      };
    }

    if (dto.entityType === "DOCUMENT") {
      if (dto.kind !== "DOCUMENT_ACKNOWLEDGEMENT") {
        throw new BadRequestException("Documents support acknowledgement approvals only");
      }
      const artifact = await this.prisma.documentArtifact.findFirst({
        where: {
          id: dto.entityId,
          tenantId,
          portalVisible: true,
          entityType: "JOB",
        },
        select: {
          id: true,
          label: true,
          entityId: true,
          kind: true,
        },
      });
      if (!artifact) throw new BadRequestException("Portal-visible document not found");

      const job = await this.prisma.job.findFirst({
        where: {
          id: artifact.entityId,
          companyId: tenantId,
          customerId: dto.customerId,
        },
        select: {
          id: true,
          jobRef: true,
          customerId: true,
          customerName: true,
          status: true,
        },
      });
      if (!job) throw new BadRequestException("Document does not belong to this customer");
      return {
        entityType: "DOCUMENT" as const,
        entityId: artifact.id,
        customerId: job.customerId || dto.customerId,
        label: artifact.label,
        activity: {
          jobId: job.id,
          jobRef: job.jobRef || null,
          customerId: job.customerId || dto.customerId,
          customerName: job.customerName || null,
          status: job.status || null,
        },
      };
    }

    if (dto.entityType === "SERVICE_PLAN") {
      if (dto.kind !== "PLAN_APPROVAL") {
        throw new BadRequestException("Service plans support plan approvals only");
      }
      const plan = await this.prisma.servicePlan.findFirst({
        where: {
          id: dto.entityId,
          tenantId,
          customerId: dto.customerId,
        },
        select: {
          id: true,
          name: true,
          customerId: true,
          status: true,
          customer: { select: { name: true } },
        },
      });
      if (!plan) throw new BadRequestException("Service plan not found for this customer");
      return {
        entityType: "SERVICE_PLAN" as const,
        entityId: plan.id,
        customerId: plan.customerId,
        label: plan.name,
        activity: {
          jobId: null,
          jobRef: null,
          customerId: plan.customerId,
          customerName: plan.customer?.name || null,
          status: plan.status || null,
        },
      };
    }

    if (dto.entityType === "QUOTE") {
      if (dto.kind !== "QUOTE_ACCEPTANCE") {
        throw new BadRequestException("Quotes support acceptance approvals only");
      }
      const quote = await this.prisma.quote.findFirst({
        where: {
          id: dto.entityId,
          tenantId,
          customerId: dto.customerId,
        },
        select: {
          id: true,
          quoteNumber: true,
          title: true,
          customerId: true,
          status: true,
          customer: { select: { name: true } },
          job: { select: { id: true, jobRef: true, status: true } },
        },
      });
      if (!quote) throw new BadRequestException("Quote not found for this customer");
      return {
        entityType: "QUOTE" as const,
        entityId: quote.id,
        customerId: quote.customerId,
        label: quote.quoteNumber || quote.title,
        activity: {
          jobId: quote.job?.id || null,
          jobRef: quote.job?.jobRef || null,
          customerId: quote.customerId,
          customerName: quote.customer?.name || null,
          status: quote.status || null,
        },
      };
    }

    throw new BadRequestException("Unsupported approval entity type");
  }

  private async buildApprovalView(approval: any) {
    let entityLabel = "";
    let entityHref: string | null = null;

    if (approval.entityType === "JOB") {
      const job = await this.prisma.job.findFirst({
        where: { id: approval.entityId, companyId: approval.tenantId },
        select: { id: true, jobRef: true, status: true },
      });
      entityLabel = job?.jobRef || "Job";
      entityHref = job?.id ? `/dashboard/jobs/${job.id}` : null;
    } else if (approval.entityType === "DOCUMENT") {
      const artifact = await this.prisma.documentArtifact.findFirst({
        where: { id: approval.entityId, tenantId: approval.tenantId },
        select: { id: true, label: true },
      });
      entityLabel = artifact?.label || "Document";
    } else if (approval.entityType === "SERVICE_PLAN") {
      const plan = await this.prisma.servicePlan.findFirst({
        where: { id: approval.entityId, tenantId: approval.tenantId },
        select: { id: true, name: true },
      });
      entityLabel = plan?.name || "Service plan";
      entityHref = plan?.id ? `/dashboard/service-plans` : null;
    } else if (approval.entityType === "QUOTE") {
      const quote = await this.prisma.quote.findFirst({
        where: { id: approval.entityId, tenantId: approval.tenantId },
        select: { id: true, quoteNumber: true, title: true },
      });
      entityLabel = quote?.quoteNumber || quote?.title || "Quote";
      entityHref = quote?.id ? `/dashboard/quotes` : null;
    }

    return {
      id: approval.id,
      customerId: approval.customerId,
      entityType: approval.entityType,
      entityId: approval.entityId,
      entityLabel,
      entityHref,
      kind: approval.kind,
      status: approval.status,
      requestedAt: approval.requestedAt,
      respondedAt: approval.respondedAt,
      responseNote: approval.responseNote || null,
      requestedByName: approval.requestedByUser?.email || null,
    };
  }

  async inviteCustomerAccount(tenantId: string, actorUserId: string, customerId: string) {
    const customer = await this.resolveCustomer(tenantId, customerId);
    const email = String(customer.email || "").trim().toLowerCase();
    if (!email) {
      throw new BadRequestException("Customer must have an email before you can invite an account");
    }

    const rawToken = this.makeInviteToken();
    const inviteTokenHash = this.tokenHash(rawToken);
    const inviteTokenExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const account = await this.prisma.customerAccount.upsert({
      where: {
        customerId: customer.id,
      },
      create: {
        tenantId,
        customerId: customer.id,
        email,
        passwordHash: "",
        status: "INVITED",
        invitedAt: new Date(),
        inviteTokenHash,
        inviteTokenExpiresAt,
      },
      update: {
        email,
        status: "INVITED",
        invitedAt: new Date(),
        inviteTokenHash,
        inviteTokenExpiresAt,
        activatedAt: null,
        passwordHash: "",
      },
      select: {
        id: true,
        email: true,
        status: true,
        invitedAt: true,
        activatedAt: true,
        lastLoginAt: true,
        customerId: true,
      },
    });

    const activationUrl = `${this.appBaseUrl()}/customer/activate?token=${encodeURIComponent(rawToken)}`;
    await this.activity.push({
      type: "customer.account.invited",
      label: `Invited customer account for ${customer.name}`,
      tenantId,
      customerId: customer.id,
      customerName: customer.name,
      payloadJson: {
        customerAccountId: account.id,
        email,
        invitedByUserId: actorUserId,
      },
    });

    return {
      ...account,
      activationUrl,
    };
  }

  async getCustomerAccountStatus(tenantId: string, customerId: string) {
    const customer = await this.resolveCustomer(tenantId, customerId);
    const account = await this.prisma.customerAccount.findUnique({
      where: {
        customerId: customer.id,
      },
      select: {
        id: true,
        email: true,
        status: true,
        invitedAt: true,
        activatedAt: true,
        lastLoginAt: true,
        updatedAt: true,
      },
    });
    return {
      customerId: customer.id,
      customerEmail: customer.email || null,
      account,
    };
  }

  async activateCustomerAccount(token: string, password: string) {
    const account = await this.prisma.customerAccount.findFirst({
      where: {
        inviteTokenHash: this.tokenHash(token),
        inviteTokenExpiresAt: { gt: new Date() },
        status: "INVITED",
      },
      select: {
        id: true,
        tenantId: true,
        customerId: true,
        email: true,
        customer: { select: { name: true } },
      },
    });
    if (!account) {
      throw new BadRequestException("Activation token is invalid or expired");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const updated = await this.prisma.customerAccount.update({
      where: { id: account.id },
      data: {
        passwordHash,
        status: "ACTIVE",
        activatedAt: new Date(),
        inviteTokenHash: null,
        inviteTokenExpiresAt: null,
        lastLoginAt: new Date(),
      },
      select: {
        id: true,
        tenantId: true,
        customerId: true,
        email: true,
      },
    });

    await this.activity.push({
      type: "customer.account.activated",
      label: `Customer account activated for ${account.customer?.name || account.email}`,
      tenantId: updated.tenantId,
      customerId: updated.customerId,
      customerName: account.customer?.name || null,
      payloadJson: {
        customerAccountId: updated.id,
        email: updated.email,
      },
    });

    return {
      token: this.buildCustomerToken(updated),
      account: await this.getCustomerWorkspace(updated.tenantId, updated.customerId),
    };
  }

  async loginCustomerAccount(emailInput: string, password: string) {
    const email = String(emailInput || "").trim().toLowerCase();
    const matches = await this.prisma.customerAccount.findMany({
      where: {
        email,
        status: "ACTIVE",
      },
      select: {
        id: true,
        tenantId: true,
        customerId: true,
        email: true,
        passwordHash: true,
      },
      take: 2,
    });
    if (matches.length !== 1) {
      throw new UnauthorizedException("Customer account not found");
    }

    const account = matches[0];
    const valid = await bcrypt.compare(password, account.passwordHash || "");
    if (!valid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    await this.prisma.customerAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      token: this.buildCustomerToken(account),
      account: await this.getCustomerWorkspace(account.tenantId, account.customerId),
    };
  }

  async getCustomerAuthMe(payload: CustomerJwtPayload) {
    const customer = await this.resolveCustomer(payload.tenantId, payload.customerId);
    const account = await this.prisma.customerAccount.findFirst({
      where: {
        id: payload.sub,
        tenantId: payload.tenantId,
        customerId: payload.customerId,
      },
      select: {
        id: true,
        email: true,
        status: true,
        lastLoginAt: true,
        activatedAt: true,
      },
    });
    return {
      account,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email || null,
        phone: customer.phone || null,
      },
    };
  }

  async createApprovalRequest(tenantId: string, actorUserId: string, dto: CreateCustomerApprovalDto) {
    await this.resolveCustomer(tenantId, dto.customerId);
    const entity = await this.resolveApprovalEntity(tenantId, dto);

    const existing = await this.prisma.customerApproval.findFirst({
      where: {
        tenantId,
        customerId: entity.customerId,
        entityType: entity.entityType,
        entityId: entity.entityId,
        kind: dto.kind,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException("A pending approval already exists for this record");
    }

    const approval = await this.prisma.customerApproval.create({
      data: {
        tenantId,
        customerId: entity.customerId,
        entityType: entity.entityType,
        entityId: entity.entityId,
        kind: dto.kind,
        status: "PENDING",
        requestedAt: new Date(),
        requestedByUserId: actorUserId,
      },
      include: {
        requestedByUser: { select: { email: true } },
      },
    });

    await this.activity.push({
      type: "customer.approval.requested",
      label: `Requested ${dto.kind.replaceAll("_", " ").toLowerCase()} for ${entity.label}`,
      tenantId,
      customerId: entity.activity.customerId,
      customerName: entity.activity.customerName,
      jobId: entity.activity.jobId,
      jobRef: entity.activity.jobRef,
      status: entity.activity.status,
      payloadJson: {
        approvalId: approval.id,
        entityType: entity.entityType,
        entityId: entity.entityId,
        kind: dto.kind,
        requestedByUserId: actorUserId,
      },
    });

    return this.buildApprovalView(approval);
  }

  async listApprovalsForOperator(
    tenantId: string,
    filters: { customerId?: string; entityType?: ApprovalEntityType; entityId?: string; status?: ApprovalStatus },
  ) {
    const rows = await this.prisma.customerApproval.findMany({
      where: {
        tenantId,
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
        ...(filters.entityType ? { entityType: filters.entityType } : {}),
        ...(filters.entityId ? { entityId: filters.entityId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: [{ requestedAt: "desc" }, { createdAt: "desc" }],
      include: {
        requestedByUser: { select: { email: true } },
      },
      take: 50,
    });
    return Promise.all(rows.map((row) => this.buildApprovalView(row)));
  }

  private async mirrorJobApprovalDecision(tenantId: string, customerId: string, entityId: string, decision: "approve" | "decline", note?: string | null, actorName?: string | null) {
    const job = await this.prisma.job.findFirst({
      where: {
        id: entityId,
        companyId: tenantId,
        customerId,
      },
      select: {
        id: true,
        jobRef: true,
        customerId: true,
        customerName: true,
        status: true,
      },
    });
    if (!job) {
      throw new BadRequestException("Job approval target no longer exists");
    }

    if (decision === "approve") {
      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          approvedAt: new Date(),
          approvedByName: actorName || "Customer account",
          declinedAt: null,
          declinedReason: null,
        },
      });
    } else {
      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          declinedAt: new Date(),
          declinedReason: note || null,
          approvedAt: null,
        },
      });
    }

    return job;
  }

  async respondToApproval(
    tenantId: string,
    customerId: string,
    approvalId: string,
    decision: "approve" | "decline",
    note?: string,
  ) {
    const approval = await this.prisma.customerApproval.findFirst({
      where: {
        id: approvalId,
        tenantId,
        customerId,
        status: "PENDING",
      },
      include: {
        customer: { select: { name: true } },
        requestedByUser: { select: { email: true } },
      },
    });
    if (!approval) {
      throw new NotFoundException("Approval not found");
    }

    let jobMeta: any = null;
    if (approval.entityType === "JOB" && approval.kind === "WORK_AUTHORIZATION") {
      jobMeta = await this.mirrorJobApprovalDecision(tenantId, customerId, approval.entityId, decision, note || null, approval.customer?.name || null);
    } else if (approval.entityType === "QUOTE" && approval.kind === "QUOTE_ACCEPTANCE") {
      const quoteResult = await this.revenue.recordCustomerQuoteDecision(tenantId, customerId, approval.entityId, decision, note || null);
      jobMeta = quoteResult?.jobId ? { id: quoteResult.jobId, jobRef: quoteResult.jobRef || null, status: quoteResult.status || null } : null;
    }

    const status = decision === "approve" ? "APPROVED" : "DECLINED";
    const updated = await this.prisma.customerApproval.update({
      where: { id: approval.id },
      data: {
        status,
        respondedAt: new Date(),
        responseNote: note || null,
      },
      include: {
        requestedByUser: { select: { email: true } },
      },
    });

    await this.activity.push({
      type: decision === "approve" ? "customer.approval.approved" : "customer.approval.declined",
      label: `${decision === "approve" ? "Approved" : "Declined"} ${approval.kind.replaceAll("_", " ").toLowerCase()}`,
      tenantId,
      customerId,
      customerName: approval.customer?.name || null,
      jobId: jobMeta?.id || null,
      jobRef: jobMeta?.jobRef || null,
      status: jobMeta?.status || null,
      payloadJson: {
        approvalId: approval.id,
        entityType: approval.entityType,
        entityId: approval.entityId,
        kind: approval.kind,
        note: note || null,
      },
    });

    return this.buildApprovalView(updated);
  }

  async syncPortalJobApproval(params: {
    tenantId: string;
    customerId?: string | null;
    jobId: string;
    decision: "approve" | "decline";
    note?: string | null;
    actorName?: string | null;
  }) {
    if (!params.customerId) return null;

    const existing = await this.prisma.customerApproval.findFirst({
      where: {
        tenantId: params.tenantId,
        customerId: params.customerId,
        entityType: "JOB",
        entityId: params.jobId,
        kind: "WORK_AUTHORIZATION",
        status: "PENDING",
      },
      orderBy: { requestedAt: "desc" },
      select: { id: true },
    });

    if (existing) {
      return this.respondToApproval(
        params.tenantId,
        params.customerId,
        existing.id,
        params.decision,
        params.note || undefined,
      );
    }

    const job = await this.prisma.job.findFirst({
      where: {
        id: params.jobId,
        companyId: params.tenantId,
        customerId: params.customerId,
      },
      select: {
        id: true,
        jobRef: true,
        status: true,
        customerName: true,
      },
    });
    if (!job) return null;

    const approval = await this.prisma.customerApproval.create({
      data: {
        tenantId: params.tenantId,
        customerId: params.customerId,
        entityType: "JOB",
        entityId: params.jobId,
        kind: "WORK_AUTHORIZATION",
        status: params.decision === "approve" ? "APPROVED" : "DECLINED",
        requestedAt: new Date(),
        respondedAt: new Date(),
        responseNote: params.note || null,
      },
      include: {
        requestedByUser: { select: { email: true } },
      },
    });

    await this.activity.push({
      type: params.decision === "approve" ? "customer.approval.approved" : "customer.approval.declined",
      label: `${params.decision === "approve" ? "Approved" : "Declined"} work authorization for ${job.jobRef || job.id}`,
      tenantId: params.tenantId,
      customerId: params.customerId,
      customerName: job.customerName || null,
      jobId: job.id,
      jobRef: job.jobRef || null,
      status: job.status || null,
      payloadJson: {
        approvalId: approval.id,
        source: "public_portal_token",
        actorName: params.actorName || null,
      },
    });

    return this.buildApprovalView(approval);
  }

  private async buildCustomerArtifacts(tenantId: string, customerId: string, jobs: Array<{ id: string; jobRef: string | null; invoicePdfUrl?: string | null; paymentReceiptUrl?: string | null; createdAt?: Date }>) {
    const jobIds = jobs.map((job) => job.id);
    const managed = jobIds.length
      ? await this.prisma.documentArtifact.findMany({
          where: {
            tenantId,
            entityType: "JOB",
            entityId: { in: jobIds },
            portalVisible: true,
          },
          orderBy: [{ createdAt: "desc" }],
          take: 20,
        })
      : [];

    const managedViews = managed.map((artifact) => {
      const job = jobs.find((item) => item.id === artifact.entityId);
      return {
        id: artifact.id,
        label: artifact.label,
        kind: artifact.kind,
        jobId: artifact.entityId,
        jobRef: job?.jobRef || null,
        createdAt: artifact.createdAt,
        downloadPath: `/customer-workspace/artifacts/${artifact.id}`,
      };
    });

    const legacy = jobs.flatMap((job) => {
      const items: any[] = [];
      if (job.invoicePdfUrl) {
        items.push({
          id: `legacy-invoice-${job.id}`,
          label: `Invoice PDF ${job.jobRef || ""}`.trim(),
          kind: "INVOICE",
          jobId: job.id,
          jobRef: job.jobRef || null,
          createdAt: job.createdAt || null,
          downloadUrl: job.invoicePdfUrl,
        });
      }
      if (job.paymentReceiptUrl) {
        items.push({
          id: `legacy-receipt-${job.id}`,
          label: `Payment receipt ${job.jobRef || ""}`.trim(),
          kind: "RECEIPT",
          jobId: job.id,
          jobRef: job.jobRef || null,
          createdAt: job.createdAt || null,
          downloadUrl: job.paymentReceiptUrl,
        });
      }
      return items;
    });

    return [...managedViews, ...legacy].slice(0, 20);
  }

  async getCustomerWorkspace(tenantId: string, customerId: string) {
    const customer = await this.resolveCustomer(tenantId, customerId);
    const [account, jobs, servicePlans, approvals, quotes, activity] = await Promise.all([
      this.prisma.customerAccount.findUnique({
        where: {
          customerId: customer.id,
        },
        select: {
          id: true,
          email: true,
          status: true,
          invitedAt: true,
          activatedAt: true,
          lastLoginAt: true,
        },
      }),
      this.prisma.job.findMany({
        where: {
          companyId: tenantId,
          customerId: customer.id,
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 8,
        select: {
          id: true,
          jobRef: true,
          status: true,
          serviceName: true,
          vehicleMake: true,
          vehicleModel: true,
          vehicleReg: true,
          createdAt: true,
          completedAt: true,
          invoiceIssuedAt: true,
          invoicePaidAt: true,
          totalCents: true,
          currency: true,
          invoicePdfUrl: true,
          paymentReceiptUrl: true,
          approvedAt: true,
          declinedAt: true,
        },
      }),
      this.servicePlans.listPortalVisibleForCustomer(tenantId, customer.id),
      this.prisma.customerApproval.findMany({
        where: {
          tenantId,
          customerId: customer.id,
        },
        include: {
        requestedByUser: { select: { email: true } },
        },
        orderBy: [{ requestedAt: "desc" }],
        take: 12,
      }),
      this.prisma.quote.findMany({
        where: {
          tenantId,
          customerId: customer.id,
          status: { not: "DRAFT" },
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 12,
        include: {
          lineItems: { orderBy: { sortOrder: "asc" } },
          job: { select: { id: true, jobRef: true } },
        },
      }),
      this.prisma.activityEvent.findMany({
        where: {
          tenantId,
          customerId: customer.id,
          OR: [
            { type: { in: ["customer.account.invited", "customer.account.activated", "customer.approval.requested", "customer.approval.approved", "customer.approval.declined", "portal.document_signed", "billing.invoice.issued", "billing.payment.received", "artifact.created", "quote.sent", "quote.approved", "quote.declined", "quote.converted", "revenue.task.opened", "revenue.task.completed", "revenue.task.cancelled"] } },
            { type: { startsWith: "service_plan." } },
          ],
        },
        orderBy: { at: "desc" },
        take: 10,
      }),
    ]);

    const documents = await this.buildCustomerArtifacts(tenantId, customer.id, jobs);
    const approvalViews = await Promise.all(approvals.map((row) => this.buildApprovalView(row)));

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email || null,
        phone: customer.phone || null,
        slug: customer.slug,
        createdAt: customer.createdAt,
      },
      account,
      jobs: jobs.map((job) => ({
        id: job.id,
        jobRef: job.jobRef || job.id,
        status: job.status,
        serviceName: job.serviceName || null,
        vehicleLabel: [job.vehicleMake, job.vehicleModel, job.vehicleReg].filter(Boolean).join(" "),
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        invoiceIssuedAt: job.invoiceIssuedAt,
        invoicePaidAt: job.invoicePaidAt,
        totalCents: job.totalCents,
        currency: job.currency,
        approvalState: job.declinedAt ? "DECLINED" : job.approvedAt ? "APPROVED" : "PENDING",
      })),
      documents,
      quotes: quotes.map((quote) => ({
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        title: quote.title,
        status: quote.status,
        summary: quote.summary || null,
        totalCents: quote.totalCents,
        currency: quote.currency,
        expiresAt: quote.expiresAt || null,
        approvedAt: quote.approvedAt || null,
        convertedAt: quote.convertedAt || null,
        jobId: quote.jobId || null,
        jobRef: quote.job?.jobRef || null,
        lineItems: (quote.lineItems || []).map((item) => ({
          id: item.id,
          title: item.title,
          type: item.type,
          quantity: Number(item.quantity),
          totalPriceCents: item.totalPriceCents,
        })),
      })),
      servicePlans,
      approvals: approvalViews,
      recentActivity: activity.map((item) => ({
        id: item.id,
        type: item.type,
        label: item.label,
        at: item.at,
      })),
    };
  }

  async listCustomerServicePlans(tenantId: string, customerId: string) {
    await this.resolveCustomer(tenantId, customerId);
    return this.servicePlans.listPortalVisibleForCustomer(tenantId, customerId);
  }

  async getCustomerServicePlanById(tenantId: string, customerId: string, planId: string) {
    await this.resolveCustomer(tenantId, customerId);
    return this.servicePlans.getPortalVisibleForCustomerById(tenantId, customerId, planId);
  }

  async renewCustomerServicePlan(tenantId: string, customerId: string, planId: string, note?: string) {
    await this.resolveCustomer(tenantId, customerId);
    return this.servicePlans.customerApproveRenewal(tenantId, customerId, planId, note);
  }

  async declineCustomerServicePlanRenewal(tenantId: string, customerId: string, planId: string, note?: string) {
    await this.resolveCustomer(tenantId, customerId);
    return this.servicePlans.customerDeclineRenewal(tenantId, customerId, planId, note);
  }

  async createCustomerServicePlanChangeRequest(
    tenantId: string,
    customerId: string,
    planId: string,
    dto: CustomerServicePlanChangeRequestDto,
  ) {
    const customer = await this.resolveCustomer(tenantId, customerId);
    return this.servicePlans.createChangeRequest({
      tenantId,
      customerId: customer.id,
      planId,
      requestedBy: "CUSTOMER",
      kind: dto.kind,
      payloadJson: dto.payloadJson,
      note: dto.note,
    });
  }

  async getCustomerArtifactDownload(tenantId: string, customerId: string, artifactId: string) {
    const artifact = await this.prisma.documentArtifact.findFirst({
      where: {
        id: artifactId,
        tenantId,
        entityType: "JOB",
        portalVisible: true,
      },
      select: {
        id: true,
        label: true,
        fileName: true,
        mimeType: true,
        storagePath: true,
        entityId: true,
      },
    });
    if (!artifact?.storagePath) throw new NotFoundException("Artifact not found");

    const job = await this.prisma.job.findFirst({
      where: {
        id: artifact.entityId,
        companyId: tenantId,
        customerId,
      },
      select: { id: true },
    });
    if (!job) throw new NotFoundException("Artifact not found");

    return artifact;
  }
}
