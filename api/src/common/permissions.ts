import { ForbiddenException, Logger } from '@nestjs/common';
import { JwtPayload } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { Role } from './constants';

export const PERMISSIONS = [
  'BILLING_MANAGE',
  'USER_INVITE',
  'USER_ROLE_ASSIGN',
  'USER_MANAGE',
  'EXPORT_DATA',
  'REFUND_MANAGE',
  'WEBHOOK_ADMIN',
  'AUTOMATIONS_ADMIN',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: [...PERMISSIONS],
  ADMIN: ['USER_INVITE', 'USER_MANAGE', 'AUTOMATIONS_ADMIN'],
  STAFF: [],
  READ_ONLY: [],
};

export function hasPermission(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export async function assertPermission({
  user,
  permission,
  audit,
  requestId,
  action,
}: {
  user: JwtPayload | undefined;
  permission: Permission;
  audit?: AuditService;
  requestId?: string;
  action?: string;
}): Promise<void> {
  if (!user?.role) {
    throw new ForbiddenException('Missing role context');
  }

  if (hasPermission(user.role, permission)) {
    return;
  }

  const logger = new Logger('Permissions');
  const message = `permission_denied permission=${permission} role=${user.role} action=${action || 'unknown'} requestId=${requestId || 'unknown'}`;

  try {
    await audit?.log(user.companyId, 'permission_denied', message, user.sub);
  } catch (error) {
    logger.warn(`${message} audit_error=${error instanceof Error ? error.message : String(error)}`);
  }

  throw new ForbiddenException('Insufficient permissions');
}
