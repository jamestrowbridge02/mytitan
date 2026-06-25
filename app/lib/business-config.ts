import type { TenantSettings } from "./tenant-settings";

export type BusinessConfig = NonNullable<TenantSettings["businessConfigJson"]>;

export type BusinessTerms = {
  jobs: string;
  bookings: string;
  customers: string;
  technicians: string;
};

export const SAFE_JOB_FORM_FIELD_TYPES = ["text", "textarea", "select", "checkbox", "number", "date"] as const;
export type SafeJobFormFieldType = (typeof SAFE_JOB_FORM_FIELD_TYPES)[number];

export type WorkspaceServiceTypeConfig = {
  id: string;
  name: string;
  description?: string | null;
  enabled?: boolean | null;
  retired?: boolean | null;
  order?: number | null;
};

export type WorkspaceJobFormSectionConfig = {
  id: string;
  title: string;
  description?: string | null;
  order?: number | null;
  visible?: boolean | null;
  serviceTypeIds?: string[] | null;
};

export type WorkspaceJobFormFieldConfig = {
  id: string;
  key: string;
  sectionId: string;
  label: string;
  helpText?: string | null;
  type: SafeJobFormFieldType;
  required?: boolean | null;
  visible?: boolean | null;
  order?: number | null;
  options?: string[] | null;
  serviceTypeIds?: string[] | null;
};

export type WorkspaceJobFormsConfig = {
  declarationText?: string | null;
  serviceTypes?: WorkspaceServiceTypeConfig[] | null;
  sections?: WorkspaceJobFormSectionConfig[] | null;
  fields?: WorkspaceJobFormFieldConfig[] | null;
};

export type ServiceRecordEmailSettings = {
  defaultRecipients: string[];
  includeJobCustomerEmail: boolean;
  includeBusinessDetails: boolean;
  includeContactDetails: boolean;
  includeBillingDetails: boolean;
  includePaymentSummary: boolean;
  includeEvidenceSummary: boolean;
  includeSignatureSummary: boolean;
  includePortalLink: boolean;
  includePdfLink: boolean;
  signatureEnabled: boolean;
  signatureText: string | null;
};

export const INTERNAL_NOTIFICATION_CATEGORIES = [
  "bookings",
  "payments",
  "jobs",
  "customer_messages",
  "workspace_alerts",
] as const;

export type InternalNotificationCategory = (typeof INTERNAL_NOTIFICATION_CATEGORIES)[number];

export type InternalNotificationRecipient = {
  email: string;
  label: string | null;
  enabled: boolean;
  categories: InternalNotificationCategory[];
};

export type InternalNotificationSettings = {
  internalRecipients: InternalNotificationRecipient[];
};

export const SUMMARY_EMAIL_CADENCES = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "annual",
] as const;

export type SummaryEmailCadence = (typeof SUMMARY_EMAIL_CADENCES)[number];

export const SUMMARY_EMAIL_SECTIONS = [
  "bookings",
  "jobs",
  "payments",
  "failed_sends",
  "upcoming_work",
  "tax_reminders",
] as const;

export type SummaryEmailSection = (typeof SUMMARY_EMAIL_SECTIONS)[number];

export type SummaryEmailSettings = {
  enabled: boolean;
  enabledCadences: SummaryEmailCadence[];
  enabledSections: SummaryEmailSection[];
  lastDispatchedAtByCadence: Partial<Record<SummaryEmailCadence, string>>;
};

export const OPERATIONAL_ALERT_CATEGORIES = [
  "failed_email",
  "failed_summary_dispatch",
  "failed_booking",
  "failed_payment",
  "failed_refund",
  "failed_webhook",
  "failed_backup",
  "health_degraded",
] as const;

export type OperationalAlertCategory = (typeof OPERATIONAL_ALERT_CATEGORIES)[number];

export type OperationalAlertSettings = {
  externalEmailRecipients: string[];
  enabledCategories: OperationalAlertCategory[];
};

export type CustomerFeedbackSettings = {
  enabled: boolean;
  promptText: string | null;
  publicReviewUrl: string | null;
  thankYouText: string | null;
};

const DEFAULT_SERVICE_RECORD_EMAIL_SETTINGS: ServiceRecordEmailSettings = {
  defaultRecipients: [],
  includeJobCustomerEmail: true,
  includeBusinessDetails: true,
  includeContactDetails: true,
  includeBillingDetails: false,
  includePaymentSummary: true,
  includeEvidenceSummary: true,
  includeSignatureSummary: true,
  includePortalLink: true,
  includePdfLink: true,
  signatureEnabled: false,
  signatureText: null,
};

