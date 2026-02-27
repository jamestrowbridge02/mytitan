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
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsString()
  serviceId!: string;

  @IsString()
  customerName!: string;

  @IsEmail()
  customerEmail!: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  staffUserId?: string;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  answers?: Array<{ questionId: string; valueText?: string; valueJson?: any }>;
}

export class UpsertBookingServiceDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsString()
  durationMinutes!: string;

  @IsString()
  priceCents!: string;

  @IsOptional()
  @IsString()
  bufferBefore?: string;

  @IsOptional()
  @IsString()
  bufferAfter?: string;

  @IsOptional()
  @IsString()
  depositCents?: string;
}

export class BookingAvailabilityQueryDto {
  @IsDateString()
  date!: string;

  @IsString()
  serviceId!: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  staffUserId?: string;
}

export class CreateBookingProDto {
  @IsString()
  serviceId!: string;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  staffUserId?: string;

  @IsString()
  customerName!: string;

  @IsEmail()
  customerEmail!: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  answers?: Array<{ questionId: string; valueText?: string; valueJson?: any }>;
}

export class UpdateBookingProSettingsDto {
  @IsOptional()
  @IsBoolean()
  publicEnabled?: boolean;

  @IsOptional()
  @IsArray()
  staffAvailability?: Array<{
    locationId: string;
    userId: string;
    weekday: number;
    startMinute?: number | null;
    endMinute?: number | null;
    isClosed?: boolean;
  }>;

  @IsOptional()
  @IsArray()
  blackoutDates?: Array<{
    locationId?: string;
    date: string;
    reason?: string;
  }>;

  @IsOptional()
  @IsArray()
  questions?: Array<{
    id?: string;
    locationId?: string;
    label: string;
    questionKey: string;
    type?: string;
    required?: boolean;
    optionsJson?: any;
  }>;
}
