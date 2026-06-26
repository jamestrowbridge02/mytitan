import { ForbiddenException, Logger } from '@nestjs/common';
import { JwtPayload } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { isBillingAllowlisted } from './billing-allowlist';

type PlatformUserLike = Pick<JwtPayload, 'email' | 'companyId' | 'sub'> | { email?: string | null; companyId?: string | null; sub?: string | null };

function parseCsvEnv(name: string): string[] {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizePlatformUserEmail(email?: string | null) {
  return String(email || '').trim().toLowerCase();
}

export function hasTrustedInternalEmail(email: string) {
  return email.endsWith('@mytitan.co.uk');
}

export function isPlatformAdminUser(user?: PlatformUserLike | null) {
  if (!user) return false;
  const email = normalizePlatformUserEmail(user.email);
  if (!email) return false;
  const verified = (user as any).emailVerified === true;
  if (email === 'admin@mytitan.co.uk') return verified;
  if (hasTrustedInternalEmail(email) && verified) return true;
  const explicit = parseCsvEnv('MYTITAN_PLATFORM_ADMIN_EMAILS');
  if (explicit.includes(email)) return true;
  return isBillingAllowlisted(user);
}

export function isTrialExcludedUser(user?: PlatformUserLike | null) {
  if (!user) return false;
  const email = normalizePlatformUserEmail(user.email);
  if (!email) return false;
  if (email === 'support@mytitan.co.uk') return true;
  if (hasTrustedInternalEmail(email)) return true;
  const explicit = parseCsvEnv('MYTITAN_PLATFORM_ADMIN_EMAILS');
  if (explicit.includes(email)) return true;
  return isBillingAllowlisted(user);
}

export async function assertPlatformAdminAccess({
  user,
  audit,
  requestId,
  action,
}: {
  user: JwtPayload | undefined;
  audit?: AuditService;
  requestId?: string;
  action?: string;
}) {
  if (isPlatformAdminUser(user)) {
    return;
  }

  const logger = new Logger('PlatformAdmin');
  const message = `platform_admin_denied email=${user?.email || 'unknown'} action=${action || 'unknown'} requestId=${requestId || 'unknown'}`;
  try {
    if (user?.companyId && user?.sub) {
      await audit?.log(user.companyId, 'platform_admin_denied', message, user.sub);
    }
  } catch (error) {
    logger.warn(`${message} audit_error=${error instanceof Error ? error.message : String(error)}`);
  }

  throw new ForbiddenException('Platform admin access required');
}
