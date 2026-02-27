import { IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { BOOKING_STATUSES } from '../common/constants';

export class CreateBookingDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsIn(BOOKING_STATUSES)
  status?: (typeof BOOKING_STATUSES)[number];
}

export class UpdateBookingSettingsDto {
  @IsOptional()
  @IsBoolean()
  publicEnabled?: boolean;

  @IsOptional()
  @IsArray()
  businessHours?: Array<{
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
  }>;

  @IsOptional()
  @IsArray()
  blackoutDates?: Array<{
    date: string;
    reason?: string;
  }>;
}

export class PublicBookingRequestDto {
  @IsString()
  serviceId!: string;

  @IsString()
  customerName!: string;

  @IsEmail()
  customerEmail!: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsDateString()
  startsAt!: string;
}
