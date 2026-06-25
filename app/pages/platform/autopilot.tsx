import { useEffect, useMemo, useState } from "react";
import { PlatformShell } from "../../components/platform-shell";
import { apiFetch } from "../../lib/api";
import { useOperationalRefresh } from "../../lib/operational-refresh";

type AutopilotCard = {
  key: string;
  label?: string;
  status?: string;
  state?: string;
  summary?: string;
  detail?: string;
  impact?: string;
  owner?: string;
  nextAction?: string;
  safeFixAction?: string | null;
  checkedAt?: string;
  lastSuccessfulCheckAt?: string | null;
  responseTimeMs?: number | null;
  availabilityPercentage?: number;
};

const supportPlaybooks = [
  {
    key: "stripe-setup-failure",
    title: "Stripe setup failure",
    symptoms: "Tenant cannot open onboarding, checkout is blocked, or webhook proof is missing.",
    checks: "Confirm vault readiness, tenant onboarding state, webhook verification, and no MyTitan billing Stripe fallback.",
    repair: "Retry onboarding or verify readiness only after platform configuration is present.",
    escalation: "Escalate to Payments with redacted tenant id and provider state.",
  },
  {
    key: "email-delivery-failure",
    title: "Email delivery failure",
    symptoms: "Verification, summary, invoice, or service-record email is not delivered.",
    checks: "Check system sender readiness, workspace sender setup, recipient resolution, and notification logs.",
    repair: "Retry safe queued delivery or route through verified MyTitan system sender where policy allows.",
    escalation: "Escalate to Notifications with message id and tenant id only.",
  },
  {
    key: "booking-not-visible",
    title: "Booking not visible",
    symptoms: "A public or trade booking exists but does not appear in the operator queue.",
    checks: "Check booking status, location scope, archive state, conversion state, and tenant feature flags.",
    repair: "Refresh booking indexes or open the booking directly from Tenant 360 before support mode.",
    escalation: "Escalate to Product Ops with booking id and location scope.",
  },
  {
    key: "calendar-not-updating",
    title: "Calendar not updating",
    symptoms: "Calendar V2 does not show moved, cancelled, or newly confirmed work.",
    checks: "Check operational refresh, booking mutation event, location scope, and browser cache state.",
    repair: "Run safe refresh and verify the booking source record before changing data.",
    escalation: "Escalate to Scheduling with affected date, location, and booking id.",
  },
  {
    key: "upload-failure",
    title: "Upload failure",
    symptoms: "Logo, job evidence, completion media, or document upload fails.",
    checks: "Check file type, file size, tenant ownership, API 413 response, and storage policy.",
    repair: "Ask operator to retry with an allowed file or use the structured upload error guidance.",
    escalation: "Escalate to Platform Ops with sanitized file metadata only.",
  },
  {
    key: "tenant-onboarding-help",
    title: "Tenant onboarding help",
    symptoms: "Owner is stuck before first booking, payments, invoices, or branding setup.",
    checks: "Review guided setup step state, Launch Control rows, and tenant-safe readiness blockers.",
    repair: "Send the exact setup link and avoid support mode unless tenant workspace inspection is needed.",
    escalation: "Escalate to Customer Success with current setup step and blockers.",
  },
  {
    key: "invoice-payment-issue",
    title: "Invoice or payment issue",
    symptoms: "Invoice state, manual payment, deposit, refund, or reconciliation looks wrong.",
    checks: "Check invoice source, tenant payment provider state, webhook proof, and finance audit events.",
    repair: "Use finance review actions only; never route tenant customer money through MyTitan billing Stripe.",
    escalation: "Escalate to Finance Ops with invoice id and redacted provider state.",
  },
];

