import { JwtPayload } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { Role } from './constants';
export declare const PERMISSIONS: readonly ["BILLING_MANAGE", "USER_INVITE", "USER_ROLE_ASSIGN", "USER_MANAGE", "EXPORT_DATA", "REFUND_MANAGE", "WEBHOOK_ADMIN", "AUTOMATIONS_ADMIN"];
export type Permission = (typeof PERMISSIONS)[number];
export declare const ROLE_PERMISSIONS: Record<Role, Permission[]>;
export declare function hasPermission(role: Role | undefined, permission: Permission): boolean;
export declare function assertPermission({ user, permission, audit, requestId, action, }: {
    user: JwtPayload | undefined;
    permission: Permission;
    audit?: AuditService;
    requestId?: string;
    action?: string;
}): Promise<void>;
