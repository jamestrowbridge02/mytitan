import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { getWorkspaceJobForms } from "../common/business-config";
import { PrismaService } from "../prisma/prisma.service";
import { isWheelsFormV1Enabled } from "../common/feature-flags";
import { WHEELS_TEMPLATE_FIELDS, WHEELS_TEMPLATE_META, WHEELS_TEMPLATE_TRADE } from "./wheels-template.data";

type TemplateField = {
  id: string;
  key: string;
  label: string;
  type: string;
  required?: boolean | null;
  visible?: boolean | null;
  helpText?: string | null;
  options?: string[] | null;
  sectionId: string;
  serviceTypeIds?: string[] | null;
  order?: number | null;
};

type TemplateSection = {
  id: string;
  title: string;
  description?: string | null;
  visible?: boolean | null;
  serviceTypeIds?: string[] | null;
  order?: number | null;
};

type TemplateServiceType = {
  id: string;
  name: string;
  description?: string | null;
  enabled?: boolean | null;
  retired?: boolean | null;
  order?: number | null;
};

type TemplatePayload = {
  declarationText?: string | null;
  serviceTypes: TemplateServiceType[];
  sections: TemplateSection[];
  fields: TemplateField[];
  completionChecks?: string[];
  proofRequirements?: string[];
  customerSummaryFields?: string[];
  versionLabel?: string | null;
};

type TemplateMetadata = {
  featured?: boolean;
  premiumStarter?: boolean;
  mockPreview?: string | null;
  bestFor?: string[];
  workflowTags?: string[];
  estimatedSetupMinutes?: number | null;
  setupComplexity?: "fast" | "balanced" | "advanced";
  editorialTone?: string | null;
  customerFacingSummary?: string | null;
  moderationHistory?: Array<{
    action: string;
    createdAt: string;
    createdByUserId?: string | null;
    fromStatus?: string | null;
    toStatus?: string | null;
    notes?: string | null;
  }>;
};

const BLANK_TEMPLATE_ID = "blank";

function slugify(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "template";
}

function normalizeStringList(value: unknown) {
  return Array.from(new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || "").trim()).filter(Boolean)));
}

function buildStarterPayload(input: {
  declarationText?: string;
  serviceTypes: Array<{ id: string; name: string; description?: string }>;
  sections: Array<{ id: string; title: string; description?: string; serviceTypeIds?: string[] }>;
  fields: Array<{
    key: string;
    label: string;
    type: string;
    sectionId: string;
    required?: boolean;
    helpText?: string;
    options?: string[];
    serviceTypeIds?: string[];
  }>;
  completionChecks?: string[];
  proofRequirements?: string[];
  customerSummaryFields?: string[];
}): TemplatePayload {
  return {
    declarationText:
      input.declarationText ||
      "I confirm the details above are correct and consent to this service record being stored and shared for completion.",
    serviceTypes: input.serviceTypes.map((serviceType, index) => ({
      id: serviceType.id,
      name: serviceType.name,
      description: serviceType.description || null,
      enabled: true,
      retired: false,
      order: index,
    })),
    sections: input.sections.map((section, index) => ({
      id: section.id,
      title: section.title,
      description: section.description || null,
      visible: true,
      serviceTypeIds: section.serviceTypeIds || [],
      order: index,
    })),
    fields: input.fields.map((field, index) => ({
      id: `field_${field.key}`,
      key: field.key,
      label: field.label,
      type: field.type,
      required: Boolean(field.required),
      visible: true,
      helpText: field.helpText || null,
      options: field.options || [],
      sectionId: field.sectionId,
      serviceTypeIds: field.serviceTypeIds || [],
      order: index,
    })),
    completionChecks: input.completionChecks || [],
    proofRequirements: input.proofRequirements || [],
    customerSummaryFields: input.customerSummaryFields || [],
    versionLabel: "v1",
  };
}

function buildStandardStarter(input: {
  key: string;
  name: string;
  tradeCategory: string;
  description: string;
  featured?: boolean;
  premiumStarter?: boolean;
  requiredFields?: Array<{ key: string; label: string; type?: string }>;
  proofRequirements?: string[];
}) {
  const requiredFields = input.requiredFields || [];
  return {
    key: input.key,
    name: input.name,
    tradeCategory: input.tradeCategory,
    description: input.description,
    metadata: {
      featured: input.featured === true,
      premiumStarter: input.premiumStarter === true,
      bestFor: [input.name],
      workflowTags: [slugify(input.tradeCategory), "governed-template", "customer-ready"],
      estimatedSetupMinutes: 6,
      setupComplexity: "fast" as const,
      editorialTone: "A governed service record with a clear completion and customer handover.",
      customerFacingSummary: input.description,
      mockPreview: "Job details, work completed, evidence, and customer handover in one consistent record.",
    } satisfies TemplateMetadata,
    payload: buildStarterPayload({
      serviceTypes: [{ id: slugify(input.name), name: input.name }],
      sections: [
        { id: "job_details", title: "Job details" },
        { id: "work_record", title: "Work completed" },
        { id: "handover", title: "Customer handover" },
      ],
      fields: [
        ...requiredFields.map((field) => ({
          key: field.key,
          label: field.label,
          type: field.type || "text",
          sectionId: "job_details",
          required: true,
        })),
        { key: "work_summary", label: "Work summary", type: "textarea", sectionId: "work_record", required: true },
        { key: "completion_notes", label: "Completion notes", type: "textarea", sectionId: "work_record", required: true },
        { key: "customer_summary", label: "Customer summary", type: "textarea", sectionId: "handover", required: true },
      ],
      completionChecks: ["Required job details completed", "Work summary completed", "Completion notes recorded"],
      proofRequirements: input.proofRequirements || ["Completion evidence where required"],
      customerSummaryFields: ["work_summary", "completion_notes", "customer_summary"],
    }),
  };
}

