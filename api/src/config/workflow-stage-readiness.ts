import { BadRequestException } from "@nestjs/common";
import { getBookingStages, getJobStages, getTechnicianStages, mapStatusToStage, type WorkflowStage } from "./workflow-config";

type WorkflowEntityType = "job" | "booking" | "technician";

type WorkflowSettings = { businessConfigJson?: unknown } | null | undefined;

type ResolveReadinessInput = {
  prisma: any;
  tenantId: string;
  entityType: WorkflowEntityType;
  entityId: string;
  status?: string | null;
  stageId?: string | null;
  settings?: WorkflowSettings;
};

export type WorkflowStageReadiness = {
  stage: WorkflowStage | null;
  stageId: string | null;
  stageLabel: string | null;
  status: string | null;
  requiredFieldEnforcementMode: "warn" | "block";
  requiredCustomFieldKeys: string[];
  missingRequiredFields: string[];
  ready: boolean;
};

function getStages(entityType: WorkflowEntityType, settings?: WorkflowSettings) {
  if (entityType === "booking") return getBookingStages(settings);
  if (entityType === "technician") return getTechnicianStages(settings);
  return getJobStages(settings);
}

function getStage(stages: WorkflowStage[], input: { status?: string | null; stageId?: string | null }) {
  if (input.stageId) {
    return stages.find((stage) => stage.id === input.stageId) || null;
  }
  return mapStatusToStage(input.status, stages);
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

export async function resolveWorkflowStageReadiness(input: ResolveReadinessInput): Promise<WorkflowStageReadiness> {
  const stages = getStages(input.entityType, input.settings);
  const stage = getStage(stages, { status: input.status, stageId: input.stageId });
  const requiredCustomFieldKeys = Array.isArray(stage?.requiredCustomFieldKeys) ? stage.requiredCustomFieldKeys : [];
  if (!stage || requiredCustomFieldKeys.length === 0) {
    return {
      stage,
      stageId: stage?.id || null,
      stageLabel: stage?.label || null,
      status: input.status ? String(input.status).toUpperCase() : null,
      requiredFieldEnforcementMode: stage?.requiredFieldEnforcementMode === "block" ? "block" : "warn",
      requiredCustomFieldKeys,
      missingRequiredFields: [],
      ready: true,
    };
  }

  const entityType = input.entityType.toUpperCase();
  const fields = await input.prisma.customField.findMany({
    where: {
      tenantId: input.tenantId,
      entityType,
      key: { in: requiredCustomFieldKeys },
    },
    select: {
      id: true,
      key: true,
    },
  });
  const fieldMap = new Map(fields.map((field: any) => [String(field.key || ""), String(field.id || "")]));
  const fieldIds = Array.from(fieldMap.values());
  const values = fieldIds.length
    ? await input.prisma.customFieldValue.findMany({
        where: {
          tenantId: input.tenantId,
          entityType,
          entityId: input.entityId,
          fieldId: { in: fieldIds },
        },
        select: {
          fieldId: true,
          valueJson: true,
        },
      })
    : [];
  const valueMap = new Map(values.map((value: any) => [String(value.fieldId || ""), value.valueJson]));
  const missingRequiredFields = requiredCustomFieldKeys.filter((key) => {
    const fieldId = fieldMap.get(key);
    if (!fieldId) return true;
    return !hasValue(valueMap.get(fieldId));
  });

  return {
    stage,
    stageId: stage.id,
    stageLabel: stage.label,
    status: input.status ? String(input.status).toUpperCase() : null,
    requiredFieldEnforcementMode: stage.requiredFieldEnforcementMode === "block" ? "block" : "warn",
    requiredCustomFieldKeys,
    missingRequiredFields,
    ready: missingRequiredFields.length === 0,
  };
}

export async function assertWorkflowStageReadiness(input: ResolveReadinessInput & { action: string }) {
  const readiness = await resolveWorkflowStageReadiness(input);
  if (readiness.requiredFieldEnforcementMode !== "block" || readiness.ready) {
    return readiness;
  }
  throw new BadRequestException({
    code: "WORKFLOW_STAGE_REQUIRED_FIELDS_MISSING",
    message: `Cannot ${input.action} until required custom fields are complete for ${readiness.stageLabel || readiness.stageId || "this stage"}: ${readiness.missingRequiredFields.join(", ")}`,
    entityType: input.entityType,
    entityId: input.entityId,
    status: readiness.status,
    stageId: readiness.stageId,
    stageLabel: readiness.stageLabel,
    requiredFieldEnforcementMode: readiness.requiredFieldEnforcementMode,
    missingRequiredFields: readiness.missingRequiredFields,
  });
}
