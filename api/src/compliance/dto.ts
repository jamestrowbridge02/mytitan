import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class UpsertWorkflowSlaPolicyDto {
  @IsString()
  name!: string;

  @IsIn(["JOB", "BOOKING", "QUOTE", "APPROVAL", "SERVICE_PLAN"])
  entityType!: string;

  @IsString()
  triggerStatus!: string;

  @IsString()
  targetStatus!: string;

  @IsInt()
  @Min(1)
  @Max(60 * 24 * 30)
  targetMinutes!: number;

  @IsOptional()
  @IsIn(["INFO", "WARNING", "CRITICAL"])
  severity?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  metadataJson?: Record<string, any> | null;
}

export class ListWorkflowSlaEventsDto {
  @IsOptional()
  @IsIn(["JOB", "BOOKING", "QUOTE", "APPROVAL", "SERVICE_PLAN"])
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsIn(["OPEN", "MET", "BREACHED", "CANCELLED"])
  status?: string;

  @IsOptional()
  @IsIn(["INFO", "WARNING", "CRITICAL"])
  severity?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  policyId?: string;
}

export class ListComplianceExceptionsDto {
  @IsOptional()
  @IsIn(["JOB", "BOOKING", "QUOTE", "APPROVAL", "SERVICE_PLAN"])
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsIn([
    "MISSING_REQUIRED_FIELD",
    "MISSING_EXECUTION_EVIDENCE",
    "MISSING_APPROVAL",
    "SLA_BREACH",
    "INVENTORY_SHORTAGE_BLOCK",
    "MANUAL_OVERRIDE",
  ])
  kind?: string;

  @IsOptional()
  @IsIn(["WARNING", "CRITICAL"])
  severity?: string;

  @IsOptional()
  @IsIn(["OPEN", "RESOLVED", "DISMISSED"])
  status?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;
}

export class ResolveComplianceExceptionDto {
  @IsOptional()
  @IsString()
  note?: string;
}
