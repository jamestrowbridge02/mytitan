import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { LoadingState } from "../../../components/states/LoadingState";
import {
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorGuidance,
  OperatorPageHeader,
  OperatorStatusBadge,
} from "../../../components/ui/operator-page";
import { apiFetch } from "../../../lib/api";

type ReadinessState = "ready" | "needs_review" | "needs_setup" | "not_configured" | "unknown";
type MonitoringState = "healthy" | "degraded" | "attention_needed" | "down";

type MePayload = {
  role?: string;
  platformAdmin?: boolean;
};

type OperationsReadiness = {
  checkedAt: string;
  scope?: "tenant_business" | "platform";
  platformDiagnosticsVisible?: boolean;
  runtime: {
    integrationsEncryptionKeyConfigured?: boolean;
    stripeSecretConfigured?: boolean;
    stripeWebhookConfigured?: boolean;
    backupEncryptionKeyConfigured?: boolean;
    appPublicUrlConfigured?: boolean;
    apiPublicUrlConfigured?: boolean;
    summarySchedulerDeclared: boolean;
    summarySchedulerStatus?: "ready" | "not_configured" | "unknown";
    summarySchedulerDetail?: string | null;
    deploymentValidationDeclared?: boolean;
    stripeCanaryStatus?: string | null;
  };
  abuseProtection: {
    authThrottleConfigured: boolean;
    passwordResetThrottleConfigured: boolean;
    globalBurstThrottleConfigured: boolean;
    uploadLimitConfigured: boolean;
    webhookSignatureVerificationConfigured: boolean;
    publicBookingRateLimitConfigured: boolean;
  };
  backupReadiness?: {
    status?: "ready" | "needs_backup_run" | "needs_restore_drill" | "needs_schedule" | "unknown";
    detail?: string;
    lastBackupAt?: string | null;
    lastRestoreDrillAt?: string | null;
  };
  externalMonitoring?: {
    detail?: string;
    appStatus?: string | null;
    apiStatus?: string | null;
    marketingStatus?: string | null;
    nginxStatus?: string | null;
    tlsStatus?: string | null;
    tlsExpiry?: string | null;
    tlsDetail?: string | null;
    externalMonitorStatus?: string | null;
    externalMonitorDetail?: string | null;
  };
};

type InternalMonitoringSnapshot = {
  checkedAt: string;
  cached: boolean;
  refreshIntervalSeconds: number;
  overall: {
    state: MonitoringState;
    score: number;
    label: "Healthy" | "Degraded" | "Attention needed" | "Down";
    summary: string;
    healthyCount: number;
    degradedCount: number;
    attentionCount: number;
    downCount: number;
    availabilityPercentage: number;
    averageResponseBand: string;
    lastRecoveryAt?: string | null;
  };
  services: Array<{
    key: string;
    label: string;
    state: MonitoringState;
    summary: string;
    detail: string;
    checkedAt: string;
    lastSuccessfulCheckAt?: string | null;
    responseTimeMs?: number | null;
    responseTimeBand?: "fast" | "steady" | "slow" | "unknown";
    recentStates: MonitoringState[];
    availabilityRatio: number;
    availabilityPercentage: number;
    availabilityLabel: string;
    degradedMinutes: number;
    lastRecoveredAt?: string | null;
    lastStableAt?: string | null;
  }>;
  incidents: Array<{
    key: string;
    label: string;
    state: MonitoringState;
    phase: "Investigating" | "Recovered" | "Resolved";
    summary: string;
    occurredAt: string;
    resolvedAt?: string | null;
    durationMinutes?: number | null;
  }>;
  historyWindow: {
    sampleCount: number;
    maxSamples: number;
    hoursCovered: number;
    summary: string;
  };
  runtimeFreshness: {
    bootedAt: string;
    uptimeMinutes: number;
    summary: string;
  };
  externalMonitoring: {
    status?: string | null;
    summary: string;
  };
};

type MonitoringAction =
  | "refresh_snapshot"
  | "run_health_check"
  | "verify_notification_routing"
  | "check_billing_readiness"
  | "validate_backups";

type MonitoringActionResult = {
  action: MonitoringAction;
  checkedAt: string;
  label: string;
  state: MonitoringState;
  summary: string;
  detail: string;
  snapshot?: InternalMonitoringSnapshot;
};

type EmailReadiness = {
  status: "ready" | "not_configured" | "misconfigured" | "failing";
  guidance: string;
  effective?: {
    canSend?: boolean;
    guidance?: string;
  };
};

type SummaryReadiness = {
  recipientCount?: number;
  runtimeNote?: string;
};

type OpsAlertStatus = {
  ownerAdminRecipientCount?: number;
  extraRecipientCount?: number;
  resolvedRecipientCount?: number;
  runtimeNote?: string;
};

type IntegrationHealth = {
  webhookPlatform: {
    guidance: string;
  };
};

type BookingSettings = {
  publicUrl?: string | null;
  publicEnabled?: boolean;
};

type CommRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  reasonKey?: string | null;
  createdAt?: string | null;
};

type IntegrationRolloutMonitoring = {
  counts: {
    personalIntegrationSaveFailures: number;
    workspaceIntegrationSaveFailures: number;
    encryptionReadinessFailures: number;
    crossScopeAccessAttempts: number;
    providerSetupErrors: number;
  };
};

type BillingOpsSnapshot = {
  paymentCollection?: {
    customerCollection?: {
      preferredProvider?: string;
      providers?: Array<{
        provider: string;
        live: boolean;
      }>;
    };
  } | null;
  pricingModel?: {
    subscriptionPricingReadiness?: {
      status?: string;
      message?: string;
    } | null;
  } | null;
  jobCompletionPacks?: {
    status?: string;
    checkoutEnabled?: boolean;
    summary?: string;
  } | null;
};

const OPS_REASON_LABELS: Record<string, string> = {
  failed_email: "Email failure",
  failed_summary_dispatch: "Summary dispatch failure",
  failed_payment: "Payment failure",
  failed_webhook: "Webhook failure",
  failed_backup: "Backup failure",
  health_degraded: "Health alert",
};

