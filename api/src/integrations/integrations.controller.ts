import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpException, HttpStatus, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { assertPermission } from '../common/permissions';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { isAuthSecurityV1Enabled, isMarketplaceEnabled, requireMarketplaceEnabled } from '../common/feature-flags';
import { buildAppUrl } from '../common/public-url';
import { PrismaService } from '../prisma/prisma.service';
import { ApiTokenAuthGuard } from './api-token-auth.guard';
import { IntegrationOrchestrationService } from './integration-orchestration.service';
import { IntegrationPlatformService } from './integration-platform.service';
import { IntegrationsService } from './integrations.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly platform: IntegrationPlatformService,
    private readonly orchestration: IntegrationOrchestrationService,
    private readonly prisma: PrismaService,
  ) {}

  private async assertEmailVerified(user: JwtPayload) {
    if (!isAuthSecurityV1Enabled()) return;
    if (user.demoUser || user.email === '@mytitan.co.uk') return;
    const db = this.prisma as any;
    const fullUser = await db.user.findFirst({ where: { id: user.sub, companyId: user.companyId } });
    if (!fullUser?.emailVerified) {
      throw new ForbiddenException('Please verify your email before connecting integrations.');
    }
  }

  @Get('xero/status')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  statusXero(@CurrentUser() user: JwtPayload) {
    if (!isMarketplaceEnabled()) {
      return { provider: 'XERO', connected: false, allowed: false, enabled: false };
    }
    return this.integrations.getStatus(user.companyId, 'XERO');
  }

  @Post('xero/connect')
  @Roles('OWNER', 'ADMIN')
  async connectXero(@CurrentUser() user: JwtPayload) {
    requireMarketplaceEnabled();
    await this.assertEmailVerified(user);
    return this.integrations.createAuthUrl(user.companyId, 'XERO');
  }

  @Post('xero/disconnect')
  @Roles('OWNER', 'ADMIN')
  disconnectXero(@CurrentUser() user: JwtPayload) {
    requireMarketplaceEnabled();
    return this.integrations.disconnect(user.companyId, 'XERO');
  }

  @Get('xero/organisations')
  @Roles('OWNER', 'ADMIN')
  listXeroOrganisations(@CurrentUser() user: JwtPayload) {
    requireMarketplaceEnabled();
    return this.integrations.listXeroOrganisations(user.companyId, user.sub);
  }

  @Post('xero/organisations/select')
  @Roles('OWNER', 'ADMIN')
  selectXeroOrganisation(@CurrentUser() user: JwtPayload, @Body() body: Record<string, any>) {
    requireMarketplaceEnabled();
    return this.integrations.selectXeroOrganisation(user.companyId, user.sub, String(body?.selectionId || ''));
  }

  @Post('xero/check')
  @Roles('OWNER', 'ADMIN')
  checkXero(@CurrentUser() user: JwtPayload) {
    requireMarketplaceEnabled();
    return this.integrations.checkConnectionHealth(user.companyId, 'XERO', user.sub);
  }

  @Post('xero/sync')
  @Roles('OWNER', 'ADMIN')
  syncXero(@CurrentUser() user: JwtPayload) {
    return this.integrations.queueAccountingSyncCheck(user.companyId, user.sub, 'XERO');
  }

  @Get('qbo/status')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  statusQbo(@CurrentUser() user: JwtPayload) {
    if (!isMarketplaceEnabled()) {
      return { provider: 'QBO', connected: false, allowed: false, enabled: false };
    }
    return this.integrations.getStatus(user.companyId, 'QBO');
  }

  @Post('qbo/connect')
  @Roles('OWNER', 'ADMIN')
  async connectQbo(@CurrentUser() user: JwtPayload) {
    requireMarketplaceEnabled();
    await this.assertEmailVerified(user);
    return this.integrations.createAuthUrl(user.companyId, 'QBO');
  }

  @Post('qbo/disconnect')
  @Roles('OWNER', 'ADMIN')
  disconnectQbo(@CurrentUser() user: JwtPayload) {
    requireMarketplaceEnabled();
    return this.integrations.disconnect(user.companyId, 'QBO');
  }

  @Post('qbo/check')
  @Roles('OWNER', 'ADMIN')
  checkQbo(@CurrentUser() user: JwtPayload) {
    requireMarketplaceEnabled();
    return this.integrations.checkConnectionHealth(user.companyId, 'QBO', user.sub);
  }

  @Post('qbo/sync')
  @Roles('OWNER', 'ADMIN')
  syncQbo(@CurrentUser() user: JwtPayload) {
    return this.integrations.queueAccountingSyncCheck(user.companyId, user.sub, 'QUICKBOOKS');
  }

  @Get('google/status')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  statusGoogle(@CurrentUser() user: JwtPayload) {
    if (!isMarketplaceEnabled()) {
      return { provider: 'GOOGLE_CALENDAR', connected: false, allowed: false, enabled: false };
    }
    return this.integrations.getStatus(user.companyId, 'GOOGLE_CALENDAR', user.sub);
  }

  @Get('ops')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  ops(@CurrentUser() user: JwtPayload) {
    if (!isMarketplaceEnabled()) {
      return { summary: { connected: 0, ready: 0, blocked: 3 }, providers: [] };
    }
    return this.integrations.getOpsOverview(user.companyId);
  }

  @Get('rollout-monitoring')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  rolloutMonitoring(@CurrentUser() user: JwtPayload) {
    if (!isMarketplaceEnabled()) {
      return {
        windowDays: 7,
        counts: {
          personalIntegrationSaveFailures: 0,
          workspaceIntegrationSaveFailures: 0,
          encryptionReadinessFailures: 0,
          crossScopeAccessAttempts: 0,
          providerSetupErrors: 0,
        },
        latestAt: null,
      };
    }
    return this.integrations.getRolloutMonitoring(user.companyId);
  }

  @Get('health')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async health(@CurrentUser() user: JwtPayload) {
    return this.platform.getAdminHealth(user.companyId);
  }

  @Post('google/connect')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async connectGoogle(@CurrentUser() user: JwtPayload) {
    requireMarketplaceEnabled();
    await this.assertEmailVerified(user);
    return this.integrations.createAuthUrl(user.companyId, 'GOOGLE_CALENDAR', user.sub);
  }

  @Post('google/disconnect')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  disconnectGoogle(@CurrentUser() user: JwtPayload) {
    requireMarketplaceEnabled();
    return this.integrations.disconnect(user.companyId, 'GOOGLE_CALENDAR', user.sub);
  }

  @Post('google/sync')
  @Roles('OWNER', 'ADMIN')
  syncGoogle() {
    throw new HttpException('Google Calendar sync not implemented yet.', HttpStatus.NOT_IMPLEMENTED);
  }

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async listWorkspaceModules(@CurrentUser() user: JwtPayload) {
    return this.platform.listWorkspaceModules(user.companyId);
  }

  @Get('personal')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async listPersonalModules(@CurrentUser() user: JwtPayload) {
    return this.platform.listPersonalModules(user.companyId, user.sub);
  }

  @Get('byog')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async listByog(@CurrentUser() user: JwtPayload) {
    return this.integrations.listByogConnections(user.companyId, user.sub, user.role);
  }

  @Get('orchestration-map')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async orchestrationMap(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'integrations.orchestration_map.view' });
    return this.orchestration.getOrchestrationMap(user.companyId, user.sub, user.role);
  }

  @Post('orchestration/:provider/verify')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async verifyOrchestrationConnection(
    @CurrentUser() user: JwtPayload,
    @Param('provider') provider: string,
    @Query('scope') scope?: string,
  ) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.orchestration.verify' });
    return this.orchestration.verifyConnection(user.companyId, user.sub, provider, scope);
  }

  @Post('orchestration/:provider/test-webhook')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async testOrchestrationWebhook(
    @CurrentUser() user: JwtPayload,
    @Param('provider') provider: string,
    @Query('scope') scope?: string,
  ) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.orchestration.test_webhook' });
    return this.orchestration.testWebhookSafely(user.companyId, user.sub, provider, scope);
  }

  @Get('orchestration/:provider/failed-events')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async reviewOrchestrationFailedEvents(
    @CurrentUser() user: JwtPayload,
    @Param('provider') provider: string,
    @Query('scope') scope?: string,
  ) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.orchestration.failed_events' });
    return this.orchestration.listFailedEvents(user.companyId, user.sub, provider, scope);
  }

  @Get('orchestration/:provider/last-successful-update')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async orchestrationLastSuccessfulUpdate(
    @CurrentUser() user: JwtPayload,
    @Param('provider') provider: string,
    @Query('scope') scope?: string,
  ) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.orchestration.last_successful_update' });
    return this.orchestration.getLastSuccessfulUpdate(user.companyId, user.sub, provider, scope);
  }

  @Get('byog/:provider')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async getByog(
    @CurrentUser() user: JwtPayload,
    @Param('provider') provider: string,
    @Query('scope') scope?: string,
  ) {
    return this.integrations.getByogConnection(user.companyId, user.sub, user.role, provider, scope);
  }

  @Put('byog/:provider')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async saveByog(
    @CurrentUser() user: JwtPayload,
    @Param('provider') provider: string,
    @Body() body: Record<string, any>,
  ) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.byog.save' });
    return this.integrations.upsertByogConnection(user.companyId, user.sub, user.role, provider, body || {});
  }

  @Post('byog/:provider/check')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async checkByog(
    @CurrentUser() user: JwtPayload,
    @Param('provider') provider: string,
    @Query('scope') scope?: string,
  ) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.byog.check' });
    return this.integrations.checkByogConnection(user.companyId, user.sub, user.role, provider, scope);
  }

  @Delete('byog/:provider')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async disconnectByog(
    @CurrentUser() user: JwtPayload,
    @Param('provider') provider: string,
    @Query('scope') scope?: string,
  ) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.byog.disconnect' });
    return this.integrations.disconnectByogConnection(user.companyId, user.sub, user.role, provider, scope);
  }

  @Patch()
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async updateWorkspaceModule(
    @CurrentUser() user: JwtPayload,
    @Body() body: { key?: string; enabled?: boolean },
  ) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.module.update' });
    return this.platform.updateWorkspaceModule(user.companyId, String(body?.key || ''), body?.enabled === true);
  }

  @Get('api-tokens')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async listApiTokens(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.api_tokens.list' });
    return this.platform.listApiTokens(user.companyId);
  }

  @Post('api-tokens')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async createApiToken(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name?: string },
  ) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.api_tokens.create' });
    return this.platform.createApiToken(user.companyId, user.sub, String(body?.name || ''));
  }

  @Post('api-tokens/:id/revoke')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async revokeApiToken(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.api_tokens.revoke' });
    return this.platform.revokeApiToken(user.companyId, user.sub, id);
  }

  @Get('webhooks')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async listWebhooks(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.webhooks.list' });
    return this.platform.listWebhookEndpoints(user.companyId);
  }

  @Post('webhooks')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async createWebhook(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name?: string; url?: string; subscribedEventTypes?: unknown; active?: boolean },
  ) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.webhooks.create' });
    return this.platform.createWebhookEndpoint(user.companyId, user.sub, {
      name: String(body?.name || ''),
      url: String(body?.url || ''),
      subscribedEventTypes: body?.subscribedEventTypes,
      active: body?.active,
    });
  }

  @Patch('webhooks/:id')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async updateWebhook(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name?: string; url?: string; subscribedEventTypes?: unknown; active?: boolean; rotateSecret?: boolean },
  ) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.webhooks.update' });
    return this.platform.updateWebhookEndpoint(user.companyId, user.sub, id, body);
  }

  @Delete('webhooks/:id')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async deleteWebhook(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.webhooks.delete' });
    return this.platform.deleteWebhookEndpoint(user.companyId, user.sub, id);
  }

  @Post('webhooks/:id/test')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async testWebhook(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.webhooks.test' });
    return this.platform.sendTestWebhook(user.companyId, user.sub, id);
  }

  @Get('webhook-deliveries')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async listWebhookDeliveries(
    @CurrentUser() user: JwtPayload,
    @Query('endpointId') endpointId?: string,
    @Query('limit') limit?: string,
  ) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.webhook_deliveries.list' });
    return this.platform.listWebhookDeliveries(user.companyId, {
      endpointId: endpointId || null,
      limit: Number(limit || 25),
    });
  }

  @Post('webhook-deliveries/:id/retry')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async retryWebhookDelivery(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await assertPermission({ user, permission: 'settings.manage', action: 'integrations.webhook_deliveries.retry' });
    return this.platform.retryWebhookDelivery(user.companyId, user.sub, id);
  }
}

