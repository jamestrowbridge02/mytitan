export const ENTERPRISE_FEATURE_FLAGS = {
  enterprise_estimates_v1: {
    key: 'enterprise_estimates_v1',
    label: 'Enterprise estimates',
    description: 'Job-sheet estimate creation and approved quote conversion workflow.',
    defaultEnabled: true,
    safeForTenantOverride: true,
  },
  tenant_payments_byog_v1: {
    key: 'tenant_payments_byog_v1',
    label: 'Tenant-owned payments',
    description: 'BYOG customer payment provider readiness foundations.',
    defaultEnabled: false,
    safeForTenantOverride: false,
  },
  truck_stock_v1: {
    key: 'truck_stock_v1',
    label: 'Truck stock',
    description: 'Truck/van stock execution foundations.',
    defaultEnabled: false,
    safeForTenantOverride: true,
  },
  customer_eta_v1: {
    key: 'customer_eta_v1',
    label: 'Customer ETA',
    description: 'Coarse customer ETA and portal continuity foundations.',
    defaultEnabled: false,
    safeForTenantOverride: true,
  },
  offline_job_packets_v1: {
    key: 'offline_job_packets_v1',
    label: 'Offline job packets',
    description: 'Scoped job packet foundation without authenticated page caching.',
    defaultEnabled: false,
    safeForTenantOverride: false,
  },
  accounting_sync_v1: {
    key: 'accounting_sync_v1',
    label: 'Accounting sync bridge',
    description: 'Tenant-owned accounting export queues, mapping checks, and live-gated sync controls.',
    defaultEnabled: false,
    safeForTenantOverride: false,
  },
  accounting_live_xero_v1: {
    key: 'accounting_live_xero_v1',
    label: 'Xero live sync',
    description: 'Live Xero bridge remains blocked unless tenant OAuth and explicit platform flag are verified.',
    defaultEnabled: false,
    safeForTenantOverride: false,
  },
  accounting_live_quickbooks_v1: {
    key: 'accounting_live_quickbooks_v1',
    label: 'QuickBooks live sync',
    description: 'Live QuickBooks bridge remains blocked unless tenant OAuth and explicit platform flag are verified.',
    defaultEnabled: false,
    safeForTenantOverride: false,
  },
  route_preview_v1: {
    key: 'route_preview_v1',
    label: 'Route preview',
    description: 'Preview-only route recommendation bridge.',
    defaultEnabled: false,
    safeForTenantOverride: false,
  },
  public_booking_bundles_v1: {
    key: 'public_booking_bundles_v1',
    label: 'Public booking bundles',
    description: 'Customer-facing multi-service booking bundles with snapshot-safe pricing.',
    defaultEnabled: false,
    safeForTenantOverride: true,
  },
  advanced_rbac_v1: {
    key: 'advanced_rbac_v1',
    label: 'Advanced RBAC',
    description: 'Granular policy and audit hardening foundation.',
    defaultEnabled: false,
    safeForTenantOverride: false,
  },
  phase2_category_leader_v1: {
    key: 'phase2_category_leader_v1',
    label: 'Phase 2 category leader',
    description: 'Enterprise readiness layer for integrations, offline field service, reports, AI readiness, white-label, growth, and accreditation.',
    defaultEnabled: true,
    safeForTenantOverride: false,
  },
  offline_field_service_v2: {
    key: 'offline_field_service_v2',
    label: 'Offline field service v2',
    description: 'Assigned-job offline completion workflow with browser-safe binary queue foundations.',
    defaultEnabled: false,
    safeForTenantOverride: false,
  },
  enterprise_report_builder_v1: {
    key: 'enterprise_report_builder_v1',
    label: 'Enterprise report builder',
    description: 'Saved operational report builder using real tenant data only.',
    defaultEnabled: false,
    safeForTenantOverride: true,
  },
  operational_ai_readiness_v1: {
    key: 'operational_ai_readiness_v1',
    label: 'Operational AI readiness',
    description: 'Explainable, optional operational recommendations with evidence and no autonomous changes.',
    defaultEnabled: false,
    safeForTenantOverride: false,
  },
  white_label_readiness_v1: {
    key: 'white_label_readiness_v1',
    label: 'White-label readiness',
    description: 'Tenant branding, portal/email branding, custom-domain readiness, and tier-gated powered-by controls.',
    defaultEnabled: false,
    safeForTenantOverride: true,
  },
} as const;

export type EnterpriseFeatureFlagKey = keyof typeof ENTERPRISE_FEATURE_FLAGS;

export function isEnterpriseFeatureFlagKey(value: unknown): value is EnterpriseFeatureFlagKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ENTERPRISE_FEATURE_FLAGS, value);
}

export function getEnterpriseRuntimeEnvironment() {
  return String(process.env.MYTITAN_DEPLOY_ENV || process.env.NODE_ENV || 'development').trim().toLowerCase() || 'development';
}