const governanceRows = [
  {
    area: "Privacy policy",
    state: "ready" as ReadinessState,
    detail: "The public privacy route is live and operator-approved.",
    href: "https://mytitan.co.uk/privacy",
    action: "Review published page",
  },
  {
    area: "Terms",
    state: "ready" as ReadinessState,
    detail: "The public terms route is live and operator-approved.",
    href: "https://mytitan.co.uk/terms",
    action: "Review published page",
  },
  {
    area: "Cookie policy",
    state: "ready" as ReadinessState,
    detail: "The cookie policy route is live and operator-approved.",
    href: "https://mytitan.co.uk/cookies",
    action: "Review published page",
  },
  {
    area: "Data retention",
    state: "ready" as ReadinessState,
    detail: "The data retention route is live and operator-approved.",
    href: "https://mytitan.co.uk/data-retention",
    action: "Review published page",
  },
];

function mapCommReasonToOpsCategory(reasonKey?: string | null) {
  const normalized = String(reasonKey || "").trim().toLowerCase();
  if (normalized.includes("summary")) return "failed_summary_dispatch";
  if (normalized.includes("webhook")) return "failed_webhook";
  if (normalized.includes("backup") || normalized.includes("restore")) return "failed_backup";
  if (normalized.includes("payment") || normalized.includes("deposit")) return "failed_payment";
  if (normalized.includes("health")) return "health_degraded";
  return "failed_email";
}

function toneFromState(state: ReadinessState) {
  if (state === "ready") return "success" as const;
  if (state === "unknown" || state === "needs_review" || state === "needs_setup") return "warning" as const;
  return "critical" as const;
}

function labelFromState(state: ReadinessState) {
  if (state === "ready") return "Ready";
  if (state === "unknown") return "Unknown";
  if (state === "needs_review") return "Needs review";
  if (state === "needs_setup") return "Needs setup";
  return "Not configured";
}

function toneFromMonitoringState(state: MonitoringState) {
  if (state === "healthy") return "success" as const;
  if (state === "degraded" || state === "attention_needed") return "warning" as const;
  return "critical" as const;
}

function labelFromMonitoringState(state: MonitoringState) {
  if (state === "healthy") return "Healthy";
  if (state === "degraded") return "Degraded";
  if (state === "attention_needed") return "Attention needed";
  return "Down";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not checked";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not checked";
  return date.toLocaleString();
}

function responseBandLabel(value?: "fast" | "steady" | "slow" | "unknown") {
  if (value === "fast") return "Fast";
  if (value === "steady") return "Steady";
  if (value === "slow") return "Slow";
  return "Host-only";
}