const DEFAULT_INTERNAL_NOTIFICATION_SETTINGS: InternalNotificationSettings = {
  internalRecipients: [],
};

const DEFAULT_SUMMARY_EMAIL_SETTINGS: SummaryEmailSettings = {
  enabled: false,
  enabledCadences: ["weekly"],
  enabledSections: ["bookings", "jobs", "payments", "failed_sends", "upcoming_work", "tax_reminders"],
  lastDispatchedAtByCadence: {},
};

const DEFAULT_OPERATIONAL_ALERT_SETTINGS: OperationalAlertSettings = {
  externalEmailRecipients: [],
  enabledCategories: [...OPERATIONAL_ALERT_CATEGORIES],
};

const DEFAULT_CUSTOMER_FEEDBACK_SETTINGS: CustomerFeedbackSettings = {
  enabled: false,
  promptText: "If the work went well, you can leave a quick rating or review for the team.",
  publicReviewUrl: null,
  thankYouText: "Thanks for taking a moment to share feedback with the team.",
};

function classifyNonRoutableRecipientEmail(email?: string | null) {
  const domain = String(email || "").trim().toLowerCase().split("@")[1] || "";
  if (!domain) return null;
  if (domain === "localhost") return "localhost";
  if (domain.endsWith(".local")) return ".local";
  if (domain.endsWith(".test")) return ".test";
  return null;
}

function normalizeNotificationLabel(value: unknown) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return normalized || null;
}

function normalizeNotificationCategories(values: unknown) {
  const input = Array.isArray(values) ? values : [];
  const categories = input
    .map((entry) => String(entry || "").trim())
    .filter((entry): entry is InternalNotificationCategory => INTERNAL_NOTIFICATION_CATEGORIES.includes(entry as InternalNotificationCategory));
  return Array.from(new Set(categories));
}

function normalizeSummaryEmailCadences(values: unknown) {
  const input = Array.isArray(values) ? values : [];
  const cadences = input
    .map((entry) => String(entry || "").trim())
    .filter((entry): entry is SummaryEmailCadence => SUMMARY_EMAIL_CADENCES.includes(entry as SummaryEmailCadence));
  return Array.from(new Set(cadences));
}

function normalizeSummaryEmailSections(values: unknown) {
  const input = Array.isArray(values) ? values : [];
  const sections = input
    .map((entry) => String(entry || "").trim())
    .filter((entry): entry is SummaryEmailSection => SUMMARY_EMAIL_SECTIONS.includes(entry as SummaryEmailSection));
  return Array.from(new Set(sections));
}

function normalizeOperationalAlertCategories(values: unknown) {
  const input = Array.isArray(values) ? values : [];
  const categories = input
    .map((entry) => String(entry || "").trim())
    .filter((entry): entry is OperationalAlertCategory => OPERATIONAL_ALERT_CATEGORIES.includes(entry as OperationalAlertCategory));
  return Array.from(new Set(categories));
}

function normalizeOptionalHttpsUrl(value: unknown) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeOptionalFeedbackText(value: unknown, maxLength: number) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return normalized || null;
}

const DEFAULT_WHEELS_JOB_FORM_SECTIONS: WorkspaceJobFormSectionConfig[] = [
  {
    id: "wheel_service_details",
    title: "Wheel service details",
    description: "Record the wheel positions and worksheet notes needed for this service.",
    order: 0,
    visible: true,
    serviceTypeIds: [],
  },
];

