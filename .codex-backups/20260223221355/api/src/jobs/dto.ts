import { IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { JOB_STATUSES } from '../common/constants';

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
  @IsIn(['PER_WHEEL', 'SET'])
  wheelPricingMode?: 'PER_WHEEL' | 'SET';

  @IsOptional()
  @IsString()
  whatsappTemplate?: string;

  @IsOptional()
  @IsDateString()
  invoiceDueAt?: string;
}

export class UpdateJobStatusDto {
  @IsIn(JOB_STATUSES)
  status!: (typeof JOB_STATUSES)[number];
}
