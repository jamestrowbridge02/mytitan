import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleService } from '../schedule/schedule.service';

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedule: ScheduleService,
  ) {}

  private getMonthStart(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  async getOverview(tenantId: string) {
    const db = this.prisma as any;
    const now = new Date();
    const monthStart = this.getMonthStart(now);
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [jobsCreated, bookingsUpcoming, outstandingAgg, revenueAgg, usage] = await Promise.all([
      db.job.count({
        where: { companyId: tenantId, createdAt: { gte: monthStart } },
      }),
      db.booking.count({
        where: { companyId: tenantId, startsAt: { gte: now, lte: weekEnd }, status: { not: 'CANCELLED' } },
      }),
      db.job.aggregate({
        where: {
          companyId: tenantId,
          invoiceIssuedAt: { not: null },
          invoicePaidAt: null,
        },
        _count: { id: true },
        _sum: { totalCents: true },
      }),
      db.job.aggregate({
        where: {
          companyId: tenantId,
          invoicePaidAt: { gte: monthStart },
        },
        _sum: { totalCents: true },
      }),
      db.usageMeter.findUnique({
        where: { tenantId_periodStart: { tenantId, periodStart: monthStart } },
      }),
    ]);

    return {
      jobsCreatedThisMonth: jobsCreated,
      bookingsNext7Days: bookingsUpcoming,
      outstandingInvoices: {
        count: outstandingAgg?._count?.id ?? 0,
        totalCents: outstandingAgg?._sum?.totalCents ?? 0,
      },
      revenueThisMonth: revenueAgg?._sum?.totalCents ?? 0,
      aiUsageThisMonth: {
        requests: usage?.aiRequestsUsed ?? 0,
        tokens: usage?.aiTokensUsed ?? 0,
      },
      storageUsageBytes: usage?.storageBytesUsed ?? null,
    };
  }

  async getIntelligence(tenantId: string) {
    const db = this.prisma as any;
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const previous7Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const todayKey = now.toISOString().slice(0, 10);
    const next7Key = next7Days.toISOString().slice(0, 10);

    const [
      jobsByStatus,
      technicianLoad,
      upcomingBookings,
      publicUnlinkedBookings,
      communicationsLast7Days,
      activityVelocity,
      customersNeedingFollowUp,
      billingReadyJobs,
      portalReadyJobs,
      issuedAwaitingPayment,
      stalledJobs,
      unassignedOpenJobs,
      overdueBillingFollowUps,
      overdueDispatchFollowUps,
      bookingsConvertedLast7Days,
      agedUnlinkedBookings,
      inProgressTechnicianJobs,
      portalLinksExpiringSoon,
      expiredPortalLinks,
      overdueInvoices,
      dueServicePlans,
      overduePlanRuns,
      quotesAwaitingApproval,
      approvedQuotesAwaitingConversion,
      schedulingCapacity,
      schedulingPressure,
      completedLast7Days,
      completedPrevious7Days,
      recentCompletedByTechnician,
      recentCommunications,
    ] = await Promise.all([
      db.job.groupBy({
        by: ['status'],
        where: { companyId: tenantId },
        _count: { status: true },
      }),
      db.job.groupBy({
        by: ['assignedUserId'],
        where: {
          companyId: tenantId,
          assignedUserId: { not: null },
          status: { in: ['OPEN', 'SCHEDULED', 'IN_PROGRESS'] },
        },
        _count: { assignedUserId: true },
      }),
      db.booking.count({
        where: {
          companyId: tenantId,
          status: { not: 'CANCELLED' },
          startsAt: { gte: now, lte: next7Days },
        },
      }),
      db.booking.count({
        where: {
          companyId: tenantId,
          source: 'PUBLIC',
          jobId: null,
          status: { in: ['PENDING', 'PLANNED', 'CONFIRMED'] },
        },
      }),
      db.activityEvent.count({
        where: {
          tenantId,
          type: { in: ['sms.sent', 'email.sent'] },
          at: { gte: last7Days },
        },
      }),
      db.activityEvent.count({
        where: {
          tenantId,
          at: { gte: last7Days },
        },
      }),
      db.customer.count({
        where: {
          companyId: tenantId,
          OR: [
            { activityEvents: { none: {} } },
            { activityEvents: { none: { at: { gte: last30Days } } } },
          ],
        },
      }),
      db.job.count({
        where: {
          companyId: tenantId,
          status: { in: ['COMPLETED', 'INVOICED'] },
          invoiceIssuedAt: null,
        },
      }),
      db.job.count({
        where: {
          companyId: tenantId,
          status: { in: ['COMPLETED', 'INVOICED'] },
          publicTokens: { some: { expiresAt: { gt: now } } },
        },
      }),
      db.job.count({
        where: {
          companyId: tenantId,
          invoiceIssuedAt: { not: null },
          invoicePaidAt: null,
        },
      }),
      db.job.count({
        where: {
          companyId: tenantId,
          status: { in: ['OPEN', 'SCHEDULED', 'IN_PROGRESS'] },
          updatedAt: { lt: new Date(now.getTime() - 72 * 60 * 60 * 1000) },
        },
      }),
      db.job.count({
        where: {
          companyId: tenantId,
          status: { in: ['OPEN', 'SCHEDULED'] },
          assignedUserId: null,
        },
      }),
      db.jobReminder.count({
        where: {
          companyId: tenantId,
          completedAt: null,
          remindAt: { lt: now },
        },
      }),
      db.jobReminder.count({
        where: {
          companyId: tenantId,
          completedAt: null,
          note: 'Automation dispatch follow-up',
          remindAt: { lt: now },
        },
      }),
      db.booking.count({
        where: {
          companyId: tenantId,
          jobId: { not: null },
          updatedAt: { gte: last7Days },
        },
      }),
      db.booking.count({
        where: {
          companyId: tenantId,
          jobId: null,
          status: { in: ['PENDING', 'PLANNED', 'CONFIRMED'] },
          createdAt: { lt: new Date(now.getTime() - 48 * 60 * 60 * 1000) },
        },
      }),
      db.job.count({
        where: {
          companyId: tenantId,
          assignedUserId: { not: null },
          status: 'IN_PROGRESS',
        },
      }),
      db.publicJobToken.count({
        where: {
          job: { companyId: tenantId },
          expiresAt: {
            gt: now,
            lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      db.publicJobToken.count({
        where: {
          job: { companyId: tenantId },
          expiresAt: { lte: now },
        },
      }),
      db.job.count({
        where: {
          companyId: tenantId,
          invoiceIssuedAt: { not: null },
          invoicePaidAt: null,
          invoiceDueAt: { lt: now },
        },
      }),
      db.servicePlan.count({
        where: {
          tenantId,
          status: 'ACTIVE',
          nextRunAt: { lte: now },
        },
      }),
      db.servicePlanRun.count({
        where: {
          tenantId,
          status: { in: ['FAILED', 'PENDING'] },
          scheduledFor: { lt: now },
        },
      }),
      db.quote.count({
        where: {
          tenantId,
          status: 'SENT',
        },
      }),
      db.quote.count({
        where: {
          tenantId,
          status: 'APPROVED',
          convertedAt: null,
        },
      }),
      this.schedule.getCapacity(tenantId, { from: todayKey, to: next7Key }),
      this.schedule.getTechnicianSchedulePressure(tenantId, { date: todayKey }),
      db.job.count({
        where: {
          companyId: tenantId,
          completedAt: { gte: last7Days },
        },
      }),
      db.job.count({
        where: {
          companyId: tenantId,
          completedAt: { gte: previous7Days, lt: last7Days },
        },
      }),
      db.job.groupBy({
        by: ['assignedUserId'],
        where: {
          companyId: tenantId,
          assignedUserId: { not: null },
          completedAt: { gte: last7Days },
        },
        _count: { assignedUserId: true },
      }),
      db.activityEvent.findMany({
        where: {
          tenantId,
          type: { in: ['sms.sent', 'email.sent'] },
          at: { gte: last7Days },
        },
        orderBy: { at: 'asc' },
        select: { at: true, type: true },
      }),
    ]);

    const assignedIds = technicianLoad.map((row: any) => row.assignedUserId).filter(Boolean);
    const technicians = assignedIds.length
      ? await db.user.findMany({
          where: { id: { in: assignedIds } },
          select: { id: true, email: true },
        })
      : [];
    const techMap = new Map(technicians.map((tech: any) => [tech.id, tech.email]));
    const overloadedTechnicianDays = (schedulingCapacity?.rows || []).reduce((total: number, row: any) => {
      return total + (Array.isArray(row?.days) ? row.days.filter((day: any) => day?.overloaded).length : 0);
    }, 0);
    const unassignedDueWorkPressure = Array.isArray(schedulingPressure?.unassignedDueWork)
      ? schedulingPressure.unassignedDueWork.length
      : 0;

    return {
      jobsByStatus: jobsByStatus.map((row: any) => ({
        status: row.status,
        count: row._count.status,
      })),
      technicianLoad: technicianLoad
        .filter((row: any) => row.assignedUserId)
        .map((row: any) => ({
          technicianId: row.assignedUserId,
          technicianName: techMap.get(row.assignedUserId) || row.assignedUserId,
          assignedJobs: row._count.assignedUserId,
        }))
        .sort((a: any, b: any) => b.assignedJobs - a.assignedJobs),
      technicianThroughput: recentCompletedByTechnician
        .filter((row: any) => row.assignedUserId)
        .map((row: any) => ({
          technicianId: row.assignedUserId,
          technicianName: techMap.get(row.assignedUserId) || row.assignedUserId,
          completedJobs: row._count.assignedUserId,
        }))
        .sort((a: any, b: any) => b.completedJobs - a.completedJobs),
      summary: {
        upcomingBookingsNext7Days: upcomingBookings,
        publicBookingsAwaitingConversion: publicUnlinkedBookings,
        communicationsLast7Days,
        activityEventsLast7Days: activityVelocity,
        customersNeedingFollowUp,
        billingReadyJobs,
        portalReadyJobs,
        issuedAwaitingPayment,
        bookingsConvertedLast7Days,
        agedUnlinkedBookings,
        technicianCompletionQueue: inProgressTechnicianJobs,
        portalLinksExpiringSoon,
        overdueDispatchFollowUps,
        expiredPortalLinks,
        overdueInvoices,
        dueServicePlans,
        overduePlanRuns,
        quotesAwaitingApproval,
        approvedQuotesAwaitingConversion,
        overloadedTechnicianDays,
        unassignedDueWorkPressure,
      },
      attentionQueue: [
        quotesAwaitingApproval > 0
          ? { key: 'quotes_awaiting_approval', label: 'Quotes awaiting approval', count: quotesAwaitingApproval, href: '/dashboard/quotes', hint: 'Sent quotes still waiting on customer approval' }
          : null,
        approvedQuotesAwaitingConversion > 0
          ? { key: 'approved_quotes_awaiting_conversion', label: 'Approved quotes ready for conversion', count: approvedQuotesAwaitingConversion, href: '/dashboard/quotes', hint: 'Approved pricing is ready to become real operational work' }
          : null,
        dueServicePlans > 0
          ? { key: 'due_service_plans', label: 'Service plans due now', count: dueServicePlans, href: '/dashboard/service-plans', hint: 'Recurring work is ready to generate the next booking or job' }
          : null,
        unassignedDueWorkPressure > 0
          ? { key: 'unassigned_due_work', label: 'Unassigned due work', count: unassignedDueWorkPressure, href: '/dashboard/scheduling', hint: 'Upcoming jobs, bookings, and recurring work are due without technician ownership' }
          : null,
        overduePlanRuns > 0
          ? { key: 'overdue_plan_runs', label: 'Recurring runs need review', count: overduePlanRuns, href: '/dashboard/service-plans', hint: 'Failed or pending service plan runs need operator attention' }
          : null,
        overdueBillingFollowUps > 0
          ? { key: 'billing_followups_due', label: 'Overdue billing follow-ups', count: overdueBillingFollowUps, href: '/dashboard/billing/readiness', hint: 'Completed work already has past-due billing reminders' }
          : null,
        overdueInvoices > 0
          ? { key: 'overdue_invoices', label: 'Invoices overdue for payment', count: overdueInvoices, href: '/dashboard/billing/readiness', hint: 'Issued invoices have passed their due date without payment' }
          : null,
        issuedAwaitingPayment > 0
          ? { key: 'issued_unpaid', label: 'Issued invoices awaiting payment', count: issuedAwaitingPayment, href: '/dashboard/billing/readiness', hint: 'Invoice collection is active but payment has not landed yet' }
          : null,
        agedUnlinkedBookings > 0
          ? { key: 'conversion_backlog', label: 'Aged conversion backlog', count: agedUnlinkedBookings, href: '/dashboard/bookings', hint: 'Bookings older than 48h are still not linked to jobs' }
          : null,
        overdueDispatchFollowUps > 0
          ? { key: 'dispatch_followups_due', label: 'Dispatch follow-ups overdue', count: overdueDispatchFollowUps, href: '/dashboard/bookings', hint: 'Converted work still has overdue dispatch reminders' }
          : null,
        unassignedOpenJobs > 0
          ? { key: 'dispatch_backlog', label: 'Unassigned open jobs', count: unassignedOpenJobs, href: '/dashboard/jobs', hint: 'Dispatch ownership is missing on active work' }
          : null,
        portalLinksExpiringSoon > 0
          ? { key: 'portal_access_pressure', label: 'Portal links expiring soon', count: portalLinksExpiringSoon, href: '/dashboard/portal', hint: 'Customer access links should be refreshed before they go stale' }
          : null,
        expiredPortalLinks > 0
          ? { key: 'portal_access_expired', label: 'Expired portal links', count: expiredPortalLinks, href: '/dashboard/portal', hint: 'Customer access has already lapsed on existing portal links' }
          : null,
        inProgressTechnicianJobs > 0
          ? { key: 'technician_completion_pressure', label: 'Technician completion queue', count: inProgressTechnicianJobs, href: '/dashboard/technician', hint: 'Field work is active and should be closed out promptly' }
          : null,
      ].filter(Boolean),
      alerts: [
        stalledJobs > 0 ? { key: 'stalled_jobs', severity: 'warn', label: 'Stalled active jobs', count: stalledJobs, href: '/dashboard/jobs' } : null,
        unassignedOpenJobs > 0 ? { key: 'unassigned_jobs', severity: 'warn', label: 'Unassigned open jobs', count: unassignedOpenJobs, href: '/dashboard/jobs' } : null,
        overdueBillingFollowUps > 0 ? { key: 'overdue_followups', severity: 'warn', label: 'Overdue reminders', count: overdueBillingFollowUps, href: '/dashboard/billing/readiness' } : null,
        overdueDispatchFollowUps > 0 ? { key: 'dispatch_followups', severity: 'warn', label: 'Dispatch follow-ups overdue', count: overdueDispatchFollowUps, href: '/dashboard/bookings' } : null,
        overdueInvoices > 0 ? { key: 'overdue_invoices', severity: 'warn', label: 'Invoices overdue for payment', count: overdueInvoices, href: '/dashboard/billing/readiness' } : null,
        dueServicePlans > 0 ? { key: 'due_service_plans', severity: 'info', label: 'Service plans due now', count: dueServicePlans, href: '/dashboard/service-plans' } : null,
        overduePlanRuns > 0 ? { key: 'overdue_plan_runs', severity: 'warn', label: 'Recurring runs need review', count: overduePlanRuns, href: '/dashboard/service-plans' } : null,
        overloadedTechnicianDays > 0 ? { key: 'overloaded_technician_days', severity: 'warn', label: 'Technician days overloaded', count: overloadedTechnicianDays, href: '/dashboard/scheduling' } : null,
        publicUnlinkedBookings > 0 ? { key: 'public_conversion', severity: 'info', label: 'Public bookings awaiting conversion', count: publicUnlinkedBookings, href: '/dashboard/bookings' } : null,
        agedUnlinkedBookings > 0 ? { key: 'stale_booking_conversion', severity: 'warn', label: 'Unlinked bookings older than 48h', count: agedUnlinkedBookings, href: '/dashboard/bookings' } : null,
        portalLinksExpiringSoon > 0 ? { key: 'portal_links_expiring', severity: 'info', label: 'Portal links expiring within 7 days', count: portalLinksExpiringSoon, href: '/dashboard/portal' } : null,
        expiredPortalLinks > 0 ? { key: 'portal_links_expired', severity: 'warn', label: 'Portal links already expired', count: expiredPortalLinks, href: '/dashboard/portal' } : null,
      ].filter(Boolean),
      trends: {
        completedLast7Days,
        completedPrevious7Days,
        completionDelta: completedLast7Days - completedPrevious7Days,
        communicationByDay: Array.from({ length: 7 }).map((_, index) => {
          const day = new Date(last7Days.getTime() + index * 24 * 60 * 60 * 1000);
          const key = day.toISOString().slice(0, 10);
          const count = recentCommunications.filter((row: any) => {
            const at = row?.at ? new Date(row.at) : null;
            return at && !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === key;
          }).length;
          return { day: key, count };
        }),
      },
    };
  }
}
