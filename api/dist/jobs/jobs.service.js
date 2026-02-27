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
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobsService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const audit_service_1 = require("../audit/audit.service");
const feature_flags_1 = require("../common/feature-flags");
const notifications_service_1 = require("../notifications/notifications.service");
const automations_service_1 = require("../automations/automations.service");
const prisma_service_1 = require("../prisma/prisma.service");
const templates_service_1 = require("../templates/templates.service");
const JOB_STATUS_TRANSITIONS = {
    DRAFT: ["OPEN", "CANCELLED"],
    OPEN: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
    SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED", "CANCELLED"],
    COMPLETED: ["INVOICED"],
    INVOICED: [],
    CANCELLED: [],
};
let JobsService = class JobsService {
    constructor(prisma, audit, templatesService, notifications, automations) {
        this.prisma = prisma;
        this.audit = audit;
        this.templatesService = templatesService;
        this.notifications = notifications;
        this.automations = automations;
    }
    asNumber(value, fallback = 0) {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    }
    computeTotals(input, currency) {
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
    computeWheelsTotals(formData, defaultCurrency) {
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
    async nextJobRef(tx, companyId) {
        const year = new Date().getUTCFullYear();
        try {
            const counter = await tx.invoiceCounter.upsert({
                where: { companyId_year: { companyId, year } },
                update: { current: { increment: 1 } },
                create: { companyId, year, current: 1 },
            });
            return `JOB-${year}-${String(counter.current).padStart(5, "0")}`;
        }
        catch {
            const counter = await tx.invoiceCounter.upsert({
                where: { companyId },
                update: { nextNumber: { increment: 1 } },
                create: { companyId, prefix: `JOB-${year}`, nextNumber: 1 },
            });
            return `${counter.prefix}-${String(counter.nextNumber).padStart(5, "0")}`;
        }
    }
    async isWheelsFlowEnabled(companyId) {
        if (!(0, feature_flags_1.isWheelsFormV1Enabled)())
            return false;
        const db = this.prisma;
        const settings = await db.tenantSetting.findUnique({ where: { tenantId: companyId } });
        return settings?.primaryTrade === "WHEELS";
    }
    async recordUndo(companyId, userId, actionType, changes) {
        const db = this.prisma;
        await db.userUndoAction.updateMany({
            where: { companyId, userId, consumedAt: null, expiresAt: { gt: new Date() } },
            data: { consumedAt: new Date() },
        });
        await db.userUndoAction.create({
            data: {
                companyId,
                userId,
                actionType,
                payloadJson: { changes },
                expiresAt: new Date(Date.now() + 5 * 60 * 1000),
            },
        });
    }
    async logActivity(companyId, jobId, actorUserId, eventType, message, payloadJson) {
        const db = this.prisma;
        if (!db.jobActivity)
            return;
        await db.jobActivity.create({
            data: {
                companyId,
                jobId,
                actorUserId: actorUserId || null,
                eventType,
                message: message || null,
                payloadJson: payloadJson ?? null,
            },
        });
    }
    async restrictedLocationId(companyId, userId) {
        const db = this.prisma;
        const me = await db.user.findFirst({
            where: { id: userId, companyId },
            select: { onlyMyLocation: true, defaultLocationId: true },
        });
        if (!me?.onlyMyLocation || !me.defaultLocationId)
            return null;
        return me.defaultLocationId;
    }
    maxMediaBytes() {
        const raw = Number(process.env.MYTITAN_JOB_MEDIA_MAX_BYTES || 8 * 1024 * 1024);
        return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 8 * 1024 * 1024;
    }
    decodeDataUrl(value) {
        const match = value.match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/);
        if (!match)
            return null;
        const mime = String(match[1] || "").toLowerCase();
        const base64 = match[2] || "";
        const bytes = Buffer.from(base64, "base64").length;
        return { mime, bytes };
    }
    validateMediaDataUrl(kind, dataUrl) {
        const parsed = this.decodeDataUrl(dataUrl);
        if (!parsed)
            throw new common_1.BadRequestException("Invalid media payload format");
        const maxBytes = this.maxMediaBytes();
        if (parsed.bytes > maxBytes) {
            throw new common_1.BadRequestException(`Media exceeds limit (${maxBytes} bytes)`);
        }
        const imageOk = parsed.mime.startsWith("image/");
        const videoOk = parsed.mime.startsWith("video/");
        if (kind === "TORQUE") {
            if (!imageOk && !videoOk)
                throw new common_1.BadRequestException("Torque evidence must be image or video");
            return parsed;
        }
        if (kind === "BEFORE" || kind === "AFTER" || kind === "SIGN_TECH" || kind === "SIGN_CUSTOMER") {
            if (!imageOk)
                throw new common_1.BadRequestException("Only image media allowed for this field");
            return parsed;
        }
        return parsed;
    }
    normalizeAssetInput(dto, formData, assets) {
        const normalized = Array.isArray(assets) ? [...assets] : [];
        const addMediaPayload = (kind, item) => {
            if (!item || typeof item !== "object")
                return;
            const data = String(item.data || "").trim();
            const mimeType = String(item.mimeType || "").trim().toLowerCase();
            const filename = String(item.filename || "").trim();
            if (!data || !mimeType)
                return;
            const parsed = this.validateMediaDataUrl(kind, data);
            normalized.push({
                kind,
                dataUrl: data,
                mime: mimeType || parsed.mime,
                bytes: parsed.bytes,
                url: filename || undefined,
            });
        };
        if ((0, feature_flags_1.isMediaSignatureV1Enabled)()) {
            for (const item of Array.isArray(dto.beforeMedia) ? dto.beforeMedia.slice(0, 6) : [])
                addMediaPayload("BEFORE", item);
            for (const item of Array.isArray(dto.afterMedia) ? dto.afterMedia.slice(0, 6) : [])
                addMediaPayload("AFTER", item);
            if (dto.torqueEvidenceMedia)
                addMediaPayload("TORQUE", dto.torqueEvidenceMedia);
        }
        if (!formData)
            return normalized;
        const addList = (kind, list) => {
            if (!Array.isArray(list))
                return;
            for (const item of list.slice(0, 6)) {
                if (typeof item === "string" && item.trim()) {
                    normalized.push({ kind, url: item.trim() });
                    continue;
                }
                if (item && typeof item === "object" && typeof item.data === "string") {
                    addMediaPayload(kind, item);
                }
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
            this.validateMediaDataUrl("SIGN_TECH", formData.technicianSignature.trim());
            normalized.push({ kind: "SIGN_TECH", dataUrl: formData.technicianSignature.trim() });
        }
        if (typeof formData.customerSignature === "string" && formData.customerSignature.trim()) {
            this.validateMediaDataUrl("SIGN_CUSTOMER", formData.customerSignature.trim());
            normalized.push({ kind: "SIGN_CUSTOMER", dataUrl: formData.customerSignature.trim() });
        }
        if ((0, feature_flags_1.isMediaSignatureV1Enabled)()) {
            if (formData.torqueEvidenceMedia && typeof formData.torqueEvidenceMedia === "object") {
                addMediaPayload("TORQUE", formData.torqueEvidenceMedia);
            }
            addList("BEFORE", formData.beforeMedia);
            addList("AFTER", formData.afterMedia);
        }
        return normalized;
    }
    async persistAssets(jobId, payload, companyId, userId, formData) {
        const db = this.prisma;
        for (const asset of payload) {
            const url = (asset.url || asset.dataUrl || "").trim();
            if (!url)
                continue;
            await db.jobAsset.create({
                data: {
                    jobId,
                    kind: asset.kind,
                    url,
                    mime: asset.mime || null,
                    bytes: asset.bytes ?? null,
                },
            });
            if ((0, feature_flags_1.isMediaSignatureV1Enabled)() && db.jobMedia && (asset.kind === "BEFORE" || asset.kind === "AFTER" || asset.kind === "TORQUE")) {
                await db.jobMedia.create({
                    data: {
                        jobId,
                        type: asset.kind === "TORQUE" && String(asset.mime || "").startsWith("video/") ? "VIDEO" : "PHOTO",
                        url,
                        mime: asset.mime || null,
                        bytes: asset.bytes ?? null,
                        fileName: asset.url || null,
                    },
                });
            }
            if ((0, feature_flags_1.isMediaSignatureV1Enabled)() && db.jobSignature && (asset.kind === "SIGN_TECH" || asset.kind === "SIGN_CUSTOMER")) {
                await db.jobSignature.upsert({
                    where: {
                        jobId_signerType: {
                            jobId,
                            signerType: asset.kind === "SIGN_TECH" ? "TECHNICIAN" : "CUSTOMER",
                        },
                    },
                    update: {
                        signerName: asset.kind === "SIGN_TECH"
                            ? String(formData?.technicianSignatureName || formData?.technicianName || "").trim() || null
                            : String(formData?.customerSignatureName || "").trim() || null,
                        dataUrl: url,
                        mime: asset.mime || "image/png",
                        bytes: asset.bytes ?? null,
                    },
                    create: {
                        companyId,
                        jobId,
                        signerType: asset.kind === "SIGN_TECH" ? "TECHNICIAN" : "CUSTOMER",
                        signerName: asset.kind === "SIGN_TECH"
                            ? String(formData?.technicianSignatureName || formData?.technicianName || "").trim() || null
                            : String(formData?.customerSignatureName || "").trim() || null,
                        dataUrl: url,
                        mime: asset.mime || "image/png",
                        bytes: asset.bytes ?? null,
                    },
                });
            }
        }
        if (payload.length > 0) {
            await this.audit.log(companyId, "job.assets.upload", `Uploaded ${payload.length} assets`, userId);
        }
    }
    splitIntoColumns(values, cols = 3) {
        const rows = [];
        for (let i = 0; i < values.length; i += cols) {
            rows.push(values.slice(i, i + cols));
        }
        return rows;
    }
    createSimplePdf(textLines) {
        const escaped = textLines.map((line) => line
            .replace(/\\/g, "\\\\")
            .replace(/\(/g, "\\(")
            .replace(/\)/g, "\\)")
            .slice(0, 180));
        const ops = ["BT", "/F1 10 Tf", "40 800 Td"];
        escaped.forEach((line, i) => {
            if (i > 0)
                ops.push("0 -14 Td");
            ops.push(`(${line}) Tj`);
        });
        ops.push("ET");
        const stream = ops.join("\n");
        const objs = [];
        objs.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
        objs.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
        objs.push("3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj");
        objs.push("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");
        objs.push(`5 0 obj << /Length ${Buffer.byteLength(stream, "utf8")} >> stream\n${stream}\nendstream endobj`);
        let pdf = "%PDF-1.4\n";
        const offsets = [0];
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
    async ensurePublicToken(tx, jobId) {
        const existing = await tx.publicJobToken.findFirst({
            where: {
                jobId,
                expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: "desc" },
        });
        if (existing)
            return existing;
        return tx.publicJobToken.create({
            data: {
                jobId,
                token: (0, crypto_1.randomBytes)(24).toString("hex"),
                expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
            },
        });
    }
    async buildAndStorePdf(companyId, userId, jobId) {
        const db = this.prisma;
        const job = await db.job.findFirst({ where: { id: jobId, companyId } });
        if (!job)
            throw new common_1.NotFoundException("Job not found");
        const assets = await db.jobAsset.findMany({ where: { jobId }, orderBy: { createdAt: "asc" } });
        const signatures = db.jobSignature
            ? await db.jobSignature.findMany({ where: { jobId }, orderBy: { updatedAt: "desc" } })
            : [];
        const settings = await db.tenantSetting.findUnique({ where: { tenantId: companyId } });
        const before = assets.filter((a) => a.kind === "BEFORE").map((a) => a.url);
        const after = assets.filter((a) => a.kind === "AFTER").map((a) => a.url);
        const torque = assets.filter((a) => a.kind === "TORQUE").map((a) => a.url);
        const techSign = signatures.find((a) => a.signerType === "TECHNICIAN")?.dataUrl ||
            assets.find((a) => a.kind === "SIGN_TECH")?.url ||
            "";
        const customerSign = signatures.find((a) => a.signerType === "CUSTOMER")?.dataUrl ||
            assets.find((a) => a.kind === "SIGN_CUSTOMER")?.url ||
            "";
        const formData = (job.formData || {});
        const lines = [];
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
        lines.push("Before Photos (thumbnail grid references)");
        this.splitIntoColumns(before).forEach((row) => lines.push(row.join(" | ")));
        if (before.length === 0)
            lines.push("No before photos uploaded");
        lines.push("");
        lines.push("After Photos (thumbnail grid references)");
        this.splitIntoColumns(after).forEach((row) => lines.push(row.join(" | ")));
        if (after.length === 0)
            lines.push("No after photos uploaded");
        lines.push("");
        lines.push("Torque Evidence");
        if (torque.length > 0) {
            torque.forEach((value) => {
                const prefix = value.startsWith("data:video/") ? "Video evidence captured (embedded data)" : "Image evidence";
                lines.push(`${prefix}: ${value}`);
            });
        }
        else {
            lines.push("(No torque image found; using link fallback if supplied)");
            if (formData.torqueEvidenceLink)
                lines.push(String(formData.torqueEvidenceLink));
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
        const token = await db.$transaction((tx) => this.ensurePublicToken(tx, job.id));
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
    async create(companyId, userId, dto) {
        const db = this.prisma;
        const company = await db.company.findUnique({ where: { id: companyId } });
        if (!company) {
            throw new common_1.NotFoundException("Company not found");
        }
        if (dto.locationId && db.location) {
            const location = await db.location.findFirst({ where: { id: dto.locationId, companyId } });
            if (!location) {
                throw new common_1.BadRequestException("Invalid location for this company");
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
        const serviceName = submittedForm?.serviceName ??
            dto.serviceName ??
            (Array.isArray(settings?.defaultServiceNamePresets) && settings.defaultServiceNamePresets.length > 0
                ? settings.defaultServiceNamePresets[0]
                : null);
        const wheelPricingMode = dto.wheelPricingMode ?? settings?.defaultWheelPricingMode ?? null;
        const whatsappTemplate = dto.whatsappTemplate ?? settings?.whatsappTemplateDefault ?? null;
        const jobType = submittedForm?.jobType || dto.jobType || null;
        const tradeCode = (dto.tradeCode || settings?.primaryTrade || null);
        const scheduledAtRaw = submittedForm?.scheduledAt ||
            submittedForm?.scheduledFor ||
            dto.scheduledAt ||
            null;
        const scheduledAt = scheduledAtRaw && !Number.isNaN(new Date(scheduledAtRaw).getTime())
            ? new Date(scheduledAtRaw)
            : null;
        const created = await db.$transaction(async (tx) => {
            const jobRef = await this.nextJobRef(tx, companyId);
            return tx.job.create({
                data: {
                    companyId,
                    locationId: dto.locationId,
                    jobRef,
                    status: "OPEN",
                    customerName: submittedForm?.customerName || dto.customerName,
                    customerEmail: submittedForm?.customerEmail || dto.customerEmail,
                    customerPhone: submittedForm?.customerPhone || dto.customerPhone,
                    vehicleMake: submittedForm?.vehicleMake || dto.vehicleMake,
                    vehicleModel: submittedForm?.vehicleModel || dto.vehicleModel,
                    vehicleReg: submittedForm?.vehicleReg || dto.vehicleReg,
                    serviceName,
                    wheelPricingMode,
                    whatsappTemplate,
                    whatsappCompletionLink: submittedForm?.whatsappCompletionLink || null,
                    invoiceDueAt: dto.invoiceDueAt ? new Date(dto.invoiceDueAt) : null,
                    scheduledAt,
                    invoiceNumber: submittedForm?.invoiceNumber || null,
                    tradeCode,
                    jobType,
                    createdByUserId: userId,
                    formData: submittedForm,
                    ...totals,
                },
            });
        });
        await this.audit.log(companyId, "job.create", `Created job ${created.jobRef ?? created.id}`, userId);
        await this.logActivity(companyId, created.id, userId, "job.create", `Job ${created.jobRef ?? created.id} created`);
        if (wheelsEnabled && submittedForm) {
            await this.templatesService.ensureWheelsDefaultTemplate();
        }
        const normalizedAssets = this.normalizeAssetInput(dto, submittedForm || undefined, dto.assets);
        if (normalizedAssets.length > 0) {
            await this.persistAssets(created.id, normalizedAssets, companyId, userId, submittedForm || undefined);
        }
        let pdf = null;
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
        }
        catch {
        }
        return {
            ...created,
            pdf,
        };
    }
    list(companyId) {
        const db = this.prisma;
        return db.job.findMany({
            where: { companyId },
            orderBy: { createdAt: "desc" },
        });
    }
    async getById(companyId, id) {
        const db = this.prisma;
        const job = await db.job.findFirst({
            where: { id, companyId },
            include: {
                assets: true,
                pdf: true,
            },
        });
        if (!job) {
            throw new common_1.NotFoundException("Job not found");
        }
        return job;
    }
    async generatePdf(companyId, userId, id) {
        const db = this.prisma;
        const job = await db.job.findFirst({ where: { id, companyId } });
        if (!job) {
            throw new common_1.NotFoundException("Job not found");
        }
        return this.buildAndStorePdf(companyId, userId, id);
    }
    async updateStatus(companyId, userId, id, newStatus) {
        const db = this.prisma;
        const job = await db.job.findFirst({ where: { id, companyId } });
        if (!job) {
            throw new common_1.NotFoundException("Job not found");
        }
        if (job.status === newStatus) {
            return job;
        }
        const allowed = (JOB_STATUS_TRANSITIONS[job.status] ?? []);
        if (!allowed.includes(newStatus)) {
            throw new common_1.BadRequestException(`Invalid status transition: ${job.status} -> ${newStatus}`);
        }
        const updated = await db.job.update({
            where: { id: job.id },
            data: {
                status: newStatus,
                completedAt: newStatus === "COMPLETED" ? new Date() : (newStatus === "INVOICED" ? (job.completedAt || new Date()) : null),
                invoiceIssuedAt: newStatus === "INVOICED" ? new Date() : job.invoiceIssuedAt,
            },
        });
        await this.audit.log(companyId, "job.status", `Job ${job.jobRef ?? job.id} status changed ${job.status} -> ${newStatus}`, userId);
        await this.logActivity(companyId, job.id, userId, "job.status", `${job.status} -> ${newStatus}`);
        if (newStatus === "COMPLETED" && (0, feature_flags_1.isNotificationsV1Enabled)()) {
            await this.notifications.notifyJobCompleted(companyId, job.id);
        }
        if (newStatus === "COMPLETED" && (0, feature_flags_1.isAutomationsV1Enabled)()) {
            const approvalEnabled = await this.automations.isApprovalRequestEnabled(companyId);
            if (approvalEnabled && !updated.approvedAt) {
                const recent = await db.notification.findFirst({
                    where: {
                        companyId,
                        entityType: "job",
                        entityId: job.id,
                        metaJson: { path: ["reasonKey"], equals: "approval_request" },
                        createdAt: { gt: new Date(Date.now() - 6 * 60 * 60 * 1000) },
                    },
                });
                if (!recent) {
                    await this.notifications.sendEntityUpdate(companyId, userId, {
                        entityType: "job",
                        entityId: job.id,
                        templateKey: "approval_request",
                        channel: "in_app",
                        note: "Auto approval request",
                    });
                }
            }
        }
        return updated;
    }
    async patchPartial(companyId, userId, id, dto) {
        const db = this.prisma;
        const job = await db.job.findFirst({ where: { id, companyId } });
        if (!job)
            throw new common_1.NotFoundException("Job not found");
        const payload = {};
        if (dto.status)
            payload.status = dto.status;
        if (dto.assignedUserId !== undefined)
            payload.assignedUserId = dto.assignedUserId || null;
        if (dto.locationId !== undefined)
            payload.locationId = dto.locationId || null;
        if (dto.pricingNotes !== undefined)
            payload.pricingNotes = dto.pricingNotes || null;
        if (dto.invoiceDueAt !== undefined)
            payload.invoiceDueAt = dto.invoiceDueAt ? new Date(dto.invoiceDueAt) : null;
        if (dto.scheduledAt !== undefined)
            payload.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
        if (dto.customerName !== undefined)
            payload.customerName = dto.customerName || null;
        if (dto.customerEmail !== undefined)
            payload.customerEmail = dto.customerEmail || null;
        if (dto.customerPhone !== undefined)
            payload.customerPhone = dto.customerPhone || null;
        if (dto.completedAt !== undefined)
            payload.completedAt = dto.completedAt ? new Date(dto.completedAt) : null;
        if (dto.status === "COMPLETED" && dto.completedAt === undefined)
            payload.completedAt = new Date();
        const updated = await db.job.update({
            where: { id },
            data: payload,
        });
        await this.recordUndo(companyId, userId, "inline_patch", [
            {
                id,
                before: {
                    status: job.status,
                    completedAt: job.completedAt,
                    assignedUserId: job.assignedUserId,
                    locationId: job.locationId,
                    pricingNotes: job.pricingNotes,
                    invoiceDueAt: job.invoiceDueAt,
                    scheduledAt: job.scheduledAt,
                    customerName: job.customerName,
                    customerEmail: job.customerEmail,
                    customerPhone: job.customerPhone,
                },
                after: {
                    status: updated.status,
                    completedAt: updated.completedAt,
                    assignedUserId: updated.assignedUserId,
                    locationId: updated.locationId,
                    pricingNotes: updated.pricingNotes,
                    invoiceDueAt: updated.invoiceDueAt,
                    scheduledAt: updated.scheduledAt,
                    customerName: updated.customerName,
                    customerEmail: updated.customerEmail,
                    customerPhone: updated.customerPhone,
                },
            },
        ]);
        await this.audit.log(companyId, "job.patch", `Patched job ${job.jobRef || job.id}`, userId);
        await this.logActivity(companyId, job.id, userId, "job.patch", "Inline update", payload);
        if ((updated.status === "COMPLETED" || (updated.completedAt && !job.completedAt)) && (0, feature_flags_1.isNotificationsV1Enabled)()) {
            await this.notifications.notifyJobCompleted(companyId, job.id);
        }
        return updated;
    }
    async board(companyId, userId, query) {
        const db = this.prisma;
        const page = Math.max(1, Number(query?.page || 1));
        const pageSize = Math.min(100, Math.max(1, Number(query?.pageSize || 40)));
        const statuses = String(query?.status || "")
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
        const where = { companyId };
        if (statuses.length)
            where.status = { in: statuses };
        const restrictedLocationId = await this.restrictedLocationId(companyId, userId);
        if (restrictedLocationId) {
            where.locationId = restrictedLocationId;
        }
        else {
            const rawLocationIds = String(query.locationIds || "")
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean)
                .filter((v) => v !== "all");
            if (rawLocationIds.length) {
                where.locationId = { in: rawLocationIds };
            }
            else if (query.locationId && query.locationId !== "all") {
                where.locationId = query.locationId;
            }
        }
        if (query.assignedTo)
            where.assignedUserId = query.assignedTo;
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
        if (query.trade) {
            where.tradeCode = query.trade.trim();
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
        const grouped = {
            OPEN: [],
            SCHEDULED: [],
            IN_PROGRESS: [],
            COMPLETED: [],
            INVOICED: [],
            CANCELLED: [],
            DRAFT: [],
        };
        for (const job of jobs) {
            if (!grouped[job.status])
                grouped[job.status] = [];
            grouped[job.status].push(job);
        }
        const counts = Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length]));
        return { grouped, counts, page, pageSize };
    }
    async bulk(companyId, userId, dto) {
        const db = this.prisma;
        const failed = [];
        let successCount = 0;
        const uniqueIds = Array.from(new Set((dto.jobIds || []).filter(Boolean)));
        const undoChanges = [];
        for (const id of uniqueIds) {
            const job = await db.job.findFirst({ where: { id, companyId } });
            if (!job) {
                failed.push({ id, reason: "not found" });
                continue;
            }
            try {
                const before = {
                    status: job.status,
                    completedAt: job.completedAt,
                    assignedUserId: job.assignedUserId,
                    locationId: job.locationId,
                    tags: job.tags,
                    invoiceDueAt: job.invoiceDueAt,
                };
                if (dto.operation === "setStatus" && dto.status) {
                    await db.job.update({
                        where: { id },
                        data: {
                            status: dto.status,
                            completedAt: dto.status === "COMPLETED" ? new Date() : null,
                        },
                    });
                }
                else if (dto.operation === "assignTechnician") {
                    await db.job.update({ where: { id }, data: { assignedUserId: dto.assignedUserId || null } });
                }
                else if (dto.operation === "setLocation") {
                    await db.job.update({ where: { id }, data: { locationId: dto.locationId && dto.locationId !== "all" ? dto.locationId : null } });
                }
                else if (dto.operation === "addTag" && dto.tag) {
                    const tags = Array.isArray(job.tags) ? job.tags : [];
                    const next = Array.from(new Set([...tags, dto.tag.trim()])).filter(Boolean);
                    await db.job.update({ where: { id }, data: { tags: next } });
                }
                else if (dto.operation === "removeTag" && dto.tag) {
                    const tags = Array.isArray(job.tags) ? job.tags : [];
                    await db.job.update({ where: { id }, data: { tags: tags.filter((t) => t !== dto.tag) } });
                }
                else if (dto.operation === "setDueDate") {
                    await db.job.update({ where: { id }, data: { invoiceDueAt: dto.dueAt ? new Date(dto.dueAt) : null } });
                }
                else if (dto.operation === "closeJobs") {
                    await db.job.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } });
                }
                else if (dto.operation === "markComplete") {
                    await db.job.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } });
                }
                else {
                    failed.push({ id, reason: "invalid operation payload" });
                    continue;
                }
                const after = await db.job.findFirst({
                    where: { id, companyId },
                    select: { status: true, completedAt: true, assignedUserId: true, locationId: true, tags: true, invoiceDueAt: true },
                });
                undoChanges.push({ id, before, after });
                await this.logActivity(companyId, id, userId, "job.bulk", `Bulk operation ${dto.operation}`, { before, after, operation: dto.operation });
                if (after?.status === "COMPLETED" && !before.completedAt && (0, feature_flags_1.isNotificationsV1Enabled)()) {
                    await this.notifications.notifyJobCompleted(companyId, id);
                }
                successCount += 1;
            }
            catch (err) {
                failed.push({ id, reason: err?.message || "update failed" });
            }
        }
        if (undoChanges.length > 0) {
            await this.recordUndo(companyId, userId, "bulk_update", undoChanges);
        }
        await this.audit.log(companyId, "jobs.bulk", `Bulk op ${dto.operation} updated ${successCount}/${uniqueIds.length}`, userId);
        return { successCount, failed };
    }
    async undoLastChange(companyId, userId) {
        const db = this.prisma;
        const action = await db.userUndoAction.findFirst({
            where: {
                companyId,
                userId,
                consumedAt: null,
                expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: "desc" },
        });
        if (!action)
            return { ok: false, message: "Nothing to undo" };
        const changes = Array.isArray(action.payloadJson?.changes) ? action.payloadJson.changes : [];
        for (const change of changes) {
            if (!change?.id || !change?.before)
                continue;
            await db.job.update({
                where: { id: change.id },
                data: {
                    status: change.before.status ?? undefined,
                    completedAt: change.before.completedAt ? new Date(change.before.completedAt) : null,
                    assignedUserId: change.before.assignedUserId ?? undefined,
                    locationId: change.before.locationId ?? undefined,
                    pricingNotes: change.before.pricingNotes ?? undefined,
                    tags: Array.isArray(change.before.tags) ? change.before.tags : undefined,
                    invoiceDueAt: change.before.invoiceDueAt ? new Date(change.before.invoiceDueAt) : null,
                    customerName: change.before.customerName ?? undefined,
                    customerEmail: change.before.customerEmail ?? undefined,
                    customerPhone: change.before.customerPhone ?? undefined,
                },
            });
            await this.logActivity(companyId, change.id, userId, "job.undo", "Last change undone");
        }
        await db.userUndoAction.update({ where: { id: action.id }, data: { consumedAt: new Date() } });
        await this.audit.log(companyId, "jobs.undo", `Undid last ${action.actionType} change set`, userId);
        return { ok: true, count: changes.length };
    }
    async boardV2(companyId, userId, query) {
        const db = this.prisma;
        const statuses = String(query?.status || "")
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
        const where = { companyId };
        if (statuses.length)
            where.status = { in: statuses };
        const restrictedLocationId = await this.restrictedLocationId(companyId, userId);
        if (restrictedLocationId) {
            where.locationId = restrictedLocationId;
        }
        else {
            const rawLocationIds = String(query.locationIds || "")
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean)
                .filter((v) => v !== "all");
            if (rawLocationIds.length)
                where.locationId = { in: rawLocationIds };
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
            orderBy: [{ invoiceDueAt: "asc" }, { createdAt: "desc" }],
            take: 300,
        });
        const grouped = {
            OPEN: [],
            SCHEDULED: [],
            IN_PROGRESS: [],
            COMPLETED: [],
            INVOICED: [],
            CANCELLED: [],
            DRAFT: [],
        };
        for (const job of jobs) {
            if (!grouped[job.status])
                grouped[job.status] = [];
            grouped[job.status].push(job);
        }
        const counts = Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length]));
        return { grouped, counts, total: jobs.length };
    }
    async bulkV2(companyId, userId, dto) {
        const db = this.prisma;
        const uniqueIds = Array.from(new Set((dto.jobIds || []).filter(Boolean)));
        if (uniqueIds.length === 0)
            return { successCount: 0, failed: [] };
        return db.$transaction(async (tx) => {
            const jobs = await tx.job.findMany({ where: { companyId, id: { in: uniqueIds } } });
            if (jobs.length !== uniqueIds.length) {
                const found = new Set(jobs.map((j) => j.id));
                const failed = uniqueIds.filter((id) => !found.has(id)).map((id) => ({ id, reason: "not found" }));
                return { successCount: 0, failed };
            }
            const undoChanges = [];
            for (const job of jobs) {
                const before = {
                    status: job.status,
                    completedAt: job.completedAt,
                    assignedUserId: job.assignedUserId,
                    locationId: job.locationId,
                    tags: job.tags,
                    invoiceDueAt: job.invoiceDueAt,
                };
                if (dto.operation === "setStatus" && dto.status) {
                    await tx.job.update({
                        where: { id: job.id },
                        data: {
                            status: dto.status,
                            completedAt: dto.status === "COMPLETED" ? new Date() : null,
                        },
                    });
                }
                else if (dto.operation === "assignTechnician") {
                    await tx.job.update({ where: { id: job.id }, data: { assignedUserId: dto.assignedUserId || null } });
                }
                else if (dto.operation === "setLocation") {
                    await tx.job.update({ where: { id: job.id }, data: { locationId: dto.locationId && dto.locationId !== "all" ? dto.locationId : null } });
                }
                else if (dto.operation === "addTag" && dto.tag) {
                    const next = Array.from(new Set([...(Array.isArray(job.tags) ? job.tags : []), dto.tag.trim()])).filter(Boolean);
                    await tx.job.update({ where: { id: job.id }, data: { tags: next } });
                }
                else if (dto.operation === "removeTag" && dto.tag) {
                    const tags = Array.isArray(job.tags) ? job.tags : [];
                    await tx.job.update({ where: { id: job.id }, data: { tags: tags.filter((t) => t !== dto.tag) } });
                }
                else if (dto.operation === "setDueDate") {
                    await tx.job.update({ where: { id: job.id }, data: { invoiceDueAt: dto.dueAt ? new Date(dto.dueAt) : null } });
                }
                else if (dto.operation === "closeJobs") {
                    await tx.job.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date() } });
                }
                else if (dto.operation === "markComplete") {
                    await tx.job.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date() } });
                }
                else {
                    throw new common_1.BadRequestException("Invalid operation payload");
                }
                const after = await tx.job.findUnique({
                    where: { id: job.id },
                    select: { status: true, completedAt: true, assignedUserId: true, locationId: true, tags: true, invoiceDueAt: true },
                });
                undoChanges.push({ id: job.id, before, after });
                await tx.jobActivity.create({
                    data: {
                        companyId,
                        jobId: job.id,
                        actorUserId: userId,
                        eventType: "job.bulk_v2",
                        message: `Bulk operation ${dto.operation}`,
                        payloadJson: { before, after, operation: dto.operation },
                    },
                });
            }
            await tx.userUndoAction.updateMany({
                where: { companyId, userId, consumedAt: null, expiresAt: { gt: new Date() } },
                data: { consumedAt: new Date() },
            });
            await tx.userUndoAction.create({
                data: {
                    companyId,
                    userId,
                    actionType: "bulk_v2",
                    payloadJson: { changes: undoChanges },
                    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
                },
            });
            for (const entry of undoChanges) {
                if (entry.after?.status === "COMPLETED" && !entry.before?.completedAt && (0, feature_flags_1.isNotificationsV1Enabled)()) {
                    await this.notifications.notifyJobCompleted(companyId, entry.id);
                }
            }
            return { successCount: uniqueIds.length, failed: [] };
        });
    }
    async createReminder(companyId, userId, dto) {
        const db = this.prisma;
        const job = await db.job.findFirst({ where: { id: dto.jobId, companyId }, select: { id: true, jobRef: true } });
        if (!job)
            throw new common_1.NotFoundException("Job not found");
        const reminder = await db.jobReminder.create({
            data: {
                companyId,
                jobId: job.id,
                remindAt: new Date(dto.remindAt),
                channel: dto.channel || "in_app",
                note: dto.note || null,
            },
        });
        await this.logActivity(companyId, job.id, userId, "job.reminder.create", "Reminder created", {
            remindAt: reminder.remindAt,
            channel: reminder.channel,
        });
        await this.audit.log(companyId, "job.reminder.create", `Reminder set for ${job.jobRef || job.id}`, userId);
        return reminder;
    }
    async activity(companyId, jobId) {
        const db = this.prisma;
        const job = await db.job.findFirst({ where: { id: jobId, companyId }, select: { id: true } });
        if (!job)
            throw new common_1.NotFoundException("Job not found");
        return db.jobActivity.findMany({
            where: { companyId, jobId },
            orderBy: { createdAt: "desc" },
            take: 200,
        });
    }
};
exports.JobsService = JobsService;
exports.JobsService = JobsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        templates_service_1.TemplatesService,
        notifications_service_1.NotificationsService,
        automations_service_1.AutomationsService])
], JobsService);
//# sourceMappingURL=jobs.service.js.map