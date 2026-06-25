import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleService } from '../schedule/schedule.service';

@Injectable()
export class MetricsService {
  private readonly intelligenceCache = new Map<string, { expiresAt: number; value: any }>();
  private readonly intelligenceInFlight = new Map<string, Promise<any>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedule: ScheduleService,
  ) {}

  private getMonthStart(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  private pct(numerator: number, denominator: number) {
    if (!denominator) return null;
    return Math.round((numerator / denominator) * 1000) / 10;
  }

  private delta(current: number, previous: number) {
    return current - previous;
  }

  private ageingBucket(invoiceDueAt: Date | string | null | undefined, now: Date) {
    if (!invoiceDueAt) return 'not_due';
    const due = new Date(invoiceDueAt);
    if (Number.isNaN(due.getTime()) || due >= now) return 'not_due';
    const days = Math.floor((now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
    if (days <= 7) return '1_7';
    if (days <= 30) return '8_30';
    return '31_plus';
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
    const cached = this.intelligenceCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const running = this.intelligenceInFlight.get(tenantId);
    if (running) return running;

    const request = this.buildIntelligence(tenantId);
    this.intelligenceInFlight.set(tenantId, request);
    try {
      const value = await request;
      this.intelligenceCache.set(tenantId, { expiresAt: Date.now() + 15_000, value });
      return value;
    } finally {
      this.intelligenceInFlight.delete(tenantId);
    }
  }

  private async buildIntelligence(tenantId: string) {
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
      pendingRenewals,
      openPlanChangeRequests,
      submittedExecutionAwaitingAcknowledgement,
      quotesAwaitingApproval,
      approvedQuotesAwaitingConversion,
      schedulingCapacity,
      schedulingPressure,
      completedLast7Days,
      completedPrevious7Days,
      recentCompletedByTechnician,
      recentCommunications,
      inventoryStockRows,
      purchaseOrdersOpen,
      jobPartsPending,
      openComplianceExceptions,
      breachedSlaEvents,
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
      db.jobExecutionRecord.count({
        where: {
          tenantId,
          status: 'SUBMITTED',
          acknowledgedAt: null,
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
      db.inventoryStock.findMany({
        where: { tenantId },
        select: {
          quantityOnHand: true,
          quantityReserved: true,
          reorderPoint: true,
        },
      }),
      db.stockPurchaseOrder.count({
        where: {
          tenantId,
          status: { in: ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED'] },
        },
      }),
      db.jobPart.findMany({
        where: {
          tenantId,
          status: { in: ['PLANNED', 'RESERVED'] },
        },
        select: {
          quantityPlanned: true,
          quantityReserved: true,
          quantityUsed: true,
        },
      }),
      db.complianceException.count({
        where: {
          tenantId,
          status: 'OPEN',
        },
      }),
      db.workflowSlaEvent.count({
        where: {
          tenantId,
          status: 'BREACHED',
        },
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
    const lowStockRows = inventoryStockRows.filter((row: any) => Number(row.quantityOnHand || 0) <= Number(row.reorderPoint || 0)).length;
    const shortageRows = inventoryStockRows.filter((row: any) => Number(row.quantityOnHand || 0) - Number(row.quantityReserved || 0) <= 0).length;
    const jobPartsAwaitingStock = jobPartsPending.filter((row: any) => Number(row.quantityPlanned || 0) > Number(row.quantityReserved || 0) + Number(row.quantityUsed || 0)).length;

    const operationalIssues = [
      unassignedOpenJobs > 0
        ? {
            key: 'unassigned_jobs_building_up',
            severity: 'warning',
            count: unassignedOpenJobs,
            issue: 'Unassigned jobs are building up',
            happened: `${unassignedOpenJobs} active job${unassignedOpenJobs === 1 ? '' : 's'} currently have no technician assigned.`,
            impact: 'Dispatch can still proceed, but these jobs are more likely to sit without clear ownership.',
            suggestedAction: 'Review the unassigned queue and assign when the right technician is known.',
            href: '/dashboard/jobs?view=unassigned',
          }
        : null,
      overloadedTechnicianDays > 0
        ? {
            key: 'technician_overbooked',
            severity: 'warning',
            count: overloadedTechnicianDays,
            issue: 'Technician capacity is overbooked',
            happened: `${overloadedTechnicianDays} technician day${overloadedTechnicianDays === 1 ? '' : 's'} exceed configured capacity.`,
            impact: 'Overloaded days can create late arrivals and rushed close-out records.',
            suggestedAction: 'Open scheduling and move work only after checking capacity warnings.',
            href: '/dashboard/scheduling',
          }
        : null,
      overdueInvoices > 0
        ? {
            key: 'overdue_invoices_increasing',
            severity: 'warning',
            count: overdueInvoices,
            issue: 'Overdue invoices need collection action',
            happened: `${overdueInvoices} issued invoice${overdueInvoices === 1 ? '' : 's'} are past due and unpaid.`,
            impact: 'Cash collection pressure is rising from real unpaid invoices.',
            suggestedAction: 'Open billing readiness and follow up on overdue invoices.',
            href: '/dashboard/billing/readiness',
          }
        : null,
      agedUnlinkedBookings > 0
        ? {
            key: 'booking_conversion_dropping',
            severity: 'info',
            count: agedUnlinkedBookings,
            issue: 'Bookings are waiting too long to become jobs',
            happened: `${agedUnlinkedBookings} booking${agedUnlinkedBookings === 1 ? '' : 's'} older than 48 hours are still not linked to jobs.`,
            impact: 'Customer intent is captured, but operational work has not been fully created.',
            suggestedAction: 'Open bookings and convert or close out the stale records.',
            href: '/dashboard/bookings',
          }
        : null,
      lowStockRows > 0 || shortageRows > 0
        ? {
            key: 'stock_pressure',
            severity: shortageRows > 0 ? 'warning' : 'info',
            count: lowStockRows + shortageRows,
            issue: 'Stock pressure exists',
            happened: `${lowStockRows} rows are at reorder point and ${shortageRows} rows have no available stock after reservations.`,
            impact: 'Jobs may be delayed if parts are not reserved, transferred, or purchased.',
            suggestedAction: 'Open inventory and review low-stock and shortage rows.',
            href: '/dashboard/inventory',
          }
        : null,
      submittedExecutionAwaitingAcknowledgement > 0
        ? {
            key: 'incomplete_job_records',
            severity: 'info',
            count: submittedExecutionAwaitingAcknowledgement,
            issue: 'Completed job records need acknowledgement',
            happened: `${submittedExecutionAwaitingAcknowledgement} submitted completion record${submittedExecutionAwaitingAcknowledgement === 1 ? '' : 's'} are not acknowledged.`,
            impact: 'The permanent record exists, but customer/office sign-off is incomplete.',
            suggestedAction: 'Open Live Work and acknowledge or follow up on submitted records.',
            href: '/dashboard/technician',
          }
        : null,
      communicationsLast7Days === 0
        ? {
            key: 'no_reviews_or_customer_updates_generated',
            severity: 'info',
            count: 0,
            issue: 'No recent customer communication was generated',
            happened: 'No outbound email or SMS activity was recorded in the last 7 days.',
            impact: 'Customers may not be receiving status updates, review prompts, or follow-up messages.',
            suggestedAction: 'Open notifications and confirm communication rules and recipients.',
            href: '/dashboard/notifications',
          }
        : null,
      openComplianceExceptions > 0 || breachedSlaEvents > 0
        ? {
            key: 'workflow_control_pressure',
            severity: 'warning',
            count: openComplianceExceptions + breachedSlaEvents,
            issue: 'Workflow controls need review',
            happened: `${openComplianceExceptions} compliance exception${openComplianceExceptions === 1 ? '' : 's'} and ${breachedSlaEvents} breached SLA event${breachedSlaEvents === 1 ? '' : 's'} are open.`,
            impact: 'Operational controls are signalling real evidence, approval, or timing gaps.',
            suggestedAction: 'Open compliance and resolve the exact records.',
            href: '/dashboard/compliance',
          }
        : null,
    ].filter(Boolean);

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
        pendingRenewals,
        openPlanChangeRequests,
        submittedExecutionAwaitingAcknowledgement,
        quotesAwaitingApproval,
        approvedQuotesAwaitingConversion,
        overloadedTechnicianDays,
        unassignedDueWorkPressure,
        lowStockRows,
        shortageRows,
        purchaseOrdersOpen,
        jobPartsAwaitingStock,
        openComplianceExceptions,
        breachedSlaEvents,
      },
      attentionQueue: [
        lowStockRows > 0
          ? { key: 'low_stock_rows', label: 'Low-stock parts', count: lowStockRows, href: '/dashboard/inventory', hint: 'On-hand inventory is at or below configured reorder points' }
          : null,
        shortageRows > 0
          ? { key: 'inventory_shortage', label: 'Inventory shortage pressure', count: shortageRows, href: '/dashboard/inventory', hint: 'Reserved and planned work is pressing against available stock' }
          : null,
        purchaseOrdersOpen > 0
          ? { key: 'purchase_orders_open', label: 'Open purchase orders', count: purchaseOrdersOpen, href: '/dashboard/purchase-orders', hint: 'Procurement is still in draft, ordered, or partially received states' }
          : null,
        jobPartsAwaitingStock > 0
          ? { key: 'job_parts_awaiting_stock', label: 'Job parts awaiting stock action', count: jobPartsAwaitingStock, href: '/dashboard/jobs/e2e-job-portal-active', hint: 'Planned job parts still need explicit reservation or usage decisions' }
          : null,
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
        pendingRenewals > 0
          ? { key: 'pending_plan_renewals', label: 'Renewal responses pending', count: pendingRenewals, href: '/dashboard/service-plans', hint: 'Customers have live plan renewal windows still awaiting a response' }
          : null,
        openPlanChangeRequests > 0
          ? { key: 'open_plan_change_requests', label: 'Plan change requests open', count: openPlanChangeRequests, href: '/dashboard/service-plans', hint: 'Customer or operator plan changes still need review or completion' }
          : null,
        submittedExecutionAwaitingAcknowledgement > 0
          ? { key: 'execution_ack_pending', label: 'Completion proofs awaiting acknowledgement', count: submittedExecutionAwaitingAcknowledgement, href: '/dashboard/technician', hint: 'Field records are submitted but the customer has not acknowledged completion yet' }
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
        openComplianceExceptions > 0
          ? { key: 'compliance_queue', label: 'Compliance queue', count: openComplianceExceptions, href: '/dashboard/compliance', hint: 'Open exceptions are signalling workflow, evidence, or approval debt.' }
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
        pendingRenewals > 0 ? { key: 'pending_plan_renewals', severity: 'info', label: 'Renewal responses pending', count: pendingRenewals, href: '/dashboard/service-plans' } : null,
        openPlanChangeRequests > 0 ? { key: 'open_plan_change_requests', severity: 'warn', label: 'Plan change requests open', count: openPlanChangeRequests, href: '/dashboard/service-plans' } : null,
        submittedExecutionAwaitingAcknowledgement > 0 ? { key: 'execution_ack_pending', severity: 'info', label: 'Completion proofs awaiting acknowledgement', count: submittedExecutionAwaitingAcknowledgement, href: '/dashboard/technician' } : null,
        lowStockRows > 0 ? { key: 'low_stock_rows', severity: 'warn', label: 'Low-stock parts', count: lowStockRows, href: '/dashboard/inventory' } : null,
        shortageRows > 0 ? { key: 'inventory_shortage', severity: 'warn', label: 'Inventory shortage pressure', count: shortageRows, href: '/dashboard/inventory' } : null,
        purchaseOrdersOpen > 0 ? { key: 'purchase_orders_open', severity: 'info', label: 'Open purchase orders', count: purchaseOrdersOpen, href: '/dashboard/purchase-orders' } : null,
        overloadedTechnicianDays > 0 ? { key: 'overloaded_technician_days', severity: 'warn', label: 'Technician days overloaded', count: overloadedTechnicianDays, href: '/dashboard/scheduling' } : null,
        publicUnlinkedBookings > 0 ? { key: 'public_conversion', severity: 'info', label: 'Public bookings awaiting conversion', count: publicUnlinkedBookings, href: '/dashboard/bookings' } : null,
        agedUnlinkedBookings > 0 ? { key: 'stale_booking_conversion', severity: 'warn', label: 'Unlinked bookings older than 48h', count: agedUnlinkedBookings, href: '/dashboard/bookings' } : null,
        portalLinksExpiringSoon > 0 ? { key: 'portal_links_expiring', severity: 'info', label: 'Portal links expiring within 7 days', count: portalLinksExpiringSoon, href: '/dashboard/portal' } : null,
        expiredPortalLinks > 0 ? { key: 'portal_links_expired', severity: 'warn', label: 'Portal links already expired', count: expiredPortalLinks, href: '/dashboard/portal' } : null,
        breachedSlaEvents > 0 ? { key: 'sla_breaches', severity: 'warn', label: 'Breached SLAs', count: breachedSlaEvents, href: '/dashboard/compliance' } : null,
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
      operationalIssues,
    };
  }

  async getBusinessHealth(tenantId: string) {
    const db = this.prisma as any;
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const previous7Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const previous30Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [
      bookingsCurrent,
      bookingsPrevious,
      completedCurrent,
      completedPrevious,
      invoiceRows,
      jobsCurrent,
      jobsPrevious,
      paidInvoiceRows,
      repeatCustomers,
      reviewNotifications,
      businessInventoryRows,
      shortageRows,
      locations,
      locationJobGroups,
      locationBookingGroups,
      locationInvoiceRows,
      users,
      technicianAssignedGroups,
      technicianExecutionGroups,
    ] = await Promise.all([
      db.booking.count({ where: { companyId: tenantId, createdAt: { gte: last30Days } } }),
      db.booking.count({ where: { companyId: tenantId, createdAt: { gte: previous30Days, lt: last30Days } } }),
      db.job.count({ where: { companyId: tenantId, completedAt: { gte: last7Days } } }),
      db.job.count({ where: { companyId: tenantId, completedAt: { gte: previous7Days, lt: last7Days } } }),
      db.job.findMany({
        where: { companyId: tenantId, invoiceIssuedAt: { not: null }, invoicePaidAt: null },
        select: { id: true, invoiceDueAt: true, totalCents: true, locationId: true },
        take: 1000,
      }),
      db.job.findMany({
        where: { companyId: tenantId, createdAt: { gte: last30Days } },
        select: { id: true, customerId: true, customerEmail: true, status: true, completedAt: true, locationId: true, totalCents: true },
        take: 1000,
      }),
      db.job.findMany({
        where: { companyId: tenantId, createdAt: { gte: previous30Days, lt: last30Days } },
        select: { id: true, customerId: true, customerEmail: true, status: true, completedAt: true, locationId: true, totalCents: true },
        take: 1000,
      }),
      db.job.findMany({
        where: { companyId: tenantId, invoicePaidAt: { gte: last30Days } },
        select: { id: true, totalCents: true, locationId: true, invoicePaidAt: true },
        take: 1000,
      }),
      db.job.groupBy({
        by: ['customerId'],
        where: { companyId: tenantId, customerId: { not: null } },
        _count: { customerId: true },
      }).catch(() => []),
      db.notification.count({
        where: {
          companyId: tenantId,
          createdAt: { gte: last30Days },
          OR: [{ type: { contains: 'review', mode: 'insensitive' } }, { title: { contains: 'review', mode: 'insensitive' } }],
        },
      }).catch(() => 0),
      db.inventoryStock.findMany({ where: { tenantId }, select: { quantityOnHand: true, quantityReserved: true, reorderPoint: true } }).catch(() => []),
      db.inventoryStock.findMany({ where: { tenantId }, select: { quantityOnHand: true, quantityReserved: true } }).then((rows: any[]) =>
        rows.filter((row) => Number(row.quantityOnHand || 0) - Number(row.quantityReserved || 0) <= 0).length,
      ).catch(() => 0),
      db.location.findMany({ where: { companyId: tenantId }, select: { id: true, name: true, kind: true, isActive: true }, orderBy: { name: 'asc' }, take: 100 }),
      db.job.groupBy({
        by: ['locationId'],
        where: { companyId: tenantId, createdAt: { gte: last30Days } },
        _count: { locationId: true },
        _sum: { totalCents: true },
      }).catch(() => []),
      db.booking.groupBy({
        by: ['locationId'],
        where: { companyId: tenantId, createdAt: { gte: last30Days } },
        _count: { locationId: true },
      }).catch(() => []),
      db.job.findMany({
        where: { companyId: tenantId, invoiceIssuedAt: { not: null }, invoicePaidAt: null },
        select: { locationId: true, invoiceDueAt: true, totalCents: true },
        take: 1000,
      }),
      db.user.findMany({ where: { companyId: tenantId }, select: { id: true, email: true, role: true, isActive: true }, take: 200 }),
      db.job.groupBy({
        by: ['assignedUserId'],
        where: { companyId: tenantId, assignedUserId: { not: null }, status: { in: ['OPEN', 'SCHEDULED', 'IN_PROGRESS'] } },
        _count: { assignedUserId: true },
      }).catch(() => []),
      db.jobExecutionRecord.groupBy({
        by: ['technicianId'],
        where: { tenantId, technicianId: { not: null }, completedAt: { gte: last30Days } },
        _count: { technicianId: true },
      }).catch(() => []),
    ]);

    const businessLowStockRows = businessInventoryRows.filter((row: any) => Number(row.quantityOnHand || 0) <= Number(row.reorderPoint || 0)).length;
    const invoiceBuckets = new Map<string, { key: string; label: string; count: number; amountCents: number }>([
      ['not_due', { key: 'not_due', label: 'Not due yet', count: 0, amountCents: 0 }],
      ['1_7', { key: '1_7', label: '1-7 days overdue', count: 0, amountCents: 0 }],
      ['8_30', { key: '8_30', label: '8-30 days overdue', count: 0, amountCents: 0 }],
      ['31_plus', { key: '31_plus', label: '31+ days overdue', count: 0, amountCents: 0 }],
    ]);
    for (const row of invoiceRows) {
      const bucket = invoiceBuckets.get(this.ageingBucket(row.invoiceDueAt, now))!;
      bucket.count += 1;
      bucket.amountCents += Number(row.totalCents || 0);
    }
    const unpaidValueCents = invoiceRows.reduce((sum: number, row: any) => sum + Number(row.totalCents || 0), 0);
    const overdueInvoices = invoiceRows.filter((row: any) => this.ageingBucket(row.invoiceDueAt, now) !== 'not_due').length;
    const completedJobs = jobsCurrent.filter((job: any) => job.completedAt).length;
    const completedPrevious30 = jobsPrevious.filter((job: any) => job.completedAt).length;
    const revenueCurrentCents = jobsCurrent.reduce((sum: number, job: any) => sum + Number(job.totalCents || 0), 0);
    const revenuePreviousCents = jobsPrevious.reduce((sum: number, job: any) => sum + Number(job.totalCents || 0), 0);
    const paidValueCents = paidInvoiceRows.reduce((sum: number, job: any) => sum + Number(job.totalCents || 0), 0);
    const repeatCustomerCount = repeatCustomers.filter((row: any) => Number(row._count?.customerId || 0) > 1).length;
    const activeCustomerCount = new Set(jobsCurrent.map((job: any) => job.customerId || job.customerEmail).filter(Boolean)).size;
    const convertedJobCount = jobsCurrent.filter((job: any) => Boolean(job.completedAt) || String(job.status || '').toUpperCase() !== 'CANCELLED').length;
    const jobGroupsByLocation = new Map<string, any>((locationJobGroups || []).map((row: any) => [row.locationId || '__none__', row]));
    const bookingGroupsByLocation = new Map<string, any>((locationBookingGroups || []).map((row: any) => [row.locationId || '__none__', row]));
    const invoicesByLocation = new Map<string, { count: number; amountCents: number; overdueCount: number }>();
    for (const row of locationInvoiceRows) {
      const key = row.locationId || '__none__';
      const current = invoicesByLocation.get(key) || { count: 0, amountCents: 0, overdueCount: 0 };
      current.count += 1;
      current.amountCents += Number(row.totalCents || 0);
      if (this.ageingBucket(row.invoiceDueAt, now) !== 'not_due') current.overdueCount += 1;
      invoicesByLocation.set(key, current);
    }
    const techMap = new Map(users.map((user: any) => [user.id, user]));
    const executionByTech = new Map((technicianExecutionGroups || []).map((row: any) => [row.technicianId, row._count?.technicianId || 0]));

    const issues = [
      overdueInvoices > 0
        ? { key: 'revenue_collection_pressure', issue: 'Revenue collection pressure', impact: `${overdueInvoices} invoice${overdueInvoices === 1 ? '' : 's'} are overdue.`, action: 'Open billing readiness', href: '/dashboard/billing/readiness' }
        : null,
      shortageRows > 0
        ? { key: 'stock_shortage_pressure', issue: 'Stock shortage pressure', impact: `${shortageRows} stock row${shortageRows === 1 ? '' : 's'} have no available quantity after reservations.`, action: 'Open inventory', href: '/dashboard/inventory' }
        : null,
      bookingsCurrent < bookingsPrevious
        ? { key: 'bookings_trend_down', issue: 'Bookings trend is down', impact: `Current 30-day bookings are ${bookingsCurrent}, previous period was ${bookingsPrevious}.`, action: 'Open bookings', href: '/dashboard/bookings' }
        : null,
    ].filter(Boolean);

    return {
      platformDiagnosticsVisible: false,
      source: 'tenant_business_records',
      generatedAt: now.toISOString(),
      summary: {
        bookingsTrend: { current: bookingsCurrent, previous: bookingsPrevious, delta: this.delta(bookingsCurrent, bookingsPrevious) },
        invoiceAgeing: Array.from(invoiceBuckets.values()),
        unpaidValueCents,
        jobCompletionVelocity: { current: completedCurrent, previous: completedPrevious, delta: this.delta(completedCurrent, completedPrevious) },
        locationUtilisation: locations.length ? this.pct(jobsCurrent.filter((job: any) => job.locationId).length, jobsCurrent.length) : null,
        technicianUtilisation: this.pct(technicianAssignedGroups.reduce((sum: number, row: any) => sum + Number(row._count?.assignedUserId || 0), 0), Math.max(users.filter((user: any) => user.isActive).length, 1)),
        customerRepeatRatePct: this.pct(repeatCustomerCount, activeCustomerCount),
        reviewGenerationStatus: { generated: reviewNotifications, eligibleCompletedJobs: completedJobs },
        stockPressure: { lowStockRows: businessLowStockRows, shortageRows },
        revenueCollectionPressure: { overdueInvoices, unpaidInvoices: invoiceRows.length, unpaidValueCents },
        revenueTrend: { currentCents: revenueCurrentCents, previousCents: revenuePreviousCents, delta: this.delta(revenueCurrentCents, revenuePreviousCents) },
        marginTrend: { available: false, reason: 'cost_data_not_configured', currentMarginCents: null, previousMarginCents: null, delta: null },
        utilisation: {
          locationPct: locations.length ? this.pct(jobsCurrent.filter((job: any) => job.locationId).length, jobsCurrent.length) : null,
          technicianActiveAssignments: technicianAssignedGroups.reduce((sum: number, row: any) => sum + Number(row._count?.assignedUserId || 0), 0),
        },
        technicianProductivity: {
          completedExecutionRecords: technicianExecutionGroups.reduce((sum: number, row: any) => sum + Number(row._count?.technicianId || 0), 0),
          basis: 'completedBy/completedAt execution records',
        },
        locationProductivity: {
          completedCurrent30Days: completedJobs,
          completedPrevious30Days: completedPrevious30,
          delta: this.delta(completedJobs, completedPrevious30),
        },
        bookingConversion: { bookings: bookingsCurrent, convertedJobs: convertedJobCount, conversionPct: this.pct(convertedJobCount, bookingsCurrent) },
        reviewPerformance: { generated: reviewNotifications, eligibleCompletedJobs: completedJobs, coveragePct: this.pct(reviewNotifications, completedJobs) },
        customerRetention: { repeatCustomers: repeatCustomerCount, activeCustomers: activeCustomerCount, repeatRatePct: this.pct(repeatCustomerCount, activeCustomerCount) },
        collectionPerformance: {
          paidInvoiceCount: paidInvoiceRows.length,
          paidValueCents,
          unpaidInvoiceCount: invoiceRows.length,
          unpaidValueCents,
          collectionPct: this.pct(paidInvoiceRows.length, paidInvoiceRows.length + invoiceRows.length),
        },
        sourceLinks: {
          revenueTrend: '/dashboard/finance',
          marginTrend: '/dashboard/reports',
          invoiceAgeing: '/dashboard/billing/readiness',
          utilisation: '/dashboard/calendar',
          technicianProductivity: '/dashboard/technician',
          locationProductivity: '/dashboard/calendar',
          bookingConversion: '/dashboard/bookings',
          reviewPerformance: '/dashboard/portal',
          customerRetention: '/dashboard/customers',
          collectionPerformance: '/dashboard/finance',
        },
      },
      locations: locations.map((location: any) => {
        const jobGroup = jobGroupsByLocation.get(location.id) || { _count: { locationId: 0 }, _sum: { totalCents: 0 } };
        const bookingGroup = bookingGroupsByLocation.get(location.id) || { _count: { locationId: 0 } };
        const invoice = invoicesByLocation.get(location.id) || { count: 0, amountCents: 0, overdueCount: 0 };
        return {
          locationId: location.id,
          locationName: location.name,
          kind: location.kind,
          active: Boolean(location.isActive),
          workload: Number(jobGroup._count?.locationId || 0),
          capacity: {
            scheduledWorkload: Number(jobGroup._count?.locationId || 0),
            activeStaffContext: users.filter((user: any) => Boolean(user.isActive)).length,
            basis: 'scheduled jobs and active workspace users',
          },
          bookings: Number(bookingGroup._count?.locationId || 0),
          revenueCents: Number(jobGroup._sum?.totalCents || 0),
          invoiceAgeing: invoice,
          completionVelocity: jobsCurrent.filter((job: any) => job.locationId === location.id && job.completedAt).length,
          completionRatePct: this.pct(jobsCurrent.filter((job: any) => job.locationId === location.id && job.completedAt).length, Number(jobGroup._count?.locationId || 0)),
          utilisationPct: this.pct(Number(jobGroup._count?.locationId || 0), Math.max(Number(jobGroup._count?.locationId || 0) + Number(bookingGroup._count?.locationId || 0), 1)),
          stockPressure: { lowStockRows: 0, shortageRows: 0 },
          staffingPressure: 'absence_context_available_in_scheduling',
        };
      }),
      technicians: users
        .filter((user: any) => ['OWNER', 'ADMIN', 'STAFF', 'TECHNICIAN', 'DISPATCHER'].includes(String(user.role)))
        .map((user: any) => {
          const assigned = technicianAssignedGroups.find((row: any) => row.assignedUserId === user.id);
          return {
            technicianId: user.id,
            technicianName: user.email,
            active: Boolean(user.isActive),
            activeAssignments: Number(assigned?._count?.assignedUserId || 0),
            completedExecutionRecords: Number(executionByTech.get(user.id) || 0),
            utilizationBasis: 'active_assignment_count_and_completed_execution_records',
          };
        }),
      issues,
    };
  }
}
