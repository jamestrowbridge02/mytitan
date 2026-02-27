import { PrismaService } from '../prisma/prisma.service';
type ListCalendarBookingsInput = {
    from?: string;
    to?: string;
    techId?: string;
    locationId?: string;
};
export declare class CalendarService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listBookings(tenantId: string, input: ListCalendarBookingsInput): Promise<{
        from: string;
        to: string;
        effectiveTo: string;
        clamped: boolean;
        technicians: any;
        blocks: any;
    }>;
    private parseRequiredDate;
}
export {};
