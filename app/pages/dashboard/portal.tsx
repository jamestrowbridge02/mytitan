import { useEffect, useMemo, useState } from "react";
import { OperatorNotice } from "../../components/feedback/OperatorNotice";
import { useOperatorNotice } from "../../components/feedback/useOperatorNotice";
import { DashboardShell } from "../../components/dashboard-shell";
import {
  OperatorActiveFilters,
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorFilterBar,
  OperatorFilterField,
  OperatorPageHeader,
  OperatorRowActions,
  OperatorSavedViews,
  OperatorStatusBadge,
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
  recentActivity: Array<{ id: string; type: string; message: string; createdAt?: string | null }>;
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

type PortalTab = "access" | "appearance" | "payments" | "links";
type LinkView = "active" | "approval" | "expiring" | "expired";

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

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not set";
  return parsed.toLocaleDateString();
}

function isExpiringSoon(job: PortalOverview["jobs"][number]) {
  return job.portalState === "active" && job.portalExpiresAt && new Date(job.portalExpiresAt).getTime() < Date.now() + 7 * 24 * 60 * 60 * 1000;
}

function portalStatusLabel(job: PortalOverview["jobs"][number]) {
  if (job.portalState === "active") return "Active";
  if (job.portalState === "expired") return "Expired";
  return "Not prepared";
}

function isValidHexColour(value: string) {
  return !value || /^#[0-9a-f]{6}$/i.test(value.trim());
}

