import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleService } from '../schedule/schedule.service';

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

type PeriodRange = {
  start: Date;
  end: Date;
};

type DeltaMetric = {
  key: string;
  label: string;
  basis: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
};

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedule: ScheduleService,
  ) {}

  private startOfDay(date: Date) {
    const value = new Date(date);
    value.setUTCHours(0, 0, 0, 0);
    return value;
  }

  private endOfDay(date: Date) {
    return new Date(this.startOfDay(date).getTime() + 24 * 60 * 60 * 1000);
  }

  private getRange(windowDays: number, end = new Date()): PeriodRange {
    const rangeEnd = new Date(end);
    const rangeStart = new Date(rangeEnd.getTime() - windowDays * 24 * 60 * 60 * 1000);
    return {
      start: rangeStart,
      end: rangeEnd,
    };
  }

  private getPreviousRange(range: PeriodRange): PeriodRange {
    const duration = range.end.getTime() - range.start.getTime();
    return {
      start: new Date(range.start.getTime() - duration),
      end: new Date(range.start),
    };
  }

  private normalizeAggregate(agg: any): CashflowBucket {
    return {
      count: Number(agg?._count?._all || agg?._count?.id || 0),
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

  private rate(numerator: number, denominator: number) {
    if (!denominator) return null;
    return Number(((numerator / denominator) * 100).toFixed(1));
  }

  private delta(current: number, previous: number) {
    return current - previous;
  }

  private deltaPct(current: number, previous: number) {
    if (!previous) {
      return current === 0 ? 0 : null;
    }
    return Number((((current - previous) / previous) * 100).toFixed(1));
  }

  private toDeltaMetric(key: string, label: string, basis: string, current: number, previous: number): DeltaMetric {
    return {
      key,
      label,
      basis,
      current,
      previous,
      delta: this.delta(current, previous),
      deltaPct: this.deltaPct(current, previous),
    };
  }

  private buildSeries(rows: Date[], range: PeriodRange, label: string) {
    const byDay = new Map<string, number>();
    for (const row of rows) {
      const key = this.startOfDay(new Date(row)).toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) || 0) + 1);
    }
    const items: Array<{ day: string; label: string; value: number }> = [];
    for (let cursor = this.startOfDay(range.start); cursor.getTime() < range.end.getTime(); cursor = this.endOfDay(cursor)) {
      const day = cursor.toISOString().slice(0, 10);
      items.push({ day, label, value: byDay.get(day) || 0 });
    }
    return items;
  }

  private getDurationMinutes(formData: any) {
    const duration = Number(formData?.durationMinutes ?? formData?.estimatedMinutes ?? formData?.laborMinutes ?? 0);
    if (Number.isFinite(duration) && duration > 0) {
      return Math.round(duration);
    }
    return 60;
  }

  private computeAgingBuckets(jobs: Array<{ invoiceDueAt?: Date | null; totalCents?: number | null }>, now: Date) {
    const buckets = [
      { key: '1_30', label: '1-30 days', count: 0, amountCents: 0 },
      { key: '31_60', label: '31-60 days', count: 0, amountCents: 0 },
      { key: '61_90', label: '61-90 days', count: 0, amountCents: 0 },
      { key: '90_plus', label: '90+ days', count: 0, amountCents: 0 },
    ];
    for (const job of jobs) {
      const dueAt = job.invoiceDueAt ? new Date(job.invoiceDueAt) : null;
      if (!dueAt) continue;
      const daysOverdue = Math.floor((now.getTime() - dueAt.getTime()) / (24 * 60 * 60 * 1000));
      const amountCents = Number(job.totalCents || 0);
      const bucket = daysOverdue > 90
        ? buckets[3]
        : daysOverdue > 60
        ? buckets[2]
        : daysOverdue > 30
        ? buckets[1]
        : buckets[0];
      bucket.count += 1;
      bucket.amountCents += amountCents;
    }
    return buckets;
  }

  private getWidgetLayout(settings: any) {
    const analytics = settings?.businessConfigJson?.analytics || {};
    const defaultWidgetOrder = ['executive-summary', 'pressure-panel', 'revenue-panel', 'capacity-panel', 'benchmark-delta'];
    const hiddenWidgets = Array.isArray(analytics.hiddenWidgets)
      ? analytics.hiddenWidgets.map((item: any) => String(item || '')).filter(Boolean)
      : [];
    const widgetOrder = Array.isArray(analytics.widgetOrder)
      ? analytics.widgetOrder.map((item: any) => String(item || '')).filter(Boolean)
      : defaultWidgetOrder;
    return {
      widgetOrder: Array.from(new Set([...widgetOrder, ...defaultWidgetOrder])),
      hiddenWidgets,
      defaultWindowDays: Math.max(7, Math.min(90, Number(analytics.defaultWindowDays || 30))),
    };
  }

  private buildPressureAreas(items: Array<{ key: string; label: string; value: number; detail: string; href?: string }>) {
    return items
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
  }

  private buildFocusSignals(items: Array<{ label: string; value: number; context: string }>) {
    return items.filter((item) => item.value > 0).slice(0, 3).map((item) => ({
      label: item.label,
      value: item.value,
      context: item.context,
    }));
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

      const duration = Number(
        (job.formData?.durationMinutes ?? job.formData?.estimatedMinutes ?? job.formData?.laborMinutes ?? 0) as number,
      );
      let minutes = 0;
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
      dueDatesSupported: true,
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

  async getOperations(tenantId: string, windowDays: number) {
    const db = this.prisma as any;
    const now = new Date();
    const range = this.getRange(windowDays, now);
    const pressure = await this.schedule.getTechnicianSchedulePressure(tenantId, {
      date: this.startOfDay(now).toISOString().slice(0, 10),
    });

    const [
      jobs,
      bookings,
      quotes,
      approvals,
      servicePlanRuns,
      openRevenueTasks,
      activePortalAccounts,
      activePortalTokens,
      documentArtifacts,
      pendingRenewals,
      openPlanChangeRequests,
    ] = await Promise.all([
      db.job.findMany({
        where: {
          companyId: tenantId,
          OR: [
            { createdAt: { gte: range.start, lt: range.end } },
            { completedAt: { gte: range.start, lt: range.end } },
          ],
        },
        select: {
          id: true,
          createdAt: true,
          completedAt: true,
          assignedUserId: true,
          formData: true,
        },
      }),
      db.booking.findMany({
        where: {
          companyId: tenantId,
          createdAt: { gte: range.start, lt: range.end },
        },
        select: {
          id: true,
          createdAt: true,
          jobId: true,
        },
      }),
      db.quote.findMany({
        where: {
          tenantId,
          createdAt: { gte: range.start, lt: range.end },
        },
        select: {
          id: true,
          status: true,
          approvedAt: true,
          convertedAt: true,
        },
      }),
      db.customerApproval.findMany({
        where: {
          tenantId,
          requestedAt: { gte: range.start, lt: range.end },
        },
        select: {
          id: true,
          requestedAt: true,
          respondedAt: true,
          status: true,
        },
      }),
      db.servicePlanRun.findMany({
        where: {
          tenantId,
          scheduledFor: { gte: range.start, lt: range.end },
        },
        select: {
          id: true,
          scheduledFor: true,
          executedAt: true,
          status: true,
        },
      }),
      db.revenueCollectionTask.groupBy({
        by: ['kind'],
        where: {
          tenantId,
          status: 'OPEN',
        },
        _count: { _all: true },
      }),
      db.customerAccount.count({
        where: {
          tenantId,
          status: 'ACTIVE',
        },
      }),
      db.publicJobToken.count({
        where: {
          job: { companyId: tenantId },
          expiresAt: { gt: now },
        },
      }),
      db.documentArtifact.count({
        where: {
          tenantId,
        },
      }),
      db.servicePlanRenewal.count({
        where: {
          tenantId,
          status: 'PENDING',
        },
      }),
      db.servicePlanChangeRequest.count({
        where: {
          tenantId,
          status: { in: ['OPEN', 'APPROVED'] },
        },
      }),
    ]);

    const jobCreatedSeries = this.buildSeries(
      jobs.map((job: any) => new Date(job.createdAt)).filter((value) => value >= range.start && value < range.end),
      range,
      'Jobs created',
    );
    const jobCompletedSeries = this.buildSeries(
      jobs.map((job: any) => job.completedAt ? new Date(job.completedAt) : null).filter(Boolean),
      range,
      'Jobs completed',
    );
    const bookingConverted = bookings.filter((booking: any) => Boolean(booking.jobId)).length;
    const sentQuoteBase = quotes.filter((quote: any) => quote.status !== 'DRAFT').length;
    const approvedQuoteCount = quotes.filter((quote: any) => ['APPROVED', 'CONVERTED'].includes(quote.status)).length;
    const convertedQuoteCount = quotes.filter((quote: any) => quote.status === 'CONVERTED').length;
    const approvalHours = approvals
      .filter((approval: any) => approval.respondedAt)
      .map((approval: any) => (new Date(approval.respondedAt).getTime() - new Date(approval.requestedAt).getTime()) / 3600000)
      .filter((hours: number) => Number.isFinite(hours) && hours >= 0);
    const executedPlanRuns = servicePlanRuns.filter((run: any) => run.status === 'EXECUTED').length;
    const overdueRecurringRuns = await db.servicePlanRun.count({
      where: {
        tenantId,
        status: { in: ['FAILED', 'PENDING'] },
        scheduledFor: { lt: now },
      },
    });

    return {
      windowDays,
      explainers: {
        bookingConversionRate: 'Bookings created in the selected window that already link to a live job.',
        quoteApprovalRate: 'Quotes created in the selected window that progressed beyond sent into approved or converted.',
        quoteConversionRate: 'Quotes approved in the selected window that were converted into work.',
        approvalTurnaround: 'Median customer-approval turnaround measured from requestedAt to respondedAt.',
      },
      jobs: {
        createdSeries: jobCreatedSeries,
        completedSeries: jobCompletedSeries,
      },
      conversions: {
        bookingsToJobsRate: this.rate(bookingConverted, bookings.length),
        bookingsCreated: bookings.length,
        bookingsConverted: bookingConverted,
        quoteSentToApprovedRate: this.rate(approvedQuoteCount, sentQuoteBase),
        quoteApprovedToConvertedRate: this.rate(convertedQuoteCount, approvedQuoteCount),
      },
      technicianUtilization: {
        asOf: pressure.date,
        technicians: pressure.technicians.map((technician: any) => ({
          technicianId: technician.technicianId,
          technicianName: technician.technicianName,
          availableMinutes: technician.availableMinutes,
          scheduledMinutes: technician.scheduledMinutes,
          utilizationPct: technician.availableMinutes > 0
            ? Number(((technician.scheduledMinutes / technician.availableMinutes) * 100).toFixed(1))
            : null,
          remainingMinutes: technician.remainingMinutes,
          overloaded: technician.overloaded,
          unavailable: technician.unavailable,
        })),
      },
      servicePlans: {
        runsScheduled: servicePlanRuns.length,
        runsExecuted: executedPlanRuns,
        executionRate: this.rate(executedPlanRuns, servicePlanRuns.length),
        overdueRuns: overdueRecurringRuns,
        pendingRenewals,
        openChangeRequests: openPlanChangeRequests,
      },
      approvals: {
        requested: approvals.length,
        responded: approvals.filter((approval: any) => Boolean(approval.respondedAt)).length,
        turnaroundMedianHours: this.medianHours(approvalHours),
      },
      openRevenueTasksByType: openRevenueTasks.map((row: any) => ({
        type: row.kind,
        count: Number(row._count?._all || 0),
      })),
      pressure: {
        unassignedDueWork: pressure.unassignedDueWork.length,
        overdueRecurringRuns,
        dueRecurringPlanCount: pressure.dueRecurringPlanCount,
      },
      adoption: {
        activePortalAccounts,
        activePortalTokens,
        documentArtifacts,
      },
    };
  }

  async getRevenue(tenantId: string, windowDays: number) {
    const db = this.prisma as any;
    const now = new Date();
    const range = this.getRange(windowDays, now);

    const [quotes, issuedInvoices, overdueInvoices, openTasks] = await Promise.all([
      db.quote.findMany({
        where: {
          tenantId,
          createdAt: { gte: range.start, lt: range.end },
        },
        select: {
          id: true,
          status: true,
          approvedAt: true,
          convertedAt: true,
          totalCents: true,
        },
      }),
      db.job.findMany({
        where: {
          companyId: tenantId,
          invoiceIssuedAt: { gte: range.start, lt: range.end },
        },
        select: {
          id: true,
          totalCents: true,
          invoiceIssuedAt: true,
          invoicePaidAt: true,
        },
      }),
      db.job.findMany({
        where: {
          companyId: tenantId,
          invoiceIssuedAt: { not: null },
          invoicePaidAt: null,
          invoiceDueAt: { lt: now },
          totalCents: { gt: 0 },
        },
        select: {
          id: true,
          totalCents: true,
          invoiceDueAt: true,
        },
      }),
      db.revenueCollectionTask.groupBy({
        by: ['kind'],
        where: {
          tenantId,
          status: 'OPEN',
        },
        _count: { _all: true },
      }),
    ]);

    const sentQuoteBase = quotes.filter((quote: any) => quote.status !== 'DRAFT').length;
    const approvedQuotes = quotes.filter((quote: any) => ['APPROVED', 'CONVERTED'].includes(quote.status));
    const convertedQuotes = quotes.filter((quote: any) => quote.status === 'CONVERTED');
    const paidInvoices = issuedInvoices.filter((job: any) => Boolean(job.invoicePaidAt));

    return {
      windowDays,
      explainers: {
        sentToApprovedRate: 'Quotes created in the selected window with a non-draft status that reached approved or converted.',
        approvedToConvertedRate: 'Approved quotes created in the selected window that have convertedAt set.',
        invoiceIssuedToPaidRate: 'Invoices issued in the selected window that already have invoicePaidAt set.',
      },
      funnel: {
        quotesCreated: quotes.length,
        sentQuotes: sentQuoteBase,
        approvedQuotes: approvedQuotes.length,
        convertedQuotes: convertedQuotes.length,
        sentToApprovedRate: this.rate(approvedQuotes.length, sentQuoteBase),
        approvedToConvertedRate: this.rate(convertedQuotes.length, approvedQuotes.length),
        invoicesIssued: issuedInvoices.length,
        invoicesPaid: paidInvoices.length,
        invoiceIssuedToPaidRate: this.rate(paidInvoices.length, issuedInvoices.length),
      },
      overdueInvoices: {
        count: overdueInvoices.length,
        amountCents: overdueInvoices.reduce((sum: number, job: any) => sum + Number(job.totalCents || 0), 0),
        agingBuckets: this.computeAgingBuckets(overdueInvoices, now),
      },
      openTasksByType: openTasks.map((row: any) => ({
        type: row.kind,
        count: Number(row._count?._all || 0),
      })),
    };
  }

  async getCustomers(tenantId: string, windowDays: number, customerId?: string) {
    const db = this.prisma as any;
    const now = new Date();
    const range = this.getRange(windowDays, now);
    const activityStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [
      activeCustomers,
      activePlanCustomers,
      overdueBalanceCustomers,
      topQuoteCustomers,
      approvals,
      customerSummary,
    ] = await Promise.all([
      db.customer.count({
        where: {
          companyId: tenantId,
          OR: [
            { jobs: { some: { createdAt: { gte: activityStart } } } },
            { quotes: { some: { createdAt: { gte: activityStart } } } },
            { approvals: { some: { requestedAt: { gte: activityStart } } } },
            { servicePlans: { some: { createdAt: { gte: activityStart } } } },
          ],
        },
      }),
      db.servicePlan.groupBy({
        by: ['customerId'],
        where: {
          tenantId,
          status: 'ACTIVE',
        },
      }),
      db.job.groupBy({
        by: ['customerId'],
        where: {
          companyId: tenantId,
          customerId: { not: null },
          invoiceIssuedAt: { not: null },
          invoicePaidAt: null,
          invoiceDueAt: { lt: now },
        },
      }),
      db.quote.groupBy({
        by: ['customerId'],
        where: {
          tenantId,
          createdAt: { gte: range.start, lt: range.end },
        },
        _count: { _all: true },
        orderBy: { _count: { customerId: 'desc' } },
        take: 5,
      }),
      db.customerApproval.findMany({
        where: {
          tenantId,
          requestedAt: { gte: range.start, lt: range.end },
          ...(customerId ? { customerId } : {}),
        },
        select: {
          id: true,
          customerId: true,
          requestedAt: true,
          respondedAt: true,
          status: true,
          customer: { select: { id: true, name: true } },
        },
      }),
      customerId
        ? Promise.all([
            db.quote.findMany({
              where: { tenantId, customerId },
              select: { id: true, status: true, totalCents: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 10,
            }),
            db.servicePlan.count({ where: { tenantId, customerId, status: 'ACTIVE' } }),
            db.job.findMany({
              where: {
                companyId: tenantId,
                customerId,
                invoiceIssuedAt: { not: null },
              },
              select: {
                id: true,
                totalCents: true,
                invoiceDueAt: true,
                invoicePaidAt: true,
              },
            }),
          ])
        : Promise.resolve(null),
    ]);

    const topCustomerIds = topQuoteCustomers.map((row: any) => row.customerId).filter(Boolean);
    const customerRows = topCustomerIds.length
      ? await db.customer.findMany({
          where: { companyId: tenantId, id: { in: topCustomerIds } },
          select: { id: true, name: true },
        })
      : [];
    const customerNameMap = new Map(customerRows.map((row: any) => [row.id, row.name]));

    const responsiveness = approvals.reduce((acc: Map<string, { customerId: string; customerName: string; responded: number; hours: number[] }>, approval: any) => {
      const key = String(approval.customerId || '');
      if (!key) return acc;
      const entry = acc.get(key) || {
        customerId: key,
        customerName: approval.customer?.name || 'Customer',
        responded: 0,
        hours: [],
      };
      if (approval.respondedAt) {
        entry.responded += 1;
        const diff = (new Date(approval.respondedAt).getTime() - new Date(approval.requestedAt).getTime()) / 3600000;
        if (Number.isFinite(diff) && diff >= 0) {
          entry.hours.push(diff);
        }
      }
      acc.set(key, entry);
      return acc;
    }, new Map<string, { customerId: string; customerName: string; responded: number; hours: number[] }>());

    const approvalResponsiveness = Array.from(
      responsiveness.values(),
    ).map((entry: { customerId: string; customerName: string; responded: number; hours: number[] }) => ({
        customerId: entry.customerId,
        customerName: entry.customerName,
        respondedApprovals: entry.responded,
        medianResponseHours: this.medianHours(entry.hours),
      }))
      .sort((a, b) => {
        const left = a.medianResponseHours ?? Number.MAX_SAFE_INTEGER;
        const right = b.medianResponseHours ?? Number.MAX_SAFE_INTEGER;
        return left - right;
      })
      .slice(0, 5);

    return {
      windowDays,
      summary: {
        activeCustomers,
        customersWithActiveServicePlans: activePlanCustomers.length,
        customersWithOverdueBalances: overdueBalanceCustomers.length,
      },
      topQuoteVolume: topQuoteCustomers.map((row: any) => ({
        customerId: row.customerId,
        customerName: customerNameMap.get(row.customerId) || 'Customer',
        quoteCount: Number(row._count?._all || 0),
      })),
      approvalResponsiveness,
      customerSummary: customerSummary
        ? {
            quoteCount: customerSummary[0].length,
            openQuoteCount: customerSummary[0].filter((quote: any) => ['DRAFT', 'SENT', 'APPROVED'].includes(quote.status)).length,
            activeServicePlans: customerSummary[1],
            overdueBalanceCents: customerSummary[2]
              .filter((job: any) => !job.invoicePaidAt && job.invoiceDueAt && new Date(job.invoiceDueAt) < now)
              .reduce((sum: number, job: any) => sum + Number(job.totalCents || 0), 0),
            unpaidInvoiceCount: customerSummary[2].filter((job: any) => !job.invoicePaidAt).length,
          }
        : null,
    };
  }

  async getCapacityAnalytics(tenantId: string, windowDays: number) {
    const now = new Date();
    const from = this.startOfDay(now);
    const to = new Date(from.getTime() + windowDays * 24 * 60 * 60 * 1000);
    const capacity = await this.schedule.getCapacity(tenantId, {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    });
    const pressure = await this.schedule.getTechnicianSchedulePressure(tenantId, {
      date: from.toISOString().slice(0, 10),
    });

    const technicianSummary = (capacity.rows || []).map((row: any) => {
      const availableMinutes = row.days.reduce((sum: number, day: any) => sum + Number(day.availableMinutes || 0), 0);
      const scheduledMinutes = row.days.reduce((sum: number, day: any) => sum + Number(day.scheduledMinutes || 0), 0);
      const overloadedDays = row.days.filter((day: any) => Boolean(day.overloaded)).length;
      return {
        technicianId: row.technicianId,
        technicianName: row.technicianName,
        role: row.role,
        availableMinutes,
        scheduledMinutes,
        utilizationPct: availableMinutes > 0 ? Number(((scheduledMinutes / availableMinutes) * 100).toFixed(1)) : null,
        overloadedDays,
      };
    });

    return {
      windowDays,
      summary: {
        technicians: technicianSummary.length,
        overloadedDays: technicianSummary.reduce((sum: number, item: any) => sum + item.overloadedDays, 0),
        unassignedDueWork: pressure.unassignedDueWork.length,
        dueRecurringPlanCount: pressure.dueRecurringPlanCount,
      },
      technicians: technicianSummary,
      dailyPressure: pressure,
    };
  }

  async getBenchmarks(tenantId: string, windowDays: number) {
    const db = this.prisma as any;
    const now = new Date();
    const current7 = this.getRange(7, now);
    const previous7 = this.getPreviousRange(current7);
    const current30 = this.getRange(30, now);
    const previous30 = this.getPreviousRange(current30);

    const [
      completed7Current,
      completed7Previous,
      completed30Current,
      completed30Previous,
      overdueInvoicesCurrent,
      overdueInvoicesPrevious,
      bookings7Current,
      bookings7Previous,
      quotes7Current,
      quotes7Previous,
      invoices7Current,
      invoices7Previous,
      settings,
    ] = await Promise.all([
      db.job.count({ where: { companyId: tenantId, completedAt: { gte: current7.start, lt: current7.end } } }),
      db.job.count({ where: { companyId: tenantId, completedAt: { gte: previous7.start, lt: previous7.end } } }),
      db.job.count({ where: { companyId: tenantId, completedAt: { gte: current30.start, lt: current30.end } } }),
      db.job.count({ where: { companyId: tenantId, completedAt: { gte: previous30.start, lt: previous30.end } } }),
      db.job.count({
        where: {
          companyId: tenantId,
          invoicePaidAt: null,
          invoiceDueAt: { lt: now },
        },
      }),
      db.job.count({
        where: {
          companyId: tenantId,
          invoicePaidAt: null,
          invoiceDueAt: { lt: current7.start },
        },
      }),
      db.booking.count({ where: { companyId: tenantId, createdAt: { gte: current7.start, lt: current7.end }, jobId: { not: null } } }),
      db.booking.count({ where: { companyId: tenantId, createdAt: { gte: previous7.start, lt: previous7.end }, jobId: { not: null } } }),
      db.quote.count({ where: { tenantId, createdAt: { gte: current7.start, lt: current7.end }, status: { in: ['APPROVED', 'CONVERTED'] } } }),
      db.quote.count({ where: { tenantId, createdAt: { gte: previous7.start, lt: previous7.end }, status: { in: ['APPROVED', 'CONVERTED'] } } }),
      db.job.count({ where: { companyId: tenantId, invoicePaidAt: { gte: current7.start, lt: current7.end } } }),
      db.job.count({ where: { companyId: tenantId, invoicePaidAt: { gte: previous7.start, lt: previous7.end } } }),
      db.tenantSetting.findUnique({
        where: { tenantId },
        select: { businessConfigJson: true },
      }),
    ]);

    const metrics = [
      this.toDeltaMetric('jobs_completed_7d', 'Jobs completed', 'vs previous 7 days', completed7Current, completed7Previous),
      this.toDeltaMetric('jobs_completed_30d', 'Jobs completed', 'vs previous 30 days', completed30Current, completed30Previous),
      this.toDeltaMetric('booking_conversions_7d', 'Bookings converted', 'vs previous 7 days', bookings7Current, bookings7Previous),
      this.toDeltaMetric('quotes_approved_7d', 'Quotes approved', 'vs previous 7 days', quotes7Current, quotes7Previous),
      this.toDeltaMetric('invoices_paid_7d', 'Invoices paid', 'vs previous 7 days', invoices7Current, invoices7Previous),
      this.toDeltaMetric('overdue_invoices_live', 'Overdue invoices', 'live count vs 7 days ago baseline', overdueInvoicesCurrent, overdueInvoicesPrevious),
    ];

    const topPressureChanges = [...metrics]
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);

    return {
      windowDays,
      widgetLayout: this.getWidgetLayout(settings),
      metrics,
      topPressureChanges,
      explainers: [
        'Comparisons use the tenant’s own previous 7-day and 30-day periods.',
        'No external or industry benchmark is used.',
      ],
    };
  }

  async getExecutive(tenantId: string, windowDays: number) {
    const [operations, capacity, customers, revenue, benchmarks] = await Promise.all([
      this.getOperations(tenantId, windowDays),
      this.getCapacityAnalytics(tenantId, 7),
      this.getCustomers(tenantId, windowDays),
      this.getRevenue(tenantId, windowDays),
      this.getBenchmarks(tenantId, windowDays),
    ]);

    const pressureAreas = this.buildPressureAreas([
      {
        key: 'overdue_invoices',
        label: 'Overdue invoices',
        value: revenue.overdueInvoices.count,
        detail: 'Invoices remain unpaid past due date and are now collections pressure.',
        href: '/dashboard/revenue',
      },
      {
        key: 'unassigned_due_work',
        label: 'Unassigned due work',
        value: capacity.summary.unassignedDueWork,
        detail: 'Upcoming work is due without technician ownership.',
        href: '/dashboard/scheduling',
      },
      {
        key: 'overdue_recurring_runs',
        label: 'Overdue recurring runs',
        value: operations.servicePlans.overdueRuns,
        detail: 'Recurring work generation has pending or failed runs behind schedule.',
        href: '/dashboard/service-plans',
      },
      {
        key: 'open_plan_change_requests',
        label: 'Open plan requests',
        value: operations.servicePlans.openChangeRequests,
        detail: 'Customer or operator plan changes still need review or completion.',
        href: '/dashboard/service-plans',
      },
      {
        key: 'open_revenue_tasks',
        label: 'Open revenue tasks',
        value: revenue.openTasksByType.reduce((sum: number, item: any) => sum + Number(item.count || 0), 0),
        detail: 'Quote and collections follow-up is accumulating in the revenue queue.',
        href: '/dashboard/revenue',
      },
    ]);

    const focusSignals = this.buildFocusSignals([
      {
        label: 'Collections focus',
        value: revenue.overdueInvoices.count,
        context: 'Overdue invoices are the clearest near-term cash pressure.',
      },
      {
        label: 'Dispatch focus',
        value: capacity.summary.unassignedDueWork,
        context: 'Unassigned due work will become missed schedule capacity next.',
      },
      {
        label: 'Recurring execution focus',
        value: operations.servicePlans.overdueRuns,
        context: 'Recurring plans are due but not converting into fresh work reliably.',
      },
      {
        label: 'Retention focus',
        value: operations.servicePlans.pendingRenewals + operations.servicePlans.openChangeRequests,
        context: 'Renewal responses and plan-change requests are the clearest customer-retention queue.',
      },
    ]);

    return {
      windowDays,
      summaryCards: [
        {
          key: 'active_customers',
          label: 'Active customers',
          value: customers.summary.activeCustomers,
          detail: 'Customers with recent commercial or operational activity.',
        },
        {
          key: 'booking_conversion_rate',
          label: 'Booking conversion',
          value: operations.conversions.bookingsToJobsRate,
          suffix: '%',
          detail: 'Bookings created in-window that already became jobs.',
        },
        {
          key: 'invoice_paid_rate',
          label: 'Invoice paid rate',
          value: revenue.funnel.invoiceIssuedToPaidRate,
          suffix: '%',
          detail: 'Invoices issued in-window that are already paid.',
        },
        {
          key: 'technician_utilization',
          label: 'Scheduled utilization',
          value: capacity.technicians.length
            ? Number((capacity.technicians.reduce((sum: number, row: any) => sum + Number(row.utilizationPct || 0), 0) / capacity.technicians.length).toFixed(1))
            : null,
          suffix: '%',
          detail: 'Average scheduled minutes vs capacity across the next planning window.',
        },
      ],
      pressureAreas,
      trendDeltas: benchmarks.metrics,
      focusSignals,
    };
  }
}