const DEFAULT_WHEELS_JOB_FORM_FIELDS: WorkspaceJobFormFieldConfig[] = [
  {
    id: "wheel_nsf",
    key: "wheel_nsf",
    sectionId: "wheel_service_details",
    label: "NSF",
    helpText: "Near-side front wheel serviced.",
    type: "checkbox",
    required: false,
    visible: true,
    order: 0,
    options: [],
    serviceTypeIds: [],
  },
  {
    id: "wheel_nsr",
    key: "wheel_nsr",
    sectionId: "wheel_service_details",
    label: "NSR",
    helpText: "Near-side rear wheel serviced.",
    type: "checkbox",
    required: false,
    visible: true,
    order: 1,
    options: [],
    serviceTypeIds: [],
  },
  {
    id: "wheel_osf",
    key: "wheel_osf",
    sectionId: "wheel_service_details",
    label: "OSF",
    helpText: "Off-side front wheel serviced.",
    type: "checkbox",
    required: false,
    visible: true,
    order: 2,
    options: [],
    serviceTypeIds: [],
  },
  {
    id: "wheel_osr",
    key: "wheel_osr",
    sectionId: "wheel_service_details",
    label: "OSR",
    helpText: "Off-side rear wheel serviced.",
    type: "checkbox",
    required: false,
    visible: true,
    order: 3,
    options: [],
    serviceTypeIds: [],
  },
  {
    id: "wheel_spare",
    key: "wheel_spare",
    sectionId: "wheel_service_details",
    label: "Spare",
    helpText: "Spare wheel serviced.",
    type: "checkbox",
    required: false,
    visible: true,
    order: 4,
    options: [],
    serviceTypeIds: [],
  },
  {
    id: "loose_wheels",
    key: "looseWheels",
    sectionId: "wheel_service_details",
    label: "Loose wheels",
    helpText: "Select how many loose wheels were handled.",
    type: "select",
    required: false,
    visible: true,
    order: 5,
    options: ["x1", "x2", "x3", "x4", "x5", "clear"],
    serviceTypeIds: [],
  },
  {
    id: "worksheet_notes",
    key: "customerNotes",
    sectionId: "wheel_service_details",
    label: "Customer / job notes",
    helpText: "Customer-safe notes that can appear on the finished service record.",
    type: "textarea",
    required: false,
    visible: true,
    order: 6,
    options: [],
    serviceTypeIds: [],
  },
  {
    id: "worksheet_internal_notes",
    key: "internalNotes",
    sectionId: "wheel_service_details",
    label: "Internal notes",
    helpText: "Internal operator notes that stay on the submitted job only.",
    type: "textarea",
    required: false,
    visible: true,
    order: 7,
    options: [],
    serviceTypeIds: [],
  },
];

export const ANALYTICS_WIDGET_KEYS = [
  "executive-summary",
  "pressure-panel",
  "revenue-panel",
  "capacity-panel",
  "benchmark-delta",
  "customer-commercial-signals",
] as const;

export type AnalyticsWidgetKey = (typeof ANALYTICS_WIDGET_KEYS)[number];

export type AnalyticsWorkspaceLayout = {
  widgetOrder: AnalyticsWidgetKey[];
  hiddenWidgets: AnalyticsWidgetKey[];
  defaultWindowDays: number;
};

export const COMMAND_CENTRE_SECTION_KEYS = [
  "filters",
  "recent-updates",
  "bulk-actions",
  "work-board",
] as const;

export type CommandCentreSectionKey = (typeof COMMAND_CENTRE_SECTION_KEYS)[number];

export type CommandCentreWorkspaceLayout = {
  sectionOrder: CommandCentreSectionKey[];
  hiddenSections: CommandCentreSectionKey[];
  defaultViewMode: "kanban" | "list";
};

const DEFAULT_TERMS: BusinessTerms = {
  jobs: "Jobs",
  bookings: "Bookings",
  customers: "Customers",
  technicians: "Technicians",
};

export function getBusinessConfig(settings?: TenantSettings | null): BusinessConfig {
  const raw = settings?.businessConfigJson;
  if (!raw || typeof raw !== "object") return {};
  return raw;
}

export function getBusinessTerms(settings?: TenantSettings | null): BusinessTerms {
  const cfg = getBusinessConfig(settings);
  const terminology = cfg.terminology || {};
  return {
    jobs: String(terminology.jobs || DEFAULT_TERMS.jobs),
    bookings: String(terminology.bookings || DEFAULT_TERMS.bookings),
    customers: String(terminology.customers || DEFAULT_TERMS.customers),
    technicians: String(terminology.technicians || DEFAULT_TERMS.technicians),
  };
}

export function getCommandCentreHref(settings?: TenantSettings | null) {
  const version = getBusinessConfig(settings).defaults?.commandCentreVersion;
  return version === "v1" ? "/dashboard/command-centre" : "/dashboard/command-centre-v2";
}

export function getOptionalModuleVisibility(settings?: TenantSettings | null) {
  const navigation = getBusinessConfig(settings).navigation || {};
  return {
    showIntelligence: navigation.showIntelligence !== false,
    showPortalOps: navigation.showPortalOps !== false,
    showTechnicianQueue: navigation.showTechnicianQueue !== false,
  };
}

export function getPortalCopy(settings?: TenantSettings | null) {
  return getBusinessConfig(settings).portalCopy || {};
}