export default function PortalOpsPage() {
  const [data, setData] = useState<PortalOverview | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [controls, setControls] = useState<PortalControls>(DEFAULT_PORTAL_CONTROLS);
  const [savedControls, setSavedControls] = useState<PortalControls>(DEFAULT_PORTAL_CONTROLS);
  const [accountHealth, setAccountHealth] = useState<AccountHealth | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [fixBusyKey, setFixBusyKey] = useState<string | null>(null);
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [activeTab, setActiveTab] = useState<PortalTab>("access");
  const [linkView, setLinkView] = useState<LinkView>("active");
  const [linkQuery, setLinkQuery] = useState("");
  const [linkStatus, setLinkStatus] = useState("");
  const [copiedJobId, setCopiedJobId] = useState("");
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();

  async function load() {
    try {
      const res = await apiFetch("/portal/overview");
      const nextControls = { ...DEFAULT_PORTAL_CONTROLS, ...(res?.controls || {}) };
      setData(res);
      setControls(nextControls);
      setSavedControls(nextControls);
      const health = await apiFetch("/tenant/account-health").catch(() => null);
      if (health) setAccountHealth(health);
      if (notice?.kind === "error") clearNotice();
    } catch (err: any) {
      showError(err?.message || "Failed to load portal links");
    }
  }

  useEffect(() => {
    let cancelled = false;
    const loadMe = async () => {
      try {
        const me = await apiFetch("/me");
        if (!cancelled) setPermissions(normalizePermissionSnapshot(me?.permissions));
      } catch {
        if (!cancelled) setPermissions(emptyPermissionSnapshot());
      } finally {
        if (!cancelled) setPermissionsReady(true);
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
      const endpoint = action === "link" ? `/portal/jobs/${jobId}/link` : action === "revoke" ? `/portal/jobs/${jobId}/revoke` : `/portal/jobs/${jobId}/regenerate`;
      await apiFetch(endpoint, { method: "POST" });
      showSuccess(action === "revoke" ? "Portal link revoked" : action === "regenerate" ? "Portal link regenerated" : "Portal link prepared");
      await load();
    } catch (err: any) {
      showError(err?.message || `Failed to ${action} portal link`);
    } finally {
      setBusyJobId(null);
    }
  }

  async function copyLink(job: PortalOverview["jobs"][number]) {
    if (!job.portalUrl) return showError("No active portal link to copy");
    try {
      await navigator.clipboard.writeText(job.portalUrl);
      setCopiedJobId(job.id);
      showSuccess("Portal link copied");
    } catch {
      showError("Could not copy portal link");
    }
  }

  async function saveControls() {
    if (!isValidHexColour(controls.brandPrimaryColor || "")) {
      showError("Use a six-digit brand colour such as #2563eb.");
      return;
    }
    setSettingsBusy(true);
    try {
      const current = await apiFetch("/tenant/settings");
      const businessConfig = current?.businessConfigJson && typeof current.businessConfigJson === "object" ? current.businessConfigJson : {};
      await apiFetch("/tenant/settings", {
        method: "PUT",
        body: JSON.stringify({
          businessConfigJson: { ...businessConfig, portalControls: controls },
          featureCustomerPortal: controls.portalEnabled,
          bookingPublicEnabled: controls.customerBookingEnabled,
        }),
      });
      setSavedControls(controls);
      showSuccess("Portal settings saved");
      await load();
    } catch (err: any) {
      showError(err?.message || "Failed to save portal settings");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function runHealthFix(key: string) {
    setFixBusyKey(key);
    try {
      await apiFetch(`/tenant/account-health/${encodeURIComponent(key)}/fix`, { method: "POST" });
      showSuccess("Setup item updated");
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
      { label: "Active links", value: String(data.summary.activeLinks) },
      { label: "Awaiting approval", value: String(data.summary.awaitingApproval) },
      { label: "Expiring soon", value: String(data.summary.expiringSoon) },
      { label: "Expired", value: String(data.summary.expiredLinks) },
    ];
  }, [data]);

  const filteredLinks = useMemo(() => {
    const q = linkQuery.trim().toLowerCase();
    return (data?.jobs || []).filter((job) => {
      if (linkView === "active" && job.portalState !== "active") return false;
      if (linkView === "approval" && job.approvedAt) return false;
      if (linkView === "expiring" && !isExpiringSoon(job)) return false;
      if (linkView === "expired" && job.portalState !== "expired") return false;
      if (linkStatus && job.portalState !== linkStatus) return false;
      if (q && ![job.jobRef, job.customerName, job.status, job.commercialState].some((value) => String(value || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [data?.jobs, linkQuery, linkStatus, linkView]);

  const openIssueCount = accountHealth?.summary?.openIssues ?? accountHealth?.issues?.length ?? 0;
  const unsaved = JSON.stringify(controls) !== JSON.stringify(savedControls);
  const previewJob = data?.jobs?.find((job) => job.portalUrl) || data?.jobs?.[0] || null;
  const linkFiltersActive = Boolean(linkQuery || linkStatus);

  if (permissionsReady && !hasWorkspacePermission(permissions, "portal.manage")) {
    return (
      <DashboardShell>
        <div className="operator-stack" data-testid="portal-governance-blocked">
          <OperatorPageHeader title="Customer Portal" />
          <OperatorEmptyStateCard
            title="Portal access restricted"
            description="Your role cannot manage customer portal access. Ask an owner, admin, or dispatcher for access."
            eyebrow={null}
          />
        </div>
      </DashboardShell>
    );
  }

  const accessControls: Array<[keyof PortalControls, string, string]> = [
    ["portalEnabled", "Enable Customer Portal", "Allow customers to use secure job links."],
    ["customerBookingEnabled", "Let customers book", "Allow public booking where configured."],
    ["displayEtaWindow", "Show progress/ETA", "Show progress timing when available."],
    ["displayTechnicianName", "Show assigned team member", "Use your configured workforce wording."],
    ["displayBeforeAfterPhotos", "Show before/after photos", "Only customer-visible photos are shown."],
    ["displayInvoicesPayments", "Show invoices and payments", "Show invoice and payment state."],
    ["allowCustomerDocumentDownload", "Allow document downloads", "Allow customer-safe files to download."],
  ];

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          title="Customer Portal"
          actions={[
            previewJob?.portalUrl ? { label: "Preview portal", href: previewJob.portalUrl, testId: "portal-preview-action" } : { label: "Preview portal", onClick: () => showError("Prepare a portal link before previewing."), testId: "portal-preview-action" },
          ]}
          stats={stats}
        />

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        {openIssueCount ? (
          <section className="card operator-section" data-testid="account-health-panel">
            <div className="portal-setup-alert">
              <strong>{openIssueCount} setup {openIssueCount === 1 ? "item needs" : "items need"} attention</strong>
              <button className="button secondary" type="button" onClick={() => setActiveTab("payments")}>Review setup</button>
            </div>
            <div className="portal-setup-list">
              {(accountHealth?.issues || []).slice(0, 3).map((issue) => (
                <div key={issue.key} className="portal-setup-item">
                  <span>{issue.issue}</span>
                  {issue.autoFixAvailable ? (
                    <button className="button secondary" type="button" onClick={() => void runHealthFix(issue.key)} disabled={fixBusyKey === issue.key} data-testid={`account-health-fix-${issue.key}`}>
                      {fixBusyKey === issue.key ? "Updating..." : issue.action}
                    </button>
                  ) : (
                    <a className="button secondary" href={issue.actionHref}>{issue.action}</a>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <OperatorSavedViews
          label="Customer portal tabs"
          activeView={activeTab}
          onChange={(next) => setActiveTab(next as PortalTab)}
          views={[
            { id: "access", label: "Customer access" },
            { id: "appearance", label: "Appearance" },
            { id: "payments", label: "Payments" },
            { id: "links", label: "Portal links", count: data?.jobs?.length || 0 },
          ]}
        />

        {activeTab === "access" ? (
          <section className="card operator-section" id="portal-controls" data-testid="portal-controls-panel">
            <div className="operator-section__header">
              <div><h2 className="operator-section__title">Customer access</h2></div>
              <button className="button" type="button" onClick={() => void saveControls()} disabled={settingsBusy || !unsaved} data-testid="portal-controls-save">
                {settingsBusy ? "Saving..." : unsaved ? "Save changes" : "Saved"}
              </button>
            </div>
            <div className="operator-grid operator-grid--three">
              {accessControls.map(([key, label, hint]) => (
                <label className="operator-checkRow" key={key} title={hint}>
                  <input
                    type="checkbox"
                    checked={Boolean((controls as any)[key])}
                    onChange={(event) => setControls((current) => ({ ...current, [key]: event.target.checked }))}
                    data-testid={`portal-control-${key}`}
                  />
                  <span><strong>{label}</strong><small>{hint}</small></span>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === "appearance" ? (
          <section className="card operator-section" data-testid="portal-appearance-panel">
            <div className="operator-section__header">
              <div><h2 className="operator-section__title">Appearance</h2></div>
              <button className="button" type="button" onClick={() => void saveControls()} disabled={settingsBusy || !unsaved}>
                {settingsBusy ? "Saving..." : "Save appearance"}
              </button>
            </div>
            <div className="portal-appearance-grid">
              <div className="form-grid form-grid--two">
                <label className="form-field">
                  <span>Brand colour</span>
                  <input className="input" type="text" value={controls.brandPrimaryColor || ""} placeholder="#2563eb" onChange={(event) => setControls((current) => ({ ...current, brandPrimaryColor: event.target.value }))} aria-invalid={!isValidHexColour(controls.brandPrimaryColor || "")} />
                  {!isValidHexColour(controls.brandPrimaryColor || "") ? <small className="error-text">Use #RRGGBB.</small> : null}
                </label>
                <label className="form-field">
                  <span>Customer help message</span>
                  <input className="input" type="text" value={controls.customerContactMessage || ""} placeholder="Call us if you need help with this booking." onChange={(event) => setControls((current) => ({ ...current, customerContactMessage: event.target.value }))} />
                </label>
              </div>
              <div className="portal-preview" data-testid="portal-preview-panel" style={{ "--portal-brand": controls.brandPrimaryColor || "#2563eb" } as any}>
                <div className="portal-preview__bar" />
                <strong>{previewJob?.jobRef || "Customer job"}</strong>
                <p>{controls.customerContactMessage || "We'll keep this page updated as the work progresses."}</p>
                <span>{controls.displayEtaWindow ? "ETA available when scheduled" : "Progress updates only"}</span>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "payments" ? (
          <section className="card operator-section" data-testid="portal-payments-panel">
            <div className="operator-section__header">
              <div><h2 className="operator-section__title">Payments</h2></div>
              <button className="button" type="button" onClick={() => void saveControls()} disabled={settingsBusy || !unsaved}>
                {settingsBusy ? "Saving..." : "Save payments"}
              </button>
            </div>
            {!data?.paymentsEnabled || !data?.stripeConfigured ? (
              <div className="operator-note">
                <strong>Payment setup incomplete</strong>
                <p>{data?.paymentSetupLabel || "Customer payment collection needs setup."}</p>
                <a className="button secondary" href="/dashboard/billing/readiness">Review payment setup</a>
              </div>
            ) : null}
            <div className="operator-grid operator-grid--three">
              {[
                ["depositsRequired", "Require deposit", "Ask for a deposit where supported."],
                ["allowBookingWithoutDeposit", "Allow booking without deposit", "Customers can book without upfront payment."],
                ["displayServicePrices", "Show service prices", "Show prices on public booking."],
                ["displayInvoicesPayments", "Show invoice/payment status", "Show customer billing status."],
              ].map(([key, label, hint]) => (
                <label className="operator-checkRow" key={key} title={hint}>
                  <input
                    type="checkbox"
                    checked={Boolean((controls as any)[key])}
                    onChange={(event) => setControls((current) => ({ ...current, [key]: event.target.checked }))}
                    data-testid={`portal-control-${key}`}
                  />
                  <span><strong>{label}</strong><small>{hint}</small></span>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === "links" ? (
          <section className="card operator-section" data-testid="portal-links-panel">
            <div className="operator-section__header">
              <div><h2 className="operator-section__title">Portal links</h2></div>
            </div>
            <OperatorSavedViews
              label="Portal link views"
              activeView={linkView}
              onChange={(next) => setLinkView(next as LinkView)}
              views={[
                { id: "active", label: "Active", count: data?.summary.activeLinks || 0 },
                { id: "approval", label: "Awaiting approval", count: data?.summary.awaitingApproval || 0 },
                { id: "expiring", label: "Expiring soon", count: data?.summary.expiringSoon || 0 },
                { id: "expired", label: "Expired", count: data?.summary.expiredLinks || 0 },
              ]}
            />
            <OperatorFilterBar
              searchValue={linkQuery}
              onSearchChange={setLinkQuery}
              searchPlaceholder="Search portal links..."
              resultsLabel={`${filteredLinks.length} shown`}
              actions={linkFiltersActive ? [{ label: "Reset", onClick: () => { setLinkQuery(""); setLinkStatus(""); }, variant: "secondary" }] : []}
            >
              <OperatorFilterField label="Status">
                <select className="input" value={linkStatus} onChange={(event) => setLinkStatus(event.target.value)} aria-label="Status">
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="not_provisioned">Not prepared</option>
                </select>
              </OperatorFilterField>
            </OperatorFilterBar>
            <OperatorActiveFilters
              chips={[
                linkStatus ? { id: "status", label: portalStatusLabel({ portalState: linkStatus } as any), onClear: () => setLinkStatus("") } : null,
                linkQuery ? { id: "query", label: linkQuery, onClear: () => setLinkQuery("") } : null,
              ].filter(Boolean) as any}
            />

            {filteredLinks.length ? (
              <OperatorDataTable columns="minmax(220px, 1.2fr) minmax(150px, 0.8fr) minmax(170px, 0.8fr) minmax(180px, auto)">
                <OperatorDataTableHeader>
                  <div className="operator-table__cell">Customer</div>
                  <div className="operator-table__cell">Status</div>
                  <div className="operator-table__cell">Expiry</div>
                  <div className="operator-table__cell">Actions</div>
                </OperatorDataTableHeader>
                {filteredLinks.map((job) => (
                  <OperatorDataTableRow key={job.id}>
                    <div className="operator-table__cell">
                      <div className="operator-cellTitle">{job.customerName}</div>
                      <div className="operator-cellSubtle">{job.jobRef} · {humanizeUnderscoreLabel(job.status)}</div>
                    </div>
                    <div className="operator-table__cell">
                      <OperatorStatusBadge label={portalStatusLabel(job)} tone={job.portalState === "expired" ? "critical" : job.portalState === "active" ? "success" : "neutral"} />
                      <div className="operator-cellSubtle">{job.approvedAt ? "Approved" : "Awaiting approval"}</div>
                    </div>
                    <div className="operator-table__cell">
                      <div>{formatDate(job.portalExpiresAt)}</div>
                      <div className="operator-cellSubtle">{job.invoicePaidAt ? "Paid" : job.invoiceIssuedAt ? "Invoice issued" : job.paymentSetupLabel || "Payment setup"}</div>
                    </div>
                    <div className="operator-table__cell operator-table__cell--actions">
                      <OperatorRowActions
                        primaryAction={
                          job.portalState === "expired"
                            ? { label: busyJobId === job.id ? "Regenerating..." : "Regenerate", onClick: () => void run(job.id, "regenerate"), disabled: busyJobId === job.id, testId: `portal-regenerate-${job.id}` }
                            : job.portalUrl
                            ? { label: "Open", href: job.portalUrl, testId: `portal-open-${job.id}` }
                            : { label: busyJobId === job.id ? "Preparing..." : "Prepare", onClick: () => void provisionLink(job.id), disabled: busyJobId === job.id, testId: `portal-prepare-${job.id}` }
                        }
                        actions={[
                          { label: "Open job", href: `/dashboard/jobs/${job.id}`, group: "Record" },
                          ...(job.portalUrl ? [{ label: copiedJobId === job.id ? "Copied" : "Copy link", onClick: () => void copyLink(job), group: "Portal", testId: `portal-copy-${job.id}` }] : []),
                          ...(job.portalUrl ? [{ label: "Preview", href: job.portalUrl, group: "Portal" }] : []),
                          ...(job.portalTokenActive ? [{ label: busyJobId === job.id ? "Regenerating..." : "Regenerate", onClick: () => void run(job.id, "regenerate"), group: "Portal", disabled: busyJobId === job.id, testId: `portal-regenerate-${job.id}` }] : []),
                          ...(job.portalTokenActive ? [{ label: busyJobId === job.id ? "Revoking..." : "Revoke", onClick: () => void run(job.id, "revoke"), group: "Portal", disabled: busyJobId === job.id, testId: `portal-revoke-${job.id}` }] : []),
                          { label: "Review approval", href: `/dashboard/jobs/${job.id}`, group: "Review" },
                        ]}
                      />
                    </div>
                  </OperatorDataTableRow>
                ))}
              </OperatorDataTable>
            ) : (
              <OperatorEmptyStateCard
                title={linkFiltersActive ? "No portal links match these filters." : "No portal links yet"}
                description={linkFiltersActive ? "Clear filters to see more links." : "Open jobs to prepare customer portal access."}
                eyebrow={null}
                actions={linkFiltersActive ? [{ label: "Clear filters", onClick: () => { setLinkQuery(""); setLinkStatus(""); } }] : [{ label: "Open jobs", href: "/dashboard/jobs" }, { label: "Preview portal", onClick: () => showError("Prepare a portal link before previewing."), variant: "secondary" }]}
              />
            )}
          </section>
        ) : null}

        {data?.recentActivity?.length ? (
          <section className="card operator-section">
            <div className="operator-section__header">
              <div><h2 className="operator-section__title">Portal audit history</h2></div>
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
      <style jsx>{`
        .portal-setup-alert,
        .portal-setup-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .portal-setup-list {
          display: grid;
          gap: 8px;
          margin-top: 12px;
        }
        .portal-setup-item {
          border-top: 1px solid var(--border, #d9e2ec);
          padding-top: 8px;
        }
        .portal-appearance-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
          gap: 16px;
        }
        .portal-preview {
          border: 1px solid var(--border, #d9e2ec);
          border-radius: 8px;
          padding: 14px;
          display: grid;
          gap: 8px;
          align-content: start;
        }
        .portal-preview__bar {
          height: 6px;
          border-radius: 999px;
          background: var(--portal-brand);
        }
        .error-text {
          color: #b91c1c;
        }
        @media (max-width: 900px) {
          .portal-appearance-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </DashboardShell>
  );
}