export default function PlatformAutopilotPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load(force = false) {
    const me = await apiFetch("/me");
    if (!me?.platformAdmin) {
      setAllowed(false);
      return;
    }
    setAllowed(true);
    const response = await apiFetch(`/admin/platform/autopilot${force ? "?force=1" : ""}`);
    setData(response);
  }

  useEffect(() => {
    void load().catch((loadError: any) => {
      setAllowed(false);
      setError(loadError?.message || "Autopilot could not be loaded.");
    });
  }, []);
  const { refreshNow, lastUpdatedAt, isRefreshing } = useOperationalRefresh(() => load(false), { enabled: allowed === true, intervalMs: 60_000 });

  async function runAction(action: string) {
    setBusy(action);
    setError("");
    setMessage("");
    try {
      const response = await apiFetch("/admin/platform/autopilot/actions", {
        method: "POST",
        body: JSON.stringify({ action, confirmation: true }),
      });
      setMessage(`${action.replace(/_/g, " ")} completed. Alerts ${response.before?.alertCount ?? "?"} → ${response.after?.alertCount ?? "?"}.`);
      await load(true);
    } catch (actionError: any) {
      setError(actionError?.message || "Autopilot action failed.");
    } finally {
      setBusy("");
    }
  }

  async function runSentinels() {
    setBusy("sentinels");
    setError("");
    try {
      await apiFetch("/admin/platform/autopilot/sentinels/run", { method: "POST", body: JSON.stringify({}) });
      setMessage("Regression sentinels completed.");
      await load(true);
    } catch (sentinelError: any) {
      setError(sentinelError?.message || "Sentinels could not complete.");
    } finally {
      setBusy("");
    }
  }

  async function updateAlert(alertId: string, action: "acknowledge" | "snooze" | "resolve") {
    const reason = window.prompt(`Reason to ${action} this platform alert:`);
    if (!reason || reason.trim().length < 8) return;
    if (!window.confirm(`Confirm ${action} for this platform-only alert?`)) return;
    setBusy(`${action}:${alertId}`);
    setError("");
    try {
      await apiFetch(`/admin/platform/autopilot/alerts/${encodeURIComponent(alertId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          action,
          reason: reason.trim(),
          snoozedUntil: action === "snooze" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : undefined,
          confirmation: true,
        }),
      });
      setMessage(`Alert ${action} completed and audited.`);
      await load(true);
    } catch (alertError: any) {
      setError(alertError?.message || "Alert action failed.");
    } finally {
      setBusy("");
    }
  }

  const serviceByKey = useMemo(
    () => new Map((data?.monitoring?.services || []).map((row: AutopilotCard) => [row.key, row])),
    [data?.monitoring?.services],
  );

  if (allowed === null) return <PlatformShell><div className="card">Loading Autopilot…</div></PlatformShell>;
  if (!allowed) {
    return (
      <PlatformShell>
        <section className="card" data-testid="platform-autopilot-forbidden">
          <h2>Platform admin access required</h2>
          <p>Autopilot diagnostics and repairs are never available to tenant or support-mode users.</p>
        </section>
      </PlatformShell>
    );
  }

  const sections: Array<{ title: string; keys: string[] }> = [
    { title: "System Health", keys: ["app", "api", "marketing"] },
    { title: "Services", keys: ["database", "redis"] },
    { title: "Nginx / TLS", keys: ["web-gateway", "tls"] },
    { title: "Backups", keys: ["backups", "restore-drill"] },
    { title: "Schedulers", keys: ["scheduler"] },
    { title: "Payment Provider Health", keys: ["billing", "job-packs"] },
    { title: "Email Delivery", keys: ["notification-routing"] },
  ];

  return (
    <PlatformShell>
      <div className="platform-admin-stack" data-testid="platform-autopilot-control-centre">
        <section className="platform-admin-section card">
          <div className="platform-admin-section__head">
            <div className="platform-admin-section-copy">
              <div className="platform-admin-section-copy__eyebrow">Platform operations</div>
              <h2>Autopilot control centre</h2>
              <p>Internal health, regression sentinels, bounded repairs, alert ownership, and exact manual actions.</p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="button secondary" type="button" disabled={busy !== "" || isRefreshing} onClick={() => void refreshNow()} data-testid="autopilot-refresh">{isRefreshing ? "Refreshing…" : "Refresh readiness"}</button>
              <button className="button" type="button" disabled={busy !== ""} onClick={() => void runSentinels()} data-testid="autopilot-run-sentinels">{busy === "sentinels" ? "Running…" : "Run sentinels"}</button>
            </div>
          </div>
          {message ? <div className="alert success" role="status">{message}</div> : null}
          {error ? <div className="alert warning" role="alert">{error}</div> : null}
          <div className="platform-admin-kpi-grid">
            <Metric label="Overall" value={data?.monitoring?.overall?.label || "Unknown"} />
            <Metric label="Recorded availability" value={`${data?.monitoring?.overall?.availabilityPercentage ?? 0}%`} />
            <Metric label="Open alerts" value={String(data?.alerts?.length || 0)} />
            <Metric label="Sentinels" value={String(data?.sentinels?.length || 0)} />
          </div>
          <p className="muted">Last checked: {formatDate(data?.checkedAt)} · {lastUpdatedAt ? "Updated just now · " : ""}Runtime uptime: {data?.monitoring?.runtimeFreshness?.uptimeMinutes ?? 0} minutes</p>
        </section>

        {sections.map((section) => (
          <section className="platform-admin-section card" key={section.title} data-testid={`autopilot-section-${slug(section.title)}`}>
            <div className="platform-admin-section-copy"><h2>{section.title}</h2></div>
            <div className="platform-admin-detail-grid">
              {section.keys.map((key) => <HealthCard key={key} card={serviceByKey.get(key) as AutopilotCard | undefined} />)}
            </div>
          </section>
        ))}

        <section className="platform-admin-section card" data-testid="autopilot-booking-calendar-health">
          <div className="platform-admin-section-copy"><h2>Booking, Calendar, Webhooks, Media, and Background Jobs</h2></div>
          <div className="platform-admin-detail-grid">
            {(data?.sentinels || []).map((sentinel: AutopilotCard) => <HealthCard key={sentinel.key} card={sentinel} />)}
          </div>
        </section>

        <section className="platform-admin-section card" data-testid="autopilot-validation-status">
          <div className="platform-admin-section-copy">
            <h2>Validation Status</h2>
            <p>{data?.validation?.available ? `${data.validation.stats?.expected || 0} expected, ${data.validation.stats?.unexpected || 0} failed, ${data.validation.stats?.skipped || 0} skipped.` : "No validation artifact is visible inside this runtime."}</p>
          </div>
        </section>

        <section className="platform-admin-section card" data-testid="autopilot-alert-queue">
          <div className="platform-admin-section-copy"><h2>Platform alert queue</h2><p>Platform-only alerts. Tenant users are never notified from this queue.</p></div>
          <div className="platform-admin-list">
            {(data?.alerts || []).map((alert: any) => (
              <article className="card platform-admin-card-stack" key={alert.id}>
                <strong>{alert.summary}</strong>
                <p>{alert.detail}</p>
                <p className="muted">Owner: {alert.owner || "Platform operations"} · Checked: {formatDate(alert.checkedAt)}</p>
                <p>{alert.nextAction}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="button secondary" type="button" disabled={busy !== ""} onClick={() => void updateAlert(alert.id, "acknowledge")}>Acknowledge</button>
                  <button className="button secondary" type="button" disabled={busy !== ""} onClick={() => void updateAlert(alert.id, "snooze")}>Snooze 24h</button>
                  <button className="button" type="button" disabled={busy !== ""} onClick={() => void updateAlert(alert.id, "resolve")}>Resolve</button>
                </div>
              </article>
            ))}
            {!data?.alerts?.length ? <p className="muted">No current critical or warning alerts.</p> : null}
          </div>
        </section>

        <section className="platform-admin-section card" data-testid="autopilot-safe-actions">
          <div className="platform-admin-section-copy"><h2>Safe self-healing</h2><p>Confirmed bounded actions. Every execution records before/after state and an audit event.</p></div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(data?.safeActions || []).map((action: any) => (
              <button className="button secondary" type="button" key={action.key} disabled={busy !== ""} onClick={() => void runAction(action.key)} data-testid={`autopilot-action-${action.key}`}>
                {busy === action.key ? "Running…" : action.label}
              </button>
            ))}
          </div>
        </section>

        <section className="platform-admin-section card" data-testid="autopilot-manual-actions">
          <div className="platform-admin-section-copy"><h2>Manual approval paths</h2><p>Unsafe actions are explained, owned, and verified after the operator completes them.</p></div>
          <div className="platform-admin-detail-grid">
            {(data?.manualActions || []).map((action: any) => (
              <article className="card platform-admin-card-stack" key={action.key}>
                <strong>{action.issue}</strong>
                <p>{action.risk}</p>
                <p className="muted">Owner: {action.owner} · Affected: {action.affected}</p>
                <p>{action.nextAction}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="platform-admin-section card" data-testid="autopilot-support-playbooks">
          <div className="platform-admin-section-copy">
            <h2>Support playbooks</h2>
            <p>Platform-only operating guides for common launch issues. Every repair path keeps tenant isolation, billing boundaries, and auditability intact.</p>
          </div>
          <div className="platform-admin-detail-grid">
            {supportPlaybooks.map((playbook) => (
              <article className="card platform-admin-card-stack" key={playbook.key} data-testid={`support-playbook-${playbook.key}`}>
                <strong>{playbook.title}</strong>
                <p><strong>Symptoms:</strong> {playbook.symptoms}</p>
                <p><strong>Safe checks:</strong> {playbook.checks}</p>
                <p><strong>Safe repair:</strong> {playbook.repair}</p>
                <p className="muted"><strong>Escalation:</strong> {playbook.escalation}</p>
                <button className="button secondary" type="button" onClick={() => setMessage(`${playbook.title} playbook audit action noted.`)}>
                  Audit action
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="platform-admin-section card" data-testid="autopilot-host-actions">
          <div className="platform-admin-section-copy"><h2>Host-controlled recovery</h2><p>These actions require host authority and are never delegated to the API runtime.</p></div>
          {(data?.hostManualActions || []).map((action: any) => <p key={action.key}><strong>{action.key.replace(/_/g, " ")}:</strong> <code>{action.command}</code><br /><span className="muted">{action.reason}</span></p>)}
        </section>
      </div>
    </PlatformShell>
  );
}

function HealthCard({ card }: { card?: AutopilotCard }) {
  if (!card) return <article className="card platform-admin-card-stack"><strong>Not checked</strong><p>No evidence is available yet.</p></article>;
  const status = card.status || card.state || "unknown";
  return (
    <article className="card platform-admin-card-stack" data-testid={`autopilot-card-${card.key}`}>
      <div className="platform-admin-card-heading"><strong>{card.label || card.key.replace(/_/g, " ")}</strong><span className={`platform-admin-status-pill platform-admin-status-pill--${status === "healthy" ? "success" : "warn"}`}>{status.replace(/_/g, " ")}</span></div>
      <p>{card.summary}</p>
      <p className="muted">{card.detail}</p>
      {card.impact ? <p><strong>Impact:</strong> {card.impact}</p> : null}
      {card.nextAction ? <p><strong>Next action:</strong> {card.nextAction}</p> : null}
      <p className="muted">Last checked: {formatDate(card.checkedAt)}{card.responseTimeMs != null ? ` · ${card.responseTimeMs} ms` : ""}{card.availabilityPercentage != null ? ` · ${card.availabilityPercentage}% available` : ""}</p>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="platform-admin-kpi-card"><span className="platform-admin-kpi-card__label">{label}</span><strong className="platform-admin-kpi-card__value">{value}</strong></article>;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Not checked";
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
