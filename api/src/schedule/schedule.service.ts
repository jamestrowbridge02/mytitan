import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  PatchTechnicianAvailabilityDto,
  PatchTechnicianCapacityExceptionDto,
  ScheduleCapacityQuery,
  SchedulePressureQuery,
  ScheduleRecommendationQuery,
  UpsertTechnicianAvailabilityDto,
  UpsertTechnicianCapacityExceptionDto,
} from "./dto";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_JOB_DURATION_MINUTES = 60;
const ASSIGNABLE_ROLES = ["OWNER", "ADMIN", "STAFF", "TECHNICIAN"] as const;

type CapacityExceptionType = "UNAVAILABLE" | "REDUCED_CAPACITY" | "OVERTIME";

type TechnicianSummary = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type CapacityBreakdown = {
  source: "daily_override" | "weekly_schedule" | "unscheduled";
  baseMinutes: number;
  adjustmentMinutes: number;
  availableMinutes: number;
  unavailable: boolean;
  intervals: Array<{ startTime: string; endTime: string; capacityMinutes: number }>;
  notes: string[];
};

type LoadItem = {
  entityType: "booking" | "job" | "service_plan";
  entityId: string;
  label: string;
  scheduledAt: string;
  minutes: number;
  assignedUserId?: string | null;
  customerName?: string | null;
  status?: string | null;
};

type RecommendationReason = {
  code: string;
  label: string;
  detail: string;
};

