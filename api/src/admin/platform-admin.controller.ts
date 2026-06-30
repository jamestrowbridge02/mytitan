import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { PricingAdjustmentDto, TrialOverrideDto } from '../billing/billing.dto';
import { assertPlatformAdminAccess } from '../common/platform-admin';
import { buildAppUrl } from '../common/public-url';
import { EmailService } from '../email/email.service';
import { EnterpriseFeatureFlagsService } from '../enterprise/enterprise-feature-flags.service';
import { isEnterpriseFeatureFlagKey } from '../enterprise/enterprise-feature-flags';
import { PrismaService } from '../prisma/prisma.service';
import { TemplatesService } from '../templates/templates.service';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformBillingStripeConfigService } from '../platform-config/platform-billing-stripe-config.service';
import { PlatformPaymentProviderConfigService } from '../platform-config/platform-payment-provider-config.service';
import { PlatformAutopilotService } from './platform-autopilot.service';

function maskEmailForPlatform(email: string) {
  const normalized = String(email || '').trim().toLowerCase();
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return 'invalid';
  return `${local.slice(0, 2)}**@${domain.slice(0, 2)}****${domain.slice(-2)}`;
}

@UseGuards(JwtAuthGuard)
@Controller('admin/platform')
export class PlatformAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly platformAdmin: PlatformAdminService,
    private readonly email: EmailService,
    private readonly templates: TemplatesService,
    private readonly enterpriseFlags: EnterpriseFeatureFlagsService,
    private readonly billingStripeConfig: PlatformBillingStripeConfigService,
    private readonly paymentProviderConfig: PlatformPaymentProviderConfigService,
    private readonly autopilot: PlatformAutopilotService,
  ) {}

  private async assertAccess(user: JwtPayload, req: Request & { requestId?: string }, action: string) {
    const requestId = String(req.requestId || req.headers['x-request-id'] || '').trim() || undefined;
    await assertPlatformAdminAccess({ user, audit: this.audit, requestId, action });
  }

  private sanitizeSupportSession(session: any) {
    if (!session) return null;
    const now = Date.now();
    const expiresAt = new Date(session.expiresAt);
    const endedAt = session.endedAt ? new Date(session.endedAt) : null;
    const active = !endedAt && expiresAt.getTime() > now;
    return {
      id: session.id,
      tenantId: session.tenantId,
      reason: session.reason,
      viewRole: session.viewRole || 'owner',
      accessMode: session.accessMode || 'read_only',
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      endedAt: session.endedAt || null,
      active,
      expired: !endedAt && expiresAt.getTime() <= now,
      secondsRemaining: active ? Math.max(0, Math.floor((expiresAt.getTime() - now) / 1000)) : 0,
    };
  }

  private async getActiveSupportSession(tenantId: string, userId: string) {
    const db = this.prisma as any;
    const session = await db.platformSupportSession.findFirst({
      where: {
        tenantId,
        platformUserId: userId,
        endedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: 'desc' },
    });
    return session || null;
  }

  private async assertActiveSupportSession(tenantId: string, user: JwtPayload, action: string) {
    const session = await this.getActiveSupportSession(tenantId, user.sub);
    if (!session) {
      await this.audit.log(tenantId, 'support_mode.access_denied', `Support-mode access denied for ${action}: no active timed session`, user.sub);
      throw new ForbiddenException('Start support mode with a reason before accessing tenant data.');
    }
    return session;
  }

  @Get('tenants')
  async tenantLookup(
    @CurrentUser() user: JwtPayload,
    @Query('q') q: string | undefined,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.tenants.lookup');
    const query = String(q || '').trim();
    if (query.length < 2) {
      return { ok: true, query, results: [] as any[] };
    }

    const db = this.prisma as any;
    const results = await db.company.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          {
            users: {
              some: {
                role: 'OWNER',
                email: { contains: query, mode: 'insensitive' },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        timezone: true,
        currency: true,
        users: {
          where: { role: 'OWNER' },
          select: { email: true },
          take: 1,
        },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    return {
      ok: true,
      query,
      results: results.map((company: any) => ({
        id: company.id,
        name: company.name,
        createdAt: company.createdAt,
        timezone: company.timezone,
        currency: company.currency,
        ownerEmail: company.users?.[0]?.email || null,
      })),
    };
  }

  @Get('tenants/:tenantId')
  async tenantDetail(
    @CurrentUser() user: JwtPayload,
    @Param('tenantId') tenantId: string,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.tenants.read');
    const supportSession = await this.assertActiveSupportSession(tenantId, user, 'platform.tenants.read');
    const db = this.prisma as any;
    const company = await db.company.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, timezone: true, currency: true, createdAt: true },
    });
    if (!company) {
      return { ok: false, error: 'TENANT_NOT_FOUND' };
    }

    const owner = await db.user.findFirst({
      where: { companyId: tenantId, role: 'OWNER' },
      select: { id: true, email: true, emailVerified: true, createdAt: true, lastLoginAt: true, lastActiveAt: true },
    });
    const settings = await db.tenantSetting.findUnique({
      where: { tenantId },
      select: {
        tenantId: true,
        planId: true,
        planBillingInterval: true,
        defaultCurrency: true,
        bookingsEnabled: true,
        accountingEnabled: true,
        paymentsEnabled: true,
        aiEnabled: true,
      },
    });
    const billing = await this.billing.getBillingInfo(tenantId, { syncTrialLifecycleEmails: false });
    const pricing = await this.billing.getPricingState(tenantId);
    const jobAllowanceControl = await this.billing.getTenantJobAllowanceControl(tenantId);
    const commercialControl = await this.billing.getTenantCommercialControl(tenantId);
    const operations = await this.platformAdmin.getTenantOperationalSummary(tenantId);
    const nextAction =
      !owner?.emailVerified
        ? 'Verify the workspace owner before billing or approval support.'
        : !operations.email.canSend
          ? 'Restore outbound email readiness before asking the team to resend customer updates.'
          : settings?.paymentsEnabled && !pricing.stripeConfigured
            ? 'Stripe is not ready for this workspace yet, so payment collection stays blocked.'
            : billing.trial?.status === 'expired'
              ? 'The trial window has expired. Review conversion or extension options with the workspace owner.'
              : billing.subscription?.cancelAtPeriodEnd
                ? 'Renewal is queued to stop at period end. Confirm the retention path with the workspace.'
                : 'No urgent support action is outstanding right now.';
    return {
      ok: true,
      company,
      owner,
      settings,
      billing,
      jobAllowanceControl,
      commercialControl,
      pricingState: pricing.pricingState,
      operations,
      support: {
        ownerEmailVerified: Boolean(owner?.emailVerified),
        ownerLastLoginAt: owner?.lastLoginAt || null,
        ownerLastActiveAt: owner?.lastActiveAt || null,
        paymentsEnabled: Boolean(settings?.paymentsEnabled),
        stripeConfigured: pricing.stripeConfigured,
        nextAction,
        supportMode: this.sanitizeSupportSession(supportSession),
      },
      links: {
        customerBilling: buildAppUrl('/dashboard/billing'),
        customerSettings: buildAppUrl('/dashboard/settings'),
      },
    };
  }

  @Get('tenants/:tenantId/360')
  async tenant360(
    @CurrentUser() user: JwtPayload,
    @Param('tenantId') tenantId: string,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.tenant_360.read');
    return this.platformAdmin.getTenant360(tenantId);
  }

  @Get('tenants/:tenantId/support-mode')
  async supportModeStatus(
    @CurrentUser() user: JwtPayload,
    @Param('tenantId') tenantId: string,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.support_mode.status');
    const session = await this.getActiveSupportSession(tenantId, user.sub);
    return { ok: true, session: this.sanitizeSupportSession(session) };
  }

  @Post('tenants/:tenantId/support-mode')
  async startSupportMode(
    @CurrentUser() user: JwtPayload,
    @Param('tenantId') tenantId: string,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.support_mode.start');
    const reason = String(body?.reason || '').trim();
    if (reason.length < 8) {
      throw new BadRequestException('A specific support reason is required.');
    }
    const requestedSeconds = body?.durationSeconds === undefined ? null : Math.max(1, Math.min(7200, Number(body.durationSeconds || 0)));
    const requestedMinutes = Math.max(5, Math.min(120, Number(body?.durationMinutes || 30)));
    const viewRole = ['owner', 'admin', 'operator', 'finance', 'customer_portal'].includes(String(body?.viewRole || 'owner'))
      ? String(body?.viewRole || 'owner')
      : 'owner';
    const accessMode = body?.accessMode === 'write' ? 'write' : 'read_only';
    if (accessMode === 'write' && reason.length < 12) {
      throw new BadRequestException('Write-mode support requires a specific reason.');
    }
    const db = this.prisma as any;
    const tenant = await db.company.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
    if (!tenant) throw new BadRequestException('Tenant not found');
    await db.platformSupportSession.updateMany({
      where: { tenantId, platformUserId: user.sub, endedAt: null },
      data: { endedAt: new Date() },
    });
    const session = await db.platformSupportSession.create({
      data: {
        tenantId,
        platformUserId: user.sub,
        reason: reason.slice(0, 500),
        viewRole,
        accessMode,
        expiresAt: new Date(Date.now() + (requestedSeconds || requestedMinutes * 60) * 1000),
      },
    });
    await this.audit.log(
      tenantId,
      'support_mode.started',
      `Support mode started for ${tenant.name}. Before=null After=${JSON.stringify({ viewRole, accessMode, expiresAt: session.expiresAt })} Reason=${reason.slice(0, 180)}`,
      user.sub,
    );
    return { ok: true, session: this.sanitizeSupportSession(session) };
  }

  @Delete('tenants/:tenantId/support-mode')
  async exitSupportMode(
    @CurrentUser() user: JwtPayload,
    @Param('tenantId') tenantId: string,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.support_mode.exit');
    const db = this.prisma as any;
    const session = await this.getActiveSupportSession(tenantId, user.sub);
    if (!session) return { ok: true, session: null, exited: false };
    const updated = await db.platformSupportSession.update({
      where: { id: session.id },
      data: { endedAt: new Date() },
    });
    await this.audit.log(tenantId, 'support_mode.ended', 'Support mode exited explicitly', user.sub);
    return { ok: true, session: this.sanitizeSupportSession(updated), exited: true };
  }

  @Get('overview')
  async overview(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.overview.read');
    const overview = await this.platformAdmin.getControlCentreOverview();
    return { ok: true, ...overview };
  }

  @Get('company-os')
  async companyOperatingSystem(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.company_os.read');
    return { ok: true, ...(await this.platformAdmin.getCompanyOperatingSystem()) };
  }

  @Post('company-os/incidents')
  async createCompanyIncident(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.company_os.incident.create');
    const result = await this.platformAdmin.createCompanyIncident({
      severity: body?.severity,
      affectedService: body?.affectedService,
      affectedTenant: body?.affectedTenant,
      owner: body?.owner,
      summary: body?.summary,
      customerImpact: body?.customerImpact,
      timelineEvent: body?.timelineEvent,
      preventionAction: body?.preventionAction,
      actorUserId: user.sub,
    });
    await this.audit.log(user.companyId, 'platform.company_os.incident_created', `Company OS incident created: ${result.incident.id}`, user.sub);
    return result;
  }

  @Get('enterprise-flags')
  async enterpriseFlagsOverview(
    @CurrentUser() user: JwtPayload,
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.enterprise_flags.read');
    return {
      ok: true,
      ...(await this.enterpriseFlags.listForTenant(tenantId || null, user.sub)),
    };
  }

  @Post('enterprise-flags')
  async upsertEnterpriseFlag(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.enterprise_flags.update');
    const key = String(body?.key || '').trim();
    if (!isEnterpriseFeatureFlagKey(key)) {
      return { ok: false, error: 'UNKNOWN_ENTERPRISE_FLAG' };
    }
    const updated = await this.enterpriseFlags.upsertOverride({
      key,
      tenantId: body?.tenantId ? String(body.tenantId) : null,
      environment: body?.environment ? String(body.environment) : 'all',
      enabled: Boolean(body?.enabled),
      rolloutPercentage: body?.rolloutPercentage === undefined ? undefined : Number(body.rolloutPercentage),
      reason: body?.reason ? String(body.reason).slice(0, 500) : null,
      actorUserId: user.sub,
    });
    return {
      ok: true,
      flag: {
        key: updated.key,
        tenantId: updated.tenantId || null,
        environment: updated.environment,
        enabled: updated.enabled,
        rolloutPercentage: updated.rolloutPercentage,
        reason: updated.reason || null,
        updatedAt: updated.updatedAt,
      },
    };
  }

  @Get('memberships')
  async memberships(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.memberships.read');
    const directory = await this.billing.getPlatformMembershipDirectory();
    return { ok: true, ...directory };
  }

  @Get('revenue')
  async revenue(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.revenue.read');
    const dashboard = await this.billing.getPlatformRevenueDashboard();
    return { ok: true, ...dashboard };
  }

  @Get('templates')
  async templateQueue(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.templates.read');
    return { ok: true, ...(await this.templates.getAdminTemplateQueue()) };
  }

  @Patch('templates/:templateId')
  async reviewTemplate(
    @CurrentUser() user: JwtPayload,
    @Param('templateId') templateId: string,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.templates.review');
    return this.templates.reviewTemplate(templateId, user.sub, body || {});
  }

  @Get('billing-catalog')
  async billingCatalog(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.billing_catalog.read');
    return { ok: true, ...(await this.billing.getPlatformBillingCatalogOverview()) };
  }

  @Get('platform-configuration/payment-providers')
  async paymentProviderConfiguration(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.payment_provider_config.read');
    const [connect, billingStripe, billing, lastOnboardingAttempt] = await Promise.all([
      this.paymentProviderConfig.getSafeStatus(),
      this.billingStripeConfig.getSafeStatus(),
      this.billing.getPlatformRevenueDashboard(),
      this.billing.getLatestStripeConnectOnboardingAttempt(),
    ]);
    return {
      ok: true,
      myTitanBillingStripe: {
        ...billingStripe,
        configured: billing.stripeAlignment.stripeConfigured,
        backendKeyType: billing.stripeAlignment.backendKeyType,
        webhookConfigured: billing.stripeAlignment.webhookSecretConfigured,
        priceVerification: {
          configuredPriceEnvNames: billing.stripeAlignment.configuredPriceEnvNames,
          missingConfigNames: billing.stripeAlignment.missingConfigNames,
        },
        purpose: 'MyTitan subscriptions, job packs, and platform billing only',
        secretsReturned: false,
      },
      stripeConnect: {
        ...connect,
        purpose: 'Tenant customer deposits, invoices, final balances, and refunds only',
        lastOnboardingAttempt,
      },
      secretsReturned: false,
    };
  }

  @Patch('platform-configuration/payment-providers/mytitan-billing-stripe')
  async saveMyTitanBillingStripeConfiguration(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.billing_stripe_config.update');
    return {
      ok: true,
      myTitanBillingStripe: await this.billingStripeConfig.save({
        billingSecret: body?.billingSecret,
        webhookSecret: body?.webhookSecret,
        mode: body?.mode,
        confirmation: body?.confirmation === true,
        actorCompanyId: user.companyId,
        actorUserId: user.sub,
      }),
    };
  }

  @Post('platform-configuration/payment-providers/mytitan-billing-stripe/verify')
  async verifyMyTitanBillingStripeConfiguration(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.billing_stripe_config.verify');
    return {
      ok: true,
      myTitanBillingStripe: await this.billingStripeConfig.verify({
        actorCompanyId: user.companyId,
        actorUserId: user.sub,
      }),
    };
  }

  @Post('platform-configuration/payment-providers/mytitan-billing-stripe/reload')
  async reloadMyTitanBillingStripeConfiguration(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.billing_stripe_config.reload');
    return {
      ok: true,
      myTitanBillingStripe: await this.billingStripeConfig.reloadRuntime({
        actorCompanyId: user.companyId,
        actorUserId: user.sub,
      }),
    };
  }

  @Delete('platform-configuration/payment-providers/mytitan-billing-stripe')
  async deleteMyTitanBillingStripeConfiguration(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.billing_stripe_config.delete');
    return {
      ok: true,
      myTitanBillingStripe: await this.billingStripeConfig.remove({
        confirmation: body?.confirmation === true,
        actorCompanyId: user.companyId,
        actorUserId: user.sub,
      }),
    };
  }

  @Post('platform-configuration/payment-providers/mytitan-billing-stripe/verify-subscription-prices')
  async verifyMyTitanBillingStripeSubscriptionPrices(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.billing_stripe_config.verify_subscription_prices');
    const readiness = await this.billing.verifySubscriptionPricing({});
    await this.audit.log(user.companyId, 'platform.billing_stripe_config.verify_subscription_prices', `Subscription price verification completed. Status=${readiness.status}`, user.sub);
    return { ok: true, readiness, secretsReturned: false };
  }

  @Post('platform-configuration/payment-providers/mytitan-billing-stripe/sync-job-packs')
  async syncMyTitanBillingStripeJobPacks(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.billing_stripe_config.sync_job_packs');
    const snapshot = await this.billing.verifyAllJobCompletionPacksDryRun(user.companyId, user.sub);
    await this.audit.log(user.companyId, 'platform.billing_stripe_config.sync_job_packs', `Job-pack catalog validation completed. Status=${snapshot.status}`, user.sub);
    return { ok: true, snapshot, secretsReturned: false };
  }

  @Get('autopilot')
  async autopilotControlCentre(
    @CurrentUser() user: JwtPayload,
    @Query('force') force: string | undefined,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.autopilot.read');
    return {
      ok: true,
      ...(await this.autopilot.getControlCentre({ force: force === '1' || force === 'true' })),
      validation: await this.autopilot.readValidationEvidence(),
    };
  }

  @Post('autopilot/actions')
  async runAutopilotAction(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.autopilot.repair');
    return this.autopilot.runSafeAction({
      action: String(body?.action || '').trim(),
      confirmation: body?.confirmation === true,
      actorCompanyId: user.companyId,
      actorUserId: user.sub,
    });
  }

  @Post('autopilot/sentinels/run')
  async runAutopilotSentinels(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.autopilot.sentinels.run');
    return {
      ok: true,
      ...(await this.autopilot.runSentinels({ persist: true, force: true })),
    };
  }

  @Patch('autopilot/alerts/:alertId')
  async updateAutopilotAlert(
    @CurrentUser() user: JwtPayload,
    @Param('alertId') alertId: string,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.autopilot.alert.update');
    return this.autopilot.updateAlertLifecycle({
      alertId,
      action: body?.action,
      reason: body?.reason,
      snoozedUntil: body?.snoozedUntil,
      confirmation: body?.confirmation,
      actorCompanyId: user.companyId,
      actorUserId: user.sub,
    });
  }

  @Post('autopilot/alerts')
  async createAutopilotAlert(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.autopilot.alert.create');
    return this.autopilot.createPlatformAlert({
      severity: body?.severity === 'critical' ? 'critical' : 'warning',
      summary: body?.summary,
      detail: body?.detail,
      owner: body?.owner,
      nextAction: body?.nextAction,
      affectedRef: body?.affectedRef,
      reason: body?.reason,
      confirmation: body?.confirmation,
      actorCompanyId: user.companyId,
      actorUserId: user.sub,
    });
  }

  @Patch('platform-configuration/payment-providers/stripe-connect')
  async saveStripeConnectConfiguration(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.payment_provider_config.update');
    const requestId = String(req.requestId || req.headers['x-request-id'] || '').trim() || 'unknown';
    const normalizeCredentialLength = (value: any) => String(value || '').replace(/[\s\u200B-\u200D\uFEFF]+/g, '').trim().length;
    const receivedPlatformSecretLength = normalizeCredentialLength(body?.platformSecret);
    const receivedWebhookSecretLength = normalizeCredentialLength(body?.webhookSecret);
    try {
      return {
        ok: true,
        stripeConnect: await this.paymentProviderConfig.save({
          platformSecret: body?.platformSecret,
          webhookSecret: body?.webhookSecret,
          mode: body?.mode,
          confirmation: body?.confirmation === true,
          actorCompanyId: user.companyId,
          actorUserId: user.sub,
        }),
        requestId,
        receivedPlatformSecretLength,
        receivedWebhookSecretLength,
      };
    } catch (error: any) {
      const errorResponse = typeof error?.getResponse === 'function' ? error.getResponse() : null;
      const responseMessage =
        errorResponse && typeof errorResponse === 'object' && 'message' in errorResponse
          ? (errorResponse as any).message
          : null;
      const reason = String(responseMessage || error?.message || 'Stripe Connect configuration save failed').slice(0, 300);
      const safeValidation =
        errorResponse && typeof errorResponse === 'object'
          ? {
              platformSecretValidation: (errorResponse as any).platformSecretValidation || null,
              webhookSecretValidation: (errorResponse as any).webhookSecretValidation || null,
            }
          : {
              platformSecretValidation: null,
              webhookSecretValidation: null,
            };
      await this.audit.log(
        user.companyId,
        'platform.payment_provider_config.save_failed',
        `Stripe Connect configuration save failed. RequestId=${requestId} PlatformSecretLength=${receivedPlatformSecretLength} WebhookSecretLength=${receivedWebhookSecretLength} Reason=${reason} Validation=${JSON.stringify(safeValidation)}`,
        user.sub,
      );
      if (error instanceof BadRequestException) {
        throw new BadRequestException({
          message: reason,
          requestId,
          receivedPlatformSecretLength,
          receivedWebhookSecretLength,
          ...safeValidation,
        });
      }
      throw error;
    }
  }

  @Post('platform-configuration/payment-providers/stripe-connect/verify')
  async verifyStripeConnectConfiguration(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.payment_provider_config.verify');
    return {
      ok: true,
      stripeConnect: await this.paymentProviderConfig.verify({
        actorCompanyId: user.companyId,
        actorUserId: user.sub,
      }),
    };
  }

  @Post('platform-configuration/payment-providers/stripe-connect/reload')
  async reloadStripeConnectConfiguration(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.payment_provider_config.reload');
    return {
      ok: true,
      stripeConnect: await this.paymentProviderConfig.reloadRuntime({
        actorCompanyId: user.companyId,
        actorUserId: user.sub,
      }),
    };
  }

  @Post('platform-configuration/payment-providers/stripe-connect/preflight')
  async preflightStripeConnectConfiguration(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.payment_provider_config.preflight');
    return this.paymentProviderConfig.onboardingPreflight({
      actorCompanyId: user.companyId,
      actorUserId: user.sub,
    });
  }

  @Delete('platform-configuration/payment-providers/stripe-connect')
  async deleteStripeConnectConfiguration(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.payment_provider_config.delete');
    return {
      ok: true,
      stripeConnect: await this.paymentProviderConfig.remove({
        confirmation: body?.confirmation === true,
        actorCompanyId: user.companyId,
        actorUserId: user.sub,
      }),
    };
  }

  @Post('billing-catalog')
  async saveBillingCatalog(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.billing_catalog.write');
    return this.billing.upsertPlatformBillingCatalogOverride(user.companyId, user.sub, body || {});
  }

  @Post('billing-catalog/verify-job-packs')
  async verifyJobPackCatalog(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.billing_catalog.write');
    return this.billing.verifyAllJobCompletionPacksDryRun(user.companyId, user.sub);
  }

  @Post('billing-catalog/:overrideKey/rollback')
  async rollbackBillingCatalog(
    @CurrentUser() user: JwtPayload,
    @Param('overrideKey') overrideKey: string,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.billing_catalog.write');
    return this.billing.rollbackPlatformBillingCatalogOverride(user.companyId, user.sub, decodeURIComponent(overrideKey), body || {});
  }

  @Get('billing-catalog/:overrideKey/reveal')
  async revealBillingCatalog(
    @CurrentUser() user: JwtPayload,
    @Param('overrideKey') overrideKey: string,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.billing_catalog.reveal');
    return this.billing.revealPlatformBillingCatalogOverride(decodeURIComponent(overrideKey), user.companyId, user.sub);
  }

  @Get('error-logs')
  async errorLogs(
    @CurrentUser() user: JwtPayload,
    @Query('category') category: string | undefined,
    @Query('status') status: string | undefined,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.error_logs.read');
    return { ok: true, ...(await this.platformAdmin.listSafeErrorLogs({ category, status })) };
  }

  @Patch('error-logs/:logId')
  async updateErrorLog(
    @CurrentUser() user: JwtPayload,
    @Param('logId') logId: string,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.error_logs.update');
    return this.platformAdmin.updateSafeErrorLogStatus(logId, user.companyId, user.sub, body?.action);
  }

  @Post('error-logs/clear-reviewed')
  async clearReviewedErrorLogs(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.error_logs.clear_reviewed');
    return this.platformAdmin.clearReviewedSafeErrorLogs(user.companyId, user.sub);
  }

  @Post('error-logs/clear-validation')
  async clearValidationErrorLogs(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.error_logs.clear_validation');
    return this.platformAdmin.clearValidationSafeErrorLogs(user.companyId, user.sub);
  }

  @Get('error-logs/export')
  async exportErrorLogs(
    @CurrentUser() user: JwtPayload,
    @Query('category') category: string | undefined,
    @Query('status') status: string | undefined,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.error_logs.export');
    return this.platformAdmin.exportSafeErrorLogSummary({ category, status });
  }

  @Get('email-control')
  async emailControl(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.email_control.read');
    return { ok: true, ...(await this.email.getPlatformEmailSafetyOverview()) };
  }

  @Patch('email-control/provider')
  async saveEmailProviderConfig(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.email_provider_config.write');
    const config = await this.email.savePlatformEmailProviderConfig({
      ...(body || {}),
      actorUserId: user.sub,
    });
    await this.audit.log(user.companyId, 'platform.email_provider_config.save', `Platform email provider configuration saved. Source=${config.source}`, user.sub);
    return { ok: true, config, secretsReturned: false };
  }

  @Post('email-control/provider/verify')
  async verifyEmailProviderConfig(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.email_provider_config.verify');
    const result = await this.email.verifyPlatformEmailProviderConfig({ actorUserId: user.sub });
    await this.audit.log(user.companyId, 'platform.email_provider_config.verify', `Platform email provider verification completed. Status=${result.readiness.status}`, user.sub);
    return { ok: true, ...result, secretsReturned: false };
  }

  @Patch('email-control')
  async updateEmailControl(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.email_control.write');
    return this.email.updatePlatformEmailControl({
      action: body?.action === 'pause' ? 'pause' : 'resume',
      reason: body?.reason,
      userId: user.sub,
    });
  }

  @Get('infrastructure/external-monitor')
  async externalMonitorConfiguration(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.infrastructure.external_monitor.read');
    return { ok: true, monitor: await this.platformAdmin.getExternalMonitorConfiguration() };
  }

  @Patch('infrastructure/external-monitor')
  async saveExternalMonitorConfiguration(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.infrastructure.external_monitor.write');
    const monitor = await this.platformAdmin.saveExternalMonitorConfiguration({ ...(body || {}), actorUserId: user.sub });
    await this.audit.log(user.companyId, 'platform.external_monitor_config.save', `External monitor configuration saved. Status=${monitor.status}`, user.sub);
    return { ok: true, monitor };
  }

  @Post('infrastructure/external-monitor/verify')
  async verifyExternalMonitorConfiguration(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.infrastructure.external_monitor.verify');
    const monitor = await this.platformAdmin.verifyExternalMonitorConfiguration({ actorUserId: user.sub, manualReason: body?.reason });
    await this.audit.log(user.companyId, 'platform.external_monitor_config.verify', `External monitor verification checked. Status=${monitor.status}`, user.sub);
    return { ok: true, monitor };
  }

  @Post('email-control/test-email')
  async sendEmailControlTest(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.email_control.test_email');
    const to = String(body?.to || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      throw new BadRequestException('A real operator-controlled recipient email is required.');
    }
    if (/\.(test|example|invalid|localhost)$/i.test(to) || to.endsWith('@mytitan.local')) {
      throw new BadRequestException('Use a real routable inbox for the platform email test.');
    }
    const readiness = await this.email.getReadiness(null, { ownership: 'system', probe: true });
    if (readiness.status !== 'ready' || readiness.transport !== 'smtp' || !readiness.canSend) {
      return {
        ok: false,
        status: 'not_ready',
        recipientMasked: maskEmailForPlatform(to),
        readiness: {
          status: readiness.status,
          transport: readiness.transport,
          source: readiness.source,
          canSend: readiness.canSend,
          guidance: readiness.guidance,
        },
      };
    }
    const result = await this.email.sendSystemOperationalEmail(
      {
        to,
        subject: 'MyTitan public launch email delivery test',
        text: 'MyTitan public launch email delivery test.\nThis message verifies the configured system email provider can send real mail.',
      },
      {
        category: 'public_launch_email_test',
        templateKey: 'public_launch_email_test',
        actorUserId: user.sub,
        dedupeWindowMinutes: 0,
        bypassDuplicateSuppression: true,
      },
    );
    await this.audit.log(user.companyId, 'platform.email_control.test_email', `Platform email test ${result.status} to ${maskEmailForPlatform(to)}`, user.sub);
    return {
      ok: Boolean(result.delivered && result.status === 'sent'),
      status: result.status,
      delivered: Boolean(result.delivered),
      recipientMasked: maskEmailForPlatform(to),
      senderOwnership: result.senderOwnership || 'system',
    };
  }

  @Post('tenants/:tenantId/pricing-adjustment')
  async applyPricingAdjustment(
    @CurrentUser() user: JwtPayload,
    @Param('tenantId') tenantId: string,
    @Body() dto: PricingAdjustmentDto,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.pricing_adjustment.apply');
    return this.billing.upsertPricingAdjustment(tenantId, user.sub, dto);
  }

  @Get('tenants/:tenantId/job-allowance')
  async getTenantJobAllowance(
    @CurrentUser() user: JwtPayload,
    @Param('tenantId') tenantId: string,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.job_allowance.read');
    return this.billing.getTenantJobAllowanceControl(tenantId);
  }

  @Get('tenants/:tenantId/commercial-controls')
  async getTenantCommercialControls(
    @CurrentUser() user: JwtPayload,
    @Param('tenantId') tenantId: string,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.tenant_commercial.read');
    return this.billing.getTenantCommercialControl(tenantId);
  }

  @Patch('tenants/:tenantId/commercial-controls')
  async updateTenantCommercialControls(
    @CurrentUser() user: JwtPayload,
    @Param('tenantId') tenantId: string,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.tenant_commercial.update');
    return this.billing.updateTenantCommercialControl(tenantId, user.sub, body || {});
  }

  @Patch('tenants/:tenantId/job-allowance')
  async updateTenantJobAllowance(
    @CurrentUser() user: JwtPayload,
    @Param('tenantId') tenantId: string,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.job_allowance.update');
    return this.billing.updateTenantJobAllowanceControl(tenantId, user.sub, body || {});
  }

  @Patch('tenants/:tenantId/pricing-adjustment')
  async updatePricingAdjustment(
    @CurrentUser() user: JwtPayload,
    @Param('tenantId') tenantId: string,
    @Body() dto: PricingAdjustmentDto,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.pricing_adjustment.update');
    return this.billing.upsertPricingAdjustment(tenantId, user.sub, dto);
  }

  @Delete('tenants/:tenantId/pricing-adjustment')
  async removePricingAdjustment(
    @CurrentUser() user: JwtPayload,
    @Param('tenantId') tenantId: string,
    @Body() body: Record<string, any>,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.pricing_adjustment.remove');
    return this.billing.removePricingAdjustment(tenantId, user.sub, body || {});
  }

  @Patch('tenants/:tenantId/trial')
  async updateTrial(
    @CurrentUser() user: JwtPayload,
    @Param('tenantId') tenantId: string,
    @Body() dto: TrialOverrideDto,
    @Req() req: Request & { requestId?: string },
  ) {
    await this.assertAccess(user, req, 'platform.trial.update');
    return this.billing.updateTrialState(tenantId, user.sub, dto);
  }
}
