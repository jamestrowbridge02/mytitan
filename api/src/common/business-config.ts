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
  technicianPrompts?: {
    checklist?: string[] | null;
  } | null;
};

export function getBusinessConfig(settings?: { businessConfigJson?: unknown } | null): BusinessConfig {
  const raw = settings?.businessConfigJson;
  if (!raw || typeof raw !== "object") return {};
  return raw as BusinessConfig;
}

export function getPortalCopy(settings?: { businessConfigJson?: unknown } | null) {
  return getBusinessConfig(settings).portalCopy || {};
}

export function getTechnicianChecklist(settings?: { businessConfigJson?: unknown } | null) {
  const raw = getBusinessConfig(settings).technicianPrompts?.checklist;
  return Array.isArray(raw) ? raw.map((item) => String(item || "").trim()).filter(Boolean) : [];
}
