import type { TenantSettings } from "./tenant-settings";

export type BusinessConfig = NonNullable<TenantSettings["businessConfigJson"]>;

export type BusinessTerms = {
  jobs: string;
  bookings: string;
  customers: string;
  technicians: string;
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

export function getTechnicianChecklistPrompts(settings?: TenantSettings | null) {
  const checklist = getBusinessConfig(settings).technicianPrompts?.checklist;
  return Array.isArray(checklist) ? checklist.map((item) => String(item || "").trim()).filter(Boolean) : [];
}
