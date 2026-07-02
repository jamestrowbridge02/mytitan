import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import * as net from 'net';
import * as path from 'path';
import * as tls from 'tls';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { getBackupReadinessSnapshot } from './backup-readiness';
import { getExternalMonitoringSnapshot } from './external-monitoring';
import { getSummarySchedulerStatusSnapshot } from './summary-scheduler';

type InternalMonitoringState = 'healthy' | 'degraded' | 'attention_needed' | 'down';
type ResponseTimeBand = 'fast' | 'steady' | 'slow' | 'unknown';
type AvailabilityRole = 'runtime_required' | 'operational_readiness' | 'optional_external';

type InternalMonitoringServiceSnapshot = {
  key: string;
  label: string;
  state: InternalMonitoringState;
  summary: string;
  detail: string;
  checkedAt: string;
  lastSuccessfulCheckAt: string | null;
  responseTimeMs: number | null;
  responseTimeBand: ResponseTimeBand;
  recentStates: InternalMonitoringState[];
  availabilityRatio: number;
  availabilityPercentage: number;
  availabilityLabel: string;
  availabilityRole: AvailabilityRole;
  degradedMinutes: number;
  lastRecoveredAt: string | null;
  lastStableAt: string | null;
  evidence?: Record<string, unknown>;
};

type InternalMonitoringIncident = {
  key: string;
  label: string;
  state: InternalMonitoringState;
  phase: 'Investigating' | 'Recovered' | 'Resolved';
  summary: string;
  occurredAt: string;
  resolvedAt?: string | null;
  durationMinutes?: number | null;
};

type InternalMonitoringCacheFile = {
  checkedAt: string;
  services: Array<{
    key: string;
    label: string;
    summary: string;
    detail: string;
    state: InternalMonitoringState;
    lastSuccessfulCheckAt: string | null;
    responseTimeMs: number | null;
    availabilityRole?: AvailabilityRole;
    evidence?: Record<string, unknown>;
  }>;
  recentSnapshots: Array<{
    checkedAt: string;
    services: Array<{ key: string; state: InternalMonitoringState }>;
  }>;
  incidents: InternalMonitoringIncident[];
};

export type InternalMonitoringSnapshot = {
  checkedAt: string;
  cached: boolean;
  refreshIntervalSeconds: number;
  overall: {
    state: InternalMonitoringState;
    score: number;
    label: 'Healthy' | 'Degraded' | 'Attention needed' | 'Down';
    summary: string;
    healthyCount: number;
    degradedCount: number;
    attentionCount: number;
    downCount: number;
    availabilityPercentage: number;
    calculation: {
      numerator: number;
      denominator: number;
      requiredKeys: string[];
      excludedKeys: string[];
      summary: string;
    };
    averageResponseBand: string;
    lastRecoveryAt: string | null;
  };
  services: InternalMonitoringServiceSnapshot[];
  incidents: InternalMonitoringIncident[];
  historyWindow: {
    sampleCount: number;
    maxSamples: number;
    hoursCovered: number;
    summary: string;
  };
  runtimeFreshness: {
    bootedAt: string;
    uptimeMinutes: number;
    summary: string;
  };
  externalMonitoring: {
    status: string | null;
    summary: string;
  };
};

export type InternalMonitoringAction =
  | 'refresh_snapshot'
  | 'run_health_check'
  | 'verify_notification_routing'
  | 'check_billing_readiness'
  | 'validate_backups';

export type InternalMonitoringActionResult = {
  action: InternalMonitoringAction;
  checkedAt: string;
  label: string;
  state: InternalMonitoringState;
  summary: string;
  detail: string;
  snapshot?: InternalMonitoringSnapshot;
};

const CACHE_FILE = '/tmp/mytitan-internal-monitoring-cache.json';
const CACHE_TTL_MS = 90_000;
const MAX_HISTORY_SNAPSHOTS = 960;
const MAX_INCIDENTS = 20;

function toIsoNow() {
  return new Date().toISOString();
}

function responseTimeBandFromMs(value: number | null | undefined): ResponseTimeBand {
  if (!Number.isFinite(value as number) || Number(value) <= 0) return 'unknown';
  if (Number(value) < 300) return 'fast';
  if (Number(value) < 1000) return 'steady';
  return 'slow';
}

function monitoringLabel(state: InternalMonitoringState) {
  if (state === 'healthy') return 'Healthy';
  if (state === 'degraded') return 'Degraded';
  if (state === 'attention_needed') return 'Attention needed';
  return 'Down';
}

function summarizeAvailability(recentStates: InternalMonitoringState[]) {
  if (!recentStates.length) return { ratio: 0, label: 'No recent history' };
  const healthyish = recentStates.filter((state) => state === 'healthy' || state === 'degraded').length;
  const ratio = healthyish / recentStates.length;
  const stableHealthy = recentStates.every((state) => state === 'healthy');
  const pct = Math.round(ratio * 100);
  if (stableHealthy) return { ratio, label: `${recentStates.length}/${recentStates.length} healthy recently` };
  if (ratio === 0) return { ratio, label: 'No recent serviceable window' };
  return { ratio, label: `${pct}% available across the recent window` };
}

