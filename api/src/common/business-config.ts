import { classifyNonRoutableRecipientEmail } from "./email-recipient-hygiene";

export type BusinessConfig = {
  workflowStages?: {
    bookings?: Array<{ id: string; label?: string | null; statuses?: string[] | null; visible?: boolean | null; requiredCustomFieldKeys?: string[] | null; requiredFieldEnforcementMode?: "warn" | "block" | null }> | null;
    jobs?: Array<{ id: string; label?: string | null; statuses?: string[] | null; visible?: boolean | null; requiredCustomFieldKeys?: string[] | null; requiredFieldEnforcementMode?: "warn" | "block" | null }> | null;
    technician?: Array<{ id: string; label?: string | null; statuses?: string[] | null; visible?: boolean | null; requiredCustomFieldKeys?: string[] | null; requiredFieldEnforcementMode?: "warn" | "block" | null }> | null;
  } | null;
  terminology?: {
    jobs?: string | null;
    bookings?: string | null;
    customers?: string | null;
    technicians?: string | null;
  } | null;
  defaults?: {
    commandCentreVersion?: "v1" | "v2" | null;
  } | null;
  navigation?: {
    showIntelligence?: boolean;
    showPortalOps?: boolean;
    showTechnicianQueue?: boolean;
  } | null;
  portalCopy?: {
    invoiceReadyMessage?: string | null;
    invoiceOverdueMessage?: string | null;
    preInvoiceMessage?: string | null;
    paidMessage?: string | null;
    paymentUnavailableMessage?: string | null;
  } | null;
  portalControls?: {
    portalEnabled?: boolean | null;
    customerBookingEnabled?: boolean | null;
    depositsRequired?: boolean | null;
    allowBookingWithoutDeposit?: boolean | null;
    displayServicePrices?: boolean | null;
    displayTechnicianName?: boolean | null;
    displayEtaWindow?: boolean | null;
    displayBeforeAfterPhotos?: boolean | null;
    displayInvoicesPayments?: boolean | null;
    allowCustomerDocumentDownload?: boolean | null;
    brandPrimaryColor?: string | null;
    customerContactMessage?: string | null;
  } | null;
  analytics?: {
    widgetOrder?: Array<"executive-summary" | "pressure-panel" | "revenue-panel" | "capacity-panel" | "benchmark-delta" | "customer-commercial-signals"> | null;
    hiddenWidgets?: Array<"executive-summary" | "pressure-panel" | "revenue-panel" | "capacity-panel" | "benchmark-delta" | "customer-commercial-signals"> | null;
    defaultWindowDays?: number | null;
  } | null;
  commandCentre?: {
    sectionOrder?: Array<"filters" | "recent-updates" | "bulk-actions" | "work-board"> | null;
    hiddenSections?: Array<"filters" | "recent-updates" | "bulk-actions" | "work-board"> | null;
    defaultViewMode?: "kanban" | "list" | null;
  } | null;
  jobForms?: {
    declarationText?: string | null;
    serviceTypes?: Array<{
      id: string;
      name: string;
      description?: string | null;
      enabled?: boolean | null;
      retired?: boolean | null;
      order?: number | null;
    }> | null;
    sections?: Array<{
      id: string;
      title: string;
      description?: string | null;
      order?: number | null;
      visible?: boolean | null;
      serviceTypeIds?: string[] | null;
    }> | null;
    fields?: Array<{
      id: string;
      key: string;
      sectionId: string;
      label: string;
      helpText?: string | null;
      type: "text" | "textarea" | "select" | "checkbox" | "number" | "date";
      required?: boolean | null;
      visible?: boolean | null;
      order?: number | null;
      options?: string[] | null;
      serviceTypeIds?: string[] | null;
    }> | null;
  } | null;
  technicianPrompts?: {
    checklist?: string[] | null;
  } | null;
  serviceRecordEmail?: {
    defaultRecipients?: string[] | null;
    includeJobCustomerEmail?: boolean | null;
    includeBusinessDetails?: boolean | null;
    includeContactDetails?: boolean | null;
    includeBillingDetails?: boolean | null;
    includePaymentSummary?: boolean | null;
    includeEvidenceSummary?: boolean | null;
    includeSignatureSummary?: boolean | null;
    includePortalLink?: boolean | null;
    includePdfLink?: boolean | null;
    signatureEnabled?: boolean | null;
    signatureText?: string | null;
  } | null;
  notificationRouting?: {
    internalRecipients?: Array<{
      email: string;
      label?: string | null;
      enabled?: boolean | null;
      categories?: Array<"bookings" | "payments" | "jobs" | "customer_messages" | "workspace_alerts"> | null;
    }> | null;
  } | null;
  summaryEmails?: {
    enabled?: boolean | null;
    enabledCadences?: Array<"daily" | "weekly" | "monthly" | "quarterly" | "annual"> | null;
    enabledSections?: Array<"bookings" | "jobs" | "payments" | "failed_sends" | "upcoming_work" | "tax_reminders"> | null;
    lastDispatchedAtByCadence?: Partial<Record<"daily" | "weekly" | "monthly" | "quarterly" | "annual", string>> | null;
  } | null;
  operationalAlerts?: {
    externalEmailRecipients?: string[] | null;
    enabledCategories?: Array<"failed_email" | "failed_summary_dispatch" | "failed_booking" | "failed_payment" | "failed_refund" | "failed_webhook" | "failed_backup" | "health_degraded"> | null;
  } | null;
  customerFeedback?: {
    enabled?: boolean | null;
    promptText?: string | null;
    publicReviewUrl?: string | null;
    thankYouText?: string | null;
  } | null;
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

export type PortalControlSettings = {
  portalEnabled: boolean;
  customerBookingEnabled: boolean;
  depositsRequired: boolean;
  allowBookingWithoutDeposit: boolean;
  displayServicePrices: boolean;
  displayTechnicianName: boolean;
  displayEtaWindow: boolean;
  displayBeforeAfterPhotos: boolean;
  displayInvoicesPayments: boolean;
  allowCustomerDocumentDownload: boolean;
  brandPrimaryColor: string | null;
  customerContactMessage: string | null;
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

const DEFAULT_PORTAL_CONTROL_SETTINGS: PortalControlSettings = {
  portalEnabled: true,
  customerBookingEnabled: true,
  depositsRequired: true,
  allowBookingWithoutDeposit: false,
  displayServicePrices: true,
  displayTechnicianName: false,
  displayEtaWindow: true,
  displayBeforeAfterPhotos: true,
  displayInvoicesPayments: true,
  allowCustomerDocumentDownload: true,
  brandPrimaryColor: null,
  customerContactMessage: null,
};

function normalizePlainTextBlock(value: unknown, maxLength = 1200) {
  const normalized = String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim()
    .slice(0, maxLength);
  return normalized || null;
}

function normalizeEmailList(values: unknown) {
  const source = Array.isArray(values)
    ? values
    : typeof values === "string"
    ? values.split(",")
    : [];
  const deduped = new Set<string>();
  for (const entry of source) {
    const email = String(entry || "").trim().toLowerCase();
    if (!email) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    deduped.add(email);
  }
  return Array.from(deduped);
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
    .filter((entry): entry is InternalNotificationCategory =>
      INTERNAL_NOTIFICATION_CATEGORIES.includes(entry as InternalNotificationCategory),
    );
  return Array.from(new Set(categories));
}

function normalizeSummaryEmailCadences(values: unknown) {
  const input = Array.isArray(values) ? values : [];
  const cadences = input
    .map((entry) => String(entry || "").trim())
    .filter((entry): entry is SummaryEmailCadence =>
      SUMMARY_EMAIL_CADENCES.includes(entry as SummaryEmailCadence),
    );
  return Array.from(new Set(cadences));
}

function normalizeSummaryEmailSections(values: unknown) {
  const input = Array.isArray(values) ? values : [];
  const sections = input
    .map((entry) => String(entry || "").trim())
    .filter((entry): entry is SummaryEmailSection =>
      SUMMARY_EMAIL_SECTIONS.includes(entry as SummaryEmailSection),
    );
  return Array.from(new Set(sections));
}

function normalizeOperationalAlertCategories(values: unknown) {
  const input = Array.isArray(values) ? values : [];
  const categories = input
    .map((entry) => String(entry || "").trim())
    .filter((entry): entry is OperationalAlertCategory =>
      OPERATIONAL_ALERT_CATEGORIES.includes(entry as OperationalAlertCategory),
    );
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

function normalizeOptionalHexColor(value: unknown) {
  const normalized = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : null;
}

const DEFAULT_WHEELS_JOB_FORM_SECTIONS = [
  {
    id: "wheel_service_details",
    title: "Wheel service details",
    description: "Record the wheel positions and worksheet notes needed for this service.",
    order: 0,
    visible: true,
    serviceTypeIds: [],
  },
] as const;

const DEFAULT_WHEELS_JOB_FORM_FIELDS = [
  {
    id: "wheel_nsf",
    key: "wheel_nsf",
    sectionId: "wheel_service_details",
    label: "NSF",
    helpText: "Near-side front wheel serviced.",
    type: "checkbox" as const,
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
    type: "checkbox" as const,
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
    type: "checkbox" as const,
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
    type: "checkbox" as const,
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
    type: "checkbox" as const,
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
    type: "select" as const,
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
    type: "textarea" as const,
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
    type: "textarea" as const,
    required: false,
    visible: true,
    order: 7,
    options: [],
    serviceTypeIds: [],
  },
] as const;

export const ANALYTICS_WIDGET_KEYS = [
  'executive-summary',
  'pressure-panel',
  'revenue-panel',
  'capacity-panel',
  'benchmark-delta',
  'customer-commercial-signals',
] as const;

export type AnalyticsWidgetKey = (typeof ANALYTICS_WIDGET_KEYS)[number];

export const COMMAND_CENTRE_SECTION_KEYS = [
  'filters',
  'recent-updates',
  'bulk-actions',
  'work-board',
] as const;

export type CommandCentreSectionKey = (typeof COMMAND_CENTRE_SECTION_KEYS)[number];

export function getBusinessConfig(settings?: { businessConfigJson?: unknown } | null): BusinessConfig {
  const raw = settings?.businessConfigJson;
  if (!raw || typeof raw !== "object") return {};
  return raw as BusinessConfig;
}

export function getPortalCopy(settings?: { businessConfigJson?: unknown } | null) {
  return getBusinessConfig(settings).portalCopy || {};
}

export function getServiceRecordEmailSettings(settings?: { businessConfigJson?: unknown } | null): ServiceRecordEmailSettings {
  return normalizeServiceRecordEmailSettings(getBusinessConfig(settings).serviceRecordEmail);
}

export function normalizeServiceRecordEmailSettings(input: unknown): ServiceRecordEmailSettings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    ...DEFAULT_SERVICE_RECORD_EMAIL_SETTINGS,
    defaultRecipients: normalizeEmailList(raw.defaultRecipients),
    includeJobCustomerEmail: raw.includeJobCustomerEmail !== false,
    includeBusinessDetails: raw.includeBusinessDetails !== false,
    includeContactDetails: raw.includeContactDetails !== false,
    includeBillingDetails: raw.includeBillingDetails === true,
    includePaymentSummary: raw.includePaymentSummary !== false,
    includeEvidenceSummary: raw.includeEvidenceSummary !== false,
    includeSignatureSummary: raw.includeSignatureSummary !== false,
    includePortalLink: raw.includePortalLink !== false,
    includePdfLink: raw.includePdfLink !== false,
    signatureEnabled: raw.signatureEnabled === true,
    signatureText: normalizePlainTextBlock(raw.signatureText),
  };
}

export function normalizeInternalNotificationSettings(
  input: unknown,
  legacyRecipients?: unknown,
): InternalNotificationSettings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const rawRecipients = Array.isArray(raw.internalRecipients) ? raw.internalRecipients : [];
  const merged = new Map<string, InternalNotificationRecipient>();

  const rememberRecipient = (
    emailValue: unknown,
    source: { label?: unknown; enabled?: unknown; categories?: unknown } = {},
  ) => {
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
    rememberRecipient((entry as Record<string, unknown>)?.email, entry as Record<string, unknown>);
  }
  for (const legacyEmail of normalizeEmailList(legacyRecipients)) {
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

export function getInternalNotificationSettings(settings?: { businessConfigJson?: unknown; emailNotificationRecipients?: unknown } | null) {
  return normalizeInternalNotificationSettings(
    getBusinessConfig(settings).notificationRouting,
    settings?.emailNotificationRecipients,
  );
}

export function normalizeSummaryEmailSettings(input: unknown): SummaryEmailSettings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const enabledCadences = normalizeSummaryEmailCadences(raw.enabledCadences);
  const enabledSections = normalizeSummaryEmailSections(raw.enabledSections);
  const rawLastDispatchedAtByCadence =
    raw.lastDispatchedAtByCadence && typeof raw.lastDispatchedAtByCadence === "object"
      ? (raw.lastDispatchedAtByCadence as Record<string, unknown>)
      : {};
  const lastDispatchedAtByCadence = Object.fromEntries(
    SUMMARY_EMAIL_CADENCES.map((cadence) => {
      const value = String(rawLastDispatchedAtByCadence[cadence] || "").trim();
      const parsed = value ? new Date(value) : null;
      return [cadence, parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : undefined];
    }).filter((entry) => Boolean(entry[1])),
  ) as Partial<Record<SummaryEmailCadence, string>>;

  return {
    ...DEFAULT_SUMMARY_EMAIL_SETTINGS,
    enabled: raw.enabled === true,
    enabledCadences: enabledCadences.length ? enabledCadences : [...DEFAULT_SUMMARY_EMAIL_SETTINGS.enabledCadences],
    enabledSections: enabledSections.length ? enabledSections : [...DEFAULT_SUMMARY_EMAIL_SETTINGS.enabledSections],
    lastDispatchedAtByCadence,
  };
}

export function getSummaryEmailSettings(settings?: { businessConfigJson?: unknown } | null) {
  return normalizeSummaryEmailSettings(getBusinessConfig(settings).summaryEmails);
}

export function normalizeOperationalAlertSettings(input: unknown): OperationalAlertSettings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const enabledCategories = normalizeOperationalAlertCategories(raw.enabledCategories);
  return {
    ...DEFAULT_OPERATIONAL_ALERT_SETTINGS,
    externalEmailRecipients: normalizeEmailList(raw.externalEmailRecipients).filter((email) => !classifyNonRoutableRecipientEmail(email)),
    enabledCategories: enabledCategories.length ? enabledCategories : [...DEFAULT_OPERATIONAL_ALERT_SETTINGS.enabledCategories],
  };
}

