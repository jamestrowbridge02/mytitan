import { IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { BOOKING_STATUSES } from '../common/constants';
import { CUSTOMER_COLLECTION_PROVIDERS } from '../billing/payment-collection';

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

  @IsOptional()
  serviceLines?: Array<{ serviceId?: string; proServiceId?: string; quantity?: number; sortOrder?: number }>;
}

export class UpdateBookingSettingsDto {
  @IsOptional()
  @IsBoolean()
  publicEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  autoConfirmPublicBookings?: boolean;

  @IsOptional()
  @IsBoolean()
  autoCreateJobFromBooking?: boolean;

  @IsOptional()
  @IsBoolean()
  autoAssignWorkflow?: boolean;

  @IsOptional()
  @IsBoolean()
  manualReviewMode?: boolean;

  @IsOptional()
  @IsBoolean()
  locationFirstScheduling?: boolean;

  @IsOptional()
  @IsBoolean()
  autoPopulateJobSheetFromBooking?: boolean;

  @IsOptional()
  @IsBoolean()
  autoCreateInvoiceDraftOnCompletion?: boolean;

  @IsOptional()
  @IsBoolean()
  autoSendInvoiceOnCompletion?: boolean;

  @IsOptional()
  @IsBoolean()
  technicianAssignmentRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  locationRequiredForBooking?: boolean;

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
  vehicleRegistration?: string;

  @IsOptional()
  @IsBoolean()
  lockingWheelNutAvailable?: boolean;

  @IsOptional()
  @IsString()
  tradeAccountId?: string;

  @IsOptional()
  @IsString()
  staffUserId?: string;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  answers?: Array<{ questionId: string; valueText?: string; valueJson?: any }>;

  @IsOptional()
  selectedOptions?: Array<{ key?: string; label?: string; quantity?: number }>;

  @IsOptional()
  serviceLines?: Array<{ serviceId?: string; proServiceId?: string; quantity?: number; selectedOptions?: Array<{ key?: string; quantity?: number }> }>;
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

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['PUBLIC', 'TRADE', 'INTERNAL'])
  visibility?: 'PUBLIC' | 'TRADE' | 'INTERNAL';

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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  @IsOptional()
  @IsString()
  discountPriceCents?: string;

  @IsOptional()
  @IsIn(['NONE', 'FIXED', 'PERCENTAGE'])
  depositType?: 'NONE' | 'FIXED' | 'PERCENTAGE';

  @IsOptional()
  @IsString()
  depositValue?: string;

  @IsOptional()
  @IsIn(['ON_CONFIRMATION', 'ON_COMPLETION', 'MANUAL_FOLLOW_UP'])
  completionPaymentMode?: 'ON_CONFIRMATION' | 'ON_COMPLETION' | 'MANUAL_FOLLOW_UP';

  @IsOptional()
  @IsIn(CUSTOMER_COLLECTION_PROVIDERS)
  paymentProvider?: (typeof CUSTOMER_COLLECTION_PROVIDERS)[number];

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  customerNotes?: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsString()
  longDescription?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  customOptions?: Array<{
    key?: string;
    label?: string;
    description?: string;
    priceCents?: string;
    defaultSelected?: boolean;
  }>;

  @IsOptional()
  @IsBoolean()
  tradeAccountDepositWaived?: boolean;

  @IsOptional()
  @IsBoolean()
  publicBundleEligible?: boolean;

  @IsOptional()
  @IsBoolean()
  publicBundleAddOn?: boolean;

  @IsOptional()
  publicBundleMaxQuantity?: string;

  @IsOptional()
  publicBundleIncompatibleServiceIds?: string[];

  @IsOptional()
  @IsBoolean()
  requireCustomerPhone?: boolean;

  @IsOptional()
  @IsBoolean()
  requireVehicleRegistration?: boolean;

  @IsOptional()
  @IsBoolean()
  requireLockingWheelNut?: boolean;
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

export class ConfirmBookingDto {
  @IsOptional()
  @IsString()
  customerNote?: string;
}

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  customerNote?: string;
}

export class RescheduleBookingDto {
  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  staffUserId?: string;

  @IsOptional()
  @IsString()
  customerNote?: string;
}

export class UpdateBookingProSettingsDto {
  @IsOptional()
  @IsBoolean()
  publicEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  autoConfirmPublicBookings?: boolean;

  @IsOptional()
  @IsBoolean()
  autoCreateJobFromBooking?: boolean;

  @IsOptional()
  @IsBoolean()
  autoAssignWorkflow?: boolean;

  @IsOptional()
  @IsBoolean()
  manualReviewMode?: boolean;

  @IsOptional()
  @IsBoolean()
  locationFirstScheduling?: boolean;

  @IsOptional()
  @IsBoolean()
  autoPopulateJobSheetFromBooking?: boolean;

  @IsOptional()
  @IsBoolean()
  autoCreateInvoiceDraftOnCompletion?: boolean;

  @IsOptional()
  @IsBoolean()
  autoSendInvoiceOnCompletion?: boolean;

  @IsOptional()
  @IsBoolean()
  technicianAssignmentRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  locationRequiredForBooking?: boolean;

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

  @IsOptional()
  @IsArray()
  folders?: Array<{
    key: string;
    displayName: string;
    publicDescription?: string;
    internalNotes?: string;
    imageUrl?: string;
    visibility?: 'PUBLIC' | 'TRADE' | 'INTERNAL' | 'ARCHIVED';
    sortOrder?: number;
  }>;
}