function summarizeAverageResponseBand(services: InternalMonitoringServiceSnapshot[]) {
  const measurable = services.filter((service) => service.responseTimeBand !== 'unknown');
  if (!measurable.length) return 'Host-only';
  const weighted = measurable.reduce((total, service) => {
    if (service.responseTimeBand === 'fast') return total + 3;
    if (service.responseTimeBand === 'steady') return total + 2;
    return total + 1;
  }, 0);
  const average = weighted / measurable.length;
  if (average >= 2.5) return 'Mostly fast';
  if (average >= 1.6) return 'Mostly steady';
  return 'Mostly slow';
}

function summarizeDegradedMinutes(recentStates: InternalMonitoringState[], refreshIntervalSeconds: number) {
  let count = 0;
  for (let index = recentStates.length - 1; index >= 0; index -= 1) {
    if (recentStates[index] === 'healthy') break;
    count += 1;
  }
  return Math.round((count * refreshIntervalSeconds) / 60);
}

function summarizeOverallState(services: InternalMonitoringServiceSnapshot[]) {
  const healthyCount = services.filter((service) => service.state === 'healthy').length;
  const degradedCount = services.filter((service) => service.state === 'degraded').length;
  const attentionCount = services.filter((service) => service.state === 'attention_needed').length;
  const downCount = services.filter((service) => service.state === 'down').length;
  const score = Math.max(
    0,
    Math.round(
      services.reduce((total, service) => {
        if (service.state === 'healthy') return total + 100;
        if (service.state === 'degraded') return total + 72;
        if (service.state === 'attention_needed') return total + 44;
        return total + 12;
      }, 0) / Math.max(services.length, 1),
    ),
  );

  const state: InternalMonitoringState =
    downCount > 0
      ? 'down'
      : attentionCount > 0
        ? 'attention_needed'
        : degradedCount > 0
          ? 'degraded'
          : 'healthy';

  return {
    state,
    score,
    label: monitoringLabel(state) as InternalMonitoringSnapshot['overall']['label'],
    summary:
      state === 'healthy'
        ? 'Core checks are holding steady.'
        : state === 'degraded'
          ? 'Core checks are available, with some host-only visibility reduced.'
          : state === 'attention_needed'
            ? 'One or more checks need owner review.'
            : 'One or more critical checks are down.',
    healthyCount,
    degradedCount,
    attentionCount,
    downCount,
    availabilityPercentage: calculateRuntimeAvailability(services).percentage,
    calculation: calculateRuntimeAvailability(services),
    averageResponseBand: summarizeAverageResponseBand(services),
    lastRecoveryAt: services
      .map((service) => service.lastRecoveredAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) || null,
  };
}

function calculateRuntimeAvailability(services: InternalMonitoringServiceSnapshot[]) {
  const required = services.filter((service) => service.availabilityRole === 'runtime_required');
  const healthy = required.filter((service) => service.state === 'healthy');
  const excluded = services.filter((service) => service.availabilityRole !== 'runtime_required');
  const denominator = Math.max(required.length, 1);
  const percentage = Math.round((healthy.length / denominator) * 100);
  return {
    numerator: healthy.length,
    denominator,
    percentage,
    requiredKeys: required.map((service) => service.key),
    excludedKeys: excluded.map((service) => service.key),
    summary: `${healthy.length}/${denominator} required runtime checks healthy; ${excluded.length} operational or optional checks excluded from runtime availability.`,
  };
}

function defaultAvailabilityRole(key: string): AvailabilityRole {
  return ['app', 'api', 'marketing', 'database', 'redis', 'web-gateway', 'tls'].includes(key)
    ? 'runtime_required'
    : 'operational_readiness';
}

function parseStatusLine(output: string, prefix: string) {
  const line = output
    .split('\n')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  if (!line) return { status: 'unknown', line: '' };
  const match = line.match(/\bstatus=([a-z_]+)/i);
  return {
    status: (match?.[1] || 'unknown').toLowerCase(),
    line,
  };
}

function summarizeSubscriptionPriceIssues(output: string) {
  const lines = output.split('\n').map((value) => value.trim()).filter(Boolean);
  const issueLines = lines.filter((line) => /^([A-Z0-9_]+)\s+interval=(MONTHLY|ANNUAL)\s+status=(?!ready\b)/i.test(line));
  const actionLines = lines.filter((line) => line.startsWith('ACTION ')).map((line) => line.slice('ACTION '.length).trim());
  if (!issueLines.length) return '';
  return issueLines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)\s+interval=(MONTHLY|ANNUAL)\s+status=([a-z_]+)\s+expected="([^"]*)"\s+observed="([^"]*)"\s+active=([a-z]+)/i);
    if (!match) return line;
    const [, planCode, interval, status, expected, observed, active] = match;
    const action = actionLines.find((entry) => entry.startsWith(`${planCode} ${interval} `)) || '';
    const cleanedAction = action.replace(`${planCode} ${interval} `, '').trim();
    return `${planCode} ${interval}: ${status}; expected ${expected || 'n/a'}, observed ${observed || 'n/a'}, active=${active}. ${cleanedAction || 'Run the dry-run verifier and remap only after operator approval.'}`;
  }).join(' ');
}

