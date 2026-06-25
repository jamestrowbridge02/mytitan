import { useEffect, useMemo, useState } from "react";
import { OperatorNotice } from "../../components/feedback/OperatorNotice";
import { useOperatorNotice } from "../../components/feedback/useOperatorNotice";
import { DashboardShell } from "../../components/dashboard-shell";
import {
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorGuidance,
  OperatorPageHeader,
  OperatorRowActions,
} from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import { humanizeUnderscoreLabel } from "../../lib/text-format";
import { emptyPermissionSnapshot, hasWorkspacePermission, normalizePermissionSnapshot } from "../../lib/workspace-permissions";

type PortalOverview = {
  enabled: boolean;
  controls?: PortalControls;
  paymentsEnabled: boolean;
  stripeConfigured: boolean;
  paymentSetupLabel?: string;
  paymentSetupDetail?: string;
  summary: {
    activeLinks: number;
    expiredLinks: number;
    awaitingApproval: number;
    paymentReady: number;
    expiringSoon: number;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    message: string;
    createdAt?: string | null;
  }>;
  jobs: Array<{
    id: string;
    jobRef: string;
    customerName: string;
    status: string;
    approvedAt?: string | null;
    invoiceIssuedAt?: string | null;
    invoiceDueAt?: string | null;
    invoicePaidAt?: string | null;
    portalTokenActive: boolean;
    portalState?: string;
    portalExpiresAt?: string | null;
    portalUrl?: string | null;
    invoiceOverdue?: boolean;
    paymentReady: boolean;
    paymentSetupLabel?: string | null;
    paymentSetupDetail?: string | null;
    commercialState?: string;
    nextCustomerStep?: string;
  }>;
};

type PortalControls = {
  portalEnabled: boolean;
  customerBookingEnabled: boolean;
  depositsRequired: boolean;
  allowBookingWithoutDeposit: boolean;
  displayServicePrices: boolean;
  displayTechnicianName: boolean;
  displayEtaWindow: boolean;
  displayBeforeAfterPhotos: boolean;
  displayInvoicesPayments: boolean;
  allowCustomerDocumentDownload: boolean;
  brandPrimaryColor?: string | null;
  customerContactMessage?: string | null;
};

type AccountHealth = {
  platformDiagnosticsVisible: boolean;
  summary: { openIssues: number; autoFixable: number; actionRequired: number };
  issues: Array<{
    key: string;
    issue: string;
    impact: string;
    safeFix: string;
    action: string;
    actionHref: string;
    autoFixAvailable: boolean;
    autoFixed: boolean;
  }>;
};

const DEFAULT_PORTAL_CONTROLS: PortalControls = {
  portalEnabled: true,
  customerBookingEnabled: true,
  depositsRequired: false,
  allowBookingWithoutDeposit: true,
  displayServicePrices: true,
  displayTechnicianName: false,
  displayEtaWindow: true,
  displayBeforeAfterPhotos: true,
  displayInvoicesPayments: true,
  allowCustomerDocumentDownload: true,
  brandPrimaryColor: null,
  customerContactMessage: "",
};

