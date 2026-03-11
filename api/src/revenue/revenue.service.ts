import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AutomationsService } from "../automations/automations.service";
import { ActivityService } from "../events/activity.service";
import { JobsService } from "../jobs/jobs.service";
import { PrismaService } from "../prisma/prisma.service";
import { PatchQuoteDto, UpsertQuoteDto } from "./dto";

type QuoteListFilters = {
  customerId?: string;
  jobId?: string;
};

type NormalizedLineItem = {
  sortOrder: number;
  type: "LABOUR" | "PART" | "FEE" | "DISCOUNT" | "OTHER";
  title: string;
  description: string | null;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  metadataJson: Record<string, any> | null;
};

type RevenueTaskCandidate = {
  kind: "QUOTE_FOLLOW_UP" | "INVOICE_FOLLOW_UP" | "APPROVAL_FOLLOW_UP" | "PAYMENT_FOLLOW_UP";
  tenantId: string;
  customerId: string;
  quoteId?: string | null;
  jobId?: string | null;
  dueAt: Date;
  title: string;
  sourceFingerprint: string;
  payload: Record<string, any>;
};

@Injectable()
export class RevenueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly activity: ActivityService,
    private readonly automations: AutomationsService,
  ) {}

  private moneyDecimal(cents: number) {
    return (Number(cents || 0) / 100).toFixed(2);
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
      },
    });
    if (!customer) throw new BadRequestException("Customer not found");
    return customer;
  }

  private async resolveQuoteContext(tenantId: string, dto: { customerId: string; jobId?: string | null; bookingId?: string | null }) {
    const customer = await this.resolveCustomer(tenantId, dto.customerId);

    let job: any = null;
    if (dto.jobId) {
      job = await this.prisma.job.findFirst({
        where: { id: dto.jobId, companyId: tenantId },
        select: {
          id: true,
          jobRef: true,
          customerId: true,
          customerName: true,
          customerEmail: true,
          customerPhone: true,
          locationId: true,
          vehicleMake: true,
          vehicleModel: true,
          vehicleReg: true,
          serviceName: true,
          status: true,
        },
      });
      if (!job) throw new BadRequestException("Job not found");
      if (job.customerId && job.customerId !== customer.id) {
        throw new BadRequestException("Quote customer does not match the linked job");
      }
    }

    let booking: any = null;
    if (dto.bookingId) {
      booking = await this.prisma.booking.findFirst({
        where: { id: dto.bookingId, companyId: tenantId },
        select: {
          id: true,
          jobId: true,
          customerName: true,
          customerEmail: true,
          customerPhone: true,
          locationId: true,
          startsAt: true,
          endsAt: true,
          status: true,
        },
      });
      if (!booking) throw new BadRequestException("Booking not found");
      if (job && booking.jobId && booking.jobId !== job.id) {
        throw new BadRequestException("Linked booking does not match the linked job");
      }
    }

    return { customer, job, booking };
  }

  private normalizeLineItems(input: UpsertQuoteDto["lineItems"] | PatchQuoteDto["lineItems"]) {
    const items = Array.isArray(input) ? input : [];
    if (!items.length) throw new BadRequestException("At least one quote line item is required");
    return items.map((item, index) => {
      const quantity = Number(item.quantity || 0);
      const unitPriceCents = Math.trunc(Number(item.unitPriceCents || 0));
      if (!item.title?.trim()) throw new BadRequestException("Quote line item title is required");
      if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException("Quote line item quantity must be greater than zero");
      if (!Number.isFinite(unitPriceCents)) throw new BadRequestException("Quote line item unit price must be valid");
      const baseTotal = Math.round(quantity * unitPriceCents);
      const totalPriceCents = item.type === "DISCOUNT" ? -Math.abs(baseTotal) : baseTotal;
      return {
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index,
        type: item.type,
        title: item.title.trim(),
        description: item.description ? item.description.trim() : null,
        quantity,
        unitPriceCents: item.type === "DISCOUNT" ? Math.abs(unitPriceCents) : unitPriceCents,
        totalPriceCents,
        metadataJson: item.metadataJson || null,
      } as NormalizedLineItem;
    });
  }

  private computeTotals(lineItems: NormalizedLineItem[], taxCents: number | null | undefined) {
    const subtotalCents = Math.max(0, lineItems.reduce((sum, item) => sum + item.totalPriceCents, 0));
    const safeTaxCents = Math.max(0, Math.trunc(Number(taxCents || 0)));
    return {
      subtotalCents,
      taxCents: safeTaxCents,
      totalCents: subtotalCents + safeTaxCents,
    };
  }

  private async nextQuoteNumber(tenantId: string) {
    const year = new Date().getUTCFullYear();
    const count = await this.prisma.quote.count({
      where: {
        tenantId,
        createdAt: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
      },
    });
    return `Q-${year}-${String(count + 1).padStart(5, "0")}`;
  }

  private serializeLineItem(row: any) {
    return {
      id: row.id,
      sortOrder: row.sortOrder,
      type: row.type,
      title: row.title,
      description: row.description || null,
      quantity: Number(row.quantity),
      unitPriceCents: row.unitPriceCents,
      totalPriceCents: row.totalPriceCents,
      metadataJson: row.metadataJson || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private serializeQuote(row: any) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      customerId: row.customerId,
      customerName: row.customer?.name || row.customerName || null,
      jobId: row.jobId || null,
      jobRef: row.job?.jobRef || null,
      bookingId: row.bookingId || null,
      bookingStatus: row.booking?.status || null,
      quoteNumber: row.quoteNumber,
      status: row.status,
      title: row.title,
      summary: row.summary || null,
      subtotalCents: row.subtotalCents,
      taxCents: row.taxCents,
      totalCents: row.totalCents,
      currency: row.currency,
      expiresAt: row.expiresAt || null,
      approvedAt: row.approvedAt || null,
      declinedAt: row.declinedAt || null,
      convertedAt: row.convertedAt || null,
      createdByUserId: row.createdByUserId || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lineItems: Array.isArray(row.lineItems) ? row.lineItems.map((item: any) => this.serializeLineItem(item)) : [],
    };
  }

  private serializeTask(row: any) {
    const dueAt = row.dueAt ? new Date(row.dueAt) : null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      kind: row.kind,
      status: row.status,
      dueAt: row.dueAt,
      completedAt: row.completedAt || null,
      customerId: row.customerId,
      customerName: row.customer?.name || null,
      jobId: row.jobId || null,
      jobRef: row.job?.jobRef || null,
      quoteId: row.quoteId || null,
      quoteNumber: row.quote?.quoteNumber || null,
      notesJson: row.notesJson || null,
      overdue: Boolean(dueAt && row.status === "OPEN" && dueAt.getTime() < Date.now()),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async expireDueQuotes(tenantId: string) {
    const dueQuotes = await this.prisma.quote.findMany({
      where: {
        tenantId,
        status: "SENT",
        expiresAt: { lt: new Date() },
      },
      include: {
        customer: { select: { id: true, name: true } },
        job: { select: { id: true, jobRef: true, status: true } },
      },
      take: 50,
    });
    for (const quote of dueQuotes) {
      await this.prisma.quote.update({
        where: { id: quote.id },
        data: {
          status: "EXPIRED",
        },
      });
      await this.prisma.customerApproval.updateMany({
        where: {
          tenantId,
          entityType: "QUOTE",
          entityId: quote.id,
          kind: "QUOTE_ACCEPTANCE",
          status: "PENDING",
        },
        data: {
          status: "DECLINED",
          respondedAt: new Date(),
          responseNote: "Quote expired",
        },
      });
      await this.activity.push({
        type: "quote.expired",
        label: `Quote expired: ${quote.quoteNumber}`,
        tenantId,
        customerId: quote.customerId,
        customerName: quote.customer?.name || null,
        jobId: quote.jobId || null,
        jobRef: quote.job?.jobRef || null,
        status: quote.job?.status || null,
        payloadJson: { quoteId: quote.id, quoteNumber: quote.quoteNumber },
      });
    }
    return dueQuotes.length;
  }

  async listQuotes(tenantId: string, filters: QuoteListFilters = {}) {
    await this.expireDueQuotes(tenantId);
    const rows = await this.prisma.quote.findMany({
      where: {
        tenantId,
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
        ...(filters.jobId ? { jobId: filters.jobId } : {}),
      },
      include: {
        customer: { select: { id: true, name: true } },
        job: { select: { id: true, jobRef: true, status: true } },
        booking: { select: { id: true, status: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((row: any) => this.serializeQuote(row));
  }

  async getQuote(tenantId: string, quoteId: string) {
    await this.expireDueQuotes(tenantId);
    const row = await this.prisma.quote.findFirst({
      where: { tenantId, id: quoteId },
      include: {
        customer: { select: { id: true, name: true } },
        job: { select: { id: true, jobRef: true, status: true } },
        booking: { select: { id: true, status: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!row) throw new NotFoundException("Quote not found");
    return this.serializeQuote(row);
  }

  async createQuote(tenantId: string, userId: string, dto: UpsertQuoteDto) {
    const { customer, job, booking } = await this.resolveQuoteContext(tenantId, dto);
    const lineItems = this.normalizeLineItems(dto.lineItems);
    const totals = this.computeTotals(lineItems, dto.taxCents);
    const quoteNumber = await this.nextQuoteNumber(tenantId);
    const currency = String(dto.currency || "GBP").trim().toUpperCase() || "GBP";

    const created = await this.prisma.quote.create({
      data: {
        tenantId,
        customerId: customer.id,
        jobId: job?.id || null,
        bookingId: booking?.id || null,
        quoteNumber,
        status: "DRAFT",
        title: dto.title.trim(),
        summary: dto.summary?.trim() || null,
        currency,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdByUserId: userId,
        ...totals,
        lineItems: {
          create: lineItems.map((item) => ({
            sortOrder: item.sortOrder,
            type: item.type,
            title: item.title,
            description: item.description,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            totalPriceCents: item.totalPriceCents,
            metadataJson: item.metadataJson,
          })),
        },
      },
      include: {
        customer: { select: { id: true, name: true } },
        job: { select: { id: true, jobRef: true, status: true } },
        booking: { select: { id: true, status: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });

    await this.activity.push({
      type: "quote.created",
      label: `Draft quote created: ${created.quoteNumber}`,
      tenantId,
      customerId: customer.id,
      customerName: customer.name,
      jobId: created.jobId || null,
      jobRef: job?.jobRef || null,
      status: created.status,
      payloadJson: {
        quoteId: created.id,
        quoteNumber: created.quoteNumber,
        totalCents: created.totalCents,
      },
    });

    return this.serializeQuote(created);
  }

  async updateQuote(tenantId: string, userId: string, quoteId: string, dto: PatchQuoteDto) {
    const existing = await this.prisma.quote.findFirst({
      where: { tenantId, id: quoteId },
      include: { lineItems: true },
    });
    if (!existing) throw new NotFoundException("Quote not found");
    if (existing.status === "CONVERTED") {
      throw new BadRequestException("Converted quotes can no longer be edited");
    }
    if (!["DRAFT", "EXPIRED"].includes(existing.status)) {
      throw new BadRequestException("Only draft or expired quotes can be edited directly");
    }

    const nextCustomerId = dto.customerId || existing.customerId;
    const { customer, job, booking } = await this.resolveQuoteContext(tenantId, {
      customerId: nextCustomerId,
      jobId: dto.jobId !== undefined ? dto.jobId : existing.jobId,
      bookingId: dto.bookingId !== undefined ? dto.bookingId : existing.bookingId,
    });
    const lineItems = dto.lineItems ? this.normalizeLineItems(dto.lineItems) : existing.lineItems.map((item: any) => ({
      sortOrder: item.sortOrder,
      type: item.type,
      title: item.title,
      description: item.description,
      quantity: Number(item.quantity),
      unitPriceCents: item.unitPriceCents,
      totalPriceCents: item.totalPriceCents,
      metadataJson: item.metadataJson,
    }));
    const totals = this.computeTotals(lineItems, dto.taxCents ?? existing.taxCents);

    const updated = await this.prisma.quote.update({
      where: { id: existing.id },
      data: {
        customerId: customer.id,
        jobId: job?.id || null,
        bookingId: booking?.id || null,
        title: dto.title?.trim() || existing.title,
        summary: dto.summary !== undefined ? dto.summary?.trim() || null : existing.summary,
        currency: dto.currency ? String(dto.currency).trim().toUpperCase() : existing.currency,
        expiresAt: dto.expiresAt !== undefined ? (dto.expiresAt ? new Date(dto.expiresAt) : null) : existing.expiresAt,
        status: dto.status || existing.status,
        ...totals,
        lineItems: dto.lineItems
          ? {
              deleteMany: {},
              create: lineItems.map((item) => ({
                sortOrder: item.sortOrder,
                type: item.type,
                title: item.title,
                description: item.description,
                quantity: item.quantity,
                unitPriceCents: item.unitPriceCents,
                totalPriceCents: item.totalPriceCents,
                metadataJson: item.metadataJson,
              })),
            }
          : undefined,
      },
      include: {
        customer: { select: { id: true, name: true } },
        job: { select: { id: true, jobRef: true, status: true } },
        booking: { select: { id: true, status: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });

    await this.activity.push({
      type: "quote.updated",
      label: `Quote updated: ${updated.quoteNumber}`,
      tenantId,
      customerId: customer.id,
      customerName: customer.name,
      jobId: updated.jobId || null,
      jobRef: job?.jobRef || null,
      status: updated.status,
      payloadJson: { quoteId: updated.id, quoteNumber: updated.quoteNumber },
    });

    return this.serializeQuote(updated);
  }

  private async ensureQuoteApprovalRecord(tenantId: string, userId: string | null, quote: any) {
    const existing = await this.prisma.customerApproval.findFirst({
      where: {
        tenantId,
        customerId: quote.customerId,
        entityType: "QUOTE",
        entityId: quote.id,
        kind: "QUOTE_ACCEPTANCE",
      },
      orderBy: { requestedAt: "desc" },
    });
    if (existing?.status === "PENDING") return existing;
    if (existing) {
      return this.prisma.customerApproval.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          requestedAt: new Date(),
          respondedAt: null,
          responseNote: null,
          requestedByUserId: userId,
        },
      });
    }
    return this.prisma.customerApproval.create({
      data: {
        tenantId,
        customerId: quote.customerId,
        entityType: "QUOTE",
        entityId: quote.id,
        kind: "QUOTE_ACCEPTANCE",
        status: "PENDING",
        requestedAt: new Date(),
        requestedByUserId: userId,
      },
    });
  }

  async sendQuote(tenantId: string, userId: string, quoteId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { tenantId, id: quoteId },
      include: {
        customer: { select: { id: true, name: true } },
        job: { select: { id: true, jobRef: true, status: true } },
        lineItems: true,
      },
    });
    if (!quote) throw new NotFoundException("Quote not found");
    if (!["DRAFT", "EXPIRED"].includes(quote.status)) {
      throw new BadRequestException("Only draft or expired quotes can be sent");
    }
    if (!quote.lineItems.length) {
      throw new BadRequestException("Quotes require at least one line item before sending");
    }

    const updated = await this.prisma.quote.update({
      where: { id: quote.id },
      data: { status: "SENT" },
      include: {
        customer: { select: { id: true, name: true } },
        job: { select: { id: true, jobRef: true, status: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });
    await this.ensureQuoteApprovalRecord(tenantId, userId, updated);

    await this.activity.push({
      type: "quote.sent",
      label: `Quote sent: ${updated.quoteNumber}`,
      tenantId,
      customerId: updated.customerId,
      customerName: updated.customer?.name || null,
      jobId: updated.jobId || null,
      jobRef: updated.job?.jobRef || null,
      status: updated.status,
      payloadJson: { quoteId: updated.id, quoteNumber: updated.quoteNumber, totalCents: updated.totalCents },
    });
    await this.automations.evaluateRuleTrigger(tenantId, "quote.sent" as any, {
      actorUserId: userId,
      quoteId: updated.id,
      quoteNumber: updated.quoteNumber,
      customerId: updated.customerId,
      customerName: updated.customer?.name || null,
      jobId: updated.jobId || null,
      jobRef: updated.job?.jobRef || null,
      status: updated.status,
      totalCents: updated.totalCents,
    });
    await this.syncRevenueTasks(tenantId);
    return this.getQuote(tenantId, updated.id);
  }

  private async applyQuoteDecision(
    tenantId: string,
    actorUserId: string | null,
    quoteId: string,
    decision: "approve" | "decline",
    note?: string | null,
    customerScoped = false,
  ) {
    const quote = await this.prisma.quote.findFirst({
      where: {
        tenantId,
        id: quoteId,
        ...(customerScoped ? { status: "SENT" } : {}),
      },
      include: {
        customer: { select: { id: true, name: true } },
        job: { select: { id: true, jobRef: true, status: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!quote) throw new NotFoundException("Quote not found");
    if (!["SENT", "APPROVED", "DECLINED"].includes(quote.status)) {
      throw new BadRequestException("Only sent quotes can be approved or declined");
    }
    const nextStatus = decision === "approve" ? "APPROVED" : "DECLINED";
    const updated = await this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: nextStatus,
        approvedAt: decision === "approve" ? new Date() : null,
        declinedAt: decision === "decline" ? new Date() : null,
      },
      include: {
        customer: { select: { id: true, name: true } },
        job: { select: { id: true, jobRef: true, status: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });

    const approval = await this.prisma.customerApproval.findFirst({
      where: {
        tenantId,
        customerId: quote.customerId,
        entityType: "QUOTE",
        entityId: quote.id,
        kind: "QUOTE_ACCEPTANCE",
      },
      orderBy: { requestedAt: "desc" },
    });
    if (approval) {
      await this.prisma.customerApproval.update({
        where: { id: approval.id },
        data: {
          status: nextStatus,
          respondedAt: new Date(),
          responseNote: note || null,
        },
      });
    } else {
      await this.prisma.customerApproval.create({
        data: {
          tenantId,
          customerId: quote.customerId,
          entityType: "QUOTE",
          entityId: quote.id,
          kind: "QUOTE_ACCEPTANCE",
          status: nextStatus,
          requestedAt: new Date(),
          respondedAt: new Date(),
          responseNote: note || null,
          requestedByUserId: actorUserId,
        },
      });
    }

    await this.activity.push({
      type: decision === "approve" ? "quote.approved" : "quote.declined",
      label: `Quote ${decision === "approve" ? "approved" : "declined"}: ${updated.quoteNumber}`,
      tenantId,
      customerId: updated.customerId,
      customerName: updated.customer?.name || null,
      jobId: updated.jobId || null,
      jobRef: updated.job?.jobRef || null,
      status: updated.status,
      payloadJson: { quoteId: updated.id, quoteNumber: updated.quoteNumber, note: note || null },
    });

    if (decision === "approve") {
      await this.automations.evaluateRuleTrigger(tenantId, "quote.approved" as any, {
        actorUserId,
        quoteId: updated.id,
        quoteNumber: updated.quoteNumber,
        customerId: updated.customerId,
        customerName: updated.customer?.name || null,
        jobId: updated.jobId || null,
        jobRef: updated.job?.jobRef || null,
        status: updated.status,
        totalCents: updated.totalCents,
      });
    }
    await this.syncRevenueTasks(tenantId);
    return this.getQuote(tenantId, updated.id);
  }

  async operatorApproveQuote(tenantId: string, userId: string, quoteId: string) {
    return this.applyQuoteDecision(tenantId, userId, quoteId, "approve");
  }

  async operatorDeclineQuote(tenantId: string, userId: string, quoteId: string, note?: string | null) {
    return this.applyQuoteDecision(tenantId, userId, quoteId, "decline", note || null);
  }

  async recordCustomerQuoteDecision(tenantId: string, customerId: string, quoteId: string, decision: "approve" | "decline", note?: string | null) {
    const quote = await this.prisma.quote.findFirst({
      where: { tenantId, id: quoteId, customerId },
      select: { id: true },
    });
    if (!quote) throw new NotFoundException("Quote not found");
    return this.applyQuoteDecision(tenantId, null, quoteId, decision, note || null, true);
  }

  private async applyQuoteToJob(tx: any, tenantId: string, quote: any, customer: any, actorUserId: string) {
    let job = quote.jobId
      ? await tx.job.findFirst({ where: { id: quote.jobId, companyId: tenantId } })
      : null;

    if (!job) {
      const created = await this.jobs.createCoreJobRecord(tx, tenantId, actorUserId, {
        customerName: customer.name,
        customerEmail: customer.email || undefined,
        customerPhone: customer.phone || undefined,
        locationId: quote.job?.locationId || quote.booking?.locationId || undefined,
        serviceName: quote.title,
        laborCents: 0,
        partsCents: 0,
        miscCents: 0,
        taxRateBps: quote.subtotalCents > 0 ? Math.round((quote.taxCents / quote.subtotalCents) * 10000) : 0,
        scheduledAt: quote.booking?.startsAt ? new Date(quote.booking.startsAt).toISOString() : undefined,
      });
      job = created.created;
      if (quote.bookingId) {
        await tx.booking.updateMany({
          where: { id: quote.bookingId, companyId: tenantId },
          data: { jobId: job.id },
        });
      }
    } else {
      const taxRateBps = quote.subtotalCents > 0 ? Math.round((quote.taxCents / quote.subtotalCents) * 10000) : 0;
      job = await tx.job.update({
        where: { id: job.id },
        data: {
          customerId: customer.id,
          customerName: customer.name,
          customerEmail: customer.email || null,
          customerPhone: customer.phone || null,
          serviceName: quote.title,
          subtotalCents: quote.subtotalCents,
          taxCents: quote.taxCents,
          totalCents: quote.totalCents,
          taxRateBps,
          currency: quote.currency,
        },
      });
    }

    await tx.jobLineItem.deleteMany({ where: { companyId: tenantId, jobId: job.id } });
    if (quote.lineItems.length) {
      await tx.jobLineItem.createMany({
        data: quote.lineItems.map((item: any) => ({
          companyId: tenantId,
          jobId: job.id,
          description: [item.title, item.description].filter(Boolean).join(" - "),
          qty: item.quantity,
          unitPrice: this.moneyDecimal(item.type === "DISCOUNT" ? -Math.abs(item.unitPriceCents) : item.unitPriceCents),
          total: this.moneyDecimal(item.totalPriceCents),
        })),
      });
    }

    return job;
  }

  async convertQuote(tenantId: string, userId: string, quoteId: string) {
    const existing = await this.prisma.quote.findFirst({
      where: { tenantId, id: quoteId },
      include: {
        customer: true,
        job: true,
        booking: true,
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!existing) throw new NotFoundException("Quote not found");
    if (existing.status !== "APPROVED") {
      throw new BadRequestException("Only approved quotes can be converted");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const job = await this.applyQuoteToJob(tx, tenantId, existing, existing.customer, userId);
      const updatedQuote = await tx.quote.update({
        where: { id: existing.id },
        data: {
          status: "CONVERTED",
          convertedAt: new Date(),
          jobId: job.id,
        },
        include: {
          customer: { select: { id: true, name: true } },
          job: { select: { id: true, jobRef: true, status: true } },
          booking: { select: { id: true, status: true } },
          lineItems: { orderBy: { sortOrder: "asc" } },
        },
      });
      return { job, quote: updatedQuote };
    });

    await this.activity.push({
      type: "quote.converted",
      label: `Quote converted: ${result.quote.quoteNumber}`,
      tenantId,
      customerId: result.quote.customerId,
      customerName: result.quote.customer?.name || null,
      jobId: result.job.id,
      jobRef: result.job.jobRef || null,
      status: result.job.status || null,
      payloadJson: { quoteId: result.quote.id, quoteNumber: result.quote.quoteNumber, jobId: result.job.id },
    });
    await this.syncRevenueTasks(tenantId);
    return {
      quote: this.serializeQuote(result.quote),
      job: {
        id: result.job.id,
        jobRef: result.job.jobRef || null,
        status: result.job.status || null,
      },
    };
  }

  private async ensureTask(candidate: RevenueTaskCandidate) {
    const open = await this.prisma.revenueCollectionTask.findFirst({
      where: {
        tenantId: candidate.tenantId,
        kind: candidate.kind,
        customerId: candidate.customerId,
        jobId: candidate.jobId || null,
        quoteId: candidate.quoteId || null,
        status: "OPEN",
      },
    });
    if (open) {
      return this.prisma.revenueCollectionTask.update({
        where: { id: open.id },
        data: {
          dueAt: candidate.dueAt,
          notesJson: { ...candidate.payload, sourceFingerprint: candidate.sourceFingerprint, title: candidate.title },
        },
      });
    }

    const closed = await this.prisma.revenueCollectionTask.findFirst({
      where: {
        tenantId: candidate.tenantId,
        kind: candidate.kind,
        customerId: candidate.customerId,
        jobId: candidate.jobId || null,
        quoteId: candidate.quoteId || null,
        status: { in: ["COMPLETED", "CANCELLED"] },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (closed?.notesJson && (closed.notesJson as any).sourceFingerprint === candidate.sourceFingerprint) {
      return closed;
    }

    const created = await this.prisma.revenueCollectionTask.create({
      data: {
        tenantId: candidate.tenantId,
        customerId: candidate.customerId,
        jobId: candidate.jobId || null,
        quoteId: candidate.quoteId || null,
        kind: candidate.kind,
        dueAt: candidate.dueAt,
        notesJson: { ...candidate.payload, sourceFingerprint: candidate.sourceFingerprint, title: candidate.title },
      },
    });
    await this.activity.push({
      type: "revenue.task.opened",
      label: candidate.title,
      tenantId: candidate.tenantId,
      customerId: candidate.customerId,
      jobId: candidate.jobId || null,
      status: "OPEN",
      payloadJson: {
        revenueTaskId: created.id,
        kind: candidate.kind,
        quoteId: candidate.quoteId || null,
        sourceFingerprint: candidate.sourceFingerprint,
      },
    });
    return created;
  }

  private async closeStaleOpenTasks(tenantId: string, activeFingerprints: Set<string>) {
    const openTasks = await this.prisma.revenueCollectionTask.findMany({
      where: { tenantId, status: "OPEN" },
    });
    for (const task of openTasks) {
      const fingerprint = String((task.notesJson as any)?.sourceFingerprint || "");
      if (!fingerprint || activeFingerprints.has(fingerprint)) continue;
      await this.prisma.revenueCollectionTask.update({
        where: { id: task.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
      await this.activity.push({
        type: "revenue.task.completed",
        label: `Revenue task resolved: ${String((task.notesJson as any)?.title || task.kind).trim()}`,
        tenantId,
        customerId: task.customerId,
        jobId: task.jobId || null,
        status: "COMPLETED",
        payloadJson: {
          revenueTaskId: task.id,
          kind: task.kind,
          quoteId: task.quoteId || null,
          sourceFingerprint: fingerprint,
          resolvedBySync: true,
        },
      });
    }
  }

  async syncRevenueTasks(tenantId: string) {
    await this.expireDueQuotes(tenantId);
    const [quotes, jobs] = await Promise.all([
      this.prisma.quote.findMany({
        where: {
          tenantId,
          status: { in: ["SENT", "APPROVED"] },
        },
        include: {
          customer: { select: { id: true, name: true } },
          job: { select: { id: true, jobRef: true, status: true } },
        },
      }),
      this.prisma.job.findMany({
        where: {
          companyId: tenantId,
          invoiceIssuedAt: { not: null },
          invoicePaidAt: null,
        },
        select: {
          id: true,
          jobRef: true,
          customerId: true,
          customerName: true,
          status: true,
          invoiceIssuedAt: true,
          invoiceDueAt: true,
          invoicePaidAt: true,
          totalCents: true,
        },
      }),
    ]);

    const candidates: RevenueTaskCandidate[] = [];
    for (const quote of quotes) {
      const fingerprint = `quote:${quote.id}:${quote.status}:${quote.updatedAt.toISOString()}`;
      if (quote.status === "SENT") {
        candidates.push({
          tenantId,
          customerId: quote.customerId,
          quoteId: quote.id,
          jobId: quote.jobId || null,
          kind: "QUOTE_FOLLOW_UP",
          dueAt: quote.expiresAt || new Date(quote.createdAt.getTime() + 48 * 60 * 60 * 1000),
          title: `Quote follow-up needed for ${quote.quoteNumber}`,
          sourceFingerprint: fingerprint,
          payload: {
            quoteNumber: quote.quoteNumber,
            title: quote.title,
            state: "awaiting_customer_response",
          },
        });
      }
      if (quote.status === "APPROVED" && !quote.convertedAt) {
        candidates.push({
          tenantId,
          customerId: quote.customerId,
          quoteId: quote.id,
          jobId: quote.jobId || null,
          kind: "APPROVAL_FOLLOW_UP",
          dueAt: quote.approvedAt || new Date(quote.updatedAt.getTime() + 24 * 60 * 60 * 1000),
          title: `Approved quote ready for conversion: ${quote.quoteNumber}`,
          sourceFingerprint: fingerprint,
          payload: {
            quoteNumber: quote.quoteNumber,
            title: quote.title,
            state: "approved_not_converted",
          },
        });
      }
    }

    for (const job of jobs) {
      if (!job.customerId) continue;
      const issuedFingerprint = `job:${job.id}:issued:${job.invoiceIssuedAt?.toISOString?.() || "na"}:${job.invoicePaidAt ? "paid" : "open"}`;
      candidates.push({
        tenantId,
        customerId: job.customerId,
        jobId: job.id,
        kind: "PAYMENT_FOLLOW_UP",
        dueAt: job.invoiceDueAt || new Date((job.invoiceIssuedAt || new Date()).getTime() + 48 * 60 * 60 * 1000),
        title: `Payment follow-up for ${job.jobRef}`,
        sourceFingerprint: issuedFingerprint,
        payload: {
          jobRef: job.jobRef,
          state: "issued_awaiting_payment",
          totalCents: job.totalCents,
        },
      });

      if (job.invoiceDueAt && new Date(job.invoiceDueAt).getTime() < Date.now()) {
        const overdueFingerprint = `job:${job.id}:overdue:${new Date(job.invoiceDueAt).toISOString()}`;
        candidates.push({
          tenantId,
          customerId: job.customerId,
          jobId: job.id,
          kind: "INVOICE_FOLLOW_UP",
          dueAt: new Date(job.invoiceDueAt),
          title: `Invoice overdue for ${job.jobRef}`,
          sourceFingerprint: overdueFingerprint,
          payload: {
            jobRef: job.jobRef,
            state: "invoice_overdue",
            totalCents: job.totalCents,
          },
        });
      }
    }

    const activeFingerprints = new Set<string>();
    for (const candidate of candidates) {
      activeFingerprints.add(candidate.sourceFingerprint);
      await this.ensureTask(candidate);
    }
    await this.closeStaleOpenTasks(tenantId, activeFingerprints);
  }

  async listRevenueTasks(tenantId: string) {
    await this.syncRevenueTasks(tenantId);
    const rows = await this.prisma.revenueCollectionTask.findMany({
      where: { tenantId },
      include: {
        customer: { select: { id: true, name: true } },
        job: { select: { id: true, jobRef: true } },
        quote: { select: { id: true, quoteNumber: true } },
      },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    });
    return rows.map((row) => this.serializeTask(row));
  }

  private async changeTaskStatus(tenantId: string, userId: string, taskId: string, status: "COMPLETED" | "CANCELLED") {
    const task = await this.prisma.revenueCollectionTask.findFirst({
      where: { tenantId, id: taskId },
      include: {
        customer: { select: { id: true, name: true } },
        job: { select: { id: true, jobRef: true, status: true } },
        quote: { select: { id: true, quoteNumber: true } },
      },
    });
    if (!task) throw new NotFoundException("Revenue task not found");
    const updated = await this.prisma.revenueCollectionTask.update({
      where: { id: task.id },
      data: {
        status,
        completedAt: status === "COMPLETED" ? new Date() : null,
      },
      include: {
        customer: { select: { id: true, name: true } },
        job: { select: { id: true, jobRef: true } },
        quote: { select: { id: true, quoteNumber: true } },
      },
    });
    await this.activity.push({
      type: status === "COMPLETED" ? "revenue.task.completed" : "revenue.task.cancelled",
      label: `${status === "COMPLETED" ? "Completed" : "Cancelled"} revenue task`,
      tenantId,
      customerId: updated.customerId,
      customerName: updated.customer?.name || null,
      jobId: updated.jobId || null,
      jobRef: updated.job?.jobRef || null,
      status,
      payloadJson: {
        revenueTaskId: updated.id,
        kind: updated.kind,
        quoteId: updated.quoteId || null,
        quoteNumber: updated.quote?.quoteNumber || null,
        actorUserId: userId,
      },
    });
    return this.serializeTask(updated);
  }

  async completeTask(tenantId: string, userId: string, taskId: string) {
    return this.changeTaskStatus(tenantId, userId, taskId, "COMPLETED");
  }

  async cancelTask(tenantId: string, userId: string, taskId: string) {
    return this.changeTaskStatus(tenantId, userId, taskId, "CANCELLED");
  }
}
