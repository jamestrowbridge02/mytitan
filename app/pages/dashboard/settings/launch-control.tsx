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
import { getCustomerFeedbackSettings } from "../../../lib/business-config";

type LaunchState = "ready" | "needs_setup" | "blocked" | "unknown";

type MePayload = {
  role?: string;
  platformAdmin?: boolean;
};

type OperationsReadiness = {
  checkedAt?: string;
  platformDiagnosticsVisible?: boolean;
  runtime: {
    backupEncryptionKeyConfigured?: boolean;
    appPublicUrlConfigured?: boolean;
    apiPublicUrlConfigured?: boolean;
    summarySchedulerStatus?: "ready" | "not_configured" | "unknown";
    summarySchedulerDetail?: string | null;
    stripeCanaryStatus?: string | null;
  };
  abuseProtection: {
    publicBookingRateLimitConfigured?: boolean;
  };
  backupReadiness?: {
    status?: "ready" | "needs_backup_run" | "needs_restore_drill" | "needs_schedule" | "unknown";
    detail?: string;
    lastBackupAt?: string | null;
    lastRestoreDrillAt?: string | null;
  };
  externalMonitoring?: {
    status?: "ready" | "unknown";
    detail?: string;
    appStatus?: string | null;
    apiStatus?: string | null;
    marketingStatus?: string | null;
    tlsExpiry?: string | null;
    externalMonitorStatus?: "ready" | "not_configured" | "configured" | "verifying" | "healthy" | "degraded" | "unknown" | null;
    externalMonitorDetail?: string | null;
  };
};

type OpsAlertStatus = {
  enabled?: boolean;
  resolvedRecipientCount?: number;
  enabledCategories?: string[];
  runtimeNote?: string;
  systemSender?: {
    status?: string;
    canSend?: boolean;
  };
};

type BillingSnapshot = {
  stripeConfigured?: boolean;
  paymentCollection?: {
    customerCollection?: {
      preferredProvider?: string;
    };
  } | null;
  providerCanaries?: {
    summary?: string;
    providers?: Array<{
      provider: string;
      label: string;
      status: string;
      message: string;
      liveCollection: boolean;
      liveCanaryAllowed: boolean;
    }>;
  } | null;
  jobCompletionPacks?: {
    status?: string;
    checkoutEnabled?: boolean;
    summary?: string;
    enablementSteps?: string[];
    canary?: {
      message?: string;
      lastResult?: string | null;
    } | null;
  } | null;
};

type CustomerPaymentReadiness = {
  providers?: Array<{
    provider: string;
    readinessState?: string;
    checkoutEligible?: boolean;
  }>;
};

type EmailReadiness = {
  status?: string;
  effective?: {
    canSend?: boolean;
    guidance?: string;
  };
  guidance?: string;
};

type SummaryReadiness = {
  recipientCount?: number;
  runtimeNote?: string;
};

type BookingSettings = {
  publicEnabled?: boolean;
  publicUrl?: string | null;
};

type TenantSettings = {
  businessConfigJson?: Record<string, any> | null;
};

type InternalMonitoringSnapshot = {
  overall?: {
    score?: number;
    label?: string;
    summary?: string;
    availabilityPercentage?: number;
    averageResponseBand?: string;
    lastRecoveryAt?: string | null;
  };
  checkedAt?: string;
  externalMonitoring?: {
    summary?: string;
  };
  services?: Array<{
    key: string;
    summary?: string;
  }>;
  historyWindow?: {
    summary?: string;
  };
};

const livePaymentCanarySteps = [
  "Tenant Stripe connected",
  "Stripe onboarding completed",
  "Small live deposit taken",
  "Booking confirmed",
  "Stripe webhook received",
  "Payment state updated",
  "Refund completed",
  "Refund state updated",
];

const wheelPilotChecklist = [
  "Public booking",
  "Trade booking",
  "Custom booking fields",
  "Weekly availability",
  "Deposit and payment state",
  "Job conversion",
  "Job sheet",
  "Photos, signature, and evidence",
  "Invoice",
  "Customer portal",
  "Trade portal",
  "Numbering",
  "Archive period",
];

