import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { AuditService } from "../audit/audit.service";
import { JobStatus } from "../common/constants";
import { isWheelsFormV1Enabled } from "../common/feature-flags";
import { PrismaService } from "../prisma/prisma.service";
import { TemplatesService } from "../templates/templates.service";
import { BulkJobsDto, CreateJobAssetDto, CreateJobDto, JobsBoardQueryDto, PatchJobDto } from "./dto";

const JOB_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["INVOICED"],
  INVOICED: [],
  CANCELLED: [],
};

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly templatesService: TemplatesService,
  ) {}

  private asNumber(value: any, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  private computeTotals(input: { laborCents: number; partsCents: number; miscCents: number; taxRateBps: number }, currency: string) {
    const subtotalCents = input.laborCents + input.partsCents + input.miscCents;
    const taxCents = Math.round((subtotalCents * input.taxRateBps) / 10000);
    const totalCents = subtotalCents + taxCents;

    return {
      laborCents: input.laborCents,
      partsCents: input.partsCents,
      miscCents: input.miscCents,
      subtotalCents,
      taxRateBps: input.taxRateBps,
      taxCents,
      totalCents,
      currency,
    };
  }

  private computeWheelsTotals(formData: Record<string, any>, defaultCurrency: string) {
    const unitPrice = this.asNumber(formData.unitPrice, 0);
    const quantity = this.asNumber(formData.quantity, 1);
    const pricePerWheel = this.asNumber(formData.pricePerWheel, 0);
    const wheelCount = this.asNumber(formData.wheelCount, 0);
    const discount = this.asNumber(formData.discount, 0);
    const vatEnabled = Boolean(formData.vatEnabled);
    const vatRate = this.asNumber(formData.vatRate, 0);

    const lineCents = Math.round(unitPrice * 100) * quantity;
    const wheelCents = Math.round(pricePerWheel * 100) * wheelCount;
    const discountCents = Math.max(0, Math.round(discount * 100));
    const subtotalCents = Math.max(0, lineCents + wheelCents - discountCents);
    const taxRateBps = vatEnabled ? Math.max(0, Math.round(vatRate * 100)) : 0;
    const taxCents = Math.round((subtotalCents * taxRateBps) / 10000);
    const totalCents = subtotalCents + taxCents;

    return {
      laborCents: subtotalCents,
      partsCents: 0,
      miscCents: 0,
      subtotalCents,
      taxRateBps,
      taxCents,
      totalCents,
      currency: String(formData.currency || defaultCurrency || "GBP"),
    };
  }

  private async nextJobRef(tx: any, companyId: string) {
    const year = new Date().getUTCFullYear();

    try {
      const counter = await tx.invoiceCounter.upsert({
        where: { companyId_year: { companyId, year } },
        update: { current: { increment: 1 } },
        create: { companyId, year, current: 1 },
      });
      return `JOB-${year}-${String(counter.current).padStart(5, "0")}`;
    } catch {
      const counter = await tx.invoiceCounter.upsert({
        where: { companyId },
        update: { nextNumber: { increment: 1 } },
        create: { companyId, prefix: `JOB-${year}`, nextNumber: 1 },
      });
      return `${counter.prefix}-${String(counter.nextNumber).padStart(5, "0")}`;
    }
  }

  private async isWheelsFlowEnabled(companyId: string) {
    if (!isWheelsFormV1Enabled()) return false;
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId: companyId } });
    return settings?.primaryTrade === "WHEELS";
  }

  private normalizeAssetInput(formData?: Record<string, any>, assets?: CreateJobAssetDto[]) {
    const normalized: CreateJobAssetDto[] = Array.isArray(assets) ? [...assets] : [];
    if (!formData) return normalized;

    const addList = (kind: CreateJobAssetDto["kind"], list: any) => {
      if (!Array.isArray(list)) return;
      for (const item of list.slice(0, 6)) {
        if (typeof item !== "string" || !item.trim()) continue;
        normalized.push({ kind, url: item.trim() });
      }
    };

    addList("BEFORE", formData.beforePhotos);
    addList("AFTER", formData.afterPhotos);

    if (typeof formData.torqueEvidence === "string" && formData.torqueEvidence.trim()) {
      normalized.push({ kind: "TORQUE", url: formData.torqueEvidence.trim() });
    }
    if (typeof formData.torqueEvidenceLink === "string" && formData.torqueEvidenceLink.trim()) {
      normalized.push({ kind: "TORQUE", url: formData.torqueEvidenceLink.trim() });
    }
    if (typeof formData.technicianSignature === "string" && formData.technicianSignature.trim()) {
      normalized.push({ kind: "SIGN_TECH", dataUrl: formData.technicianSignature.trim() });
    }
    if (typeof formData.customerSignature === "string" && formData.customerSignature.trim()) {
      normalized.push({ kind: "SIGN_CUSTOMER", dataUrl: formData.customerSignature.trim() });
    }

    return normalized;
  }

  private async persistAssets(jobId: string, payload: CreateJobAssetDto[], companyId: string, userId: string) {
    const db = this.prisma as any;
    for (const asset of payload) {
      const url = (asset.url || asset.dataUrl || "").trim();
      if (!url) continue;
      await db.jobAsset.create({
        data: {
          jobId,
          kind: asset.kind,
          url,
          mime: asset.mime || null,
          bytes: asset.bytes ?? null,
        },
      });
    }
    if (payload.length > 0) {
      await this.audit.log(companyId, "job.assets.upload", `Uploaded ${payload.length} assets`, userId);
    }
  }

  private splitIntoColumns(values: string[], cols = 3) {
    const rows: string[][] = [];
    for (let i = 0; i < values.length; i += cols) {
      rows.push(values.slice(i, i + cols));
    }
    return rows;
  }

  private createSimplePdf(textLines: string[]) {
    const escaped = textLines.map((line) =>
      line
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)")
        .slice(0, 180),
    );

    const ops: string[] = ["BT", "/F1 10 Tf", "40 800 Td"];
    escaped.forEach((line, i) => {
      if (i > 0) ops.push("0 -14 Td");
      ops.push(`(${line}) Tj`);
    });
    ops.push("ET");
    const stream = ops.join("\n");

    const objs: string[] = [];
    objs.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
    objs.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
    objs.push("3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj");
    objs.push("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");
    objs.push(`5 0 obj << /Length ${Buffer.byteLength(stream, "utf8")} >> stream\n${stream}\nendstream endobj`);

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [0];
    for (const obj of objs) {
      offsets.push(Buffer.byteLength(pdf, "utf8"));
      pdf += `${obj}\n`;
    }

    const xrefStart = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${objs.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let i = 1; i <= objs.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    return Buffer.from(pdf, "utf8");
  }

  private async ensurePublicToken(tx: any, jobId: string) {
    const existing = await tx.publicJobToken.findFirst({
      where: {
        jobId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;
    return tx.publicJobToken.create({
      data: {
        jobId,
        token: randomBytes(24).toString("hex"),
        expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      },
    });
  }

  private async buildAndStorePdf(companyId: string, userId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: jobId, companyId } });
    if (!job) throw new NotFoundException("Job not found");

    const assets = await db.jobAsset.findMany({ where: { jobId }, orderBy: { createdAt: "asc" } });
    const settings = await db.tenantSetting.findUnique({ where: { tenantId: companyId } });

    const before = assets.filter((a: any) => a.kind === "BEFORE").map((a: any) => a.url);
    const after = assets.filter((a: any) => a.kind === "AFTER").map((a: any) => a.url);
    const torque = assets.filter((a: any) => a.kind === "TORQUE").map((a: any) => a.url);
    const techSign = assets.find((a: any) => a.kind === "SIGN_TECH")?.url || "";
    const customerSign = assets.find((a: any) => a.kind === "SIGN_CUSTOMER")?.url || "";

    const formData = (job.formData || {}) as Record<string, any>;

    const lines: string[] = [];
    lines.push(`${settings?.companyName || "MyTitan"} - Wheels Job Summary`);
    lines.push("----------------------------------------");
    lines.push("Job Details");
    lines.push(`Job Reference: ${job.jobRef || ""}`);
    lines.push(`Job Type: ${job.jobType || formData.jobType || ""}`);
    lines.push(`Date: ${formData.jobDate || new Date(job.createdAt).toISOString().slice(0, 10)}`);
    lines.push(`Completed: ${formData.completedDate || ""}`);
    lines.push("");
    lines.push("Customer / Trade");
    lines.push(`Customer: ${job.customerName || ""}`);
    lines.push(`Trade: ${formData.tradeName || ""}`);
    lines.push(`Address: ${[formData.addressLine1, formData.addressLine2, formData.town, formData.postcode].filter(Boolean).join(", ")}`);
    lines.push("");
    lines.push("Technician / Vehicle");
    lines.push(`Technician: ${formData.technicianName || ""}`);
    lines.push(`Vehicle: ${[job.vehicleMake || formData.vehicleMake, job.vehicleModel || formData.vehicleModel, job.vehicleReg || formData.vehicleReg].filter(Boolean).join(" ")}`);
    lines.push(`Torque: ${formData.torqueSetting || ""}  Tyre Pressure: ${formData.tyrePressure || ""}`);
    lines.push("");
    lines.push("WhatsApp Completion Link");
    lines.push(`${job.whatsappCompletionLink || formData.whatsappCompletionLink || "Not provided"}`);
    lines.push("");
    lines.push("Before Photos (3-column)");
    this.splitIntoColumns(before).forEach((row) => lines.push(row.join(" | ")));
    if (before.length === 0) lines.push("No before photos uploaded");
    lines.push("");
    lines.push("After Photos (3-column)");
    this.splitIntoColumns(after).forEach((row) => lines.push(row.join(" | ")));
    if (after.length === 0) lines.push("No after photos uploaded");
    lines.push("");
    lines.push("Torque Evidence");
    if (torque.length > 0) {
      torque.forEach((value) => lines.push(value));
    } else {
      lines.push("(No torque image found; using link fallback if supplied)");
      if (formData.torqueEvidenceLink) lines.push(String(formData.torqueEvidenceLink));
    }
    lines.push("");
    lines.push("Technician Signature");
    lines.push(`Name: ${formData.technicianSignatureName || formData.technicianName || ""}`);
    lines.push(techSign || "No technician signature image");
    lines.push("");
    lines.push("Customer Signature");
    lines.push(`Name: ${formData.customerSignatureName || ""}`);
    lines.push(customerSign || "No customer signature image");

    const pdfBuffer = this.createSimplePdf(lines);

    const token = await db.$transaction((tx: any) => this.ensurePublicToken(tx, job.id));
    const pdfUrl = `/public/job/${token.token}/pdf`;

    await db.jobPdf.upsert({
      where: { jobId: job.id },
      update: {
        url: pdfUrl,
        contentBase64: pdfBuffer.toString("base64"),
        generatedAt: new Date(),
      },
      create: {
        jobId: job.id,
        url: pdfUrl,
        contentBase64: pdfBuffer.toString("base64"),
      },
    });

    await db.job.update({ where: { id: job.id }, data: { invoicePdfUrl: pdfUrl } });
    await this.audit.log(companyId, "job.pdf.generated", `Generated Wheels PDF for ${job.jobRef || job.id}`, userId);

    const apiPublic = (process.env.API_PUBLIC_URL || '').trim().replace(/\/$/, '');
    const publicPdfUrl = apiPublic ? `${apiPublic}${pdfUrl}` : pdfUrl;

    return { url: pdfUrl, pdfUrl: publicPdfUrl, generatedAt: new Date().toISOString() };
  }

  async create(companyId: string, userId: string, dto: CreateJobDto) {
    const db = this.prisma as any;
    const company = await db.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException("Company not found");
    }

    if (dto.locationId && db.location) {
      const location = await db.location.findFirst({ where: { id: dto.locationId, companyId } });
      if (!location) {
        throw new BadRequestException("Invalid location for this company");
      }
    }

    const settings = await db.tenantSetting.findUnique({ where: { tenantId: companyId } });
    const wheelsEnabled = await this.isWheelsFlowEnabled(companyId);
    const submittedForm = dto.formData || null;

    const laborCents = dto.laborCents ?? 0;
    const partsCents = dto.partsCents ?? 0;
    const miscCents = dto.miscCents ?? 0;
    const taxRateBps = dto.taxRateBps ?? (settings?.vatEnabledDefault ? Number(settings.vatRateBpsDefault ?? 0) : 0);
    const currency = settings?.defaultCurrency ?? company.currency ?? "USD";

    const totals = wheelsEnabled && submittedForm
      ? this.computeWheelsTotals(submittedForm, currency)
      : this.computeTotals({ laborCents, partsCents, miscCents, taxRateBps }, currency);

    const serviceName =
      (submittedForm?.serviceName as string | undefined) ??
      dto.serviceName ??
      (Array.isArray(settings?.defaultServiceNamePresets) && settings.defaultServiceNamePresets.length > 0
        ? settings.defaultServiceNamePresets[0]
        : null);
    const wheelPricingMode = dto.wheelPricingMode ?? settings?.defaultWheelPricingMode ?? null;
    const whatsappTemplate = dto.whatsappTemplate ?? settings?.whatsappTemplateDefault ?? null;
    const jobType = (submittedForm?.jobType as string | undefined) || dto.jobType || null;
    const tradeCode = (dto.tradeCode || settings?.primaryTrade || null) as string | null;

    const created = await db.$transaction(async (tx: any) => {
      const jobRef = await this.nextJobRef(tx, companyId);
      return tx.job.create({
        data: {
          companyId,
          locationId: dto.locationId,
          jobRef,
          status: "OPEN",
          customerName: (submittedForm?.customerName as string | undefined) || dto.customerName,
          customerEmail: (submittedForm?.customerEmail as string | undefined) || dto.customerEmail,
          customerPhone: (submittedForm?.customerPhone as string | undefined) || dto.customerPhone,
          vehicleMake: (submittedForm?.vehicleMake as string | undefined) || dto.vehicleMake,
          vehicleModel: (submittedForm?.vehicleModel as string | undefined) || dto.vehicleModel,
          vehicleReg: (submittedForm?.vehicleReg as string | undefined) || dto.vehicleReg,
          serviceName,
          wheelPricingMode,
          whatsappTemplate,
          whatsappCompletionLink: (submittedForm?.whatsappCompletionLink as string | undefined) || null,
          invoiceDueAt: dto.invoiceDueAt ? new Date(dto.invoiceDueAt) : null,
          invoiceNumber: (submittedForm?.invoiceNumber as string | undefined) || null,
          tradeCode,
          jobType,
          formData: submittedForm,
          ...totals,
        },
      });
    });

    await this.audit.log(companyId, "job.create", `Created job ${created.jobRef ?? created.id}`, userId);

    if (wheelsEnabled && submittedForm) {
      await this.templatesService.ensureWheelsDefaultTemplate();
    }

    const normalizedAssets = this.normalizeAssetInput(submittedForm || undefined, dto.assets);
    if (normalizedAssets.length > 0) {
      await this.persistAssets(created.id, normalizedAssets, companyId, userId);
    }

    let pdf: { url: string; generatedAt: string } | null = null;
    if (wheelsEnabled && submittedForm) {
      pdf = await this.buildAndStorePdf(companyId, userId, created.id);
    }

    const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    try {
      await db.usageMeter.upsert({
        where: { tenantId_periodStart: { tenantId: companyId, periodStart } },
        update: { jobsCreatedCount: { increment: 1 } },
        create: {
          tenantId: companyId,
          periodStart,
          jobsCreatedCount: 1,
        },
      });
    } catch {
      // Non-critical usage tracking
    }

    return {
      ...created,
      pdf,
    };
  }

  list(companyId: string) {
    const db = this.prisma as any;
    return db.job.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  }

  async getById(companyId: string, id: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({
      where: { id, companyId },
      include: {
        assets: true,
        pdf: true,
      },
    });
    if (!job) {
      throw new NotFoundException("Job not found");
    }
    return job;
  }

  async generatePdf(companyId: string, userId: string, id: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id, companyId } });
    if (!job) {
      throw new NotFoundException("Job not found");
    }
    return this.buildAndStorePdf(companyId, userId, id);
  }

  async updateStatus(companyId: string, userId: string, id: string, newStatus: JobStatus) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id, companyId } });
    if (!job) {
      throw new NotFoundException("Job not found");
    }

    if (job.status === newStatus) {
      return job;
    }

    const allowed = (JOB_STATUS_TRANSITIONS[job.status as JobStatus] ?? []) as JobStatus[];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Invalid status transition: ${job.status} -> ${newStatus}`);
    }

    const updated = await db.job.update({
      where: { id: job.id },
      data: {
        status: newStatus,
        invoiceIssuedAt: newStatus === "INVOICED" ? new Date() : job.invoiceIssuedAt,
      },
    });

    await this.audit.log(companyId, "job.status", `Job ${job.jobRef ?? job.id} status changed ${job.status} -> ${newStatus}`, userId);

    return updated;
  }

  async patchPartial(companyId: string, userId: string, id: string, dto: PatchJobDto) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id, companyId } });
    if (!job) throw new NotFoundException("Job not found");

    const payload: any = {};
    if (dto.status) payload.status = dto.status;
    if (dto.assignedUserId !== undefined) payload.assignedUserId = dto.assignedUserId || null;
    if (dto.locationId !== undefined) payload.locationId = dto.locationId || null;
    if (dto.pricingNotes !== undefined) payload.pricingNotes = dto.pricingNotes || null;
    if (dto.invoiceDueAt !== undefined) payload.invoiceDueAt = dto.invoiceDueAt ? new Date(dto.invoiceDueAt) : null;

    const updated = await db.job.update({
      where: { id },
      data: payload,
    });
    await this.audit.log(companyId, "job.patch", `Patched job ${job.jobRef || job.id}`, userId);
    return updated;
  }

  async board(companyId: string, query: JobsBoardQueryDto) {
    const db = this.prisma as any;
    const page = Math.max(1, Number(query?.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query?.pageSize || 40)));
    const statuses = String(query?.status || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const where: any = { companyId };
    if (statuses.length) where.status = { in: statuses };
    if (query.locationId && query.locationId !== "all") where.locationId = query.locationId;
    if (query.assignedTo) where.assignedUserId = query.assignedTo;
    if (query.from || query.to) {
      where.createdAt = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { jobRef: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { vehicleReg: { contains: q, mode: "insensitive" } },
      ];
    }

    const jobs = await db.job.findMany({
      where,
      include: {
        location: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const grouped: Record<string, any[]> = {
      OPEN: [],
      SCHEDULED: [],
      IN_PROGRESS: [],
      COMPLETED: [],
      INVOICED: [],
      CANCELLED: [],
      DRAFT: [],
    };
    for (const job of jobs) {
      if (!grouped[job.status]) grouped[job.status] = [];
      grouped[job.status].push(job);
    }
    const counts = Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length]));
    return { grouped, counts, page, pageSize };
  }

  async bulk(companyId: string, userId: string, dto: BulkJobsDto) {
    const db = this.prisma as any;
    const failed: Array<{ id: string; reason: string }> = [];
    let successCount = 0;
    const uniqueIds = Array.from(new Set((dto.jobIds || []).filter(Boolean)));

    for (const id of uniqueIds) {
      const job = await db.job.findFirst({ where: { id, companyId } });
      if (!job) {
        failed.push({ id, reason: "not found" });
        continue;
      }
      try {
        if (dto.operation === "setStatus" && dto.status) {
          await db.job.update({ where: { id }, data: { status: dto.status } });
        } else if (dto.operation === "assignTechnician") {
          await db.job.update({ where: { id }, data: { assignedUserId: dto.assignedUserId || null } });
        } else if (dto.operation === "setLocation") {
          await db.job.update({ where: { id }, data: { locationId: dto.locationId && dto.locationId !== "all" ? dto.locationId : null } });
        } else if (dto.operation === "addTag" && dto.tag) {
          const tags = Array.isArray(job.tags) ? job.tags : [];
          const next = Array.from(new Set([...tags, dto.tag.trim()])).filter(Boolean);
          await db.job.update({ where: { id }, data: { tags: next } });
        } else if (dto.operation === "removeTag" && dto.tag) {
          const tags = Array.isArray(job.tags) ? job.tags : [];
          await db.job.update({ where: { id }, data: { tags: tags.filter((t: string) => t !== dto.tag) } });
        } else if (dto.operation === "setDueDate") {
          await db.job.update({ where: { id }, data: { invoiceDueAt: dto.dueAt ? new Date(dto.dueAt) : null } });
        } else if (dto.operation === "closeJobs") {
          await db.job.update({ where: { id }, data: { status: "COMPLETED" } });
        } else {
          failed.push({ id, reason: "invalid operation payload" });
          continue;
        }
        successCount += 1;
      } catch (err: any) {
        failed.push({ id, reason: err?.message || "update failed" });
      }
    }

    await this.audit.log(companyId, "jobs.bulk", `Bulk op ${dto.operation} updated ${successCount}/${uniqueIds.length}`, userId);
    return { successCount, failed };
  }
}
