import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
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
}
