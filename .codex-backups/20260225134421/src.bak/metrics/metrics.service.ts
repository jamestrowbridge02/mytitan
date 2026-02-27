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
}