export function getOperationalAlertSettings(settings?: { businessConfigJson?: unknown } | null) {
  return normalizeOperationalAlertSettings(getBusinessConfig(settings).operationalAlerts);
}

export function normalizeCustomerFeedbackSettings(input: unknown): CustomerFeedbackSettings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    ...DEFAULT_CUSTOMER_FEEDBACK_SETTINGS,
    enabled: raw.enabled === true,
    promptText:
      normalizeOptionalFeedbackText(raw.promptText, 180) ||
      DEFAULT_CUSTOMER_FEEDBACK_SETTINGS.promptText,
    publicReviewUrl: normalizeOptionalHttpsUrl(raw.publicReviewUrl),
    thankYouText:
      normalizeOptionalFeedbackText(raw.thankYouText, 180) ||
      DEFAULT_CUSTOMER_FEEDBACK_SETTINGS.thankYouText,
  };
}

export function getCustomerFeedbackSettings(settings?: { businessConfigJson?: unknown } | null) {
  return normalizeCustomerFeedbackSettings(getBusinessConfig(settings).customerFeedback);
}

export function normalizePortalControlSettings(input: unknown, settings?: { brandPrimaryColor?: string | null } | null): PortalControlSettings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    ...DEFAULT_PORTAL_CONTROL_SETTINGS,
    portalEnabled: raw.portalEnabled !== false,
    customerBookingEnabled: raw.customerBookingEnabled !== false,
    depositsRequired: typeof raw.depositsRequired === "boolean" ? raw.depositsRequired : DEFAULT_PORTAL_CONTROL_SETTINGS.depositsRequired,
    allowBookingWithoutDeposit: typeof raw.allowBookingWithoutDeposit === "boolean" ? raw.allowBookingWithoutDeposit : DEFAULT_PORTAL_CONTROL_SETTINGS.allowBookingWithoutDeposit,
    displayServicePrices: raw.displayServicePrices !== false,
    displayTechnicianName: raw.displayTechnicianName === true,
    displayEtaWindow: raw.displayEtaWindow !== false,
    displayBeforeAfterPhotos: raw.displayBeforeAfterPhotos !== false,
    displayInvoicesPayments: raw.displayInvoicesPayments !== false,
    allowCustomerDocumentDownload: raw.allowCustomerDocumentDownload !== false,
    brandPrimaryColor: normalizeOptionalHexColor(raw.brandPrimaryColor) || normalizeOptionalHexColor(settings?.brandPrimaryColor) || null,
    customerContactMessage: normalizePlainTextBlock(raw.customerContactMessage, 320),
  };
}

