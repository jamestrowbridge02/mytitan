import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export const SERVICE_PLAN_STATUSES = ["ACTIVE", "PAUSED", "CANCELLED"] as const;
export const SERVICE_PLAN_CADENCE_UNITS = ["WEEK", "MONTH", "QUARTER", "YEAR"] as const;

export class ServicePlanTaskDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  metadataJson?: Record<string, any>;
}

export class UpsertServicePlanDto {
  @IsString()
  customerId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(SERVICE_PLAN_STATUSES)
  status?: (typeof SERVICE_PLAN_STATUSES)[number];

  @IsIn(SERVICE_PLAN_CADENCE_UNITS)
  cadenceUnit!: (typeof SERVICE_PLAN_CADENCE_UNITS)[number];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cadenceInterval!: number;

  @IsOptional()
  @IsDateString()
  nextRunAt?: string;

  @IsBoolean()
  autoCreateBooking!: boolean;

  @IsBoolean()
  autoCreateJob!: boolean;

  @IsOptional()
  @IsObject()
  notesJson?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  portalVisible?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServicePlanTaskDto)
  tasks?: ServicePlanTaskDto[];
}

export class PatchServicePlanDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(SERVICE_PLAN_STATUSES)
  status?: (typeof SERVICE_PLAN_STATUSES)[number];

  @IsOptional()
  @IsIn(SERVICE_PLAN_CADENCE_UNITS)
  cadenceUnit?: (typeof SERVICE_PLAN_CADENCE_UNITS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cadenceInterval?: number;

  @IsOptional()
  @IsDateString()
  nextRunAt?: string;

  @IsOptional()
  @IsBoolean()
  autoCreateBooking?: boolean;

  @IsOptional()
  @IsBoolean()
  autoCreateJob?: boolean;

  @IsOptional()
  @IsObject()
  notesJson?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  portalVisible?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServicePlanTaskDto)
  tasks?: ServicePlanTaskDto[];
}
