import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "../../../components/dashboard-shell";
import { EmptyState } from "../../../components/states/EmptyState";
import { ErrorState } from "../../../components/states/ErrorState";
import { LoadingState } from "../../../components/states/LoadingState";
import { ApiError, apiFetch } from "../../../lib/api";
import { isAutomationsV1Enabled } from "../../../lib/feature-flags";

type AutomationSettings = {
  bookingRemindersEnabled: boolean;
  approvalRequestEnabled: boolean;
  reviewRequestEnabled: boolean;
  jobCompletionFollowUpEnabled: boolean;
  deliveryMode?: "metadata_only" | "live_send";
};

type AutomationRule = {
  key: string;
  label: string;
  enabled: boolean;
  trigger: string;
  action: string;
  deliveryMode?: "metadata_only" | "live_send";
};

type AutomationRun = {
  id: string;
  type: string;
  label: string;
  at?: string | null;
  jobId?: string | null;
  customerId?: string | null;
  jobRef?: string | null;
  customerName?: string | null;
  status?: string | null;
  payloadJson?: {
    automationKey?: string | null;
    reminderCreated?: boolean;
    remindAt?: string | null;
    invoiceDueAt?: string | null;
    invoicePaidAt?: string | null;
  } | null;
};

type CommsEvent = {
  id: string;
  entityType?: string | null;
  entityId?: string | null;
  channel?: string | null;
  status?: string | null;
  reasonKey?: string | null;
  createdAt?: string | null;
  scheduledFor?: string | null;
};

type ActivityAggregate = {
  reminders: number;
  approval: number;
  reviews: number;
  failed: number;
  since?: string;
};

type PreviewData = {
  rules?: AutomationRule[];
  bookingReminders: {
    reminders24h: number;
    reminders2h: number;
    total: number;
  };
  approvalRequests: {
    jobsAwaitingApproval: number;
  };
  reviewRequests: {
    jobsEligible: number;
  };
  windowDays?: number;
};

type ActivityFilter = "all" | "reminders" | "approval" | "reviews";

const DEFAULT_SETTINGS: AutomationSettings = {
  bookingRemindersEnabled: false,
  approvalRequestEnabled: false,
  reviewRequestEnabled: false,
  jobCompletionFollowUpEnabled: false,
  deliveryMode: "metadata_only",
};

const REASON_LABELS: Record<string, string> = {
  booking_reminder_24h: "Booking reminder (24h)",
  booking_reminder_2h: "Booking reminder (2h)",
  approval_request: "Approval request",
  review_request: "Review request",
};

function formatTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getEntityLink(entityType?: string | null, entityId?: string | null) {
  if (!entityType || !entityId) return null;
  const type = entityType.toLowerCase();
  if (type === "job") return { href: "/dashboard/jobs/" + entityId, label: "Job " + entityId.slice(0, 6) };
  if (type === "booking") return { href: "/dashboard/bookings/" + entityId, label: "Booking " + entityId.slice(0, 6) };
  if (type === "trade_account" || type === "tradeaccount") {
    return { href: "/dashboard/trade-accounts/" + entityId, label: "Trade " + entityId.slice(0, 6) };
  }
  return null;
}

