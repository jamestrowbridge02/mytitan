import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { requireAnalyticsV1Enabled } from '../common/feature-flags';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { AnalyticsService } from './analytics.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('ops-insights')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  getOpsInsights(@CurrentUser() user: JwtPayload, @Query('windowDays') windowDays?: string) {
    requireAnalyticsV1Enabled();
    const raw = Number(windowDays || 7);
    if (Number.isNaN(raw)) {
      throw new BadRequestException('windowDays must be a number');
    }
    const clamped = Math.max(1, Math.min(30, Math.floor(raw)));
    return this.analytics.getOpsInsights(user.companyId, clamped);
  }

  @Get('utilization')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  getUtilization(@CurrentUser() user: JwtPayload, @Query('windowDays') windowDays?: string) {
    requireAnalyticsV1Enabled();
    const raw = Number(windowDays || 7);
    if (Number.isNaN(raw)) {
      throw new BadRequestException('windowDays must be a number');
    }
    const clamped = Math.max(1, Math.min(30, Math.floor(raw)));
    return this.analytics.getUtilization(user.companyId, clamped);
  }

  @Get('cashflow')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  getCashflow(@CurrentUser() user: JwtPayload, @Query('windowDays') windowDays?: string) {
    requireAnalyticsV1Enabled();
    const raw = Number(windowDays || 7);
    if (Number.isNaN(raw)) {
      throw new BadRequestException('windowDays must be a number');
    }
    const clamped = Math.max(1, Math.min(30, Math.floor(raw)));
    return this.analytics.getCashflow(user.companyId, clamped);
  }

  @Get('funnel')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  getFunnel(@CurrentUser() user: JwtPayload, @Query('windowDays') windowDays?: string) {
    requireAnalyticsV1Enabled();
    const raw = Number(windowDays || 7);
    if (Number.isNaN(raw)) {
      throw new BadRequestException('windowDays must be a number');
    }
    const clamped = Math.max(1, Math.min(30, Math.floor(raw)));
    return this.analytics.getFunnel(user.companyId, clamped);
  }
}