export default function SettingsOperationsPage() {
  const [me, setMe] = useState<MePayload | null>(null);
  const [ops, setOps] = useState<OperationsReadiness | null>(null);
  const [monitoring, setMonitoring] = useState<InternalMonitoringSnapshot | null>(null);
  const [workspaceEmail, setWorkspaceEmail] = useState<EmailReadiness | null>(null);
  const [systemEmail, setSystemEmail] = useState<EmailReadiness | null>(null);
  const [summaryReadiness, setSummaryReadiness] = useState<SummaryReadiness | null>(null);
  const [opsAlerts, setOpsAlerts] = useState<OpsAlertStatus | null>(null);
  const [integrationHealth, setIntegrationHealth] = useState<IntegrationHealth | null>(null);
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);
  const [failedComms, setFailedComms] = useState<CommRow[]>([]);
  const [integrationMonitoring, setIntegrationMonitoring] = useState<IntegrationRolloutMonitoring | null>(null);
  const [billingOps, setBillingOps] = useState<BillingOpsSnapshot | null>(null);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"basic" | "advanced">("basic");
  const [busyAction, setBusyAction] = useState<MonitoringAction | "">("");
  const [actionResult, setActionResult] = useState<MonitoringActionResult | null>(null);

  async function loadPage() {
    const meRes = (await apiFetch("/me")) as MePayload | null;
    setMe(meRes);
    const allowed = Boolean(meRes?.platformAdmin || meRes?.role === "OWNER" || meRes?.role === "ADMIN");
    if (!allowed) {
      setError("");
      return;
    }
    const [opsRes, monitoringRes, workspaceEmailRes, systemEmailRes, summaryRes, opsAlertRes, integrationRes, rolloutRes, billingRes, bookingRes, failedRes] = await Promise.all([
      apiFetch("/tenant/settings/operations-readiness"),
      meRes?.platformAdmin ? apiFetch("/tenant/settings/internal-monitoring") : Promise.resolve(null),
      apiFetch("/tenant/settings/email-readiness"),
      apiFetch("/tenant/settings/email-readiness?ownership=system"),
      apiFetch("/notifications/summaries/readiness"),
      apiFetch("/notifications/ops-alerts/status"),
      apiFetch("/integrations/health"),
      apiFetch("/integrations/rollout-monitoring"),
      apiFetch("/billing/me"),
      apiFetch("/booking/settings"),
      apiFetch("/notifications/comms?scope=tenant&status=failed&limit=50").catch(() => []),
    ]);
    setOps((opsRes || null) as OperationsReadiness | null);
    setMonitoring((monitoringRes || null) as InternalMonitoringSnapshot | null);
    setWorkspaceEmail((workspaceEmailRes || null) as EmailReadiness | null);
    setSystemEmail((systemEmailRes || null) as EmailReadiness | null);
    setSummaryReadiness((summaryRes || null) as SummaryReadiness | null);
    setOpsAlerts((opsAlertRes || null) as OpsAlertStatus | null);
    setIntegrationHealth((integrationRes || null) as IntegrationHealth | null);
    setIntegrationMonitoring((rolloutRes || null) as IntegrationRolloutMonitoring | null);
    setBillingOps((billingRes || null) as BillingOpsSnapshot | null);
    setBookingSettings((bookingRes || null) as BookingSettings | null);
    setFailedComms(Array.isArray(failedRes) ? (failedRes as CommRow[]) : []);
    setError("");
  }

  useEffect(() => {
    let cancelled = false;
    void loadPage()
      .then(() => {
        if (cancelled) return;
      })
      .catch((nextError: any) => {
        if (cancelled) return;
        setError(nextError?.message || "Failed to load operations");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canViewMonitoring = Boolean(me?.platformAdmin || me?.role === "OWNER" || me?.role === "ADMIN");
  const canViewPlatformDiagnostics = Boolean(me?.platformAdmin);
  const latestOpsFailures = useMemo(() => {
    const categories = ["failed_backup", "failed_summary_dispatch", "failed_webhook", "failed_payment", "failed_email"] as const;
    return categories.map((category) => ({
      category,
      label: OPS_REASON_LABELS[category],
      row: failedComms.find((row) => mapCommReasonToOpsCategory(row.reasonKey) === category) || null,
    }));
  }, [failedComms]);

  const readinessRows = useMemo(() => {
    const workspaceEmailReady = Boolean(workspaceEmail?.effective?.canSend);
    const systemEmailReady = systemEmail?.status === "ready";
    const platformDiagnosticsVisible = ops?.platformDiagnosticsVisible === true;
    const summarySchedulerReady = ops?.runtime?.summarySchedulerStatus === "ready" || Boolean(ops?.runtime?.summarySchedulerDeclared);
    const summarySchedulerUnknown = ops?.runtime?.summarySchedulerStatus === "unknown";
    const summarySchedulerDetail =
      ops?.runtime?.summarySchedulerDetail ||
      summaryReadiness?.runtimeNote ||
      "Summary scheduling is managed by MyTitan platform operations.";
    const subscriptionPricingStatus = String(billingOps?.pricingModel?.subscriptionPricingReadiness?.status || "").toLowerCase();
    const jobPackStatus = String(billingOps?.jobCompletionPacks?.status || "").toLowerCase();
    const preferredProvider = String(billingOps?.paymentCollection?.customerCollection?.preferredProvider || "MANUAL").toUpperCase();
    const preferredProviderRow = billingOps?.paymentCollection?.customerCollection?.providers?.find((provider) => provider.provider === preferredProvider);
    const customerPaymentReady = Boolean(preferredProviderRow?.live) || preferredProvider === "MANUAL";
    const backupStatus = ops?.backupReadiness?.status || "hidden";
    const externalHostChecksReady =
      ops?.externalMonitoring?.appStatus === "ready" &&
      ops?.externalMonitoring?.apiStatus === "ready" &&
      ops?.externalMonitoring?.marketingStatus === "ready" &&
      ops?.externalMonitoring?.nginxStatus === "ready" &&
      ops?.externalMonitoring?.tlsStatus === "ready";

    return [
      {
        key: "integrations-key",
        area: "Integrations key",
        platformOnly: true,
        state: "not_configured",
        detail: integrationHealth?.webhookPlatform.guidance || "Webhook secret storage needs a dedicated runtime key.",
        href: "/dashboard/integrations",
        action: "Open integrations",
      },
      {
        key: "summary-scheduler",
        area: "Scheduler",
        platformOnly: true,
        state: summarySchedulerReady ? "ready" : summarySchedulerUnknown ? "unknown" : "not_configured",
        detail: summarySchedulerDetail,
        href: "/dashboard/settings/operations",
        action: "Review scheduler",
      },
      {
        key: "subscription-pricing",
        area: "Billing readiness",
        state: subscriptionPricingStatus === "ready" ? "ready" : subscriptionPricingStatus === "mismatch" ? "not_configured" : "needs_setup",
        detail: subscriptionPricingStatus === "ready" ? "Your subscription options are available." : "Review your plan and payment details.",
        href: "/dashboard/billing",
        action: "Review billing",
      },
      {
        key: "job-pack-sync",
        area: "Job-pack readiness",
        state: jobPackStatus === "ready" ? "ready" : jobPackStatus ? "needs_setup" : "not_configured",
        detail: billingOps?.jobCompletionPacks?.checkoutEnabled ? "Extra job capacity is available." : "Choose a plan with more included job capacity.",
        href: "/dashboard/billing",
        action: "Open billing",
      },
      {
        key: "customer-payment-provider",
        area: "Customer payment setup",
        state: customerPaymentReady ? "ready" : "needs_setup",
        detail: preferredProvider === "MANUAL" ? "Manual collection remains the truthful fallback until a tenant-owned provider is live." : preferredProviderRow?.live ? "A tenant-owned payment provider is marked live for customer collection." : "Customer collection still needs a tenant-owned provider. MyTitan billing Stripe is not used for customer money.",
        href: "/dashboard/billing",
        action: "Manage payment setup",
      },
      {
        key: "ops-alerts",
        area: "Operational alerts",
        state: Number(opsAlerts?.ownerAdminRecipientCount || 0) > 0 ? "ready" : "needs_setup",
        detail: Number(opsAlerts?.ownerAdminRecipientCount || 0) > 0 ? "Business alerts have an owner or admin recipient." : "Choose who should receive important business alerts.",
        href: "/dashboard/settings?tab=messages",
        action: "Manage notifications",
      },
      {
        key: "system-sender",
        area: "System notifications",
        state: systemEmailReady ? "ready" : "needs_setup",
        detail: systemEmailReady ? "System notifications are ready." : "Notification delivery needs attention.",
        href: "/dashboard/settings?tab=messages",
        action: "Review email settings",
      },
      {
        key: "workspace-sender",
        area: "Workspace sender",
        state: workspaceEmailReady ? "ready" : "needs_setup",
        detail: workspaceEmailReady ? "Your business sender is ready." : "Add and verify your business email details.",
        href: "/dashboard/settings?tab=messages",
        action: "Manage sender",
      },
      {
        key: "stripe-webhook",
        area: "Payment connection",
        state: customerPaymentReady ? "ready" : "needs_setup",
        detail: "Payment connection readiness is shown through tenant-owned collection status, not platform runtime secrets.",
        href: "/dashboard/integrations",
        action: "Review payments",
      },
      {
        key: "public-url",
        area: "Booking page",
        state: bookingSettings?.publicUrl && bookingSettings?.publicEnabled ? "ready" : "needs_setup",
        detail: bookingSettings?.publicUrl && bookingSettings?.publicEnabled ? "A public booking route is ready to share once services and hours are confirmed." : "Publish the booking page from Settings before sharing it externally.",
        href: "/dashboard/booking/settings",
        action: "Manage booking setup",
      },
      {
        key: "backup",
        area: "Backup readiness",
        state: backupStatus === "ready" ? "ready" : backupStatus === "unknown" ? "unknown" : "needs_setup",
        detail: ops?.backupReadiness?.detail || (ops?.runtime.backupEncryptionKeyConfigured ? "Backup encryption is configured, but host-visible backup evidence is limited in this runtime." : "Set BACKUP_ENCRYPTION_KEY before relying on encrypted backups."),
        href: "/dashboard/settings/operations",
        action: "Open runbook",
        platformOnly: true,
      },
      {
        key: "external-monitoring",
        area: "Public reachability & certificates",
        state: externalHostChecksReady ? "ready" : "unknown",
        detail: ops?.externalMonitoring?.detail || "Host-visible public URL, certificate, and web gateway checks are not fully available from this runtime.",
        href: "/dashboard/settings/launch-control",
        action: "Open Launch Control",
        platformOnly: true,
      },
      {
        key: "public-bases",
        area: "Public entry points",
        state: "not_configured",
        detail: "Public base URL validation is a platform-admin diagnostic.",
        href: "/dashboard/settings/operations",
        action: "Use deployment runbook",
        platformOnly: true,
      },
      {
        key: "deploy-validation",
        area: "Release validation",
        state: "not_configured",
        detail: "Release validation evidence is a platform-admin diagnostic.",
        href: "/dashboard/settings/operations",
        action: "Open validation guidance",
        platformOnly: true,
      },
      {
        key: "stripe-canary",
        area: "Payment canary record",
        state: "not_configured",
        detail: "Stripe canary evidence is a platform-admin diagnostic.",
        href: "/dashboard/integrations",
        action: "Review payment readiness",
        platformOnly: true,
      },
    ].filter((row: any) => platformDiagnosticsVisible || !row.platformOnly) as Array<{ key: string; area: string; state: ReadinessState; detail: string; href: string; action: string }>;
  }, [
    billingOps?.jobCompletionPacks?.checkoutEnabled,
    billingOps?.jobCompletionPacks?.status,
    billingOps?.jobCompletionPacks?.summary,
    billingOps?.paymentCollection?.customerCollection?.preferredProvider,
    billingOps?.paymentCollection?.customerCollection?.providers,
    billingOps?.pricingModel?.subscriptionPricingReadiness?.message,
    billingOps?.pricingModel?.subscriptionPricingReadiness?.status,
    bookingSettings?.publicEnabled,
    bookingSettings?.publicUrl,
    integrationHealth?.webhookPlatform.guidance,
    ops?.backupReadiness?.detail,
    ops?.backupReadiness?.status,
    ops?.externalMonitoring?.apiStatus,
    ops?.externalMonitoring?.appStatus,
    ops?.externalMonitoring?.detail,
    ops?.externalMonitoring?.marketingStatus,
    ops?.externalMonitoring?.nginxStatus,
    ops?.externalMonitoring?.tlsStatus,
    ops?.runtime.apiPublicUrlConfigured,
    ops?.runtime.appPublicUrlConfigured,
    ops?.runtime.backupEncryptionKeyConfigured,
    ops?.runtime.deploymentValidationDeclared,
    ops?.runtime.integrationsEncryptionKeyConfigured,
    ops?.runtime.stripeCanaryStatus,
    ops?.runtime.stripeWebhookConfigured,
    ops?.runtime.summarySchedulerDeclared,
    ops?.runtime.summarySchedulerDetail,
    ops?.runtime.summarySchedulerStatus,
    opsAlerts?.ownerAdminRecipientCount,
    opsAlerts?.runtimeNote,
    summaryReadiness?.runtimeNote,
    systemEmail?.guidance,
    systemEmail?.status,
    workspaceEmail?.effective?.canSend,
    workspaceEmail?.effective?.guidance,
    workspaceEmail?.guidance,
  ]);

  const readinessCounts = {
    ready: readinessRows.filter((row) => row.state === "ready").length,
    needsSetup: readinessRows.filter((row) => row.state === "needs_setup" || row.state === "not_configured").length,
    attention: readinessRows.filter((row) => row.state === "needs_review" || row.state === "unknown").length,
  };
  const recommendedReadinessRow = useMemo(
    () => readinessRows.find((row) => row.state !== "ready") || readinessRows[0] || null,
    [readinessRows],
  );

  const featuredMonitoringServices = monitoring?.services.slice(0, 6) || [];

  async function runMonitoringAction(action: MonitoringAction) {
    setBusyAction(action);
    setActionResult(null);
    setError("");
    try {
      const result = (await apiFetch("/tenant/settings/internal-monitoring/actions", {
        method: "POST",
        body: JSON.stringify({ action }),
      })) as MonitoringActionResult;
      setActionResult(result);
      if (result.snapshot) {
        setMonitoring(result.snapshot);
      } else {
        await loadPage();
      }
    } catch (nextError: any) {
      setError(nextError?.message || "Could not run monitoring action.");
    } finally {
      setBusyAction("");
    }
  }

  if (me && !canViewMonitoring) {
    return (
      <DashboardShell>
        <div className="operator-stack">
          <OperatorPageHeader eyebrow="Settings" title="Operations" subtitle="Platform health is limited to owners, admins, and platform admins." stats={[]} />
          <div className="card" data-testid="operations-governance-blocked">
            <h2 style={{ marginTop: 0 }}>Access restricted</h2>
            <p className="muted" style={{ marginBottom: 0 }}>This view stays hidden from non-admin roles so customer and field workflows stay calm.</p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack" data-testid="settings-operations-page">
        <OperatorPageHeader
          eyebrow="Settings"
          title={canViewPlatformDiagnostics ? "Platform operations" : "Business readiness"}
          subtitle={canViewPlatformDiagnostics ? "Internal platform health and release evidence." : "Finish the setup needed for bookings, messages, and customer payments."}
          actions={[
            { label: "Workspace settings", href: "/dashboard/settings", variant: "secondary" },
            { label: "Manage notifications", href: "/dashboard/settings?tab=messages", variant: "secondary" },
            { label: "Manage booking setup", href: "/dashboard/booking/settings" },
          ]}
          stats={canViewPlatformDiagnostics ? [
            { label: canViewPlatformDiagnostics ? "Health score" : "Business readiness", value: canViewPlatformDiagnostics ? String(monitoring?.overall.score || 0) : String(readinessRows.length), hint: canViewPlatformDiagnostics ? monitoring?.overall.summary || "Recent internal checks" : "Tenant business setup checks only" },
            { label: "Last check", value: formatDateTime(monitoring?.checkedAt || ops?.checkedAt), hint: monitoring?.cached ? "Using a recent cached snapshot" : "Fresh internal snapshot" },
            { label: "Recent incidents", value: String(monitoring?.incidents.length || 0), hint: monitoring?.historyWindow.summary || "Short rolling history only" },
            { label: "Failed sends", value: String(failedComms.length), hint: "Recent failed communication items" },
            { label: "Summary recipients", value: String(summaryReadiness?.recipientCount || 0), hint: "Current summary delivery scope" },
          ] : [
            { label: "Setup checks", value: String(readinessRows.length), hint: "Business setup only" },
            { label: "Ready", value: String(readinessCounts.ready), hint: "No action needed" },
            { label: "Action needed", value: String(readinessCounts.needsSetup + readinessCounts.attention), hint: "Open the linked setting to finish" },
          ]}
        />

        {canViewPlatformDiagnostics ? <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              <strong style={{ display: "block" }}>View mode</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>Basic keeps this page calm. Advanced diagnostics opens the deeper evidence only when you need it.</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className={viewMode === "basic" ? "button" : "button secondary"} type="button" onClick={() => setViewMode("basic")}>Basic</button>
              <button className={viewMode === "advanced" ? "button" : "button secondary"} type="button" onClick={() => setViewMode("advanced")}>Advanced diagnostics</button>
            </div>
          </div>
        </div> : null}

        {recommendedReadinessRow ? (
          <section className="mt-priority-card" data-testid="operations-recommended-action">
            <span className="mt-priority-card__eyebrow">Recommended next action</span>
            <h2 className="mt-priority-card__title">{recommendedReadinessRow.area}</h2>
            <p className="mt-priority-card__copy">{recommendedReadinessRow.detail}</p>
            <div className="mt-priority-card__meta">
              <span>{labelFromState(recommendedReadinessRow.state)}</span>
              <span>{recommendedReadinessRow.action}</span>
            </div>
            <div>
              <Link className="button" href={recommendedReadinessRow.href}>
                {recommendedReadinessRow.action}
              </Link>
            </div>
          </section>
        ) : null}

        {viewMode === "advanced" ? (
          <OperatorGuidance
            title="How to use this page"
            items={[
              "Healthy means the latest internal check completed cleanly.",
              "Degraded means the service still looks usable, but some visibility is limited from this runtime.",
              "Attention needed means an owner-facing follow-up is needed.",
              "This is an internal confidence view only. Platform-admin external monitoring setup is intentionally deferred for this phase.",
            ]}
          />
        ) : null}

        {error ? <p role="alert" style={{ color: "#ff8a8a", marginTop: 0 }}>{error}</p> : null}
        {!ops && !monitoring && !error ? <LoadingState title="Loading business readiness" description="Checking booking, payment, sender, summary, and account signals." /> : null}

        {(monitoring || ops) ? (
          <div className="mt-moment-strip" data-testid="operations-moment-strip" style={{ marginBottom: 16 }}>
            <article className="mt-moment-card mt-moment-card--success">
              <span className="mt-moment-card__label">Running well</span>
              <strong>{canViewPlatformDiagnostics ? (monitoring?.overall.state === "healthy" ? "Platform health is steady" : "Platform health is visible") : "Business readiness is visible"}</strong>
              <p>{canViewPlatformDiagnostics ? monitoring?.overall.summary || "Internal checks are available without exposing host internals." : "Tenant users see business-impacting setup signals only, without platform diagnostics."}</p>
            </article>
            {canViewPlatformDiagnostics ? (
              <>
                <article className={`mt-moment-card ${ops?.externalMonitoring?.externalMonitorStatus === "not_configured" || !ops?.externalMonitoring?.externalMonitorStatus ? "mt-moment-card--warning" : "mt-moment-card--info"}`}>
                  <span className="mt-moment-card__label">Needs attention</span>
                  <strong>{ops?.externalMonitoring?.externalMonitorStatus === "not_configured" || !ops?.externalMonitoring?.externalMonitorStatus ? "External monitor intentionally deferred" : "Public reachability is being watched"}</strong>
                  <p>{ops?.externalMonitoring?.externalMonitorDetail || "Keep this separate from the internal confidence view."}</p>
                </article>
                <article className="mt-moment-card mt-moment-card--info">
                  <span className="mt-moment-card__label">Next action</span>
                  <strong>{ops?.backupReadiness?.status === "ready" ? "Review launch confidence before customer-facing changes" : "Backup confidence needs review next"}</strong>
                  <p>{ops?.backupReadiness?.status === "ready" ? "Launch readiness, notifications, and billing boundaries are the highest-value owner checks now." : ops?.backupReadiness?.detail || "Use backup evidence and restore drill visibility before relying on recovery."}</p>
                </article>
              </>
            ) : null}
          </div>
        ) : null}

        {monitoring ? (
          <section className="card operator-section" data-testid="internal-monitoring-overview">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Platform health</h2>
                <p className="operator-section__subtitle">A lightweight internal confidence layer for owners and admins. It does not replace external uptime monitoring.</p>
              </div>
            </div>
            <div
              data-testid="monitoring-quick-actions"
              style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}
            >
              <button className="button secondary" type="button" onClick={() => void runMonitoringAction("run_health_check")} disabled={busyAction !== ""}>
                {busyAction === "run_health_check" ? "Running health check..." : "Run health check"}
              </button>
              <button className="button secondary" type="button" onClick={() => void runMonitoringAction("refresh_snapshot")} disabled={busyAction !== ""}>
                {busyAction === "refresh_snapshot" ? "Refreshing..." : "Refresh snapshot"}
              </button>
              <button className="button secondary" type="button" onClick={() => void runMonitoringAction("verify_notification_routing")} disabled={busyAction !== ""}>
                {busyAction === "verify_notification_routing" ? "Verifying..." : "Verify notification routing"}
              </button>
              <button className="button secondary" type="button" onClick={() => void runMonitoringAction("check_billing_readiness")} disabled={busyAction !== ""}>
                {busyAction === "check_billing_readiness" ? "Checking..." : "Check billing status"}
              </button>
              <button className="button secondary" type="button" onClick={() => void runMonitoringAction("validate_backups")} disabled={busyAction !== ""}>
                {busyAction === "validate_backups" ? "Validating..." : "Validate backups"}
              </button>
              <button className="button" type="button" onClick={() => setViewMode("advanced")}>
                Open diagnostics
              </button>
            </div>
            {actionResult ? (
              <article className="booking-lifecycle-card" data-testid="monitoring-action-result" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <strong>{actionResult.label}</strong>
                  <OperatorStatusBadge label={labelFromMonitoringState(actionResult.state)} tone={toneFromMonitoringState(actionResult.state)} compact />
                </div>
                <p style={{ marginBottom: 6 }}>{actionResult.summary}</p>
                <p className="muted" style={{ marginBottom: 0 }}>{actionResult.detail}</p>
              </article>
            ) : null}
            <div className="booking-summary-grid">
              <article className="booking-lifecycle-card">
                <strong>Overall</strong>
                <p style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <OperatorStatusBadge label={monitoring.overall.label} tone={toneFromMonitoringState(monitoring.overall.state)} compact />
                  <span>{monitoring.overall.score}/100</span>
                </p>
                <p>{monitoring.overall.summary}</p>
              </article>
              <article className="booking-lifecycle-card">
                <strong>Availability</strong>
                <p>{monitoring.overall.healthyCount} healthy, {monitoring.overall.degradedCount} degraded.</p>
                <p>{monitoring.overall.availabilityPercentage}% available across the recent window.</p>
              </article>
              <article className="booking-lifecycle-card">
                <strong>Runtime freshness</strong>
                <p>{monitoring.runtimeFreshness.summary}</p>
                <p>Last stable: {formatDateTime(monitoring.overall.lastRecoveryAt || monitoring.checkedAt)}</p>
              </article>
              <article className="booking-lifecycle-card">
                <strong>Response feel</strong>
                <p>{monitoring.overall.averageResponseBand}</p>
                <p>Last check: {formatDateTime(monitoring.checkedAt)}</p>
              </article>
            </div>
            <div className="booking-summary-grid" data-testid="internal-monitoring-service-grid">
              {featuredMonitoringServices.map((service) => (
                <article key={service.key} className="booking-lifecycle-card" data-testid={`internal-monitoring-service-${service.key}`}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <strong>{service.label}</strong>
                    <OperatorStatusBadge label={labelFromMonitoringState(service.state)} tone={toneFromMonitoringState(service.state)} compact />
                  </div>
                  <p style={{ marginBottom: 6 }}>{service.summary}</p>
                  <p className="muted" style={{ marginBottom: 6 }}>{service.detail}</p>
                  <p className="muted" style={{ marginBottom: 6 }}>{responseBandLabel(service.responseTimeBand)}{typeof service.responseTimeMs === "number" ? ` • ${Math.round(service.responseTimeMs)} ms` : ""}</p>
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    {service.recentStates.map((state, index) => (
                      <span
                        key={`${service.key}-${index}`}
                        aria-hidden="true"
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: state === "healthy" ? "rgba(46, 184, 122, 0.9)" : state === "degraded" ? "rgba(245, 182, 66, 0.9)" : state === "attention_needed" ? "rgba(242, 135, 5, 0.9)" : "rgba(220, 74, 74, 0.9)",
                          opacity: index === service.recentStates.length - 1 ? 1 : 0.55,
                        }}
                      />
                    ))}
                  </div>
                  <p className="muted" style={{ marginBottom: 0 }}>{service.availabilityPercentage}% available • {service.availabilityLabel}</p>
                  <p className="muted" style={{ marginBottom: 0 }}>
                    {service.degradedMinutes > 0 ? `Degraded for ${service.degradedMinutes} minute${service.degradedMinutes === 1 ? "" : "s"}` : `Last healthy check: ${formatDateTime(service.lastSuccessfulCheckAt)}`}
                  </p>
                  <p className="muted" style={{ marginBottom: 0 }}>Recovered: {formatDateTime(service.lastRecoveredAt || service.lastStableAt)}</p>
                </article>
              ))}
            </div>
            <div className="booking-summary-grid" data-testid="internal-monitoring-meta-grid">
              <article className="booking-lifecycle-card">
                <strong>Backup readiness</strong>
                <p>Latest backup: {formatDateTime(ops?.backupReadiness?.lastBackupAt)}</p>
                <p>Latest restore drill: {formatDateTime(ops?.backupReadiness?.lastRestoreDrillAt)}</p>
              </article>
              <article className="booking-lifecycle-card">
                <strong>Notification verify</strong>
                <p>{monitoring.services.find((service) => service.key === "notification-routing")?.summary || "Not checked"}</p>
                <p>No recipient addresses are exposed in this check.</p>
              </article>
              <article className="booking-lifecycle-card">
                <strong>Scheduler</strong>
                <p>{monitoring.services.find((service) => service.key === "scheduler")?.summary || "Not checked"}</p>
                <p>{ops?.runtime.summarySchedulerDetail || "Host-visible scheduler checks remain lightweight."}</p>
              </article>
              <article className="booking-lifecycle-card">
                <strong>Recent incidents</strong>
                <p>{monitoring.incidents[0]?.summary || "No state changes recorded in the current window."}</p>
                <p>{monitoring.incidents[0] ? `${monitoring.incidents[0].phase} • ${formatDateTime(monitoring.incidents[0].occurredAt)}` : `${monitoring.historyWindow.summary}`}</p>
              </article>
            </div>
            <details className="booking-lifecycle-card" data-testid="internal-monitoring-incidents" style={{ marginTop: 16 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>Recent incidents and recoveries</summary>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {monitoring.incidents.length ? monitoring.incidents.map((incident) => (
                  <article key={`${incident.key}-${incident.occurredAt}`} className="booking-status-update">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <strong>{incident.label}</strong>
                      <OperatorStatusBadge label={incident.phase} tone={incident.phase === "Investigating" ? "warning" : "success"} compact />
                    </div>
                    <p className="muted" style={{ margin: "6px 0" }}>{incident.summary}</p>
                    <p className="muted" style={{ margin: 0 }}>
                      {incident.phase === "Investigating" ? "Investigating" : "Recovered"} • {formatDateTime(incident.occurredAt)}
                      {typeof incident.durationMinutes === "number" && incident.durationMinutes > 0 ? ` • ${incident.durationMinutes} minute${incident.durationMinutes === 1 ? "" : "s"}` : ""}
                    </p>
                  </article>
                )) : <p className="muted" style={{ margin: 0 }}>No incident transitions are recorded in the current rolling window.</p>}
              </div>
            </details>
          </section>
        ) : null}

        {viewMode === "basic" && readinessRows.length ? (
          <section className="card operator-section" data-testid="operations-basic-overview">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Owner overview</h2>
                <p className="operator-section__subtitle">Keep the essentials visible: what is healthy, what still needs setup, and what needs attention now.</p>
              </div>
            </div>
            <div className="booking-summary-grid">
              <article className="booking-lifecycle-card"><strong>Ready</strong><p>{readinessCounts.ready} checks are currently ready.</p></article>
              <article className="booking-lifecycle-card"><strong>Needs setup</strong><p>{readinessCounts.needsSetup} checks still need setup.</p></article>
              <article className="booking-lifecycle-card"><strong>Attention needed</strong><p>{readinessCounts.attention} checks need review or can only be checked on the host.</p></article>
              <article className="booking-lifecycle-card"><strong>Last checked</strong><p>{formatDateTime(monitoring?.checkedAt || ops?.checkedAt)}</p></article>
            </div>
            <OperatorDataTable columns="minmax(220px,1fr) minmax(140px,0.6fr) minmax(280px,1.3fr) minmax(180px,0.8fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Area</div>
                <div className="operator-table__cell">Status</div>
                <div className="operator-table__cell">What to do next</div>
                <div className="operator-table__cell">Action</div>
              </OperatorDataTableHeader>
              {readinessRows.filter((row) => row.state !== "ready").slice(0, 5).map((row) => (
                <OperatorDataTableRow key={row.key} data-testid={`operations-basic-row-${row.key}`}>
                  <div className="operator-table__cell"><strong>{row.area}</strong></div>
                  <div className="operator-table__cell"><OperatorStatusBadge label={labelFromState(row.state)} tone={toneFromState(row.state)} compact /></div>
                  <div className="operator-table__cell">{row.detail}</div>
                  <div className="operator-table__cell"><Link href={row.href}>{row.action}</Link></div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          </section>
        ) : null}

        <section className="card operator-section" data-testid="operations-readiness-table">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Launch readiness</h2>
              <p className="operator-section__subtitle">Configuration truth, payment boundaries, and release checks without exposing secrets.</p>
            </div>
          </div>
          <OperatorDataTable columns="minmax(220px,1fr) minmax(140px,0.6fr) minmax(280px,1.3fr) minmax(180px,0.8fr)">
            <OperatorDataTableHeader>
              <div className="operator-table__cell">Area</div>
              <div className="operator-table__cell">Status</div>
              <div className="operator-table__cell">Detail</div>
              <div className="operator-table__cell">Fix action</div>
            </OperatorDataTableHeader>
            {readinessRows.map((row) => (
              <OperatorDataTableRow key={row.key} data-testid={`operations-readiness-row-${row.key}`}>
                <div className="operator-table__cell"><strong>{row.area}</strong></div>
                <div className="operator-table__cell"><OperatorStatusBadge label={labelFromState(row.state)} tone={toneFromState(row.state)} compact /></div>
                <div className="operator-table__cell">{row.detail}</div>
                <div className="operator-table__cell"><Link href={row.href}>{row.action}</Link></div>
              </OperatorDataTableRow>
            ))}
          </OperatorDataTable>
        </section>

        {canViewPlatformDiagnostics ? <section className="card operator-section" data-testid="operations-monitoring-table">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Operational confidence</h2>
              <p className="operator-section__subtitle">Recent delivery signals, backup evidence, and short incident context without raw logs or infrastructure noise.</p>
            </div>
          </div>
          <div className="booking-summary-grid">
            <article className="booking-lifecycle-card"><strong>Failed delivery visibility</strong><p>Latest failed communication rows: {failedComms.length}</p><p>Review delivery history and workspace notifications before a broader launch.</p></article>
            <article className="booking-lifecycle-card"><strong>Operational alerts</strong><p>Owner/admin recipients: {opsAlerts?.ownerAdminRecipientCount || 0}</p><p>Extra recipients: {opsAlerts?.extraRecipientCount || 0}</p></article>
            <article className="booking-lifecycle-card"><strong>Summary dispatch</strong><p>Configured recipients: {summaryReadiness?.recipientCount || 0}</p><p>{summaryReadiness?.runtimeNote || "Review scheduler installation guidance before relying on summaries."}</p></article>
            {canViewPlatformDiagnostics ? (
              <>
                <article className="booking-lifecycle-card" data-testid="backup-readiness-card"><strong>Backup readiness</strong><p>Latest backup: {formatDateTime(ops?.backupReadiness?.lastBackupAt)}</p><p>Latest restore drill: {formatDateTime(ops?.backupReadiness?.lastRestoreDrillAt)}</p><p>{ops?.backupReadiness?.detail || "Host-visible backup evidence is unavailable from this runtime."}</p></article>
                <article className="booking-lifecycle-card" data-testid="external-monitoring-card"><strong>Public reachability</strong><p>App: {ops?.externalMonitoring?.appStatus || "unknown"}</p><p>API: {ops?.externalMonitoring?.apiStatus || "unknown"}</p><p>Marketing: {ops?.externalMonitoring?.marketingStatus || "unknown"}</p><p>{ops?.externalMonitoring?.tlsExpiry ? `TLS expiry: ${ops.externalMonitoring.tlsExpiry}` : ops?.externalMonitoring?.tlsDetail || "TLS expiry is not visible from this runtime."}</p></article>
                <article className="booking-lifecycle-card" data-testid="external-monitor-provider-card"><strong>External uptime monitor</strong><p>Status: {ops?.externalMonitoring?.externalMonitorStatus || "not_configured"}</p><p>{ops?.externalMonitoring?.externalMonitorDetail || "No non-secret external monitor declaration is visible."}</p></article>
              </>
            ) : null}
            <article className="booking-lifecycle-card" data-testid="integration-rollout-monitoring"><strong>Integration rollout monitoring</strong><p>Personal save failures: {integrationMonitoring?.counts.personalIntegrationSaveFailures || 0}</p><p>Workspace save failures: {integrationMonitoring?.counts.workspaceIntegrationSaveFailures || 0}</p><p>Encryption readiness failures: {integrationMonitoring?.counts.encryptionReadinessFailures || 0}</p><p>Cross-scope access attempts: {integrationMonitoring?.counts.crossScopeAccessAttempts || 0}</p><p>Provider setup errors: {integrationMonitoring?.counts.providerSetupErrors || 0}</p></article>
            <article className="booking-lifecycle-card"><strong>Audit visibility</strong><p>Use tenant audit and notification timelines for governance evidence.</p><p><Link href="/dashboard/audit">Open audit history</Link></p></article>
          </div>
          <OperatorDataTable columns="minmax(220px,1fr) minmax(180px,0.8fr) minmax(180px,0.8fr)">
            <OperatorDataTableHeader>
              <div className="operator-table__cell">Operational alert type</div>
              <div className="operator-table__cell">Latest status</div>
              <div className="operator-table__cell">Latest visible event</div>
            </OperatorDataTableHeader>
            {latestOpsFailures.map((entry) => (
              <OperatorDataTableRow key={entry.category} data-testid={`operations-alert-row-${entry.category}`}>
                <div className="operator-table__cell"><strong>{entry.label}</strong></div>
                <div className="operator-table__cell"><OperatorStatusBadge label={entry.row ? "Recent failure" : "No recent failure"} tone={entry.row ? "critical" : "success"} compact /></div>
                <div className="operator-table__cell">{entry.row ? `${formatDateTime(entry.row.createdAt)} • ${entry.row.title || entry.row.reasonKey || entry.row.id}` : "No matching failed event in the current visible window."}</div>
              </OperatorDataTableRow>
            ))}
          </OperatorDataTable>
        </section> : null}

        {canViewPlatformDiagnostics && viewMode === "advanced" && monitoring ? (
          <section className="card operator-section" data-testid="operations-advanced-monitoring">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Advanced diagnostics</h2>
                <p className="operator-section__subtitle">A short recent history, response bands, and owner-safe incident context. No raw logs or host secrets are shown here.</p>
              </div>
            </div>
            <OperatorDataTable columns="minmax(220px,1fr) minmax(140px,0.6fr) minmax(160px,0.8fr) minmax(180px,0.8fr) minmax(220px,1fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Service</div>
                <div className="operator-table__cell">State</div>
                <div className="operator-table__cell">Response</div>
                <div className="operator-table__cell">Last healthy check</div>
                <div className="operator-table__cell">Recent signal</div>
              </OperatorDataTableHeader>
              {monitoring.services.map((service) => (
                <OperatorDataTableRow key={service.key} data-testid={`advanced-monitoring-row-${service.key}`}>
                  <div className="operator-table__cell"><strong>{service.label}</strong><div className="muted">{service.summary}</div></div>
                  <div className="operator-table__cell"><OperatorStatusBadge label={labelFromMonitoringState(service.state)} tone={toneFromMonitoringState(service.state)} compact /></div>
                  <div className="operator-table__cell">{responseBandLabel(service.responseTimeBand)}{typeof service.responseTimeMs === "number" ? ` • ${Math.round(service.responseTimeMs)} ms` : ""}</div>
                  <div className="operator-table__cell">{formatDateTime(service.lastSuccessfulCheckAt)}</div>
                  <div className="operator-table__cell">{service.availabilityLabel}</div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
            <OperatorDataTable columns="minmax(220px,1fr) minmax(140px,0.6fr) minmax(260px,1.2fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Incident</div>
                <div className="operator-table__cell">State</div>
                <div className="operator-table__cell">When</div>
              </OperatorDataTableHeader>
              {(monitoring.incidents.length ? monitoring.incidents : [{ key: "none", label: "No recent incident", state: "healthy" as MonitoringState, summary: "No state changes recorded in the current history window.", occurredAt: monitoring.checkedAt }]).map((incident) => (
                <OperatorDataTableRow key={`${incident.key}-${incident.occurredAt}`} data-testid={`internal-monitoring-incident-${incident.key}`}>
                  <div className="operator-table__cell"><strong>{incident.label}</strong><div className="muted">{incident.summary}</div></div>
                  <div className="operator-table__cell"><OperatorStatusBadge label={labelFromMonitoringState(incident.state)} tone={toneFromMonitoringState(incident.state)} compact /></div>
                  <div className="operator-table__cell">{formatDateTime(incident.occurredAt)}</div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          </section>
        ) : null}

        {canViewPlatformDiagnostics && viewMode === "advanced" ? (
          <section className="card operator-section" data-testid="operations-abuse-table">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Rate-limit and abuse readiness</h2>
                <p className="operator-section__subtitle">Only mark protection present where the codebase already exposes it clearly.</p>
              </div>
            </div>
            <OperatorDataTable columns="minmax(220px,1fr) minmax(140px,0.6fr) minmax(320px,1.4fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Area</div>
                <div className="operator-table__cell">Status</div>
                <div className="operator-table__cell">Evidence</div>
              </OperatorDataTableHeader>
              {[
                { area: "Auth throttling", state: ops?.abuseProtection.authThrottleConfigured ? "ready" : "needs_setup", detail: "Login, signup, resend, forgot-password, reset-password, and verify-email routes enforce request throttling." },
                { area: "Password reset throttling", state: ops?.abuseProtection.passwordResetThrottleConfigured ? "ready" : "needs_setup", detail: "Password reset request and reset submission endpoints share the same auth throttle guard pattern." },
                { area: "Global burst protection", state: ops?.abuseProtection.globalBurstThrottleConfigured ? "ready" : "needs_setup", detail: "Nest global throttler is enabled for broad API burst protection." },
                { area: "Upload size limits", state: ops?.abuseProtection.uploadLimitConfigured ? "ready" : "needs_setup", detail: "File-upload endpoints use explicit size and MIME constraints." },
                { area: "Webhook signature verification", state: ops?.abuseProtection.webhookSignatureVerificationConfigured ? "ready" : "needs_setup", detail: "Stripe raw-body verification remains enforced before webhook state changes." },
                { area: "Public booking spam protection", state: ops?.abuseProtection.publicBookingRateLimitConfigured ? "ready" : "needs_setup", detail: ops?.abuseProtection.publicBookingRateLimitConfigured ? "Public booking create, status, and scheduling actions now enforce dedicated friendly throttling." : "No dedicated booking-form rate limiter is declared yet. Treat this as a remaining production hardening action." },
              ].map((row) => (
                <OperatorDataTableRow key={row.area}>
                  <div className="operator-table__cell"><strong>{row.area}</strong></div>
                  <div className="operator-table__cell"><OperatorStatusBadge label={labelFromState(row.state as ReadinessState)} tone={toneFromState(row.state as ReadinessState)} compact /></div>
                  <div className="operator-table__cell">{row.detail}</div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          </section>
        ) : null}

        {canViewPlatformDiagnostics && viewMode === "advanced" ? (
          <section className="card operator-section" data-testid="operations-governance-table">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Governance checklist</h2>
                <p className="operator-section__subtitle">Public governance routes are live and operator-approved. Review the published wording whenever policy or operational practice changes.</p>
              </div>
            </div>
            <OperatorDataTable columns="minmax(220px,1fr) minmax(140px,0.6fr) minmax(300px,1.4fr) minmax(180px,0.8fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Area</div>
                <div className="operator-table__cell">Status</div>
                <div className="operator-table__cell">What exists</div>
                <div className="operator-table__cell">Action</div>
              </OperatorDataTableHeader>
              {governanceRows.map((row) => (
                <OperatorDataTableRow key={row.area}>
                  <div className="operator-table__cell"><strong>{row.area}</strong></div>
                  <div className="operator-table__cell"><OperatorStatusBadge label={labelFromState(row.state)} tone={toneFromState(row.state)} compact /></div>
                  <div className="operator-table__cell">{row.detail}</div>
                  <div className="operator-table__cell"><Link href={row.href}>{row.action}</Link></div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          </section>
        ) : null}
      </div>
    </DashboardShell>
  );
}