function summarizeScriptState(status: string, kind: 'notification' | 'billing' | 'job_pack') {
  const normalized = String(status || '').trim().toLowerCase();
  if (kind === 'notification') {
    if (normalized === 'ok') {
      return {
        state: 'healthy' as InternalMonitoringState,
        summary: 'Routing verify is healthy',
      };
    }
    return {
      state: 'attention_needed' as InternalMonitoringState,
      summary: 'Routing verify needs attention',
    };
  }

  if (normalized === 'ready') {
    return {
      state: 'healthy' as InternalMonitoringState,
      summary: kind === 'billing' ? 'Billing readiness is healthy' : 'Job-pack readiness is healthy',
    };
  }
  if (normalized === 'partial' || normalized === 'unknown') {
    return {
      state: 'degraded' as InternalMonitoringState,
      summary: kind === 'billing' ? 'Billing readiness is degraded' : 'Job-pack readiness is degraded',
    };
  }
  return {
    state: 'attention_needed' as InternalMonitoringState,
    summary: kind === 'billing' ? 'Billing readiness needs attention' : 'Job-pack readiness needs attention',
  };
}

async function readCache(): Promise<InternalMonitoringCacheFile | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as InternalMonitoringCacheFile;
  } catch {
    return null;
  }
}

async function writeCache(value: InternalMonitoringCacheFile) {
  await fs.writeFile(CACHE_FILE, JSON.stringify(value), 'utf8');
}

export async function clearInternalMonitoringCache() {
  await fs.unlink(CACHE_FILE).catch(() => undefined);
  return { cleared: true, cacheFile: 'internal-monitoring-cache' };
}

async function timedProbe<T>(probe: () => Promise<T>) {
  const startedAt = Date.now();
  try {
    const value = await probe();
    return { ok: true as const, durationMs: Date.now() - startedAt, value };
  } catch (error) {
    return { ok: false as const, durationMs: Date.now() - startedAt, error };
  }
}

async function probePublicUrl(url: string | null, successStatuses: number[] = [200, 301, 302, 307, 308]) {
  return timedProbe(async () => {
    if (!url) throw new Error('NOT_CONFIGURED');
    const response = await fetch(url, { method: 'GET', redirect: 'manual' });
    if (!successStatuses.includes(response.status)) {
      throw new Error(`HTTP_${response.status}`);
    }
    return { status: response.status };
  });
}

async function probeDatabase(prisma: PrismaService) {
  return timedProbe(async () => {
    await (prisma as any).$queryRaw`SELECT 1`;
    return { ok: true };
  });
}

async function probeRedis(redis: RedisService) {
  return timedProbe(async () => {
    const redisUrl = redis.getRedisUrl();
    if (!redisUrl) throw new Error('NOT_CONFIGURED');
    const parsed = new URL(redisUrl);
    const port = Number(parsed.port || 6379);
    const host = parsed.hostname;
    const useTls = parsed.protocol === 'rediss:';
    await new Promise<void>((resolve, reject) => {
      const socket = useTls
        ? tls.connect({ host, port, servername: host, rejectUnauthorized: false })
        : net.createConnection({ host, port });
      const cleanup = () => {
        socket.removeAllListeners();
      };
      const timer = setTimeout(() => {
        cleanup();
        socket.destroy();
        reject(new Error('TIMEOUT'));
      }, 2500);

      socket.once('error', (error) => {
        clearTimeout(timer);
        cleanup();
        socket.destroy();
        reject(error);
      });

      socket.once('connect', () => {
        socket.write('*1\r\n$4\r\nPING\r\n');
      });

      socket.on('data', (chunk) => {
        const text = String(chunk || '');
        if (text.includes('PONG')) {
          clearTimeout(timer);
          cleanup();
          socket.end();
          resolve();
        }
      });
    });
    return { pong: 'PONG', host, port, tls: useTls };
  });
}

async function runNodeScript(args: string[]) {
  return timedProbe(async () => {
    const output = execFileSync('node', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
    });
    return output;
  });
}

async function runShellScript(scriptName: string) {
  return timedProbe(async () => {
    execFileSync('bash', [path.resolve(process.cwd(), 'scripts', scriptName)], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
    });
    return { ok: true };
  });
}

