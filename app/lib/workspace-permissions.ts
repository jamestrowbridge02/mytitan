export const WORKSPACE_PERMISSIONS = [
  "settings.manage",
  "workflow.manage",
  "custom_fields.manage",
  "automations.manage",
  "billing.manage",
  "portal.manage",
  "technician.execute",
  "jobs.transition",
  "dashboard.view_intelligence",
] as const;

export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];
export type PermissionSnapshot = Record<WorkspacePermission, boolean>;

export const MODERN_WORKSPACE_ROLES = ["OWNER", "ADMIN", "DISPATCHER", "FINANCE", "TECHNICIAN", "VIEWER"] as const;

export const ASSIGNABLE_WORKSPACE_ROLES = ["ADMIN", "DISPATCHER", "FINANCE", "TECHNICIAN", "VIEWER"] as const;

export function emptyPermissionSnapshot(): PermissionSnapshot {
  return WORKSPACE_PERMISSIONS.reduce((snapshot, permission) => {
    snapshot[permission] = false;
    return snapshot;
  }, {} as PermissionSnapshot);
}

export function normalizePermissionSnapshot(input: unknown): PermissionSnapshot {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return WORKSPACE_PERMISSIONS.reduce((snapshot, permission) => {
    snapshot[permission] = raw[permission] === true;
    return snapshot;
  }, emptyPermissionSnapshot());
}

export function hasWorkspacePermission(
  permissions: PermissionSnapshot | null | undefined,
  permission: WorkspacePermission,
) {
  return Boolean(permissions?.[permission]);
}
