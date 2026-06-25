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

export class CreateArchivePeriodDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;

  @IsOptional()
  @IsIn(['JOBS', 'INVOICES', 'JOBS_AND_INVOICES'])
  scope?: 'JOBS' | 'INVOICES' | 'JOBS_AND_INVOICES';
}

export class ArchiveJobsDto {
  @IsArray()
  @IsString({ each: true })
  jobIds!: string[];

  @IsString()
  @IsNotEmpty()
  archivePeriodId!: string;
}

export class ArchiveByDateDto {
  @IsString()
  @IsNotEmpty()
  archivePeriodId!: string;
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

export class ShareJobSheetDto {
  @IsEmail()
  recipientEmail!: string;

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsBoolean()
  includePdf?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentArtifactIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  jobAssetIds?: string[];
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

export class CreateJobPartAllocationDto {
  @IsString()
  @IsNotEmpty()
  stockItemId!: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsInt()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsString()
  reason?: string;
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
  @IsString()
  tradeAccountId?: string;

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

  @IsOptional()
  @IsBoolean()
  completeAfterCreate?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateJobPartAllocationDto)
  partAllocations?: CreateJobPartAllocationDto[];
}

export class UpdateJobStatusDto {
  @IsString()
  @IsNotEmpty()
  status!: string;
}

export class UpdateCustomerJourneyDto {
  @IsOptional()
  @IsIn(['BOOKING_RECEIVED', 'AWAITING_CONFIRMATION', 'SCHEDULED', 'TECHNICIAN_ASSIGNED', 'PREPARING_FOR_VISIT', 'ON_ROUTE', 'WORK_IN_PROGRESS', 'AWAITING_APPROVAL', 'COMPLETED', 'INVOICED', 'PAID'])
  stage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  customerFacingStatus?: string;

  @IsOptional()
  @IsDateString()
  etaWindowStart?: string;

  @IsOptional()
  @IsDateString()
  etaWindowEnd?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsIn(['scheduled', 'confirmed', 'delayed', 'rescheduled', 'manual_update', 'not_available'])
  confidence?: string;

  @IsOptional()
  @IsIn(['ON_TIME', 'DELAYED', 'RESCHEDULED', 'ON_ROUTE', 'ARRIVED'])
  etaStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsBoolean()
  showTechnicianName?: boolean;
}

export class RoutePreviewQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  technicianId?: string;
}

export class JobListQueryDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeArchived?: boolean;
}

export class JobLifecycleActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
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