function buildServiceSnapshot(input: {
  key: string;
  label: string;
  state: InternalMonitoringState;
  summary: string;
  detail: string;
  checkedAt: string;
  previous?: { lastSuccessfulCheckAt: string | null } | null;
  responseTimeMs?: number | null;
  historyStates: InternalMonitoringState[];
  lastRecoveredAt?: string | null;
  availabilityRole?: AvailabilityRole;
  evidence?: Record<string, unknown>;
}) {
  const lastSuccessfulCheckAt =
    input.state === 'healthy'
      ? input.checkedAt
      : input.previous?.lastSuccessfulCheckAt || null;
  const availability = summarizeAvailability(input.historyStates);
  return {
    key: input.key,
    label: input.label,
    state: input.state,
    summary: input.summary,
    detail: input.detail,
    checkedAt: input.checkedAt,
    lastSuccessfulCheckAt,
    responseTimeMs: Number.isFinite(input.responseTimeMs as number) ? Number(input.responseTimeMs) : null,
    responseTimeBand: responseTimeBandFromMs(input.responseTimeMs),
    recentStates: input.historyStates,
    availabilityRatio: availability.ratio,
    availabilityPercentage: Math.round(availability.ratio * 100),
    availabilityLabel: availability.label,
    availabilityRole: input.availabilityRole || defaultAvailabilityRole(input.key),
    degradedMinutes: summarizeDegradedMinutes(input.historyStates, Math.round(CACHE_TTL_MS / 1000)),
    lastRecoveredAt: input.lastRecoveredAt || null,
    lastStableAt: lastSuccessfulCheckAt,
    evidence: input.evidence || undefined,
  } satisfies InternalMonitoringServiceSnapshot;
}

