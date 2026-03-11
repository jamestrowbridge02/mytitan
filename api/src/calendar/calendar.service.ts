import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isNotificationsV1Enabled, isSchedulingIntelligenceV1Enabled } from '../common/feature-flags';
import { acquireTechnicianLock } from '../common/advisory-lock';
import { withCompanyId } from '../common/tenant-scope';

type ListCalendarBookingsInput = {
  from?: string;
  to?: string;
  techId?: string;
  locationId?: string;
};

type ListCalendarSchedulesInput = {
  from?: string;
  to?: string;
};

const SUGGESTION_REASON_ORDER = [
  'WITHIN_WORKING_HOURS',
  'AVOIDS_TIME_OFF',
  'NO_OVERLAPS',
  'UNDER_CAPACITY',
  'OVER_CAPACITY',
  'EARLIEST_AVAILABLE',
] as const;

type SuggestionReason = (typeof SUGGESTION_REASON_ORDER)[number];

type SuggestionResult = {
  technicianId: string;
  technicianName: string;
  startsAt: string;
  endsAt: string;
  score: number;
  reasons: SuggestionReason[];
};

type WeeklyScheduleSlot = {
  start?: string | null;
  end?: string | null;
};

type WeeklyScheduleJson = Record<string, WeeklyScheduleSlot[]>;

type TechScheduleSettingRecord = {
  technicianId: string;
  weeklyJson: WeeklyScheduleJson;
  timezone: string | null;
};

type TechScheduleExceptionRecord = {
  id: string;
  technicianId: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  reason: string | null;
};

type TechScheduleUpdateResult = {
  technicianId: string;
  timezone: string | null;
  weeklyJson: WeeklyScheduleJson;
};

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type ScheduleWarning =
  | {
      code: 'OUTSIDE_WORKING_HOURS';
      day: string;
      bookedMinutes?: number;
      capacityMinutes?: number;
    }
  | {
      code: 'OVER_CAPACITY';
      day: string;
      bookedMinutes?: number;
      capacityMinutes?: number;
    }
  | {
      code: 'TIME_OFF';
      exceptionIds: string[];
      startsAt: Date;
      endsAt: Date;
    };

type ScheduleException = {
  id: string;
  technicianId: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  reason?: string | null;
};

type SuggestionContext = {
  technicians: Array<{ id: string; email: string }>;
  settings: TechScheduleSettingRecord[];
  bookings: Array<{ assignedUserId: string | null; startsAt: Date | string; endsAt: Date | string }>;
  exceptions: Array<{ technicianId: string; startsAt: Date | string; endsAt: Date | string }>;
};

type CapacityStatus = 'OFF' | 'UNDER' | 'OK' | 'OVER';

type CapacityCell = {
  availableMinutes: number;
  bookedMinutes: number;
  utilizationPct: number;
  status: CapacityStatus;
};

type CapacityRangeInput = {
  from?: string;
  to?: string;
};

type CapacityResponse = {
  from: string;
  to: string;
  technicians: Array<{ id: string; name: string }>;
  days: string[];
  capacity: Record<string, Record<string, CapacityCell>>;
};

