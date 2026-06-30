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

type CachedBillingStripeConfig = {
  billingSecret: string | null;
  webhookSecret: string | null;
  mode: 'test' | 'live';
};

const PROVIDER = 'mytitan_billing_stripe';
const CONFIG_ID = 'mytitan_billing_stripe';

@Injectable()
export class PlatformBillingStripeConfigService implements OnModuleInit {
  private cached: CachedBillingStripeConfig = {
    billingSecret: null,
    webhookSecret: null,
    mode: String(process.env.MYTITAN_BILLING_STRIPE_MODE || process.env.STRIPE_MODE || '').trim().toLowerCase() === 'live' ? 'live' : 'test',
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

  private validateBillingSecret(secret: string, mode: 'test' | 'live') {
    const expectedPrefix = mode === 'live' ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/;
    if (!expectedPrefix.test(secret)) {
      throw new BadRequestException(`MyTitan Billing Stripe ${mode} mode requires a matching ${mode} secret key.`);
    }
  }

  private validateWebhookSecret(secret: string) {
    if (!/^whsec_[A-Za-z0-9_]+$/.test(secret)) {
      throw new BadRequestException('MyTitan Billing Stripe webhook secret must start with whsec_.');
    }
  }

  async reload() {
    const db = this.prisma as any;
    const row = await db.platformBillingStripeConfig?.findUnique({ where: { id: CONFIG_ID } });
    this.cached = {
      billingSecret: this.decryptOptional(row?.billingSecretEncrypted),
      webhookSecret: this.decryptOptional(row?.webhookSecretEncrypted),
      mode: this.normalizeMode(row?.mode || process.env.MYTITAN_BILLING_STRIPE_MODE || process.env.STRIPE_MODE),
    };
    this.runtimeReloadedAt = new Date();
    return this.cached;
  }

  getRuntimeConfig() {
    return {
      billingSecret:
        this.cached.billingSecret ||
        String(process.env.STRIPE_SECRET_KEY || '').trim() ||
        null,
      webhookSecret:
        this.cached.webhookSecret ||
        String(process.env.STRIPE_WEBHOOK_SECRET || '').trim() ||
        null,
      mode: this.cached.mode,
    };
  }

  getRuntimeStatus() {
    const runtime = this.getRuntimeConfig();
    return {
      mode: runtime.mode,
      billingSecretLoaded: Boolean(runtime.billingSecret),
      webhookSecretLoaded: Boolean(runtime.webhookSecret),
      runtimeLoaded: Boolean(runtime.billingSecret && runtime.webhookSecret),
      lastReloadedAt: this.runtimeReloadedAt,
    };
  }

  private readiness(row: any) {
    const envBilling = String(process.env.STRIPE_SECRET_KEY || '').trim();
    const envWebhook = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
    const vaultBillingPresent = Boolean(row?.billingSecretEncrypted);
    const vaultWebhookPresent = Boolean(row?.webhookSecretEncrypted);
    const failed = row?.credentialStatus === 'failed' || row?.webhookStatus === 'failed';
    if (vaultBillingPresent || vaultWebhookPresent) {
      const vaultConfigPresent = vaultBillingPresent && vaultWebhookPresent;
      const vaultConfigDecryptable =
        this.encryptedSecretDecryptable(row?.billingSecretEncrypted) &&
        this.encryptedSecretDecryptable(row?.webhookSecretEncrypted);
      const vaultVerified = row?.credentialStatus === 'verified' && row?.webhookStatus === 'verified';
      const ready = vaultConfigPresent && vaultConfigDecryptable && vaultVerified;
      return failed ? 'failed_verification' : ready ? 'ready' : vaultConfigPresent ? 'needs_verification' : 'missing_config';
    }
    return envBilling && envWebhook ? 'ready' : 'missing_config';
  }

  async getSafeStatus() {
    const db = this.prisma as any;
    const row = await db.platformBillingStripeConfig?.findUnique({ where: { id: CONFIG_ID } });
    const envBilling = String(process.env.STRIPE_SECRET_KEY || '').trim();
    const envWebhook = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
    const vaultBillingDecryptable = this.encryptedSecretDecryptable(row?.billingSecretEncrypted);
    const vaultWebhookDecryptable = this.encryptedSecretDecryptable(row?.webhookSecretEncrypted);
    const runtime = this.getRuntimeStatus();
    return {
      provider: PROVIDER,
      mode: this.normalizeMode(row?.mode || process.env.MYTITAN_BILLING_STRIPE_MODE || process.env.STRIPE_MODE),
      readiness: this.readiness(row),
      billingSecret: {
        present: Boolean(row?.billingSecretEncrypted || envBilling),
        lastFour: row?.billingSecretLastFour || (envBilling ? envBilling.slice(-4) : null),
        source: row?.billingSecretEncrypted ? 'vault' : envBilling ? 'runtime_environment' : 'missing',
        verificationStatus: row?.billingSecretEncrypted
          ? vaultBillingDecryptable
            ? row?.credentialStatus || 'needs_verification'
            : 'needs_verification'
          : envBilling
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
      purpose: 'MyTitan subscriptions, plans, job packs, and platform billing only',
      secretsReturned: false,
    };
  }

  async save(input: {
    billingSecret?: string;
    webhookSecret?: string;
    mode?: string;
    actorCompanyId: string;
    actorUserId: string;
    confirmation?: boolean;
  }) {
    if (input.confirmation !== true) throw new BadRequestException('Explicit confirmation is required.');
    const db = this.prisma as any;
    const existing = await db.platformBillingStripeConfig?.findUnique({ where: { id: CONFIG_ID } });
    const mode = this.normalizeMode(input.mode || existing?.mode || this.cached.mode);
    const billingSecret = String(input.billingSecret || '').trim();
    const webhookSecret = String(input.webhookSecret || '').trim();
    if (!billingSecret && !webhookSecret && !input.mode) throw new BadRequestException('Provide a credential or mode change.');
    if (billingSecret) this.validateBillingSecret(billingSecret, mode);
    if (webhookSecret) this.validateWebhookSecret(webhookSecret);

    await db.platformBillingStripeConfig.upsert({
      where: { id: CONFIG_ID },
      create: {
        id: CONFIG_ID,
        provider: PROVIDER,
        mode,
        billingSecretEncrypted: billingSecret ? encryptPlatformSecret(billingSecret) : null,
        billingSecretLastFour: billingSecret ? billingSecret.slice(-4) : null,
        webhookSecretEncrypted: webhookSecret ? encryptPlatformSecret(webhookSecret) : null,
        webhookSecretLastFour: webhookSecret ? webhookSecret.slice(-4) : null,
        credentialStatus: billingSecret ? 'needs_verification' : 'missing',
        webhookStatus: webhookSecret ? 'needs_verification' : 'missing',
        updatedByUserId: input.actorUserId,
      },
      update: {
        mode,
        ...(billingSecret
          ? {
              billingSecretEncrypted: encryptPlatformSecret(billingSecret),
              billingSecretLastFour: billingSecret.slice(-4),
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
    const savedRow = await db.platformBillingStripeConfig.findUnique({ where: { id: CONFIG_ID } });
    await this.reload();
    const persistence = buildPlatformPersistenceState({
      row: savedRow,
      encryptedFields: ['billingSecretEncrypted', 'webhookSecretEncrypted'],
      touchedFields: [
        billingSecret ? 'billingSecretEncrypted' : null,
        webhookSecret ? 'webhookSecretEncrypted' : null,
      ].filter(Boolean) as string[],
      runtimeLoaded: this.getRuntimeStatus().runtimeLoaded,
    });
    const changed = [
      billingSecret ? `${existing?.billingSecretEncrypted ? 'rotated' : 'saved'} billing credential` : null,
      webhookSecret ? `${existing?.webhookSecretEncrypted ? 'rotated' : 'saved'} webhook credential` : null,
      input.mode ? `set ${mode} mode` : null,
    ].filter(Boolean).join(', ');
    await this.audit.log(input.actorCompanyId, 'platform.billing_stripe_config.update', `MyTitan Billing Stripe configuration updated: ${changed}`, input.actorUserId);
    return { ...(await this.getSafeStatus()), ...persistence };
  }

  async verify(input: { actorCompanyId: string; actorUserId: string }) {
    const db = this.prisma as any;
    await this.reload();
    const runtime = this.getRuntimeConfig();
    if (!runtime.billingSecret) throw new ServiceUnavailableException('MyTitan Billing Stripe credential is missing.');
    if (!runtime.webhookSecret) throw new ServiceUnavailableException('MyTitan Billing Stripe webhook credential is missing.');
    let credentialStatus = 'failed';
    let credentialFailureReason: string | null = null;
    try {
      const stripe = new Stripe(runtime.billingSecret, { apiVersion: '2023-10-16' });
      await stripe.balance.retrieve();
      credentialStatus = 'verified';
    } catch (error: any) {
      credentialFailureReason = String(error?.code || error?.type || 'credential_verification_failed').slice(0, 120);
    }
    let webhookStatus = 'failed';
    let webhookFailureReason: string | null = 'webhook_verification_failed';
    try {
      const payload = JSON.stringify({ id: 'evt_billing_readiness', object: 'event', type: 'ping' });
      const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: runtime.webhookSecret });
      Stripe.webhooks.constructEvent(payload, signature, runtime.webhookSecret);
      webhookStatus = 'verified';
      webhookFailureReason = null;
    } catch {
      webhookFailureReason = 'webhook_secret_invalid';
    }
    const now = new Date();
    await db.platformBillingStripeConfig.upsert({
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
    await this.audit.log(input.actorCompanyId, 'platform.billing_stripe_config.verify', `MyTitan Billing Stripe verification ${credentialStatus === 'verified' && webhookStatus === 'verified' ? 'passed' : 'failed'}`, input.actorUserId);
    return this.getSafeStatus();
  }

  async reloadRuntime(input: { actorCompanyId: string; actorUserId: string }) {
    const before = this.getRuntimeStatus();
    await this.reload();
    const after = this.getRuntimeStatus();
    await this.audit.log(
      input.actorCompanyId,
      'platform.billing_stripe_config.reload',
      `MyTitan Billing Stripe runtime configuration reloaded. Before=${JSON.stringify(before)} After=${JSON.stringify(after)}`,
      input.actorUserId,
    );
    return this.getSafeStatus();
  }

  async remove(input: { actorCompanyId: string; actorUserId: string; confirmation?: boolean }) {
    if (input.confirmation !== true) throw new BadRequestException('Explicit confirmation is required.');
    const db = this.prisma as any;
    await db.platformBillingStripeConfig.deleteMany({ where: { id: CONFIG_ID } });
    this.cached = {
      billingSecret: null,
      webhookSecret: null,
      mode: this.normalizeMode(process.env.MYTITAN_BILLING_STRIPE_MODE || process.env.STRIPE_MODE),
    };
    this.runtimeReloadedAt = new Date();
    await this.audit.log(input.actorCompanyId, 'platform.billing_stripe_config.delete', 'MyTitan Billing Stripe vault credentials deleted', input.actorUserId);
    return this.getSafeStatus();
  }
}
