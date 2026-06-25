import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { AuditService } from "../audit/audit.service";
import { JobStatus } from "../common/constants";
import { isAutomationsV1Enabled, isMediaSignatureV1Enabled, isNotificationsV1Enabled, isWheelsFormV1Enabled } from "../common/feature-flags";
import { ActivityService } from "../events/activity.service";
import { EventsService } from "../events/events.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AutomationsService } from "../automations/automations.service";
import { ComplianceService } from "../compliance/compliance.service";
import { InventoryService } from "../inventory/inventory.service";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { TemplatesService } from "../templates/templates.service";
import { BillingService } from "../billing/billing.service";
import { getCustomerFeedbackSettings, getJobDeclarationText, getServiceRecordEmailSettings, getWorkspaceJobForms } from "../common/business-config";
import { buildJobCompletionOverview, buildServiceRecordEmailContent } from "../common/job-completion-output";
import { assertWorkflowStageReadiness, resolveWorkflowStageReadiness } from "../config/workflow-stage-readiness";
import { buildCustomerOutputPresentation, resolveCustomerOutputFields } from "../common/customer-fields";
import { buildApiUrl, buildAppUrl, getApiPublicUrl, getAppPublicUrl } from "../common/public-url";
import { buildAddressText, buildMapLinks } from "../common/maps";
import { BulkJobsDto, BulkJobsV2Dto, CreateJobAssetDto, CreateJobDto, CreateJobReminderDto, JobsBoardQueryDto, PatchJobDto, ShareJobSheetDto } from "./dto";
import { DocumentControlService } from "../document-control/document-control.service";

const JOB_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["INVOICED"],
  INVOICED: [],
  CANCELLED: [],
};

const JOB_BEFORE_AFTER_MEDIA_LIMIT = 20;

@Injectable()
export class JobsService {
  private buildVisibilityWhere(options?: { includeArchived?: boolean; includeDeleted?: boolean }) {
    return {
      ...(options?.includeDeleted ? {} : { deletedAt: null }),
      ...(options?.includeArchived ? {} : { archivedAt: null }),
    };
  }

  private buildDeleteBlockedReasons(job: any) {
    const reasons: string[] = [];
    const counts = job?._count || {};

    if (job?.invoiceIssuedAt || job?.invoicePaidAt || job?.paymentCheckoutSessionId || job?.paymentReceiptUrl) {
      reasons.push("This job already has billing or payment history.");
    }
    if (job?.approvedAt || job?.declinedAt || job?.signedAt || job?.signatureName || job?.signatureDataUrl || Number(counts.signatures || 0) > 0) {
      reasons.push("This job already has customer approval or signature proof.");
    }
    if (job?.pdf || job?.invoicePdfUrl || Number(counts.assets || 0) > 0 || Number(counts.executionEvidence || 0) > 0) {
      reasons.push("This job already has service record or evidence artifacts.");
    }
    if (job?.whatsappCompletionLink || Number(counts.publicTokens || 0) > 0) {
      reasons.push("This job already has customer-facing proof links.");
    }
    if (Number(counts.executionRecords || 0) > 0) {
      reasons.push("This job already has an execution record.");
    }
    if (Number(counts.bookings || 0) > 0) {
      reasons.push("This job is still linked to a booking.");
    }

    return reasons;
  }

  private buildLifecycleState(job: any) {
    const status = String(job?.status || "OPEN").toUpperCase();
    const paid = Boolean(job?.invoicePaidAt || job?.paymentReceiptUrl);
    const archived = Boolean(job?.archivedAt);
    const deleted = Boolean(job?.deletedAt);
    const deleteBlockedReasons = this.buildDeleteBlockedReasons(job);
    const canArchive =
      !deleted &&
      !archived &&
      (["COMPLETED", "INVOICED", "CANCELLED"].includes(status) || paid);
    const canCancel =
      !deleted &&
      !archived &&
      ["DRAFT", "OPEN", "SCHEDULED", "IN_PROGRESS"].includes(status) &&
      !job?.invoiceIssuedAt &&
      !paid;
    const canDelete = !deleted && deleteBlockedReasons.length === 0;

    return {
      paid,
      archived,
      deleted,
      canArchive,
      canCancel,
      canDelete,
      deleteBlockedReasons,
    };
  }

  private fieldMatchesConfiguredServiceType(serviceTypeIds: string[] | null | undefined, selectedServiceTypeId: string) {
    if (!Array.isArray(serviceTypeIds) || serviceTypeIds.length === 0) return true;
    if (!selectedServiceTypeId) return false;
    return serviceTypeIds.includes(selectedServiceTypeId);
  }

  private getMissingRequiredConfiguredFields(
    settings: { businessConfigJson?: unknown; primaryTrade?: string | null; defaultServiceNamePresets?: unknown } | null | undefined,
    submittedForm: Record<string, any> | null | undefined,
    selectedServiceTypeId: string,
  ) {
    const config = getWorkspaceJobForms(settings);
    const sections = Array.isArray(config.sections) ? config.sections : [];
    const fields = Array.isArray(config.fields) ? config.fields : [];
    const visibleSections = sections.filter(
      (section: any) =>
        section?.visible !== false &&
        String(section?.title || "").trim() &&
        this.fieldMatchesConfiguredServiceType(section?.serviceTypeIds, selectedServiceTypeId),
    );

    const missing: string[] = [];
    for (const section of visibleSections) {
      for (const field of fields) {
        if (field?.sectionId !== section.id) continue;
        if (field?.visible === false) continue;
        if (field?.required !== true) continue;
        if (!String(field?.key || "").trim() || !String(field?.label || "").trim()) continue;
        if (!this.fieldMatchesConfiguredServiceType(field?.serviceTypeIds, selectedServiceTypeId)) continue;

        const value = submittedForm?.[field.key];
        if (field.type === "checkbox") {
          if (!value) missing.push(String(field.label));
          continue;
        }
        if (Array.isArray(value)) {
          if (value.length === 0) missing.push(String(field.label));
          continue;
        }
        if (String(value ?? "").trim().length === 0) {
          missing.push(String(field.label));
        }
      }
    }
    return missing;
  }

  private async getWorkflowSettings(db: any, companyId: string) {
    return db.tenantSetting.findUnique({
      where: { tenantId: companyId },
      select: { businessConfigJson: true },
    });
  }

  private async ensureJobStageReady(
    db: any,
    companyId: string,
    jobId: string,
    status: string | null | undefined,
    action: string,
    settings?: { businessConfigJson?: unknown } | null,
  ) {
    return assertWorkflowStageReadiness({
      prisma: db,
      tenantId: companyId,
      entityType: "job",
      entityId: jobId,
      status,
      settings,
      action,
    });
  }

  private async assertCompletionAllowanceAvailable(db: any, companyId: string, job: { status?: string | null; completedAt?: Date | null }) {
    const status = String(job?.status || "").trim().toUpperCase();
    if (job?.completedAt || status === "COMPLETED" || status === "INVOICED") {
      return null;
    }
    return this.billing.assertJobCompletionAllowanceAvailable(companyId, { db });
  }

  private async decorateJobWithWorkflowReadiness(
    db: any,
    companyId: string,
    job: any,
    settings?: { businessConfigJson?: unknown } | null,
  ) {
    if (!job?.id) return job;
    const workflowSettings = settings ?? await this.getWorkflowSettings(db, companyId);
    const readiness = await resolveWorkflowStageReadiness({
      prisma: db,
      tenantId: companyId,
      entityType: "job",
      entityId: job.id,
      status: job.status,
      settings: workflowSettings,
    });
    return {
      ...job,
      workflowStageReady: readiness.ready,
      workflowStageId: readiness.stageId,
      workflowStageLabel: readiness.stageLabel,
      workflowStageEnforcementMode: readiness.requiredFieldEnforcementMode,
      missingRequiredFields: readiness.missingRequiredFields,
      requiredCustomFieldKeys: readiness.requiredCustomFieldKeys,
      lifecycle: this.buildLifecycleState(job),
    };
  }

  private async emitJobActivity(type: string, job: any, label: string) {
    const payload = {
      type,
      label,
      tenantId: job?.companyId || job?.tenantId || null,
      customerId: job?.customerId || null,
      jobId: job?.id || null,
      jobRef: job?.jobRef || null,
      customerName: job?.customerName || null,
      status: job?.status || null,
      vehicleReg: job?.vehicleReg || null,
      technicianId: job?.technicianId || job?.assignedUserId || null,
      at: new Date().toISOString(),
      payloadJson: {
        jobId: job?.id || null,
        jobRef: job?.jobRef || null,
        status: job?.status || null,
        customerName: job?.customerName || null,
        vehicleReg: job?.vehicleReg || null,
      },
    };
    this.events.emit(payload);
    await this.activityStream.push(payload);
  }

  private async maybeRunCompletionAutomation(companyId: string, userId: string, before: any, after: any) {
    if (!isAutomationsV1Enabled()) return;
    const wasCompleted = Boolean(before?.completedAt) || before?.status === "COMPLETED" || before?.status === "INVOICED";
    const isCompleted = Boolean(after?.completedAt) || after?.status === "COMPLETED" || after?.status === "INVOICED";
    if (wasCompleted || !isCompleted) return;
    const db = this.prisma as any;
    const current = await db.job.findFirst({ where: { id: after.id, companyId } });
    if (!current) return;
    await this.automations.handleJobCompleted(companyId, userId, current);
  }

  private async maybeRunContactGapAutomation(companyId: string, userId: string, jobId: string) {
    if (!isAutomationsV1Enabled()) return;
    const db = this.prisma as any;
    const current = await db.job.findFirst({ where: { id: jobId, companyId } });
    if (!current) return;
    await this.automations.handleJobContactGap(companyId, userId, current);
  }


  constructor(
    private readonly events: EventsService,
    private readonly activityStream: ActivityService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly templatesService: TemplatesService,
    private readonly notifications: NotificationsService,
    private readonly automations: AutomationsService,
    private readonly compliance: ComplianceService,
    private readonly inventory: InventoryService,
    private readonly billing: BillingService,
    private readonly email: EmailService,
    private readonly documents: DocumentControlService,
  ) {}

