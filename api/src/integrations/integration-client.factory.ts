import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { IntegrationConnectionScope, IntegrationCredential, IntegrationCredentialStatus, TenantIntegrationProvider } from '@prisma/client';
import * as crypto from 'crypto';
import { decryptText } from './integrations.crypto';
import { PrismaService } from '../prisma/prisma.service';
import { resolveByogProvider } from './byog-integrations';

export type IntegrationClientErrorCategory =
  | 'missing_encryption_key'
  | 'missing_credentials'
  | 'disabled'
  | 'needs_reauth'
  | 'not_found'
  | 'invalid_signature'
  | 'unsupported_provider'
  | 'provider_error';

export type ResolvedIntegrationClient =
  | {
      ok: true;
      provider: TenantIntegrationProvider;
      scope: IntegrationConnectionScope;
      routeId: string;
      status: IntegrationCredentialStatus;
      metadata: Record<string, any>;
      payload: Record<string, any>;
      secretMaterial: string | null;
      credential: IntegrationCredential;
    }
  | {
      ok: false;
      provider: TenantIntegrationProvider;
      category: IntegrationClientErrorCategory;
    };

type ResolveClientInput = {
  tenantId: string;
  provider: string | TenantIntegrationProvider;
  scope?: IntegrationConnectionScope;
  scopeOwnerKey?: string | null;
  userId?: string | null;
  allowNeedsReauth?: boolean;
  allowDisabled?: boolean;
};

@Injectable()
export class IntegrationClientFactory {
  constructor(private readonly prisma: PrismaService) {}

  private decryptOptional(value?: string | null) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
      return decryptText(raw);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException('Integration secret storage is unavailable on this runtime.');
    }
  }

  decryptSecretMaterial(value?: string | null) {
    return this.decryptOptional(value);
  }

  private resolveScopeOwnerKey(input: { scope: IntegrationConnectionScope; scopeOwnerKey?: string | null; userId?: string | null }) {
    if (input.scope === 'USER') {
      return String(input.scopeOwnerKey || input.userId || '').trim();
    }
    return 'workspace';
  }

  private parseJsonObject(value: string | null) {
    if (!value) return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  async resolveScopedClient(input: ResolveClientInput): Promise<ResolvedIntegrationClient> {
    const provider = resolveByogProvider(input.provider);
    if (!provider) {
      return { ok: false, provider: 'GENERIC_API', category: 'unsupported_provider' };
    }
    const scope = input.scope || 'WORKSPACE';
    const scopeOwnerKey = this.resolveScopeOwnerKey({ scope, scopeOwnerKey: input.scopeOwnerKey, userId: input.userId });
    if (scope === 'USER' && !scopeOwnerKey) {
      return { ok: false, provider, category: 'not_found' };
    }

    const credential = await (this.prisma as any).integrationCredential.findUnique({
      where: {
        tenantId_provider_scope_scopeOwnerKey: {
          tenantId: input.tenantId,
          provider,
          scope,
          scopeOwnerKey,
        },
      },
    });

    if (!credential) {
      return { ok: false, provider, category: 'not_found' };
    }
    if (credential.status === 'DISABLED' && !input.allowDisabled) {
      return { ok: false, provider, category: 'disabled' };
    }
    if (credential.status === 'NEEDS_REAUTH' && !input.allowNeedsReauth) {
      return { ok: false, provider, category: 'needs_reauth' };
    }

    try {
      const payload = this.parseJsonObject(this.decryptOptional(credential.encryptedPayload));
      const secretMaterial = this.decryptOptional(credential.encryptedSecretMaterial);
      if (!Object.keys(payload).length && !secretMaterial) {
        return { ok: false, provider, category: 'missing_credentials' };
      }
      return {
        ok: true,
        provider,
        scope,
        routeId: String(credential.routeId || '').trim(),
        status: credential.status,
        metadata: credential.metadataJson && typeof credential.metadataJson === 'object' && !Array.isArray(credential.metadataJson)
          ? credential.metadataJson as Record<string, any>
          : {},
        payload,
        secretMaterial,
        credential,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        return { ok: false, provider, category: 'missing_encryption_key' };
      }
      return { ok: false, provider, category: 'provider_error' };
    }
  }

  async resolveWebhookRoute(providerInput: string, routeId: string) {
    const provider = resolveByogProvider(providerInput);
    if (!provider) {
      throw new NotFoundException('Unknown integration route.');
    }
    const credential = await (this.prisma as any).integrationCredential.findFirst({
      where: {
        provider,
        routeId: String(routeId || '').trim(),
      },
    });
    if (!credential) {
      throw new NotFoundException('Unknown integration route.');
    }
    return credential as IntegrationCredential;
  }

  verifyHmacSignature(input: {
    secret: string;
    payload: Buffer;
    providedSignature?: string | string[] | null;
  }) {
    const provided = Array.isArray(input.providedSignature)
      ? String(input.providedSignature[0] || '').trim()
      : String(input.providedSignature || '').trim();
    if (!provided) return false;
    const normalizedProvided = provided.startsWith('sha256=') ? provided.slice(7) : provided;
    const expected = crypto.createHmac('sha256', input.secret).update(input.payload).digest('hex');
    const left = Buffer.from(normalizedProvided);
    const right = Buffer.from(expected);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }
}
