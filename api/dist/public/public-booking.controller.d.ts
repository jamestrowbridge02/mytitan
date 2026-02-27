import type { Response } from 'express';
import { BookingsService } from '../bookings/bookings.service';
import { PublicBookingRequestDto } from '../bookings/dto';
export declare class PublicBookingController {
    private readonly bookingsService;
    constructor(bookingsService: BookingsService);
    config(token: string): Promise<{
        tenant: {
            name: any;
            logoUrl: any;
            timezone: any;
        };
        services: any;
        locations: any;
        staff: any;
        questions: any;
        businessHours: any;
        blackoutDates: any;
        slotMinutes: number;
    }>;
    slots(token: string, date?: string, serviceId?: string, locationId?: string): Promise<any[]>;
    create(token: string, dto: PublicBookingRequestDto): Promise<{
        booking: any;
        emailConfigured: boolean;
    }>;
    ics(token: string, res: Response): Promise<void>;
}