export function getServiceRecordEmailSettings(settings?: TenantSettings | null): ServiceRecordEmailSettings {
  const raw = getBusinessConfig(settings).serviceRecordEmail || {};
  const dedupedRecipients: string[] = Array.isArray((raw as any).defaultRecipients)
    ? Array.from(
        new Set(
          (raw as any).defaultRecipients
            .map((value: unknown) => String(value || "").trim().toLowerCase())
            .filter(Boolean),
        ),
      )
    : [];
  const signatureText = String((raw as any).signatureText || "")
    .replace(/\r\n/g, "\n")
    .trim();
  return {
    ...DEFAULT_SERVICE_RECORD_EMAIL_SETTINGS,
    defaultRecipients: dedupedRecipients,
    includeJobCustomerEmail: (raw as any).includeJobCustomerEmail !== false,
    includeBusinessDetails: (raw as any).includeBusinessDetails !== false,
    includeContactDetails: (raw as any).includeContactDetails !== false,
    includeBillingDetails: (raw as any).includeBillingDetails === true,
    includePaymentSummary: (raw as any).includePaymentSummary !== false,
    includeEvidenceSummary: (raw as any).includeEvidenceSummary !== false,
    includeSignatureSummary: (raw as any).includeSignatureSummary !== false,
    includePortalLink: (raw as any).includePortalLink !== false,
    includePdfLink: (raw as any).includePdfLink !== false,
    signatureEnabled: (raw as any).signatureEnabled === true,
    signatureText: signatureText || null,
  };
}

