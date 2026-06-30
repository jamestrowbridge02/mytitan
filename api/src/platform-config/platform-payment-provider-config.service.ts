import { BadRequestException, Injectable, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPlatformPersistenceState,
  decryptPlatformSecret,
  encryptedPlatformSecretDecryptable,
  encryptPlatformSecret,
} from './platform-secret-vault';

type CachedConnectConfig = {
  platformSecret: string | null;
  webhookSecret: string | null;
  mode: 'test' | 'live';
};

const PROVIDER = 'stripe_connect';
const CONFIG_ID = 'stripe_connect';
const MIN_STRIPE_SECRET_LENGTH = 32;
const MIN_STRIPE_WEBHOOK_SECRET_LENGTH = 16;

@Injectable()
export class PlatformPaymentProviderConfigService implements OnModuleInit {
  private cached: CachedConnectConfig = {
    platformSecret: null,
    webhookSecret: null,
    mode: String(process.env.MYTITAN_TENANT_STRIPE_CONNECT_MODE || '').trim().toLowerCase() === 'live' ? 'live' : 'test',
  };
  private runtimeReloadedAt: Date | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    await this.reload().catch(() => undefined);
  }

  private normalizeMode(value?: string | null): 'test' | 'live' {
    return String(value || '').trim().toLowerCase() === 'live' ? 'live' : 'test';
  }

  private decryptOptional(value?: string | null) {
    return decryptPlatformSecret(value);
  }

  private encryptedSecretDecryptable(value?: string | null) {
    return encryptedPlatformSecretDecryptable(value);
  }

  private normalizeCredentialInput(value?: string | null) {
    return String(value || '').replace(/[\s\u200B-\u200D\uFEFF]+/g, '').trim();
  }

  private validateStripeConnectInputs(input: {
    platformSecret?: string;
    webhookSecret?: string;
    mode: 'test' | 'live';
  }) {
    const platformSecretValidation = input.platformSecret
      ? {
          receivedLength: input.platformSecret.length,
          minimumLengthPassed: input.platformSecret.length >= MIN_STRIPE_SECRET_LENGTH,
          prefixPassed: (input.mode === 'live' ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/).test(input.platformSecret),
          formatPassed: /^(sk|rk)_(test|live)_[A-Za-z0-9_=-]+$/.test(input.platformSecret),
        }
      : null;
    const webhookSecretValidation = input.webhookSecret
      ? {
          receivedLength: input.webhookSecret.length,
          minimumLengthPassed: input.webhookSecret.length >= MIN_STRIPE_WEBHOOK_SECRET_LENGTH,
          prefixPassed: /^whsec_/.test(input.webhookSecret),
          formatPassed: /^whsec_[A-Za-z0-9_=-]+$/.test(input.webhookSecret),
        }
      : null;
    const failures: string[] = [];
    const modeLabel = input.mode === 'live' ? 'live' : 'test';
    const expectedPlatformPrefix = input.mode === 'live' ? 'sk_live_ or rk_live_' : 'sk_test_ or rk_test_';
    if (platformSecretValidation && !platformSecretValidation.minimumLengthPassed) {
      failures.push(
        `Stripe Connect platform secret appears incomplete. Expected a ${modeLabel} secret beginning ${expectedPlatformPrefix}; received length ${platformSecretValidation.receivedLength}.`,
      );
    } else if (platformSecretValidation && !platformSecretValidation.prefixPassed) {
      failures.push(`Stripe Connect ${modeLabel} mode requires a ${modeLabel} platform secret beginning ${expectedPlatformPrefix}.`);
    } else if (platformSecretValidation && !platformSecretValidation.formatPassed) {
      failures.push('Stripe Connect platform secret contains unsupported characters.');
    }
    if (webhookSecretValidation && !webhookSecretValidation.minimumLengthPassed) {
      failures.push(
        `Stripe Connect webhook secret appears incomplete. Expected a secret beginning whsec_; received length ${webhookSecretValidation.receivedLength}.`,
      );
    } else if (webhookSecretValidation && !webhookSecretValidation.prefixPassed) {
      failures.push('Stripe Connect webhook secret must start with whsec_.');
    } else if (webhookSecretValidation && !webhookSecretValidation.formatPassed) {
      failures.push('Stripe Connect webhook secret contains unsupported characters.');
    }
    if (failures.length > 0) {
      throw new BadRequestException({
        message: failures.join(' '),
        platformSecretValidation,
        webhookSecretValidation,
      });
    }
    return { platformSecretValidation, webhookSecretValidation };
  }

  async reload() {
    const db = this.prisma as any;
    const row = await db.platformPaymentProviderConfig.findUnique({ where: { id: CONFIG_ID } });
    this.cached = {
      platformSecret: this.decryptOptional(row?.platformSecretEncrypted),
      webhookSecret: this.decryptOptional(row?.webhookSecretEncrypted),
      mode: this.normalizeMode(row?.mode || process.env.MYTITAN_TENANT_STRIPE_CONNECT_MODE),
    };
    this.runtimeReloadedAt = new Date();
    return this.cached;
  }

  getRuntimeConfig() {
    const config = {
      platformSecret:
        this.cached.platformSecret ||
        String(process.env.STRIPE_CONNECT_PLATFORM_SECRET || '').trim() ||
        null,
      webhookSecret:
        this.cached.webhookSecret ||
        String(process.env.STRIPE_CONNECT_WEBHOOK_SECRET || '').trim() ||
        null,
      mode: this.cached.mode,
    };
    return config;
  }

  getRuntimeStatus() {
    const runtime = this.getRuntimeConfig();
    return {
      mode: runtime.mode,
      platformSecretLoaded: Boolean(runtime.platformSecret),
      webhookSecretLoaded: Boolean(runtime.webhookSecret),
      runtimeLoaded: Boolean(runtime.platformSecret && runtime.webhookSecret),
      lastReloadedAt: this.runtimeReloadedAt,
    };
  }

  private readiness(row: any) {
    const envPlatform = String(process.env.STRIPE_CONNECT_PLATFORM_SECRET || '').trim();
    const envWebhook = String(process.env.STRIPE_CONNECT_WEBHOOK_SECRET || '').trim();
    const vaultPlatformPresent = Boolean(row?.platformSecretEncrypted);
    const vaultWebhookPresent = Boolean(row?.webhookSecretEncrypted);
    const failed = row?.credentialStatus === 'failed' || row?.webhookStatus === 'failed';
    if (vaultPlatformPresent || vaultWebhookPresent) {
      const vaultConfigPresent = vaultPlatformPresent && vaultWebhookPresent;
      const vaultConfigDecryptable =
        this.encryptedSecretDecryptable(row?.platformSecretEncrypted) &&
        this.encryptedSecretDecryptable(row?.webhookSecretEncrypted);
      const vaultVerified = row?.credentialStatus === 'verified' && row?.webhookStatus === 'verified';
      const ready = vaultConfigPresent && vaultConfigDecryptable && vaultVerified;
      return failed ? 'failed_verification' : ready ? 'ready' : vaultConfigPresent ? 'needs_verification' : 'missing_config';
    }
    return envPlatform && envWebhook ? 'ready' : 'missing_config';
  }

  async getSafeStatus() {
    const db = this.prisma as any;
    const row = await db.platformPaymentProviderConfig.findUnique({ where: { id: CONFIG_ID } });
    const envPlatform = String(process.env.STRIPE_CONNECT_PLATFORM_SECRET || '').trim();
    const envWebhook = String(process.env.STRIPE_CONNECT_WEBHOOK_SECRET || '').trim();
    const vaultPlatformDecryptable = this.encryptedSecretDecryptable(row?.platformSecretEncrypted);
    const vaultWebhookDecryptable = this.encryptedSecretDecryptable(row?.webhookSecretEncrypted);
    const runtime = this.getRuntimeStatus();
    return {
      provider: PROVIDER,
      mode: this.normalizeMode(row?.mode || process.env.MYTITAN_TENANT_STRIPE_CONNECT_MODE),
      readiness: this.readiness(row),
      platformSecret: {
        present: Boolean(row?.platformSecretEncrypted || envPlatform),
        lastFour: row?.platformSecretLastFour || (envPlatform ? envPlatform.slice(-4) : null),
        source: row?.platformSecretEncrypted ? 'vault' : envPlatform ? 'runtime_environment' : 'missing',
        verificationStatus: row?.platformSecretEncrypted
          ? vaultPlatformDecryptable
            ? row?.credentialStatus || 'needs_verification'
            : 'needs_verification'
          : envPlatform
            ? 'verified'
            : 'missing',
        lastVerifiedAt: row?.credentialVerifiedAt || null,
        failureReason: row?.credentialFailureReason || null,
      },
      webhookSecret: {
        present: Boolean(row?.webhookSecretEncrypted || envWebhook),
        lastFour: row?.webhookSecretLastFour || (envWebhook ? envWebhook.slice(-4) : null),
        source: row?.webhookSecretEncrypted ? 'vault' : envWebhook ? 'runtime_environment' : 'missing',
        verificationStatus: row?.webhookSecretEncrypted
          ? vaultWebhookDecryptable
            ? row?.webhookStatus || 'needs_verification'
            : 'needs_verification'
          : envWebhook
            ? 'verified'
            : 'missing',
        lastVerifiedAt: row?.webhookVerifiedAt || null,
        failureReason: row?.webhookFailureReason || null,
      },
      updatedAt: row?.updatedAt || null,
      updatedByUserId: row?.updatedByUserId || null,
      lastSavedAt: row?.updatedAt || null,
      lastVerifiedAt: [row?.credentialVerifiedAt, row?.webhookVerifiedAt].filter(Boolean).sort().at(-1) || null,
      runtime,
      secretsReturned: false,
    };
  }

  async reloadRuntime(input: { actorCompanyId: string; actorUserId: string }) {
    const before = this.getRuntimeStatus();
    await this.reload();
    const after = this.getRuntimeStatus();
    await this.audit.log(
      input.actorCompanyId,
      'platform.payment_provider_config.reload',
      `Stripe Connect runtime configuration reloaded. Before=${JSON.stringify(before)} After=${JSON.stringify(after)}`,
      input.actorUserId,
    );
    return this.getSafeStatus();
  }

  async onboardingPreflight(input: { actorCompanyId: string; actorUserId: string }) {
    await this.reload();
    const runtime = this.getRuntimeConfig();
    const platformSecretLoaded = Boolean(runtime.platformSecret);
    const webhookSecretLoaded = Boolean(runtime.webhookSecret);
    const stripeClientInitialised = Boolean(
      runtime.platformSecret &&
      (() => {
        try {
          void new Stripe(runtime.platformSecret, { apiVersion: '2023-10-16' });
          return true;
        } catch {
          return false;
        }
      })(),
    );
    let platformConnectAccess = runtime.mode !== 'live';
    let platformConnectFailureReason: string | null = null;
    if (runtime.mode === 'live' && runtime.platformSecret && stripeClientInitialised) {
      try {
        const stripe = new Stripe(runtime.platformSecret, { apiVersion: '2023-10-16' });
        await stripe.accounts.list({ limit: 1 });
        platformConnectAccess = true;
      } catch (error: any) {
        platformConnectFailureReason = String(error?.code || error?.type || 'connect_platform_unavailable').slice(0, 120);
      }
    }
    const canReachAccountCreationStep =
      runtime.mode === 'live' &&
      platformSecretLoaded &&
      webhookSecretLoaded &&
      stripeClientInitialised &&
      platformConnectAccess;
    const result = {
      ok: canReachAccountCreationStep,
      mode: runtime.mode,
      checks: {
        platformSecretLoaded,
        webhookSecretLoaded,
        stripeClientInitialised,
        platformConnectAccess,
        platformConnectFailureReason,
        canReachAccountCreationStep,
      },
      state: canReachAccountCreationStep
        ? 'ready_for_confirmed_onboarding'
        : !platformSecretLoaded || !webhookSecretLoaded
          ? 'missing_config'
          : runtime.mode !== 'live'
            ? 'test_mode'
            : !platformConnectAccess
              ? 'connect_platform_unavailable'
            : 'runtime_unavailable',
      connectedAccountCreated: false,
      accountLinkCreated: false,
      secretsReturned: false,
    };
    await this.audit.log(
      input.actorCompanyId,
      'platform.payment_provider_config.preflight',
      `Stripe Connect onboarding preflight completed. Result=${JSON.stringify(result)}`,
      input.actorUserId,
    );
    return result;
  }

  async save(input: {
    platformSecret?: string;
    webhookSecret?: string;
    mode?: string;
    actorCompanyId: string;
    actorUserId: string;
    confirmation?: boolean;
  }) {
    if (input.confirmation !== true) throw new BadRequestException('Explicit confirmation is required.');
    const db = this.prisma as any;
    const existing = await db.platformPaymentProviderConfig.findUnique({ where: { id: CONFIG_ID } });
    const mode = this.normalizeMode(input.mode || existing?.mode || this.cached.mode);
    const platformSecret = this.normalizeCredentialInput(input.platformSecret);
    const webhookSecret = this.normalizeCredentialInput(input.webhookSecret);
    if (!platformSecret && !webhookSecret && !input.mode) throw new BadRequestException('Provide a credential or mode change.');
    this.validateStripeConnectInputs({ platformSecret, webhookSecret, mode });

    await db.platformPaymentProviderConfig.upsert({
      where: { id: CONFIG_ID },
      create: {
        id: CONFIG_ID,
        provider: PROVIDER,
        mode,
        platformSecretEncrypted: platformSecret ? encryptPlatformSecret(platformSecret) : null,
        platformSecretLastFour: platformSecret ? platformSecret.slice(-4) : null,
        webhookSecretEncrypted: webhookSecret ? encryptPlatformSecret(webhookSecret) : null,
        webhookSecretLastFour: webhookSecret ? webhookSecret.slice(-4) : null,
        credentialStatus: platformSecret ? 'needs_verification' : 'missing',
        webhookStatus: webhookSecret ? 'needs_verification' : 'missing',
        updatedByUserId: input.actorUserId,
      },
      update: {
        mode,
        ...(platformSecret
          ? {
              platformSecretEncrypted: encryptPlatformSecret(platformSecret),
              platformSecretLastFour: platformSecret.slice(-4),
              credentialStatus: 'needs_verification',
              credentialVerifiedAt: null,
              credentialFailureReason: null,
            }
          : {}),
        ...(webhookSecret
          ? {
              webhookSecretEncrypted: encryptPlatformSecret(webhookSecret),
              webhookSecretLastFour: webhookSecret.slice(-4),
              webhookStatus: 'needs_verification',
              webhookVerifiedAt: null,
              webhookFailureReason: null,
            }
          : {}),
        updatedByUserId: input.actorUserId,
      },
    });
    const savedRow = await db.platformPaymentProviderConfig.findUnique({ where: { id: CONFIG_ID } });
    await this.reload();
    const persistence = buildPlatformPersistenceState({
      row: savedRow,
      encryptedFields: ['platformSecretEncrypted', 'webhookSecretEncrypted'],
      touchedFields: [
        platformSecret ? 'platformSecretEncrypted' : null,
        webhookSecret ? 'webhookSecretEncrypted' : null,
      ].filter(Boolean) as string[],
      runtimeLoaded: this.getRuntimeStatus().runtimeLoaded,
    });
    const changed = [
      platformSecret ? `${existing?.platformSecretEncrypted ? 'rotated' : 'saved'} platform credential` : null,
      webhookSecret ? `${existing?.webhookSecretEncrypted ? 'rotated' : 'saved'} webhook credential` : null,
      input.mode ? `set ${mode} mode` : null,
    ].filter(Boolean).join(', ');
    await this.audit.log(input.actorCompanyId, 'platform.payment_provider_config.update', `Stripe Connect configuration updated: ${changed}`, input.actorUserId);
    return { ...(await this.getSafeStatus()), ...persistence };
  }

  async verify(input: { actorCompanyId: string; actorUserId: string }) {
    const db = this.prisma as any;
    const existing = await db.platformPaymentProviderConfig.findUnique({ where: { id: CONFIG_ID } });
    await this.reload();
    const runtime = this.getRuntimeConfig();
    if (!runtime.platformSecret) throw new ServiceUnavailableException('Stripe Connect platform credential is missing.');
    if (!runtime.webhookSecret) throw new ServiceUnavailableException('Stripe Connect webhook credential is missing.');
    let credentialStatus = 'failed';
    let credentialFailureReason: string | null = null;
    try {
      const stripe = new Stripe(runtime.platformSecret, { apiVersion: '2023-10-16' });
      await stripe.accounts.retrieve();
      await stripe.accounts.list({ limit: 1 });
      if (String(existing?.credentialFailureReason || '').startsWith('connect_onboarding_')) {
        credentialFailureReason = existing.credentialFailureReason;
      } else {
        credentialStatus = 'verified';
      }
    } catch (error: any) {
      credentialFailureReason = String(error?.code || error?.type || 'credential_verification_failed').slice(0, 120);
    }
    let webhookStatus = 'failed';
    let webhookFailureReason: string | null = 'webhook_verification_failed';
    try {
      const payload = JSON.stringify({ id: 'evt_platform_readiness', object: 'event', type: 'ping' });
      const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: runtime.webhookSecret });
      Stripe.webhooks.constructEvent(payload, signature, runtime.webhookSecret);
      webhookStatus = 'verified';
      webhookFailureReason = null;
    } catch {
      webhookFailureReason = 'webhook_secret_invalid';
    }
    const now = new Date();
    await db.platformPaymentProviderConfig.upsert({
      where: { id: CONFIG_ID },
      create: {
        id: CONFIG_ID,
        provider: PROVIDER,
        mode: runtime.mode,
        credentialStatus,
        credentialVerifiedAt: credentialStatus === 'verified' ? now : null,
        credentialFailureReason,
        webhookStatus,
        webhookVerifiedAt: webhookStatus === 'verified' ? now : null,
        webhookFailureReason,
        updatedByUserId: input.actorUserId,
      },
      update: {
        credentialStatus,
        credentialVerifiedAt: credentialStatus === 'verified' ? now : null,
        credentialFailureReason,
        webhookStatus,
        webhookVerifiedAt: webhookStatus === 'verified' ? now : null,
        webhookFailureReason,
        updatedByUserId: input.actorUserId,
      },
    });
    await this.audit.log(input.actorCompanyId, 'platform.payment_provider_config.verify', `Stripe Connect verification ${credentialStatus === 'verified' && webhookStatus === 'verified' ? 'passed' : 'failed'}`, input.actorUserId);
    return this.getSafeStatus();
  }

  async recordOnboardingCapability(input: { ok: boolean; failureReason?: string | null }) {
    const db = this.prisma as any;
    const now = new Date();
    await db.platformPaymentProviderConfig.updateMany({
      where: { id: CONFIG_ID },
      data: {
        credentialStatus: input.ok ? 'verified' : 'failed',
        credentialVerifiedAt: input.ok ? now : null,
        credentialFailureReason: input.ok
          ? null
          : `connect_onboarding_${String(input.failureReason || 'failed').replace(/[^a-z0-9_]+/gi, '_').slice(0, 90)}`,
      },
    });
  }

  async remove(input: { actorCompanyId: string; actorUserId: string; confirmation?: boolean }) {
    if (input.confirmation !== true) throw new BadRequestException('Explicit confirmation is required.');
    const db = this.prisma as any;
    await db.platformPaymentProviderConfig.deleteMany({ where: { id: CONFIG_ID } });
    this.cached = {
      platformSecret: null,
      webhookSecret: null,
      mode: this.normalizeMode(process.env.MYTITAN_TENANT_STRIPE_CONNECT_MODE),
    };
    this.runtimeReloadedAt = new Date();
    await this.audit.log(input.actorCompanyId, 'platform.payment_provider_config.delete', 'Stripe Connect vault credentials deleted', input.actorUserId);
    return this.getSafeStatus();
  }
}