const MAX_RANGE_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SUGGESTION_INCREMENT_MINUTES = 15;
const DEFAULT_BOOKING_DURATION_MINUTES = 60;

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}
  private readonly logger = new Logger(CalendarService.name);

  async listBookings(tenantId: string, input: ListCalendarBookingsInput) {
    const from = this.parseRequiredDate(input.from, 'from');
    const to = this.parseRequiredDate(input.to, 'to');

    if (to.getTime() <= from.getTime()) {
      throw new BadRequestException('`to` must be greater than `from`.');
    }

    const maxTo = new Date(from.getTime() + MAX_RANGE_DAYS * MS_PER_DAY);
    const effectiveTo = to.getTime() > maxTo.getTime() ? maxTo : to;

    const db = this.prisma as any;
    const [technicians, bookings] = await Promise.all([
      db.user.findMany({
        where: withCompanyId(tenantId, {
          role: { in: ['OWNER', 'ADMIN', 'STAFF', 'TECHNICIAN'] },
        }),
        select: { id: true, email: true },
        orderBy: { email: 'asc' },
      }),
      db.booking.findMany({
        where: withCompanyId(tenantId, {
          ...(input.techId ? { assignedUserId: input.techId } : {}),
          ...(input.locationId ? { locationId: input.locationId } : {}),
          startsAt: { lt: effectiveTo },
          endsAt: { gt: from },
        }),
        include: {
          assignedUser: { select: { id: true, email: true } },
          location: { select: { id: true, name: true } },
          job: {
            select: {
              id: true,
              jobRef: true,
              status: true,
              customerName: true,
              customerEmail: true,
              customerPhone: true,
            },
          },
        },
        orderBy: [{ startsAt: 'asc' }, { endsAt: 'asc' }],
      }),
    ]);

    const blocks = bookings.map((booking: any) => ({
      id: booking.id,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: booking.status,
      source: booking.source,
      customer: {
        name: booking.customerName || null,
        email: booking.customerEmail || null,
        phone: booking.customerPhone || null,
      },
      technician: booking.assignedUser
        ? {
            id: booking.assignedUser.id,
            name: booking.assignedUser.email,
            email: booking.assignedUser.email,
          }
        : null,
      location: booking.location
        ? {
            id: booking.location.id,
            name: booking.location.name,
          }
        : null,
      jobSummary: booking.job
        ? {
            id: booking.job.id,
            jobRef: booking.job.jobRef,
            status: booking.job.status,
            customerName: booking.job.customerName,
            customerEmail: booking.job.customerEmail,
            customerPhone: booking.job.customerPhone,
          }
        : null,
    }));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      effectiveTo: effectiveTo.toISOString(),
      clamped: effectiveTo.getTime() !== to.getTime(),
      technicians: technicians.map((tech: any) => ({
        id: tech.id,
        name: tech.email,
        email: tech.email,
      })),
      blocks,
    };
  }

  async listSchedules(tenantId: string, input: ListCalendarSchedulesInput) {
    const from = this.parseRequiredDate(input.from, 'from');
    const to = this.parseRequiredDate(input.to, 'to');

    if (to.getTime() <= from.getTime()) {
      throw new BadRequestException('`to` must be greater than `from`.');
    }

    const db = this.prisma as any;
    const technicians = await db.user.findMany({
      where: withCompanyId(tenantId, {
        role: { in: ['OWNER', 'ADMIN', 'STAFF', 'TECHNICIAN'] },
      }),
      select: { id: true, email: true },
      orderBy: { email: 'asc' },
    });
    const technicianIds = technicians.map((tech: any) => tech.id);
    const [settings, exceptions] = await Promise.all([
      db.techScheduleSetting.findMany({
        where: withCompanyId(tenantId, {
          technicianId: { in: technicianIds },
        }),
        select: {
          technicianId: true,
          weeklyJson: true,
          timezone: true,
        },
      }),
      db.techScheduleException.findMany({
        where: withCompanyId(tenantId, {
          technicianId: { in: technicianIds },
          startsAt: { lt: to },
          endsAt: { gt: from },
        }),
        select: {
          id: true,
          technicianId: true,
          startsAt: true,
          endsAt: true,
          allDay: true,
          reason: true,
        },
        orderBy: { startsAt: 'asc' },
      }),
    ]);

    const typedSettings = settings as TechScheduleSettingRecord[];
    const settingMap = new Map(typedSettings.map((setting) => [setting.technicianId, setting]));
    const days = this.buildDailyRange(from, to);

    const schedules = technicians.map((tech: any) => {
      const setting = settingMap.get(tech.id);
      const weeklyJson = this.normalizeWeeklyJson(setting?.weeklyJson);
      return {
        technicianId: tech.id,
        timezone: setting?.timezone ?? null,
        weeklyJson,
        dailyAvailability: days.map((day) => ({
          date: day.toISOString(),
          minutes: this.sumSlotMinutes(weeklyJson[this.getWeekdayKey(day)]),
        })),
      };
    });

    const availabilityMinutesByDay: Record<string, Record<string, number>> = {};
    for (const schedule of schedules) {
      const bucket: Record<string, number> = {};
      for (const entry of schedule.dailyAvailability) {
        bucket[entry.date] = entry.minutes;
      }
      availabilityMinutesByDay[schedule.technicianId] = bucket;
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      technicians: technicians.map((tech: any) => ({
        id: tech.id,
        name: tech.email,
        email: tech.email,
      })),
      schedules,
      availabilityMinutesByDay,
      exceptions: this.normalizeExceptions(exceptions as TechScheduleExceptionRecord[]),
    };
  }

  async getCapacityHeatmap(tenantId: string, input: CapacityRangeInput): Promise<CapacityResponse> {
    const range = this.normalizeCapacityRange(input);
    const days = this.buildDailyRange(range.from, range.to);
    const dayKeys = days.map((day) => this.formatDayKey(day));
    const db = this.prisma as any;
    const technicians = await db.user.findMany({
      where: withCompanyId(tenantId, {
        role: { in: ['OWNER', 'ADMIN', 'STAFF', 'TECHNICIAN'] },
      }),
      select: { id: true, email: true },
      orderBy: { email: 'asc' },
    });
    const [settings] = await Promise.all([
      db.techScheduleSetting.findMany({
        where: withCompanyId(tenantId, {
          technicianId: { in: technicians.map((tech: any) => tech.id) },
        }),
        select: {
          technicianId: true,
          weeklyJson: true,
        },
      }),
    ]);
    const techIds = technicians.map((tech: any) => tech.id);
    const [exceptions, bookings] = techIds.length
      ? await Promise.all([
          db.techScheduleException.findMany({
            where: withCompanyId(tenantId, {
              technicianId: { in: techIds },
              startsAt: { lt: range.to },
              endsAt: { gt: range.from },
            }),
            select: {
              technicianId: true,
              startsAt: true,
              endsAt: true,
            },
          }),
          db.booking.findMany({
            where: withCompanyId(tenantId, {
              assignedUserId: { in: techIds },
              status: { not: 'CANCELLED' },
              startsAt: { lt: range.to },
              endsAt: { gt: range.from },
            }),
            select: {
              assignedUserId: true,
              startsAt: true,
              endsAt: true,
            },
            orderBy: [{ startsAt: 'asc' }, { endsAt: 'asc' }],
          }),
        ])
      : [
          [] as TechScheduleExceptionRecord[],
          [] as Array<{ assignedUserId: string | null; startsAt: Date; endsAt: Date }>,
        ];

    const settingMap = new Map(
      (settings as TechScheduleSettingRecord[]).map((setting) => [setting.technicianId, setting]),
    );
    const exceptionsByTech = new Map<string, Array<{ startsAt: Date; endsAt: Date }>>();
    for (const exception of exceptions as TechScheduleExceptionRecord[]) {
      if (!exception.technicianId) continue;
      const list = exceptionsByTech.get(exception.technicianId) ?? [];
      const start = exception.startsAt instanceof Date ? exception.startsAt : new Date(exception.startsAt);
      const end = exception.endsAt instanceof Date ? exception.endsAt : new Date(exception.endsAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      list.push({ startsAt: start, endsAt: end });
      exceptionsByTech.set(exception.technicianId, list);
    }

    const bookingsByTechDay = new Map<string, Record<string, number>>();
    for (const booking of bookings) {
      const techId = booking.assignedUserId;
      if (!techId) continue;
      const start = booking.startsAt instanceof Date ? booking.startsAt : new Date(booking.startsAt);
      const durationMinutes = this.getDurationMinutes(booking.startsAt, booking.endsAt);
      const end = new Date(start.getTime() + durationMinutes * 60000);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      for (const day of days) {
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart.getTime() + MS_PER_DAY);
        const overlapStart = Math.max(start.getTime(), dayStart.getTime());
        const overlapEnd = Math.min(end.getTime(), dayEnd.getTime());
        if (overlapEnd <= overlapStart) continue;
        const minutes = Math.round((overlapEnd - overlapStart) / 60000);
        if (minutes <= 0) continue;
        const bucket = bookingsByTechDay.get(techId) ?? {};
        bucket[this.formatDayKey(dayStart)] = (bucket[this.formatDayKey(dayStart)] ?? 0) + minutes;
        bookingsByTechDay.set(techId, bucket);
      }
    }

    const capacity: Record<string, Record<string, CapacityCell>> = {};
    for (const tech of technicians) {
      const weeklyJson = this.normalizeWeeklyJson(settingMap.get(tech.id)?.weeklyJson);
      const bucket: Record<string, CapacityCell> = {};
      for (const day of days) {
        const dayKey = this.formatDayKey(day);
        const slots = weeklyJson[this.getWeekdayKey(day)] ?? [];
        const scheduledMinutes = this.sumSlotMinutes(slots);
        const exceptionMinutes = this.sumExceptionMinutesForDay(
          exceptionsByTech.get(tech.id) ?? [],
          day,
        );
        const availableMinutes = Math.max(0, scheduledMinutes - exceptionMinutes);
        const bookedMinutes = bookingsByTechDay.get(tech.id)?.[dayKey] ?? 0;
        const utilizationPct =
          availableMinutes > 0
            ? Math.round((bookedMinutes / Math.max(1, availableMinutes)) * 100)
            : 0;
        const status: CapacityStatus =
          availableMinutes === 0
            ? 'OFF'
            : utilizationPct > 100
            ? 'OVER'
            : utilizationPct >= 75
            ? 'OK'
            : 'UNDER';
        bucket[dayKey] = {
          availableMinutes,
          bookedMinutes,
          utilizationPct,
          status,
        };
      }
      capacity[tech.id] = bucket;
    }

    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      technicians: technicians.map((tech: any) => ({
        id: tech.id,
        name: tech.email,
      })),
      days: dayKeys,
      capacity,
    };
  }

  async suggestSlots(tenantId: string, bookingId: string, windowDays: number, limit: number) {
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({
      where: withCompanyId(tenantId, { id: bookingId }),
      select: { id: true, startsAt: true, endsAt: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    const bookingStart = booking.startsAt instanceof Date ? booking.startsAt : new Date(booking.startsAt);
    const durationMinutes = this.getDurationMinutes(booking.startsAt, booking.endsAt);
    const windowStart = this.startOfDay(bookingStart);
    const windowEnd = new Date(windowStart.getTime() + windowDays * MS_PER_DAY);
    const context = await this.loadSuggestionContext(tenantId, windowStart, windowEnd, bookingId);
    const suggestions = this.buildSuggestions(context, durationMinutes, windowStart, windowDays, limit);
    return {
      bookingId,
      windowDays,
      suggestions,
    };
  }

  async suggestDraftSlots(
    tenantId: string,
    durationMinutes: number,
    windowDays: number,
    limit: number,
  ) {
    const windowStart = this.startOfDay(new Date());
    const windowEnd = new Date(windowStart.getTime() + windowDays * MS_PER_DAY);
    const context = await this.loadSuggestionContext(tenantId, windowStart, windowEnd);
    const suggestions = this.buildSuggestions(context, durationMinutes, windowStart, windowDays, limit);
    return {
      windowDays,
      suggestions,
    };
  }

  private async loadSuggestionContext(
    tenantId: string,
    windowStart: Date,
    windowEnd: Date,
    excludeBookingId?: string,
  ): Promise<SuggestionContext> {
    const db = this.prisma as any;
    const technicians = await db.user.findMany({
      where: withCompanyId(tenantId, {
        role: { in: ['OWNER', 'ADMIN', 'STAFF', 'TECHNICIAN'] },
      }),
      select: { id: true, email: true },
      orderBy: { email: 'asc' },
    });
    const techIds = technicians.map((tech: any) => tech.id);
    const settings = await db.techScheduleSetting.findMany({
      where: withCompanyId(tenantId, {
        technicianId: { in: techIds },
      }),
      select: {
        technicianId: true,
        weeklyJson: true,
        timezone: true,
      },
    });
    let bookings: Array<{ assignedUserId: string | null; startsAt: Date | string; endsAt: Date | string }> = [];
    let exceptions: Array<{ technicianId: string; startsAt: Date | string; endsAt: Date | string }> = [];
    if (techIds.length) {
      const bookingWheres: any = {
        assignedUserId: { in: techIds },
        startsAt: { lt: windowEnd },
        endsAt: { gt: windowStart },
      };
      if (excludeBookingId) {
        bookingWheres.id = { not: excludeBookingId };
      }
      bookings = await db.booking.findMany({
        where: withCompanyId(tenantId, {
          ...bookingWheres,
          status: { not: 'CANCELLED' },
        }),
       select: { assignedUserId: true, startsAt: true, endsAt: true },
       orderBy: [{ startsAt: 'asc' }, { endsAt: 'asc' }],
     });
     exceptions = await db.techScheduleException.findMany({
        where: withCompanyId(tenantId, {
          technicianId: { in: techIds },
          startsAt: { lt: windowEnd },
          endsAt: { gt: windowStart },
        }),
        select: { technicianId: true, startsAt: true, endsAt: true },
        orderBy: { startsAt: 'asc' },
      });
    }

    return {
      technicians,
      settings: settings as TechScheduleSettingRecord[],
      bookings,
      exceptions,
    };
  }

  private buildSuggestions(
    context: SuggestionContext,
    durationMinutes: number,
    windowStart: Date,
    windowDays: number,
    limit: number,
  ) {
    const windowEnd = new Date(windowStart.getTime() + windowDays * MS_PER_DAY);
    const days = this.buildDailyRange(windowStart, windowEnd);
    const settingMap = new Map(context.settings.map((setting) => [setting.technicianId, setting]));
    const bookingsByTech = this.buildBookingsByTech(context.bookings);
    const exceptionsByTech = this.buildExceptionsByTech(context.exceptions);
    const suggestions: SuggestionResult[] = [];

    for (const tech of context.technicians) {
      const setting = settingMap.get(tech.id);
      const weeklyJson = this.normalizeWeeklyJson(setting?.weeklyJson);
      const techBookings = bookingsByTech.get(tech.id) ?? [];

      for (const day of days) {
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const daySlots = weeklyJson[this.getWeekdayKey(dayStart)] ?? [];
        if (!daySlots.length) {
          continue;
        }

        const capacityMinutes = this.sumSlotMinutes(daySlots);
        if (capacityMinutes <= 0) {
          continue;
        }

        const bookedMinutes = this.sumBookedMinutesForDay(techBookings, dayStart);
        const slot = this.findFirstAvailableSlot(
          dayStart,
          daySlots,
          durationMinutes,
          techBookings,
          exceptionsByTech.get(tech.id) ?? [],
        );
        if (!slot) {
          continue;
        }

        const overCapacity = bookedMinutes + durationMinutes > capacityMinutes;
        const reasonSet = new Set<SuggestionReason>([
          'WITHIN_WORKING_HOURS',
          'AVOIDS_TIME_OFF',
          'NO_OVERLAPS',
        ]);
        reasonSet.add(overCapacity ? 'OVER_CAPACITY' : 'UNDER_CAPACITY');
        const reasons = this.sortSuggestionReasons(Array.from(reasonSet));
        const score = this.buildSuggestionScore(slot.startsAt, overCapacity, windowStart);

        suggestions.push({
          technicianId: tech.id,
          technicianName: tech.email,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          score,
          reasons,
        });
      }
    }

    suggestions.sort((a, b) => {
      const aOver = a.reasons.includes('OVER_CAPACITY');
      const bOver = b.reasons.includes('OVER_CAPACITY');
      if (aOver !== bOver) return aOver ? 1 : -1;
      const aTime = new Date(a.startsAt).getTime();
      const bTime = new Date(b.startsAt).getTime();
      if (aTime !== bTime) return aTime - bTime;
      return a.technicianName.localeCompare(b.technicianName);
    });
    if (suggestions.length > 0) {
      const primary = suggestions[0];
      primary.reasons = this.sortSuggestionReasons(
        Array.from(new Set([...primary.reasons, 'EARLIEST_AVAILABLE'])),
      );
    }

    return suggestions.slice(0, limit);
  }

  private buildBookingsByTech(
    bookings: Array<{ assignedUserId: string | null; startsAt: Date | string; endsAt: Date | string }>,
  ) {
    const map = new Map<string, Array<{ startsAt: Date; endsAt: Date }>>();
    for (const entry of bookings) {
      const techId = entry.assignedUserId;
      if (!techId) continue;
      const start = this.parseDate(entry.startsAt);
      if (!start) continue;
      let end = this.parseDate(entry.endsAt);
      if (!end || end.getTime() <= start.getTime()) {
        end = new Date(start.getTime() + DEFAULT_BOOKING_DURATION_MINUTES * 60000);
      }
      if (!end) continue;
      const list = map.get(techId) ?? [];
      list.push({ startsAt: start, endsAt: end });
      map.set(techId, list);
    }
    return map;
  }

  private buildExceptionsByTech(
    exceptions: Array<{ technicianId: string; startsAt: Date | string; endsAt: Date | string }>,
  ) {
    const map = new Map<string, Array<{ startsAt: Date; endsAt: Date }>>();
    for (const exception of exceptions) {
      const start = this.parseDate(exception.startsAt);
      const end = this.parseDate(exception.endsAt);
      if (!start || !end) continue;
      const list = map.get(exception.technicianId) ?? [];
      list.push({ startsAt: start, endsAt: end });
      map.set(exception.technicianId, list);
    }
    return map;
  }

  async upsertScheduleSetting(
    tenantId: string,
    technicianId: string,
    weeklyJson: unknown,
  ): Promise<TechScheduleUpdateResult> {
    const db = this.prisma as any;
    const technician = await db.user.findFirst({
      where: withCompanyId(tenantId, { id: technicianId }),
    });
    if (!technician) {
      throw new NotFoundException('Technician not found.');
    }

    const normalized = this.validateEditableWeeklyJson(weeklyJson);
    const updated = await db.techScheduleSetting.upsert({
      where: {
        companyId_technicianId: {
          companyId: tenantId,
          technicianId,
        },
      },
      create: {
        companyId: tenantId,
        technicianId,
        weeklyJson: normalized,
      },
      update: {
        weeklyJson: normalized,
      },
    });

    return {
      technicianId: updated.technicianId,
      timezone: updated.timezone ?? null,
      weeklyJson: this.normalizeWeeklyJson(updated.weeklyJson),
    };
  }

  async createScheduleException(
    tenantId: string,
    technicianId: string,
    dto: { startsAt?: string; endsAt?: string; allDay?: boolean; reason?: string | null },
  ): Promise<ScheduleException> {
    const db = this.prisma as any;
    const technician = await db.user.findFirst({
      where: withCompanyId(tenantId, { id: technicianId }),
    });
    if (!technician) {
      throw new NotFoundException('Technician not found.');
    }

    const { startsAt, endsAt, allDay, reason } = this.validateExceptionPayload(dto);
    const created = await db.techScheduleException.create({
      data: {
        companyId: tenantId,
        technicianId,
        startsAt,
        endsAt,
        allDay,
        reason,
      },
    });

    return {
      id: created.id,
      technicianId: created.technicianId,
      startsAt: created.startsAt.toISOString(),
      endsAt: created.endsAt.toISOString(),
      allDay: created.allDay,
      reason: created.reason ?? null,
    };
  }

  async deleteScheduleException(tenantId: string, exceptionId: string) {
    const db = this.prisma as any;
    const existing = await db.techScheduleException.findFirst({
      where: withCompanyId(tenantId, { id: exceptionId }),
    });
    if (!existing) {
      throw new NotFoundException('Exception not found.');
    }
    await db.techScheduleException.delete({ where: { id: exceptionId } });
    return { ok: true };
  }

  async rescheduleBooking(
    tenantId: string,
    bookingId: string,
    dto: { startsAt: string; endsAt: string; technicianId?: string | null },
    actorUserId: string,
    requestId?: string,
  ) {
    const parsedStart = this.parseRequiredDate(dto.startsAt, 'startsAt');
    const parsedEnd = this.parseRequiredDate(dto.endsAt, 'endsAt');
    if (parsedEnd.getTime() <= parsedStart.getTime()) {
      throw new BadRequestException('`endsAt` must be greater than `startsAt`.');
    }

    const db = this.prisma as any;
    this.logger.debug('Rescheduling calendar booking', {
      bookingId,
      tenantId,
      requestId: requestId || null,
    });

    const { existing, updated, overlapping } = await db.$transaction(async (tx: any) => {
      const existing = await tx.booking.findFirst({ where: withCompanyId(tenantId, { id: bookingId }) });
      if (!existing) {
        throw new NotFoundException('Booking not found.');
      }

      const targetTechnicianId = dto.technicianId ?? existing.assignedUserId ?? null;
      const lockTargets = this.collectTechnicianIds(existing.assignedUserId, targetTechnicianId);
      for (const techId of lockTargets) {
        await acquireTechnicianLock(tx, tenantId, techId);
      }

        let overlapping: Array<{ id: string; startsAt: Date; endsAt: Date }> = [];
        if (targetTechnicianId) {
          overlapping = await tx.booking.findMany({
            where: withCompanyId(tenantId, {
              id: { not: bookingId },
              assignedUserId: targetTechnicianId,
              startsAt: { lt: parsedEnd },
              endsAt: { gt: parsedStart },
            }),
            select: { id: true, startsAt: true, endsAt: true },
          });
          if (overlapping.length > 0) {
            this.logger.warn('Calendar conflict prevented during reschedule', {
              bookingId,
              tenantId,
              technicianId: targetTechnicianId,
              conflicts: overlapping.map((item) => item.id),
              requestId: requestId || null,
            });
            throw new ConflictException({
              code: 'CALENDAR_CONFLICT',
              bookingId,
              conflicts: overlapping.map((item: any) => item.id),
              requestId: requestId || undefined,
            });
          }
        }

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          startsAt: parsedStart,
          endsAt: parsedEnd,
          assignedUserId: dto.technicianId ?? null,
        },
        include: {
          assignedUser: { select: { id: true, email: true } },
          location: { select: { id: true, name: true } },
          job: {
            select: {
              id: true,
              jobRef: true,
              status: true,
              customerName: true,
              customerEmail: true,
              customerPhone: true,
            },
          },
        },
      });

      return { existing, updated, overlapping };
    });

    const scheduleWarnings = await this.buildSchedulingWarnings(
      tenantId,
      updated.assignedUserId,
      parsedStart,
      parsedEnd,
    );
    const overlapWarnings = overlapping.map((item: any) => ({
      code: 'OVERLAP' as const,
      id: item.id,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
    }));
    const warnings = [...overlapWarnings, ...scheduleWarnings];

    if (isNotificationsV1Enabled()) {
      const prevTechnicianId = existing.assignedUserId ?? null;
      const nextTechnicianId = dto.technicianId ?? null;
      const context = {
        previousStartsAt: existing.startsAt.toISOString(),
        previousEndsAt: existing.endsAt.toISOString(),
        previousTechnicianId: prevTechnicianId,
        newStartsAt: parsedStart.toISOString(),
        newEndsAt: parsedEnd.toISOString(),
        newTechnicianId: nextTechnicianId,
      };
      try {
        await this.notifications.sendEntityUpdate(tenantId, actorUserId, {
          entityType: 'booking',
          entityId: bookingId,
          templateKey: 'calendar_reschedule',
          context,
        });
      } catch (err) {
        this.logger.warn('Failed to log calendar reschedule activity', {
          requestId: requestId || 'unknown',
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    }

    this.logger.debug('Calendar booking rescheduled', {
      bookingId,
      tenantId,
      technicianId: updated.assignedUserId,
      requestId: requestId || null,
    });

    return {
      booking: updated,
      warnings,
    };
  }

  private collectTechnicianIds(...ids: Array<string | null | undefined>) {
    const seen = new Set<string>();
    for (const id of ids) {
      if (id) {
        seen.add(id);
      }
    }
    return Array.from(seen);
  }

  private buildDailyRange(from: Date, to: Date) {
    const days: Date[] = [];
    for (let cursor = new Date(from); cursor.getTime() < to.getTime(); cursor = new Date(cursor.getTime() + MS_PER_DAY)) {
      const day = new Date(cursor);
      day.setHours(0, 0, 0, 0);
      days.push(day);
    }
    return days;
  }

  private buildSuggestionScore(startsAt: Date, overCapacity: boolean, windowStart: Date) {
    const minutes = Math.round((startsAt.getTime() - windowStart.getTime()) / 60000);
    return minutes + (overCapacity ? 1_000_000 : 0);
  }

  private sumBookedMinutesForDay(bookings: Array<{ startsAt: Date; endsAt: Date }>, dayStart: Date) {
    const dayEnd = new Date(dayStart.getTime() + MS_PER_DAY);
    let total = 0;
    for (const booking of bookings) {
      const overlapStart = Math.max(booking.startsAt.getTime(), dayStart.getTime());
      const overlapEnd = Math.min(booking.endsAt.getTime(), dayEnd.getTime());
      if (overlapEnd <= overlapStart) continue;
      total += Math.round((overlapEnd - overlapStart) / 60000);
    }
    return total;
  }

  private findFirstAvailableSlot(
    dayStart: Date,
    slots: WeeklyScheduleSlot[],
    durationMinutes: number,
    bookings: Array<{ startsAt: Date; endsAt: Date }>,
    exceptions: Array<{ startsAt: Date; endsAt: Date }> = [],
  ) {
    for (const slot of slots) {
      const slotStart = this.parseTimeToMinutes(slot.start);
      const slotEnd = this.parseTimeToMinutes(slot.end);
      if (slotStart === null || slotEnd === null || slotEnd <= slotStart) {
        continue;
      }
      for (
        let startMin = slotStart;
        startMin + durationMinutes <= slotEnd;
        startMin += SUGGESTION_INCREMENT_MINUTES
      ) {
        const candidateStart = new Date(dayStart.getTime() + startMin * 60000);
        const candidateEnd = new Date(candidateStart.getTime() + durationMinutes * 60000);
        if (
          !this.hasOverlap(candidateStart, candidateEnd, bookings) &&
          !this.hasOverlap(candidateStart, candidateEnd, exceptions)
        ) {
          return { startsAt: candidateStart, endsAt: candidateEnd };
        }
      }
    }
    return null;
  }

  private hasOverlap(
    startsAt: Date,
    endsAt: Date,
    bookings: Array<{ startsAt: Date; endsAt: Date }>,
  ) {
    for (const booking of bookings) {
      if (startsAt < booking.endsAt && endsAt > booking.startsAt) {
        return true;
      }
    }
    return false;
  }

  private getDurationMinutes(startsAt?: Date | null, endsAt?: Date | null) {
    if (startsAt && endsAt && endsAt.getTime() > startsAt.getTime()) {
      const delta = Math.round((endsAt.getTime() - startsAt.getTime()) / 60000);
      return Math.max(1, delta);
    }
    return DEFAULT_BOOKING_DURATION_MINUTES;
  }

  private getWeekdayKey(date: Date) {
    return WEEKDAY_KEYS[date.getDay()];
  }

  private normalizeWeeklyJson(value: unknown): WeeklyScheduleJson {
    if (!value || typeof value !== 'object') {
      return {};
    }
    const normalized: WeeklyScheduleJson = {};
    const source = value as Record<string, unknown>;
    for (const key of Object.keys(source)) {
      const normalizedKey = key.toLowerCase();
      const slotArray = Array.isArray(source[key]) ? source[key] : [];
      normalized[normalizedKey] = slotArray.map((slot: any) => ({
        start: typeof slot?.start === 'string' ? slot.start : null,
        end: typeof slot?.end === 'string' ? slot.end : null,
      }));
    }
    return normalized;
  }

  private normalizeExceptions(rows: TechScheduleExceptionRecord[]): ScheduleException[] {
    return rows.map((row) => ({
      id: row.id,
      technicianId: row.technicianId,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      allDay: row.allDay,
      reason: row.reason ?? null,
    }));
  }

  private validateEditableWeeklyJson(value: unknown): WeeklyScheduleJson {
    const normalized: WeeklyScheduleJson = {};
    if (!value || typeof value !== 'object') {
      return normalized;
    }
    const source = value as Record<string, unknown>;
    for (const key of Object.keys(source)) {
      const dayKey = key.toLowerCase();
      if (!this.isWeekdayKey(dayKey)) {
        throw new BadRequestException(`Invalid weekday: ${key}`);
      }
      const slotArray = Array.isArray(source[key]) ? source[key] : [];
      const processed: WeeklyScheduleSlot[] = [];

      for (const slot of slotArray) {
        if (!slot || typeof slot !== 'object') {
          continue;
        }
        const rawStart = typeof slot.start === 'string' ? slot.start.trim() : '';
        const rawEnd = typeof slot.end === 'string' ? slot.end.trim() : '';
        const startMin = this.parseTimeToMinutes(rawStart);
        const endMin = this.parseTimeToMinutes(rawEnd);
        if (startMin === null || endMin === null) {
          throw new BadRequestException(`Invalid time provided for ${dayKey}`);
        }
        if (endMin <= startMin) {
          throw new BadRequestException(`Slot end must be after start for ${dayKey}`);
        }
        processed.push({ start: rawStart, end: rawEnd });
      }

      processed.sort((a, b) => {
        const aMin = this.parseTimeToMinutes(a.start) ?? 0;
        const bMin = this.parseTimeToMinutes(b.start) ?? 0;
        return aMin - bMin;
      });

      let prevEnd = -1;
      for (const slot of processed) {
        const startMin = this.parseTimeToMinutes(slot.start)!;
        if (prevEnd > startMin) {
          throw new BadRequestException(`Slots overlap on ${dayKey}`);
        }
        prevEnd = this.parseTimeToMinutes(slot.end)!;
      }

      normalized[dayKey] = processed.slice(0, 3);
    }

    return normalized;
  }

  private isWeekdayKey(value: string): value is (typeof WEEKDAY_KEYS)[number] {
    return (WEEKDAY_KEYS as readonly string[]).includes(value);
  }

  private sumSlotMinutes(slots?: WeeklyScheduleSlot[]) {
    if (!Array.isArray(slots)) {
      return 0;
    }
    return slots.reduce((total, slot) => {
      const start = this.parseTimeToMinutes(slot.start);
      const end = this.parseTimeToMinutes(slot.end);
      if (start === null || end === null || end <= start) {
        return total;
      }
      return total + (end - start);
    }, 0);
  }

  private normalizeCapacityRange(input: CapacityRangeInput) {
    const defaultFrom = this.startOfDay(new Date());
    const requestedFrom = input.from ? this.parseRequiredDate(input.from, 'from') : defaultFrom;
    const normalizedFrom = this.startOfDay(requestedFrom);
    const requestedTo = input.to
      ? this.parseRequiredDate(input.to, 'to')
      : new Date(normalizedFrom.getTime() + 7 * MS_PER_DAY);
    let normalizedTo = this.startOfDay(requestedTo);
    if (normalizedTo.getTime() <= normalizedFrom.getTime()) {
      throw new BadRequestException('`to` must be greater than `from`.');
    }
    const maxTo = new Date(normalizedFrom.getTime() + MAX_RANGE_DAYS * MS_PER_DAY);
    if (normalizedTo.getTime() > maxTo.getTime()) {
      normalizedTo = maxTo;
    }
    return {
      from: normalizedFrom,
      to: normalizedTo,
    };
  }

  private sumExceptionMinutesForDay(
    exceptions: Array<{ startsAt: Date; endsAt: Date }>,
    day: Date,
  ) {
    const dayStart = this.startOfDay(day);
    const dayEnd = new Date(dayStart.getTime() + MS_PER_DAY);
    let total = 0;
    for (const exception of exceptions) {
      const overlapStart = Math.max(exception.startsAt.getTime(), dayStart.getTime());
      const overlapEnd = Math.min(exception.endsAt.getTime(), dayEnd.getTime());
      if (overlapEnd <= overlapStart) continue;
      total += Math.round((overlapEnd - overlapStart) / 60000);
    }
    return total;
  }

  private async buildSchedulingWarnings(
    tenantId: string,
    technicianId: string | null,
    bookingStart: Date,
    bookingEnd: Date,
  ): Promise<ScheduleWarning[]> {
    if (!isSchedulingIntelligenceV1Enabled() || !technicianId) {
      return [];
    }

    const db = this.prisma as any;
    const setting = await db.techScheduleSetting.findFirst({
      where: withCompanyId(tenantId, { technicianId }),
      select: {
        weeklyJson: true,
      },
    });
    if (!setting) {
      return [];
    }

    const weeklyJson = this.normalizeWeeklyJson(setting.weeklyJson);
    const days = this.buildDailyRange(bookingStart, bookingEnd);
    if (!days.length) {
      return [];
    }

    const rangeStart = new Date(days[0]);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(days[days.length - 1]);
    rangeEnd.setHours(0, 0, 0, 0);
    rangeEnd.setTime(rangeEnd.getTime() + MS_PER_DAY);

    const bookings = await db.booking.findMany({
      where: withCompanyId(tenantId, {
        assignedUserId: technicianId,
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
      }),
      select: {
        startsAt: true,
        endsAt: true,
      },
    });
    const exceptions = await db.techScheduleException.findMany({
      where: withCompanyId(tenantId, {
        technicianId,
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
      }),
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
      },
    });

    const warnings: ScheduleWarning[] = [];
    const overlappingExceptions = exceptions.filter(
      (exception) => bookingStart < exception.endsAt && bookingEnd > exception.startsAt,
    );
    if (overlappingExceptions.length > 0) {
      const start = new Date(
        Math.min(...overlappingExceptions.map((exception) => exception.startsAt.getTime())),
      );
      const end = new Date(Math.max(...overlappingExceptions.map((exception) => exception.endsAt.getTime())));
      warnings.push({
        code: 'TIME_OFF',
        exceptionIds: overlappingExceptions.map((exception) => exception.id),
        startsAt: start,
        endsAt: end,
      });
    }
    for (const day of days) {
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + MS_PER_DAY);
      const dayKey = this.formatDayKey(dayStart);
      const slots = weeklyJson[this.getWeekdayKey(dayStart)] ?? [];
      const windowStart = Math.max(bookingStart.getTime(), dayStart.getTime());
      const windowEnd = Math.min(bookingEnd.getTime(), dayEnd.getTime());
      if (windowEnd <= windowStart) {
        continue;
      }
      const startMin = (windowStart - dayStart.getTime()) / 60000;
      const endMin = (windowEnd - dayStart.getTime()) / 60000;

      if (!this.isIntervalCovered(startMin, endMin, slots)) {
        warnings.push({ code: 'OUTSIDE_WORKING_HOURS', day: dayKey });
      }

      let bookedMinutes = 0;
      for (const booking of bookings) {
        const overlapStart = Math.max(booking.startsAt.getTime(), dayStart.getTime());
        const overlapEnd = Math.min(booking.endsAt.getTime(), dayEnd.getTime());
        if (overlapEnd <= overlapStart) {
          continue;
        }
        bookedMinutes += Math.round((overlapEnd - overlapStart) / 60000);
      }

      const capacityMinutes = this.sumSlotMinutes(slots);
      if (capacityMinutes > 0 && bookedMinutes > capacityMinutes) {
        warnings.push({
          code: 'OVER_CAPACITY',
          day: dayKey,
          bookedMinutes,
          capacityMinutes,
        });
      }
    }

    return warnings;
  }

  private isIntervalCovered(startMin: number, endMin: number, slots: WeeklyScheduleSlot[]) {
    const ranges = (slots || [])
      .map((slot) => {
        const slotStart = this.parseTimeToMinutes(slot.start);
        const slotEnd = this.parseTimeToMinutes(slot.end);
        if (slotStart === null || slotEnd === null || slotEnd <= slotStart) return null;
        return { start: slotStart, end: slotEnd };
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start) as Array<{ start: number; end: number }>;

    let cursor = startMin;
    for (const range of ranges) {
      if (range.start > cursor) {
        return false;
      }
      if (range.end >= endMin) {
        return true;
      }
      cursor = Math.max(cursor, range.end);
    }

    return false;
  }

  private formatDayKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private parseTimeToMinutes(value?: string | null) {
    if (!value) {
      return null;
    }
    const parts = value.split(':').map((part) => Number(part));
    if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
      return null;
    }
    return parts[0] * 60 + parts[1];
  }

  private validateExceptionPayload(value: {
    startsAt?: string;
    endsAt?: string;
    allDay?: boolean;
    reason?: string | null;
  }) {
    const startsAt = this.parseRequiredIsoDate(value.startsAt, 'startsAt');
    const endsAt = this.parseRequiredIsoDate(value.endsAt, 'endsAt');
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('`endsAt` must be greater than `startsAt`.');
    }
    const maxRange = 30 * MS_PER_DAY;
    if (endsAt.getTime() - startsAt.getTime() > maxRange) {
      throw new BadRequestException('Exception range must not exceed 30 days.');
    }
    const reason = typeof value.reason === 'string' ? value.reason.trim() : null;
    if (reason && reason.length > 80) {
      throw new BadRequestException('Reason must be 80 characters or fewer.');
    }
    return {
      startsAt,
      endsAt,
      allDay: Boolean(value.allDay),
      reason,
    };
  }

  private parseRequiredIsoDate(value: string | undefined, key: string) {
    if (!value) {
      throw new BadRequestException(`Missing required body parameter: ${key}`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date for body parameter: ${key}`);
    }
    return parsed;
  }

  private sortSuggestionReasons(reasons: SuggestionReason[]) {
    const unique = new Set(reasons);
    return SUGGESTION_REASON_ORDER.filter((reason) => unique.has(reason));
  }

  private parseRequiredDate(value: string | undefined, key: string) {
    if (!value) {
      throw new BadRequestException(`Missing required query parameter: ${key}`);
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date for query parameter: ${key}`);
    }

    return parsed;
  }

  private startOfDay(date: Date) {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  private parseDate(value?: Date | string | null) {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }
}
