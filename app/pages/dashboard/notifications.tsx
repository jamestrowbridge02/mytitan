import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorActionTile } from "../../components/ui/operator-insights";
import { OperatorPageHeader } from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import { isNotificationsV1Enabled } from "../../lib/feature-flags";
import { useOperationalRefresh } from "../../lib/operational-refresh";

type NotificationItem = {
  id: string;
  title: string;
  message?: string | null;
  category?: string | null;
  priority?: "info" | "success" | "attention" | "urgent" | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
  isRead?: boolean;
  createdAt?: string | null;
};

function formatNotificationTime(value?: string | null) {
  if (!value) return "Just now";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Just now";
  return parsed.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function NotificationsPage() {
  const router = useRouter();
  const enabled = isNotificationsV1Enabled();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [prefs, setPrefs] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!enabled) return;
    try {
      const [n, p] = await Promise.all([apiFetch("/notifications"), apiFetch("/notifications/preferences")]);
      setItems(Array.isArray(n) ? n : []);
      setPrefs(p || null);
      setError("");
    } catch (err: any) {
      setError(err?.message || "Failed to load notifications");
    }
  }
  useOperationalRefresh(load, { enabled });

  useEffect(() => {
    void load();
  }, [enabled]);

  async function savePref(key: string, value: boolean) {
    try {
      const updated = await apiFetch("/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify({ [key]: value }),
      });
      setPrefs(updated);
      setStatus("Preferences saved");
      window.setTimeout(() => setStatus(""), 1500);
    } catch (err: any) {
      setError(err?.message || "Failed to update preferences");
    }
  }

  async function markRead(id: string, read = true) {
    setBusy(true);
    try {
      const updated = await apiFetch(`/notifications/${encodeURIComponent(id)}/read`, {
        method: "PATCH",
        body: JSON.stringify({ read }),
      });
      setItems((current) => current.map((item) => (item.id === id ? { ...item, ...(updated || {}), isRead: read } : item)));
    } catch (err: any) {
      setError(err?.message || "Failed to update notification");
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/notifications/${encodeURIComponent(id)}/dismiss`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (err: any) {
      setError(err?.message || "Failed to dismiss notification");
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    setBusy(true);
    try {
      await apiFetch("/notifications/read-all", {
        method: "PATCH",
        body: JSON.stringify({ read: true }),
      });
      setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    } catch (err: any) {
      setError(err?.message || "Failed to mark all notifications as read");
    } finally {
      setBusy(false);
    }
  }

  const unreadItems = useMemo(() => items.filter((item) => !item.isRead), [items]);
  const readItems = useMemo(() => items.filter((item) => item.isRead), [items]);
  const focusedUnread = router.query.filter === "unread";
  const groupedAttention = useMemo(() => {
    const groups = new Map<string, NotificationItem[]>();
    for (const item of unreadItems) {
      const key = item.category || "Operational";
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    return Array.from(groups.entries());
  }, [unreadItems]);
  const preferenceSummary = useMemo(
    () =>
      [
        { label: "Job complete", value: Boolean(prefs?.jobComplete) },
        { label: "Payment received", value: Boolean(prefs?.paymentReceived) },
        { label: "Email delivery", value: Boolean(prefs?.emailEnabled) },
      ],
    [prefs?.emailEnabled, prefs?.jobComplete, prefs?.paymentReceived],
  );

  if (!enabled) {
    return (
      <DashboardShell>
        <div className="card">
          <h1>Notifications</h1>
          <p className="muted">Feature is disabled.</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Notifications"
          title="Internal inbox"
          subtitle="Keep operational updates grouped, actionable, and easy to clear without relying on external delivery."
          actions={[
            { label: "Mark all read", onClick: () => void markAllRead(), disabled: busy || unreadItems.length === 0 },
            { label: "Open live work", href: "/dashboard/command-centre-v2", variant: "secondary" },
            { label: "Open billing readiness", href: "/dashboard/billing/readiness", variant: "secondary" },
          ]}
          shortcuts={["Clear unread work first", "Open the linked workflow directly from each notification"]}
          stats={[
            { label: "Unread", value: String(unreadItems.length), hint: unreadItems.length ? "Needs review now" : "Inbox is clear" },
            { label: "Read", value: String(readItems.length), hint: "Recent operational history" },
            { label: "Email delivery", value: prefs?.emailEnabled ? "On" : "Off", hint: "Internal notifications remain available either way" },
          ]}
        />

        <section className="operator-quickRail">
          <OperatorActionTile
            title={unreadItems.length ? `${unreadItems.length} unread update${unreadItems.length === 1 ? "" : "s"}` : "Inbox is calm"}
            description={unreadItems.length ? "Handle one operational recommendation at a time, then jump back into the linked workflow." : "No unread operational issues are waiting."}
            icon="mail"
            tone={unreadItems.length ? "warning" : "success"}
            action={
              <button className="button" type="button" onClick={() => void markAllRead()} disabled={busy || unreadItems.length === 0}>
                Mark all read
              </button>
            }
          />
          <OperatorActionTile
            title="Preferences stay lightweight"
            description="Control only the high-signal events here so the inbox remains useful instead of noisy."
            icon="settings"
            tone="info"
            action={<Link className="button secondary" href="/dashboard/help?category=feature_request">Request change</Link>}
          />
        </section>

        {focusedUnread || groupedAttention.length ? (
          <section className="card operator-section" data-testid="notifications-attention-groups">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Operational attention</h2>
                <p className="operator-section__subtitle">Unread work grouped by real category so the next action is easier to choose.</p>
              </div>
            </div>
            <div className="operator-attentionGroups">
              {groupedAttention.length ? groupedAttention.map(([category, rows]) => (
                <Link key={category} className="operator-attentionGroup" href={rows[0]?.actionUrl || "/dashboard/notifications?filter=unread"}>
                  <strong>{category}</strong>
                  <span>{rows.length} unread</span>
                  <small>{rows[0]?.title || "Open next linked action"}</small>
                </Link>
              )) : (
                <div className="operator-note">No unread notification groups are waiting.</div>
              )}
            </div>
          </section>
        ) : null}

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Preferences</h2>
              <p className="operator-section__subtitle">High-signal updates only. Internal routing remains available even when email delivery is off.</p>
            </div>
          </div>
          <div className="operator-notificationsPrefs">
            <label className="operator-notificationsPrefs__item">
              <input checked={Boolean(prefs?.jobComplete)} onChange={(event) => void savePref("jobComplete", event.target.checked)} type="checkbox" />
              <span>Job complete notifications</span>
            </label>
            <label className="operator-notificationsPrefs__item">
              <input checked={Boolean(prefs?.paymentReceived)} onChange={(event) => void savePref("paymentReceived", event.target.checked)} type="checkbox" />
              <span>Payment received notifications</span>
            </label>
            <label className="operator-notificationsPrefs__item">
              <input checked={Boolean(prefs?.emailEnabled)} onChange={(event) => void savePref("emailEnabled", event.target.checked)} type="checkbox" />
              <span>Email delivery when configured</span>
            </label>
          </div>
          <div className="operator-notificationsChips">
            {preferenceSummary.map((item) => (
              <span key={item.label} className={`operator-notificationsChip${item.value ? " is-active" : ""}`}>
                {item.label}: {item.value ? "On" : "Off"}
              </span>
            ))}
          </div>
          {status ? <p className="operator-note">{status}</p> : null}
          {error ? <p role="alert" style={{ color: "#c2410c", marginBottom: 0 }}>{error}</p> : null}
        </section>

        <section className="card operator-section" data-testid="notifications-unread-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Unread first</h2>
              <p className="operator-section__subtitle">One recommendation at a time, with a direct route back into the workflow.</p>
            </div>
          </div>
          <div className="operator-notificationList">
            {unreadItems.length ? (
              unreadItems.map((item) => (
                <article key={item.id} className={`operator-notificationCard operator-notificationCard--${item.priority || "info"}`} data-testid={`notification-item-${item.id}`}>
                  <div className="operator-notificationCard__top">
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.message || "No further detail provided."}</p>
                    </div>
                    <span className="operator-notificationCard__time">{formatNotificationTime(item.createdAt)}</span>
                  </div>
                  <div className="operator-notificationCard__meta">
                    <span>{item.priority || "info"}</span>
                    {item.category ? <span>{item.category}</span> : null}
                  </div>
                  <div className="operator-notificationCard__actions">
                    {item.actionUrl ? <Link className="button" href={item.actionUrl}>{item.actionLabel || "Open"}</Link> : null}
                    <button className="button secondary" type="button" onClick={() => void markRead(item.id, true)} disabled={busy}>
                      Mark read
                    </button>
                    <button className="button secondary" type="button" onClick={() => void dismiss(item.id)} disabled={busy}>
                      Dismiss
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="operator-notificationEmpty" data-testid="notifications-empty-state">
                <strong>Everything is clear</strong>
                <p>No unread operational updates are waiting right now.</p>
              </div>
            )}
          </div>
        </section>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Recently cleared</h2>
              <p className="operator-section__subtitle">Read items stay available as short-term context without competing with the unread queue.</p>
            </div>
          </div>
          <div className="operator-notificationList operator-notificationList--compact">
            {readItems.length ? (
              readItems.map((item) => (
                <article key={item.id} className="operator-notificationCard operator-notificationCard--read">
                  <div className="operator-notificationCard__top">
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.message || "No further detail provided."}</p>
                    </div>
                    <span className="operator-notificationCard__time">{formatNotificationTime(item.createdAt)}</span>
                  </div>
                  <div className="operator-notificationCard__actions">
                    {item.actionUrl ? <Link className="button secondary" href={item.actionUrl}>{item.actionLabel || "Open"}</Link> : null}
                    <button className="button secondary" type="button" onClick={() => void dismiss(item.id)} disabled={busy}>
                      Dismiss
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="operator-note">Read notifications will appear here after the inbox has been worked through.</div>
            )}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