export function getInternalNotificationSettings(settings?: TenantSettings | null): InternalNotificationSettings {
  const raw = getBusinessConfig(settings).notificationRouting || {};
  const merged = new Map<string, InternalNotificationRecipient>();
  const rawRecipients = Array.isArray((raw as any).internalRecipients) ? (raw as any).internalRecipients : [];
  const legacyRecipients = Array.isArray(settings?.emailNotificationRecipients) ? settings?.emailNotificationRecipients : [];

  const rememberRecipient = (emailValue: unknown, source: { label?: unknown; enabled?: unknown; categories?: unknown } = {}) => {
    const email = String(emailValue || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (classifyNonRoutableRecipientEmail(email)) return;
    const existing = merged.get(email);
    const categories = normalizeNotificationCategories(source.categories);
    const nextCategories = categories.length ? categories : [...INTERNAL_NOTIFICATION_CATEGORIES];
    merged.set(email, {
      email,
      label: existing?.label || normalizeNotificationLabel(source.label),
      enabled: existing ? existing.enabled || source.enabled !== false : source.enabled !== false,
      categories: Array.from(new Set([...(existing?.categories || []), ...nextCategories])),
    });
  };

  for (const entry of rawRecipients) {
    rememberRecipient((entry as any)?.email, entry as any);
  }
  for (const legacyEmail of legacyRecipients) {
    rememberRecipient(legacyEmail, {
      enabled: true,
      categories: INTERNAL_NOTIFICATION_CATEGORIES,
    });
  }

  return {
    ...DEFAULT_INTERNAL_NOTIFICATION_SETTINGS,
    internalRecipients: Array.from(merged.values()),
  };
}

export function getSummaryEmailSettings(settings?: TenantSettings | null): SummaryEmailSettings {
  const raw = getBusinessConfig(settings).summaryEmails || {};
  const enabledCadences = normalizeSummaryEmailCadences((raw as any).enabledCadences);
  const enabledSections = normalizeSummaryEmailSections((raw as any).enabledSections);
  const lastDispatchedAtByCadence = Object.fromEntries(
    SUMMARY_EMAIL_CADENCES.map((cadence) => {
      const value = String((raw as any).lastDispatchedAtByCadence?.[cadence] || "").trim();
      const parsed = value ? new Date(value) : null;
      return [cadence, parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : undefined];
    }).filter((entry) => Boolean(entry[1])),
  ) as Partial<Record<SummaryEmailCadence, string>>;

  return {
    ...DEFAULT_SUMMARY_EMAIL_SETTINGS,
    enabled: (raw as any).enabled === true,
    enabledCadences: enabledCadences.length ? enabledCadences : [...DEFAULT_SUMMARY_EMAIL_SETTINGS.enabledCadences],
    enabledSections: enabledSections.length ? enabledSections : [...DEFAULT_SUMMARY_EMAIL_SETTINGS.enabledSections],
    lastDispatchedAtByCadence,
  };
}

export function getOperationalAlertSettings(settings?: TenantSettings | null): OperationalAlertSettings {
  const raw = getBusinessConfig(settings).operationalAlerts || {};
  const enabledCategories = normalizeOperationalAlertCategories((raw as any).enabledCategories);
  return {
    ...DEFAULT_OPERATIONAL_ALERT_SETTINGS,
    externalEmailRecipients: Array.isArray((raw as any).externalEmailRecipients)
      ? Array.from(
          new Set(
            (raw as any).externalEmailRecipients
              .map((value: unknown) => String(value || "").trim().toLowerCase())
              .filter((email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
              .filter((email: string) => !classifyNonRoutableRecipientEmail(email)),
          ),
        )
      : [],
    enabledCategories: enabledCategories.length ? enabledCategories : [...DEFAULT_OPERATIONAL_ALERT_SETTINGS.enabledCategories],
  };
}

export function getCustomerFeedbackSettings(settings?: TenantSettings | null): CustomerFeedbackSettings {
  const raw = getBusinessConfig(settings).customerFeedback || {};
  return {
    ...DEFAULT_CUSTOMER_FEEDBACK_SETTINGS,
    enabled: (raw as any).enabled === true,
    promptText:
      normalizeOptionalFeedbackText((raw as any).promptText, 180) ||
      DEFAULT_CUSTOMER_FEEDBACK_SETTINGS.promptText,
    publicReviewUrl: normalizeOptionalHttpsUrl((raw as any).publicReviewUrl),
    thankYouText:
      normalizeOptionalFeedbackText((raw as any).thankYouText, 180) ||
      DEFAULT_CUSTOMER_FEEDBACK_SETTINGS.thankYouText,
  };
}

export function getAnalyticsWorkspaceLayout(settings?: TenantSettings | null): AnalyticsWorkspaceLayout {
  const analytics = getBusinessConfig(settings).analytics || {};
  const widgetOrder = Array.isArray((analytics as any).widgetOrder)
    ? (analytics as any).widgetOrder.map((item: unknown) => String(item || "").trim()).filter((item: string): item is AnalyticsWidgetKey => ANALYTICS_WIDGET_KEYS.includes(item as AnalyticsWidgetKey))
    : [];
  const hiddenWidgets = Array.isArray((analytics as any).hiddenWidgets)
    ? (analytics as any).hiddenWidgets.map((item: unknown) => String(item || "").trim()).filter((item: string): item is AnalyticsWidgetKey => ANALYTICS_WIDGET_KEYS.includes(item as AnalyticsWidgetKey))
    : [];
  return {
    widgetOrder: Array.from(new Set([...widgetOrder, ...ANALYTICS_WIDGET_KEYS])) as AnalyticsWidgetKey[],
    hiddenWidgets: Array.from(new Set(hiddenWidgets)),
    defaultWindowDays: Math.max(7, Math.min(90, Number((analytics as any).defaultWindowDays || 30))),
  };
}

export function getCommandCentreWorkspaceLayout(settings?: TenantSettings | null): CommandCentreWorkspaceLayout {
  const commandCentre = getBusinessConfig(settings).commandCentre || {};
  const sectionOrder = Array.isArray((commandCentre as any).sectionOrder)
    ? (commandCentre as any).sectionOrder.map((item: unknown) => String(item || "").trim()).filter((item: string): item is CommandCentreSectionKey => COMMAND_CENTRE_SECTION_KEYS.includes(item as CommandCentreSectionKey))
    : [];
  const hiddenSections = Array.isArray((commandCentre as any).hiddenSections)
    ? (commandCentre as any).hiddenSections.map((item: unknown) => String(item || "").trim()).filter((item: string): item is CommandCentreSectionKey => COMMAND_CENTRE_SECTION_KEYS.includes(item as CommandCentreSectionKey))
    : [];
  const defaultViewMode = (commandCentre as any).defaultViewMode === "list" ? "list" : "kanban";
  return {
    sectionOrder: Array.from(new Set([...sectionOrder, ...COMMAND_CENTRE_SECTION_KEYS])) as CommandCentreSectionKey[],
    hiddenSections: Array.from(new Set(hiddenSections.filter((item: CommandCentreSectionKey) => item !== "filters" && item !== "work-board"))),
    defaultViewMode,
  };
}

export function getJobDeclarationText(settings?: TenantSettings | null) {
  const value = getBusinessConfig(settings).jobForms?.declarationText;
  const text = String(value || "").trim();
  if (text) return text;
  return "I confirm the details above are correct and consent to this service record being stored and shared for completion.";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "service_type";
}

function defaultServiceTypeNames(settings?: TenantSettings | null) {
  const presets = Array.isArray(settings?.defaultServiceNamePresets)
    ? settings?.defaultServiceNamePresets.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (presets.length > 0) return presets;
  if ((settings?.primaryTrade || "").toUpperCase() === "WHEELS") {
    return ["Tyre Change", "Puncture Repair", "Wheel Swap", "Balancing", "TPMS"];
  }
  return ["General Service"];
}

export function getWorkspaceJobForms(settings?: TenantSettings | null): WorkspaceJobFormsConfig {
  const config = getBusinessConfig(settings).jobForms || {};
  const hasExplicitServiceTypes = Object.prototype.hasOwnProperty.call(config, "serviceTypes");
  const hasExplicitSections = Object.prototype.hasOwnProperty.call(config, "sections");
  const hasExplicitFields = Object.prototype.hasOwnProperty.call(config, "fields");
  const rawServiceTypes = Array.isArray(config.serviceTypes) ? config.serviceTypes : [];
  const serviceTypes =
    hasExplicitServiceTypes
      ? rawServiceTypes
          .map((item, index) => ({
            id: String(item?.id || `service_type_${index + 1}`),
            name: String(item?.name || "").trim(),
            description: item?.description ? String(item.description) : null,
            enabled: item?.enabled !== false,
            retired: item?.retired === true,
            order: Number(item?.order ?? index),
          }))
          .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0))
      : defaultServiceTypeNames(settings).map((name, index) => ({
          id: slugify(name),
          name,
          description: null,
          enabled: true,
          retired: false,
          order: index,
        }));

  const rawSections =
    Array.isArray(config.sections)
      ? config.sections
      : !hasExplicitSections && (settings?.primaryTrade || "").toUpperCase() === "WHEELS"
        ? DEFAULT_WHEELS_JOB_FORM_SECTIONS
        : [];
  const sections = rawSections
    .map((item, index) => ({
      id: String(item?.id || `section_${index + 1}`),
      title: String(item?.title || "").trim(),
      description: item?.description ? String(item.description) : null,
      order: Number(item?.order ?? index),
      visible: item?.visible !== false,
      serviceTypeIds: Array.isArray(item?.serviceTypeIds) ? item.serviceTypeIds.map((value: unknown) => String(value || "").trim()).filter(Boolean) : [],
    }))
    .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0));

  const rawFields =
    Array.isArray(config.fields)
      ? config.fields
      : !hasExplicitFields && (settings?.primaryTrade || "").toUpperCase() === "WHEELS"
        ? DEFAULT_WHEELS_JOB_FORM_FIELDS
        : [];
  const fields = rawFields
    .map((item, index) => ({
      id: String(item?.id || `field_${index + 1}`),
      key: String(item?.key || "").trim(),
      sectionId: String(item?.sectionId || "").trim(),
      label: String(item?.label || "").trim(),
      helpText: item?.helpText ? String(item.helpText) : null,
      type: SAFE_JOB_FORM_FIELD_TYPES.includes(item?.type as SafeJobFormFieldType) ? (item.type as SafeJobFormFieldType) : "text",
      required: item?.required === true,
      visible: item?.visible !== false,
      order: Number(item?.order ?? index),
      options: Array.isArray(item?.options) ? item.options.map((value: unknown) => String(value || "").trim()).filter(Boolean) : [],
      serviceTypeIds: Array.isArray(item?.serviceTypeIds) ? item.serviceTypeIds.map((value: unknown) => String(value || "").trim()).filter(Boolean) : [],
    }))
    .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0));

  return {
    declarationText: config.declarationText || null,
    serviceTypes,
    sections,
    fields,
  };
}

export function getActiveWorkspaceServiceTypes(settings?: TenantSettings | null) {
  return getWorkspaceJobForms(settings).serviceTypes?.filter(
    (item) => item.enabled !== false && item.retired !== true && String(item.name || "").trim().length > 0,
  ) || [];
}

export function getTechnicianChecklistPrompts(settings?: TenantSettings | null) {
  const checklist = getBusinessConfig(settings).technicianPrompts?.checklist;
  return Array.isArray(checklist) ? checklist.map((item) => String(item || "").trim()).filter(Boolean) : [];
}