export function getPortalControlSettings(settings?: { businessConfigJson?: unknown; brandPrimaryColor?: string | null } | null) {
  return normalizePortalControlSettings(getBusinessConfig(settings).portalControls, settings);
}

export function getAnalyticsWorkspaceLayout(settings?: { businessConfigJson?: unknown } | null) {
  const analytics = getBusinessConfig(settings).analytics || {};
  const widgetOrder = Array.isArray(analytics.widgetOrder)
    ? analytics.widgetOrder.map((item) => String(item || '').trim()).filter((item): item is AnalyticsWidgetKey => ANALYTICS_WIDGET_KEYS.includes(item as AnalyticsWidgetKey))
    : [];
  const hiddenWidgets = Array.isArray(analytics.hiddenWidgets)
    ? analytics.hiddenWidgets.map((item) => String(item || '').trim()).filter((item): item is AnalyticsWidgetKey => ANALYTICS_WIDGET_KEYS.includes(item as AnalyticsWidgetKey))
    : [];
  return {
    widgetOrder: Array.from(new Set([...widgetOrder, ...ANALYTICS_WIDGET_KEYS])) as AnalyticsWidgetKey[],
    hiddenWidgets: Array.from(new Set(hiddenWidgets)),
    defaultWindowDays: Math.max(7, Math.min(90, Number(analytics.defaultWindowDays || 30))),
  };
}