@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  private parseDateOnly(value?: string | null) {
    const raw = String(value || "").trim();
    if (!raw) throw new BadRequestException("Date is required");
    const parsed = raw.includes("T") ? new Date(raw) : new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException("Invalid date");
    parsed.setUTCHours(0, 0, 0, 0);
    return parsed;
  }

  private parseIsoDateTime(value?: string | null, fallback?: Date) {
    const raw = String(value || "").trim();
    if (!raw) return fallback || null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException("Invalid scheduled date");
    return parsed;
  }

  private parseTime(value?: string | null) {
    const raw = String(value || "").trim();
    if (!/^\d{2}:\d{2}$/.test(raw)) {
      throw new BadRequestException("Time must use HH:MM");
    }
    const [hours, minutes] = raw.split(":").map((part) => Number.parseInt(part, 10));
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new BadRequestException("Time must use HH:MM");
    }
    return raw;
  }

  private timeToMinutes(value?: string | null) {
    const raw = this.parseTime(value);
    const [hours, minutes] = raw.split(":").map((part) => Number.parseInt(part, 10));
    return hours * 60 + minutes;
  }

  private minutesToTime(value: number) {
    const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(value)));
    const hours = Math.floor(clamped / 60);
    const minutes = clamped % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  private startOfDay(value: Date) {
    const next = new Date(value);
    next.setUTCHours(0, 0, 0, 0);
    return next;
  }

  private endOfDay(value: Date) {
    return new Date(this.startOfDay(value).getTime() + MS_PER_DAY);
  }

  private buildDayRange(from: Date, to: Date) {
    const days: Date[] = [];
    const start = this.startOfDay(from);
    const end = this.startOfDay(to);
    for (let cursor = start; cursor.getTime() < end.getTime(); cursor = new Date(cursor.getTime() + MS_PER_DAY)) {
      days.push(new Date(cursor));
    }
    return days;
  }

  private formatDayKey(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private normalizeRange(query: ScheduleCapacityQuery) {
    const from = query.from ? this.parseDateOnly(query.from) : this.startOfDay(new Date());
    const toInput = query.to ? this.parseDateOnly(query.to) : new Date(from.getTime() + 7 * MS_PER_DAY);
    let to = this.startOfDay(toInput);
    if (to.getTime() <= from.getTime()) throw new BadRequestException("`to` must be after `from`");
    const maxTo = new Date(from.getTime() + 14 * MS_PER_DAY);
    if (to.getTime() > maxTo.getTime()) to = maxTo;
    return { from, to };
  }

  private getWeekdayKey(date: Date) {
    return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][date.getUTCDay()];
  }

  private sumMinutes(startTime: string, endTime: string) {
    const start = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);
    if (end <= start) throw new BadRequestException("End time must be after start time");
    return end - start;
  }

  private normalizeWeeklyJson(value: any): Record<string, Array<{ start?: string | null; end?: string | null }>> {
    if (!value || typeof value !== "object") return {};
    return Object.entries(value).reduce((acc, [key, slots]) => {
      acc[String(key).toLowerCase()] = Array.isArray(slots)
        ? slots.map((slot: any) => ({
            start: typeof slot?.start === "string" ? slot.start : null,
            end: typeof slot?.end === "string" ? slot.end : null,
          }))
        : [];
      return acc;
    }, {} as Record<string, Array<{ start?: string | null; end?: string | null }>>);
  }

  private async listAssignableTechnicians(tenantId: string): Promise<TechnicianSummary[]> {
    const db = this.prisma as any;
    const rows = await db.user.findMany({
      where: {
        companyId: tenantId,
        isActive: true,
        isAssignable: true,
      },
      select: { id: true, email: true, role: true },
      orderBy: [{ role: "asc" }, { email: "asc" }],
    });
    return rows.map((row: any) => ({
      id: row.id,
      name: row.email,
      email: row.email,
      role: row.role,
    }));
  }

  private async assertTechnician(tenantId: string, technicianId: string) {
    const rows = await this.listAssignableTechnicians(tenantId);
    const technician = rows.find((row) => row.id === technicianId);
    if (!technician) throw new NotFoundException("Technician not found");
    return technician;
  }

  private async loadCapacityContext(tenantId: string, from: Date, to: Date, locationId?: string) {
    const db = this.prisma as any;
    const technicians = await this.listAssignableTechnicians(tenantId);
    const techIds = technicians.map((row) => row.id);
    const [weeklySettings, dailyAvailability, capacityExceptions, legacyExceptions, bookings] = techIds.length
      ? await Promise.all([
          db.techScheduleSetting.findMany({
            where: { companyId: tenantId, technicianId: { in: techIds } },
            select: { technicianId: true, weeklyJson: true },
          }),
          db.technicianAvailability.findMany({
            where: {
              tenantId,
              technicianId: { in: techIds },
              date: { gte: from, lt: to },
            },
            orderBy: [{ date: "asc" }, { startTime: "asc" }],
          }),
          db.technicianCapacityException.findMany({
            where: {
              tenantId,
              technicianId: { in: techIds },
              date: { gte: from, lt: to },
            },
            orderBy: [{ date: "asc" }, { startTime: "asc" }],
          }),
          db.techScheduleException.findMany({
            where: {
              companyId: tenantId,
              technicianId: { in: techIds },
              startsAt: { lt: to },
              endsAt: { gt: from },
            },
            orderBy: [{ startsAt: "asc" }],
          }),
          db.booking.findMany({
            where: {
              companyId: tenantId,
              ...(locationId && locationId !== "all" ? { locationId } : {}),
              status: { not: "CANCELLED" },
              startsAt: { lt: to },
              endsAt: { gt: from },
            },
            select: {
              id: true,
              jobId: true,
              assignedUserId: true,
              customerName: true,
              status: true,
              startsAt: true,
              endsAt: true,
            },
            orderBy: [{ startsAt: "asc" }],
          }),
        ])
      : [[], [], [], [], []];

    const bookingLinkedJobIds = Array.from(
      new Set(bookings.map((booking: any) => booking.jobId).filter(Boolean)),
    );
    const jobs = techIds.length
      ? await db.job.findMany({
          where: {
            companyId: tenantId,
            ...(locationId && locationId !== "all" ? { locationId } : {}),
            status: { in: ["OPEN", "SCHEDULED", "IN_PROGRESS"] },
            scheduledAt: { gte: from, lt: to },
            ...(bookingLinkedJobIds.length ? { id: { notIn: bookingLinkedJobIds } } : {}),
          },
          select: {
            id: true,
            jobRef: true,
            customerName: true,
            status: true,
            assignedUserId: true,
            scheduledAt: true,
          },
          orderBy: [{ scheduledAt: "asc" }],
        })
      : [];

    const dueServicePlans = await db.servicePlan.findMany({
      where: {
        tenantId,
        ...(locationId && locationId !== "all" ? { locationId } : {}),
        status: "ACTIVE",
        nextRunAt: { lt: to },
      },
      select: {
        id: true,
        name: true,
        customerId: true,
        nextRunAt: true,
        autoCreateBooking: true,
        autoCreateJob: true,
      },
      orderBy: [{ nextRunAt: "asc" }],
    });

    return {
      technicians,
      weeklySettings,
      dailyAvailability,
      capacityExceptions,
      legacyExceptions,
      bookings,
      jobs,
      dueServicePlans,
    };
  }

  private buildBaseCapacityForDay(
    day: Date,
    technicianId: string,
    weeklySettings: Array<any>,
    dailyAvailability: Array<any>,
  ): CapacityBreakdown {
    const dayKey = this.formatDayKey(day);
    const dailyRows = dailyAvailability.filter(
      (row: any) => row.technicianId === technicianId && this.formatDayKey(new Date(row.date)) === dayKey,
    );
    if (dailyRows.length) {
      const intervals = dailyRows.map((row: any) => ({
        startTime: row.startTime,
        endTime: row.endTime,
        capacityMinutes: Number(row.capacityMinutes || 0),
      }));
      return {
        source: "daily_override",
        baseMinutes: intervals.reduce((total, row) => total + row.capacityMinutes, 0),
        adjustmentMinutes: 0,
        availableMinutes: intervals.reduce((total, row) => total + row.capacityMinutes, 0),
        unavailable: false,
        intervals,
        notes: ["Daily override availability"],
      };
    }

    const weekly = weeklySettings.find((row: any) => row.technicianId === technicianId);
    const slots = this.normalizeWeeklyJson(weekly?.weeklyJson)?.[this.getWeekdayKey(day)] || [];
    if (!slots.length) {
      return {
        source: "unscheduled",
        baseMinutes: 0,
        adjustmentMinutes: 0,
        availableMinutes: 0,
        unavailable: true,
        intervals: [],
        notes: ["No working schedule set"],
      };
    }

    const intervals = slots
      .filter((slot: any) => slot?.start && slot?.end)
      .map((slot: any) => ({
        startTime: String(slot.start),
        endTime: String(slot.end),
        capacityMinutes: this.sumMinutes(String(slot.start), String(slot.end)),
      }));
    const total = intervals.reduce((sum, slot) => sum + slot.capacityMinutes, 0);
    return {
      source: "weekly_schedule",
      baseMinutes: total,
      adjustmentMinutes: 0,
      availableMinutes: total,
      unavailable: false,
      intervals,
      notes: ["Weekly technician schedule"],
    };
  }

  private applyCapacityExceptionsForDay(
    day: Date,
    technicianId: string,
    breakdown: CapacityBreakdown,
    capacityExceptions: Array<any>,
    legacyExceptions: Array<any>,
  ) {
    const dayKey = this.formatDayKey(day);
    let adjustmentMinutes = 0;
    let unavailable = breakdown.unavailable;
    const notes = [...breakdown.notes];

    for (const exception of capacityExceptions.filter(
      (row: any) => row.technicianId === technicianId && this.formatDayKey(new Date(row.date)) === dayKey,
    )) {
      const minutes = Number(exception.capacityMinutes || 0);
      if (exception.type === "OVERTIME") {
        adjustmentMinutes += minutes;
        notes.push(`Overtime +${minutes}m`);
      } else {
        adjustmentMinutes -= minutes;
        notes.push(`${String(exception.type).toLowerCase().replaceAll("_", " ")} -${minutes}m`);
        if (exception.type === "UNAVAILABLE") unavailable = true;
      }
    }

    for (const exception of legacyExceptions.filter((row: any) => {
      if (row.technicianId !== technicianId) return false;
      const start = new Date(row.startsAt);
      return this.formatDayKey(start) === dayKey;
    })) {
      const start = new Date(exception.startsAt);
      const end = new Date(exception.endsAt);
      const overlapStart = Math.max(start.getTime(), day.getTime());
      const overlapEnd = Math.min(end.getTime(), this.endOfDay(day).getTime());
      if (overlapEnd <= overlapStart) continue;
      const minutes = Math.round((overlapEnd - overlapStart) / 60000);
      adjustmentMinutes -= minutes;
      unavailable = true;
      notes.push(`Legacy time off -${minutes}m`);
    }

    const availableMinutes = Math.max(0, breakdown.baseMinutes + adjustmentMinutes);
    return {
      ...breakdown,
      adjustmentMinutes,
      availableMinutes,
      unavailable: unavailable || availableMinutes === 0,
      notes,
    };
  }

  private buildTechnicianLoadForDayFromContext(
    context: Awaited<ReturnType<ScheduleService["loadCapacityContext"]>>,
    technicianId: string,
    date: Date,
  ) {
    const items: LoadItem[] = [];

    for (const booking of context.bookings.filter((row: any) => row.assignedUserId === technicianId)) {
      items.push({
        entityType: "booking",
        entityId: booking.id,
        label: booking.customerName || booking.id,
        scheduledAt: new Date(booking.startsAt).toISOString(),
        minutes: Math.max(1, Math.round((new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime()) / 60000)),
        assignedUserId: booking.assignedUserId,
        customerName: booking.customerName || null,
        status: booking.status,
      });
    }

    for (const job of context.jobs.filter((row: any) => row.assignedUserId === technicianId)) {
      items.push({
        entityType: "job",
        entityId: job.id,
        label: job.jobRef || job.id,
        scheduledAt: new Date(job.scheduledAt).toISOString(),
        minutes: DEFAULT_JOB_DURATION_MINUTES,
        assignedUserId: job.assignedUserId,
        customerName: job.customerName || null,
        status: job.status,
      });
    }

    items.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    return {
      date: this.startOfDay(date).toISOString(),
      scheduledMinutes: items.reduce((sum, item) => sum + item.minutes, 0),
      items,
    };
  }

  async getTechnicianCapacityForDay(tenantId: string, technicianId: string, dateInput: string | Date) {
    const date = dateInput instanceof Date ? this.startOfDay(dateInput) : this.parseDateOnly(String(dateInput));
    const { weeklySettings, dailyAvailability, capacityExceptions, legacyExceptions } = await this.loadCapacityContext(
      tenantId,
      date,
      this.endOfDay(date),
    );
    const base = this.buildBaseCapacityForDay(date, technicianId, weeklySettings, dailyAvailability);
    return this.applyCapacityExceptionsForDay(date, technicianId, base, capacityExceptions, legacyExceptions);
  }

  async getTechnicianLoadForDay(tenantId: string, technicianId: string, dateInput: string | Date) {
    const date = dateInput instanceof Date ? this.startOfDay(dateInput) : this.parseDateOnly(String(dateInput));
    const rangeEnd = this.endOfDay(date);
    const context = await this.loadCapacityContext(tenantId, date, rangeEnd);
    return this.buildTechnicianLoadForDayFromContext(context, technicianId, date);
  }

  async getTechnicianSchedulePressure(tenantId: string, query: SchedulePressureQuery) {
    const date = query.date ? this.parseDateOnly(query.date) : this.startOfDay(new Date());
    const rangeEnd = this.endOfDay(date);
    const context = await this.loadCapacityContext(tenantId, date, rangeEnd, query.locationId);
    const technicians = query.technicianId
      ? context.technicians.filter((technician) => technician.id === query.technicianId)
      : context.technicians;

    const technicianPressure = await Promise.all(
      technicians.map(async (technician) => {
        const capacity = this.applyCapacityExceptionsForDay(
          date,
          technician.id,
          this.buildBaseCapacityForDay(date, technician.id, context.weeklySettings, context.dailyAvailability),
          context.capacityExceptions,
          context.legacyExceptions,
        );
        const load = this.buildTechnicianLoadForDayFromContext(context, technician.id, date);
        const remainingMinutes = capacity.availableMinutes - load.scheduledMinutes;
        return {
          technicianId: technician.id,
          technicianName: technician.name,
          role: technician.role,
          availableMinutes: capacity.availableMinutes,
          scheduledMinutes: load.scheduledMinutes,
          remainingMinutes,
          overloaded: remainingMinutes < 0,
          unavailable: capacity.unavailable,
          capacitySource: capacity.source,
          capacityNotes: capacity.notes,
          scheduledItems: load.items,
        };
      }),
    );

    const dueServicePlanItems: LoadItem[] = context.dueServicePlans.map((plan: any) => ({
      entityType: "service_plan",
      entityId: plan.id,
      label: plan.name,
      scheduledAt: new Date(plan.nextRunAt || date).toISOString(),
      minutes: DEFAULT_JOB_DURATION_MINUTES,
      customerName: null,
      status: plan.autoCreateJob ? "JOB_MODE" : "BOOKING_MODE",
    }));

    const unassignedDueWork: LoadItem[] = [
      ...context.bookings
        .filter((booking: any) => !booking.assignedUserId)
        .map((booking: any) => ({
          entityType: "booking" as const,
          entityId: booking.id,
          label: booking.customerName || booking.id,
          scheduledAt: new Date(booking.startsAt).toISOString(),
          minutes: Math.max(1, Math.round((new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime()) / 60000)),
          customerName: booking.customerName || null,
          status: booking.status,
        })),
      ...context.jobs
        .filter((job: any) => !job.assignedUserId)
        .map((job: any) => ({
          entityType: "job" as const,
          entityId: job.id,
          label: job.jobRef || job.id,
          scheduledAt: new Date(job.scheduledAt).toISOString(),
          minutes: DEFAULT_JOB_DURATION_MINUTES,
          customerName: job.customerName || null,
          status: job.status,
        })),
      ...dueServicePlanItems,
    ].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

    return {
      date: date.toISOString(),
      technicians: technicianPressure,
      overloadedTechnicians: technicianPressure.filter((row) => row.overloaded),
      unassignedDueWork,
      dueRecurringPlanPressureMinutes: dueServicePlanItems.reduce((sum, item) => sum + item.minutes, 0),
      dueRecurringPlanCount: dueServicePlanItems.length,
    };
  }

  async recommendAssignableTechnicians(tenantId: string, query: ScheduleRecommendationQuery) {
    const entityType = String(query.entityType || "").trim().toLowerCase();
    const entityId = String(query.entityId || "").trim();
    if (!entityType || !entityId) throw new BadRequestException("entityType and entityId are required");
    const db = this.prisma as any;
    let scheduledAt = this.parseIsoDateTime(query.scheduledAt) || null;
    let durationMinutes = DEFAULT_JOB_DURATION_MINUTES;
    let label = entityId;

    if (entityType === "booking") {
      const booking = await db.booking.findFirst({
        where: { companyId: tenantId, id: entityId },
        select: { id: true, customerName: true, startsAt: true, endsAt: true },
      });
      if (!booking) throw new NotFoundException("Booking not found");
      scheduledAt = scheduledAt || new Date(booking.startsAt);
      durationMinutes = Math.max(1, Math.round((new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime()) / 60000));
      label = booking.customerName || booking.id;
    } else if (entityType === "job") {
      const job = await db.job.findFirst({
        where: { companyId: tenantId, id: entityId },
        select: { id: true, jobRef: true, scheduledAt: true, customerName: true },
      });
      if (!job) throw new NotFoundException("Job not found");
      scheduledAt = scheduledAt || this.parseIsoDateTime(job.scheduledAt) || new Date();
      label = job.jobRef || job.customerName || job.id;
    } else if (entityType === "service_plan") {
      const plan = await db.servicePlan.findFirst({
        where: { tenantId, id: entityId },
        select: { id: true, name: true, nextRunAt: true },
      });
      if (!plan) throw new NotFoundException("Service plan not found");
      scheduledAt = scheduledAt || this.parseIsoDateTime(plan.nextRunAt) || new Date();
      label = plan.name;
    } else {
      throw new BadRequestException("Unsupported entityType");
    }

    const scheduledDay = this.startOfDay(scheduledAt || new Date());
    const windowEnd = new Date((scheduledAt || new Date()).getTime() + durationMinutes * 60000);
    const context = await this.loadCapacityContext(tenantId, scheduledDay, this.endOfDay(scheduledDay), query.locationId);
    const bookingIntervals = context.bookings
      .filter((row: any) => row.assignedUserId)
      .map((row: any) => ({
        technicianId: row.assignedUserId,
        start: new Date(row.startsAt),
        end: new Date(row.endsAt),
      }));
    const jobIntervals = context.jobs
      .filter((row: any) => row.assignedUserId)
      .map((row: any) => ({
        technicianId: row.assignedUserId,
        start: new Date(row.scheduledAt),
        end: new Date(new Date(row.scheduledAt).getTime() + DEFAULT_JOB_DURATION_MINUTES * 60000),
      }));

    const recommendations = await Promise.all(
      context.technicians.map(async (technician) => {
        const capacity = this.applyCapacityExceptionsForDay(
          scheduledDay,
          technician.id,
          this.buildBaseCapacityForDay(scheduledDay, technician.id, context.weeklySettings, context.dailyAvailability),
          context.capacityExceptions,
          context.legacyExceptions,
        );
        const load = this.buildTechnicianLoadForDayFromContext(context, technician.id, scheduledDay);
        const hasBookingConflict = bookingIntervals.some((interval) =>
          interval.technicianId === technician.id &&
          scheduledAt! < interval.end &&
          windowEnd > interval.start,
        );
        const hasJobConflict = jobIntervals.some((interval) =>
          interval.technicianId === technician.id &&
          scheduledAt! < interval.end &&
          windowEnd > interval.start,
        );
        const hasCapacityException = context.capacityExceptions.some((exception: any) =>
          exception.technicianId === technician.id &&
          this.formatDayKey(new Date(exception.date)) === this.formatDayKey(scheduledDay) &&
          !(this.timeToMinutes(exception.endTime) <= scheduledAt!.getUTCHours() * 60 + scheduledAt!.getUTCMinutes() ||
            this.timeToMinutes(exception.startTime) >= windowEnd.getUTCHours() * 60 + windowEnd.getUTCMinutes()),
        );
        const remainingAfterAssign = capacity.availableMinutes - load.scheduledMinutes - durationMinutes;
        const reasons: RecommendationReason[] = [];
        let score = 0;

        if (!capacity.unavailable) {
          score += 300;
          reasons.push({
            code: "capacity_available",
            label: "Capacity available",
            detail: `${capacity.availableMinutes} minutes available for ${this.formatDayKey(scheduledDay)}`,
          });
        } else {
          reasons.push({
            code: "capacity_unavailable",
            label: "Unavailable",
            detail: "This technician has no remaining planned capacity on the selected day",
          });
        }

        if (!hasBookingConflict && !hasJobConflict) {
          score += 250;
          reasons.push({
            code: "no_overlap",
            label: "No overlap",
            detail: "No scheduled bookings or jobs overlap the planned window",
          });
        } else {
          score -= 500;
          reasons.push({
            code: "schedule_conflict",
            label: "Scheduling conflict",
            detail: "The planned window overlaps existing assigned work",
          });
        }

        if (!hasCapacityException) {
          score += 150;
          reasons.push({
            code: "no_exception",
            label: "No capacity exception",
            detail: "No availability exception blocks the selected window",
          });
        } else {
          score -= 250;
          reasons.push({
            code: "capacity_exception",
            label: "Capacity exception",
            detail: "A capacity exception affects the selected time window",
          });
        }

        if (remainingAfterAssign >= 0) {
          score += 200 + Math.min(remainingAfterAssign, 240);
          reasons.push({
            code: "fits_remaining_capacity",
            label: "Fits remaining capacity",
            detail: `${remainingAfterAssign} minutes would remain after assignment`,
          });
        } else {
          score -= 400 + Math.abs(remainingAfterAssign);
          reasons.push({
            code: "over_capacity",
            label: "Would overload the day",
            detail: `This assignment would exceed daily capacity by ${Math.abs(remainingAfterAssign)} minutes`,
          });
        }

        return {
          technicianId: technician.id,
          technicianName: technician.name,
          role: technician.role,
          score,
          remainingMinutesAfterAssign: remainingAfterAssign,
          reasons,
        };
      }),
    );

    recommendations.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.remainingMinutesAfterAssign !== a.remainingMinutesAfterAssign) {
        return b.remainingMinutesAfterAssign - a.remainingMinutesAfterAssign;
      }
      return a.technicianName.localeCompare(b.technicianName);
    });

    return {
      entityType,
      entityId,
      label,
      scheduledAt: scheduledAt!.toISOString(),
      durationMinutes,
      recommendations,
    };
  }

  async getCapacity(tenantId: string, query: ScheduleCapacityQuery) {
    const range = this.normalizeRange(query);
    const days = this.buildDayRange(range.from, range.to);
    const context = await this.loadCapacityContext(tenantId, range.from, range.to, query.locationId);
    const rows = await Promise.all(
      context.technicians.map(async (technician) => {
        const daily = await Promise.all(
          days.map(async (day) => {
            const capacity = this.applyCapacityExceptionsForDay(
              day,
              technician.id,
              this.buildBaseCapacityForDay(day, technician.id, context.weeklySettings, context.dailyAvailability),
              context.capacityExceptions,
              context.legacyExceptions,
            );
            const load = this.buildTechnicianLoadForDayFromContext(context, technician.id, day);
            const remainingMinutes = capacity.availableMinutes - load.scheduledMinutes;
            return {
              date: day.toISOString(),
              availableMinutes: capacity.availableMinutes,
              scheduledMinutes: load.scheduledMinutes,
              remainingMinutes,
              unavailable: capacity.unavailable,
              overloaded: remainingMinutes < 0,
              source: capacity.source,
            };
          }),
        );
        return {
          technicianId: technician.id,
          technicianName: technician.name,
          role: technician.role,
          days: daily,
        };
      }),
    );

    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      days: days.map((day) => day.toISOString()),
      technicians: context.technicians,
      availability: context.dailyAvailability.map((row: any) => ({
        id: row.id,
        technicianId: row.technicianId,
        date: new Date(row.date).toISOString(),
        startTime: row.startTime,
        endTime: row.endTime,
        capacityMinutes: row.capacityMinutes,
        notesJson: row.notesJson || null,
      })),
      exceptions: context.capacityExceptions.map((row: any) => ({
        id: row.id,
        technicianId: row.technicianId,
        date: new Date(row.date).toISOString(),
        type: row.type,
        startTime: row.startTime,
        endTime: row.endTime,
        capacityMinutes: row.capacityMinutes,
        reason: row.reason || null,
      })),
      locationId: query.locationId && query.locationId !== 'all' ? query.locationId : 'all',
      rows,
    };
  }

  async createAvailability(tenantId: string, dto: UpsertTechnicianAvailabilityDto) {
    await this.assertTechnician(tenantId, dto.technicianId);
    const date = this.parseDateOnly(dto.date);
    const startTime = this.parseTime(dto.startTime);
    const endTime = this.parseTime(dto.endTime);
    const capacityMinutes = Math.max(1, Number(dto.capacityMinutes || 0));
    if (this.timeToMinutes(endTime) <= this.timeToMinutes(startTime)) {
      throw new BadRequestException("End time must be after start time");
    }
    const db = this.prisma as any;
    const created = await db.technicianAvailability.create({
      data: {
        tenantId,
        technicianId: dto.technicianId,
        date,
        startTime,
        endTime,
        capacityMinutes,
        notesJson: dto.notesJson ?? null,
      },
    });
    return {
      id: created.id,
      technicianId: created.technicianId,
      date: created.date.toISOString(),
      startTime: created.startTime,
      endTime: created.endTime,
      capacityMinutes: created.capacityMinutes,
      notesJson: created.notesJson || null,
    };
  }

  async updateAvailability(tenantId: string, id: string, dto: PatchTechnicianAvailabilityDto) {
    const db = this.prisma as any;
    const existing = await db.technicianAvailability.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Availability not found");
    if (dto.technicianId) await this.assertTechnician(tenantId, dto.technicianId);
    const startTime = dto.startTime ? this.parseTime(dto.startTime) : existing.startTime;
    const endTime = dto.endTime ? this.parseTime(dto.endTime) : existing.endTime;
    if (this.timeToMinutes(endTime) <= this.timeToMinutes(startTime)) {
      throw new BadRequestException("End time must be after start time");
    }
    const updated = await db.technicianAvailability.update({
      where: { id },
      data: {
        technicianId: dto.technicianId || existing.technicianId,
        date: dto.date ? this.parseDateOnly(dto.date) : existing.date,
        startTime,
        endTime,
        capacityMinutes: dto.capacityMinutes !== undefined ? Math.max(1, Number(dto.capacityMinutes || 0)) : existing.capacityMinutes,
        notesJson: dto.notesJson !== undefined ? dto.notesJson ?? null : existing.notesJson,
      },
    });
    return {
      id: updated.id,
      technicianId: updated.technicianId,
      date: updated.date.toISOString(),
      startTime: updated.startTime,
      endTime: updated.endTime,
      capacityMinutes: updated.capacityMinutes,
      notesJson: updated.notesJson || null,
    };
  }

  async deleteAvailability(tenantId: string, id: string) {
    const db = this.prisma as any;
    const existing = await db.technicianAvailability.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Availability not found");
    await db.technicianAvailability.delete({ where: { id } });
    return { ok: true };
  }

  async createException(tenantId: string, dto: UpsertTechnicianCapacityExceptionDto) {
    await this.assertTechnician(tenantId, dto.technicianId);
    const date = this.parseDateOnly(dto.date);
    const startTime = this.parseTime(dto.startTime);
    const endTime = this.parseTime(dto.endTime);
    const capacityMinutes = Math.max(1, Number(dto.capacityMinutes || 0));
    if (this.timeToMinutes(endTime) <= this.timeToMinutes(startTime)) {
      throw new BadRequestException("End time must be after start time");
    }
    const db = this.prisma as any;
    const created = await db.technicianCapacityException.create({
      data: {
        tenantId,
        technicianId: dto.technicianId,
        date,
        type: dto.type,
        startTime,
        endTime,
        capacityMinutes,
        reason: dto.reason?.trim() || null,
      },
    });
    return {
      id: created.id,
      technicianId: created.technicianId,
      date: created.date.toISOString(),
      type: created.type,
      startTime: created.startTime,
      endTime: created.endTime,
      capacityMinutes: created.capacityMinutes,
      reason: created.reason || null,
    };
  }

  async updateException(tenantId: string, id: string, dto: PatchTechnicianCapacityExceptionDto) {
    const db = this.prisma as any;
    const existing = await db.technicianCapacityException.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Capacity exception not found");
    if (dto.technicianId) await this.assertTechnician(tenantId, dto.technicianId);
    const startTime = dto.startTime ? this.parseTime(dto.startTime) : existing.startTime;
    const endTime = dto.endTime ? this.parseTime(dto.endTime) : existing.endTime;
    if (this.timeToMinutes(endTime) <= this.timeToMinutes(startTime)) {
      throw new BadRequestException("End time must be after start time");
    }
    const updated = await db.technicianCapacityException.update({
      where: { id },
      data: {
        technicianId: dto.technicianId || existing.technicianId,
        date: dto.date ? this.parseDateOnly(dto.date) : existing.date,
        type: (dto.type as CapacityExceptionType | undefined) || existing.type,
        startTime,
        endTime,
        capacityMinutes: dto.capacityMinutes !== undefined ? Math.max(1, Number(dto.capacityMinutes || 0)) : existing.capacityMinutes,
        reason: dto.reason !== undefined ? dto.reason?.trim() || null : existing.reason,
      },
    });
    return {
      id: updated.id,
      technicianId: updated.technicianId,
      date: updated.date.toISOString(),
      type: updated.type,
      startTime: updated.startTime,
      endTime: updated.endTime,
      capacityMinutes: updated.capacityMinutes,
      reason: updated.reason || null,
    };
  }

  async deleteException(tenantId: string, id: string) {
    const db = this.prisma as any;
    const existing = await db.technicianCapacityException.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Capacity exception not found");
    await db.technicianCapacityException.delete({ where: { id } });
    return { ok: true };
  }
}
