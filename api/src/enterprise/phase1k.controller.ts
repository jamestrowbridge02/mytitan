import { Body, Controller, Get, Param, Post, Put, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { assertPermission } from '../common/permissions';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { Phase1KService } from './phase1k.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('enterprise/phase-1k')
export class Phase1KController {
  constructor(private readonly phase1k: Phase1KService) {}

  @Get('audit')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async audit(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase1k.audit' });
    return this.phase1k.getAudit(user.companyId);
  }

  @Get('accounting')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF', 'READ_ONLY')
  async accounting(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase1k.accounting.readiness' });
    return this.phase1k.getAccountingReadiness(user.companyId, user.sub);
  }

  @Post('accounting/:provider/dry-run-export')
  @Roles('OWNER', 'ADMIN', 'FINANCE')
  async accountingDryRun(@CurrentUser() user: JwtPayload, @Param('provider') provider: string, @Body() body: any) {
    await assertPermission({ user, permission: 'billing.manage', action: 'phase1k.accounting.dry_run_export' });
    return this.phase1k.queueAccountingDryRun(user.companyId, user.sub, provider, body || {});
  }

  @Post('accounting/:provider/live-sync')
  @Roles('OWNER', 'ADMIN', 'FINANCE')
  async accountingLiveSync(@CurrentUser() user: JwtPayload, @Param('provider') provider: string, @Body() body: any) {
    await assertPermission({ user, permission: 'billing.manage', action: 'phase1n.accounting.live_sync_bridge' });
    return this.phase1k.queueAccountingLiveSync(user.companyId, user.sub, provider, body || {});
  }

  @Get('calendar')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async calendar(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase1k.calendar.readiness' });
    return this.phase1k.getCalendarReadiness(user.companyId);
  }

  @Get('sync/control-room')
  @Roles('OWNER', 'ADMIN', 'FINANCE')
  async syncControlRoom(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'settings.manage', action: 'phase4e.sync.control_room' });
    return this.phase1k.getSyncControlRoom(user.companyId, user.sub);
  }

  @Post('calendar/:provider/export')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'EXTERNAL_OPERATOR')
  async calendarExport(@CurrentUser() user: JwtPayload, @Param('provider') provider: string, @Body() body: any) {
    await assertPermission({ user, permission: 'settings.manage', action: 'phase1k.calendar.export' });
    return this.phase1k.queueCalendarExport(user.companyId, user.sub, provider, body || {});
  }

  @Get('offline/packet')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'EXTERNAL_OPERATOR')
  async offlinePacket(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'technician.execute', action: 'phase1k.offline.packet' });
    return this.phase1k.getOfflinePacket(user.companyId, user.sub);
  }

  @Post('offline/sync')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async offlineSync(@CurrentUser() user: JwtPayload, @Body() body: any) {
    await assertPermission({ user, permission: 'technician.execute', action: 'phase1k.offline.sync' });
    return this.phase1k.syncOfflineMutations(user.companyId, user.sub, body || {});
  }

  @Get('workflow-engine')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async workflowEngine(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase4f.workflow_engine' });
    return this.phase1k.getWorkflowAutomationEngine(user.companyId);
  }

  @Get('uploads/readiness')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF', 'READ_ONLY')
  uploads() {
    return this.phase1k.getUploadReadiness();
  }

  @Get('reports/widgets')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async widgets(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase1k.widgets' });
    return this.phase1k.getKpiWidgets(user.companyId, user.sub);
  }

  @Put('reports/widgets')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async saveWidgets(@CurrentUser() user: JwtPayload, @Body() body: any) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase1k.widgets.save' });
    return this.phase1k.saveWidgetConfig(user.companyId, user.sub, body?.widgets);
  }

  @Get('client-comms')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async clientComms(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase1k.client_comms.readiness' });
    return this.phase1k.getClientCommsReadiness(user.companyId);
  }

  @Post('client-comms/queue')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async queueComms(@CurrentUser() user: JwtPayload, @Body() body: any) {
    await assertPermission({ user, permission: 'technician.execute', action: 'phase1k.client_comms.queue' });
    return this.phase1k.queueClientComm(user.companyId, user.sub, body || {});
  }

  @Get('walkthroughs')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF', 'READ_ONLY')
  walkthroughs(@CurrentUser() user: JwtPayload) {
    return this.phase1k.getWalkthroughs(user.companyId, user);
  }

  @Put('walkthroughs')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF')
  saveWalkthroughs(@CurrentUser() user: JwtPayload, @Body() body: any) {
    return this.phase1k.saveWalkthroughs(user.companyId, user, body || {});
  }

  @Get('roles/technician-surface')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  technicianSurface() {
    return this.phase1k.getTechnicianSurface();
  }

  @Get('exports/:type.csv')
  @Roles('OWNER', 'ADMIN', 'FINANCE')
  async exportCsv(@CurrentUser() user: JwtPayload, @Param('type') type: string, @Res() res: Response) {
    await assertPermission({ user, permission: 'billing.manage', action: 'phase1k.export.csv' });
    const result = await this.phase1k.exportCsv(user.companyId, user.sub, type);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
    return res.send(result.csv);
  }
}
