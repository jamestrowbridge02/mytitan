import { AuditService } from '../audit/audit.service';
import { AutomationsService } from '../automations/automations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingAvailabilityQueryDto, CreateBookingDto, CreateBookingProDto, PublicBookingRequestDto, UpdateBookingProSettingsDto, UpdateBookingSettingsDto, UpsertBookingServiceDto } from './dto';
export declare class BookingsService {
    private readonly prisma;
    private readonly audit;
    private readonly notifications;
    private readonly automations;
    constructor(prisma: PrismaService, audit: AuditService, notifications: NotificationsService, automations: AutomationsService);
    private resolveAutomationActorId;
    private enqueueBookingReminder;
    private maybeQueueBookingReminders;
    create(companyId: string, userId: string, dto: CreateBookingDto): Promise<any>;
    list(companyId: string, from?: string, to?: string): any;
    private ensureBusinessHours;
    private ensureBookingTokens;
    getSettings(tenantId: string): Promise<{
        publicEnabled: boolean;
        publicUrl: string;
        icsUrl: string;
        businessHours: any;
        blackoutDates: any;
        slotMinutes: number;
    }>;
    updateSettings(tenantId: string, userId: string, dto: UpdateBookingSettingsDto): Promise<{
        publicEnabled: boolean;
        publicUrl: string;
        icsUrl: string;
        businessHours: any;
        blackoutDates: any;
        slotMinutes: number;
    }>;
    getPublicConfig(token: string): Promise<{
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
    getAvailableSlots(token: string, date: string, serviceId: string, locationId?: string): Promise<any[]>;
    createPublicBooking(token: string, dto: PublicBookingRequestDto): Promise<{
        booking: any;
        emailConfigured: boolean;
    }>;
    getIcsFeed(token: string): Promise<string>;
    listProServices(companyId: string, locationId?: string): Promise<any>;
    createProService(companyId: string, userId: string, dto: UpsertBookingServiceDto): Promise<any>;
    private computeProSlots;
    getProAvailability(companyId: string, query: BookingAvailabilityQueryDto): Promise<{
        startsAt: string;
        endsAt: string;
        serviceId: string;
        staffUserId?: string | null;
    }[]>;
    createProBooking(companyId: string, userId: string, dto: CreateBookingProDto): Promise<any>;
    getProSettings(companyId: string): Promise<{
        publicEnabled: boolean;
        staffAvailability: any;
        blackoutDates: any;
        questions: any;
    }>;
    updateProSettings(companyId: string, userId: string, dto: UpdateBookingProSettingsDto): Promise<{
        publicEnabled: boolean;
        staffAvailability: any;
        blackoutDates: any;
        questions: any;
    }>;
}
