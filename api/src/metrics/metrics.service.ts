import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

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
    ]);

    const assignedIds = technicianLoad.map((row: any) => row.assignedUserId).filter(Boolean);
    const technicians = assignedIds.length
      ? await db.user.findMany({
          where: { id: { in: assignedIds } },
          select: { id: true, email: true },
        })
      : [];
    const techMap = new Map(technicians.map((tech: any) => [tech.id, tech.email]));

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
      summary: {
        upcomingBookingsNext7Days: upcomingBookings,
        publicBookingsAwaitingConversion: publicUnlinkedBookings,
        communicationsLast7Days,
        activityEventsLast7Days: activityVelocity,
        customersNeedingFollowUp,
        billingReadyJobs,
        portalReadyJobs,
      },
    };
  }
}