export async function getInternalMonitoringSnapshot(
  prisma: PrismaService,
  redis: RedisService,
  options?: { forceRefresh?: boolean },
): Promise<InternalMonitoringSnapshot> {
  const cached = await readCache();
  const cachedAtMs = cached?.checkedAt ? new Date(cached.checkedAt).getTime() : 0;
  if (!options?.forceRefresh && cachedAtMs && Date.now() - cachedAtMs < CACHE_TTL_MS) {
    return hydrateSnapshotFromCache(cached, true);
  }

  const checkedAt = toIsoNow();
  const previousByKey = new Map((cached?.services || []).map((service) => [service.key, service]));
  const external = getExternalMonitoringSnapshot();
  const backup = getBackupReadinessSnapshot();
  const scheduler = getSummarySchedulerStatusSnapshot();

  const appUrl = String(process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || '').trim();
  const apiUrl = String(process.env.API_PUBLIC_URL || '').trim();
  const marketingUrl =
    String(process.env.MARKETING_PUBLIC_URL || '').trim() ||
    (appUrl ? appUrl.replace('://app.', '://') : '');

  const [appProbe, apiProbe, marketingProbe, dbProbe, redisProbe, notificationProbe, billingProbe, jobPackProbe] = await Promise.all([
    probePublicUrl(appUrl ? `${appUrl.replace(/\/$/, '')}/login` : null),
    probePublicUrl(apiUrl ? `${apiUrl.replace(/\/$/, '')}/health` : 'http://127.0.0.1:3000/health', [200]),
    probePublicUrl(marketingUrl || null),
    probeDatabase(prisma),
    probeRedis(redis),
    runNodeScript(['scripts/test-notification-routing.js']),
    runNodeScript(['scripts/verify-subscription-prices.js']),
    runNodeScript(['scripts/sync-job-completion-products.js', '--dry-run']),
  ]);

  const nextServicesBase = [
    buildServiceSnapshot({
      key: 'app',
      label: 'App availability',
      state: appProbe.ok ? 'healthy' : appUrl ? 'down' : 'attention_needed',
      summary: appProbe.ok ? 'Workspace app is reachable' : appUrl ? 'Workspace app is unavailable' : 'Workspace app URL needs attention',
      detail: appProbe.ok
        ? 'The public workspace sign-in route responded successfully.'
        : appUrl
          ? 'The public workspace sign-in route did not respond cleanly.'
          : 'Declare APP_PUBLIC_URL before treating app availability as externally visible.',
      checkedAt,
      previous: previousByKey.get('app') || null,
      responseTimeMs: appProbe.durationMs,
      historyStates: [],
      availabilityRole: 'runtime_required',
    }),
    buildServiceSnapshot({
      key: 'api',
      label: 'API health',
      state: apiProbe.ok ? 'healthy' : 'down',
      summary: apiProbe.ok ? 'API health is healthy' : 'API health is down',
      detail: apiProbe.ok ? 'The health route responded successfully.' : 'The health route did not respond cleanly.',
      checkedAt,
      previous: previousByKey.get('api') || null,
      responseTimeMs: apiProbe.durationMs,
      historyStates: [],
      availabilityRole: 'runtime_required',
    }),
    buildServiceSnapshot({
      key: 'marketing',
      label: 'Marketing availability',
      state: marketingProbe.ok ? 'healthy' : marketingUrl ? 'down' : 'attention_needed',
      summary: marketingProbe.ok ? 'Marketing site is reachable' : marketingUrl ? 'Marketing site is unavailable' : 'Marketing URL needs attention',
      detail: marketingProbe.ok
        ? 'The public marketing route responded successfully.'
        : marketingUrl
          ? 'The public marketing route did not respond cleanly.'
          : 'Declare MARKETING_PUBLIC_URL or derive it from the app origin before treating marketing availability as externally visible.',
      checkedAt,
      previous: previousByKey.get('marketing') || null,
      responseTimeMs: marketingProbe.durationMs,
      historyStates: [],
      availabilityRole: 'runtime_required',
    }),
    buildServiceSnapshot({
      key: 'database',
      label: 'Database ready',
      state: dbProbe.ok ? 'healthy' : 'down',
      summary: dbProbe.ok ? 'Database is ready' : 'Database is unavailable',
      detail: dbProbe.ok ? 'A lightweight database ping succeeded.' : 'A lightweight database ping failed.',
      checkedAt,
      previous: previousByKey.get('database') || null,
      responseTimeMs: dbProbe.durationMs,
      historyStates: [],
      availabilityRole: 'runtime_required',
    }),
    buildServiceSnapshot({
      key: 'redis',
      label: 'Redis ready',
      state: redisProbe.ok ? 'healthy' : redis.getRedisUrl() ? 'degraded' : 'attention_needed',
      summary: redisProbe.ok ? 'Redis is ready' : redis.getRedisUrl() ? 'Redis visibility is reduced' : 'Redis is not configured',
      detail: redisProbe.ok
        ? `Redis responded ${String((redisProbe as any).value?.pong || 'PONG')} in ${redisProbe.durationMs} ms.`
        : redis.getRedisUrl()
          ? 'A lightweight Redis ping did not confirm readiness from this runtime.'
          : 'Declare REDIS_URL before treating Redis-backed queues as ready.',
      checkedAt,
      previous: previousByKey.get('redis') || null,
      responseTimeMs: redisProbe.durationMs,
      historyStates: [],
      availabilityRole: 'runtime_required',
      evidence: redisProbe.ok ? {
        response: String((redisProbe as any).value?.pong || 'PONG'),
        latencyMs: redisProbe.durationMs,
        host: String((redisProbe as any).value?.host || 'configured'),
        port: Number((redisProbe as any).value?.port || 6379),
        tls: Boolean((redisProbe as any).value?.tls),
        lastChecked: checkedAt,
      } : undefined,
    }),
    buildServiceSnapshot({
      key: 'web-gateway',
      label: 'Web gateway',
      state: external.nginxStatus === 'ready' ? 'healthy' : external.nginxStatus === 'unknown' ? 'degraded' : 'attention_needed',
      summary: external.nginxStatus === 'ready' ? 'Web gateway is visible' : external.nginxStatus === 'unknown' ? 'Web gateway visibility is reduced' : 'Web gateway needs attention',
      detail:
        external.nginxStatus === 'ready'
          ? external.nginxDetail || 'The host-visible web gateway check reports healthy service state.'
          : external.nginxDetail || external.detail || 'The host-visible web gateway check is not available from this runtime.',
      checkedAt,
      previous: previousByKey.get('web-gateway') || null,
      responseTimeMs: null,
      historyStates: [],
      availabilityRole: 'runtime_required',
      evidence: {
        app: { url: external.appUrl, status: external.appStatus },
        api: { url: external.apiUrl, status: external.apiStatus },
        marketing: { url: external.marketingUrl, status: external.marketingStatus },
        gatewayStatus: external.nginxStatus,
      },
    }),
    buildServiceSnapshot({
      key: 'tls',
      label: 'TLS validity',
      state: external.tlsStatus === 'ready' ? 'healthy' : external.tlsStatus === 'unknown' ? 'degraded' : 'attention_needed',
      summary: external.tlsStatus === 'ready' ? 'Certificate is visible' : 'Certificate visibility needs attention',
      detail:
        external.tlsStatus === 'ready'
          ? `Public certificate visibility is healthy${external.tlsExpiry ? `. Expiry: ${external.tlsExpiry}.` : '.'}`
          : external.tlsDetail || external.detail || 'TLS validity could not be inspected safely from this runtime.',
      checkedAt,
      previous: previousByKey.get('tls') || null,
      responseTimeMs: null,
      historyStates: [],
      availabilityRole: 'runtime_required',
      evidence: {
        tlsStatus: external.tlsStatus,
        tlsExpiry: external.tlsExpiry,
        detail: external.tlsDetail,
      },
    }),
    buildServiceSnapshot({
      key: 'scheduler',
      label: 'Scheduler',
      state: scheduler.status === 'ready' ? 'healthy' : scheduler.status === 'unknown' ? 'degraded' : 'attention_needed',
      summary: scheduler.status === 'ready' ? 'Scheduler is healthy' : scheduler.status === 'unknown' ? 'Scheduler visibility is reduced' : 'Scheduler needs attention',
      detail: scheduler.detail,
      checkedAt,
      previous: previousByKey.get('scheduler') || null,
      responseTimeMs: null,
      historyStates: [],
      availabilityRole: 'operational_readiness',
    }),
    buildServiceSnapshot({
      key: 'backups',
      label: 'Backup readiness',
      state:
        backup.status === 'ready'
          ? 'healthy'
          : backup.status === 'unknown'
            ? 'degraded'
            : 'attention_needed',
      summary:
        backup.status === 'ready'
          ? 'Backup readiness is healthy'
          : backup.status === 'unknown'
            ? 'Backup visibility is reduced'
            : 'Backup readiness needs attention',
      detail: `${backup.detail}${backup.lastBackupAt ? ` Latest backup: ${backup.lastBackupAt}, artifact=${backup.lastBackupArtifact || 'unknown'}, size=${backup.lastBackupSizeBytes ?? 'unknown'} bytes.` : ' Run bash ./scripts/backup.sh, then bash ./scripts/backup-readiness-status.sh to create backup evidence.'}`,
      checkedAt,
      previous: previousByKey.get('backups') || null,
      responseTimeMs: null,
      historyStates: [],
      availabilityRole: 'operational_readiness',
      evidence: {
        lastBackupAt: backup.lastBackupAt,
        artifact: backup.lastBackupArtifact,
        sizeBytes: backup.lastBackupSizeBytes,
        scheduleStatus: backup.scheduleStatus,
        createEvidenceCommand: 'bash ./scripts/backup.sh && bash ./scripts/backup-readiness-status.sh',
      },
    }),
    buildServiceSnapshot({
      key: 'restore-drill',
      label: 'Restore drill',
      state: backup.restoreStatus === 'ready' ? 'healthy' : backup.restoreStatus ? 'attention_needed' : 'degraded',
      summary: backup.restoreStatus === 'ready' ? 'Restore drill is current' : 'Restore drill needs attention',
      detail: backup.restoreStatus === 'ready'
        ? `${backup.restoreDetail || 'Restore drill marker is present.'} Last drill: ${backup.lastRestoreDrillAt || 'unknown'}.`
        : `${backup.restoreDetail || 'Restore drill visibility is limited in this runtime.'} Run bash ./scripts/restore-test.sh, then bash ./scripts/backup-readiness-status.sh to create restore evidence.`,
      checkedAt,
      previous: previousByKey.get('restore-drill') || null,
      responseTimeMs: null,
      historyStates: [],
      availabilityRole: 'operational_readiness',
      evidence: {
        lastRestoreDrillAt: backup.lastRestoreDrillAt,
        restoreStatus: backup.restoreStatus,
        createEvidenceCommand: 'bash ./scripts/restore-test.sh && bash ./scripts/backup-readiness-status.sh',
      },
    }),
    (() => {
      const normalizedOutput = notificationProbe.ok ? String(notificationProbe.value || '') : '';
      const status = notificationProbe.ok && normalizedOutput.includes('notification-routing-verify: ok') ? 'ok' : 'failed';
      const summary = summarizeScriptState(status, 'notification');
      return buildServiceSnapshot({
        key: 'notification-routing',
        label: 'Notification routing verify',
        state: summary.state,
        summary: summary.summary,
        detail:
          notificationProbe.ok
            ? 'Metadata-only routing verification completed without exposing recipient addresses.'
            : 'Notification routing verification did not complete successfully.',
        checkedAt,
        previous: previousByKey.get('notification-routing') || null,
        responseTimeMs: notificationProbe.durationMs,
        historyStates: [],
        availabilityRole: 'operational_readiness',
      });
    })(),
    (() => {
      const billingOutput = billingProbe.ok ? String(billingProbe.value || '') : '';
      const parsed = parseStatusLine(billingOutput, 'SUBSCRIPTION_PRICE_SYNC');
      const summary = summarizeScriptState(parsed.status, 'billing');
      return buildServiceSnapshot({
        key: 'billing',
        label: 'Billing readiness',
        state: summary.state,
        summary: summary.summary,
        detail:
          billingProbe.ok
            ? [parsed.line || 'Subscription price verification completed.', summarizeSubscriptionPriceIssues(billingOutput)].filter(Boolean).join(' ')
            : 'Subscription price verification could not complete from this runtime.',
        checkedAt,
        previous: previousByKey.get('billing') || null,
        responseTimeMs: billingProbe.durationMs,
        historyStates: [],
        availabilityRole: 'operational_readiness',
        evidence: {
          statusLine: parsed.line || null,
          mismatchSummary: summarizeSubscriptionPriceIssues(billingOutput) || null,
          dryRun: true,
          syncRequiresOperatorApproval: true,
        },
      });
    })(),
    (() => {
      const jobPackOutput = jobPackProbe.ok ? String(jobPackProbe.value || '') : '';
      const parsed = parseStatusLine(jobPackOutput, 'JOB_COMPLETION_PACK_SYNC');
      const summary = summarizeScriptState(parsed.status, 'job_pack');
      return buildServiceSnapshot({
        key: 'job-packs',
        label: 'Job-pack readiness',
        state: summary.state,
        summary: summary.summary,
        detail:
          jobPackProbe.ok
            ? parsed.line || 'Job-pack dry-run verification completed.'
            : 'Job-pack dry-run verification could not complete from this runtime.',
        checkedAt,
        previous: previousByKey.get('job-packs') || null,
        responseTimeMs: jobPackProbe.durationMs,
        historyStates: [],
        availabilityRole: 'operational_readiness',
      });
    })(),
  ];

  const nextRecentSnapshots = [
    ...(cached?.recentSnapshots || []),
    {
      checkedAt,
      services: nextServicesBase.map((service) => ({ key: service.key, state: service.state })),
    },
  ].slice(-MAX_HISTORY_SNAPSHOTS);

  const nextServices = nextServicesBase.map((service) => {
    const historyStates = nextRecentSnapshots
      .map((snapshot) => snapshot.services.find((entry) => entry.key === service.key)?.state)
      .filter((entry): entry is InternalMonitoringState => Boolean(entry));
    const availability = summarizeAvailability(historyStates);
    const lastRecoveredAt =
      (cached?.incidents || [])
        .filter((incident) => incident.key === service.key && (incident.phase === 'Recovered' || incident.phase === 'Resolved'))
        .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
        .at(-1)?.occurredAt || null;
    return {
      ...service,
      recentStates: historyStates,
      availabilityRatio: availability.ratio,
      availabilityPercentage: Math.round(availability.ratio * 100),
      availabilityLabel: availability.label,
      availabilityRole: service.availabilityRole || defaultAvailabilityRole(service.key),
      degradedMinutes: summarizeDegradedMinutes(historyStates, Math.round(CACHE_TTL_MS / 1000)),
      lastRecoveredAt,
      lastStableAt: service.lastSuccessfulCheckAt,
    };
  });

  const previousStateByKey = new Map(
    (cached?.recentSnapshots?.[cached.recentSnapshots.length - 1]?.services || []).map((service) => [service.key, service.state]),
  );
  const nextIncidents = [...(cached?.incidents || [])];
  for (const service of nextServices) {
    const previousState = previousStateByKey.get(service.key);
    if (!previousState || previousState === service.state) continue;
    const transitionedToHealthy = service.state === 'healthy' && previousState !== 'healthy';
    const phase = transitionedToHealthy
      ? ((previousState === 'down' || previousState === 'attention_needed') ? 'Recovered' : 'Resolved')
      : 'Investigating';
    nextIncidents.push({
      key: service.key,
      label: service.label,
      state: service.state,
      phase,
      summary: transitionedToHealthy
        ? `${service.label} recovered and is stable again.`
        : `${service.label} moved to ${monitoringLabel(service.state).toLowerCase()}.`,
      occurredAt: checkedAt,
      resolvedAt: transitionedToHealthy ? checkedAt : null,
      durationMinutes: transitionedToHealthy ? service.degradedMinutes : null,
    });
  }

  const nextCache: InternalMonitoringCacheFile = {
    checkedAt,
    services: nextServices.map((service) => ({
      key: service.key,
      label: service.label,
      summary: service.summary,
      detail: service.detail,
      state: service.state,
      lastSuccessfulCheckAt: service.lastSuccessfulCheckAt,
      responseTimeMs: service.responseTimeMs,
      availabilityRole: service.availabilityRole,
      evidence: service.evidence,
    })),
    recentSnapshots: nextRecentSnapshots,
    incidents: nextIncidents.slice(-MAX_INCIDENTS),
  };
  await writeCache(nextCache);
  return hydrateSnapshotFromCache(nextCache, false, nextServices, external);
}

