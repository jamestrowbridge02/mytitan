import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { assertPermission } from '../common/permissions';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { Phase9Service } from './phase9.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('enterprise/phase-9')
export class Phase9Controller {
  constructor(private readonly phase9: Phase9Service) {}

  @Get('assets')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async assets(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase9.assets.list' });
    return this.phase9.listAssets(user.companyId);
  }

  @Post('assets')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async createAsset(@CurrentUser() user: JwtPayload, @Body() body: any) {
    await assertPermission({ user, permission: 'settings.manage', action: 'phase9.assets.create' });
    return this.phase9.createAsset(user.companyId, user.sub, body || {});
  }

  @Post('assets/:id/:action')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async assetAction(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Param('action') action: string, @Body() body: any) {
    await assertPermission({ user, permission: 'technician.execute', action: `phase9.assets.${action}` });
    return this.phase9.updateAssetState(user.companyId, user.sub, id, action, body || {});
  }

  @Get('assets/availability/check')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async availability(@CurrentUser() user: JwtPayload, @Query('template') template?: string) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase9.assets.availability' });
    return this.phase9.assetAvailability(user.companyId, template);
  }

  @Get('approval-policies')
  @Roles('OWNER', 'ADMIN', 'FINANCE')
  async policies(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'billing.manage', action: 'phase9.approvals.list' });
    return this.phase9.listApprovalPolicies(user.companyId);
  }

  @Put('approval-policies')
  @Roles('OWNER', 'ADMIN', 'FINANCE')
  async savePolicy(@CurrentUser() user: JwtPayload, @Body() body: any) {
    await assertPermission({ user, permission: 'billing.manage', action: 'phase9.approvals.policy.save' });
    return this.phase9.saveApprovalPolicy(user.companyId, user.sub, body || {});
  }

  @Post('approval-requests')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF')
  async requestApproval(@CurrentUser() user: JwtPayload, @Body() body: any) {
    await assertPermission({ user, permission: 'billing.manage', action: 'phase9.approvals.request' });
    return this.phase9.requestFinancialApproval(user.companyId, user.sub, user.role, body || {});
  }

  @Post('approval-requests/:id/:decision')
  @Roles('OWNER', 'ADMIN', 'FINANCE')
  async decideApproval(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Param('decision') decision: string, @Body() body: any) {
    await assertPermission({ user, permission: 'billing.manage', action: 'phase9.approvals.decision' });
    return this.phase9.decideFinancialApproval(user.companyId, user.sub, id, decision, body?.note);
  }

  @Post('vehicle-lookup')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async vehicleLookup(@CurrentUser() user: JwtPayload, @Body() body: any) {
    await assertPermission({ user, permission: 'technician.execute', action: 'phase9.vehicle.lookup' });
    return this.phase9.lookupVehicle(user.companyId, user.sub, body?.registration);
  }
}
