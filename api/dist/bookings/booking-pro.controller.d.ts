import { JwtPayload } from '../auth/auth.types';
import { BookingsService } from './bookings.service';
import { BookingAvailabilityQueryDto, CreateBookingProDto, UpdateBookingProSettingsDto, UpsertBookingServiceDto } from './dto';
export declare class BookingProController {
    private readonly bookingsService;
    constructor(bookingsService: BookingsService);
    services(user: JwtPayload, locationId?: string): Promise<any>;
    createService(user: JwtPayload, dto: UpsertBookingServiceDto): Promise<any>;
    availability(user: JwtPayload, query: BookingAvailabilityQueryDto): Promise<{
        startsAt: string;
        endsAt: string;
        serviceId: string;
        staffUserId?: string | null;
    }[]>;
    createBooking(user: JwtPayload, dto: CreateBookingProDto): Promise<any>;
    settings(user: JwtPayload): Promise<{
        publicEnabled: boolean;
        staffAvailability: any;
        blackoutDates: any;
        questions: any;
    }>;
    updateSettings(user: JwtPayload, dto: UpdateBookingProSettingsDto): Promise<{
        publicEnabled: boolean;
        staffAvailability: any;
        blackoutDates: any;
        questions: any;
    }>;
}