export async function runInternalMonitoringAction(
  action: InternalMonitoringAction,
  prisma: PrismaService,
  redis: RedisService,
): Promise<InternalMonitoringActionResult> {
  const checkedAt = toIsoNow();
  if (action === 'refresh_snapshot') {
    const snapshot = await getInternalMonitoringSnapshot(prisma, redis, { forceRefresh: true });
    return {
      action,
      checkedAt,
      label: 'Refresh monitoring snapshot',
      state: snapshot.overall.state,
      summary: snapshot.cached ? 'A recent monitoring snapshot is already available.' : 'Monitoring snapshot refreshed.',
      detail: snapshot.overall.summary,
      snapshot,
    };
  }

  if (action === 'run_health_check') {
    const probe = await runShellScript('healthcheck.sh');
    return {
      action,
      checkedAt,
      label: 'Run health check',
      state: probe.ok ? 'healthy' : 'attention_needed',
      summary: probe.ok ? 'Health check passed.' : 'Health check needs attention.',
      detail: probe.ok
        ? 'App, API, and supporting runtime checks completed successfully.'
        : 'One or more runtime health checks did not complete successfully.',
    };
  }

  if (action === 'verify_notification_routing') {
    const probe = await runNodeScript(['scripts/test-notification-routing.js']);
    const ok = probe.ok && String(probe.value || '').includes('notification-routing-verify: ok');
    return {
      action,
      checkedAt,
      label: 'Verify notification routing',
      state: ok ? 'healthy' : 'attention_needed',
      summary: ok ? 'Notification routing verify is healthy.' : 'Notification routing verify needs attention.',
      detail: ok
        ? 'The metadata-only verify completed without exposing recipient addresses.'
        : 'Notification routing verify did not complete successfully.',
    };
  }

  if (action === 'check_billing_readiness') {
    const [billingProbe, jobPackProbe] = await Promise.all([
      runNodeScript(['scripts/verify-subscription-prices.js']),
      runNodeScript(['scripts/sync-job-completion-products.js', '--dry-run']),
    ]);
    const billingStatus = parseStatusLine(billingProbe.ok ? String(billingProbe.value || '') : '', 'SUBSCRIPTION_PRICE_SYNC').status;
    const jobPackStatus = parseStatusLine(jobPackProbe.ok ? String(jobPackProbe.value || '') : '', 'JOB_COMPLETION_PACK_SYNC').status;
    const healthy = billingStatus === 'ready' && jobPackStatus === 'ready';
    return {
      action,
      checkedAt,
      label: 'Check billing readiness',
      state: healthy ? 'healthy' : 'attention_needed',
      summary: healthy ? 'Billing readiness checks are healthy.' : 'Billing readiness needs attention.',
      detail: healthy
        ? 'Subscription pricing and job-pack dry-run verification both completed successfully.'
        : 'One or more billing readiness checks did not complete cleanly.',
    };
  }

  const backup = getBackupReadinessSnapshot();
  const healthy = backup.status === 'ready' && backup.restoreStatus === 'ready';
  return {
    action,
    checkedAt,
    label: 'Validate backups',
    state: healthy ? 'healthy' : backup.status === 'unknown' ? 'degraded' : 'attention_needed',
    summary: healthy ? 'Backup evidence is healthy.' : 'Backup evidence needs attention.',
    detail: healthy
      ? 'Recent encrypted backup evidence and a recent restore drill are both visible.'
      : backup.detail || 'Backup evidence could not be confirmed from this runtime.',
  };
}

