import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { JOB_STATUSES } from "../common/constants";

export const JOB_ASSET_KINDS = ["BEFORE", "AFTER", "TORQUE", "SIGN_TECH", "SIGN_CUSTOMER"] as const;

export class CreateJobAssetDto {
  @IsIn(JOB_ASSET_KINDS)
  kind!: (typeof JOB_ASSET_KINDS)[number];

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  dataUrl?: string;

  @IsOptional()
  @IsString()
  mime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  bytes?: number;
}

export class CreateJobMediaPayloadDto {
  @IsString()
  data!: string;

  @IsString()
  filename!: string;

  @IsString()
  mimeType!: string;
}

export class CreateJobDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsString()
  customerName!: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  vehicleMake?: string;

  @IsOptional()
  @IsString()
  vehicleModel?: string;

  @IsOptional()
  @IsString()
  vehicleReg?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  laborCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  partsCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  miscCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  taxRateBps?: number;

  @IsOptional()
  @IsString()
  serviceName?: string;

  @IsOptional()
  @IsIn(["PER_WHEEL", "SET"])
  wheelPricingMode?: "PER_WHEEL" | "SET";

  @IsOptional()
  @IsString()
  whatsappTemplate?: string;

  @IsOptional()
  @IsDateString()
  invoiceDueAt?: string;

  @IsOptional()
  @IsString()
  tradeCode?: string;

  @IsOptional()
  @IsString()
  jobType?: string;

  @IsOptional()
  @IsObject()
  formData?: Record<string, any>;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateJobMediaPayloadDto)
  torqueEvidenceMedia?: CreateJobMediaPayloadDto | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateJobMediaPayloadDto)
  beforeMedia?: CreateJobMediaPayloadDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateJobMediaPayloadDto)
  afterMedia?: CreateJobMediaPayloadDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateJobAssetDto)
  assets?: CreateJobAssetDto[];
}

export class UpdateJobStatusDto {
  @IsIn(JOB_STATUSES)
  status!: (typeof JOB_STATUSES)[number];
}

export class JobsBoardQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  locationIds?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  trade?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class BulkJobsDto {
  @IsArray()
  @IsNotEmpty({ each: true })
  @IsString({ each: true })
  jobIds!: string[];

  @IsString()
  @IsIn(['setStatus', 'assignTechnician', 'setLocation', 'addTag', 'removeTag', 'setDueDate', 'closeJobs', 'markComplete'])
  operation!: 'setStatus' | 'assignTechnician' | 'setLocation' | 'addTag' | 'removeTag' | 'setDueDate' | 'closeJobs' | 'markComplete';

  @IsOptional()
  @IsIn(JOB_STATUSES)
  status?: (typeof JOB_STATUSES)[number];

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class PatchJobDto {
  @IsOptional()
  @IsIn(JOB_STATUSES)
  status?: (typeof JOB_STATUSES)[number];

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  pricingNotes?: string;

  @IsOptional()
  @IsDateString()
  invoiceDueAt?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string | null;
}

export class CreateJobReminderDto {
  @IsString()
  jobId!: string;

  @IsDateString()
  remindAt!: string;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class BulkJobsV2Dto {
  @IsArray()
  @IsNotEmpty({ each: true })
  @IsString({ each: true })
  jobIds!: string[];

  @IsString()
  @IsIn(['setStatus', 'assignTechnician', 'setLocation', 'addTag', 'removeTag', 'setDueDate', 'closeJobs', 'markComplete'])
  operation!: 'setStatus' | 'assignTechnician' | 'setLocation' | 'addTag' | 'removeTag' | 'setDueDate' | 'closeJobs' | 'markComplete';

  @IsOptional()
  @IsIn(JOB_STATUSES)
  status?: (typeof JOB_STATUSES)[number];

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
