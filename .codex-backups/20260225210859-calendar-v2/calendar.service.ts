import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ListCalendarBookingsInput = {
  from?: string;
  to?: string;
  techId?: string;
  locationId?: string;
};

const MAX_RANGE_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

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
        where: {
          companyId: tenantId,
          role: { in: ['OWNER', 'ADMIN', 'STAFF'] },
        },
        select: { id: true, email: true },
        orderBy: { email: 'asc' },
      }),
      db.booking.findMany({
        where: {
          companyId: tenantId,
          ...(input.techId ? { assignedUserId: input.techId } : {}),
          ...(input.locationId ? { locationId: input.locationId } : {}),
          startsAt: { lt: effectiveTo },
          endsAt: { gt: from },
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

  async rescheduleBooking(
    tenantId: string,
    bookingId: string,
    dto: { startsAt: string; endsAt: string; technicianId?: string | null },
  ) {
    const parsedStart = this.parseRequiredDate(dto.startsAt, 'startsAt');
    const parsedEnd = this.parseRequiredDate(dto.endsAt, 'endsAt');
    if (parsedEnd.getTime() <= parsedStart.getTime()) {
      throw new BadRequestException('`endsAt` must be greater than `startsAt`.');
    }

    const db = this.prisma as any;
    const existing = await db.booking.findFirst({ where: { id: bookingId, companyId: tenantId } });
    if (!existing) {
      throw new NotFoundException('Booking not found.');
    }

    const updated = await db.booking.update({
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

    const warnings = dto.technicianId
      ? await db.booking.findMany({
          where: {
            companyId: tenantId,
            id: { not: bookingId },
            assignedUserId: dto.technicianId,
            startsAt: { lt: parsedEnd },
            endsAt: { gt: parsedStart },
          },
          select: { id: true, startsAt: true, endsAt: true },
        })
      : [];

    return {
      booking: updated,
      warnings: warnings.map((item: any) => ({
        id: item.id,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
      })),
    };
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
}
