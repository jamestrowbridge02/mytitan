import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { assertPermission } from '../common/permissions';
import { isMarketplaceEnabled } from '../common/feature-flags';
import { MetricsService } from './metrics.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('overview')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  overview(@CurrentUser() user: JwtPayload) {
    if (!isMarketplaceEnabled()) {
      return {
        jobsCreatedThisMonth: 0,
        bookingsNext7Days: 0,
        outstandingInvoices: { count: 0, totalCents: 0 },
        revenueThisMonth: 0,
        aiUsageThisMonth: { requests: 0, tokens: 0 },
        storageUsageBytes: null,
      };
    }
    return this.metrics.getOverview(user.companyId);
  }

  @Get('intelligence')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async intelligence(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'metrics.intelligence' });
    if (!isMarketplaceEnabled()) {
      return {
        jobsByStatus: [],
        technicianLoad: [],
        technicianThroughput: [],
        summary: {
          upcomingBookingsNext7Days: 0,
          publicBookingsAwaitingConversion: 0,
          communicationsLast7Days: 0,
          activityEventsLast7Days: 0,
          customersNeedingFollowUp: 0,
          billingReadyJobs: 0,
          portalReadyJobs: 0,
          bookingsConvertedLast7Days: 0,
          agedUnlinkedBookings: 0,
          technicianCompletionQueue: 0,
          portalLinksExpiringSoon: 0,
          overdueInvoices: 0,
          dueServicePlans: 0,
          overduePlanRuns: 0,
          overloadedTechnicianDays: 0,
          unassignedDueWorkPressure: 0,
        },
        attentionQueue: [],
        alerts: [],
        trends: {
          completedLast7Days: 0,
          completedPrevious7Days: 0,
          completionDelta: 0,
          communicationByDay: [],
        },
      };
    }
    return this.metrics.getIntelligence(user.companyId);
  }
}