  private asNumber(value: any, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  private joinNonEmpty(values: Array<string | null | undefined>, separator: string) {
    const parts = values.map((value) => String(value || "").trim()).filter(Boolean);
    return parts.length ? parts.join(separator) : null;
  }

  private firstText(...values: unknown[]) {
    for (const value of values) {
      const text = String(value || "").trim();
      if (text) return text;
    }
    return "";
  }

  private normalizeStringList(value: unknown) {
    if (Array.isArray(value)) {
      return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
    }
    if (typeof value === "string") {
      return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
    }
    return [] as string[];
  }

  private wheelPositionsFromForm(formData: Record<string, any>) {
    const explicit = this.normalizeStringList(formData.wheelPositions);
    if (explicit.length > 0) return explicit;
    return [
      formData.wheel_nsf ? "NSF" : null,
      formData.wheel_nsr ? "NSR" : null,
      formData.wheel_osf ? "OSF" : null,
      formData.wheel_osr ? "OSR" : null,
      formData.wheel_spare ? "SPARE" : null,
    ].filter((value): value is string => Boolean(value));
  }

  private normalizeSubmittedForm(
    formData: Record<string, any>,
    options: { locationName?: string | null; serviceTypeName?: string | null },
  ) {
    const wheelPositions = this.wheelPositionsFromForm(formData);
    const serviceTypes = Array.from(
      new Set(
        [
          ...this.normalizeStringList(formData.serviceTypes),
          ...this.normalizeStringList(formData.services),
          this.firstText(formData.serviceTypeName, options.serviceTypeName),
          this.firstText(formData.serviceName),
        ].filter(Boolean),
      ),
    );

    formData.jobReference = this.firstText(formData.jobReference);
    formData.jobDate = this.firstText(formData.jobDate, formData.jobStartDate);
    formData.completedDate = this.firstText(formData.completedDate, formData.jobCompletedDate);
    formData.siteLocation = this.firstText(formData.siteLocation, options.locationName, formData.city, formData.town);
    formData.customerAddress = this.joinNonEmpty(
      [
        this.firstText(formData.addressLine1),
        this.firstText(formData.addressLine2),
        this.firstText(formData.city, formData.town),
        this.firstText(formData.postcode),
        this.firstText(formData.country),
      ],
      ", ",
    );
    formData.vehicleColour = this.firstText(formData.vehicleColour, formData.vehicleColor, formData.colour, formData.color);
    formData.registration = this.firstText(formData.registration, formData.vehicleReg, formData.carRegOrChassis);
    formData.wheelPositions = wheelPositions;
    formData.serviceTypes = serviceTypes;
    formData.services = serviceTypes;
    formData.numberOfWheels = this.asNumber(formData.numberOfWheels, this.asNumber(formData.wheelCount, wheelPositions.length));
    formData.wheelCount = this.asNumber(formData.wheelCount, formData.numberOfWheels);
    formData.additionalServicesText = this.firstText(formData.additionalServicesText, formData.additionalServiceText, formData.additionalServices);
    formData.additionalServicePrice = this.asNumber(formData.additionalServicePrice, 0);
    formData.customerNotes = this.firstText(formData.customerNotes, formData.jobNotes);
    formData.jobNotes = this.firstText(formData.jobNotes, formData.customerNotes);
    formData.internalNotes = this.firstText(formData.internalNotes, formData.notes);
  }

  private slugifyCustomerName(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  private async resolveOrCreateCustomer(companyId: string, input: { customerId?: string | null; name?: string | null; email?: string | null; phone?: string | null }) {
    return this.resolveOrCreateCustomerOnClient(this.prisma as any, companyId, input);
  }

  private async resolveOrCreateCustomerOnClient(db: any, companyId: string, input: { customerId?: string | null; name?: string | null; email?: string | null; phone?: string | null }) {
    const providedId = String(input.customerId || "").trim();
    const name = String(input.name || "").trim();
    const email = String(input.email || "").trim().toLowerCase();
    const phone = String(input.phone || "").trim();

    if (providedId) {
      const existingById = await db.customer.findFirst({
        where: { id: providedId, companyId },
        select: { id: true },
      });
      if (existingById) return existingById.id as string;
    }

    if (!name) return null;

    if (email) {
      const byEmail = await db.customer.findFirst({
        where: { companyId, email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      if (byEmail) return byEmail.id as string;
    }

    if (phone) {
      const byPhone = await db.customer.findFirst({
        where: { companyId, phone },
        select: { id: true },
      });
      if (byPhone) return byPhone.id as string;
    }

    const byName = await db.customer.findFirst({
      where: { companyId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (byName) return byName.id as string;

    const baseSlug = this.slugifyCustomerName(name) || "customer";
    let slug = baseSlug;
    for (let i = 0; i < 6; i += 1) {
      try {
        const created = await db.customer.create({
          data: {
            companyId,
            slug,
            name,
            email: email || null,
            phone: phone || null,
          },
          select: { id: true },
        });
        return created.id as string;
      } catch {
        slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}-${i + 1}`;
      }
    }

    return null;
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
    const additionalServicePrice = this.asNumber(formData.additionalServicePrice, 0);
    const discount = this.asNumber(formData.discount, 0);
    const vatEnabled = Boolean(formData.vatEnabled);
    const vatRate = this.asNumber(formData.vatRate, 0);

    const lineCents = Math.round(unitPrice * 100) * quantity;
    const wheelCents = Math.round(pricePerWheel * 100) * wheelCount;
    const additionalServiceCents = Math.round(additionalServicePrice * 100);
    const discountCents = Math.max(0, Math.round(discount * 100));
    const subtotalCents = Math.max(0, lineCents + wheelCents + additionalServiceCents - discountCents);
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
    return this.documents.allocate(tx, companyId, "JOB_SHEET");
  }

  private async isWheelsFlowEnabledOnClient(db: any, companyId: string) {
    if (!isWheelsFormV1Enabled()) return false;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId: companyId } });
    return settings?.primaryTrade === "WHEELS";
  }

  async createCoreJobRecord(tx: any, companyId: string, userId: string, dto: CreateJobDto) {
    const company = await tx.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException("Company not found");
    }

    const location =
      dto.locationId && tx.location
        ? await tx.location.findFirst({ where: { id: dto.locationId, companyId } })
        : null;
    if (dto.locationId && tx.location) {
      if (!location) {
        throw new BadRequestException("Invalid location for this company");
      }
    }

    const settings = await tx.tenantSetting.findUnique({ where: { tenantId: companyId } });
    const wheelsEnabled = await this.isWheelsFlowEnabledOnClient(tx, companyId);
    const tradeAccount =
      dto.tradeAccountId
        ? await tx.tradeAccount.findFirst({
            where: { id: dto.tradeAccountId, companyId },
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
          })
        : null;
    const submittedForm = dto.formData ? { ...dto.formData } : null;
    const tradeAccountProfile = tradeAccount ? resolveCustomerOutputFields({ tradeAccount }) : null;

    if (submittedForm && tradeAccount) {
      submittedForm.tradeAccountId = submittedForm.tradeAccountId || tradeAccount.id;
      submittedForm.tradeName = submittedForm.tradeName || tradeAccount.name;
      submittedForm.customerTradeName = submittedForm.customerTradeName || tradeAccount.name;
      submittedForm.tradeContactName = submittedForm.tradeContactName || tradeAccountProfile?.primaryContact.name || tradeAccount.contactName || "";
      submittedForm.customerEmail =
        submittedForm.customerEmail ||
        tradeAccountProfile?.primaryContact.email ||
        tradeAccount.contactEmail ||
        tradeAccount.billingEmail ||
        "";
      submittedForm.customerPhone =
        submittedForm.customerPhone ||
        tradeAccountProfile?.primaryContact.phone ||
        tradeAccount.contactPhone ||
        tradeAccount.contactMobile ||
        tradeAccount.billingPhone ||
        tradeAccount.billingMobile ||
        "";
      submittedForm.contactMobile =
        submittedForm.contactMobile ||
        tradeAccountProfile?.primaryContact.mobile ||
        tradeAccount.contactMobile ||
        "";
      submittedForm.vatNumber = submittedForm.vatNumber || tradeAccount.vatNumber || "";
      submittedForm.companyNumber = submittedForm.companyNumber || tradeAccount.companyNumber || "";
      submittedForm.addressLine1 = submittedForm.addressLine1 || tradeAccountProfile?.businessAddress.line1 || tradeAccount.businessAddressLine1 || "";
      submittedForm.addressLine2 = submittedForm.addressLine2 || tradeAccountProfile?.businessAddress.line2 || tradeAccount.businessAddressLine2 || "";
      submittedForm.city = submittedForm.city || tradeAccountProfile?.businessAddress.city || tradeAccount.businessCity || "";
      submittedForm.town = submittedForm.town || tradeAccountProfile?.businessAddress.city || tradeAccount.businessCity || "";
      submittedForm.postcode = submittedForm.postcode || tradeAccountProfile?.businessAddress.postcode || tradeAccount.businessPostcode || "";
      submittedForm.country = submittedForm.country || tradeAccountProfile?.businessAddress.country || tradeAccount.businessCountry || "";
      submittedForm.billingContactName =
        submittedForm.billingContactName ||
        tradeAccountProfile?.mergeFields.billingContactName ||
        tradeAccount.billingContactName ||
        "";
      submittedForm.billingEmail =
        submittedForm.billingEmail ||
        tradeAccountProfile?.mergeFields.billingEmail ||
        tradeAccount.billingEmail ||
        "";
      submittedForm.billingPhone =
        submittedForm.billingPhone ||
        tradeAccountProfile?.mergeFields.billingPhone ||
        tradeAccount.billingPhone ||
        "";
      submittedForm.billingMobile =
        submittedForm.billingMobile ||
        tradeAccountProfile?.mergeFields.billingMobile ||
        tradeAccount.billingMobile ||
        "";
      submittedForm.billingAddressLine1 =
        submittedForm.billingAddressLine1 ||
        tradeAccountProfile?.billingAddress.line1 ||
        tradeAccount.billingAddressLine1 ||
        "";
      submittedForm.billingAddressLine2 =
        submittedForm.billingAddressLine2 ||
        tradeAccountProfile?.billingAddress.line2 ||
        tradeAccount.billingAddressLine2 ||
        "";
      submittedForm.billingCity =
        submittedForm.billingCity ||
        tradeAccountProfile?.billingAddress.city ||
        tradeAccount.billingCity ||
        "";
      submittedForm.billingPostcode =
        submittedForm.billingPostcode ||
        tradeAccountProfile?.billingAddress.postcode ||
        tradeAccount.billingPostcode ||
        "";
      submittedForm.billingCountry =
        submittedForm.billingCountry ||
        tradeAccountProfile?.billingAddress.country ||
        tradeAccount.billingCountry ||
        "";
      submittedForm.secondaryContactName =
        submittedForm.secondaryContactName ||
        tradeAccountProfile?.secondaryContact.name ||
        tradeAccount.secondaryContactName ||
        "";
      submittedForm.secondaryContactEmail =
        submittedForm.secondaryContactEmail ||
        tradeAccountProfile?.secondaryContact.email ||
        tradeAccount.secondaryContactEmail ||
        "";
      submittedForm.secondaryContactPhone =
        submittedForm.secondaryContactPhone ||
        tradeAccountProfile?.secondaryContact.phone ||
        tradeAccount.secondaryContactPhone ||
        "";
      submittedForm.secondaryContactMobile =
        submittedForm.secondaryContactMobile ||
        tradeAccountProfile?.secondaryContact.mobile ||
        tradeAccount.secondaryContactMobile ||
        "";
    }
    if (submittedForm) {
      // Declaration text is workspace-controlled and should not drift from settings via job-form edits.
      submittedForm.declarationConsent = getJobDeclarationText(settings);
    }

    const configuredServiceTypes = getWorkspaceJobForms(settings).serviceTypes || [];
    const submittedServiceTypeId = String((submittedForm?.serviceTypeId as string | undefined) || "").trim();
    const selectedServiceType =
      configuredServiceTypes.find((item) => item.id === submittedServiceTypeId) ||
      configuredServiceTypes.find((item) => item.name === (submittedForm?.serviceTypeName as string | undefined)) ||
      null;
    const serviceName =
      selectedServiceType?.name ??
      (submittedForm?.serviceName as string | undefined) ??
      dto.serviceName ??
      (Array.isArray(settings?.defaultServiceNamePresets) && settings.defaultServiceNamePresets.length > 0
        ? settings.defaultServiceNamePresets[0]
        : null);
    if (submittedForm) {
      this.normalizeSubmittedForm(submittedForm, {
        locationName: (location as any)?.name || null,
        serviceTypeName: serviceName,
      });
    }

    const laborCents = dto.laborCents ?? 0;
    const partsCents = dto.partsCents ?? 0;
    const miscCents = dto.miscCents ?? 0;
    const taxRateBps = dto.taxRateBps ?? (settings?.vatEnabledDefault ? Number(settings.vatRateBpsDefault ?? 0) : 0);
    const currency = settings?.defaultCurrency ?? company.currency ?? "GBP";

    const totals = wheelsEnabled && submittedForm
      ? this.computeWheelsTotals(submittedForm, currency)
      : this.computeTotals({ laborCents, partsCents, miscCents, taxRateBps }, currency);
    if (submittedForm) {
      submittedForm.totalPrice = Number((totals.totalCents / 100).toFixed(2));
      submittedForm.totalPriceCents = totals.totalCents;
    }
    const missingConfiguredFields = this.getMissingRequiredConfiguredFields(
      settings,
      submittedForm,
      selectedServiceType?.id || submittedServiceTypeId,
    );
    if (missingConfiguredFields.length > 0) {
      throw new BadRequestException(`Please complete the required service fields: ${missingConfiguredFields.join(", ")}.`);
    }
    const wheelPricingMode = dto.wheelPricingMode ?? settings?.defaultWheelPricingMode ?? null;
    const whatsappTemplate = dto.whatsappTemplate ?? settings?.whatsappTemplateDefault ?? null;
    const jobType = (submittedForm?.jobType as string | undefined) || dto.jobType || null;
    const tradeCode = (dto.tradeCode || settings?.primaryTrade || null) as string | null;
    const customerName = ((submittedForm?.customerName as string | undefined) || dto.customerName || tradeAccount?.name || "").trim();
    const customerEmail =
      ((submittedForm?.customerEmail as string | undefined) ||
        dto.customerEmail ||
        tradeAccountProfile?.primaryContact.email ||
        tradeAccount?.contactEmail ||
        tradeAccount?.billingEmail ||
        "").trim();
    const customerPhone =
      ((submittedForm?.customerPhone as string | undefined) ||
        dto.customerPhone ||
        tradeAccountProfile?.primaryContact.phone ||
        tradeAccount?.contactPhone ||
        tradeAccount?.contactMobile ||
        tradeAccount?.billingPhone ||
        tradeAccount?.billingMobile ||
        "").trim();
    const customerId = await this.resolveOrCreateCustomerOnClient(tx, companyId, {
      name: customerName || null,
      email: customerEmail || null,
      phone: customerPhone || null,
    });
    const scheduledAtRaw =
      (submittedForm?.scheduledAt as string | undefined) ||
      (submittedForm?.scheduledFor as string | undefined) ||
      dto.scheduledAt ||
      null;
    const scheduledAt =
      scheduledAtRaw && !Number.isNaN(new Date(scheduledAtRaw).getTime())
        ? new Date(scheduledAtRaw)
        : null;

    const jobRef = await this.nextJobRef(tx, companyId);
    const created = await tx.job.create({
      data: {
        companyId,
        locationId: dto.locationId,
        customerId: customerId || null,
        jobRef,
        status: "OPEN",
        customerName,
        customerEmail: customerEmail || null,
        customerPhone: customerPhone || null,
        vehicleMake: (submittedForm?.vehicleMake as string | undefined) || dto.vehicleMake,
        vehicleModel: (submittedForm?.vehicleModel as string | undefined) || dto.vehicleModel,
        vehicleReg: (submittedForm?.vehicleReg as string | undefined) || dto.vehicleReg,
        serviceName,
        wheelPricingMode,
        whatsappTemplate,
        whatsappCompletionLink: (submittedForm?.whatsappCompletionLink as string | undefined) || null,
        invoiceDueAt: dto.invoiceDueAt ? new Date(dto.invoiceDueAt) : null,
        scheduledAt,
        invoiceNumber: (submittedForm?.invoiceNumber as string | undefined) || null,
        tradeCode,
        jobType,
        tradeAccountId: tradeAccount?.id || null,
        createdByUserId: userId,
        formData: submittedForm,
        ...totals,
      },
    });

    return { created, wheelsEnabled, submittedForm };
  }

  private async recordUndo(companyId: string, userId: string, actionType: string, changes: Array<{ id: string; before: any; after: any }>) {
    const db = this.prisma as any;
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

  private async logActivity(companyId: string, jobId: string, actorUserId: string | null, eventType: string, message?: string, payloadJson?: any) {
    const db = this.prisma as any;
    if (!db.jobActivity) return;
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

  private async restrictedLocationId(companyId: string, userId: string) {
    const db = this.prisma as any;
    const me = await db.user.findFirst({
      where: { id: userId, companyId },
      select: { onlyMyLocation: true, defaultLocationId: true },
    });
    if (!me?.onlyMyLocation || !me.defaultLocationId) return null;
    return me.defaultLocationId;
  }

  private maxMediaBytes() {
    const raw = Number(process.env.MYTITAN_JOB_MEDIA_MAX_BYTES || 8 * 1024 * 1024);
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 8 * 1024 * 1024;
  }

  private decodeDataUrl(value: string) {
    const match = value.match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/);
    if (!match) return null;
    const mime = String(match[1] || "").toLowerCase();
    const base64 = match[2] || "";
    const bytes = Buffer.from(base64, "base64").length;
    return { mime, bytes };
  }

  private decodeAttachmentDataUrl(value: string) {
    const match = String(value || "").trim().match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/);
    if (!match) return null;
    const mime = String(match[1] || "application/octet-stream").toLowerCase();
    const contentBase64 = match[2] || "";
    const bytes = Buffer.from(contentBase64, "base64").length;
    return { mime, contentBase64, bytes };
  }

  private validateMediaDataUrl(kind: CreateJobAssetDto["kind"], dataUrl: string) {
    const parsed = this.decodeDataUrl(dataUrl);
    if (!parsed) throw new BadRequestException("Invalid media payload format");
    const maxBytes = this.maxMediaBytes();
    if (parsed.bytes > maxBytes) {
      throw new PayloadTooLargeException({
        statusCode: 413,
        code: "UPLOAD_TOO_LARGE",
        maxBytes,
        maxSize: `${Math.round(maxBytes / 1024 / 1024)} MB`,
        message: `This file is too large. Maximum allowed is ${Math.round(maxBytes / 1024 / 1024)} MB for job-form media.`,
      });
    }
    const imageOk = parsed.mime.startsWith("image/");
    const videoOk = parsed.mime.startsWith("video/");
    if (kind === "TORQUE") {
      if (!imageOk && !videoOk) throw new BadRequestException("Torque evidence must be image or video");
      return parsed;
    }
    if (kind === "BEFORE" || kind === "AFTER" || kind === "SIGN_TECH" || kind === "SIGN_CUSTOMER") {
      if (!imageOk) throw new BadRequestException("Only image media allowed for this field");
      return parsed;
    }
    return parsed;
  }

  private normalizeAssetInput(dto: CreateJobDto, formData?: Record<string, any>, assets?: CreateJobAssetDto[]) {
    const normalized: CreateJobAssetDto[] = Array.isArray(assets) ? [...assets] : [];

    const addMediaPayload = (kind: CreateJobAssetDto["kind"], item: any) => {
      if (!item || typeof item !== "object") return;
      const data = String(item.data || "").trim();
      const mimeType = String(item.mimeType || "").trim().toLowerCase();
      const filename = String(item.filename || "").trim();
      if (!data || !mimeType) return;
      const parsed = this.validateMediaDataUrl(kind, data);
      normalized.push({
        kind,
        dataUrl: data,
        mime: mimeType || parsed.mime,
        bytes: parsed.bytes,
        url: filename || undefined,
      });
    };

    for (const item of Array.isArray(dto.beforeMedia) ? dto.beforeMedia.slice(0, JOB_BEFORE_AFTER_MEDIA_LIMIT) : []) addMediaPayload("BEFORE", item);
    for (const item of Array.isArray(dto.afterMedia) ? dto.afterMedia.slice(0, JOB_BEFORE_AFTER_MEDIA_LIMIT) : []) addMediaPayload("AFTER", item);
    if (dto.torqueEvidenceMedia) addMediaPayload("TORQUE", dto.torqueEvidenceMedia);

    if (!formData) return normalized;

    const addList = (kind: CreateJobAssetDto["kind"], list: any) => {
      if (!Array.isArray(list)) return;
      for (const item of list.slice(0, JOB_BEFORE_AFTER_MEDIA_LIMIT)) {
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

    if (formData.torqueEvidenceMedia && typeof formData.torqueEvidenceMedia === "object") {
      addMediaPayload("TORQUE", formData.torqueEvidenceMedia);
    }
    addList("BEFORE", formData.beforeMedia);
    addList("AFTER", formData.afterMedia);

    return normalized;
  }

  private async persistAssets(jobId: string, payload: CreateJobAssetDto[], companyId: string, userId: string, formData?: Record<string, any>) {
    const db = this.prisma as any;
    for (const asset of payload) {
      const url = (asset.dataUrl || asset.url || "").trim();
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
      if (isMediaSignatureV1Enabled() && db.jobMedia && (asset.kind === "BEFORE" || asset.kind === "AFTER" || asset.kind === "TORQUE")) {
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
      if (isMediaSignatureV1Enabled() && db.jobSignature && (asset.kind === "SIGN_TECH" || asset.kind === "SIGN_CUSTOMER")) {
        await db.jobSignature.upsert({
          where: {
            jobId_signerType: {
              jobId,
              signerType: asset.kind === "SIGN_TECH" ? "TECHNICIAN" : "CUSTOMER",
            },
          },
          update: {
            signerName:
              asset.kind === "SIGN_TECH"
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
            signerName:
              asset.kind === "SIGN_TECH"
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

  private addPdfSection(lines: string[], title: string, rows: Array<{ label: string; value: string }>, options?: { emptyText?: string | null }) {
    if (rows.length === 0) {
      if (options?.emptyText) {
        lines.push(title.toUpperCase());
        lines.push(options.emptyText);
        lines.push("");
      }
      return;
    }
    lines.push(title.toUpperCase());
    rows.forEach((row) => lines.push(`${row.label}: ${row.value}`));
    lines.push("");
  }

  private formatPdfDate(value: Date | string | null | undefined) {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
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
    const job = await db.job.findFirst({
      where: { id: jobId, companyId },
      include: {
        company: true,
        tradeAccount: true,
      },
    });
    if (!job) throw new NotFoundException("Job not found");

    const assets = await db.jobAsset.findMany({ where: { jobId }, orderBy: { createdAt: "asc" } });
    const signatures = db.jobSignature
      ? await db.jobSignature.findMany({ where: { jobId }, orderBy: { updatedAt: "desc" } })
      : [];
    const settings = await db.tenantSetting.findUnique({ where: { tenantId: companyId } });
    const token = await db.$transaction((tx: any) => this.ensurePublicToken(tx, job.id));
    const pdfUrl = `/public/job/${token.token}/pdf`;
    const apiPublic = getApiPublicUrl();
    const appPublic = getAppPublicUrl();
    const portalUrl = buildAppUrl(`/portal/job/${token.token}`);
    const publicPdfUrl = buildApiUrl(pdfUrl);

    const before = assets.filter((a: any) => a.kind === "BEFORE").map((a: any) => a.url);
    const after = assets.filter((a: any) => a.kind === "AFTER").map((a: any) => a.url);
    const torque = assets.filter((a: any) => a.kind === "TORQUE").map((a: any) => a.url);
    const techSign =
      signatures.find((a: any) => a.signerType === "TECHNICIAN")?.dataUrl ||
      assets.find((a: any) => a.kind === "SIGN_TECH")?.url ||
      "";
    const customerSign =
      signatures.find((a: any) => a.signerType === "CUSTOMER")?.dataUrl ||
      assets.find((a: any) => a.kind === "SIGN_CUSTOMER")?.url ||
      "";

    const formData = (job.formData || {}) as Record<string, any>;
    const customerProfile = resolveCustomerOutputFields({
      job,
      tradeAccount: job.tradeAccount || null,
      formData,
    });
    const customerPresentation = buildCustomerOutputPresentation(customerProfile);
    const serviceRecordSettings = getServiceRecordEmailSettings(settings);
    const workspaceName = settings?.companyName || job.company?.name || "MyTitan";
    const jobDate = this.formatPdfDate(formData.jobDate || job.createdAt) || "Not recorded";
    const completedDate = this.formatPdfDate(formData.completedDate || job.completedAt) || null;
    const wheelPositions = this.wheelPositionsFromForm(formData);
    const serviceTypes = this.normalizeStringList(formData.serviceTypes || formData.services);
    const additionalServicePriceLabel =
      this.asNumber(formData.additionalServicePrice, 0) > 0
        ? new Intl.NumberFormat("en-GB", { style: "currency", currency: String(job.currency || formData.currency || "GBP") }).format(this.asNumber(formData.additionalServicePrice, 0))
        : null;
    const completionOverview = buildJobCompletionOverview({
      job: {
        ...job,
        invoicePdfUrl: pdfUrl,
        whatsappCompletionLink: portalUrl,
      },
      formData,
      workspaceName,
      apiPublicUrl: apiPublic,
      appPublicUrl: appPublic,
    });
    const documentSummary = [
      { label: "Job type", value: job.jobType || formData.jobType || "Service job" },
      { label: "Created", value: jobDate },
      ...(completedDate ? [{ label: "Completed", value: completedDate }] : []),
      ...(settings?.businessDisplayJson?.jobSheets === false && settings?.businessDisplayJson?.invoices === false
        ? []
        : [
            ...(settings?.registeredBusinessName ? [{ label: "Registered business", value: settings.registeredBusinessName }] : []),
            ...(settings?.companyNumber ? [{ label: "Company number", value: settings.companyNumber }] : []),
            ...(settings?.taxRegistrationNumber ? [{ label: "Tax registration", value: settings.taxRegistrationNumber }] : []),
            ...([settings?.businessAddressLine1, settings?.businessAddressLine2, settings?.businessCity, settings?.businessPostcode, settings?.businessCountry].filter(Boolean).length
              ? [{ label: "Business address", value: [settings?.businessAddressLine1, settings?.businessAddressLine2, settings?.businessCity, settings?.businessPostcode, settings?.businessCountry].filter(Boolean).join(", ") }]
              : []),
          ]),
    ];
    const jobSummary = [
      ...(formData.siteLocation ? [{ label: "Site location", value: String(formData.siteLocation) }] : []),
      ...(formData.vehicleMake ? [{ label: "Vehicle make", value: String(formData.vehicleMake) }] : []),
      ...(formData.vehicleModel ? [{ label: "Vehicle model", value: String(formData.vehicleModel) }] : []),
      ...(formData.vehicleColour ? [{ label: "Vehicle colour", value: String(formData.vehicleColour) }] : []),
      ...(formData.registration || formData.vehicleReg
        ? [{ label: "Registration", value: String(formData.registration || formData.vehicleReg) }]
        : []),
      ...(wheelPositions.length ? [{ label: "Wheel positions", value: wheelPositions.join(", ") }] : []),
      ...(formData.looseWheels ? [{ label: "Loose wheels", value: String(formData.looseWheels) }] : []),
      ...(serviceTypes.length ? [{ label: "Service types", value: serviceTypes.join(", ") }] : []),
      ...(formData.additionalServicesText ? [{ label: "Additional services", value: String(formData.additionalServicesText) }] : []),
      ...(additionalServicePriceLabel ? [{ label: "Additional service price", value: additionalServicePriceLabel }] : []),
      ...(this.asNumber(formData.pricePerWheel, 0) > 0 ? [{ label: "Price per wheel", value: `${this.asNumber(formData.pricePerWheel, 0)}` }] : []),
      ...(this.asNumber(formData.numberOfWheels, this.asNumber(formData.wheelCount, 0)) > 0
        ? [{ label: "Number of wheels", value: `${this.asNumber(formData.numberOfWheels, this.asNumber(formData.wheelCount, 0))}` }]
        : []),
      ...(completionOverview.paymentAmountLabel ? [{ label: "Total price", value: completionOverview.paymentAmountLabel }] : []),
      ...(formData.torqueSetting ? [{ label: "Torque setting", value: String(formData.torqueSetting) }] : []),
      ...(formData.tyrePressure ? [{ label: "Tyre pressure", value: String(formData.tyrePressure) }] : []),
      ...(formData.customerNotes || formData.jobNotes
        ? [{ label: "Customer / job notes", value: String(formData.customerNotes || formData.jobNotes) }]
        : []),
    ];
    const evidenceSummary = [
      { label: "Before photos", value: before.length ? `${before.length} captured` : "None published" },
      { label: "After photos", value: after.length ? `${after.length} captured` : "None published" },
      { label: "Torque proof", value: torque.length ? `${torque.length} item${torque.length === 1 ? "" : "s"} captured` : formData.torqueEvidenceLink ? "External proof link recorded" : "None published" },
    ];
    const signatureSummary = [
      ...(formData.technicianSignatureName || formData.technicianName
        ? [{ label: "Completing user sign-off", value: String(formData.technicianSignatureName || formData.technicianName) }]
        : []),
      ...(techSign ? [{ label: "Completing user signature image", value: "Captured" }] : []),
      ...(job.signatureName || formData.customerSignatureName
        ? [{ label: "Customer sign-off", value: String(job.signatureName || formData.customerSignatureName) }]
        : []),
      ...((job.signedAt || customerSign) ? [{ label: "Customer signature image", value: customerSign ? "Captured" : "Pending" }] : []),
    ];
    const serviceRecordContent = buildServiceRecordEmailContent({
      overview: completionOverview,
      workspaceName,
      customerPresentation: {
        businessDetails: [...customerPresentation.businessDetails, ...documentSummary],
        contactDetails: customerPresentation.contactDetails,
        billingDetails: customerPresentation.billingDetails,
      },
      serviceSummaryRows: jobSummary,
      evidenceSummaryRows: evidenceSummary,
      signatureSummaryRows: signatureSummary,
      feedbackRequest: getCustomerFeedbackSettings(settings),
      policy: {
        includeBusinessDetails: serviceRecordSettings.includeBusinessDetails,
        includeContactDetails: serviceRecordSettings.includeContactDetails,
        includeBillingDetails: serviceRecordSettings.includeBillingDetails,
        includePaymentSummary: serviceRecordSettings.includePaymentSummary,
        includeEvidenceSummary: serviceRecordSettings.includeEvidenceSummary,
        includeSignatureSummary: serviceRecordSettings.includeSignatureSummary,
        includePortalLink: serviceRecordSettings.includePortalLink,
        includePdfLink: serviceRecordSettings.includePdfLink,
        signatureEnabled: false,
      },
    });

    const lines: string[] = [];
    lines.push(workspaceName);
    lines.push("Customer service record");
    lines.push("----------------------------------------");
    lines.push("");
    for (const section of serviceRecordContent.sections) {
      this.addPdfSection(lines, section.title, section.rows, {
        emptyText: section.key === "signatures" ? "No signatures captured yet." : undefined,
      });
    }
    if (torque.length > 0 || formData.torqueEvidenceLink) {
      lines.push("TORQUE EVIDENCE");
      torque.forEach((value) => {
        lines.push(value.startsWith("data:video/") ? "Video evidence captured" : "Image evidence captured");
      });
      if (formData.torqueEvidenceLink) {
        lines.push("External evidence link recorded");
      }
      lines.push("");
    }

    const pdfBuffer = this.createSimplePdf(lines);

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

    await db.job.update({ where: { id: job.id }, data: { invoicePdfUrl: pdfUrl, whatsappCompletionLink: portalUrl } });
    await this.audit.log(companyId, "job.pdf.generated", `Generated Wheels PDF for ${job.jobRef || job.id}`, userId);

    return { url: pdfUrl, pdfUrl: publicPdfUrl, portalUrl, generatedAt: new Date().toISOString() };
  }

  async create(companyId: string, userId: string, dto: CreateJobDto) {
    const db = this.prisma as any;
    const { created, wheelsEnabled, submittedForm } = await db.$transaction((tx: any) =>
      this.createCoreJobRecord(tx, companyId, userId, dto),
    );

    await this.audit.log(companyId, "job.create", `Created job ${created.jobRef ?? created.id}`, userId);
    await this.logActivity(companyId, created.id, userId, "job.create", `Job ${created.jobRef ?? created.id} created`);
    await this.emitJobActivity(
      "job.created",
      created,
      `Job ${created.jobRef ?? created.id} created`,
    );
    await this.maybeRunContactGapAutomation(companyId, userId, created.id);
    await this.automations.evaluateRuleTrigger(companyId, "job.created", {
      actorUserId: userId,
      jobId: created.id,
      jobRef: created.jobRef || null,
      customerId: created.customerId || null,
      customerName: created.customerName || null,
      status: created.status || null,
      assignedUserId: created.assignedUserId || null,
      invoiceIssuedAt: created.invoiceIssuedAt || null,
      invoicePaidAt: created.invoicePaidAt || null,
    });
    await this.compliance.evaluateSlaTransition({
      tenantId: companyId,
      actorUserId: userId,
      entityType: "JOB",
      entityId: created.id,
      currentStatus: created.status || "OPEN",
      locationId: created.locationId || null,
      assignedUserId: created.assignedUserId || null,
      customerId: created.customerId || null,
      customerName: created.customerName || null,
      jobId: created.id,
      jobRef: created.jobRef || null,
      label: created.jobRef || created.id,
    });
    await this.compliance.syncSlaForEntity(companyId, "JOB", created.id);

    if (wheelsEnabled && submittedForm) {
      await this.templatesService.ensureWheelsDefaultTemplate();
    }

    const normalizedAssets = this.normalizeAssetInput(dto, submittedForm || undefined, dto.assets);
    if (normalizedAssets.length > 0) {
      await this.persistAssets(created.id, normalizedAssets, companyId, userId, submittedForm || undefined);
    }

    let pdf: { url: string; generatedAt: string; pdfUrl?: string; portalUrl?: string } | null = null;
    if (wheelsEnabled && submittedForm) {
      pdf = await this.buildAndStorePdf(companyId, userId, created.id);
    }

    const submissionWarnings: string[] = [];
    const partAllocations: any[] = [];
    for (const allocation of Array.isArray(dto.partAllocations) ? dto.partAllocations : []) {
      const stockItemId = String(allocation?.stockItemId || "").trim();
      const quantity = Number(allocation?.quantity || 0);
      if (!stockItemId || quantity <= 0) continue;
      try {
        const result = await this.inventory.allocateToJob(companyId, userId, stockItemId, {
          jobId: created.id,
          qty: quantity,
          locationId: allocation.locationId || undefined,
          reason: allocation.reason || "Allocated from submitted job sheet",
        });
        partAllocations.push(result);
      } catch (error: any) {
        submissionWarnings.push(
          `Stock for ${stockItemId} could not be allocated: ${error?.message || "Unknown inventory error"}.`,
        );
      }
    }

    let finalJob = created;
    if (dto.completeAfterCreate) {
      try {
        finalJob = await this.completeSubmittedJobSheet(companyId, userId, created.id);
      } catch (error: any) {
        submissionWarnings.push(
          `The job sheet was saved, but completion could not be finalized: ${error?.message || "Unknown status error"}.`,
        );
      }
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
      ...finalJob,
      pdf,
      partAllocations,
      submissionWarnings,
    };
  }

  list(companyId: string, locationId?: string, options?: { includeArchived?: boolean; assignedUserId?: string | null }) {
    const db = this.prisma as any;
    return db.job.findMany({
      where: {
        companyId,
        ...this.buildVisibilityWhere({ includeArchived: options?.includeArchived === true }),
        ...(locationId && locationId !== 'all' ? { locationId } : {}),
        ...(options?.assignedUserId ? { assignedUserId: options.assignedUserId } : {}),
      },
      include: { archivePeriod: { select: { id: true, name: true, status: true } } },
      orderBy: { createdAt: "desc" },
    }).then(async (jobs: any[]) => {
      const settings = await this.getWorkflowSettings(db, companyId);
      return Promise.all(jobs.map((job) => this.decorateJobWithWorkflowReadiness(db, companyId, job, settings)));
    });
  }

  async getById(companyId: string, id: string, assignedUserId?: string | null) {
    const db = this.prisma as any;
    await this.compliance.syncSlaForEntity(companyId, "JOB", id);
    const job = await db.job.findFirst({
      where: { id, companyId, deletedAt: null, ...(assignedUserId ? { assignedUserId } : {}) },
      include: {
        assets: true,
        pdf: true,
        lineItems: { orderBy: { createdAt: "asc" } },
        _count: {
          select: {
            assets: true,
            bookings: true,
            executionEvidence: true,
            executionRecords: true,
            publicTokens: true,
            signatures: true,
          },
        },
      },
    });
    if (!job) {
      throw new NotFoundException("Job not found");
    }
    const settings = await this.getWorkflowSettings(db, companyId);
    return this.decorateJobWithWorkflowReadiness(db, companyId, job, settings);
  }

  async generatePdf(companyId: string, userId: string, id: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!job) {
      throw new NotFoundException("Job not found");
    }
    return this.buildAndStorePdf(companyId, userId, id);
  }

  async getMapLinks(companyId: string, id: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        location: {
          select: {
            name: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            postalCode: true,
            country: true,
          },
        },
      },
    });
    if (!job) {
      throw new NotFoundException("Job not found");
    }
    const formData = job.formData && typeof job.formData === "object" ? job.formData : {};
    const customerAddress = buildAddressText({
      freeform: (formData as any).customerAddress,
      line1: (formData as any).addressLine1,
      line2: (formData as any).addressLine2,
      city: (formData as any).city || (formData as any).town,
      postcode: (formData as any).postcode,
      country: (formData as any).country,
    });
    const businessAddress = buildAddressText({
      line1: job.location?.addressLine1,
      line2: job.location?.addressLine2,
      city: job.location?.city,
      state: job.location?.state,
      postalCode: job.location?.postalCode,
      country: job.location?.country,
    });
    return {
      ok: true,
      jobId: job.id,
      jobRef: job.jobRef,
      liveTrackingEnabled: false,
      geocodeProviderConfigured: Boolean(String(process.env.GOOGLE_MAPS_API_KEY || process.env.MAPS_API_KEY || "").trim()),
      customerDirections: buildMapLinks(customerAddress),
      businessLocation: buildMapLinks(businessAddress),
    };
  }

  async shareJobSheet(companyId: string, userId: string, id: string, dto: ShareJobSheetDto) {
    const db = this.prisma as any;
    const recipientEmail = String(dto?.recipientEmail || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      throw new BadRequestException("Valid recipient email is required");
    }
    const job = await db.job.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        pdf: true,
        assets: true,
        executionRecords: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!job) {
      throw new NotFoundException("Job not found");
    }
    const documentArtifactIds = Array.from(new Set((dto.documentArtifactIds || []).map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 30);
    const jobAssetIds = Array.from(new Set((dto.jobAssetIds || []).map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 30);
    const [artifacts, selectedAssets] = await Promise.all([
      documentArtifactIds.length
        ? db.documentArtifact.findMany({
            where: {
              id: { in: documentArtifactIds },
              tenantId: companyId,
              entityType: "JOB",
              entityId: job.id,
            },
            select: { id: true, kind: true, label: true, fileName: true, mimeType: true, sizeBytes: true, portalVisible: true },
          })
        : [],
      jobAssetIds.length
        ? db.jobAsset.findMany({
            where: { id: { in: jobAssetIds }, jobId: job.id },
            select: { id: true, kind: true, url: true, mime: true, bytes: true, createdAt: true },
          })
        : [],
    ]);
    if (artifacts.length !== documentArtifactIds.length || selectedAssets.length !== jobAssetIds.length) {
      throw new BadRequestException("One or more selected documents are not available for this job");
    }
    const pdf = dto.includePdf === false
      ? job.pdf
      : job.pdf || (await this.buildAndStorePdf(companyId, userId, job.id));
    const pdfRecord = dto.includePdf === false
      ? job.pdf
      : await db.jobPdf.findUnique({ where: { jobId: job.id }, select: { url: true, contentBase64: true } }).catch(() => job.pdf);
    const maxAttachmentBytes = Number(process.env.MYTITAN_EMAIL_ATTACHMENT_MAX_BYTES || 10 * 1024 * 1024);
    const maxTotalAttachmentBytes = Number(process.env.MYTITAN_EMAIL_ATTACHMENT_TOTAL_MAX_BYTES || 15 * 1024 * 1024);
    const attachments: Array<{ filename: string; contentBase64: string; contentType?: string | null; sizeBytes?: number | null }> = [];
    let totalAttachmentBytes = 0;
    const skippedAttachmentReasons: string[] = [];
    const addAttachment = (attachment: { filename: string; contentBase64: string; contentType?: string | null; sizeBytes?: number | null }, sourceLabel: string) => {
      const sizeBytes = Number(attachment.sizeBytes || Buffer.from(attachment.contentBase64 || "", "base64").length || 0);
      if (!attachment.contentBase64 || sizeBytes <= 0) {
        skippedAttachmentReasons.push(`${sourceLabel}: no binary content available`);
        return;
      }
      if (sizeBytes > maxAttachmentBytes) {
        skippedAttachmentReasons.push(`${sourceLabel}: exceeds per-file attachment limit`);
        return;
      }
      if (totalAttachmentBytes + sizeBytes > maxTotalAttachmentBytes) {
        skippedAttachmentReasons.push(`${sourceLabel}: exceeds total attachment limit`);
        return;
      }
      totalAttachmentBytes += sizeBytes;
      attachments.push({ ...attachment, sizeBytes });
    };
    if (dto.includePdf !== false && pdfRecord?.contentBase64) {
      addAttachment({
        filename: `${String(job.jobRef || job.id).replace(/[^a-zA-Z0-9._-]/g, "_")}-job-sheet.pdf`,
        contentBase64: pdfRecord.contentBase64,
        contentType: "application/pdf",
      }, "job sheet PDF");
    }
    for (const asset of selectedAssets) {
      const decoded = this.decodeAttachmentDataUrl(asset.url);
      if (!decoded) {
        skippedAttachmentReasons.push(`${asset.kind || "media"} ${asset.id}: binary not available from safe local payload`);
        continue;
      }
      addAttachment({
        filename: `${String(asset.kind || "evidence").toLowerCase()}-${asset.id}.${decoded.mime.includes("png") ? "png" : decoded.mime.includes("webp") ? "webp" : "jpg"}`,
        contentBase64: decoded.contentBase64,
        contentType: decoded.mime,
        sizeBytes: decoded.bytes,
      }, `${asset.kind || "media"} ${asset.id}`);
    }
    for (const artifact of artifacts) {
      skippedAttachmentReasons.push(`${artifact.kind || "document"} ${artifact.id}: stored as managed document reference; manifest included`);
    }
    const safeDocumentLines = [
      ...artifacts.map((artifact: any) => `${artifact.kind}: ${artifact.label || artifact.fileName || artifact.id}`),
      ...selectedAssets.map((asset: any) => `${asset.kind}: ${asset.mime || "job evidence"} (${Number(asset.bytes || 0)} bytes)`),
    ];
    const pdfUrl = typeof pdf?.pdfUrl === "string" ? pdf.pdfUrl : typeof pdf?.url === "string" ? pdf.url : job.pdf?.url || null;
    const subject = `Job sheet ${job.jobRef || job.id}`;
    const intro = String(dto.message || "").trim().slice(0, 1000);
    const lines = [
      intro || `A completed job sheet has been shared for ${job.jobRef || job.id}.`,
      "",
      `Customer: ${job.customerName || "Customer"}`,
      `Status: ${job.status}`,
      job.completedAt ? `Completed: ${new Date(job.completedAt).toISOString()}` : null,
      pdfUrl ? `PDF: ${pdfUrl}` : "PDF: not generated",
      safeDocumentLines.length ? "" : null,
      safeDocumentLines.length ? "Selected supporting evidence:" : null,
      ...safeDocumentLines.map((line) => `- ${line}`),
    ].filter((line): line is string => line !== null);
    const result = await this.email.sendOperationalEmail(
      companyId,
      {
        to: recipientEmail,
        subject,
        text: lines.join("\n"),
        html: `<p>${lines.map((line) => line.replace(/[<>&]/g, (char) => (char === "<" ? "&lt;" : char === ">" ? "&gt;" : "&amp;"))).join("<br />")}</p>`,
        attachments,
      },
      {
        actorUserId: userId,
        category: "job_sheet_share",
        templateKey: "job_sheet.third_party_share",
        dedupeWindowMinutes: 10,
      },
    );
    await this.audit.log(
      companyId,
      "job.sheet.share",
      `Shared job sheet ${job.jobRef || job.id} with ${recipientEmail}; docs=${artifacts.length}; assets=${selectedAssets.length}; status=${result.status}`,
      userId,
    );
    return {
      ok: true,
      jobId: job.id,
      recipientEmail,
      delivery: result,
      selectedDocuments: artifacts.length,
      selectedMedia: selectedAssets.length,
      pdfIncluded: Boolean(pdfUrl && dto.includePdf !== false),
      attachmentsSupported: attachments.length > 0 && ["sent", "captured"].includes(result.status),
      attachmentMode: attachments.length
        ? result.attachmentCapability === "supported"
          ? "binary_attachments"
          : result.attachmentCapability === "safe_capture"
            ? "binary_attachments_captured"
            : "binary_attachments_not_configured"
        : "manifest_and_existing_pdf_link",
      attachmentCapability: result.attachmentCapability || (attachments.length ? "not_configured" : "not_configured"),
      requestedAttachments: {
        pdf: dto.includePdf !== false,
        documents: artifacts.length,
        media: selectedAssets.length,
      },
      binaryAttachmentsPrepared: attachments.length,
      binaryAttachmentBytes: totalAttachmentBytes,
      skippedAttachmentReasons,
    };
  }

  private async completeSubmittedJobSheet(companyId: string, userId: string, id: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!job) {
      throw new NotFoundException("Job not found");
    }

    const settings = await this.getWorkflowSettings(db, companyId);
    if (job.status === "COMPLETED") {
      return this.decorateJobWithWorkflowReadiness(db, companyId, job, settings);
    }
    await this.assertCompletionAllowanceAvailable(db, companyId, job);

    const updated = await db.job.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: job.completedAt || new Date(),
      },
    });

    await this.audit.log(companyId, "job.status", `Job ${job.jobRef ?? job.id} status changed ${job.status} -> COMPLETED`, userId);
    await this.logActivity(companyId, job.id, userId, "job.status", `${job.status} -> COMPLETED`, {
      reason: "job_sheet_submission",
    });
    await this.notifications.notifyJobCompleted(companyId, job.id);
    await this.emitJobActivity(
      "job.status_changed",
      updated,
      `Job ${updated?.jobRef || updated?.id || id} moved to COMPLETED`,
    );
    await this.emitJobActivity(
      "job.completed",
      updated,
      `Job ${updated?.jobRef || updated?.id || id} completed`,
    );
    await this.maybeRunCompletionAutomation(companyId, userId, job, updated);
    await this.automations.evaluateRuleTrigger(companyId, "job.completed", {
      actorUserId: userId,
      jobId: updated.id,
      jobRef: updated.jobRef || null,
      customerId: updated.customerId || null,
      customerName: updated.customerName || null,
      status: updated.status || null,
      assignedUserId: updated.assignedUserId || null,
      invoiceIssuedAt: updated.invoiceIssuedAt || null,
      invoicePaidAt: updated.invoicePaidAt || null,
    });
    await this.compliance.evaluateSlaTransition({
      tenantId: companyId,
      actorUserId: userId,
      entityType: "JOB",
      entityId: updated.id,
      previousStatus: job.status,
      currentStatus: updated.status,
      locationId: updated.locationId || null,
      assignedUserId: updated.assignedUserId || null,
      customerId: updated.customerId || null,
      customerName: updated.customerName || null,
      jobId: updated.id,
      jobRef: updated.jobRef || null,
      label: updated.jobRef || updated.id,
    });
    await this.compliance.syncSlaForEntity(companyId, "JOB", updated.id);
    return this.decorateJobWithWorkflowReadiness(db, companyId, updated, settings);
  }

  async updateStatus(companyId: string, userId: string, id: string, newStatus: JobStatus) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id, companyId, deletedAt: null } });
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
    const settings = await this.getWorkflowSettings(db, companyId);
    await this.ensureJobStageReady(db, companyId, job.id, newStatus, `move the job to ${newStatus}`, settings);
    if (newStatus === "COMPLETED") {
      await this.assertCompletionAllowanceAvailable(db, companyId, job);
    }

    const updated = await db.job.update({
      where: { id: job.id },
      data: {
        status: newStatus,
        completedAt: newStatus === "COMPLETED" ? new Date() : (newStatus === "INVOICED" ? (job.completedAt || new Date()) : null),
        invoiceIssuedAt: newStatus === "INVOICED" ? new Date() : job.invoiceIssuedAt,
        cancelledAt: newStatus === "CANCELLED" ? (job.cancelledAt || new Date()) : job.cancelledAt,
        cancelledByUserId: newStatus === "CANCELLED" ? (job.cancelledByUserId || userId) : job.cancelledByUserId,
      },
    });

    await this.audit.log(companyId, "job.status", `Job ${job.jobRef ?? job.id} status changed ${job.status} -> ${newStatus}`, userId);
    await this.logActivity(companyId, job.id, userId, "job.status", `${job.status} -> ${newStatus}`);
    if (newStatus === "COMPLETED" && isNotificationsV1Enabled()) {
      await this.notifications.notifyJobCompleted(companyId, job.id);
    }
    if (newStatus === "COMPLETED" && isAutomationsV1Enabled()) {
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

    await this.emitJobActivity(
      "job.status_changed",
      updated,
      `Job ${updated?.jobRef || updated?.id || id} moved to ${newStatus}`,
    );
    await this.maybeRunCompletionAutomation(companyId, userId, job, updated);
    if (newStatus === "COMPLETED") {
      await this.emitJobActivity(
        "job.completed",
        updated,
        `Job ${updated?.jobRef || updated?.id || id} completed`,
      );
      await this.automations.evaluateRuleTrigger(companyId, "job.completed", {
        actorUserId: userId,
        jobId: updated.id,
        jobRef: updated.jobRef || null,
        customerId: updated.customerId || null,
        customerName: updated.customerName || null,
        status: updated.status || null,
        assignedUserId: updated.assignedUserId || null,
        invoiceIssuedAt: updated.invoiceIssuedAt || null,
        invoicePaidAt: updated.invoicePaidAt || null,
      });
    }

    await this.compliance.evaluateSlaTransition({
      tenantId: companyId,
      actorUserId: userId,
      entityType: "JOB",
      entityId: updated.id,
      previousStatus: job.status,
      currentStatus: updated.status,
      locationId: updated.locationId || null,
      assignedUserId: updated.assignedUserId || null,
      customerId: updated.customerId || null,
      customerName: updated.customerName || null,
      jobId: updated.id,
      jobRef: updated.jobRef || null,
      label: updated.jobRef || updated.id,
    });
    await this.compliance.syncSlaForEntity(companyId, "JOB", updated.id);

    return this.decorateJobWithWorkflowReadiness(db, companyId, updated, settings);
  }

  async complete(companyId: string, userId: string, id: string) {
    return this.updateStatus(companyId, userId, id, "COMPLETED");
  }

  async cancel(companyId: string, userId: string, id: string, reason?: string | null) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!job) {
      throw new NotFoundException("Job not found");
    }

    if (job.archivedAt) {
      throw new BadRequestException("Restore the job before cancelling it");
    }
    if (job.status === "CANCELLED") {
      const settings = await this.getWorkflowSettings(db, companyId);
      return this.decorateJobWithWorkflowReadiness(db, companyId, job, settings);
    }
    if (!["DRAFT", "OPEN", "SCHEDULED", "IN_PROGRESS"].includes(String(job.status || "").toUpperCase())) {
      throw new BadRequestException("Only active jobs can be cancelled");
    }
    if (job.invoiceIssuedAt || job.invoicePaidAt) {
      throw new BadRequestException("This job already has billing history and cannot be cancelled");
    }

    const updated = await db.job.update({
      where: { id: job.id },
      data: {
        status: "CANCELLED",
        cancelledAt: job.cancelledAt || new Date(),
        cancelledByUserId: userId,
        cancellationReason: String(reason || "").trim() || null,
      },
    });
    const settings = await this.getWorkflowSettings(db, companyId);
    await this.audit.log(companyId, "job.cancel", `Job ${job.jobRef ?? job.id} cancelled`, userId);
    await this.logActivity(companyId, job.id, userId, "job.cancelled", "Job cancelled", {
      previousStatus: job.status,
      reason: String(reason || "").trim() || null,
    });
    await this.emitJobActivity("job.cancelled", updated, `Job ${updated?.jobRef || updated?.id || id} cancelled`);
    await this.compliance.evaluateSlaTransition({
      tenantId: companyId,
      actorUserId: userId,
      entityType: "JOB",
      entityId: updated.id,
      previousStatus: job.status,
      currentStatus: updated.status,
      locationId: updated.locationId || null,
      assignedUserId: updated.assignedUserId || null,
      customerId: updated.customerId || null,
      customerName: updated.customerName || null,
      jobId: updated.id,
      jobRef: updated.jobRef || null,
      label: updated.jobRef || updated.id,
    });
    await this.compliance.syncSlaForEntity(companyId, "JOB", updated.id);
    return this.decorateJobWithWorkflowReadiness(db, companyId, updated, settings);
  }

  async listArchivePeriods(companyId: string) {
    const db = this.prisma as any;
    return db.archivePeriod.findMany({
      where: { tenantId: companyId },
      include: {
        _count: { select: { jobs: true } },
      },
      orderBy: [{ status: "asc" }, { fromDate: "desc" }],
    });
  }

  async createArchivePeriod(
    companyId: string,
    userId: string,
    input: { name: string; fromDate: string; toDate: string; scope?: string },
  ) {
    const db = this.prisma as any;
    const name = String(input.name || "").trim();
    const fromDate = new Date(input.fromDate);
    const toDate = new Date(input.toDate);
    if (!name) throw new BadRequestException("Archive period name is required");
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate < fromDate) {
      throw new BadRequestException("Choose a valid archive date range");
    }
    toDate.setUTCHours(23, 59, 59, 999);
    const created = await db.archivePeriod.create({
      data: {
        tenantId: companyId,
        name,
        fromDate,
        toDate,
        scope: ["JOBS", "INVOICES", "JOBS_AND_INVOICES"].includes(String(input.scope || ""))
          ? input.scope
          : "JOBS_AND_INVOICES",
        createdByUserId: userId,
      },
    }).catch((error: any) => {
      if (String(error?.code || "") === "P2002") throw new BadRequestException("An archive period with this name already exists");
      throw error;
    });
    await this.audit.log(companyId, "archive_period.create", `Archive period ${name} created for ${fromDate.toISOString()} to ${toDate.toISOString()}`, userId);
    return created;
  }

  async closeArchivePeriod(companyId: string, userId: string, periodId: string) {
    const db = this.prisma as any;
    const period = await db.archivePeriod.findFirst({ where: { id: periodId, tenantId: companyId } });
    if (!period) throw new NotFoundException("Archive period not found");
    if (period.status === "CLOSED") return period;
    const updated = await db.archivePeriod.update({
      where: { id: period.id },
      data: { status: "CLOSED", closedAt: new Date(), closedByUserId: userId },
    });
    await this.audit.log(companyId, "archive_period.close", `Archive period ${period.name} closed`, userId);
    return updated;
  }

  private async requireOpenArchivePeriod(db: any, companyId: string, periodId: string) {
    const period = await db.archivePeriod.findFirst({ where: { id: periodId, tenantId: companyId } });
    if (!period) throw new NotFoundException("Archive period not found");
    if (period.status !== "OPEN") throw new BadRequestException("Choose an open archive period");
    return period;
  }

  async archiveSelectedToPeriod(companyId: string, userId: string, periodId: string, jobIds: string[]) {
    const db = this.prisma as any;
    const ids = Array.from(new Set((jobIds || []).map(String).filter(Boolean)));
    if (!ids.length) throw new BadRequestException("Select at least one job or invoice");
    const period = await this.requireOpenArchivePeriod(db, companyId, periodId);
    const jobs = await db.job.findMany({ where: { id: { in: ids }, companyId, deletedAt: null } });
    if (jobs.length !== ids.length) throw new BadRequestException("One or more selected records are unavailable");
    const blocked = jobs.filter((job: any) => !job.archivedAt && !this.buildLifecycleState(job).canArchive);
    if (blocked.length) throw new BadRequestException("Only completed, invoiced, paid, or cancelled records can be archived");
    await db.$transaction(
      jobs.map((job: any) => db.job.update({
        where: { id: job.id },
        data: { archivedAt: job.archivedAt || new Date(), archivedByUserId: userId, archivePeriodId: period.id },
      })),
    );
    await this.audit.log(
      companyId,
      "archive_period.records_added",
      `${jobs.length} records archived into ${period.name}. Before=${JSON.stringify(jobs.map((job: any) => ({ id: job.id, archivedAt: job.archivedAt, archivePeriodId: job.archivePeriodId })))} After=${JSON.stringify(jobs.map((job: any) => ({ id: job.id, archivePeriodId: period.id })))}`,
      userId,
    );
    return { ok: true, archived: jobs.length, periodId: period.id };
  }

  async archiveByPeriodDateRange(companyId: string, userId: string, periodId: string) {
    const db = this.prisma as any;
    const period = await this.requireOpenArchivePeriod(db, companyId, periodId);
    const dateField = period.scope === "INVOICES" ? "invoiceIssuedAt" : "createdAt";
    const jobs = await db.job.findMany({
      where: {
        companyId,
        deletedAt: null,
        archivedAt: null,
        [dateField]: { gte: period.fromDate, lte: period.toDate },
      },
    });
    const eligible = jobs.filter((job: any) => this.buildLifecycleState(job).canArchive);
    if (eligible.length) {
      await db.$transaction(
        eligible.map((job: any) => db.job.update({
          where: { id: job.id },
          data: { archivedAt: new Date(), archivedByUserId: userId, archivePeriodId: period.id },
        })),
      );
    }
    await this.audit.log(companyId, "archive_period.date_range", `${eligible.length} records archived into ${period.name} by date range`, userId);
    return { ok: true, archived: eligible.length, considered: jobs.length, periodId: period.id };
  }

  async archive(companyId: string, userId: string, id: string, archivePeriodId?: string | null) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!job) {
      throw new NotFoundException("Job not found");
    }
    if (job.archivedAt) {
      const settings = await this.getWorkflowSettings(db, companyId);
      return this.decorateJobWithWorkflowReadiness(db, companyId, job, settings);
    }

    const lifecycle = this.buildLifecycleState(job);
    if (!lifecycle.canArchive) {
      throw new BadRequestException("Only completed, invoiced, paid, or cancelled jobs can be archived");
    }

    const period = archivePeriodId ? await this.requireOpenArchivePeriod(db, companyId, archivePeriodId) : null;
    const updated = await db.job.update({
      where: { id: job.id },
      data: {
        archivedAt: new Date(),
        archivedByUserId: userId,
        archivePeriodId: period?.id || null,
      },
    });
    const settings = await this.getWorkflowSettings(db, companyId);
    await this.audit.log(companyId, "job.archive", `Job ${job.jobRef ?? job.id} archived`, userId);
    await this.logActivity(companyId, job.id, userId, "job.archived", "Job archived");
    await this.emitJobActivity("job.archived", updated, `Job ${updated?.jobRef || updated?.id || id} archived`);
    return this.decorateJobWithWorkflowReadiness(db, companyId, updated, settings);
  }

  async unarchive(companyId: string, userId: string, id: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!job) {
      throw new NotFoundException("Job not found");
    }
    if (!job.archivedAt) {
      const settings = await this.getWorkflowSettings(db, companyId);
      return this.decorateJobWithWorkflowReadiness(db, companyId, job, settings);
    }

    const updated = await db.job.update({
      where: { id: job.id },
      data: {
        archivedAt: null,
        archivedByUserId: null,
        archivePeriodId: null,
      },
    });
    const settings = await this.getWorkflowSettings(db, companyId);
    await this.audit.log(companyId, "job.unarchive", `Job ${job.jobRef ?? job.id} restored from archive`, userId);
    await this.logActivity(companyId, job.id, userId, "job.unarchived", "Job restored from archive");
    await this.emitJobActivity("job.unarchived", updated, `Job ${updated?.jobRef || updated?.id || id} restored from archive`);
    return this.decorateJobWithWorkflowReadiness(db, companyId, updated, settings);
  }

  async softDelete(companyId: string, userId: string, id: string, reason?: string | null) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        pdf: true,
        _count: {
          select: {
            assets: true,
            bookings: true,
            executionEvidence: true,
            executionRecords: true,
            publicTokens: true,
            signatures: true,
          },
        },
      },
    });
    if (!job) {
      throw new NotFoundException("Job not found");
    }

    const blockedReasons = this.buildDeleteBlockedReasons(job);
    if (blockedReasons.length > 0) {
      throw new BadRequestException({
        message: "This job cannot be deleted because it already has records that must stay available.",
        reasons: blockedReasons,
      });
    }

    await db.job.update({
      where: { id: job.id },
      data: {
        deletedAt: new Date(),
        deletedByUserId: userId,
        deletionReason: String(reason || "").trim() || null,
        archivedAt: job.archivedAt || new Date(),
        archivedByUserId: job.archivedByUserId || userId,
      },
    });
    await this.audit.log(companyId, "job.delete", `Job ${job.jobRef ?? job.id} soft deleted`, userId);
    await this.logActivity(companyId, job.id, userId, "job.deleted", "Job soft deleted", {
      reason: String(reason || "").trim() || null,
    });
    return { ok: true };
  }

  async patchPartial(companyId: string, userId: string, id: string, dto: PatchJobDto) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!job) throw new NotFoundException("Job not found");
    const settings = await this.getWorkflowSettings(db, companyId);

    const payload: any = {};
    if (dto.status) payload.status = dto.status;
    if (dto.assignedUserId !== undefined) payload.assignedUserId = dto.assignedUserId || null;
    if (dto.locationId !== undefined) payload.locationId = dto.locationId || null;
    if (dto.pricingNotes !== undefined) payload.pricingNotes = dto.pricingNotes || null;
    if (dto.invoiceDueAt !== undefined) payload.invoiceDueAt = dto.invoiceDueAt ? new Date(dto.invoiceDueAt) : null;
    if (dto.scheduledAt !== undefined) payload.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (dto.customerName !== undefined) payload.customerName = dto.customerName || null;
    if (dto.customerEmail !== undefined) payload.customerEmail = dto.customerEmail || null;
    if (dto.customerPhone !== undefined) payload.customerPhone = dto.customerPhone || null;
    if (dto.customerName !== undefined || dto.customerEmail !== undefined || dto.customerPhone !== undefined) {
      const nextName = dto.customerName !== undefined ? String(dto.customerName || "").trim() : String(job.customerName || "").trim();
      const nextEmail = dto.customerEmail !== undefined ? String(dto.customerEmail || "").trim() : String(job.customerEmail || "").trim();
      const nextPhone = dto.customerPhone !== undefined ? String(dto.customerPhone || "").trim() : String(job.customerPhone || "").trim();
      payload.customerId = await this.resolveOrCreateCustomer(companyId, {
        customerId: job.customerId || null,
        name: nextName || null,
        email: nextEmail || null,
        phone: nextPhone || null,
      });
    }
    if (dto.completedAt !== undefined) payload.completedAt = dto.completedAt ? new Date(dto.completedAt) : null;
    if (dto.status === "COMPLETED" && dto.completedAt === undefined) payload.completedAt = new Date();
    if (dto.status && dto.status !== job.status) {
      await this.ensureJobStageReady(db, companyId, id, dto.status, `move the job to ${dto.status}`, settings);
      if (dto.status === "COMPLETED") {
        await this.assertCompletionAllowanceAvailable(db, companyId, job);
      }
    }

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
    if (updated.assignedUserId && updated.assignedUserId !== job.assignedUserId && updated.assignedUserId !== userId && isNotificationsV1Enabled()) {
      await this.notifications.createForUsers(companyId, [updated.assignedUserId], {
        type: "job.assigned",
        title: `Job assigned: ${updated.jobRef || updated.id}`,
        body: `${updated.customerName || "Customer work"} is ready for handoff.`,
        entityType: "job",
        entityId: updated.id,
        metaJson: {
          reasonKey: "job_assigned",
          priority: "attention",
          actionUrl: `/dashboard/jobs/${updated.id}`,
          actionLabel: "Open job",
        },
      });
    }
    if ((updated.status === "COMPLETED" || (updated.completedAt && !job.completedAt)) && isNotificationsV1Enabled()) {
      await this.notifications.notifyJobCompleted(companyId, job.id);
    }
    await this.emitJobActivity(
      "job.updated",
      updated,
      `Job ${updated?.jobRef || updated?.id || id} updated`,
    );
    if (updated.status === "COMPLETED" && job.status !== "COMPLETED") {
      await this.emitJobActivity(
        "job.completed",
        updated,
        `Job ${updated?.jobRef || updated?.id || id} completed`,
      );
    }
    await this.maybeRunCompletionAutomation(companyId, userId, job, updated);
    await this.maybeRunContactGapAutomation(companyId, userId, updated.id);
    await this.compliance.evaluateSlaTransition({
      tenantId: companyId,
      actorUserId: userId,
      entityType: "JOB",
      entityId: updated.id,
      previousStatus: job.status,
      currentStatus: updated.status,
      locationId: updated.locationId || null,
      assignedUserId: updated.assignedUserId || null,
      customerId: updated.customerId || null,
      customerName: updated.customerName || null,
      jobId: updated.id,
      jobRef: updated.jobRef || null,
      label: updated.jobRef || updated.id,
    });
    await this.compliance.syncSlaForEntity(companyId, "JOB", updated.id);
    return this.decorateJobWithWorkflowReadiness(db, companyId, updated, settings);
  }

  async board(companyId: string, userId: string, query: JobsBoardQueryDto) {
    const db = this.prisma as any;
    const page = Math.max(1, Number(query?.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query?.pageSize || 40)));
    const statuses = String(query?.status || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const where: any = { companyId, ...this.buildVisibilityWhere() };
    if (statuses.length) where.status = { in: statuses };
    const restrictedLocationId = await this.restrictedLocationId(companyId, userId);
    if (restrictedLocationId) {
      where.locationId = restrictedLocationId;
    } else {
      const rawLocationIds = String(query.locationIds || "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .filter((v) => v !== "all");
      if (rawLocationIds.length) {
        where.locationId = { in: rawLocationIds };
      } else if (query.locationId && query.locationId !== "all") {
        where.locationId = query.locationId;
      }
    }
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
    const settings = await this.getWorkflowSettings(db, companyId);
    const decoratedJobs = await Promise.all(jobs.map((job: any) => this.decorateJobWithWorkflowReadiness(db, companyId, job, settings)));

    const grouped: Record<string, any[]> = {
      OPEN: [],
      SCHEDULED: [],
      IN_PROGRESS: [],
      COMPLETED: [],
      INVOICED: [],
      CANCELLED: [],
      DRAFT: [],
    };
    for (const job of decoratedJobs) {
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
    const undoChanges: Array<{ id: string; before: any; after: any }> = [];

    for (const id of uniqueIds) {
      const job = await db.job.findFirst({ where: { id, companyId, deletedAt: null } });
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
        let performedUpdate = false;
        if (dto.operation === "setStatus" && dto.status) {
          if (job.status === dto.status) {
            successCount += 1;
            continue;
          }
          const settings = await this.getWorkflowSettings(db, companyId);
          await this.ensureJobStageReady(db, companyId, id, dto.status, `move the job to ${dto.status}`, settings);
          if (dto.status === "COMPLETED") {
            await this.assertCompletionAllowanceAvailable(db, companyId, job);
          }
          await db.job.update({
            where: { id },
            data: {
              status: dto.status,
              completedAt: dto.status === "COMPLETED" ? new Date() : null,
            },
          });
          performedUpdate = true;
        } else if (dto.operation === "assignTechnician") {
          const desired = dto.assignedUserId || null;
          if (job.assignedUserId === desired) {
            successCount += 1;
            continue;
          }
          await db.job.update({ where: { id }, data: { assignedUserId: desired } });
          if (desired && desired !== userId && isNotificationsV1Enabled()) {
            await this.notifications.createForUsers(companyId, [desired], {
              type: "job.assigned",
              title: `Job assigned: ${job.jobRef || job.id}`,
              body: `${job.customerName || "Customer work"} is ready for handoff.`,
              entityType: "job",
              entityId: job.id,
              metaJson: {
                reasonKey: "job_assigned",
                priority: "attention",
                actionUrl: `/dashboard/jobs/${job.id}`,
                actionLabel: "Open job",
              },
            });
          }
          performedUpdate = true;
        } else if (dto.operation === "setLocation") {
          const desiredLocation = dto.locationId && dto.locationId !== "all" ? dto.locationId : null;
          if (job.locationId === desiredLocation) {
            successCount += 1;
            continue;
          }
          await db.job.update({ where: { id }, data: { locationId: desiredLocation } });
          performedUpdate = true;
        } else if (dto.operation === "addTag" && dto.tag) {
          const normalizedTag = dto.tag.trim();
          if (!normalizedTag) {
            failed.push({ id, reason: "invalid tag value" });
            continue;
          }
          const tags = Array.isArray(job.tags) ? job.tags.map((t: string) => String(t).trim()) : [];
          if (tags.includes(normalizedTag)) {
            successCount += 1;
            continue;
          }
          const next = Array.from(new Set([...tags, normalizedTag])).filter(Boolean);
          await db.job.update({ where: { id }, data: { tags: next } });
          performedUpdate = true;
        } else if (dto.operation === "removeTag" && dto.tag) {
          const normalizedTag = dto.tag.trim();
          if (!normalizedTag) {
            failed.push({ id, reason: "invalid tag value" });
            continue;
          }
          const tags = Array.isArray(job.tags) ? job.tags : [];
          if (!tags.map((t: string) => String(t).trim()).includes(normalizedTag)) {
            successCount += 1;
            continue;
          }
          const next = tags.filter((t: string) => String(t).trim() !== normalizedTag);
          await db.job.update({ where: { id }, data: { tags: next } });
          performedUpdate = true;
        } else if (dto.operation === "setDueDate") {
          const desiredDue = dto.dueAt ? new Date(dto.dueAt) : null;
          const desiredTime = desiredDue ? desiredDue.getTime() : null;
          const currentTime = job.invoiceDueAt ? new Date(job.invoiceDueAt).getTime() : null;
          if (desiredTime === currentTime) {
            successCount += 1;
            continue;
          }
          await db.job.update({ where: { id }, data: { invoiceDueAt: desiredDue } });
          performedUpdate = true;
        } else if (dto.operation === "closeJobs") {
          if (job.status === "COMPLETED") {
            successCount += 1;
            continue;
          }
          const settings = await this.getWorkflowSettings(db, companyId);
          await this.ensureJobStageReady(db, companyId, id, "COMPLETED", "move the job to COMPLETED", settings);
          await this.assertCompletionAllowanceAvailable(db, companyId, job);
          await db.job.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } });
          performedUpdate = true;
        } else if (dto.operation === "markComplete") {
          if (job.status === "COMPLETED") {
            successCount += 1;
            continue;
          }
          const settings = await this.getWorkflowSettings(db, companyId);
          await this.ensureJobStageReady(db, companyId, id, "COMPLETED", "move the job to COMPLETED", settings);
          await this.assertCompletionAllowanceAvailable(db, companyId, job);
          await db.job.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } });
          performedUpdate = true;
        } else {
          failed.push({ id, reason: "invalid operation payload" });
          continue;
        }
        if (!performedUpdate) {
          continue;
        }
        const after = await db.job.findFirst({
          where: { id, companyId },
          select: { status: true, completedAt: true, assignedUserId: true, locationId: true, tags: true, invoiceDueAt: true },
        });
        undoChanges.push({ id, before, after });
        await this.logActivity(companyId, id, userId, "job.bulk", `Bulk operation ${dto.operation}`, { before, after, operation: dto.operation });
        if (after?.status === "COMPLETED" && !before.completedAt && isNotificationsV1Enabled()) {
          await this.notifications.notifyJobCompleted(companyId, id);
        }
        if (after?.status === "COMPLETED" && !before.completedAt) {
          await this.maybeRunCompletionAutomation(companyId, userId, { ...before, id }, { ...after, id });
        }
        successCount += 1;
      } catch (err: any) {
        failed.push({ id, reason: err?.message || "update failed" });
      }
    }

    if (undoChanges.length > 0) {
      await this.recordUndo(companyId, userId, "bulk_update", undoChanges);
    }
    await this.audit.log(companyId, "jobs.bulk", `Bulk op ${dto.operation} updated ${successCount}/${uniqueIds.length}`, userId);
    return { successCount, failed };
  }

  async undoLastChange(companyId: string, userId: string) {
    const db = this.prisma as any;
    const action = await db.userUndoAction.findFirst({
      where: {
        companyId,
        userId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!action) return { ok: false, message: "Nothing to undo" };

    const changes = Array.isArray(action.payloadJson?.changes) ? action.payloadJson.changes : [];
    for (const change of changes) {
      if (!change?.id || !change?.before) continue;
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

  async boardV2(companyId: string, userId: string, query: JobsBoardQueryDto) {
    const db = this.prisma as any;
    const statuses = String(query?.status || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const where: any = { companyId, ...this.buildVisibilityWhere() };
    if (statuses.length) where.status = { in: statuses };
    const restrictedLocationId = await this.restrictedLocationId(companyId, userId);
    if (restrictedLocationId) {
      where.locationId = restrictedLocationId;
    } else {
      const rawLocationIds = String(query.locationIds || "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .filter((v) => v !== "all");
      if (rawLocationIds.length) where.locationId = { in: rawLocationIds };
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
    const settings = await this.getWorkflowSettings(db, companyId);
    const decoratedJobs = await Promise.all(jobs.map((job: any) => this.decorateJobWithWorkflowReadiness(db, companyId, job, settings)));

    const grouped: Record<string, any[]> = {
      OPEN: [],
      SCHEDULED: [],
      IN_PROGRESS: [],
      COMPLETED: [],
      INVOICED: [],
      CANCELLED: [],
      DRAFT: [],
    };
    for (const job of decoratedJobs) {
      if (!grouped[job.status]) grouped[job.status] = [];
      grouped[job.status].push(job);
    }
    const counts = Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length]));
    return { grouped, counts, total: jobs.length };
  }

  async bulkV2(companyId: string, userId: string, dto: BulkJobsV2Dto) {
    const db = this.prisma as any;
    const uniqueIds = Array.from(new Set((dto.jobIds || []).filter(Boolean)));
    if (uniqueIds.length === 0) return { successCount: 0, failed: [] };

    const result = await db.$transaction(async (tx: any) => {
      const jobs = await tx.job.findMany({ where: { companyId, id: { in: uniqueIds }, deletedAt: null } });
      if (jobs.length !== uniqueIds.length) {
        const found = new Set(jobs.map((j: any) => j.id));
        const failed = uniqueIds.filter((id) => !found.has(id)).map((id) => ({ id, reason: "not found" }));
        return { successCount: 0, failed };
      }

      const undoChanges: Array<{ id: string; before: any; after: any }> = [];
      const completionCandidates: Array<{ id: string; before: any; after: any }> = [];
      const settings = await this.getWorkflowSettings(tx, companyId);
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
          await this.ensureJobStageReady(tx, companyId, job.id, dto.status, `move the job to ${dto.status}`, settings);
          if (dto.status === "COMPLETED") {
            await this.assertCompletionAllowanceAvailable(tx, companyId, job);
          }
          await tx.job.update({
            where: { id: job.id },
            data: {
              status: dto.status,
              completedAt: dto.status === "COMPLETED" ? new Date() : null,
            },
          });
        } else if (dto.operation === "assignTechnician") {
          await tx.job.update({ where: { id: job.id }, data: { assignedUserId: dto.assignedUserId || null } });
        } else if (dto.operation === "setLocation") {
          await tx.job.update({ where: { id: job.id }, data: { locationId: dto.locationId && dto.locationId !== "all" ? dto.locationId : null } });
        } else if (dto.operation === "addTag" && dto.tag) {
          const next = Array.from(new Set([...(Array.isArray(job.tags) ? job.tags : []), dto.tag.trim()])).filter(Boolean);
          await tx.job.update({ where: { id: job.id }, data: { tags: next } });
        } else if (dto.operation === "removeTag" && dto.tag) {
          const tags = Array.isArray(job.tags) ? job.tags : [];
          await tx.job.update({ where: { id: job.id }, data: { tags: tags.filter((t: string) => t !== dto.tag) } });
        } else if (dto.operation === "setDueDate") {
          await tx.job.update({ where: { id: job.id }, data: { invoiceDueAt: dto.dueAt ? new Date(dto.dueAt) : null } });
        } else if (dto.operation === "closeJobs") {
          await this.ensureJobStageReady(tx, companyId, job.id, "COMPLETED", "move the job to COMPLETED", settings);
          await this.assertCompletionAllowanceAvailable(tx, companyId, job);
          await tx.job.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date() } });
        } else if (dto.operation === "markComplete") {
          await this.ensureJobStageReady(tx, companyId, job.id, "COMPLETED", "move the job to COMPLETED", settings);
          await this.assertCompletionAllowanceAvailable(tx, companyId, job);
          await tx.job.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date() } });
        } else {
          throw new BadRequestException("Invalid operation payload");
        }

        const after = await tx.job.findUnique({
          where: { id: job.id },
          select: { status: true, completedAt: true, assignedUserId: true, locationId: true, tags: true, invoiceDueAt: true },
        });
        undoChanges.push({ id: job.id, before, after });
        if (after?.status === "COMPLETED" && !before.completedAt) {
          completionCandidates.push({ id: job.id, before, after });
        }
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
        if (entry.after?.status === "COMPLETED" && !entry.before?.completedAt && isNotificationsV1Enabled()) {
          await this.notifications.notifyJobCompleted(companyId, entry.id);
        }
      }

      return { successCount: uniqueIds.length, failed: [], completionCandidates };
    });

    for (const entry of result.completionCandidates || []) {
      const current = await db.job.findFirst({ where: { id: entry.id, companyId } });
      if (current) {
        await this.maybeRunCompletionAutomation(companyId, userId, entry.before, current);
      }
    }

    return { successCount: result.successCount, failed: result.failed };
  }

  async createReminder(companyId: string, userId: string, dto: CreateJobReminderDto) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: dto.jobId, companyId }, select: { id: true, jobRef: true } });
    if (!job) throw new NotFoundException("Job not found");
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

  async activity(companyId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: jobId, companyId }, select: { id: true } });
    if (!job) throw new NotFoundException("Job not found");
    return db.jobActivity.findMany({
      where: { companyId, jobId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }
}