const onboardingProofSteps = [
  { label: "Business profile", href: "/dashboard/setup-wizard?step=branding" },
  { label: "Logo and branding", href: "/dashboard/setup-wizard?step=branding" },
  { label: "Location", href: "/dashboard/locations" },
  { label: "Service folder and service", href: "/dashboard/setup-wizard?step=services" },
  { label: "Availability", href: "/dashboard/setup-wizard?step=operations" },
  { label: "Public booking link", href: "/dashboard/booking/settings" },
  { label: "Customer fields", href: "/dashboard/settings?tab=customers" },
  { label: "Payments", href: "/dashboard/settings/payments/stripe" },
  { label: "Invoices", href: "/dashboard/settings?tab=finance" },
  { label: "First booking", href: "/dashboard/bookings" },
];

const mobileFieldChecklist = [
  { label: "Job sheet", href: "/dashboard/technician" },
  { label: "Before and after media upload", href: "/dashboard/technician" },
  { label: "Signature", href: "/dashboard/technician" },
  { label: "Notes", href: "/dashboard/technician" },
  { label: "Completion", href: "/dashboard/technician" },
  { label: "Weak-signal recovery", href: "/dashboard/technician/offline" },
  { label: "No horizontal overflow", href: "/dashboard/technician" },
];

const releaseChecklist = [
  "Clean tree",
  "Annotated release tag",
  "Prisma migration status",
  "Healthcheck",
  "Production readiness",
  "Full stable suite",
  "Payment canary status",
  "Uptime monitor status",
  "Backup status",
  "Rollback note",
];

function tone(state: LaunchState) {
  return state === "ready" ? "success" : state === "blocked" ? "critical" : "warning";
}

function label(state: LaunchState) {
  return state === "ready" ? "Ready" : state === "blocked" ? "Blocked" : state === "unknown" ? "Unknown" : "Needs attention";
}

