import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type CashflowBucket = {
  count: number;
  amountCents: number;
};

type FunnelCounts = {
  bookings: number;
  jobs: number;
  invoiced: number;
  paid: number;
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private endOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  }

  private normalizeAggregate(agg: any): CashflowBucket {
    return {
      count: Number(agg?._count?._all || 0),
      amountCents: Number(agg?._sum?.totalCents || 0),
    };
  }

  private medianHours(values: number[]) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
    }
    return Number(sorted[mid].toFixed(2));
  }

  async getOpsInsights(companyId: string, windowDays: number) {
    const now = new Date();
    const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const todayStart = this.startOfDay(now);
    const todayEnd = this.endOfDay(now);

    const db = this.prisma as any;
    const cashAtRiskStatuses = ['COMPLETED', 'INVOICED'];

    const cashAtRiskAgg = await db.job.aggregate({
      where: {
        companyId,
        status: { in: cashAtRiskStatuses },
        invoicePaidAt: null,
        totalCents: { gt: 0 },
      },
      _sum: { totalCents: true },
    });

    const revenueCollectedAgg = await db.job.aggregate({
      where: {
        companyId,
        invoicePaidAt: { gte: since },
        totalCents: { gt: 0 },
      },
      _sum: { totalCents: true },
    });

    const [jobsToday, jobsUnassignedToday, jobsOverdue] = await Promise.all([
      db.job.count({
        where: {
          companyId,
          createdAt: { gte: todayStart, lt: todayEnd },
        },
      }),
      db.job.count({
        where: {
          companyId,
          createdAt: { gte: todayStart, lt: todayEnd },
          assignedUserId: null,
        },
      }),
      db.job.count({
        where: {
          companyId,
          invoiceDueAt: { lt: now },
          invoicePaidAt: null,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
    ]);

    const [bookings7d, jobs7d, invoiced7d, paid7d] = await Promise.all([
      db.booking.count({
        where: {
          companyId,
          createdAt: { gte: since },
        },
      }),
      db.job.count({
        where: {
          companyId,
          createdAt: { gte: since },
        },
      }),
      db.job.count({
        where: {
          companyId,
          invoiceIssuedAt: { gte: since },
        },
      }),
      db.job.count({
        where: {
          companyId,
          invoicePaidAt: { gte: since },
        },
      }),
    ]);

    return {
      windowDays,
      cashAtRisk7d: Number(cashAtRiskAgg?._sum?.totalCents || 0),
      revenueCollected7d: Number(revenueCollectedAgg?._sum?.totalCents || 0),
      workloadToday: {
        jobs: jobsToday,
        unassigned: jobsUnassignedToday,
        overdue: jobsOverdue,
      },
      funnel7d: {
        bookings: bookings7d,
        jobs: jobs7d,
        invoiced: invoiced7d,
        paid: paid7d,
      },
    };
  }

  async getUtilization(companyId: string, windowDays: number) {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
    const db = this.prisma as any;
    const defaultJobMinutes = 60;

    const bookings = await db.booking.findMany({
      where: {
        companyId,
        assignedUserId: { not: null },
        status: { not: 'CANCELLED' },
        startsAt: { gte: now, lte: windowEnd },
      },
      select: {
        id: true,
        jobId: true,
        assignedUserId: true,
        startsAt: true,
        endsAt: true,
        assignedUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const byUser = new Map<string, { user: any; minutesFromBookings: number; minutesFromJobs: number; jobs: Set<string>; bookings: number; jobsWithoutEstimate: number }>();
    for (const booking of bookings) {
      const userId = booking.assignedUserId as string;
      const entry = byUser.get(userId) || {
        user: booking.assignedUser || { id: userId, name: null, email: null },
        minutesFromBookings: 0,
        minutesFromJobs: 0,
        jobs: new Set<string>(),
        bookings: 0,
        jobsWithoutEstimate: 0,
      };

      const start = booking.startsAt ? new Date(booking.startsAt) : null;
      const end = booking.endsAt ? new Date(booking.endsAt) : null;
      if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        const diff = Math.max(0, end.getTime() - start.getTime());
        entry.minutesFromBookings += Math.round(diff / 60000);
      }

      if (booking.jobId) {
        entry.jobs.add(booking.jobId);
      } else if (booking.id) {
        entry.jobs.add(booking.id);
      }

      entry.bookings += 1;
      byUser.set(userId, entry);
    }

    const jobs = await db.job.findMany({
      where: {
        companyId,
        assignedUserId: { not: null },
        status: { not: 'CANCELLED' },
        scheduledAt: { gte: now, lte: windowEnd },
        bookings: { none: {} },
      },
      select: {
        id: true,
        assignedUserId: true,
        formData: true,
        scheduledAt: true,
        createdAt: true,
        assignedUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    for (const job of jobs) {
      const userId = job.assignedUserId as string;
      const entry = byUser.get(userId) || {
        user: job.assignedUser || { id: userId, name: null, email: null },
        minutesFromBookings: 0,
        minutesFromJobs: 0,
        jobs: new Set<string>(),
        bookings: 0,
        jobsWithoutEstimate: 0,
      };

      let minutes = 0;
      const form = job.formData || {};
      const duration = Number(
        (form.durationMinutes ?? form.estimatedMinutes ?? form.laborMinutes ?? 0) as number,
      );
      if (duration > 0) {
        minutes = Math.round(duration);
      } else {
        minutes = defaultJobMinutes;
        entry.jobsWithoutEstimate += 1;
      }

      entry.minutesFromJobs += minutes;
      entry.jobs.add(job.id);
      byUser.set(userId, entry);
    }

    return Array.from(byUser.values()).map((entry) => {
      const minutesScheduled = entry.minutesFromBookings + entry.minutesFromJobs;
      return {
        userId: entry.user?.id,
        name: entry.user?.name || entry.user?.email || 'Unassigned',
        jobsAssigned: entry.jobs.size,
        minutesScheduled,
        minutesFromBookings: entry.minutesFromBookings,
        minutesFromJobs: entry.minutesFromJobs,
        jobsWithoutEstimate: entry.jobsWithoutEstimate,
        bookings: entry.bookings,
      };
    });
  }

  async getCashflow(companyId: string, windowDays: number) {
    const now = new Date();
    const todayStart = this.startOfDay(now);
    const tomorrowStart = this.endOfDay(now);
    const windowEndExclusive = new Date(todayStart.getTime() + (windowDays + 1) * 24 * 60 * 60 * 1000);
    const db = this.prisma as any;

    const dueDatesSupported = true;

    if (!dueDatesSupported) {
      return {
        windowDays,
        dueDatesSupported,
        overdue: null,
        dueThisWindow: null,
        paidToday: null,
      };
    }

    const [overdueAgg, dueThisWindowAgg, paidTodayAgg] = await Promise.all([
      db.job.aggregate({
        where: {
          companyId,
          invoiceDueAt: { lt: todayStart },
          invoicePaidAt: null,
          totalCents: { gt: 0 },
        },
        _count: { _all: true },
        _sum: { totalCents: true },
      }),
      db.job.aggregate({
        where: {
          companyId,
          invoiceDueAt: { gte: todayStart, lt: windowEndExclusive },
          invoicePaidAt: null,
          totalCents: { gt: 0 },
        },
        _count: { _all: true },
        _sum: { totalCents: true },
      }),
      db.job.aggregate({
        where: {
          companyId,
          invoicePaidAt: { gte: todayStart, lt: tomorrowStart },
          totalCents: { gt: 0 },
        },
        _count: { _all: true },
        _sum: { totalCents: true },
      }),
    ]);

    return {
      windowDays,
      dueDatesSupported,
      overdue: this.normalizeAggregate(overdueAgg),
      dueThisWindow: this.normalizeAggregate(dueThisWindowAgg),
      paidToday: this.normalizeAggregate(paidTodayAgg),
      paymentInference: 'paidToday is inferred from job.invoicePaidAt and job.totalCents.',
    };
  }

  async getFunnel(companyId: string, windowDays: number) {
    const now = new Date();
    const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const db = this.prisma as any;

    const [bookings, jobs, invoiced, paid] = await Promise.all([
      db.booking.findMany({
        where: { companyId, createdAt: { gte: since } },
        select: { id: true, createdAt: true, status: true, jobId: true, job: { select: { id: true, createdAt: true } } },
      }),
      db.job.findMany({
        where: { companyId, createdAt: { gte: since } },
        select: { id: true, createdAt: true, invoiceIssuedAt: true, invoicePaidAt: true },
      }),
      db.job.findMany({
        where: { companyId, invoiceIssuedAt: { gte: since } },
        select: { id: true, invoiceIssuedAt: true, invoicePaidAt: true, invoiceDueAt: true, totalCents: true },
      }),
      db.job.count({
        where: { companyId, invoicePaidAt: { gte: since } },
      }),
    ]);

    const counts: FunnelCounts = {
      bookings: bookings.length,
      jobs: jobs.length,
      invoiced: invoiced.length,
      paid,
    };

    const bookingToJobHours: number[] = [];
    for (const booking of bookings) {
      const jobCreatedAt = booking?.job?.createdAt ? new Date(booking.job.createdAt) : null;
      const bookingCreatedAt = booking?.createdAt ? new Date(booking.createdAt) : null;
      if (!jobCreatedAt || !bookingCreatedAt) continue;
      const diffHours = (jobCreatedAt.getTime() - bookingCreatedAt.getTime()) / 3600000;
      if (Number.isFinite(diffHours) && diffHours >= 0) {
        bookingToJobHours.push(diffHours);
      }
    }

    const jobToInvoicedHours: number[] = [];
    for (const job of jobs) {
      if (!job.invoiceIssuedAt) continue;
      const diffHours = (new Date(job.invoiceIssuedAt).getTime() - new Date(job.createdAt).getTime()) / 3600000;
      if (Number.isFinite(diffHours) && diffHours >= 0) {
        jobToInvoicedHours.push(diffHours);
      }
    }

    const invoicedToPaidHours: number[] = [];
    for (const job of invoiced) {
      if (!job.invoiceIssuedAt || !job.invoicePaidAt) continue;
      const diffHours = (new Date(job.invoicePaidAt).getTime() - new Date(job.invoiceIssuedAt).getTime()) / 3600000;
      if (Number.isFinite(diffHours) && diffHours >= 0) {
        invoicedToPaidHours.push(diffHours);
      }
    }

    const unpaidInvoiced = invoiced.filter((job: any) => !job.invoicePaidAt && Number(job.totalCents || 0) > 0);
    const overdueUnpaid = unpaidInvoiced.filter((job: any) => job.invoiceDueAt && new Date(job.invoiceDueAt) < now).length;
    const dueSoonOrNoDueDate = Math.max(0, unpaidInvoiced.length - overdueUnpaid);

    const notConverted = bookings.filter((booking: any) => !booking.jobId);
    const bookingDropoff = {
      cancelled: notConverted.filter((booking: any) => booking.status === 'CANCELLED').length,
      pending: notConverted.filter((booking: any) => booking.status === 'PENDING' || booking.status === 'PLANNED').length,
      noShow: 0,
      other: notConverted.filter((booking: any) => !['CANCELLED', 'PENDING', 'PLANNED'].includes(booking.status)).length,
    };

    return {
      windowDays,
      counts,
      mediansHours: {
        bookingToJob: this.medianHours(bookingToJobHours),
        jobToInvoiced: this.medianHours(jobToInvoicedHours),
        invoicedToPaid: this.medianHours(invoicedToPaidHours),
      },
      dropoffs: {
        bookingsNotConverted: bookingDropoff,
        invoicesUnpaid: {
          total: unpaidInvoiced.length,
          overdue: overdueUnpaid,
          notOverdue: dueSoonOrNoDueDate,
        },
      },
    };
  }
}
