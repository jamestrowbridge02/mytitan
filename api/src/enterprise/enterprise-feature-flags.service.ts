import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ENTERPRISE_FEATURE_FLAGS,
  EnterpriseFeatureFlagKey,
  getEnterpriseRuntimeEnvironment,
  isEnterpriseFeatureFlagKey,
} from './enterprise-feature-flags';

type ResolveOptions = {
  tenantId?: string | null;
  userId?: string | null;
  key: EnterpriseFeatureFlagKey;
};

type UpsertOptions = {
  tenantId?: string | null;
  key: EnterpriseFeatureFlagKey;
  environment?: string | null;
  enabled: boolean;
  rolloutPercentage?: number | null;
  reason?: string | null;
  actorUserId?: string | null;
};

@Injectable()
export class EnterpriseFeatureFlagsService {
  private readonly cache = new Map<string, { expiresAt: number; value: any }>();

  clearRuntimeCache() {
    const before = this.cache.size;
    this.cache.clear();
    return { before, after: this.cache.size };
  }
  private readonly ttlMs = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  getRegistry() {
    return Object.values(ENTERPRISE_FEATURE_FLAGS).map((flag) => ({
      key: flag.key,
      label: flag.label,
      description: flag.description,
      defaultEnabled: flag.defaultEnabled,
      safeForTenantOverride: flag.safeForTenantOverride,
    }));
  }

  private cacheKey(options: ResolveOptions) {
    return `${getEnterpriseRuntimeEnvironment()}:${options.tenantId || 'global'}:${options.userId || 'anon'}:${options.key}`;
  }

  private envOverride(key: EnterpriseFeatureFlagKey): boolean | null {
    const envName = `MYTITAN_FLAG_${key.toUpperCase()}`;
    const raw = String(process.env[envName] || '').trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
    if (['0', 'false', 'no', 'off'].includes(raw)) return false;
    return null;
  }

  private rolloutAllows(key: EnterpriseFeatureFlagKey, tenantId: string | null | undefined, userId: string | null | undefined, percentage: number) {
    const normalized = Math.max(0, Math.min(100, Math.trunc(Number(percentage || 0))));
    if (normalized >= 100) return true;
    if (normalized <= 0) return false;
    const seed = `${key}:${tenantId || 'global'}:${userId || ''}`;
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
    }
    return hash % 100 < normalized;
  }

  async resolve(options: ResolveOptions) {
    if (!isEnterpriseFeatureFlagKey(options.key)) throw new BadRequestException('Unknown enterprise feature flag');
    const cached = this.cache.get(this.cacheKey(options));
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const registry = ENTERPRISE_FEATURE_FLAGS[options.key];
    const env = getEnterpriseRuntimeEnvironment();
    const envOverride = this.envOverride(options.key);
    let source = 'registry_default';
    let enabled = Boolean(registry.defaultEnabled);
    let rolloutPercentage = enabled ? 100 : 0;
    let override: any = null;

    if (envOverride !== null) {
      enabled = envOverride;
      rolloutPercentage = enabled ? 100 : 0;
      source = 'environment';
    } else {
      const db = this.prisma as any;
      const rows = await db.enterpriseFeatureFlag.findMany({
        where: {
          key: options.key,
          environment: { in: [env, 'all'] },
          OR: [{ tenantId: options.tenantId || '' }, { tenantId: null }],
        },
        orderBy: [{ tenantId: 'desc' }, { environment: 'asc' }, { updatedAt: 'desc' }],
        take: 4,
      });
      override = rows.find((row: any) => row.tenantId === options.tenantId && row.environment === env)
        || rows.find((row: any) => row.tenantId === options.tenantId)
        || rows.find((row: any) => row.tenantId === null && row.environment === env)
        || rows.find((row: any) => row.tenantId === null);
      if (override) {
        enabled = Boolean(override.enabled);
        rolloutPercentage = Math.max(0, Math.min(100, Number(override.rolloutPercentage || 0)));
        source = override.tenantId ? 'tenant_override' : 'platform_default';
      }
    }

    const effectiveEnabled = enabled || this.rolloutAllows(options.key, options.tenantId, options.userId, rolloutPercentage);
    const value = {
      key: options.key,
      label: registry.label,
      enabled: effectiveEnabled,
      source,
      environment: env,
      rolloutPercentage,
      tenantId: options.tenantId || null,
      reason: override?.reason || null,
    };
    this.cache.set(this.cacheKey(options), { expiresAt: Date.now() + this.ttlMs, value });
    return value;
  }

  async assertEnabled(options: ResolveOptions) {
    const flag = await this.resolve(options);
    if (!flag.enabled) {
      throw new BadRequestException({
        code: 'ENTERPRISE_FEATURE_DISABLED',
        feature: options.key,
        message: `${ENTERPRISE_FEATURE_FLAGS[options.key].label} is not enabled for this workspace yet.`,
      });
    }
    return flag;
  }

  async listForTenant(tenantId: string | null, userId?: string | null) {
    const flags = await Promise.all(
      Object.keys(ENTERPRISE_FEATURE_FLAGS).map((key) =>
        this.resolve({ tenantId, userId, key: key as EnterpriseFeatureFlagKey }),
      ),
    );
    return {
      environment: getEnterpriseRuntimeEnvironment(),
      flags,
      registry: this.getRegistry(),
    };
  }

  async upsertOverride(options: UpsertOptions) {
    if (!isEnterpriseFeatureFlagKey(options.key)) throw new BadRequestException('Unknown enterprise feature flag');
    const environment = String(options.environment || 'all').trim().toLowerCase() || 'all';
    const rolloutPercentage = Math.max(0, Math.min(100, Math.trunc(Number(options.rolloutPercentage ?? (options.enabled ? 100 : 0)))));
    const db = this.prisma as any;
    const existing = await db.enterpriseFeatureFlag.findFirst({
      where: {
        key: options.key,
        tenantId: options.tenantId || null,
        environment,
      },
    });
    const row = existing ? await db.enterpriseFeatureFlag.update({
      where: { id: existing.id },
      data: {
        enabled: options.enabled,
        rolloutPercentage,
        reason: options.reason || null,
        updatedByUserId: options.actorUserId || null,
      },
    }) : await db.enterpriseFeatureFlag.create({
      data: {
        key: options.key,
        tenantId: options.tenantId || null,
        environment,
        enabled: options.enabled,
        rolloutPercentage,
        overrideSource: options.tenantId ? 'tenant' : 'platform',
        reason: options.reason || null,
        createdByUserId: options.actorUserId || null,
        updatedByUserId: options.actorUserId || null,
      },
    });
    this.cache.clear();
    if (options.tenantId) {
      await this.audit.log(
        options.tenantId,
        'enterprise_feature_flag.updated',
        `enterprise_feature_flag.updated key=${options.key} enabled=${options.enabled} rollout=${rolloutPercentage} environment=${environment}`,
        options.actorUserId || undefined,
      );
    }
    return row;
  }
}
