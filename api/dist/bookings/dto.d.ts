import { BOOKING_STATUSES } from '../common/constants';
export declare class CreateBookingDto {
    locationId?: string;
    jobId?: string;
    serviceId?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    startsAt: string;
    endsAt: string;
    assignedUserId?: string;
    status?: (typeof BOOKING_STATUSES)[number];
}
export declare class UpdateBookingSettingsDto {
    publicEnabled?: boolean;
    businessHours?: Array<{
        dayOfWeek: number;
        startMinute: number;
        endMinute: number;
    }>;
    blackoutDates?: Array<{
        date: string;
        reason?: string;
    }>;
}
export declare class PublicBookingRequestDto {
    locationId?: string;
    serviceId: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    staffUserId?: string;
    startsAt: string;
    answers?: Array<{
        questionId: string;
        valueText?: string;
        valueJson?: any;
    }>;
}
export declare class UpsertBookingServiceDto {
    name: string;
    description?: string;
    locationId?: string;
    durationMinutes: string;
    priceCents: string;
    bufferBefore?: string;
    bufferAfter?: string;
    depositCents?: string;
}
export declare class BookingAvailabilityQueryDto {
    date: string;
    serviceId: string;
    locationId?: string;
    staffUserId?: string;
}
export declare class CreateBookingProDto {
    serviceId: string;
    startsAt: string;
    locationId?: string;
    staffUserId?: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    answers?: Array<{
        questionId: string;
        valueText?: string;
        valueJson?: any;
    }>;
}
export declare class UpdateBookingProSettingsDto {
    publicEnabled?: boolean;
    staffAvailability?: Array<{
        locationId: string;
        userId: string;
        weekday: number;
        startMinute?: number | null;
        endMinute?: number | null;
        isClosed?: boolean;
    }>;
    blackoutDates?: Array<{
        locationId?: string;
        date: string;
        reason?: string;
    }>;
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
