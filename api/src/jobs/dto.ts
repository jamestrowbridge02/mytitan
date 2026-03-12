import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { JOB_STATUSES } from "../common/constants";

export const JOB_ASSET_KINDS = ["BEFORE", "AFTER", "TORQUE", "SIGN_TECH", "SIGN_CUSTOMER"] as const;
export const JOB_EXECUTION_EVIDENCE_KINDS = ["PHOTO", "SIGNATURE", "NOTE", "CHECKLIST_ATTACHMENT", "CUSTOMER_ACKNOWLEDGEMENT"] as const;

export class JobExecutionChecklistItemDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsBoolean()
  completed!: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

export class StartJobExecutionDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  summary?: string;
}

export class UpdateJobExecutionDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  summary?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => JobExecutionChecklistItemDto)
  @IsArray()
  checklist?: JobExecutionChecklistItemDto[];

  @IsOptional()
  @IsObject()
  notesJson?: Record<string, any>;
}

export class SubmitJobExecutionDto extends UpdateJobExecutionDto {}

export class AddJobExecutionEvidenceDto {
  @IsIn(JOB_EXECUTION_EVIDENCE_KINDS)
  kind!: (typeof JOB_EXECUTION_EVIDENCE_KINDS)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsString()
  artifactId?: string;

  @IsOptional()
  @IsObject()
  payloadJson?: Record<string, any>;
}

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
  @IsDateString()
  scheduledAt?: string;

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
  @IsString()
  @IsNotEmpty()
  status!: string;
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

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;
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