const MARKETPLACE_STARTERS = [
  ["diamond_cut_wheel_repair", "Diamond Cut Wheel Repair", "ALLOY_WHEEL_SPECIALIST"],
  ["smart_repair", "Smart Repair", "AUTOMOTIVE"],
  ["vehicle_inspection", "Vehicle Inspection", "AUTOMOTIVE"],
  ["tyre_fitting", "Tyre Fitting", "AUTOMOTIVE"],
  ["tyre_repair", "Tyre Repair", "AUTOMOTIVE"],
  ["brake_service", "Brake Service", "AUTOMOTIVE"],
  ["vehicle_service", "Vehicle Service", "AUTOMOTIVE"],
  ["mot_preparation", "MOT Preparation", "AUTOMOTIVE"],
  ["adas_calibration", "ADAS Calibration", "AUTOMOTIVE"],
  ["bodyshop_repair", "Bodyshop Repair", "BODYSHOP"],
  ["fleet_maintenance", "Fleet Maintenance", "FLEET_COMMERCIAL"],
  ["general_inspection", "General Inspection", "WORKSHOP"],
  ["repair_order", "Repair Order", "WORKSHOP"],
  ["warranty_repair", "Warranty Repair", "WORKSHOP"],
  ["service_plan_visit", "Service Plan Visit", "WORKSHOP"],
  ["vehicle_health_check", "Vehicle Health Check", "WORKSHOP"],
  ["quality_control_inspection", "Quality Control Inspection", "WORKSHOP"],
  ["plumbing", "Plumbing", "PLUMBING"],
  ["hvac", "HVAC", "HVAC"],
  ["appliance_repair", "Appliance Repair", "FIELD_SERVICE"],
  ["facilities_maintenance", "Facilities Maintenance", "FACILITIES_MANAGEMENT"],
  ["general_maintenance", "General Maintenance", "FIELD_SERVICE"],
  ["emergency_callout", "Emergency Callout", "FIELD_SERVICE"],
  ["mobile_tyre_service", "Mobile Tyre Service", "MOBILE_SERVICE"],
  ["mobile_repair", "Mobile Repair", "MOBILE_SERVICE"],
  ["mobile_inspection", "Mobile Inspection", "MOBILE_SERVICE"],
  ["mobile_fleet_service", "Mobile Fleet Service", "MOBILE_SERVICE"],
  ["fleet_inspection", "Fleet Inspection", "FLEET_COMMERCIAL"],
  ["contract_service_visit", "Contract Service Visit", "FLEET_COMMERCIAL"],
  ["compliance_inspection", "Compliance Inspection", "FLEET_COMMERCIAL"],
].map(([key, name, tradeCategory]) =>
  buildStandardStarter({
    key,
    name,
    tradeCategory,
    description: `${name} job sheet with governed completion, evidence, and customer handover fields.`,
  }),
);

