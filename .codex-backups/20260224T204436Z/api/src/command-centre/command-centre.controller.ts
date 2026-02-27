import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('command-centre')
export class CommandCentreController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('summary')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async summary(@CurrentUser() user: JwtPayload) {
    const db = this.prisma as any;
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const [todayBookings, dueAndOverdueJobs, unpaidJobs, draftJobs, crmDrafts, sub, settings] = await Promise.all([
      db.booking.findMany({
        where: { companyId: user.companyId, startsAt: { gte: dayStart, lte: dayEnd } },
        orderBy: { startsAt: 'asc' },
        take: 20,
      }),
      db.job.findMany({
        where: {
          companyId: user.companyId,
          OR: [{ invoiceDueAt: { lt: now }, invoicePaidAt: null }, { status: { in: ['OPEN', 'SCHEDULED'] } }],
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      db.job.findMany({
        where: { companyId: user.companyId, invoiceIssuedAt: { not: null }, invoicePaidAt: null },
        orderBy: { invoiceIssuedAt: 'desc' },
        take: 20,
      }),
      db.jobDraft.findMany({ where: { companyId: user.companyId, userId: user.sub }, orderBy: { updatedAt: 'desc' }, take: 20 }),
      db.crmDraft.findMany({ where: { companyId: user.companyId, userId: user.sub }, orderBy: { updatedAt: 'desc' }, take: 20 }),
      db.tenantSubscription.findUnique({ where: { tenantId: user.companyId } }),
      db.tenantSetting.findUnique({ where: { tenantId: user.companyId } }),
    ]);

    return {
      quickActions: [
        { key: 'new_job', label: 'New Job', href: '/dashboard/jobs/new' },
        { key: 'new_booking', label: 'New Booking', href: '/dashboard/bookings' },
        { key: 'new_customer', label: 'New Customer / Trade Account', href: '/dashboard/trade-accounts' },
      ],
      todayBookings,
      dueAndOverdueJobs,
      unpaidJobs,
      drafts: { jobs: draftJobs, crm: crmDrafts },
      money: {
        unpaidCount: unpaidJobs.length,
        unpaidTotalCents: unpaidJobs.reduce((sum: number, job: any) => sum + Number(job.totalCents || 0), 0),
        subscriptionStatus: sub?.status || 'none',
      },
      setup: {
        guidedSetupCompletedAt: settings?.guidedSetupCompletedAt || null,
        onboardingCompleted: Boolean(settings?.onboardingCompleted),
        onboardingStep: Number(settings?.onboardingStep || 0),
      },
    };
  }
}
