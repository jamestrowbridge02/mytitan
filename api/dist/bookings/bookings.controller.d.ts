import { JwtPayload } from '../auth/auth.types';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, UpdateBookingSettingsDto } from './dto';
export declare class BookingsController {
    private readonly bookingsService;
    constructor(bookingsService: BookingsService);
    create(user: JwtPayload, dto: CreateBookingDto): Promise<any>;
    list(user: JwtPayload, from?: string, to?: string): any;
    settings(user: JwtPayload): Promise<{
        publicEnabled: boolean;
        publicUrl: string;
        icsUrl: string;
        businessHours: any;
        blackoutDates: any;
        slotMinutes: number;
    }>;
    updateSettings(user: JwtPayload, dto: UpdateBookingSettingsDto): Promise<{
        publicEnabled: boolean;
        publicUrl: string;
        icsUrl: string;
        businessHours: any;
        blackoutDates: any;
        slotMinutes: number;
    }>;
}
