import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { requireAnalyticsV1Enabled } from '../common/feature-flags';
import { assertPermission } from '../common/permissions';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { AnalyticsService } from './analytics.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  private getWindowDays(windowDays?: string, fallback = 30) {
    const raw = Number(windowDays || fallback);
    if (Number.isNaN(raw)) {
      throw new BadRequestException('windowDays must be a number');
    }
    return Math.max(7, Math.min(90, Math.floor(raw)));
  }

  @Get('executive')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async getExecutive(@CurrentUser() user: JwtPayload, @Query('windowDays') windowDays?: string, @Query('locationId') locationId?: string) {
    requireAnalyticsV1Enabled();
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'analytics.executive' });
    return this.analytics.getExecutive(user.companyId, this.getWindowDays(windowDays), locationId);
  }

  @Get('operations')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async getOperations(@CurrentUser() user: JwtPayload, @Query('windowDays') windowDays?: string, @Query('locationId') locationId?: string) {
    requireAnalyticsV1Enabled();
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'analytics.operations' });
    return this.analytics.getOperations(user.companyId, this.getWindowDays(windowDays), locationId);
  }

  @Get('revenue')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF')
  async getRevenue(@CurrentUser() user: JwtPayload, @Query('windowDays') windowDays?: string, @Query('locationId') locationId?: string) {
    requireAnalyticsV1Enabled();
    await assertPermission({ user, permission: 'billing.manage', action: 'analytics.revenue' });
    return this.analytics.getRevenue(user.companyId, this.getWindowDays(windowDays), locationId);
  }

  @Get('customers')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async getCustomers(
    @CurrentUser() user: JwtPayload,
    @Query('windowDays') windowDays?: string,
    @Query('customerId') customerId?: string,
    @Query('locationId') locationId?: string,
  ) {
    requireAnalyticsV1Enabled();
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'analytics.customers' });
    return this.analytics.getCustomers(user.companyId, this.getWindowDays(windowDays), customerId, locationId);
  }

  @Get('capacity')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async getCapacity(@CurrentUser() user: JwtPayload, @Query('windowDays') windowDays?: string, @Query('locationId') locationId?: string) {
    requireAnalyticsV1Enabled();
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'analytics.capacity' });
    return this.analytics.getCapacityAnalytics(user.companyId, this.getWindowDays(windowDays, 7), locationId);
  }

  @Get('benchmarks')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async getBenchmarks(@CurrentUser() user: JwtPayload, @Query('windowDays') windowDays?: string, @Query('locationId') locationId?: string) {
    requireAnalyticsV1Enabled();
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'analytics.benchmarks' });
    return this.analytics.getBenchmarks(user.companyId, this.getWindowDays(windowDays), locationId);
  }

  @Get('ops-insights')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async getOpsInsights(@CurrentUser() user: JwtPayload, @Query('windowDays') windowDays?: string) {
    requireAnalyticsV1Enabled();
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'analytics.ops_insights' });
    const clamped = Math.max(1, Math.min(30, Math.floor(Number(windowDays || 7))));
    if (Number.isNaN(clamped)) {
      throw new BadRequestException('windowDays must be a number');
    }
    return this.analytics.getOpsInsights(user.companyId, clamped);
  }

  @Get('utilization')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async getUtilization(@CurrentUser() user: JwtPayload, @Query('windowDays') windowDays?: string) {
    requireAnalyticsV1Enabled();
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'analytics.utilization' });
    const clamped = Math.max(1, Math.min(30, Math.floor(Number(windowDays || 7))));
    if (Number.isNaN(clamped)) {
      throw new BadRequestException('windowDays must be a number');
    }
    return this.analytics.getUtilization(user.companyId, clamped);
  }

  @Get('cashflow')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async getCashflow(@CurrentUser() user: JwtPayload, @Query('windowDays') windowDays?: string) {
    requireAnalyticsV1Enabled();
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'analytics.cashflow' });
    const clamped = Math.max(1, Math.min(30, Math.floor(Number(windowDays || 7))));
    if (Number.isNaN(clamped)) {
      throw new BadRequestException('windowDays must be a number');
    }
    return this.analytics.getCashflow(user.companyId, clamped);
  }

  @Get('funnel')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async getFunnel(@CurrentUser() user: JwtPayload, @Query('windowDays') windowDays?: string) {
    requireAnalyticsV1Enabled();
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'analytics.funnel' });
    const clamped = Math.max(1, Math.min(30, Math.floor(Number(windowDays || 7))));
    if (Number.isNaN(clamped)) {
      throw new BadRequestException('windowDays must be a number');
    }
    return this.analytics.getFunnel(user.companyId, clamped);
  }
}
