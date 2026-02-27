import { JwtPayload } from '../auth/auth.types';
import { CalendarService } from './calendar.service';
export declare class CalendarController {
    private readonly calendarService;
    constructor(calendarService: CalendarService);
    listBookings(user: JwtPayload, from?: string, to?: string, techId?: string, locationId?: string): Promise<{
        from: string;
        to: string;
        effectiveTo: string;
        clamped: boolean;
        technicians: any;
        blocks: any;
    }>;
}