export function getCommandCentreWorkspaceLayout(settings?: { businessConfigJson?: unknown } | null) {
  const commandCentre = getBusinessConfig(settings).commandCentre || {};
  const sectionOrder = Array.isArray(commandCentre.sectionOrder)
    ? commandCentre.sectionOrder.map((item) => String(item || '').trim()).filter((item): item is CommandCentreSectionKey => COMMAND_CENTRE_SECTION_KEYS.includes(item as CommandCentreSectionKey))
    : [];
  const hiddenSections = Array.isArray(commandCentre.hiddenSections)
    ? commandCentre.hiddenSections.map((item) => String(item || '').trim()).filter((item): item is CommandCentreSectionKey => COMMAND_CENTRE_SECTION_KEYS.includes(item as CommandCentreSectionKey))
    : [];
  return {
    sectionOrder: Array.from(new Set([...sectionOrder, ...COMMAND_CENTRE_SECTION_KEYS])) as CommandCentreSectionKey[],
    hiddenSections: Array.from(new Set(hiddenSections.filter((item) => item !== 'filters' && item !== 'work-board'))),
    defaultViewMode: commandCentre.defaultViewMode === 'list' ? 'list' : 'kanban',
  };
}

export function getJobDeclarationText(settings?: { businessConfigJson?: unknown } | null) {
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

function defaultServiceTypeNames(settings?: { primaryTrade?: string | null; defaultServiceNamePresets?: unknown } | null) {
  const presets = Array.isArray(settings?.defaultServiceNamePresets)
    ? settings.defaultServiceNamePresets.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (presets.length > 0) return presets;
  if ((settings?.primaryTrade || "").toUpperCase() === "WHEELS") {
    return ["Tyre Change", "Puncture Repair", "Wheel Swap", "Balancing", "TPMS"];
  }
  return ["General Service"];
}

export function getWorkspaceJobForms(settings?: { businessConfigJson?: unknown; primaryTrade?: string | null; defaultServiceNamePresets?: unknown } | null) {
  const config = getBusinessConfig(settings).jobForms || {};
  const rawServiceTypes = Array.isArray(config.serviceTypes) ? config.serviceTypes : [];
  const hasExplicitServiceTypes = Array.isArray(config.serviceTypes);
  const hasExplicitSections = Object.prototype.hasOwnProperty.call(config, "sections");
  const hasExplicitFields = Object.prototype.hasOwnProperty.call(config, "fields");
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
          .filter((item) => item.name)
          .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0))
      : defaultServiceTypeNames(settings).map((name, index) => ({
          id: slugify(name),
          name,
          description: null,
          enabled: true,
          retired: false,
          order: index,
        }));

  const defaultSections =
    !hasExplicitSections && (settings?.primaryTrade || "").toUpperCase() === "WHEELS"
      ? [...DEFAULT_WHEELS_JOB_FORM_SECTIONS]
      : [];
  const defaultFields =
    !hasExplicitFields && (settings?.primaryTrade || "").toUpperCase() === "WHEELS"
      ? [...DEFAULT_WHEELS_JOB_FORM_FIELDS]
      : [];

  return {
    declarationText: config.declarationText || null,
    serviceTypes,
    sections: Array.isArray(config.sections) ? config.sections : defaultSections,
    fields: Array.isArray(config.fields) ? config.fields : defaultFields,
  };
}

export function getTechnicianChecklist(settings?: { businessConfigJson?: unknown } | null) {
  const raw = getBusinessConfig(settings).technicianPrompts?.checklist;
  return Array.isArray(raw) ? raw.map((item) => String(item || "").trim()).filter(Boolean) : [];
}
