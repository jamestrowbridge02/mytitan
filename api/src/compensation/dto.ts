import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";

export class UpsertCompensationRuleDto {
  @IsString()
  name!: string;

  @IsIn(["TECHNICIAN", "DISPATCHER", "FINANCE", "MANAGER"])
  roleType!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsIn([
    "JOBS_COMPLETED",
    "SLA_MET_RATE",
    "QUOTE_CONVERSION_RATE",
    "COLLECTIONS_COMPLETED",
    "UTILIZATION_RATE",
    "ACKNOWLEDGEMENT_RATE",
    "EXECUTION_SUBMITTED_RATE",
  ])
  metricType!: string;

  @IsIn(["FLAT_BONUS", "PERCENTAGE_BONUS", "THRESHOLD_BONUS"])
  calculationType!: string;

  @IsOptional()
  thresholdJson?: Record<string, any> | null;

  @IsOptional()
  payoutJson?: Record<string, any> | null;
}

export class ListCompensationRunsDto {
  @IsOptional()
  @IsString()
  periodId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  ruleId?: string;

  @IsOptional()
  @IsIn(["DRAFT", "APPROVED", "PAID", "CANCELLED"])
  status?: string;
}

export class PreviewCompensationRunDto {
  @IsString()
  periodId!: string;

  @IsOptional()
  @IsString()
  ruleId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;
}
