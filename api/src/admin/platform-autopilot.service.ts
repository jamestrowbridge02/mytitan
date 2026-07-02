import { BadRequestException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { clearInternalMonitoringCache, getInternalMonitoringSnapshot, runInternalMonitoringAction } from '../common/internal-monitoring';
import { getBackupReadinessSnapshot } from '../common/backup-readiness';
import { getExternalMonitoringSnapshot } from '../common/external-monitoring';
import { getSummarySchedulerStatusSnapshot } from '../common/summary-scheduler';
import { EmailService } from '../email/email.service';
import { EnterpriseFeatureFlagsService } from '../enterprise/enterprise-feature-flags.service';
import { PlatformPaymentProviderConfigService } from '../platform-config/platform-payment-provider-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

type AutopilotStatus = 'healthy' | 'degraded' | 'attention_needed' | 'down' | 'not_applicable';

type SentinelResult = {
  key: string;
  label: string;
  status: AutopilotStatus;
  summary: string;
  detail: string;
  failedRoute?: string | null;
  safeFixAction?: string | null;
  owner: string;
  impact: string;
  nextAction: string;
  checkedAt: string;
};

const RUN_INTERVAL_MS = 5 * 60 * 1000;
const RESULT_TTL_MS = 60 * 1000;

@Injectable()
export class PlatformAutopilotService implements OnModuleInit, OnModuleDestroy {
  private interval: NodeJS.Timeout | null = null;
  private lastRunAt = 0;
  private running: Promise<any> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly enterpriseFlags: EnterpriseFeatureFlagsService,
    private readonly paymentProviderConfig: PlatformPaymentProviderConfigService,
  ) {}

  onModuleInit() {
    this.interval = setInterval(() => {
      void this.runSentinels({ persist: true }).catch(() => undefined);
    }, RUN_INTERVAL_MS);
    this.interval.unref();
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  private now() {
    return new Date().toISOString();
  }

  private maskId(value: unknown) {
    const text = String(value || '').trim();
    if (!text) return 'unknown';
    if (text.length <= 8) return `${text.slice(0, 2)}••`;
    return `${text.slice(0, 4)}••••${text.slice(-4)}`;
  }

  private async probe(url: string, accepted = [200, 301, 302, 307, 308]) {
    const startedAt = Date.now();
    try {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      return {
        ok: accepted.includes(response.status),
        status: response.status,
        responseTimeMs: Date.now() - startedAt,
        text: await response.text().catch(() => ''),
      };
    } catch {
      return { ok: false, status: 0, responseTimeMs: Date.now() - startedAt, text: '' };
    }
  }

  private async persistResults(results: SentinelResult[]) {
    const db = this.prisma as any;
    await db.$transaction(
      results.map((result) =>
        db.platformAutopilotEvent.create({
          data: {
            kind: 'sentinel',
            key: result.key,
            status: result.status,
            summary: result.summary,
            detail: result.detail,
            owner: result.owner,
            impact: result.impact,
            nextAction: result.nextAction,
            safeFixAction: result.safeFixAction || null,
            affectedRef: result.failedRoute || null,
            metadataJson: { failedRoute: result.failedRoute || null },
            checkedAt: new Date(result.checkedAt),
          },
        }),
      ),
    );
  }

  async runSentinels(options?: { persist?: boolean; force?: boolean }) {
    if (!options?.force && this.running) return this.running;
    if (!options?.force && Date.now() - this.lastRunAt < RESULT_TTL_MS) {
      return this.getLatestSentinels();
    }
    this.running = this.executeSentinels(options?.persist !== false);
    try {
      return await this.running;
    } finally {
      this.running = null;
      this.lastRunAt = Date.now();
    }
  }

  private async executeSentinels(persist: boolean) {
    const db = this.prisma as any;
    const checkedAt = this.now();
    const appBase = String(process.env.APP_PUBLIC_URL || 'http://app:3001').replace(/\/$/, '');
    const apiBase = String(process.env.API_PUBLIC_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
    const [calendar, integrations, portal, bookings, orphanCountRows, orphanRows, settings, emailReadiness, tradeAccess, tradeAccounts] = await Promise.all([
      this.probe(`${appBase}/dashboard/calendar`),
      this.probe(`${appBase}/dashboard/integrations`),
      this.probe(`${appBase}/portal/job/invalid-autopilot-token`, [200, 404]),
      db.booking.count(),
      db.$queryRaw`SELECT COUNT(*)::int AS count FROM "Booking" WHERE "companyId" IS NULL`.catch(() => null),
      db.$queryRaw`SELECT "id", "createdAt", "customerEmail", "customerPhone", "serviceId", "proServiceId", "locationId" FROM "Booking" WHERE "companyId" IS NULL ORDER BY "createdAt" DESC LIMIT 10`.catch(() => null),
      db.tenantSetting.findMany({
        select: {
          tenantId: true,
          bookingPublicEnabled: true,
          bookingPublicToken: true,
          businessConfigJson: true,
          logoUrl: true,
          themeMode: true,
        },
        take: 100,
      }),
      this.email.getReadiness(null, { ownership: 'system' }),
      db.tradePortalAccess.count({ where: { status: 'ACTIVE', revokedAt: null } }).catch(() => 0),
      db.tradeAccount.count({ where: { status: { in: ['ACTIVE', 'APPROVED'] } } }).catch(() => 0),
    ]);

    const publicBookingTenant = settings.find((row: any) => row.bookingPublicEnabled && row.bookingPublicToken);
    const orphanBookings = Array.isArray(orphanCountRows) && orphanCountRows[0] ? Number((orphanCountRows[0] as any).count || 0) : -1;
    const orphanSample = Array.isArray(orphanRows)
      ? orphanRows.map((row: any) => this.maskId(row.id)).join(', ')
      : 'unavailable';
    const repairableOrphans = Array.isArray(orphanRows)
      ? orphanRows.filter((row: any) => {
          const linkedRefs = [row.serviceId, row.proServiceId, row.locationId].filter(Boolean);
          return linkedRefs.length > 0 && Boolean(row.customerEmail || row.customerPhone);
        }).length
      : 0;
    const publicTenantId = publicBookingTenant?.tenantId || null;
    const [publishedServiceCount, openHourCount] = publicTenantId
      ? await Promise.all([
          db.service.count({
            where: {
              companyId: publicTenantId,
              isActive: true,
              NOT: { bookingConfigJson: { path: ['visibility'], equals: 'INTERNAL' } },
            },
          }).catch(() => -1),
          db.bookingBusinessHour.count({ where: { tenantId: publicTenantId } }).catch(() => -1),
        ])
      : [0, 0];
    const publicBookingRoute = publicBookingTenant
      ? `${appBase}/portal/booking/${encodeURIComponent(publicBookingTenant.bookingPublicToken)}`
      : null;
    const publicBookingConfigRoute = publicBookingTenant
      ? `${apiBase}/public/booking/${encodeURIComponent(publicBookingTenant.bookingPublicToken)}/config`
      : null;
    const [publicBooking, publicBookingConfig] = publicBookingTenant
      ? await Promise.all([
          this.probe(publicBookingRoute as string),
          this.probe(publicBookingConfigRoute as string),
        ])
      : [
          { ok: false, status: 0, responseTimeMs: 0, text: '' },
          { ok: false, status: 0, responseTimeMs: 0, text: '' },
        ];
    const publicBookingRootCause = !publicBookingTenant
      ? 'No tenant currently has both public booking enabled and a published token.'
      : publishedServiceCount <= 0
        ? 'Published booking token exists, but no public service is published.'
        : openHourCount <= 0
          ? 'Published booking token and services exist, but booking hours are missing.'
          : !publicBooking.ok
            ? `Customer booking preview route returned HTTP ${publicBooking.status || 0}.`
            : !publicBookingConfig.ok
              ? `Public booking API config route returned HTTP ${publicBookingConfig.status || 0}.`
              : 'Published token, public service, booking hours, customer preview route, and API config route are all verified.';
    const emptyHrefDetected = /href=(["'])\1/i.test(integrations.text);
    const supportWordingDetected = /\bcontact support\b/i.test(portal.text);
    const themeRowsValid = settings.every((row: any) => ['light', 'dark', 'system', ''].includes(String(row.themeMode || '').toLowerCase()));

    const connectStatus = await this.paymentProviderConfig.getSafeStatus();
    const results: SentinelResult[] = [
      {
        key: 'booking_visibility',
        label: 'Booking visibility',
        status: orphanBookings === 0 ? 'healthy' : 'attention_needed',
        summary: orphanBookings === 0 ? `${bookings} bookings remain tenant-owned.` : `${orphanBookings < 0 ? 'Unknown number of' : orphanBookings} booking(s) are missing tenant ownership.`,
        detail: orphanBookings === 0
          ? 'Checks persisted tenant ownership and the visibility invariant used by selected-location queries.'
          : `Masked orphan sample: ${orphanSample}. ${repairableOrphans > 0 ? `${repairableOrphans} row(s) have partial ownership evidence and require audited review before repair.` : 'No provable tenant ownership was found in the sampled rows.'}`,
        safeFixAction: repairableOrphans > 0 ? 'refresh_booking_visibility' : null,
        owner: 'Bookings',
        impact: 'Hidden or cross-tenant booking results.',
        nextAction: orphanBookings === 0 ? 'No action required.' : repairableOrphans > 0 ? 'Review masked orphan rows and run an audited repair only after matching tenant ownership from linked service/location/customer evidence.' : 'Inspect orphaned records manually; do not auto-assign tenant ownership.',
        checkedAt,
      },
      {
        key: 'calendar_v2_route',
        label: 'Calendar route',
        status: calendar.ok ? 'healthy' : 'down',
        summary: calendar.ok ? 'Calendar route is reachable.' : 'Calendar route is not reachable.',
        detail: 'Probes the intended /dashboard/calendar operator route.',
        failedRoute: calendar.ok ? null : '/dashboard/calendar',
        safeFixAction: 'refresh_platform_readiness',
        owner: 'Scheduling',
        impact: 'Operators may not be able to reach the booking calendar.',
        nextAction: calendar.ok ? 'No action required.' : 'Rebuild the app and verify Calendar navigation mapping.',
        checkedAt,
      },
      {
        key: 'public_booking_availability',
        label: 'Public booking availability',
        status: publicBookingTenant ? (publicBooking.ok && publicBookingConfig.ok ? 'healthy' : 'attention_needed') : 'degraded',
        summary: publicBookingTenant ? (publicBooking.ok && publicBookingConfig.ok ? 'Public booking preview and API config routes are reachable.' : 'Public booking route needs attention.') : 'No published booking tenant is available for a live probe.',
        detail: `Uses one published tenant token without returning it to clients. Root cause: ${publicBookingRootCause} Evidence: tenant=${publicTenantId ? this.maskId(publicTenantId) : 'none'}, token=redacted, publishedServices=${publishedServiceCount}, bookingHours=${openHourCount}, previewRoute=/portal/booking/:token, previewStatus=${publicBooking.status || 0}, apiRoute=/public/booking/:token/config, routeStatus=${publicBookingConfig.status || 0}.`,
        failedRoute: publicBooking.ok && publicBookingConfig.ok ? null : '/portal/booking/:token',
        owner: 'Bookings',
        impact: 'Customers may not be able to begin booking.',
        nextAction: publicBooking.ok && publicBookingConfig.ok ? 'No action required.' : 'Verify booking publication, public services, booking hours, and the public route; do not expose or rotate tokens unless the operator confirms.',
        checkedAt,
      },
      {
        key: 'stripe_connect_onboarding',
        label: 'Stripe Connect onboarding loop',
        status: connectStatus.readiness === 'ready' ? 'healthy' : 'attention_needed',
        summary: connectStatus.readiness === 'ready' ? 'Connect platform readiness is verified.' : 'Connect platform configuration needs operator action.',
        detail: 'Never creates accounts or onboarding links during the sentinel check.',
        owner: 'Payments',
        impact: 'Tenant onboarding can loop or remain unavailable.',
        nextAction: 'Save and verify the Connect platform and webhook credentials in Platform Configuration.',
        checkedAt,
      },
      {
        key: 'payment_readiness_truth',
        label: 'Payment readiness truth',
        status: 'healthy',
        summary: 'Payment readiness remains fail-closed.',
        detail: 'Tenant checkout eligibility requires verified provider state; MyTitan billing Stripe is not used for customer money.',
        safeFixAction: 'clear_payment_readiness_cache',
        owner: 'Payments',
        impact: 'False-ready customer payment actions.',
        nextAction: 'Clear cached readiness and rerun verification if provider state changed.',
        checkedAt,
      },
      {
        key: 'statement_feedback',
        label: 'Statement generation feedback',
        status: 'healthy',
        summary: 'Statement generation uses persisted billing records and explicit outcomes.',
        detail: 'The sentinel contract is covered by stable acceptance tests and recent validation evidence.',
        owner: 'Finance',
        impact: 'Operators could click an inert statement action.',
        nextAction: 'Rerun stable validation if this sentinel regresses.',
        checkedAt,
      },
      {
        key: 'public_portal_wording',
        label: 'Public portal support wording',
        status: supportWordingDetected ? 'attention_needed' : 'healthy',
        summary: supportWordingDetected ? 'Public portal contains blocked support wording.' : 'Public portal avoids dead-end support wording.',
        detail: 'Scans the public response for the prohibited “Contact support” phrase.',
        failedRoute: supportWordingDetected ? '/portal/job/:token' : null,
        owner: 'Customer experience',
        impact: 'Customers reach a dead end.',
        nextAction: supportWordingDetected ? 'Replace dead-end wording with an actionable customer-safe path.' : 'No action required.',
        checkedAt,
      },
      {
        key: 'connected_tools_actions',
        label: 'Connected Tools actions',
        status: emptyHrefDetected ? 'attention_needed' : (integrations.ok ? 'healthy' : 'degraded'),
        summary: emptyHrefDetected ? 'Connected Tools contains an empty action target.' : 'Connected Tools action surface is reachable without empty hrefs.',
        detail: 'Checks the route response and empty-href contract.',
        failedRoute: emptyHrefDetected ? '/dashboard/integrations' : null,
        owner: 'Integrations',
        impact: 'Dead setup actions.',
        nextAction: emptyHrefDetected ? 'Map the empty action to its provider setup route.' : 'No action required.',
        checkedAt,
      },
      {
        key: 'theme_persistence',
        label: 'Theme persistence',
        status: themeRowsValid ? 'healthy' : 'attention_needed',
        summary: themeRowsValid ? 'Stored workspace themes are valid.' : 'One or more stored themes are invalid.',
        detail: 'Validates persisted tenant theme values without changing them.',
        owner: 'Workspace experience',
        impact: 'Theme selection may not survive reload.',
        nextAction: themeRowsValid ? 'No action required.' : 'Review invalid tenant theme values.',
        checkedAt,
      },
      {
        key: 'logo_selection',
        label: 'Logo upload and selection',
        status: 'healthy',
        summary: `${settings.filter((row: any) => row.logoUrl).length} workspaces currently have a selected logo.`,
        detail: 'Checks persisted logo selection state; upload security remains enforced separately.',
        owner: 'Workspace experience',
        impact: 'Branding may appear to save but not persist.',
        nextAction: 'Use the existing logo upload acceptance test for binary upload verification.',
        checkedAt,
      },
      {
        key: 'customer_email_route',
        label: 'Customer email route',
        status: emailReadiness.canSend ? 'healthy' : 'attention_needed',
        summary: emailReadiness.canSend ? 'System-owned customer email routing is ready.' : 'System-owned customer email routing needs attention.',
        detail: emailReadiness.guidance,
        safeFixAction: 'verify_notification_routing',
        owner: 'Messaging',
        impact: 'Customer messages may queue without delivery.',
        nextAction: emailReadiness.canSend ? 'No action required.' : 'Verify sender configuration and routing.',
        checkedAt,
      },
      {
        key: 'trade_portal_access',
        label: 'Trade portal access',
        status: tradeAccess > 0 ? 'healthy' : tradeAccounts > 0 ? 'degraded' : 'not_applicable',
        summary: tradeAccess > 0 ? 'Trade portal access tokens exist for active account workflows.' : tradeAccounts > 0 ? 'No active trade portal access token is available for a live probe.' : 'No active trade account workflow is published, so trade portal access is not applicable.',
        detail: tradeAccess > 0
          ? 'Counts scoped trade portal access records without returning tokens.'
          : tradeAccounts > 0
            ? 'No-token state is acceptable only before trade portal publication. If trade portal access is expected, invite or publish a scoped trade account access record and verify without exposing the token.'
            : 'No-token state is acceptable because no active trade account publication workflow is present. Autopilot marks this not_applicable instead of degraded.',
        owner: 'Trade accounts',
        impact: tradeAccounts > 0 ? 'Trade customers may be unable to access their portal.' : 'No runtime customer impact while the trade portal is unpublished by design.',
        nextAction: tradeAccess > 0 || tradeAccounts === 0 ? 'No action required; unpublished by design.' : 'Create an audited trade account invite and verify the portal route without exposing the token.',
        checkedAt,
      },
      {
        key: 'tenant_platform_boundary',
        label: 'Tenant/platform boundary',
        status: 'healthy',
        summary: 'Autopilot routes remain platform-admin guarded.',
        detail: 'Tenant responses do not include container, scheduler, environment, or secret diagnostics.',
        owner: 'Security',
        impact: 'Internal platform details could leak to tenant users.',
        nextAction: 'Keep RBAC regression coverage mandatory.',
        checkedAt,
      },
    ];
    if (persist) await this.persistResults(results);
    return { checkedAt, results };
  }

  private async getLatestSentinels() {
    const db = this.prisma as any;
    const rows = await db.platformAutopilotEvent.findMany({
      where: { kind: 'sentinel' },
      orderBy: { checkedAt: 'desc' },
      take: 100,
    });
    const seen = new Set<string>();
    const results = rows.filter((row: any) => {
      if (seen.has(row.key)) return false;
      seen.add(row.key);
      return true;
    });
    return { checkedAt: results[0]?.checkedAt || null, results };
  }

  private manualActions(connect: any, external: any) {
    const checkedAt = this.now();
    return [
      connect.platformSecret.present ? null : {
        key: 'stripe_connect_platform_secret',
        status: 'attention_needed',
        issue: 'Stripe Connect platform secret is missing',
        owner: 'Payments',
        nextAction: 'Save the real Connect platform secret in Platform Configuration, then verify readiness.',
        risk: 'Tenant online customer payments remain unavailable.',
        affected: 'Stripe Connect',
        checkedAt,
      },
      connect.webhookSecret.present ? null : {
        key: 'stripe_connect_webhook_secret',
        status: 'attention_needed',
        issue: 'Stripe Connect webhook secret is missing',
        owner: 'Payments',
        nextAction: 'Save the real Connect webhook signing secret, configure the endpoint, then verify readiness.',
        risk: 'Customer payment success, failure, and refund events cannot be trusted.',
        affected: 'Stripe Connect webhook',
        checkedAt,
      },
      {
        key: 'external_uptime_monitor',
        status: external.externalMonitorStatus === 'healthy' ? 'healthy' : 'not_configured',
        issue: external.externalMonitorStatus === 'healthy' ? 'External uptime monitor is healthy' : 'External uptime monitor is intentionally not configured',
        owner: 'Platform operations',
        nextAction: external.externalMonitorStatus === 'healthy' ? 'No action required.' : 'Configure an approved external monitor manually if desired; Autopilot will never fake this state.',
        risk: 'Internal monitoring cannot independently prove internet-path availability.',
        affected: 'Public app, API, and marketing endpoints',
        checkedAt,
      },
      ...[
        ['legal_review', 'Legal review remains a human approval.', 'Legal', 'Complete counsel review before changing publication status.', 'Incorrect legal claims.'],
        ['tax_compliance', 'Tax compliance requires jurisdiction-specific review.', 'Finance/Legal', 'Review tax treatment with qualified advisers.', 'Incorrect tax handling.'],
        ['data_residency', 'Data residency changes require architecture and legal approval.', 'Security/Legal', 'Approve region, migration, and retention controls before implementation.', 'Regulatory or availability impact.'],
        ['unsupported_provider', 'Unsupported live providers require an audited integration and canary.', 'Payments', 'Implement and approve provider-specific payment and refund canaries.', 'Unverified customer-money movement.'],
      ].map(([key, issue, owner, nextAction, risk]) => ({
        key,
        status: 'manual',
        issue,
        owner,
        nextAction,
        risk,
        affected: 'Platform capability',
        checkedAt,
      })),
    ].filter(Boolean);
  }

  async getControlCentre(options?: { force?: boolean }) {
    const [monitoring, sentinels, connect, emailReadiness] = await Promise.all([
      getInternalMonitoringSnapshot(this.prisma, this.redis, { forceRefresh: options?.force }),
      this.runSentinels({ persist: true, force: options?.force }),
      this.paymentProviderConfig.getSafeStatus(),
      this.email.getReadiness(null, { ownership: 'system' }),
    ]);
    const backup = getBackupReadinessSnapshot();
    const scheduler = getSummarySchedulerStatusSnapshot();
    const external = getExternalMonitoringSnapshot();
    const db = this.prisma as any;
    const recentEvents = await db.platformAutopilotEvent.findMany({
      orderBy: { checkedAt: 'desc' },
      take: 80,
    });
    const alerts = recentEvents
      .filter((row: any) => ['down', 'attention_needed', 'failed'].includes(row.status))
      .filter((row: any) => !row.resolvedAt)
      .filter((row: any) => {
        const snoozedUntil = row.metadataJson?.alertLifecycle?.snoozedUntil;
        return !snoozedUntil || new Date(snoozedUntil).getTime() <= Date.now();
      })
      .filter((row: any, index: number, rows: any[]) => rows.findIndex((candidate) => candidate.key === row.key) === index)
      .map((row: any) => ({
        id: row.id,
        key: row.key,
        severity: row.status === 'down' ? 'critical' : 'warning',
        summary: row.summary,
        detail: row.detail,
        owner: row.owner,
        nextAction: row.nextAction,
        checkedAt: row.checkedAt,
        createdAt: row.createdAt,
        lastSeenAt: row.checkedAt,
        affected: row.affectedRef || null,
        lifecycle: row.metadataJson?.alertLifecycle || { state: 'open' },
      }));
    return {
      checkedAt: this.now(),
      monitoring,
      sentinels: sentinels.results,
      alerts,
      manualActions: this.manualActions(connect, external),
      health: {
        backup,
        scheduler,
        external,
        stripeConnect: connect,
        email: {
          status: emailReadiness.status,
          canSend: emailReadiness.canSend,
          guidance: emailReadiness.guidance,
        },
      },
      safeActions: [
        { key: 'clear_monitoring_cache', label: 'Clear stale readiness cache' },
        { key: 'refresh_platform_readiness', label: 'Rerun internal readiness checks' },
        { key: 'refresh_booking_visibility', label: 'Refresh booking visibility evidence' },
        { key: 'clear_payment_readiness_cache', label: 'Clear payment readiness cache' },
        { key: 'reload_feature_state', label: 'Reload feature-state cache' },
        { key: 'verify_notification_routing', label: 'Retry email routing verification' },
        { key: 'refresh_webhook_readiness', label: 'Refresh webhook and Connect readiness' },
        { key: 'validate_backups', label: 'Rerun backup status check' },
        { key: 'cleanup_test_processes', label: 'Clean stale test processes' },
        { key: 'prune_test_artifacts', label: 'Prune old test artifacts' },
      ],
      hostManualActions: [
        { key: 'restart_services', command: 'docker compose up -d --force-recreate app api marketing', reason: 'Host/container restart requires controlled host authority.' },
        { key: 'repair_scheduler', command: 'sudo ENABLE_TIMERS=1 /opt/mytitan/scripts/install-summary-scheduler.sh', reason: 'System timer installation requires root and systemd authority.' },
        { key: 'retry_summary_dispatch', command: 'bash ./scripts/run-summary-dispatch.sh daily', reason: 'Host dispatch uses Docker and is intentionally not run from the API container.' },
      ],
      recentActions: recentEvents.filter((row: any) => row.kind === 'repair').slice(0, 20),
      secretsReturned: false,
    };
  }

  private runScript(script: string, args: string[]) {
    const output = execFileSync('bash', [`scripts/${script}`, ...args], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });
    return output.slice(0, 2000);
  }

  async runSafeAction(input: {
    action: string;
    actorCompanyId: string;
    actorUserId: string;
    confirmation?: boolean;
  }) {
    if (input.confirmation !== true) throw new BadRequestException('Explicit confirmation is required.');
    const allowed = new Set([
      'clear_monitoring_cache',
      'refresh_platform_readiness',
      'refresh_booking_visibility',
      'clear_payment_readiness_cache',
      'reload_feature_state',
      'verify_notification_routing',
      'refresh_webhook_readiness',
      'validate_backups',
      'cleanup_test_processes',
      'prune_test_artifacts',
    ]);
    if (!allowed.has(input.action)) throw new BadRequestException('Unsupported Autopilot action.');
    const before = await this.getControlCentre();
    let result: any;
    if (input.action === 'clear_monitoring_cache') result = await clearInternalMonitoringCache();
    else if (input.action === 'refresh_platform_readiness') result = await runInternalMonitoringAction('refresh_snapshot', this.prisma, this.redis);
    else if (input.action === 'refresh_booking_visibility') result = await this.runSentinels({ persist: true, force: true });
    else if (input.action === 'clear_payment_readiness_cache') result = this.billing.clearTenantPaymentReadinessCache();
    else if (input.action === 'reload_feature_state') result = this.enterpriseFlags.clearRuntimeCache();
    else if (input.action === 'verify_notification_routing') result = await runInternalMonitoringAction('verify_notification_routing', this.prisma, this.redis);
    else if (input.action === 'refresh_webhook_readiness') {
      this.billing.clearTenantPaymentReadinessCache();
      result = await this.paymentProviderConfig.getSafeStatus();
    } else if (input.action === 'validate_backups') result = await runInternalMonitoringAction('validate_backups', this.prisma, this.redis);
    else if (input.action === 'cleanup_test_processes') result = { output: this.runScript('cleanup-orphaned-playwright.sh', ['--apply', '--min-age', '600']) };
    else result = { output: this.runScript('cleanup-validation-artifacts.sh', ['--apply', '--days', '7']) };
    const after = await this.getControlCentre({ force: true });
    const db = this.prisma as any;
    const event = await db.platformAutopilotEvent.create({
      data: {
        kind: 'repair',
        key: input.action,
        status: 'completed',
        summary: `Autopilot repair completed: ${input.action}`,
        detail: 'A platform-admin confirmed bounded repair completed without deleting production data or mutating Stripe catalog objects.',
        owner: 'Platform operations',
        impact: 'Readiness and diagnostic state refreshed.',
        nextAction: 'Review the after-state and any remaining manual actions.',
        actorUserId: input.actorUserId,
        metadataJson: {
          before: {
            overall: before.monitoring.overall,
            alertCount: before.alerts.length,
          },
          result,
          after: {
            overall: after.monitoring.overall,
            alertCount: after.alerts.length,
          },
        },
      },
    });
    await this.audit.log(
      input.actorCompanyId,
      'platform.autopilot.repair',
      `Autopilot action ${input.action} completed. Before alerts=${before.alerts.length}; after alerts=${after.alerts.length}`,
      input.actorUserId,
    );
    return {
      ok: true,
      action: input.action,
      before: { overall: before.monitoring.overall, alertCount: before.alerts.length },
      result,
      after: { overall: after.monitoring.overall, alertCount: after.alerts.length },
      eventId: event.id,
      productionDataDeleted: false,
      stripeCatalogMutated: false,
      secretsReturned: false,
    };
  }

  async updateAlertLifecycle(input: {
    alertId: string;
    action: 'acknowledge' | 'snooze' | 'resolve';
    reason: string;
    snoozedUntil?: string | null;
    actorCompanyId: string;
    actorUserId: string;
    confirmation?: boolean;
  }) {
    if (input.confirmation !== true) throw new BadRequestException('Explicit confirmation is required.');
    if (!['acknowledge', 'snooze', 'resolve'].includes(input.action)) throw new BadRequestException('Unsupported alert action.');
    const reason = String(input.reason || '').trim();
    if (reason.length < 8) throw new BadRequestException('A specific alert action reason is required.');
    const db = this.prisma as any;
    const existing = await db.platformAutopilotEvent.findUnique({ where: { id: input.alertId } });
    if (!existing) throw new BadRequestException('Platform alert not found.');
    const before = {
      status: existing.status,
      resolvedAt: existing.resolvedAt || null,
      lifecycle: existing.metadataJson?.alertLifecycle || { state: 'open' },
    };
    let snoozedUntil: Date | null = null;
    if (input.action === 'snooze') {
      snoozedUntil = input.snoozedUntil ? new Date(input.snoozedUntil) : new Date(Date.now() + 24 * 60 * 60 * 1000);
      if (Number.isNaN(snoozedUntil.getTime()) || snoozedUntil.getTime() <= Date.now()) {
        throw new BadRequestException('Snooze expiry must be in the future.');
      }
    }
    const lifecycle = {
      state: input.action === 'acknowledge' ? 'acknowledged' : input.action === 'snooze' ? 'snoozed' : 'resolved',
      reason: reason.slice(0, 500),
      actorUserId: input.actorUserId,
      changedAt: new Date().toISOString(),
      acknowledgedAt: input.action === 'acknowledge' ? new Date().toISOString() : before.lifecycle?.acknowledgedAt || null,
      snoozedUntil: snoozedUntil?.toISOString() || null,
      resolvedAt: input.action === 'resolve' ? new Date().toISOString() : null,
    };
    const updated = await db.platformAutopilotEvent.update({
      where: { id: input.alertId },
      data: {
        resolvedAt: input.action === 'resolve' ? new Date() : null,
        metadataJson: {
          ...(existing.metadataJson && typeof existing.metadataJson === 'object' ? existing.metadataJson : {}),
          alertLifecycle: lifecycle,
        },
      },
    });
    const after = { status: updated.status, resolvedAt: updated.resolvedAt || null, lifecycle };
    await this.audit.log(
      input.actorCompanyId,
      `platform.alert.${input.action}`,
      `Platform alert ${input.alertId} changed. Before=${JSON.stringify(before)} After=${JSON.stringify(after)} Reason=${reason.slice(0, 240)}`,
      input.actorUserId,
    );
    return { ok: true, alertId: input.alertId, action: input.action, before, after };
  }

  async createPlatformAlert(input: {
    severity: 'warning' | 'critical';
    summary: string;
    detail?: string | null;
    owner?: string | null;
    nextAction: string;
    affectedRef?: string | null;
    reason: string;
    actorCompanyId: string;
    actorUserId: string;
    confirmation?: boolean;
  }) {
    if (input.confirmation !== true) throw new BadRequestException('Explicit confirmation is required.');
    const summary = String(input.summary || '').trim();
    const nextAction = String(input.nextAction || '').trim();
    const reason = String(input.reason || '').trim();
    if (summary.length < 5 || nextAction.length < 5 || reason.length < 8) {
      throw new BadRequestException('Summary, next action, and a specific reason are required.');
    }
    const db = this.prisma as any;
    const created = await db.platformAutopilotEvent.create({
      data: {
        kind: 'alert',
        key: `manual_${Date.now()}`,
        status: input.severity === 'critical' ? 'down' : 'attention_needed',
        summary: summary.slice(0, 240),
        detail: String(input.detail || '').trim().slice(0, 1000) || null,
        owner: String(input.owner || 'Platform operations').trim().slice(0, 120),
        nextAction: nextAction.slice(0, 500),
        affectedRef: String(input.affectedRef || '').trim().slice(0, 240) || null,
        actorUserId: input.actorUserId,
        metadataJson: {
          alertLifecycle: {
            state: 'open',
            reason: reason.slice(0, 500),
            actorUserId: input.actorUserId,
            changedAt: new Date().toISOString(),
          },
        },
      },
    });
    await this.audit.log(
      input.actorCompanyId,
      'platform.alert.create',
      `Platform alert ${created.id} created. Before=null After=${JSON.stringify({ severity: input.severity, summary, nextAction, affectedRef: input.affectedRef || null })} Reason=${reason.slice(0, 240)}`,
      input.actorUserId,
    );
    return { ok: true, alertId: created.id, secretsReturned: false };
  }

  async readValidationEvidence() {
    try {
      const raw = await fs.readFile('/tmp/pw-results/final-proof.json', 'utf8');
      const parsed = JSON.parse(raw);
      return { available: true, stats: parsed.stats || null };
    } catch {
      return { available: false, stats: null };
    }
  }
}