@Controller('integrations')
export class IntegrationsCallbackController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('xero/callback')
  async xeroCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    requireMarketplaceEnabled();
    const result = await this.integrations.handleCallback('XERO', code, state);
    res.redirect(
      buildAppUrl(
        result?.organisationSelectionRequired
          ? '/dashboard/settings/integrations/xero?setup=select-organisation'
          : '/dashboard/integrations?connected=xero',
      ),
    );
  }

  @Get('qbo/callback')
  async qboCallback(@Query('code') code: string, @Query('state') state: string, @Query('realmId') realmId: string, @Res() res: Response) {
    requireMarketplaceEnabled();
    await this.integrations.handleCallback('QBO', code, state, realmId);
    res.redirect(buildAppUrl('/dashboard/integrations?connected=qbo'));
  }

  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    requireMarketplaceEnabled();
    await this.integrations.handleCallback('GOOGLE_CALENDAR', code, state);
    res.redirect(buildAppUrl('/dashboard/integrations?connected=google'));
  }
}

@UseGuards(ApiTokenAuthGuard)
@Controller('integrations/platform')
export class IntegrationsPlatformController {
  constructor(private readonly platform: IntegrationPlatformService) {}

  @Get('activity/recent')
  async recentActivity(@Req() req: any, @Query('limit') limit?: string) {
    return this.platform.listRecentPlatformActivity(req.apiToken.tenantId, Number(limit || 20));
  }
}

@Controller('integrations')
export class IntegrationsInboundWebhookController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Post('webhooks/:provider/:routeId')
  @HttpCode(202)
  async receiveWebhook(
    @Param('provider') provider: string,
    @Param('routeId') routeId: string,
    @Req() req: any,
  ) {
    const payload = Buffer.isBuffer(req.body)
      ? req.body
      : req.rawBody ?? Buffer.from(JSON.stringify(req.body || {}), 'utf8');
    return this.integrations.handleInboundWebhook(provider, routeId, payload, req.headers || {});
  }
}
