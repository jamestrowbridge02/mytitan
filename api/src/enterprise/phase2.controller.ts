import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { assertPermission } from '../common/permissions';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { Phase2Service } from './phase2.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('enterprise/phase-2')
export class Phase2Controller {
  constructor(private readonly phase2: Phase2Service) {}

  @Get('overview')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF', 'READ_ONLY')
  async overview(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase2.overview' });
    return this.phase2.getOverview(user.companyId, user.sub);
  }

  @Get('integrations')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF', 'READ_ONLY')
  async integrations(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase2.integrations' });
    return (await this.phase2.getOverview(user.companyId, user.sub)).integrations;
  }

  @Get('offline-field')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async offlineField(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'technician.execute', action: 'phase2.offline_field' });
    return (await this.phase2.getOverview(user.companyId, user.sub)).offlineFieldService;
  }

  @Get('reports')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF', 'READ_ONLY')
  async reports(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase2.reports' });
    return (await this.phase2.getOverview(user.companyId, user.sub)).reportBuilder;
  }

  @Get('reports/:report.csv')
  @Roles('OWNER', 'ADMIN', 'FINANCE')
  async exportReport(@CurrentUser() user: JwtPayload, @Param('report') report: string, @Res() res: Response) {
    await assertPermission({ user, permission: 'billing.manage', action: 'phase2.report.export' });
    const result = await this.phase2.exportReportCsv(user.companyId, user.sub, report);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.csv);
  }

  @Get('technician-mobile')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async technicianMobile(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'technician.execute', action: 'phase2.technician_mobile' });
    return (await this.phase2.getOverview(user.companyId, user.sub)).technicianMobile;
  }

  @Get('ai-readiness')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async aiReadiness(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase2.ai_readiness' });
    return (await this.phase2.getOverview(user.companyId, user.sub)).aiReadiness;
  }

  @Get('multi-location')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async multiLocation(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase2.multi_location' });
    return (await this.phase2.getOverview(user.companyId, user.sub)).multiLocation;
  }

  @Get('white-label')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async whiteLabel(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase2.white_label' });
    return (await this.phase2.getOverview(user.companyId, user.sub)).whiteLabel;
  }

  @Get('growth')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async growth(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase2.growth' });
    return (await this.phase2.getOverview(user.companyId, user.sub)).customerAcquisition;
  }

  @Get('accreditation')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF', 'READ_ONLY')
  async accreditation(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase2.accreditation' });
    return (await this.phase2.getOverview(user.companyId, user.sub)).accreditation;
  }
}