function hydrateSnapshotFromCache(
  cache: InternalMonitoringCacheFile,
  cached: boolean,
  providedServices?: InternalMonitoringServiceSnapshot[],
  externalSnapshot?: ReturnType<typeof getExternalMonitoringSnapshot>,
): InternalMonitoringSnapshot {
  const recentSnapshots = cache.recentSnapshots || [];
  const services = providedServices || cache.services.map((service) => {
    const historyStates = recentSnapshots
      .map((snapshot) => snapshot.services.find((entry) => entry.key === service.key)?.state)
      .filter((entry): entry is InternalMonitoringState => Boolean(entry));
    const availability = summarizeAvailability(historyStates);
    return {
      key: service.key,
      label: service.label,
      state: service.state,
      summary: service.summary,
      detail: service.detail,
      checkedAt: cache.checkedAt,
      lastSuccessfulCheckAt: service.lastSuccessfulCheckAt,
      responseTimeMs: service.responseTimeMs,
      responseTimeBand: responseTimeBandFromMs(service.responseTimeMs),
      recentStates: historyStates,
      availabilityRatio: availability.ratio,
      availabilityPercentage: Math.round(availability.ratio * 100),
      availabilityLabel: availability.label,
      availabilityRole: service.availabilityRole || 'operational_readiness',
      degradedMinutes: summarizeDegradedMinutes(historyStates, Math.round(CACHE_TTL_MS / 1000)),
      lastRecoveredAt:
        (cache.incidents || [])
          .filter((incident) => incident.key === service.key && (incident.phase === 'Recovered' || incident.phase === 'Resolved'))
          .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
          .at(-1)?.occurredAt || null,
      lastStableAt: service.lastSuccessfulCheckAt,
      evidence: service.evidence,
    };
  });
  const overall = summarizeOverallState(services);
  const uptimeMinutes = Math.max(0, Math.round(process.uptime() / 60));
  const bootedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();
  const external = externalSnapshot || getExternalMonitoringSnapshot();
  return {
    checkedAt: cache.checkedAt,
    cached,
    refreshIntervalSeconds: Math.round(CACHE_TTL_MS / 1000),
    overall,
    services,
    incidents: (cache.incidents || []).slice(-MAX_INCIDENTS).reverse(),
    historyWindow: {
      sampleCount: recentSnapshots.length,
      maxSamples: MAX_HISTORY_SNAPSHOTS,
      hoursCovered: Math.round((recentSnapshots.length * Math.round(CACHE_TTL_MS / 1000)) / 36) / 100,
      summary: recentSnapshots.length
        ? `Up to 24 hours of lightweight internal checks are kept for trend context.`
        : 'No recent internal checks are available yet.',
    },
    runtimeFreshness: {
      bootedAt,
      uptimeMinutes,
      summary: uptimeMinutes > 0 ? `Runtime has been active for ${uptimeMinutes} minutes.` : 'Runtime just restarted.',
    },
    externalMonitoring: {
      status: external.externalMonitorStatus || 'not_configured',
      summary:
        external.externalMonitorStatus === 'healthy'
          ? 'External uptime monitoring is declared and healthy.'
          : external.externalMonitorStatus === 'degraded'
            ? 'External uptime monitoring is declared but currently degraded.'
            : external.externalMonitorStatus === 'configured' || external.externalMonitorStatus === 'verifying' || external.externalMonitorStatus === 'ready'
              ? 'External uptime monitoring is declared separately and still needs verification evidence before it counts as healthy.'
          : 'External uptime monitoring is still not configured. This internal view does not replace it.',
    },
  };
}