export default function PortalOpsPage() {
  const [data, setData] = useState<PortalOverview | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [controls, setControls] = useState<PortalControls>(DEFAULT_PORTAL_CONTROLS);
  const [accountHealth, setAccountHealth] = useState<AccountHealth | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [fixBusyKey, setFixBusyKey] = useState<string | null>(null);
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [permissionsReady, setPermissionsReady] = useState(false);
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();

  async function load() {
    try {
      const res = await apiFetch("/portal/overview");
      setData(res);
      setControls({ ...DEFAULT_PORTAL_CONTROLS, ...(res?.controls || {}) });
      const health = await apiFetch("/tenant/account-health").catch(() => null);
      if (health) setAccountHealth(health);
      if (notice?.kind === "error") clearNotice();
    } catch (err: any) {
      showError(err?.message || "Failed to load portal operations");
    }
  }

  useEffect(() => {
    let cancelled = false;
    const loadMe = async () => {
      try {
        const me = await apiFetch("/me");
        if (!cancelled) {
          setPermissions(normalizePermissionSnapshot(me?.permissions));
        }
      } catch {
        if (!cancelled) {
          setPermissions(emptyPermissionSnapshot());
        }
      } finally {
        if (!cancelled) {
          setPermissionsReady(true);
        }
      }
    };
    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!permissionsReady || !hasWorkspacePermission(permissions, "portal.manage")) return;
    void load();
  }, [permissions, permissionsReady]);

  async function provisionLink(jobId: string) {
    setBusyJobId(jobId);
    try {
      await apiFetch(`/portal/jobs/${jobId}/link`, { method: "POST" });
      showSuccess("Portal link prepared");
      await load();
    } catch (err: any) {
      showError(err?.message || "Failed to prepare portal link");
    } finally {
      setBusyJobId(null);
    }
  }

  async function run(jobId: string, action: "link" | "revoke" | "regenerate") {
    setBusyJobId(jobId);
    try {
      const endpoint =
        action === "link"
          ? `/portal/jobs/${jobId}/link`
          : action === "revoke"
          ? `/portal/jobs/${jobId}/revoke`
          : `/portal/jobs/${jobId}/regenerate`;
      await apiFetch(endpoint, { method: "POST" });
      showSuccess(
        action === "revoke"
          ? "Portal link revoked. Existing customer access is now blocked."
          : action === "regenerate"
          ? "Portal link regenerated. Previous access has been replaced."
          : "Portal link prepared",
      );
      await load();
    } catch (err: any) {
      showError(err?.message || `Failed to ${action} portal link`);
    } finally {
      setBusyJobId(null);
    }
  }

  async function saveControls() {
    setSettingsBusy(true);
    try {
      const current = await apiFetch("/tenant/settings");
      const businessConfig = current?.businessConfigJson && typeof current.businessConfigJson === "object" ? current.businessConfigJson : {};
      await apiFetch("/tenant/settings", {
        method: "PUT",
        body: JSON.stringify({
          businessConfigJson: {
            ...businessConfig,
            portalControls: controls,
          },
          featureCustomerPortal: controls.portalEnabled,
          bookingPublicEnabled: controls.customerBookingEnabled,
        }),
      });
      showSuccess("Portal controls saved");
      await load();
    } catch (err: any) {
      showError(err?.message || "Failed to save portal controls");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function runHealthFix(key: string) {
    setFixBusyKey(key);
    try {
      await apiFetch(`/tenant/account-health/${encodeURIComponent(key)}/fix`, { method: "POST" });
      showSuccess("Account health fix applied");
      const health = await apiFetch("/tenant/account-health");
      setAccountHealth(health);
    } catch (err: any) {
      showError(err?.message || "This item needs manual review");
    } finally {
      setFixBusyKey(null);
    }
  }

  const stats = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Active links", value: String(data.summary.activeLinks), hint: "Jobs with portal access live now" },
      { label: "Expired links", value: String(data.summary.expiredLinks), hint: "Links that need regeneration before customers can re-enter" },
      { label: "Awaiting approval", value: String(data.summary.awaitingApproval), hint: "Completed work still waiting on sign-off" },
      { label: "Payment path", value: String(data.summary.paymentReady), hint: data.paymentSetupLabel || "Manual collection or business provider setup" },
      { label: "Expiring soon", value: String(data.summary.expiringSoon), hint: "Portal links expiring within 7 days" },
    ];
  }, [data]);

  if (permissionsReady && !hasWorkspacePermission(permissions, "portal.manage")) {
    return (
      <DashboardShell>
        <div className="operator-stack" data-testid="portal-governance-blocked">
          <OperatorPageHeader
            eyebrow="Business OS"
            title="Portal Ops"
            subtitle="Portal lifecycle controls are limited to roles that can manage customer-facing access."
            stats={[]}
          />
          <OperatorEmptyStateCard
            title="Portal access restricted"
            description="Your workspace role cannot manage portal lifecycle actions. Ask an owner, admin, or dispatcher for access."
          />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Business OS"
          title="Portal Ops"
          subtitle="Internal control over customer-facing job links, approval state, and the payment guidance customers actually see."
          actions={[
            { label: "Billing readiness", href: "/dashboard/billing/readiness", variant: "secondary" },
            { label: "Jobs", href: "/dashboard/jobs" },
          ]}
          shortcuts={["Portal links stay internal until explicitly opened", "This view manages customer access from the operator side"]}
          stats={stats}
        />

        <OperatorGuidance
          title="Portal operations"
          items={[
            "This page is internal only. Public access still depends on tokenized portal routes.",
            "Use Prepare link to provision or refresh a customer-safe portal URL for a job.",
            "Customer page access and payment setup are shown separately so MyTitan billing never gets mistaken for customer money collection.",
          ]}
        />

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        <section className="card operator-section" id="portal-controls" data-testid="portal-controls-panel">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Customer portal controls</h2>
              <p className="operator-section__subtitle">Owner/admin controls for booking, deposits, customer visibility, and safe portal wording.</p>
            </div>
            <button className="button" type="button" onClick={() => void saveControls()} disabled={settingsBusy} data-testid="portal-controls-save">
              {settingsBusy ? "Saving..." : "Save controls"}
            </button>
          </div>

          <div className="operator-grid operator-grid--three">
            {[
              ["portalEnabled", "Portal access enabled", "Customers can use tokenized portal links."],
              ["customerBookingEnabled", "Let customers book directly", "Public booking remains tenant-controlled."],
              ["depositsRequired", "Require deposit", "Requires tenant payment readiness before live collection."],
              ["allowBookingWithoutDeposit", "Allow booking without deposit", "Bookings can still be created without upfront payment."],
              ["displayServicePrices", "Show service prices", "Public booking can display service pricing."],
              ["displayTechnicianName", "Show technician name", "Off by default to avoid premature assignment claims."],
              ["displayEtaWindow", "Show ETA window", "Customer portal can show ETA/work progress where recorded."],
              ["displayBeforeAfterPhotos", "Show before/after photos", "Only customer-visible photos are exposed."],
              ["displayInvoicesPayments", "Show invoices/payments", "Invoice and manual/provider payment status are visible."],
              ["allowCustomerDocumentDownload", "Allow document download", "Customers can download portal-safe documents."],
            ].map(([key, label, hint]) => (
              <label className="operator-checkRow" key={key}>
                <input
                  type="checkbox"
                  checked={Boolean((controls as any)[key])}
                  onChange={(event) => setControls((current) => ({ ...current, [key]: event.target.checked }))}
                  data-testid={`portal-control-${key}`}
                />
                <span>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="form-grid form-grid--two" style={{ marginTop: 16 }}>
            <label className="form-field">
              <span>Portal brand colour</span>
              <input className="input" type="text" value={controls.brandPrimaryColor || ""} placeholder="#2563eb" onChange={(event) => setControls((current) => ({ ...current, brandPrimaryColor: event.target.value }))} />
            </label>
            <label className="form-field">
              <span>Customer contact message</span>
              <input className="input" type="text" value={controls.customerContactMessage || ""} placeholder="Call us if you need help with this booking." onChange={(event) => setControls((current) => ({ ...current, customerContactMessage: event.target.value }))} />
            </label>
          </div>
        </section>

        <section className="card operator-section" data-testid="account-health-panel">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Account health</h2>
              <p className="operator-section__subtitle">Tenant-safe checks only. Platform diagnostics stay out of this workspace view.</p>
            </div>
          </div>
          {accountHealth?.issues?.length ? (
            <OperatorDataTable columns="minmax(220px, 1fr) minmax(220px, 1fr) minmax(160px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Issue</div>
                <div className="operator-table__cell">Fix</div>
                <div className="operator-table__cell">Action</div>
              </OperatorDataTableHeader>
              {accountHealth.issues.map((issue) => (
                <OperatorDataTableRow key={issue.key}>
                  <div className="operator-table__cell">
                    <div className="operator-cellTitle">{issue.issue}</div>
                    <div className="operator-cellSubtle">{issue.impact}</div>
                  </div>
                  <div className="operator-table__cell">
                    <div className="operator-cellSubtle">{issue.safeFix}</div>
                  </div>
                  <div className="operator-table__cell operator-table__cell--actions">
                    {issue.autoFixAvailable ? (
                      <button className="button secondary" type="button" onClick={() => void runHealthFix(issue.key)} disabled={fixBusyKey === issue.key} data-testid={`account-health-fix-${issue.key}`}>
                        {fixBusyKey === issue.key ? "Fixing..." : issue.action}
                      </button>
                    ) : (
                      <a className="button secondary" href={issue.actionHref}>{issue.action}</a>
                    )}
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard title="No fixable account issues" description="Tenant account health checks are clean and platform diagnostics are not exposed here." />
          )}
        </section>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Customer-facing job access</h2>
              <p className="operator-section__subtitle">Manage public job links while keeping payment wording aligned to the workspace payment setup.</p>
            </div>
          </div>

          {data?.jobs?.length ? (
            <OperatorDataTable columns="minmax(220px, 1.4fr) minmax(160px, 1fr) minmax(160px, 0.9fr) minmax(180px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Job</div>
                <div className="operator-table__cell">Portal state</div>
                <div className="operator-table__cell">Commercial state</div>
                <div className="operator-table__cell">Actions</div>
              </OperatorDataTableHeader>
              {data.jobs.map((job) => (
                <OperatorDataTableRow key={job.id}>
                  <div className="operator-table__cell">
                    <div className="operator-cellTitle">{job.jobRef}</div>
                    <div className="operator-cellSubtle">{job.customerName} · {job.status}</div>
                  </div>
                  <div className="operator-table__cell">
                    <div className="operator-cellMeta">
                      <span><strong>{job.portalState === "active" ? "Link active" : job.portalState === "expired" ? "Link expired" : "No active link"}</strong></span>
                      <span>{job.portalExpiresAt ? `${job.portalState === "expired" ? "Expired" : "Expires"} ${new Date(job.portalExpiresAt).toLocaleDateString()}` : "No expiry set"}</span>
                      {job.portalState === "expired" ? <span>Regeneration required</span> : null}
                      {job.portalState === "active" && job.portalExpiresAt && new Date(job.portalExpiresAt).getTime() < Date.now() + 7 * 24 * 60 * 60 * 1000 ? <span>Refresh recommended</span> : null}
                      <span>{job.approvedAt ? "Approved" : "Awaiting approval state"}</span>
                    </div>
                  </div>
                  <div className="operator-table__cell">
                    <div className="operator-cellMeta">
                      <span><strong>{job.invoicePaidAt ? "Paid" : job.invoiceIssuedAt ? "Invoice issued" : "Pre-invoice"}</strong></span>
                      {job.commercialState ? <span>Lifecycle {humanizeUnderscoreLabel(job.commercialState)}</span> : null}
                      {job.invoiceDueAt ? <span>{job.invoiceOverdue ? `Payment overdue since ${new Date(job.invoiceDueAt).toLocaleDateString()}` : `Payment due ${new Date(job.invoiceDueAt).toLocaleDateString()}`}</span> : null}
                      <span>{job.paymentSetupLabel || (job.paymentReady ? "Manual collection" : "Payment setup needed")}</span>
                      {job.paymentSetupDetail ? <span>{job.paymentSetupDetail}</span> : null}
                      {job.nextCustomerStep ? <span>{job.nextCustomerStep}</span> : null}
                    </div>
                  </div>
                  <div className="operator-table__cell operator-table__cell--actions">
                    <OperatorRowActions
                      primaryAction={
                        job.portalState === "expired"
                          ? { label: busyJobId === job.id ? "Regenerating..." : "Regenerate link", onClick: () => void run(job.id, "regenerate"), disabled: busyJobId === job.id, testId: `portal-regenerate-${job.id}` }
                          : job.portalUrl
                          ? { label: "Open customer page", href: job.portalUrl, testId: `portal-open-${job.id}` }
                          : { label: busyJobId === job.id ? "Preparing..." : "Prepare link", onClick: () => void provisionLink(job.id), disabled: busyJobId === job.id, testId: `portal-prepare-${job.id}` }
                      }
                      actions={[
                        { label: "Open job", href: `/dashboard/jobs/${job.id}`, group: "Internal", description: "Review the internal job record" },
                        ...(job.portalTokenActive
                          ? [
                              { label: busyJobId === job.id ? "Regenerating..." : "Regenerate link", onClick: () => void run(job.id, "regenerate"), group: "Portal lifecycle", description: "Invalidate the current link and issue a new token", disabled: busyJobId === job.id, testId: `portal-regenerate-${job.id}` },
                              { label: busyJobId === job.id ? "Revoking..." : "Revoke link", onClick: () => void run(job.id, "revoke"), group: "Portal lifecycle", description: "Expire the current customer portal token", disabled: busyJobId === job.id, testId: `portal-revoke-${job.id}` },
                            ]
                          : job.portalState === "expired"
                          ? [{ label: busyJobId === job.id ? "Regenerating..." : "Regenerate link", onClick: () => void run(job.id, "regenerate"), group: "Portal lifecycle", description: "Issue a fresh customer portal token after expiry", disabled: busyJobId === job.id, testId: `portal-regenerate-${job.id}` }]
                          : []),
                        { label: "Open billing readiness", href: "/dashboard/billing/readiness", group: "Internal", description: "Review billing and customer payment setup" },
                      ]}
                    />
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="No portal-manageable jobs yet"
              description="Jobs with internal/customer handoff value will appear here once work starts moving through approval and payment states."
              actions={[{ label: "Open jobs", href: "/dashboard/jobs" }]}
            />
          )}
        </section>

        {data?.recentActivity?.length ? (
          <section className="card operator-section">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Portal lifecycle audit</h2>
                <p className="operator-section__subtitle">Recent internal portal access events from the operator side.</p>
              </div>
            </div>

            <OperatorDataTable columns="minmax(220px, 1fr) minmax(160px, 0.8fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Event</div>
                <div className="operator-table__cell">When</div>
              </OperatorDataTableHeader>
              {data.recentActivity.map((event) => (
                <OperatorDataTableRow key={event.id}>
                  <div className="operator-table__cell">
                    <div className="operator-cellTitle">{event.type}</div>
                    <div className="operator-cellSubtle">{event.message}</div>
                  </div>
                  <div className="operator-table__cell">{event.createdAt ? new Date(event.createdAt).toLocaleString() : "Unknown"}</div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          </section>
        ) : null}
      </div>
    </DashboardShell>
  );
}
