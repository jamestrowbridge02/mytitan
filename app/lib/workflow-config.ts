import type { TenantSettings } from "./tenant-settings";
import { getBusinessConfig } from "./business-config";

export type WorkflowStage = {
  id: string;
  label: string;
  statuses: string[];
  visible?: boolean;
  requiredCustomFieldKeys?: string[];
  requiredFieldEnforcementMode?: "warn" | "block";
};

type NormalizedWorkflowStage = {
  id: string;
  label: string;
  statuses: string[];
  visible: boolean;
  requiredCustomFieldKeys: string[];
  requiredFieldEnforcementMode: "warn" | "block";
};

const DEFAULT_BOOKING_STAGES: WorkflowStage[] = [
  { id: "lead", label: "Lead", statuses: ["PENDING", "PLANNED"], visible: true },
  { id: "scheduled", label: "Scheduled", statuses: ["CONFIRMED"], visible: true },
  { id: "working", label: "In progress", statuses: ["IN_PROGRESS"], visible: true },
  { id: "completed", label: "Completed", statuses: ["COMPLETED"], visible: true },
  { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED"], visible: true },
];

const DEFAULT_JOB_STAGES: WorkflowStage[] = [
  { id: "ready", label: "Ready", statuses: ["OPEN"], visible: true },
  { id: "scheduled", label: "Scheduled", statuses: ["SCHEDULED"], visible: true },
  { id: "in_progress", label: "In progress", statuses: ["IN_PROGRESS"], visible: true },
  { id: "completed", label: "Completed", statuses: ["COMPLETED", "INVOICED"], visible: true },
  { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED"], visible: true },
];

const DEFAULT_TECHNICIAN_STAGES: WorkflowStage[] = [
  { id: "dispatch", label: "Dispatched", statuses: ["OPEN", "SCHEDULED"], visible: true },
  { id: "working", label: "Working", statuses: ["IN_PROGRESS"], visible: true },
  { id: "finished", label: "Finished", statuses: ["COMPLETED", "INVOICED"], visible: true },
  { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED"], visible: true },
];

function mergeStages(configStages: unknown, defaults: WorkflowStage[]) {
  if (!Array.isArray(configStages) || !configStages.length) return defaults;

  const configById = new Map(
    configStages
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && typeof item.id === "string")
      .map((item) => [String(item.id), item]),
  );

  const configured = Array.from(configById.values())
    .map((item) => {
      const fallback = defaults.find((stage) => stage.id === String(item.id));
      const statuses = Array.isArray(item.statuses)
        ? item.statuses.map((status) => String(status || "").toUpperCase()).filter(Boolean)
        : fallback?.statuses || [];
      if (!statuses.length) return null;
      return {
        id: String(item.id),
        label: String(item.label || fallback?.label || item.id),
        statuses,
        visible: item.visible !== false,
        requiredCustomFieldKeys: Array.isArray(item.requiredCustomFieldKeys)
          ? item.requiredCustomFieldKeys.map((value) => String(value || "").trim()).filter(Boolean)
          : Array.isArray(fallback?.requiredCustomFieldKeys)
            ? fallback.requiredCustomFieldKeys
            : [],
        requiredFieldEnforcementMode: item.requiredFieldEnforcementMode === "block"
          ? "block"
          : fallback?.requiredFieldEnforcementMode === "block"
            ? "block"
            : "warn",
      } satisfies NormalizedWorkflowStage;
    })
    .filter((item): item is NormalizedWorkflowStage => Boolean(item));

  if (!configured.length) return defaults;

  const seen = new Set(configured.map((stage) => stage.id));
  const remainingDefaults = defaults.filter((stage) => !seen.has(stage.id));
  return [...configured, ...remainingDefaults];
}

export function getBookingStages(settings?: TenantSettings | null) {
  return mergeStages(getBusinessConfig(settings).workflowStages?.bookings, DEFAULT_BOOKING_STAGES);
}

export function getJobStages(settings?: TenantSettings | null) {
  return mergeStages(getBusinessConfig(settings).workflowStages?.jobs, DEFAULT_JOB_STAGES);
}

export function getTechnicianStages(settings?: TenantSettings | null) {
  return mergeStages(getBusinessConfig(settings).workflowStages?.technician, DEFAULT_TECHNICIAN_STAGES);
}

export function mapStatusToStage(status: string | null | undefined, stages: WorkflowStage[]) {
  const normalized = String(status || "").toUpperCase();
  return stages.find((stage) => stage.statuses.includes(normalized)) || stages[0] || null;
}

export function getVisibleStages(stages: WorkflowStage[]) {
  return stages.filter((stage) => stage.visible !== false);
}

export function getStageStatus(stage: WorkflowStage | null | undefined) {
  return String(stage?.statuses?.[0] || "").toUpperCase();
}
