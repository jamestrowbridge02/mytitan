import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { isCommandCentrePremiumV1Enabled } from '../common/feature-flags';
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

  @Get('views')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async listViews(@CurrentUser() user: JwtPayload) {
    if (!isCommandCentrePremiumV1Enabled()) return [];
    const db = this.prisma as any;
    return db.savedCommandView.findMany({
      where: { companyId: user.companyId, userId: user.sub },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  @Post('views')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async createView(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name: string; filters: Record<string, any>; isDefault?: boolean },
  ) {
    if (!isCommandCentrePremiumV1Enabled()) return { ok: false, message: 'Feature disabled' };
    const db = this.prisma as any;
    if (body?.isDefault) {
      await db.savedCommandView.updateMany({
        where: { companyId: user.companyId, userId: user.sub },
        data: { isDefault: false },
      });
    }
    return db.savedCommandView.create({
      data: {
        companyId: user.companyId,
        userId: user.sub,
        name: String(body?.name || 'Saved view').slice(0, 80),
        filtersJson: body?.filters || {},
        isDefault: Boolean(body?.isDefault),
      },
    });
  }

  @Patch('views/:id')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async updateView(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name?: string; filters?: Record<string, any>; isDefault?: boolean },
  ) {
    if (!isCommandCentrePremiumV1Enabled()) return { ok: false, message: 'Feature disabled' };
    const db = this.prisma as any;
    const existing = await db.savedCommandView.findFirst({ where: { id, companyId: user.companyId, userId: user.sub } });
    if (!existing) return { ok: false, message: 'View not found' };
    if (body?.isDefault) {
      await db.savedCommandView.updateMany({
        where: { companyId: user.companyId, userId: user.sub },
        data: { isDefault: false },
      });
    }
    return db.savedCommandView.update({
      where: { id },
      data: {
        name: body?.name ? String(body.name).slice(0, 80) : undefined,
        filtersJson: body?.filters ?? undefined,
        isDefault: body?.isDefault ?? undefined,
      },
    });
  }

  @Delete('views/:id')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async deleteView(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    if (!isCommandCentrePremiumV1Enabled()) return { ok: false, message: 'Feature disabled' };
    const db = this.prisma as any;
    const existing = await db.savedCommandView.findFirst({ where: { id, companyId: user.companyId, userId: user.sub } });
    if (!existing) return { ok: false, message: 'View not found' };
    await db.savedCommandView.delete({ where: { id } });
    return { ok: true };
  }
}