export default function AutomationsSettingsPage() {
  const enabled = isAutomationsV1Enabled();
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<string>("");
  const [confirmLiveSend, setConfirmLiveSend] = useState(false);
  const [showLiveSendModal, setShowLiveSendModal] = useState(false);

  const [activity, setActivity] = useState<CommsEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState("");
  const [activityRequestId, setActivityRequestId] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [aggregate, setAggregate] = useState<ActivityAggregate | null>(null);
  const [aggregateRequestId, setAggregateRequestId] = useState<string | undefined>(undefined);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewRequestId, setPreviewRequestId] = useState<string | undefined>(undefined);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState("");
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState("");

  async function load() {
    if (!enabled) return;
    setLoading(true);
    setError("");
    setRequestId(undefined);
    try {
      const [data, me] = await Promise.all([apiFetch("/automations/settings"), apiFetch("/me")]);
      setSettings({ ...DEFAULT_SETTINGS, ...(data || {}) });
      setMeRole(me?.role || "");
    } catch (err: any) {
      setError(err?.message || "Failed to load automations");
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setLoading(false);
    }
  }

  async function loadActivity(nextFilter: ActivityFilter) {
    if (!enabled) return;
    setActivityLoading(true);
    setActivityError("");
    setActivityRequestId(undefined);
    try {
      const params = new URLSearchParams({ scope: "tenant" });
      if (nextFilter === "reminders") {
        params.set("reasonKeyPrefix", "booking_reminder_");
      } else if (nextFilter === "approval") {
        params.set("reasonKey", "approval_request");
      } else if (nextFilter === "reviews") {
        params.set("reasonKey", "review_request");
      }
      const data = await apiFetch(`/notifications/comms?${params.toString()}`);
      setActivity(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setActivityError(err?.message || "Failed to load automation activity");
      setActivityRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setActivityLoading(false);
    }
  }

  async function loadAggregate() {
    if (!enabled) return;
    setAggregateRequestId(undefined);
    try {
      const data = await apiFetch("/notifications/comms?scope=tenant&aggregate=automations");
      if (data && typeof data === "object") {
        setAggregate({
          reminders: Number((data as any).reminders || 0),
          approval: Number((data as any).approval || 0),
          reviews: Number((data as any).reviews || 0),
          failed: Number((data as any).failed || 0),
          since: (data as any).since,
        });
      } else {
        setAggregate(null);
      }
    } catch (err: any) {
      setAggregate(null);
      setAggregateRequestId(err instanceof ApiError ? err.requestId : undefined);
    }
  }

  async function loadPreview() {
    if (!enabled) return;
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewRequestId(undefined);
    try {
      const data = await apiFetch("/automations/preview");
      if (data && typeof data === "object") {
        setPreview(data as PreviewData);
      } else {
        setPreview(null);
      }
    } catch (err: any) {
      setPreviewError(err?.message || "Failed to load preview");
      setPreviewRequestId(err instanceof ApiError ? err.requestId : undefined);
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function loadRules() {
    if (!enabled) return;
    setRulesLoading(true);
    setRulesError("");
    try {
      const data = await apiFetch("/automations/rules");
      setRules(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setRules([]);
      setRulesError(err?.message || "Failed to load automation rules");
    } finally {
      setRulesLoading(false);
    }
  }

  async function loadRuns() {
    if (!enabled) return;
    setRunsLoading(true);
    setRunsError("");
    try {
      const data = await apiFetch("/automations/runs?limit=12");
      setRuns(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setRuns([]);
      setRunsError(err?.message || "Failed to load automation runs");
    } finally {
      setRunsLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadActivity(filter);
    loadAggregate();
    loadPreview();
    loadRules();
    loadRuns();
  }, [enabled]);

  async function updateSetting(key: keyof AutomationSettings, value: boolean) {
    if (!settings) return;
    setSavingKey(key);
    setError("");
    setRequestId(undefined);
    const previous = settings[key];
    setSettings({ ...settings, [key]: value });
    try {
      const data = await apiFetch("/automations/settings", {
        method: "PATCH",
        body: JSON.stringify({ [key]: value }),
      });
      setSettings({ ...DEFAULT_SETTINGS, ...(data || {}) });
    } catch (err: any) {
      setSettings({ ...settings, [key]: previous });
      setError(err?.message || "Failed to update automations");
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setSavingKey(null);
    }
  }

  async function updateDeliveryMode(value: "metadata_only" | "live_send") {
    if (!settings) return;
    if (value === "live_send" && !confirmLiveSend) {
      setError("Please confirm live sending before enabling.");
      return;
    }
    setSavingKey("deliveryMode");
    setError("");
    setRequestId(undefined);
    const previous = settings.deliveryMode || "metadata_only";
    setSettings({ ...settings, deliveryMode: value });
    try {
      const payload: any = { deliveryMode: value };
      if (value === "live_send") {
        payload.confirmLiveSend = confirmLiveSend;
      }
      const data = await apiFetch("/automations/settings", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setSettings({ ...DEFAULT_SETTINGS, ...(data || {}) });
      setConfirmLiveSend(false);
      if (value === "live_send") {
        setShowLiveSendModal(false);
      }
    } catch (err: any) {
      setSettings({ ...settings, deliveryMode: previous });
      setError(err?.message || "Failed to update delivery mode");
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setSavingKey(null);
    }
  }

  useEffect(() => {
    loadActivity(filter);
  }, [filter, enabled]);

  if (!enabled) {
    return (
      <DashboardShell>
        <EmptyState
          title="Automations are not enabled"
          description="Enable Automations V1 to configure reminders and requests."
          primaryAction={{ label: "Back to dashboard", href: "/dashboard" }}
        />
      </DashboardShell>
    );
  }

  if (loading && !settings) {
    return (
      <DashboardShell>
        <LoadingState title="Loading automations" description="Fetching tenant automation settings." />
      </DashboardShell>
    );
  }

  if (error && !settings) {
    return (
      <DashboardShell>
        <ErrorState
          title="Could not load automations"
          description={error}
          requestId={requestId}
          primaryAction={{ label: "Try again", onClick: load }}
          secondaryAction={{ label: "Back to settings", href: "/dashboard/settings" }}
        />
      </DashboardShell>
    );
  }

  const current = settings || DEFAULT_SETTINGS;

  return (
    <DashboardShell>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>Automations</h1>
        <p className="muted">Control which automatic customer updates are queued.</p>
        {error ? (
          <p className="muted" style={{ marginTop: 0 }}>
            {error}{requestId ? " (Support code: " + requestId + ")" : ""}
          </p>
        ) : null}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={current.bookingRemindersEnabled}
              onChange={(e) => updateSetting("bookingRemindersEnabled", e.target.checked)}
              disabled={savingKey === "bookingRemindersEnabled"}
            />
            <div>
              <strong>Booking reminders</strong>
              <p className="muted" style={{ margin: 0 }}>Queue reminders ahead of scheduled bookings.</p>
            </div>
          </label>

          <label style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={current.approvalRequestEnabled}
              onChange={(e) => updateSetting("approvalRequestEnabled", e.target.checked)}
              disabled={savingKey === "approvalRequestEnabled"}
            />
            <div>
              <strong>Approval requests</strong>
              <p className="muted" style={{ margin: 0 }}>Queue approval requests when jobs are completed.</p>
            </div>
          </label>

          <label style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={current.reviewRequestEnabled}
              onChange={(e) => updateSetting("reviewRequestEnabled", e.target.checked)}
              disabled={savingKey === "reviewRequestEnabled"}
            />
            <div>
              <strong>Review requests</strong>
              <p className="muted" style={{ margin: 0 }}>Queue review requests after payment is received.</p>
            </div>
          </label>

          <label style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={current.jobCompletionFollowUpEnabled}
              onChange={(e) => updateSetting("jobCompletionFollowUpEnabled", e.target.checked)}
              disabled={savingKey === "jobCompletionFollowUpEnabled"}
            />
            <div>
              <strong>Billing follow-up reminder</strong>
              <p className="muted" style={{ margin: 0 }}>Create a durable follow-up reminder when completed work still needs invoice or payment handling.</p>
            </div>
          </label>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Delivery mode</h2>
        <p className="muted">Choose whether automations only record metadata or send live updates.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="muted">Current:</span>
            <span className="badge">{(current.deliveryMode || "metadata_only") === "live_send" ? "Live send" : "Metadata only"}</span>
          </div>
          {(current.deliveryMode || "metadata_only") === "live_send" ? (
            <button
              type="button"
              className="button secondary"
              onClick={() => updateDeliveryMode("metadata_only")}
              disabled={savingKey === "deliveryMode"}
            >
              Switch to Metadata Only
            </button>
          ) : (
            <button
              type="button"
              className="button"
              onClick={() => {
                setConfirmLiveSend(false);
                setShowLiveSendModal(true);
              }}
              disabled={savingKey === "deliveryMode" || !(meRole === "OWNER" || meRole === "ADMIN")}
            >
              Enable Live Send
            </button>
          )}
        </div>
        {!(meRole === "OWNER" || meRole === "ADMIN") ? (
          <p className="muted" style={{ marginTop: 8 }}>Only Owners or Admins can enable live sending.</p>
        ) : null}
      </div>

      {showLiveSendModal ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 520 }}>
            <h3 style={{ marginTop: 0 }}>Enable live send?</h3>
            <p className="muted">
              Live send will deliver external notifications when automations run. Ensure templates and delivery
              providers are configured before enabling.
            </p>
            <label style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
              <input
                type="checkbox"
                checked={confirmLiveSend}
                onChange={(e) => setConfirmLiveSend(e.target.checked)}
                disabled={savingKey === "deliveryMode"}
              />
              <span className="muted">I understand live sending will deliver external notifications.</span>
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, flexWrap: "wrap" }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowLiveSendModal(false)}
                disabled={savingKey === "deliveryMode"}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                onClick={() => updateDeliveryMode("live_send")}
                disabled={savingKey === "deliveryMode" || !confirmLiveSend}
              >
                Enable Live Send
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Preview (next 7 days)</h2>
        <p className="muted">Estimated automation events without queuing anything.</p>
        {previewLoading ? (
          <LoadingState title="Loading preview" description="Calculating upcoming automation activity." />
        ) : null}
        {!previewLoading && previewError ? (
          <p className="muted">
            {previewError}{previewRequestId ? " (Support code: " + previewRequestId + ")" : ""}
          </p>
        ) : null}
        {!previewLoading && preview ? (
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <div style={{ minWidth: 220 }}>
                <strong>Booking reminders</strong>
                <p className="muted" style={{ margin: 0 }}>24h: {preview.bookingReminders.reminders24h} · 2h: {preview.bookingReminders.reminders2h}</p>
              </div>
              <span className="badge">Total {preview.bookingReminders.total}</span>
              <Link className="button secondary" href="/dashboard/bookings">View bookings</Link>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <div style={{ minWidth: 220 }}>
                <strong>Approval requests</strong>
                <p className="muted" style={{ margin: 0 }}>Jobs awaiting approval.</p>
              </div>
              <span className="badge">Jobs {preview.approvalRequests.jobsAwaitingApproval}</span>
              <Link className="button secondary" href="/dashboard/jobs">View jobs</Link>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <div style={{ minWidth: 220 }}>
                <strong>Review requests</strong>
                <p className="muted" style={{ margin: 0 }}>Jobs eligible for review requests.</p>
              </div>
              <span className="badge">Jobs {preview.reviewRequests.jobsEligible}</span>
              <Link className="button secondary" href="/dashboard/jobs">View jobs</Link>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <div style={{ minWidth: 220 }}>
                <strong>Billing follow-up reminders</strong>
                <p className="muted" style={{ margin: 0 }}>A completion rule can create a durable reminder for invoice and payment follow-through.</p>
              </div>
              <span className="badge">{current.jobCompletionFollowUpEnabled ? "Enabled" : "Disabled"}</span>
              <Link className="button secondary" href="/dashboard/billing/readiness">Open billing readiness</Link>
            </div>
          </div>
        ) : null}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Rule catalog</h2>
            <p className="muted" style={{ marginTop: 4 }}>Current workflow automations mapped to real booking, job, and payment lifecycle events.</p>
          </div>
          <button type="button" className="button secondary" onClick={() => void loadRules()} disabled={rulesLoading}>
            {rulesLoading ? "Refreshing..." : "Refresh rules"}
          </button>
        </div>
        {rulesError ? <p className="muted">{rulesError}</p> : null}
        {rules.length ? (
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {rules.map((rule) => (
              <div
                key={rule.key}
                style={{
                  display: "grid",
                  gap: 8,
                  gridTemplateColumns: "minmax(180px, 0.9fr) minmax(220px, 1fr) minmax(120px, auto)",
                  alignItems: "start",
                  padding: "12px 14px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div>
                  <strong>{rule.label}</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>{rule.trigger}</p>
                </div>
                <div>
                  <p style={{ margin: 0 }}>{rule.action}</p>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    Delivery: {rule.deliveryMode === "live_send" ? "Live send" : "Metadata only"}
                  </p>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <span className="badge">{rule.enabled ? "Enabled" : "Disabled"}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !rulesLoading ? <p className="muted" style={{ marginBottom: 0 }}>No automation rules are available for this workspace yet.</p> : null
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Activity</h2>
            <p className="muted" style={{ marginTop: 4 }}>Recent automation events (metadata only).</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className={"button" + (filter === "all" ? "" : " secondary")}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={"button" + (filter === "reminders" ? "" : " secondary")}
              onClick={() => setFilter("reminders")}
            >
              Reminders
            </button>
            <button
              type="button"
              className={"button" + (filter === "approval" ? "" : " secondary")}
              onClick={() => setFilter("approval")}
            >
              Approval
            </button>
            <button
              type="button"
              className={"button" + (filter === "reviews" ? "" : " secondary")}
              onClick={() => setFilter("reviews")}
            >
              Reviews
            </button>
          </div>
        </div>

        {aggregate ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <span className="badge">Reminders {aggregate.reminders}</span>
            <span className="badge">Approvals {aggregate.approval}</span>
            <span className="badge">Reviews {aggregate.reviews}</span>
            <span className="badge warn">Failed {aggregate.failed}</span>
          </div>
        ) : null}
        {!aggregate && aggregateRequestId ? (
          <p className="muted" style={{ marginTop: 8 }}>Activity summary unavailable (Support code: {aggregateRequestId}).</p>
        ) : null}

        {activityLoading ? (
          <div style={{ marginTop: 12 }}>
            <LoadingState title="Loading activity" description="Fetching recent automation events." />
          </div>
        ) : null}

        {!activityLoading && activityError ? (
          <div style={{ marginTop: 12 }}>
            <ErrorState
              title="Could not load activity"
              description={activityError}
              requestId={activityRequestId}
              primaryAction={{ label: "Try again", onClick: () => loadActivity(filter) }}
            />
          </div>
        ) : null}

        {!activityLoading && !activityError && activity.length === 0 ? (
          <div style={{ marginTop: 12 }}>
            <EmptyState
              title="No recent automation activity"
              description="Automation events will appear here when queued."
            />
          </div>
        ) : null}

        {!activityLoading && !activityError && activity.length > 0 ? (
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <div className="muted" style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              <div style={{ minWidth: 180 }}>Reason</div>
              <div style={{ minWidth: 160 }}>Entity</div>
              <div style={{ minWidth: 100 }}>Status</div>
              <div style={{ minWidth: 160 }}>Time</div>
            </div>
            {activity.map((item) => {
              const label = item.reasonKey ? (REASON_LABELS[item.reasonKey] || item.reasonKey) : "Automation";
              const link = getEntityLink(item.entityType, item.entityId);
              const timeValue = item.scheduledFor || item.createdAt || "";
              return (
                <div key={item.id} style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ minWidth: 180, fontWeight: 600 }}>{label}</div>
                  <div style={{ minWidth: 160 }}>
                    {link ? <Link href={link.href}>{link.label}</Link> : <span className="muted">—</span>}
                  </div>
                  <div style={{ minWidth: 100 }}>{item.status || "queued"}</div>
                  <div style={{ minWidth: 160 }} className="muted">{formatTime(timeValue)}</div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Automation run log</h2>
            <p className="muted" style={{ marginTop: 4 }}>Durable automation evaluations written into ActivityEvent for auditability and ops visibility.</p>
          </div>
          <button type="button" className="button secondary" onClick={() => void loadRuns()} disabled={runsLoading}>
            {runsLoading ? "Refreshing..." : "Refresh run log"}
          </button>
        </div>
        {runsError ? <p className="muted">{runsError}</p> : null}
        {runs.length ? (
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {runs.map((run) => (
              <div
                key={run.id}
                style={{
                  display: "grid",
                  gap: 8,
                  gridTemplateColumns: "minmax(220px, 1fr) minmax(160px, 0.8fr) minmax(200px, 0.9fr)",
                  alignItems: "start",
                  padding: "12px 14px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div>
                  <strong>{run.label}</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>{run.type}</p>
                </div>
                <div>
                  <p style={{ margin: 0 }}>{run.jobRef || run.jobId || "No job ref"}</p>
                  <p className="muted" style={{ margin: "4px 0 0" }}>{run.customerName || "Customer not set"}</p>
                </div>
                <div>
                  <p style={{ margin: 0 }}>{formatTime(run.at)}</p>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {run.payloadJson?.reminderCreated ? "Reminder created" : "Evaluated"}
                    {run.payloadJson?.remindAt ? ` · Follow-up ${formatTime(run.payloadJson.remindAt)}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !runsLoading ? <p className="muted" style={{ marginBottom: 0 }}>No automation runs have been recorded yet.</p> : null
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Need to check timelines?</h2>
        <p className="muted">Automation events appear in job activity, tenant activity, and the command-centre timeline.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="button secondary" href="/dashboard/command-centre-v2">Open Command Centre</Link>
          <Link className="button secondary" href="/dashboard/intelligence">Open intelligence</Link>
        </div>
      </div>
    </DashboardShell>
  );
}