const STARTER_TEMPLATES = [
  buildStandardStarter({
    key: "alloy_wheel_repair_refurbishment",
    name: "Alloy Wheel Repair & Refurbishment",
    tradeCategory: "ALLOY_WHEEL_SPECIALIST",
    description: "Wheel A&R default for repair, refurbishment, evidence, torque recording, and customer handover.",
    featured: true,
    premiumStarter: true,
    requiredFields: [
      { key: "vehicle_registration", label: "Vehicle registration" },
      { key: "vehicle_make_model", label: "Make and model" },
      { key: "wheel_count", label: "Wheel count", type: "number" },
      { key: "wheel_position", label: "Wheel position" },
      { key: "damage_type", label: "Damage type" },
      { key: "finish_type", label: "Finish type" },
      { key: "colour", label: "Colour" },
    ],
    proofRequirements: [
      "Before photos",
      "After photos",
      "Torque evidence where applicable",
      "completedBy execution record",
      "completedAt execution record",
    ],
  }),
  {
    key: "wheels_mobile_service",
    name: "Mobile wheel & tyre service",
    tradeCategory: "WHEELS",
    description: "Recommended for tyre, wheel, and mobile fitting teams.",
    metadata: {
      featured: true,
      premiumStarter: true,
      bestFor: ["Mobile fitting teams", "Emergency tyre callouts", "Fleet wheel swaps"],
      workflowTags: ["mobile-response", "handover-ready", "photo-proof"],
      estimatedSetupMinutes: 8,
      setupComplexity: "fast",
      editorialTone: "Confident field-service handover with clear customer proof.",
      customerFacingSummary: "Built to capture arrival context, technical checks, and a clean customer-ready close-out.",
      mockPreview: "Wheel positions, torque checks, and customer handover arranged in one calm record.",
    } satisfies TemplateMetadata,
    payload: buildStarterPayload({
      serviceTypes: [
        { id: "tyre_change", name: "Tyre Change", description: "Tyre replacement and balancing." },
        { id: "puncture_repair", name: "Puncture Repair", description: "Repair a recoverable puncture safely." },
        { id: "wheel_swap", name: "Wheel Swap", description: "Seasonal wheel or tyre set swap." },
      ],
      sections: [
        { id: "site_readiness", title: "Site readiness", description: "Capture where the vehicle is and how the team should approach the job." },
        { id: "vehicle_condition", title: "Vehicle & wheel condition", description: "Record wheel positions, condition, and technical checks." },
        { id: "handover", title: "Customer handover", description: "Store the summary that should be visible to the customer." },
      ],
      fields: [
        { key: "site_location", label: "Site location", type: "text", sectionId: "site_readiness", required: true },
        { key: "arrival_window", label: "Arrival window", type: "text", sectionId: "site_readiness" },
        { key: "wheel_positions_checked", label: "Wheel positions checked", type: "checkbox", sectionId: "vehicle_condition", required: true },
        { key: "tyre_size_confirmed", label: "Tyre size confirmed", type: "checkbox", sectionId: "vehicle_condition", required: true },
        { key: "torque_value", label: "Torque value", type: "number", sectionId: "vehicle_condition" },
        { key: "customer_summary", label: "Customer-ready summary", type: "textarea", sectionId: "handover", required: true },
        { key: "follow_up_needed", label: "Follow-up needed", type: "select", sectionId: "handover", options: ["No", "Quote", "Return visit"] },
      ],
      completionChecks: ["Wheel positions confirmed", "Torque value recorded where required", "Customer summary completed"],
      proofRequirements: ["Before photos when damage is present", "After photos for completed work", "Technician signature"],
      customerSummaryFields: ["customer_summary", "follow_up_needed"],
    }),
  },
  {
    key: "property_maintenance_general",
    name: "Property maintenance visit",
    tradeCategory: "PROPERTY_MAINTENANCE",
    description: "Recommended for general service, reactive maintenance, and facilities teams.",
    metadata: {
      featured: true,
      premiumStarter: false,
      bestFor: ["Reactive maintenance", "Facilities teams", "General service visits"],
      workflowTags: ["access-and-safety", "materials", "follow-up"],
      estimatedSetupMinutes: 11,
      setupComplexity: "balanced",
      editorialTone: "Practical, calm, and customer-legible from access notes through handover.",
      customerFacingSummary: "Balances site access, work completed, and what happens next without clutter.",
      mockPreview: "Access, work summary, materials, and follow-up sit in a clean three-step flow.",
    } satisfies TemplateMetadata,
    payload: buildStarterPayload({
      serviceTypes: [
        { id: "reactive_visit", name: "Reactive visit" },
        { id: "planned_maintenance", name: "Planned maintenance" },
        { id: "inspection", name: "Inspection" },
      ],
      sections: [
        { id: "access", title: "Access & safety", description: "Confirm access instructions and risk controls first." },
        { id: "work_done", title: "Work completed", description: "Capture the technical work and materials used." },
        { id: "customer_handover", title: "Customer handover", description: "Summarise what was completed and what happens next." },
      ],
      fields: [
        { key: "site_contact_name", label: "Site contact name", type: "text", sectionId: "access", required: true },
        { key: "access_notes", label: "Access notes", type: "textarea", sectionId: "access" },
        { key: "permit_required", label: "Permit required", type: "checkbox", sectionId: "access" },
        { key: "work_summary", label: "Work summary", type: "textarea", sectionId: "work_done", required: true },
        { key: "materials_used", label: "Materials used", type: "textarea", sectionId: "work_done" },
        { key: "further_work_required", label: "Further work required", type: "select", sectionId: "customer_handover", options: ["No", "Quote needed", "Return visit needed"], required: true },
        { key: "customer_summary", label: "Customer-ready summary", type: "textarea", sectionId: "customer_handover", required: true },
      ],
      completionChecks: ["Work summary completed", "Customer-ready summary completed"],
      proofRequirements: ["Photos when useful", "Customer acknowledgement where required"],
      customerSummaryFields: ["work_summary", "customer_summary", "further_work_required"],
    }),
  },
  {
    key: "electrical_service_visit",
    name: "Electrical service visit",
    tradeCategory: "ELECTRICAL",
    description: "Recommended for fault finding, install, and electrical service teams.",
    metadata: {
      featured: false,
      premiumStarter: true,
      bestFor: ["Fault finding", "Install visits", "Testing & certification"],
      workflowTags: ["safety-first", "technical-readings", "certificate-aware"],
      estimatedSetupMinutes: 12,
      setupComplexity: "advanced",
      editorialTone: "Safety-first documentation with a premium close-out for technical work.",
      customerFacingSummary: "Captures isolation, readings, and a clear human summary without overloading the customer.",
      mockPreview: "Isolation and readings lead, while certificate and summary close the visit cleanly.",
    } satisfies TemplateMetadata,
    payload: buildStarterPayload({
      serviceTypes: [
        { id: "fault_find", name: "Fault find" },
        { id: "install", name: "Install" },
        { id: "testing", name: "Testing & certification" },
      ],
      sections: [
        { id: "safety_isolation", title: "Safety & isolation", description: "Record isolation, circuit details, and safe start checks." },
        { id: "works_record", title: "Works record", description: "Capture the actual work and readings." },
        { id: "customer_close", title: "Customer close-out", description: "Explain the outcome in clear language." },
      ],
      fields: [
        { key: "circuit_reference", label: "Circuit reference", type: "text", sectionId: "safety_isolation" },
        { key: "isolated_safely", label: "Isolated safely", type: "checkbox", sectionId: "safety_isolation", required: true },
        { key: "test_readings", label: "Test readings", type: "textarea", sectionId: "works_record" },
        { key: "work_summary", label: "Work summary", type: "textarea", sectionId: "works_record", required: true },
        { key: "certificate_required", label: "Certificate required", type: "select", sectionId: "customer_close", options: ["No", "Minor works", "EIC", "EICR"] },
        { key: "customer_summary", label: "Customer-ready summary", type: "textarea", sectionId: "customer_close", required: true },
      ],
      completionChecks: ["Safe isolation recorded", "Work summary completed", "Customer summary completed"],
      proofRequirements: ["Photos where relevant", "Readings stored when testing applies"],
      customerSummaryFields: ["work_summary", "certificate_required", "customer_summary"],
    }),
  },
  ...MARKETPLACE_STARTERS,
];

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private requireFeature() {
    if (!isWheelsFormV1Enabled()) {
      throw new ServiceUnavailableException("Wheels form v1 is not enabled");
    }
  }

  private normalizeServiceTypes(value: unknown) {
    return (Array.isArray(value) ? value : [])
      .map((entry, index) => ({
        id: String((entry as any)?.id || `service_type_${index + 1}`),
        name: String((entry as any)?.name || "").trim(),
        description: String((entry as any)?.description || "").trim() || null,
        enabled: (entry as any)?.enabled !== false,
        retired: (entry as any)?.retired === true,
        order: Number((entry as any)?.order ?? index),
      }))
      .filter((entry) => entry.name);
  }

  private normalizeSections(value: unknown) {
    return (Array.isArray(value) ? value : [])
      .map((entry, index) => ({
        id: String((entry as any)?.id || `section_${index + 1}`),
        title: String((entry as any)?.title || "").trim(),
        description: String((entry as any)?.description || "").trim() || null,
        visible: (entry as any)?.visible !== false,
        serviceTypeIds: normalizeStringList((entry as any)?.serviceTypeIds),
        order: Number((entry as any)?.order ?? index),
      }))
      .filter((entry) => entry.title);
  }

  private normalizeFields(value: unknown, sections: TemplateSection[]) {
    const sectionIds = new Set(sections.map((section) => section.id));
    return (Array.isArray(value) ? value : [])
      .map((entry, index) => ({
        id: String((entry as any)?.id || `field_${index + 1}`),
        key: slugify(String((entry as any)?.key || `field_${index + 1}`)),
        label: String((entry as any)?.label || "").trim(),
        type: String((entry as any)?.type || "text").trim().toLowerCase(),
        required: (entry as any)?.required === true,
        visible: (entry as any)?.visible !== false,
        helpText: String((entry as any)?.helpText || "").trim() || null,
        options: normalizeStringList((entry as any)?.options),
        sectionId: String((entry as any)?.sectionId || "").trim(),
        serviceTypeIds: normalizeStringList((entry as any)?.serviceTypeIds),
        order: Number((entry as any)?.order ?? index),
      }))
      .filter((entry) => entry.label && entry.key && sectionIds.has(entry.sectionId));
  }

  private normalizePayload(value: any, fallbackTradeCategory = "GENERAL"): TemplatePayload {
    const payload = value && typeof value === "object" ? value : {};
    const sections = this.normalizeSections(payload.sections);
    const fields = this.normalizeFields(payload.fields, sections);
    return {
      declarationText:
        String(payload.declarationText || "").trim() ||
        "I confirm the details above are correct and consent to this service record being stored and shared for completion.",
      serviceTypes: this.normalizeServiceTypes(payload.serviceTypes),
      sections,
      fields,
      completionChecks: normalizeStringList(payload.completionChecks),
      proofRequirements: normalizeStringList(payload.proofRequirements),
      customerSummaryFields: normalizeStringList(payload.customerSummaryFields),
      versionLabel: String(payload.versionLabel || "").trim() || `${fallbackTradeCategory.toLowerCase()}-v1`,
    };
  }

  private normalizeMetadata(value: any): TemplateMetadata {
    const metadata = value && typeof value === "object" ? value : {};
    const moderationHistory = Array.isArray(metadata.moderationHistory)
      ? metadata.moderationHistory.map((entry: any) => ({
          action: String(entry?.action || "").trim(),
          createdAt: String(entry?.createdAt || "").trim(),
          createdByUserId: String(entry?.createdByUserId || "").trim() || null,
          fromStatus: String(entry?.fromStatus || "").trim() || null,
          toStatus: String(entry?.toStatus || "").trim() || null,
          notes: String(entry?.notes || "").trim() || null,
        })).filter((entry: any) => entry.action && entry.createdAt)
      : [];
    return {
      featured: metadata.featured === true,
      premiumStarter: metadata.premiumStarter === true,
      mockPreview: String(metadata.mockPreview || "").trim() || null,
      bestFor: normalizeStringList(metadata.bestFor),
      workflowTags: normalizeStringList(metadata.workflowTags),
      estimatedSetupMinutes:
        metadata.estimatedSetupMinutes == null || metadata.estimatedSetupMinutes === ""
          ? null
          : Math.max(1, Number(metadata.estimatedSetupMinutes)),
      setupComplexity: ["fast", "balanced", "advanced"].includes(String(metadata.setupComplexity || "").trim())
        ? (String(metadata.setupComplexity).trim() as "fast" | "balanced" | "advanced")
        : undefined,
      editorialTone: String(metadata.editorialTone || "").trim() || null,
      customerFacingSummary: String(metadata.customerFacingSummary || "").trim() || null,
      moderationHistory,
    };
  }

  private buildBlankTemplate() {
    return {
      id: BLANK_TEMPLATE_ID,
      key: "blank",
      name: "Start from blank",
      tradeCategory: "GENERAL",
      description: "Begin with a blank job sheet and customise it for this workspace.",
      status: "approved",
      isPublished: true,
      version: 1,
      metadata: this.normalizeMetadata({
        premiumStarter: false,
        featured: false,
        bestFor: ["Operators starting from scratch", "Highly custom workflows"],
        workflowTags: ["blank-canvas", "owner-customisable"],
        estimatedSetupMinutes: 15,
        setupComplexity: "balanced",
        editorialTone: "Open canvas for teams that want to shape every section themselves.",
        customerFacingSummary: "Starts intentionally light so each workspace can define its own handover rhythm.",
        mockPreview: "A single summary section gives the workspace a clean place to begin.",
      }),
      payload: this.normalizePayload({
        declarationText:
          "I confirm the details above are correct and consent to this service record being stored and shared for completion.",
        serviceTypes: [{ id: "general_service", name: "General service", enabled: true, retired: false, order: 0 }],
        sections: [{ id: "job_summary", title: "Job summary", description: "Capture the important details for this service.", visible: true, order: 0 }],
        fields: [{ id: "field_work_summary", key: "work_summary", label: "Work summary", type: "textarea", required: true, visible: true, sectionId: "job_summary", order: 0 }],
        completionChecks: ["Work summary completed"],
        customerSummaryFields: ["work_summary"],
      }),
    };
  }

  private serializeTemplateRow(row: any) {
    const metadata = this.normalizeMetadata(row.metadataJson);
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      tradeCategory: row.tradeCategory,
      description: row.description || null,
      status: row.status,
      isPublished: Boolean(row.isPublished),
      isArchived: Boolean(row.isArchived),
      version: Number(row.version || 1),
      approvalNotes: row.approvalNotes || null,
      reviewNotes: row.reviewNotes || null,
      approvedAt: row.approvedAt || null,
      publishedAt: row.publishedAt || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      submittedByTenantId: row.submittedByTenantId || null,
      submittedByUserId: row.submittedByUserId || null,
      approvedByUserId: row.approvedByUserId || null,
      metadata,
      payload: this.normalizePayload(row.payloadJson, row.tradeCategory),
    };
  }

  private async ensureStarterTemplates() {
    const db = this.prisma as any;
    for (const starter of STARTER_TEMPLATES) {
      await db.jobSheetTemplate.upsert({
        where: { key: starter.key },
        update: {
          name: starter.name,
          tradeCategory: starter.tradeCategory,
          description: starter.description,
          status: "approved",
          isPublished: true,
          isArchived: false,
          version: 1,
          payloadJson: starter.payload,
          metadataJson: starter.metadata,
          publishedAt: new Date(),
        },
        create: {
          key: starter.key,
          name: starter.name,
          tradeCategory: starter.tradeCategory,
          description: starter.description,
          status: "approved",
          isPublished: true,
          isArchived: false,
          version: 1,
          payloadJson: starter.payload,
          metadataJson: starter.metadata,
          publishedAt: new Date(),
        },
      });
    }
  }

  private async appendTemplateHistory(input: {
    templateId: string;
    userId?: string | null;
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    notes?: string | null;
    metadata?: Record<string, any> | null;
  }) {
    const db = this.prisma as any;
    await db.jobSheetTemplateHistory.create({
      data: {
        templateId: input.templateId,
        createdByUserId: input.userId || null,
        action: input.action,
        fromStatus: input.fromStatus || null,
        toStatus: input.toStatus || null,
        notes: input.notes || null,
        metadataJson: input.metadata || undefined,
      },
    });
  }

  private async loadTemplateHistory(templateIds: string[]) {
    const db = this.prisma as any;
    if (!templateIds.length) return new Map<string, any[]>();
    const rows = await db.jobSheetTemplateHistory.findMany({
      where: { templateId: { in: templateIds } },
      orderBy: [{ createdAt: "desc" }],
    });
    const grouped = new Map<string, any[]>();
    for (const row of rows) {
      const current = grouped.get(row.templateId) || [];
      current.push(row);
      grouped.set(row.templateId, current);
    }
    return grouped;
  }

  async ensureWheelsDefaultTemplate() {
    const db = this.prisma as any;
    const template = await db.formTemplate.upsert({
      where: {
        tradeCode_version: {
          tradeCode: WHEELS_TEMPLATE_META.tradeCode,
          version: WHEELS_TEMPLATE_META.version,
        },
      },
      update: {
        name: WHEELS_TEMPLATE_META.name,
        isDefault: true,
      },
      create: {
        tradeCode: WHEELS_TEMPLATE_META.tradeCode,
        version: WHEELS_TEMPLATE_META.version,
        name: WHEELS_TEMPLATE_META.name,
        isDefault: true,
      },
    });

    await Promise.all(
      WHEELS_TEMPLATE_FIELDS.map((field, index) =>
        db.formField.upsert({
          where: {
            templateId_key: {
              templateId: template.id,
              key: field.key,
            },
          },
          update: {
            label: field.label,
            type: field.type,
            required: Boolean(field.required),
            optionsJson: field.options ?? null,
            fieldOrder: index,
            group: field.group,
          },
          create: {
            templateId: template.id,
            key: field.key,
            label: field.label,
            type: field.type,
            required: Boolean(field.required),
            optionsJson: field.options ?? null,
            fieldOrder: index,
            group: field.group,
          },
        }),
      ),
    );

    return template;
  }

  async getDefaultTemplate(tenantId: string, trade = WHEELS_TEMPLATE_TRADE) {
    this.requireFeature();
    const db = this.prisma as any;

    if (trade !== WHEELS_TEMPLATE_TRADE) {
      return { template: null, fields: [] };
    }

    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    if (settings?.primaryTrade !== WHEELS_TEMPLATE_TRADE) {
      return { template: null, fields: [], reason: "Primary trade is not WHEELS" };
    }

    const template = await this.ensureWheelsDefaultTemplate();
    const fields = await db.formField.findMany({
      where: { templateId: template.id },
      orderBy: { fieldOrder: "asc" },
    });

    return {
      template,
      fields,
    };
  }

  async getTemplateLibrary(tenantId: string) {
    await this.ensureStarterTemplates();
    const db = this.prisma as any;
    const [rows, settings] = await Promise.all([
      db.jobSheetTemplate.findMany({
        where: {
          isArchived: false,
          OR: [
            { status: "approved", isPublished: true },
            { submittedByTenantId: tenantId },
          ],
        },
        orderBy: [{ isPublished: "desc" }, { tradeCategory: "asc" }, { name: "asc" }],
      }),
      db.tenantSetting.findUnique({
        where: { tenantId },
        select: {
          activeJobSheetTemplateId: true,
          activeJobSheetTemplateName: true,
          activeJobSheetTemplateTrade: true,
          activeJobSheetTemplateVersion: true,
          businessConfigJson: true,
          primaryTrade: true,
          defaultServiceNamePresets: true,
        },
      }),
    ]);

    const historyMap = await this.loadTemplateHistory(rows.map((row: any) => row.id));
    const serializedRows = rows.map((row: any) => {
      const serialized = this.serializeTemplateRow(row);
      return {
        ...serialized,
        metadata: {
          ...serialized.metadata,
          moderationHistory: (historyMap.get(row.id) || []).map((entry: any) => ({
            action: entry.action,
            createdAt: entry.createdAt,
            createdByUserId: entry.createdByUserId || null,
            fromStatus: entry.fromStatus || null,
            toStatus: entry.toStatus || null,
            notes: entry.notes || null,
          })),
        },
      };
    });
    const publishedRows = serializedRows.filter((row: any) => row.status === "approved" && row.isPublished);
    const tradePopularity = new Map<string, number>();
    for (const row of publishedRows) {
      tradePopularity.set(row.tradeCategory, (tradePopularity.get(row.tradeCategory) || 0) + 1);
    }
    return {
      activeTemplate: {
        id: settings?.activeJobSheetTemplateId || null,
        name: settings?.activeJobSheetTemplateName || null,
        tradeCategory: settings?.activeJobSheetTemplateTrade || null,
        version: settings?.activeJobSheetTemplateVersion || null,
      },
      currentWorkspaceForm: getWorkspaceJobForms(settings),
      templates: [this.buildBlankTemplate(), ...serializedRows],
      curated: {
        featured: publishedRows.filter((row: any) => row.metadata?.featured).slice(0, 6),
        recentlyApproved: [...publishedRows]
          .filter((row: any) => row.approvedAt)
          .sort((a: any, b: any) => new Date(b.approvedAt || b.updatedAt).getTime() - new Date(a.approvedAt || a.updatedAt).getTime())
          .slice(0, 6),
        premiumStarters: publishedRows.filter((row: any) => row.metadata?.premiumStarter).slice(0, 6),
        popularByTrade: Array.from(tradePopularity.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([tradeCategory, count]) => ({
            tradeCategory,
            count,
            templates: publishedRows.filter((row: any) => row.tradeCategory === tradeCategory).slice(0, 4),
          })),
      },
    };
  }

  async applyTemplateToWorkspace(tenantId: string, userId: string, templateId: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({
      where: { tenantId },
      select: { businessConfigJson: true },
    });
    let selected: any;
    if (templateId === BLANK_TEMPLATE_ID) {
      selected = this.buildBlankTemplate();
    } else {
      const row = await db.jobSheetTemplate.findUnique({ where: { id: templateId } });
      if (!row || row.isArchived) {
        throw new NotFoundException("Template not found");
      }
      if (row.status !== "approved" && row.submittedByTenantId !== tenantId) {
        throw new NotFoundException("Template not available");
      }
      selected = this.serializeTemplateRow(row);
    }

    const currentConfig =
      settings?.businessConfigJson && typeof settings.businessConfigJson === "object" ? settings.businessConfigJson : {};
    const payload = this.normalizePayload(selected.payload, selected.tradeCategory);

    await db.tenantSetting.upsert({
      where: { tenantId },
      update: {
        primaryTrade: selected.tradeCategory === "GENERAL" ? "GENERAL" : selected.tradeCategory,
        activeJobSheetTemplateId: selected.id,
        activeJobSheetTemplateName: selected.name,
        activeJobSheetTemplateTrade: selected.tradeCategory,
        activeJobSheetTemplateVersion: Number(selected.version || 1),
        businessConfigJson: {
          ...currentConfig,
          jobForms: {
            declarationText: payload.declarationText,
            serviceTypes: payload.serviceTypes,
            sections: payload.sections,
            fields: payload.fields,
          },
          jobFormsMeta: {
            ...(currentConfig as any).jobFormsMeta,
            completionChecks: payload.completionChecks,
            proofRequirements: payload.proofRequirements,
            customerSummaryFields: payload.customerSummaryFields,
            safePreview: {
              serviceTypeCount: payload.serviceTypes.length,
              sectionCount: payload.sections.length,
              fieldCount: payload.fields.length,
            },
          },
        },
      },
      create: {
        tenantId,
        primaryTrade: selected.tradeCategory === "GENERAL" ? "GENERAL" : selected.tradeCategory,
        activeJobSheetTemplateId: selected.id,
        activeJobSheetTemplateName: selected.name,
        activeJobSheetTemplateTrade: selected.tradeCategory,
        activeJobSheetTemplateVersion: Number(selected.version || 1),
        businessConfigJson: {
          jobForms: {
            declarationText: payload.declarationText,
            serviceTypes: payload.serviceTypes,
            sections: payload.sections,
            fields: payload.fields,
          },
          jobFormsMeta: {
            completionChecks: payload.completionChecks,
            proofRequirements: payload.proofRequirements,
            customerSummaryFields: payload.customerSummaryFields,
            safePreview: {
              serviceTypeCount: payload.serviceTypes.length,
              sectionCount: payload.sections.length,
              fieldCount: payload.fields.length,
            },
          },
        },
      },
    });

    await this.audit.log(tenantId, "job_sheet.template.apply", `Applied job sheet template ${selected.name}`, userId);
    return {
      ok: true,
      appliedTemplate: {
        id: selected.id,
        name: selected.name,
        tradeCategory: selected.tradeCategory,
        version: Number(selected.version || 1),
      },
      payload,
    };
  }

  async submitTemplateProposal(tenantId: string, userId: string, input: Record<string, any>) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({
      where: { tenantId },
      select: {
        companyName: true,
        primaryTrade: true,
        businessConfigJson: true,
        defaultServiceNamePresets: true,
      },
    });
    const existingForms = getWorkspaceJobForms(settings);
    const payload = this.normalizePayload(
      input.payload && typeof input.payload === "object"
        ? input.payload
        : {
            declarationText: existingForms.declarationText,
            serviceTypes: existingForms.serviceTypes,
            sections: existingForms.sections,
            fields: existingForms.fields,
            completionChecks: (settings?.businessConfigJson as any)?.jobFormsMeta?.completionChecks,
            proofRequirements: (settings?.businessConfigJson as any)?.jobFormsMeta?.proofRequirements,
            customerSummaryFields: (settings?.businessConfigJson as any)?.jobFormsMeta?.customerSummaryFields,
          },
      String(input.tradeCategory || settings?.primaryTrade || "GENERAL"),
    );
    const tradeCategory = String(input.tradeCategory || settings?.primaryTrade || "GENERAL").trim().toUpperCase() || "GENERAL";
    const name = String(input.name || "").trim() || `${settings?.companyName || "Workspace"} template`;
    const description = String(input.description || "").trim() || null;

    const created = await db.jobSheetTemplate.create({
      data: {
        key: `${slugify(name)}_${Date.now()}`,
        name,
        tradeCategory,
        description,
        status: "submitted",
        isPublished: false,
        isArchived: false,
        version: 1,
        payloadJson: payload,
        metadataJson: this.normalizeMetadata({
          featured: false,
          premiumStarter: false,
          bestFor: normalizeStringList(input.bestFor),
          workflowTags: normalizeStringList(input.workflowTags),
          estimatedSetupMinutes:
            input.estimatedSetupMinutes == null || input.estimatedSetupMinutes === ""
              ? null
              : Math.max(1, Number(input.estimatedSetupMinutes)),
          setupComplexity: ["fast", "balanced", "advanced"].includes(String(input.setupComplexity || "").trim())
            ? String(input.setupComplexity).trim()
            : "balanced",
          editorialTone: String(input.editorialTone || "").trim() || "Submitted from a live workspace workflow.",
          customerFacingSummary:
            String(input.customerFacingSummary || "").trim() ||
            "Workspace-submitted template proposed for wider platform use.",
          mockPreview: String(input.mockPreview || "").trim() || null,
        }),
        submittedByTenantId: tenantId,
        submittedByUserId: userId,
      },
    });
    await this.appendTemplateHistory({
      templateId: created.id,
      userId,
      action: "submitted",
      fromStatus: "draft",
      toStatus: "submitted",
      notes: "Workspace template submitted for platform review.",
      metadata: { tradeCategory },
    });

    await this.audit.log(tenantId, "job_sheet.template.submit", `Submitted job sheet template ${name}`, userId);
    return {
      ok: true,
      template: this.serializeTemplateRow(created),
    };
  }

  async getAdminTemplateQueue() {
    await this.ensureStarterTemplates();
    const db = this.prisma as any;
    const rows = await db.jobSheetTemplate.findMany({
      where: { isArchived: false },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    });
    const historyMap = await this.loadTemplateHistory(rows.map((row: any) => row.id));
    const templates = rows.map((row: any) => {
      const serialized = this.serializeTemplateRow(row);
      const history = (historyMap.get(row.id) || []).map((entry: any) => ({
        action: entry.action,
        createdAt: entry.createdAt,
        createdByUserId: entry.createdByUserId || null,
        fromStatus: entry.fromStatus || null,
        toStatus: entry.toStatus || null,
        notes: entry.notes || null,
      }));
      return {
        ...serialized,
        metadata: {
          ...serialized.metadata,
          moderationHistory: history,
        },
        rollbackVisibility: history.length > 1,
      };
    });
    return {
      templates,
      summary: {
        submitted: templates.filter((template: any) => template.status === "submitted").length,
        approved: templates.filter((template: any) => template.status === "approved").length,
        needsChanges: templates.filter((template: any) => template.status === "needs_changes").length,
        rejected: templates.filter((template: any) => template.status === "rejected").length,
        published: templates.filter((template: any) => template.isPublished).length,
      },
    };
  }

  async reviewTemplate(templateId: string, userId: string, input: Record<string, any>) {
    const db = this.prisma as any;
    const current = await db.jobSheetTemplate.findUnique({ where: { id: templateId } });
    if (!current) {
      throw new NotFoundException("Template not found");
    }
    const nextStatus = String(input.status || current.status).trim() || current.status;
    const publish = input.publish === true || nextStatus === "approved";
    const archived = input.archive === true;
    const existingMetadata = this.normalizeMetadata(current.metadataJson);
    const updatedMetadata = this.normalizeMetadata({
      ...existingMetadata,
      featured: input.featured == null ? existingMetadata.featured : input.featured === true,
      premiumStarter: input.premiumStarter == null ? existingMetadata.premiumStarter : input.premiumStarter === true,
      bestFor: input.bestFor == null ? existingMetadata.bestFor : input.bestFor,
      workflowTags: input.workflowTags == null ? existingMetadata.workflowTags : input.workflowTags,
      estimatedSetupMinutes:
        input.estimatedSetupMinutes == null ? existingMetadata.estimatedSetupMinutes : Number(input.estimatedSetupMinutes),
      setupComplexity: input.setupComplexity == null ? existingMetadata.setupComplexity : input.setupComplexity,
      editorialTone: input.editorialTone == null ? existingMetadata.editorialTone : input.editorialTone,
      customerFacingSummary: input.customerFacingSummary == null ? existingMetadata.customerFacingSummary : input.customerFacingSummary,
      mockPreview: input.mockPreview == null ? existingMetadata.mockPreview : input.mockPreview,
    });
    const historyAction =
      archived ? "archived" : input.publish === false ? "unpublished" : input.publish === true ? "published" : "reviewed";
    const updated = await db.jobSheetTemplate.update({
      where: { id: templateId },
      data: {
        status: nextStatus,
        isPublished: archived ? false : publish,
        isArchived: archived,
        approvalNotes: String(input.approvalNotes || "").trim() || null,
        reviewNotes: String(input.reviewNotes || "").trim() || null,
        approvedByUserId: nextStatus === "approved" ? userId : null,
        approvedAt: nextStatus === "approved" ? new Date() : null,
        publishedAt: publish && !archived ? new Date() : null,
        metadataJson: updatedMetadata,
      },
    });
    await this.appendTemplateHistory({
      templateId,
      userId,
      action: historyAction,
      fromStatus: current.status,
      toStatus: nextStatus,
      notes:
        String(input.approvalNotes || "").trim() ||
        String(input.reviewNotes || "").trim() ||
        (archived ? "Archived from the curated catalogue." : historyAction === "published" ? "Published to the curated catalogue." : historyAction === "unpublished" ? "Removed from the curated catalogue." : "Moderation state updated."),
      metadata: {
        published: publish && !archived,
        archived,
      },
    });
    await this.audit.log(updated.submittedByTenantId || "platform", "job_sheet.template.review", `Reviewed job sheet template ${updated.name}: ${nextStatus}`, userId);
    return { ok: true, template: this.serializeTemplateRow(updated) };
  }
}