export default function LaunchControlPage() {
  const [me, setMe] = useState<MePayload | null>(null);
  const [ops, setOps] = useState<OperationsReadiness | null>(null);
  const [monitoring, setMonitoring] = useState<InternalMonitoringSnapshot | null>(null);
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);
  const [customerPayments, setCustomerPayments] = useState<CustomerPaymentReadiness | null>(null);
  const [opsAlerts, setOpsAlerts] = useState<OpsAlertStatus | null>(null);
  const [workspaceEmail, setWorkspaceEmail] = useState<EmailReadiness | null>(null);
  const [summary, setSummary] = useState<SummaryReadiness | null>(null);
  const [booking, setBooking] = useState<BookingSettings | null>(null);
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"basic" | "advanced">("basic");
  const [canaryConfirmed, setCanaryConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/me")
      .then(async (meRes) => {
        if (cancelled) return;
        const nextMe = (meRes || null) as MePayload | null;
        setMe(nextMe);
        const allowed = Boolean(nextMe?.platformAdmin || nextMe?.role === "OWNER" || nextMe?.role === "ADMIN");
        if (!allowed) {
          setError("");
          return;
        }
        const [opsRes, monitoringRes, billingRes, customerPaymentsRes, opsAlertRes, emailRes, summaryRes, bookingRes, settingsRes] = await Promise.all([
          apiFetch("/tenant/settings/operations-readiness"),
          nextMe?.platformAdmin ? apiFetch("/tenant/settings/internal-monitoring") : Promise.resolve(null),
          apiFetch("/billing/me"),
          apiFetch("/billing/customer-payment-readiness"),
          apiFetch("/notifications/ops-alerts/status"),
          apiFetch("/tenant/settings/email-readiness"),
          apiFetch("/notifications/summaries/readiness"),
          apiFetch("/booking/settings"),
          apiFetch("/tenant/settings"),
        ]);
        if (cancelled) return;
        setOps((opsRes || null) as OperationsReadiness | null);
        setMonitoring((monitoringRes || null) as InternalMonitoringSnapshot | null);
        setBilling((billingRes || null) as BillingSnapshot | null);
        setCustomerPayments((customerPaymentsRes || null) as CustomerPaymentReadiness | null);
        setOpsAlerts((opsAlertRes || null) as OpsAlertStatus | null);
        setWorkspaceEmail((emailRes || null) as EmailReadiness | null);
        setSummary((summaryRes || null) as SummaryReadiness | null);
        setBooking((bookingRes || null) as BookingSettings | null);
        setSettings((settingsRes || null) as TenantSettings | null);
        setError("");
      })
      .catch((nextError: any) => {
        if (cancelled) return;
        setError(nextError?.message || "Failed to load Launch Control");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canViewMonitoring = Boolean(me?.platformAdmin || me?.role === "OWNER" || me?.role === "ADMIN");
  const canViewPlatformDiagnostics = Boolean(me?.platformAdmin);

  const customerFeedback = useMemo(() => getCustomerFeedbackSettings(settings as any), [settings]);
  const stripePayments = customerPayments?.providers?.find((provider) => provider.provider === "stripe-connect") || null;
  const requiredMonitoringCategories = ["failed_summary_dispatch", "failed_payment", "failed_webhook", "failed_backup", "health_degraded"];
  const monitoringCategories = new Set(opsAlerts?.enabledCategories || []);
  const monitoringReady =
    Boolean(opsAlerts?.systemSender?.canSend) &&
    Number(opsAlerts?.resolvedRecipientCount || 0) > 0 &&
    requiredMonitoringCategories.every((category) => monitoringCategories.has(category));
  const externalChecksReady =
    ops?.externalMonitoring?.appStatus === "ready" &&
    ops?.externalMonitoring?.apiStatus === "ready" &&
    ops?.externalMonitoring?.marketingStatus === "ready" &&
    Boolean(ops?.externalMonitoring?.tlsExpiry);
  const externalMonitorStatus = ops?.externalMonitoring?.externalMonitorStatus || "not_configured";
  const externalMonitorConfigured = externalMonitorStatus && externalMonitorStatus !== "not_configured" && externalMonitorStatus !== "unknown";
  const releaseTag = "v1.0.0-clean";

  const rows = [
    {
      key: "scheduler",
      area: "Scheduler",
      platformOnly: true,
      state:
        ops?.runtime.summarySchedulerStatus === "ready"
          ? ("ready" as LaunchState)
          : ops?.runtime.summarySchedulerStatus === "unknown"
            ? ("unknown" as LaunchState)
            : ("needs_setup" as LaunchState),
      detail: ops?.runtime.summarySchedulerStatus === "unknown"
        ? ops?.runtime.summarySchedulerDetail || "The current runtime cannot inspect the host scheduler. Use the production readiness script on the host."
        : summary?.runtimeNote || ops?.runtime.summarySchedulerDetail || "Install and verify the host summary scheduler before relying on summary dispatch.",
      href: "/dashboard/settings/operations",
    },
    {
      key: "billing",
      area: "Billing",
      state: billing?.stripeConfigured ? ("ready" as LaunchState) : ("needs_setup" as LaunchState),
      detail: billing?.stripeConfigured
        ? "Your MyTitan subscription billing is ready."
        : "Choose a plan and add payment details.",
      href: "/dashboard/billing",
    },
    {
      key: "job-packs",
      area: "Job packs",
      state: billing?.jobCompletionPacks?.checkoutEnabled
        ? ("ready" as LaunchState)
        : billing?.jobCompletionPacks?.status === "ready"
          ? ("blocked" as LaunchState)
          : ("needs_setup" as LaunchState),
      detail: billing?.jobCompletionPacks?.checkoutEnabled
        ? "Extra job capacity is available."
        : "Choose a plan with more included job capacity.",
      href: "/dashboard/billing",
    },
    {
      key: "email",
      area: "Email",
      state: workspaceEmail?.effective?.canSend ? ("ready" as LaunchState) : ("needs_setup" as LaunchState),
      detail: workspaceEmail?.effective?.guidance || workspaceEmail?.guidance || "Workspace email readiness still needs review.",
      href: "/dashboard/settings?tab=messages",
    },
    {
      key: "governance",
      area: "Governance",
      state: "ready" as LaunchState,
      detail: "Privacy, terms, cookies, and data retention routes are operator-approved and live.",
      href: "/dashboard/settings/operations",
    },
    {
      key: "provider-payments",
      area: "Customer payments",
      state: stripePayments?.readinessState === "ready" && stripePayments.checkoutEligible
        ? ("ready" as LaunchState)
        : ("needs_setup" as LaunchState),
      detail: stripePayments?.readinessState === "ready" && stripePayments.checkoutEligible
        ? "Customers can pay deposits online."
        : "Stripe needs to be verified before online deposits can be accepted.",
      href: "/dashboard/settings/payments/stripe",
      action: stripePayments?.readinessState === "ready" && stripePayments.checkoutEligible
        ? "Manage Stripe"
        : "Fix Stripe setup",
    },
    {
      key: "backups",
      area: "Backups",
      state: ops?.backupReadiness?.status === "ready"
        ? ("ready" as LaunchState)
        : ops?.backupReadiness?.status === "unknown"
          ? ("unknown" as LaunchState)
          : ("needs_setup" as LaunchState),
      detail: ops?.backupReadiness?.detail || (ops?.runtime.backupEncryptionKeyConfigured
        ? "Backup encryption is configured, but host-visible backup evidence is not available from this runtime."
        : "Set BACKUP_ENCRYPTION_KEY before treating encrypted backups as ready."),
      href: "/dashboard/settings/operations",
      platformOnly: true,
    },
    {
      key: "domains",
      area: "Domains",
      state: ops?.runtime.appPublicUrlConfigured && ops?.runtime.apiPublicUrlConfigured ? ("ready" as LaunchState) : ("needs_setup" as LaunchState),
      detail: ops?.runtime.appPublicUrlConfigured && ops?.runtime.apiPublicUrlConfigured
        ? "Public app and API base URLs are declared."
        : "Declare APP_PUBLIC_URL and API_PUBLIC_URL in production.",
      href: "/dashboard/settings/operations",
      platformOnly: true,
    },
    {
      key: "app-install",
      area: "App install",
      state: "ready" as LaunchState,
      detail: "Install from the live app origin only. Manifest support is present, but offline caching remains disabled because authenticated and payment surfaces must not be cached.",
      platformOnly: true,
      href: "/dashboard/settings/launch-control",
    },
    {
      key: "booking-limiter",
      area: "Public booking limiter",
      state: ops?.abuseProtection.publicBookingRateLimitConfigured ? ("ready" as LaunchState) : ("needs_setup" as LaunchState),
      detail: ops?.abuseProtection.publicBookingRateLimitConfigured
        ? "Friendly throttling is active on public booking actions."
        : "Public booking rate limiting is not declared.",
      href: "/dashboard/booking/settings",
    },
    {
      key: "monitoring",
      area: "Platform health",
      state: monitoring?.overall?.label === "Healthy"
        ? ("ready" as LaunchState)
        : monitoring?.overall?.label === "Down"
          ? ("blocked" as LaunchState)
          : monitoringReady || externalChecksReady
            ? ("unknown" as LaunchState)
            : ("needs_setup" as LaunchState),
      detail: `${monitoring?.overall?.summary || "Internal monitoring keeps a short rolling view of app, API, marketing, backups, scheduler, notification verify, billing, and job-pack readiness."} ${monitoring?.externalMonitoring?.summary || ""}`.trim(),
      href: "/dashboard/settings/operations",
      platformOnly: true,
    },
    {
      key: "customer-feedback",
      area: "Customer feedback",
      state: customerFeedback.enabled && customerFeedback.publicReviewUrl ? ("ready" as LaunchState) : ("needs_setup" as LaunchState),
      detail: customerFeedback.enabled && customerFeedback.publicReviewUrl
        ? "Completed-work emails and the customer page can show the configured feedback request."
        : "Enable customer feedback and set a public HTTPS review URL before showing review prompts.",
      href: "/dashboard/settings?tab=output",
    },
  ].filter((row: any) => canViewPlatformDiagnostics || !row.platformOnly);

  const readyCount = rows.filter((row) => row.state === "ready").length;

  if (me && !canViewMonitoring) {
    return (
      <DashboardShell>
        <div className="operator-stack">
          <OperatorPageHeader eyebrow="Settings" title="Launch Control" subtitle="This owner-facing release view is limited to owners, admins, and platform admins." stats={[]} />
          <div className="card" data-testid="launch-control-governance-blocked">
            <h2 style={{ marginTop: 0 }}>Access restricted</h2>
            <p className="muted" style={{ marginBottom: 0 }}>Launch monitoring stays hidden from non-admin roles so the product surface remains focused.</p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack" data-testid="launch-control-page">
        <OperatorPageHeader
          eyebrow="Settings"
          title={canViewPlatformDiagnostics ? "Launch Control" : "Go-live checklist"}
          subtitle={canViewPlatformDiagnostics ? "Platform release checks and internal launch evidence." : "Finish the business setup needed before inviting customers."}
          actions={[
            { label: "Business readiness", href: "/dashboard/settings/operations", variant: "secondary" },
            { label: "Billing", href: "/dashboard/billing", variant: "secondary" },
            { label: "Email settings", href: "/dashboard/settings?tab=messages" },
          ]}
          stats={canViewPlatformDiagnostics ? [
            { label: "Ready checks", value: String(readyCount), hint: "Current launch rows marked ready" },
            { label: canViewPlatformDiagnostics ? "Health score" : "Launch rows", value: canViewPlatformDiagnostics ? String(monitoring?.overall?.score || 0) : String(rows.length), hint: canViewPlatformDiagnostics ? monitoring?.overall?.summary || "Short recent internal check window" : "Tenant business checklist only" },
            { label: "Summary recipients", value: String(summary?.recipientCount || 0), hint: "Current dispatch scope" },
            { label: "Monitoring recipients", value: String(opsAlerts?.resolvedRecipientCount || 0), hint: "Resolved operational alert recipients" },
          ] : [
            { label: "Ready", value: String(readyCount), hint: "No action needed" },
            { label: "Action needed", value: String(rows.length - readyCount), hint: "Open the linked setting to finish" },
          ]}
        />

        {canViewPlatformDiagnostics ? <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              <strong style={{ display: "block" }}>View mode</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Overview keeps launch decisions clear. Detailed checks stay nearby when you need deeper release context.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className={viewMode === "basic" ? "button" : "button secondary"} type="button" onClick={() => setViewMode("basic")}>
                Overview
              </button>
              <button className={viewMode === "advanced" ? "button" : "button secondary"} type="button" onClick={() => setViewMode("advanced")}>
                Detailed checks
              </button>
            </div>
          </div>
        </div> : null}

        {canViewPlatformDiagnostics && viewMode === "advanced" ? (
          <OperatorGuidance
            title="How to use this page"
            items={[
              "Ready means this control is genuinely live or truthfully safe to rely on.",
              "Needs attention means the platform knows what is missing and points to the owning surface.",
              "Unknown means the current runtime cannot inspect a host-only signal, so the host readiness script remains the source of truth.",
              "Blocked means a live path exists but still requires explicit operator approval before launch.",
            ]}
          />
        ) : null}

        {error ? <p role="alert" style={{ color: "#ff8a8a", marginTop: 0 }}>{error}</p> : null}
        {!ops && !monitoring && !error ? <LoadingState title="Loading launch view" description="Checking billing, launch blockers, app access, and public setup truth." /> : null}

        {canViewPlatformDiagnostics && monitoring ? (
          <section className="card operator-section" data-testid="launch-control-health-summary">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Platform health</h2>
                <p className="operator-section__subtitle">Internal monitoring keeps a calm recent view of availability and recovery. It does not replace external monitoring.</p>
              </div>
            </div>
            <div className="booking-summary-grid">
              <article className="booking-lifecycle-card">
                <strong>Overall</strong>
                <p>{monitoring?.overall?.label || "Unknown"} • {monitoring?.overall?.score || 0}/100</p>
                <p>{monitoring?.overall?.summary || "No recent internal snapshot is available."}</p>
              </article>
              <article className="booking-lifecycle-card">
                <strong>Availability</strong>
                <p>{typeof monitoring?.overall?.availabilityPercentage === "number" ? `${monitoring.overall.availabilityPercentage}%` : "Not checked"}</p>
                <p>{monitoring?.historyWindow?.summary || "Recent lightweight trends only."}</p>
              </article>
              <article className="booking-lifecycle-card">
                <strong>Backups</strong>
                <p>Latest backup: {ops?.backupReadiness?.lastBackupAt ? new Date(ops.backupReadiness.lastBackupAt).toLocaleString() : "Not checked"}</p>
                <p>Last restore drill: {ops?.backupReadiness?.lastRestoreDrillAt ? new Date(ops.backupReadiness.lastRestoreDrillAt).toLocaleString() : "Not checked"}</p>
              </article>
              <article className="booking-lifecycle-card">
                <strong>Recovery</strong>
                <p>{monitoring?.overall?.averageResponseBand || "Not checked"}</p>
                <p>{monitoring?.overall?.lastRecoveryAt ? `Recovered ${new Date(monitoring.overall.lastRecoveryAt).toLocaleString()}` : monitoring?.services?.find((service) => service.key === "notification-routing")?.summary || "Notification verify status is unavailable."}</p>
              </article>
            </div>
          </section>
        ) : null}

        <section className="card operator-section" data-testid="launch-control-table">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Launch checklist</h2>
                <p className="operator-section__subtitle">{canViewPlatformDiagnostics ? "Internal release checks with direct source links." : "Each item links directly to the business setting that completes it."}</p>
            </div>
          </div>
          <OperatorDataTable columns="minmax(220px,1fr) minmax(140px,0.6fr) minmax(280px,1.3fr) minmax(160px,0.8fr)">
            <OperatorDataTableHeader>
              <div className="operator-table__cell">Area</div>
              <div className="operator-table__cell">Status</div>
              <div className="operator-table__cell">Detail</div>
              <div className="operator-table__cell">Action</div>
            </OperatorDataTableHeader>
            {rows.map((row) => (
              <OperatorDataTableRow key={row.key} data-testid={`launch-control-row-${row.key}`}>
                <div className="operator-table__cell"><strong>{row.area}</strong></div>
                <div className="operator-table__cell"><OperatorStatusBadge label={label(row.state)} tone={tone(row.state)} compact /></div>
                <div className="operator-table__cell">{row.detail}</div>
                <div className="operator-table__cell"><Link href={row.href}>{"action" in row ? row.action : "Open"}</Link></div>
              </OperatorDataTableRow>
            ))}
          </OperatorDataTable>
        </section>

        {canViewPlatformDiagnostics && viewMode === "advanced" && billing?.providerCanaries?.providers?.length ? (
          <section className="card operator-section" data-testid="launch-control-provider-canaries">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Provider canary framework</h2>
                <p className="operator-section__subtitle">Live tenant-provider canaries stay manual until an operator explicitly approves them.</p>
              </div>
            </div>
            <OperatorDataTable columns="minmax(220px,1fr) minmax(140px,0.6fr) minmax(320px,1.4fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Provider</div>
                <div className="operator-table__cell">Status</div>
                <div className="operator-table__cell">What it means</div>
              </OperatorDataTableHeader>
              {billing.providerCanaries.providers.map((provider) => (
                <OperatorDataTableRow key={provider.provider}>
                  <div className="operator-table__cell"><strong>{provider.label}</strong></div>
                  <div className="operator-table__cell"><OperatorStatusBadge label={provider.status.replace(/_/g, " ")} tone={provider.status === "ready" ? "success" : provider.status === "blocked" ? "critical" : "warning"} compact /></div>
                  <div className="operator-table__cell">{provider.message}</div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          </section>
        ) : null}

        {canViewPlatformDiagnostics ? (
          <section className="card operator-section" data-testid="launch-proof-live-payment-canary">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Live payment canary</h2>
                <p className="operator-section__subtitle">Manual release-window proof only. This checklist never creates a charge, refund, product, price, or checkout session.</p>
              </div>
            </div>
            <div className="booking-summary-grid">
              {livePaymentCanarySteps.map((step, index) => (
                <label className="booking-lifecycle-card" key={step}>
                  <input type="checkbox" aria-label={step} />
                  <strong>{index + 1}. {step}</strong>
                  <p>Record operator evidence before marking this step complete.</p>
                </label>
              ))}
            </div>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 16 }}>
              <input type="checkbox" checked={canaryConfirmed} onChange={(event) => setCanaryConfirmed(event.target.checked)} data-testid="launch-canary-explicit-confirmation" />
              <span>I confirm a platform admin is supervising a real tenant-owned payment path and no MyTitan billing Stripe fallback will be used.</span>
            </label>
            <button className="button secondary" type="button" disabled={!canaryConfirmed} style={{ marginTop: 12 }} data-testid="launch-canary-record-button">
              Record manual canary evidence
            </button>
          </section>
        ) : null}

        <section className="card operator-section" data-testid="launch-proof-wheel-pilot">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Wheel A&amp;R pilot acceptance</h2>
              <p className="operator-section__subtitle">End-to-end pilot proof for the first real workflow. Each row links to the owning product surface.</p>
            </div>
          </div>
          <div className="operator-grid operator-grid--five">
            {wheelPilotChecklist.map((item) => (
              <article className="operator-mini-card" key={item} data-testid={`wheel-pilot-${item.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}>
                <span className="operator-tag">Pilot</span>
                <strong>{item}</strong>
                <span className="mt-linkCard__action">Verify</span>
              </article>
            ))}
          </div>
        </section>

        <section className="card operator-section" data-testid="launch-proof-onboarding-mobile">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">First user onboarding and mobile field proof</h2>
              <p className="operator-section__subtitle">One action per step, with clear saved or complete status from the owning page.</p>
            </div>
          </div>
          <div className="booking-summary-grid">
            <div>
              <h3>Onboarding path</h3>
              <div className="platform-admin-list">
                {onboardingProofSteps.map((step) => (
                  <Link className="mt-linkCard" href={step.href} key={step.label} data-testid={`launch-onboarding-${step.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}>
                    <strong>{step.label}</strong>
                    <span>Open</span>
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <h3>Mobile field path</h3>
              <div className="platform-admin-list">
                {mobileFieldChecklist.map((step) => (
                  <Link className="mt-linkCard" href={step.href} key={step.label} data-testid={`launch-mobile-${step.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}>
                    <strong>{step.label}</strong>
                    <span>Open</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {canViewPlatformDiagnostics ? (
          <section className="card operator-section" data-testid="launch-proof-uptime-monitor">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">External uptime monitor</h2>
                <p className="operator-section__subtitle">Truthful external monitoring state. MyTitan does not claim a monitor is configured unless provider evidence exists.</p>
              </div>
              <Link className="button secondary" href="/dashboard/settings/operations">Configure monitor</Link>
            </div>
            <OperatorDataTable columns="minmax(180px,0.7fr) minmax(220px,1fr) minmax(280px,1.3fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Status</div>
                <div className="operator-table__cell">Last check</div>
                <div className="operator-table__cell">Alert recipient</div>
              </OperatorDataTableHeader>
              <OperatorDataTableRow>
                <div className="operator-table__cell"><OperatorStatusBadge label={externalMonitorConfigured ? String(externalMonitorStatus).replace(/_/g, " ") : "not configured"} tone={externalMonitorConfigured ? "success" : "warning"} compact /></div>
                <div className="operator-table__cell">{ops?.checkedAt ? new Date(ops.checkedAt).toLocaleString() : "Not checked"}</div>
                <div className="operator-table__cell">{opsAlerts?.resolvedRecipientCount ? `${opsAlerts.resolvedRecipientCount} resolved recipient(s)` : "No alert recipient configured"}</div>
              </OperatorDataTableRow>
            </OperatorDataTable>
            <p className="muted">{ops?.externalMonitoring?.externalMonitorDetail || "No external uptime monitor is configured yet."}</p>
          </section>
        ) : null}

        {canViewPlatformDiagnostics ? (
          <section className="card operator-section" data-testid="launch-proof-release-discipline">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Release discipline</h2>
                <p className="operator-section__subtitle">Release checklist for the clean branch and tag. Rollback remains a documented operator action.</p>
              </div>
            </div>
            <div className="booking-summary-grid">
              {releaseChecklist.map((item) => (
                <article className="booking-lifecycle-card" key={item}>
                  <strong>{item}</strong>
                  <p>{item === "Annotated release tag" ? releaseTag : item === "Full stable suite" ? "446 passed, 0 failed, 0 skipped required before release." : "Required before launch handoff."}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </DashboardShell>
  );
}
