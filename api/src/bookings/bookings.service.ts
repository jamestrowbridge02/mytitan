import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import crypto from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AutomationsService } from '../automations/automations.service';
import { isAutomationsV1Enabled, isBookingProV1Enabled, isLocationsAdvancedV1Enabled } from '../common/feature-flags';
import { ActivityService } from '../events/activity.service';
import { JobsService } from '../jobs/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { acquireTechnicianLock } from '../common/advisory-lock';
import {
  BookingAvailabilityQueryDto,
  CreateBookingDto,
  CreateBookingProDto,
  PublicBookingRequestDto,
  UpdateBookingProSettingsDto,
  UpdateBookingSettingsDto,
  UpsertBookingServiceDto,
} from './dto';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly automations: AutomationsService,
    private readonly activity: ActivityService,
    private readonly jobs: JobsService,
  ) {}
  private readonly logger = new Logger(BookingsService.name);

  private async resolveAutomationActorId(companyId: string, userId: string | null) {
    if (userId) return userId;
    const db = this.prisma as any;
    const owner = await db.user.findFirst({ where: { companyId, role: 'OWNER' }, select: { id: true } });
    return owner?.id || null;
  }

  private async enqueueBookingReminder(companyId: string, userId: string | null, bookingId: string, reasonKey: string, scheduledFor: Date) {
    const db = this.prisma as any;
    const scheduledForIso = scheduledFor.toISOString();
    const recent = await db.notification.findFirst({
      where: {
        companyId,
        entityType: 'booking',
        entityId: bookingId,
        AND: [
          { metaJson: { path: ['reasonKey'], equals: reasonKey } },
          { metaJson: { path: ['context', 'scheduledFor'], equals: scheduledForIso } },
        ],
      },
    });
    if (recent) return;
    const actorId = await this.resolveAutomationActorId(companyId, userId);
    if (!actorId) return;
    await this.notifications.sendEntityUpdate(companyId, actorId, {
      entityType: 'booking',
      entityId: bookingId,
      templateKey: reasonKey,
      channel: 'in_app',
      context: { scheduledFor: scheduledForIso },
      note: 'Automation booking reminder',
    });
  }

  private async maybeQueueBookingReminders(companyId: string, userId: string | null, booking: any) {
    if (!isAutomationsV1Enabled()) return;
    const enabled = await this.automations.getSettings(companyId);
    if (!enabled.bookingRemindersEnabled) return;
    const startsAt = booking?.startsAt ? new Date(booking.startsAt) : null;
    if (!startsAt || Number.isNaN(startsAt.getTime())) return;
    const now = new Date();
    const diffMs = startsAt.getTime() - now.getTime();
    if (diffMs <= 0) return;
    const hours24 = 24 * 60 * 60 * 1000;
    const hours2 = 2 * 60 * 60 * 1000;
    if (diffMs <= hours24) {
      const scheduledFor = new Date(startsAt.getTime() - hours24);
      if (scheduledFor.getTime() <= now.getTime()) {
        await this.enqueueBookingReminder(companyId, userId, booking.id, 'booking_reminder_24h', scheduledFor);
      }
    }
    if (diffMs <= hours2) {
      const scheduledFor = new Date(startsAt.getTime() - hours2);
      if (scheduledFor.getTime() <= now.getTime()) {
        await this.enqueueBookingReminder(companyId, userId, booking.id, 'booking_reminder_2h', scheduledFor);
      }
    }
  }

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

    const booking = await db.$transaction(async (tx: any) => {
      const technicianId = dto.assignedUserId ?? null;
      if (technicianId) {
        await acquireTechnicianLock(tx, companyId, technicianId);
        const conflicts = await tx.booking.findMany({
          where: {
            companyId,
            assignedUserId: technicianId,
            status: { not: 'CANCELLED' },
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
          },
        });
        if (conflicts.length > 0) {
          this.logger.warn('Booking prevented due to technician overlap', {
            companyId,
            technicianId,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            conflictCount: conflicts.length,
          });
          throw new ConflictException({
            code: 'CALENDAR_CONFLICT',
            conflicts: conflicts.map((conflict: any) => conflict.id),
          });
        }
      }
      return tx.booking.create({
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
    });

    await this.audit.log(companyId, 'booking.create', `Created booking ${booking.id}`, userId);
    await this.maybeQueueBookingReminders(companyId, userId, booking);
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

  async convertToJob(companyId: string, userId: string, bookingId: string) {
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({
      where: { id: bookingId, companyId },
      include: {
        job: true,
        service: { select: { id: true, name: true } },
        proService: { select: { id: true, name: true } },
      },
    });

    if (!booking) {
      throw new BadRequestException('Booking not found');
    }

    if (booking.jobId && booking.job) {
      return {
        booking,
        job: booking.job,
        alreadyLinked: true,
      };
    }

    const created = await this.jobs.create(companyId, userId, {
      locationId: booking.locationId || undefined,
      customerName: String(booking.customerName || '').trim() || 'Booking customer',
      customerEmail: String(booking.customerEmail || '').trim() || undefined,
      customerPhone: String(booking.customerPhone || '').trim() || undefined,
      serviceName: booking.proService?.name || booking.service?.name || undefined,
      scheduledAt: booking.startsAt ? new Date(booking.startsAt).toISOString() : undefined,
      formData: {
        sourceBookingId: booking.id,
        bookingSource: booking.source,
        bookingStatus: booking.status,
        scheduledAt: booking.startsAt ? new Date(booking.startsAt).toISOString() : null,
        customerName: booking.customerName || null,
        customerEmail: booking.customerEmail || null,
        customerPhone: booking.customerPhone || null,
      },
    });

    const nextStatus =
      booking.status === 'IN_PROGRESS'
        ? 'IN_PROGRESS'
        : booking.status === 'COMPLETED'
        ? 'COMPLETED'
        : 'SCHEDULED';

    const patchedJob = await this.jobs.patchPartial(companyId, userId, created.id, {
      status: nextStatus as any,
      assignedUserId: booking.assignedUserId || undefined,
      scheduledAt: booking.startsAt ? new Date(booking.startsAt).toISOString() : undefined,
      locationId: booking.locationId || undefined,
    });

    const linkedBooking = await db.booking.update({
      where: { id: booking.id },
      data: {
        jobId: patchedJob.id,
        status: booking.status === 'PENDING' || booking.status === 'PLANNED' ? 'CONFIRMED' : booking.status,
      },
    });

    await db.jobActivity.create({
      data: {
        companyId,
        jobId: patchedJob.id,
        actorUserId: userId,
        eventType: 'booking.converted',
        message: `Booking ${booking.id} converted into ${patchedJob.jobRef || patchedJob.id}`,
        payloadJson: {
          bookingId: booking.id,
          bookingSource: booking.source,
          bookingStartsAt: booking.startsAt,
        },
      },
    });

    await this.activity.push({
      tenantId: companyId,
      type: 'booking.converted',
      label: `Booking ${booking.id} converted to ${patchedJob.jobRef || patchedJob.id}`,
      jobId: patchedJob.id,
      jobRef: patchedJob.jobRef || null,
      customerId: patchedJob.customerId || null,
      customerName: patchedJob.customerName || booking.customerName || null,
      status: patchedJob.status || null,
      technicianId: patchedJob.assignedUserId || booking.assignedUserId || null,
      payloadJson: {
        bookingId: booking.id,
        bookingSource: booking.source,
        bookingStatus: booking.status,
      },
    });

    if (isAutomationsV1Enabled()) {
      await this.automations.handleBookingConverted(companyId, userId, linkedBooking, patchedJob);
    }

    await this.audit.log(companyId, 'booking.convert', `Converted booking ${booking.id} into ${patchedJob.jobRef || patchedJob.id}`, userId);

    return {
      booking: linkedBooking,
      job: patchedJob,
      alreadyLinked: false,
    };
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
    const proEnabled = isBookingProV1Enabled();
    const proServices = proEnabled
      ? await db.service.findMany({
          where: { companyId: settings.tenantId, isActive: true },
          orderBy: { name: 'asc' },
        })
      : [];
    const services = proServices.length > 0
      ? proServices.map((service: any) => ({
          id: service.id,
          name: service.name,
          description: service.description,
          priceCents: service.priceCents,
          durationMinutes: service.durationMinutes,
          bufferBefore: service.bufferBefore,
          bufferAfter: service.bufferAfter,
          depositCents: service.depositCents,
        }))
      : await db.serviceCatalogItem.findMany({
          where: { tenantId: settings.tenantId, active: true },
          orderBy: { name: 'asc' },
        });
    const locations = await db.location.findMany({
      where: { companyId: settings.tenantId, isActive: true },
      select: { id: true, name: true, timezone: true, bookingLeadTimeMins: true, defaultAssigneeId: true },
      orderBy: { name: 'asc' },
    });
    const staff = proEnabled
      ? await db.user.findMany({
          where: { companyId: settings.tenantId, role: { in: ['OWNER', 'ADMIN', 'STAFF'] } },
          select: { id: true, email: true },
          orderBy: { email: 'asc' },
        })
      : [];
    const questions = proEnabled
      ? await db.bookingQuestion.findMany({
          where: { companyId: settings.tenantId, isActive: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    return {
      tenant: {
        name: settings.companyName || tenant?.name || 'MyTitan',
        logoUrl: settings.logoUrl,
        timezone: settings.defaultTimezone,
      },
      services,
      locations,
      staff,
      questions,
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

    if (isBookingProV1Enabled()) {
      const proService = await db.service.findFirst({
        where: { id: serviceId, companyId: settings.tenantId, isActive: true },
      });
      if (proService) {
        return this.computeProSlots(settings.tenantId, {
          date,
          serviceId,
          locationId,
        });
      }
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

    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('Invalid booking time');
    const proEnabled = isBookingProV1Enabled();

    const proService = proEnabled
      ? await db.service.findFirst({ where: { id: dto.serviceId, companyId: settings.tenantId, isActive: true } })
      : null;
    const legacyService = proService
      ? null
      : await db.serviceCatalogItem.findFirst({
          where: { id: dto.serviceId, tenantId: settings.tenantId, active: true },
        });
    if (!proService && !legacyService) throw new BadRequestException('Service not found');

    const durationMinutes = Number(proService?.durationMinutes ?? legacyService?.durationMinutes ?? 60);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60000);
    const daySlots = await this.getAvailableSlots(token, startsAt.toISOString().slice(0, 10), dto.serviceId, dto.locationId);
    if (!daySlots.some((slot) => slot.startsAt === startsAt.toISOString())) {
      throw new BadRequestException('Selected slot is no longer available');
    }

    const location = dto.locationId
      ? await db.location.findFirst({ where: { id: dto.locationId, companyId: settings.tenantId, isActive: true }, select: { id: true, defaultAssigneeId: true } })
      : null;

    const booking = await db.booking.create({
      data: {
        companyId: settings.tenantId,
        locationId: location?.id || null,
        serviceId: legacyService?.id || null,
        proServiceId: proService?.id || null,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        customerPhone: dto.customerPhone,
        assignedUserId: dto.staffUserId || location?.defaultAssigneeId || null,
        startsAt,
        endsAt,
        status: 'PENDING',
        source: 'PUBLIC',
      },
    });

    if (Array.isArray(dto.answers) && dto.answers.length > 0) {
      await db.bookingAnswer.createMany({
        data: dto.answers
          .filter((ans) => ans?.questionId)
          .map((ans) => ({
            companyId: settings.tenantId,
            bookingId: booking.id,
            questionId: ans.questionId,
            valueText: ans.valueText || null,
            valueJson: ans.valueJson ?? null,
          })),
      });
    }

    await this.audit.log(settings.tenantId, 'booking.public.create', `Public booking ${booking.id} created`, null);
    await this.maybeQueueBookingReminders(settings.tenantId, null, booking);

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

  async listProServices(companyId: string, locationId?: string) {
    const db = this.prisma as any;
    return db.service.findMany({
      where: {
        companyId,
        isActive: true,
        ...(locationId ? { OR: [{ locationId }, { locationId: null }] } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async createProService(companyId: string, userId: string, dto: UpsertBookingServiceDto) {
    const db = this.prisma as any;
    const service = await db.service.create({
      data: {
        companyId,
        locationId: dto.locationId || null,
        name: dto.name.trim(),
        description: dto.description || null,
        durationMinutes: Math.max(5, Number(dto.durationMinutes || 60)),
        priceCents: Math.max(0, Number(dto.priceCents || 0)),
        bufferBefore: Math.max(0, Number(dto.bufferBefore || 0)),
        bufferAfter: Math.max(0, Number(dto.bufferAfter || 0)),
        depositCents: Math.max(0, Number(dto.depositCents || 0)),
      },
    });
    await this.audit.log(companyId, 'booking.pro.service.create', `Created service ${service.name}`, userId);
    return service;
  }

  private async computeProSlots(companyId: string, query: BookingAvailabilityQueryDto) {
    const db = this.prisma as any;
    const service = await db.service.findFirst({
      where: { id: query.serviceId, companyId, isActive: true },
    });
    if (!service) throw new BadRequestException('Service not found');

    const targetDate = new Date(query.date);
    if (Number.isNaN(targetDate.getTime())) throw new BadRequestException('Invalid date');
    const dayStart = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekday = dayStart.getUTCDay();

    const blackout = await db.blackoutDate.findFirst({
      where: { companyId, locationId: query.locationId || null, date: { gte: dayStart, lt: dayEnd } },
    });
    if (blackout) return [];

    let startMinute = 9 * 60;
    let endMinute = 17 * 60;
    let leadTimeMins = 0;
    const location = query.locationId
      ? await db.location.findFirst({ where: { id: query.locationId, companyId, isActive: true } })
      : null;
    if (location) leadTimeMins = Number(location.bookingLeadTimeMins || 0);

    if (location) {
      const locHours = await db.locationBusinessHour.findFirst({ where: { companyId, locationId: location.id, weekday } });
      if (locHours?.isClosed) return [];
      if (locHours && locHours.startMinute != null && locHours.endMinute != null) {
        startMinute = Number(locHours.startMinute);
        endMinute = Number(locHours.endMinute);
      }
    }

    if (query.staffUserId) {
      const staff = await db.staffAvailability.findFirst({
        where: { companyId, locationId: query.locationId || undefined, userId: query.staffUserId, weekday },
      });
      if (staff?.isClosed) return [];
      if (staff && staff.startMinute != null && staff.endMinute != null) {
        startMinute = Math.max(startMinute, Number(staff.startMinute));
        endMinute = Math.min(endMinute, Number(staff.endMinute));
      }
    }

    const duration = Number(service.durationMinutes || 60);
    const bufferBefore = Number(service.bufferBefore || 0);
    const bufferAfter = Number(service.bufferAfter || 0);
    const slotMinutes = 15;
    const windowStart = new Date(dayStart.getTime() + startMinute * 60000);
    const windowEnd = new Date(dayStart.getTime() + endMinute * 60000);
    const minBookAt = new Date(Date.now() + leadTimeMins * 60000);

    const existing = await db.booking.findMany({
      where: {
        companyId,
        ...(query.locationId ? { locationId: query.locationId } : {}),
        ...(query.staffUserId ? { assignedUserId: query.staffUserId } : {}),
        startsAt: { lt: windowEnd },
        endsAt: { gt: windowStart },
        status: { not: 'CANCELLED' },
      },
      orderBy: { startsAt: 'asc' },
    });

    const slots: Array<{ startsAt: string; endsAt: string; serviceId: string; staffUserId?: string | null }> = [];
    for (let minute = startMinute; minute + duration <= endMinute; minute += slotMinutes) {
      const startsAt = new Date(dayStart.getTime() + minute * 60000);
      if (startsAt < minBookAt) continue;
      const endsAt = new Date(startsAt.getTime() + duration * 60000);
      const blocked = existing.some((b: any) => {
        const bStart = new Date(new Date(b.startsAt).getTime() - bufferBefore * 60000);
        const bEnd = new Date(new Date(b.endsAt).getTime() + bufferAfter * 60000);
        return bStart < endsAt && bEnd > startsAt;
      });
      if (!blocked) {
        slots.push({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          serviceId: service.id,
          staffUserId: query.staffUserId || null,
        });
      }
    }
    return slots;
  }

  async getProAvailability(companyId: string, query: BookingAvailabilityQueryDto) {
    return this.computeProSlots(companyId, query);
  }

  async createProBooking(companyId: string, userId: string, dto: CreateBookingProDto) {
    const db = this.prisma as any;
    const service = await db.service.findFirst({ where: { id: dto.serviceId, companyId, isActive: true } });
    if (!service) throw new BadRequestException('Service not found');

    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('Invalid start time');
    const endsAt = new Date(startsAt.getTime() + Number(service.durationMinutes || 60) * 60000);

    const daySlots = await this.computeProSlots(companyId, {
      date: startsAt.toISOString().slice(0, 10),
      serviceId: service.id,
      locationId: dto.locationId,
      staffUserId: dto.staffUserId,
    });
    if (!daySlots.some((slot) => slot.startsAt === startsAt.toISOString())) {
      throw new BadRequestException('Selected slot is no longer available');
    }

    const booking = await db.booking.create({
      data: {
        companyId,
        locationId: dto.locationId || null,
        proServiceId: service.id,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        customerPhone: dto.customerPhone || null,
        assignedUserId: dto.staffUserId || null,
        startsAt,
        endsAt,
        status: 'PLANNED',
        source: 'INTERNAL',
      },
    });

    if (Array.isArray(dto.answers) && dto.answers.length > 0) {
      await db.bookingAnswer.createMany({
        data: dto.answers
          .filter((ans) => ans?.questionId)
          .map((ans) => ({
            companyId,
            bookingId: booking.id,
            questionId: ans.questionId,
            valueText: ans.valueText || null,
            valueJson: ans.valueJson ?? null,
          })),
      });
    }

    await this.audit.log(companyId, 'booking.pro.create', `Created Booking Pro booking ${booking.id}`, userId);
    await this.maybeQueueBookingReminders(companyId, userId, booking);
    return booking;
  }

  async getProSettings(companyId: string) {
    const db = this.prisma as any;
    const [settings, staffAvailability, blackoutDates, questions] = await Promise.all([
      db.tenantSetting.findUnique({ where: { tenantId: companyId } }),
      db.staffAvailability.findMany({ where: { companyId }, orderBy: [{ locationId: 'asc' }, { userId: 'asc' }, { weekday: 'asc' }] }),
      db.blackoutDate.findMany({ where: { companyId }, orderBy: { date: 'asc' } }),
      db.bookingQuestion.findMany({ where: { companyId, isActive: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      publicEnabled: Boolean(settings?.bookingPublicEnabled),
      staffAvailability,
      blackoutDates,
      questions,
    };
  }

  async updateProSettings(companyId: string, userId: string, dto: UpdateBookingProSettingsDto) {
    const db = this.prisma as any;
    if (typeof dto.publicEnabled === 'boolean') {
      await db.tenantSetting.update({
        where: { tenantId: companyId },
        data: { bookingPublicEnabled: dto.publicEnabled },
      });
    }

    if (Array.isArray(dto.staffAvailability)) {
      await db.staffAvailability.deleteMany({ where: { companyId } });
      if (dto.staffAvailability.length > 0) {
        await db.staffAvailability.createMany({
          data: dto.staffAvailability.map((entry) => ({
            companyId,
            locationId: entry.locationId,
            userId: entry.userId,
            weekday: Number(entry.weekday),
            startMinute: entry.startMinute ?? null,
            endMinute: entry.endMinute ?? null,
            isClosed: Boolean(entry.isClosed),
          })),
        });
      }
    }

    if (Array.isArray(dto.blackoutDates)) {
      await db.blackoutDate.deleteMany({ where: { companyId } });
      if (dto.blackoutDates.length > 0) {
        await db.blackoutDate.createMany({
          data: dto.blackoutDates.map((entry) => ({
            companyId,
            locationId: entry.locationId || null,
            date: new Date(entry.date),
            reason: entry.reason || null,
          })),
        });
      }
    }

    if (Array.isArray(dto.questions)) {
      await db.bookingQuestion.updateMany({ where: { companyId }, data: { isActive: false } });
      for (const question of dto.questions) {
        if (!question?.label || !question?.questionKey) continue;
        if (question.id) {
          await db.bookingQuestion.update({
            where: { id: question.id },
            data: {
              locationId: question.locationId || null,
              label: question.label,
              questionKey: question.questionKey,
              type: question.type || 'text',
              required: Boolean(question.required),
              optionsJson: question.optionsJson ?? null,
              isActive: true,
            },
          });
          continue;
        }
        await db.bookingQuestion.create({
          data: {
            companyId,
            locationId: question.locationId || null,
            label: question.label,
            questionKey: question.questionKey,
            type: question.type || 'text',
            required: Boolean(question.required),
            optionsJson: question.optionsJson ?? null,
            isActive: true,
          },
        });
      }
    }

    await this.audit.log(companyId, 'booking.pro.settings.update', 'Booking Pro settings updated', userId);
    return this.getProSettings(companyId);
  }
}
