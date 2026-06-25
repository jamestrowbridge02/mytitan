import { ForbiddenException, Logger } from '@nestjs/common';
import { JwtPayload } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { Role } from './constants';

export const PERMISSIONS = [
  'settings.manage',
  'workflow.manage',
  'custom_fields.manage',
  'automations.manage',
  'billing.manage',
  'portal.manage',
  'technician.execute',
  'jobs.transition',
  'dashboard.view_intelligence',
  'users.invite',
  'users.role_assign',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type PermissionSnapshot = Record<Permission, boolean>;

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: [...PERMISSIONS],
  ADMIN: [...PERMISSIONS],
  DISPATCHER: ['portal.manage', 'jobs.transition', 'dashboard.view_intelligence'],
  FINANCE: ['billing.manage', 'dashboard.view_intelligence'],
  TECHNICIAN: ['technician.execute'],
  EXTERNAL_OPERATOR: ['technician.execute'],
  VIEWER: [],
  // Legacy roles remain supported to avoid breaking existing tenants.
  STAFF: [
    'automations.manage',
    'billing.manage',
    'portal.manage',
    'technician.execute',
    'jobs.transition',
    'dashboard.view_intelligence',
  ],
  READ_ONLY: ['dashboard.view_intelligence'],
};

const ROLE_FAMILY: Record<Role, Role[]> = {
  OWNER: ['OWNER'],
  ADMIN: ['ADMIN'],
  DISPATCHER: ['DISPATCHER'],
  FINANCE: ['FINANCE'],
  TECHNICIAN: ['TECHNICIAN'],
  EXTERNAL_OPERATOR: ['EXTERNAL_OPERATOR'],
  VIEWER: ['VIEWER'],
  // Legacy controller decorators often refer to STAFF/READ_ONLY.
  STAFF: ['STAFF', 'DISPATCHER', 'FINANCE', 'TECHNICIAN'],
  READ_ONLY: ['READ_ONLY', 'VIEWER'],
};

export function hasPermission(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getPermissionSnapshot(role: Role | undefined): PermissionSnapshot {
  return PERMISSIONS.reduce((snapshot, permission) => {
    snapshot[permission] = hasPermission(role, permission);
    return snapshot;
  }, {} as PermissionSnapshot);
}

export function roleSatisfiesRequirement(role: Role | undefined, requiredRole: Role): boolean {
  if (!role) return false;
  return ROLE_FAMILY[requiredRole]?.includes(role) ?? false;
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
