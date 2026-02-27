import { BadRequestException, Injectable } from '@nestjs/common';
import crypto from 'crypto';
import { AuditService } from '../audit/audit.service';
import { isLocationsAdvancedV1Enabled } from '../common/feature-flags';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto, PublicBookingRequestDto, UpdateBookingSettingsDto } from './dto';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async create(companyId: string, userId: string, dto: CreateBookingDto) {
    const db = this.prisma as any;
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || startsAt >= endsAt) {
      throw new BadRequestException('Invalid booking time range');
    }

    if (dto.jobId) {
      const job = await db.job.findFirst({ where: { id: dto.jobId, companyId } });
      if (!job) {
        throw new BadRequestException('Invalid job for this company');
      }
    }

    if (dto.locationId && db.location) {
      const location = await db.location.findFirst({ where: { id: dto.locationId, companyId } });
      if (!location) {
        throw new BadRequestException('Invalid location for this company');
      }
    }

    if (dto.assignedUserId) {
      const assignee = await db.user.findFirst({ where: { id: dto.assignedUserId, companyId } });
      if (!assignee) {
        throw new BadRequestException('Invalid assigned user for this company');
      }
    }

    const booking = await db.booking.create({
      data: {
        companyId,
        locationId: dto.locationId,
        jobId: dto.jobId,
        serviceId: dto.serviceId,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        customerPhone: dto.customerPhone,
        assignedUserId: dto.assignedUserId,
        startsAt,
        endsAt,
        status: dto.status ?? 'PLANNED',
        source: 'INTERNAL',
      },
    });

    await this.audit.log(companyId, 'booking.create', `Created booking ${booking.id}`, userId);
    return booking;
  }

  list(companyId: string, from?: string, to?: string) {
    const db = this.prisma as any;
    const startsAt: Record<string, Date> = {};

    if (from) {
      const parsed = new Date(from);
      if (!Number.isNaN(parsed.getTime())) {
        startsAt.gte = parsed;
      }
    }

    if (to) {
      const parsed = new Date(to);
      if (!Number.isNaN(parsed.getTime())) {
        startsAt.lte = parsed;
      }
    }

    return db.booking.findMany({
      where: {
        companyId,
        ...(Object.keys(startsAt).length ? { startsAt } : {}),
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  private async ensureBusinessHours(tenantId: string) {
    const db = this.prisma as any;
    const existing = await db.bookingBusinessHour.findMany({ where: { tenantId } });
    if (existing.length) return existing;

    const defaults = [
      { dayOfWeek: 1, startMinute: 9 * 60, endMinute: 17 * 60 },
      { dayOfWeek: 2, startMinute: 9 * 60, endMinute: 17 * 60 },
      { dayOfWeek: 3, startMinute: 9 * 60, endMinute: 17 * 60 },
      { dayOfWeek: 4, startMinute: 9 * 60, endMinute: 17 * 60 },
      { dayOfWeek: 5, startMinute: 9 * 60, endMinute: 17 * 60 },
    ];
    await db.bookingBusinessHour.createMany({
      data: defaults.map((entry) => ({ tenantId, ...entry })),
    });
    return db.bookingBusinessHour.findMany({ where: { tenantId } });
  }

  private async ensureBookingTokens(tenantId: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    if (!settings) return null;
    const update: Record<string, string> = {};
    if (!settings.bookingPublicToken) {
      update.bookingPublicToken = crypto.randomBytes(24).toString('base64url');
    }
    if (!settings.bookingIcsToken) {
      update.bookingIcsToken = crypto.randomBytes(24).toString('base64url');
    }
    if (Object.keys(update).length) {
      return db.tenantSetting.update({ where: { tenantId }, data: update });
    }
    return settings;
  }

  async getSettings(tenantId: string) {
    const db = this.prisma as any;
    const settings = await this.ensureBookingTokens(tenantId);
    const hours = await this.ensureBusinessHours(tenantId);
    const blackouts = await db.bookingBlackoutDate.findMany({ where: { tenantId }, orderBy: { date: 'asc' } });
    const appUrl = process.env.APP_PUBLIC_URL || 'https://app.mytitan.co.uk';

    return {
      publicEnabled: Boolean(settings?.bookingPublicEnabled),
      publicUrl: settings?.bookingPublicToken ? `${appUrl}/portal/booking/${settings.bookingPublicToken}` : null,
      icsUrl: settings?.bookingIcsToken ? `${process.env.API_PUBLIC_URL || 'https://api.mytitan.co.uk'}/public/ics/${settings.bookingIcsToken}` : null,
      businessHours: hours,
      blackoutDates: blackouts,
      slotMinutes: 30,
    };
  }

  async updateSettings(tenantId: string, userId: string, dto: UpdateBookingSettingsDto) {
    const db = this.prisma as any;
    if (typeof dto.publicEnabled === 'boolean') {
      await db.tenantSetting.update({
        where: { tenantId },
        data: { bookingPublicEnabled: dto.publicEnabled },
      });
      await this.ensureBookingTokens(tenantId);
    }

    if (Array.isArray(dto.businessHours)) {
      await db.bookingBusinessHour.deleteMany({ where: { tenantId } });
      await db.bookingBusinessHour.createMany({
        data: dto.businessHours.map((entry) => ({
          tenantId,
          dayOfWeek: Number(entry.dayOfWeek),
          startMinute: Number(entry.startMinute),
          endMinute: Number(entry.endMinute),
        })),
      });
    }

    if (Array.isArray(dto.blackoutDates)) {
      await db.bookingBlackoutDate.deleteMany({ where: { tenantId } });
      await db.bookingBlackoutDate.createMany({
        data: dto.blackoutDates.map((entry) => ({
          tenantId,
          date: new Date(entry.date),
          reason: entry.reason ?? null,
        })),
      });
    }

    await this.audit.log(tenantId, 'booking.settings.update', 'Booking settings updated', userId);
    return this.getSettings(tenantId);
  }

  async getPublicConfig(token: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findFirst({ where: { bookingPublicToken: token } });
    if (!settings || !settings.bookingPublicEnabled) {
      throw new BadRequestException('Booking portal not available');
    }

    const tenant = await db.company.findUnique({ where: { id: settings.tenantId } });
    const hours = await this.ensureBusinessHours(settings.tenantId);
    const blackouts = await db.bookingBlackoutDate.findMany({ where: { tenantId: settings.tenantId } });
    const services = await db.serviceCatalogItem.findMany({
      where: { tenantId: settings.tenantId, active: true },
      orderBy: { name: 'asc' },
    });
    const locations = await db.location.findMany({
      where: { companyId: settings.tenantId, isActive: true },
      select: { id: true, name: true, timezone: true, bookingLeadTimeMins: true, defaultAssigneeId: true },
      orderBy: { name: 'asc' },
    });

    return {
      tenant: {
        name: settings.companyName || tenant?.name || 'MyTitan',
        logoUrl: settings.logoUrl,
        timezone: settings.defaultTimezone,
      },
      services,
      locations,
      businessHours: hours,
      blackoutDates: blackouts,
      slotMinutes: 30,
    };
  }

  async getAvailableSlots(token: string, date: string, serviceId: string, locationId?: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findFirst({ where: { bookingPublicToken: token } });
    if (!settings || !settings.bookingPublicEnabled) {
      throw new BadRequestException('Booking portal not available');
    }

    const targetDate = new Date(date);
    if (Number.isNaN(targetDate.getTime())) {
      throw new BadRequestException('Invalid date');
    }

    const dayStart = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const blackout = await db.bookingBlackoutDate.findFirst({
      where: { tenantId: settings.tenantId, date: { gte: dayStart, lt: dayEnd } },
    });
    if (blackout) {
      return [];
    }

    const service = await db.serviceCatalogItem.findFirst({
      where: { id: serviceId, tenantId: settings.tenantId, active: true },
    });
    if (!service) {
      throw new BadRequestException('Service not found');
    }

    const hours = await this.ensureBusinessHours(settings.tenantId);
    const activeLocation = locationId
      ? await db.location.findFirst({ where: { id: locationId, companyId: settings.tenantId, isActive: true } })
      : null;
    const dayOfWeek = targetDate.getUTCDay();
    let dayHours = hours.find((entry) => entry.dayOfWeek === dayOfWeek);
    let leadTimeMins = 0;
    let staffCapacity = Number(service.capacity || 1);
    if (isLocationsAdvancedV1Enabled() && activeLocation) {
      const locationHours = await db.locationBusinessHour.findFirst({
        where: { companyId: settings.tenantId, locationId: activeLocation.id, weekday: dayOfWeek },
      });
      if (locationHours) {
        dayHours = locationHours.isClosed
          ? null
          : {
              dayOfWeek,
              startMinute: Number(locationHours.startMinute ?? 9 * 60),
              endMinute: Number(locationHours.endMinute ?? 17 * 60),
            };
      }
      leadTimeMins = Number(activeLocation.bookingLeadTimeMins || 0);
      const staffCount = await db.locationStaffAssignment.count({ where: { companyId: settings.tenantId, locationId: activeLocation.id } });
      if (staffCount > 0) {
        staffCapacity = Math.max(1, staffCount);
      }
    }
    if (!dayHours) {
      return [];
    }

    const slotMinutes = 30;
    const durationMinutes = Number(service.durationMinutes || 60);
    const capacity = Number(service.capacity || 1);
    const windowStart = new Date(dayStart.getTime() + dayHours.startMinute * 60000);
    const windowEnd = new Date(dayStart.getTime() + dayHours.endMinute * 60000);

    const bookings = await db.booking.findMany({
      where: {
        companyId: settings.tenantId,
        ...(activeLocation ? { locationId: activeLocation.id } : {}),
        startsAt: { lt: windowEnd },
        endsAt: { gt: windowStart },
        status: { not: 'CANCELLED' },
      },
    });
    const minBookAt = new Date(Date.now() + leadTimeMins * 60_000);

    const slots = [];
    for (let minute = dayHours.startMinute; minute + durationMinutes <= dayHours.endMinute; minute += slotMinutes) {
      const slotStart = new Date(dayStart.getTime() + minute * 60000);
      if (slotStart < minBookAt) continue;
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);
      const overlapping = bookings.filter(
        (booking) => booking.startsAt < slotEnd && booking.endsAt > slotStart,
      ).length;
      if (overlapping < Math.max(capacity, staffCapacity)) {
        slots.push({
          startsAt: slotStart.toISOString(),
          endsAt: slotEnd.toISOString(),
          locationId: activeLocation?.id || null,
        });
      }
    }

    return slots;
  }

  async createPublicBooking(token: string, dto: PublicBookingRequestDto) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findFirst({ where: { bookingPublicToken: token } });
    if (!settings || !settings.bookingPublicEnabled) {
      throw new BadRequestException('Booking portal not available');
    }

    const service = await db.serviceCatalogItem.findFirst({
      where: { id: dto.serviceId, tenantId: settings.tenantId, active: true },
    });
    if (!service) {
      throw new BadRequestException('Service not found');
    }

    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Invalid booking time');
    }
    const durationMinutes = Number(service.durationMinutes || 60);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60000);

    const daySlots = await this.getAvailableSlots(token, startsAt.toISOString().slice(0, 10), service.id, dto.locationId);
    const slotMatch = daySlots.find((slot) => slot.startsAt === startsAt.toISOString());
    if (!slotMatch) {
      throw new BadRequestException('Selected slot is no longer available');
    }

    const location = dto.locationId
      ? await db.location.findFirst({
          where: { id: dto.locationId, companyId: settings.tenantId, isActive: true },
          select: { id: true, defaultAssigneeId: true },
        })
      : null;

    const booking = await db.booking.create({
      data: {
        companyId: settings.tenantId,
        locationId: location?.id || null,
        serviceId: service.id,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        customerPhone: dto.customerPhone,
        assignedUserId: location?.defaultAssigneeId || null,
        startsAt,
        endsAt,
        status: 'PENDING',
        source: 'PUBLIC',
      },
    });

    await this.audit.log(settings.tenantId, 'booking.public.create', `Public booking ${booking.id} created`, null);

    const emailConfigured = Boolean(settings.smtpHost);
    if (!emailConfigured) {
      await this.audit.log(settings.tenantId, 'booking.email.missing', 'SMTP not configured for booking emails', null);
    }

    return { booking, emailConfigured };
  }

  async getIcsFeed(token: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findFirst({ where: { bookingIcsToken: token } });
    if (!settings) {
      throw new BadRequestException('Invalid ICS token');
    }

    const bookings = await db.booking.findMany({
      where: { companyId: settings.tenantId, status: { not: 'CANCELLED' } },
      orderBy: { startsAt: 'asc' },
    });

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MyTitan//Booking Feed//EN',
    ];
    for (const booking of bookings) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${booking.id}@mytitan`);
      lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\\.\\d{3}Z$/, 'Z')}`);
      lines.push(`DTSTART:${new Date(booking.startsAt).toISOString().replace(/[-:]/g, '').replace(/\\.\\d{3}Z$/, 'Z')}`);
      lines.push(`DTEND:${new Date(booking.endsAt).toISOString().replace(/[-:]/g, '').replace(/\\.\\d{3}Z$/, 'Z')}`);
      lines.push(`SUMMARY:Booking ${booking.status}`);
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\\r\\n');
  }
}
