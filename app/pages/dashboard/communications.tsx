import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import SendUpdatePanel from "../../components/notifications/SendUpdatePanel";
import { OperatorPageHeader } from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import { isNotificationsV1Enabled } from "../../lib/feature-flags";
import { useOperationalRefresh } from "../../lib/operational-refresh";

type CommsEvent = {
  id: string;
  title?: string | null;
  message?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  channel?: string | null;
  status?: string | null;
  reasonKey?: string | null;
  isRead?: boolean | null;
  createdAt?: string | null;
  deliveredAt?: string | null;
  clickedAt?: string | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not recorded";
  return parsed.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function channelLabel(value?: string | null) {
  const key = String(value || "in_app").toLowerCase();
  if (key === "sms") return "SMS";
  if (key === "email") return "Email";
  if (key === "whatsapp") return "WhatsApp";
  if (key === "in_app") return "Portal message";
  return "Manual log";
}

function statusLabel(value?: string | null) {
  const key = String(value || "queued").toLowerCase();
  if (key === "sent") return "Sent";
  if (key === "failed") return "Failed";
  if (key === "queued") return "Queued";
  return key.replaceAll("_", " ");
}

function entityHref(item: CommsEvent) {
  const entityId = String(item.entityId || "").trim();
  const entityType = String(item.entityType || "").trim().toLowerCase();
  if (!entityId) return "";
  if (entityType === "job") return `/dashboard/jobs/${encodeURIComponent(entityId)}?focus=communications`;
  if (entityType === "booking") return `/dashboard/bookings/${encodeURIComponent(entityId)}?focus=communications`;
  if (entityType === "customer" || entityType === "trade_account") return `/dashboard/trade-accounts/${encodeURIComponent(entityId)}`;
  return "";
}

function entityLabel(item: CommsEvent) {
  const type = String(item.entityType || "workspace").replaceAll("_", " ");
  const id = String(item.entityId || "").trim();
  return id ? `${type} ${id}` : type;
}

export default function CommunicationsPage() {
  const enabled = isNotificationsV1Enabled();
  const [events, setEvents] = useState<CommsEvent[]>([]);
  const [emailReadiness, setEmailReadiness] = useState<any>(null);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");

  async function load() {
    if (!enabled) return;
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [comms, readiness] = await Promise.all([
        apiFetch(`/notifications/comms?scope=tenant&since=${encodeURIComponent(since)}&limit=100`),
        apiFetch("/tenant/settings/email-readiness").catch(() => null),
      ]);
      setEvents(Array.isArray(comms) ? comms : []);
      setEmailReadiness(readiness || null);
      setError("");
    } catch (err: any) {
      setError(err?.message || "Failed to load communications");
    }
  }

  useOperationalRefresh(load, { enabled });

  useEffect(() => {
    void load();
  }, [enabled]);

  useEffect(() => {
    if (!selectedId && events[0]?.id) setSelectedId(events[0].id);
  }, [events, selectedId]);

  const filtered = useMemo(() => {
    return events.filter((item) => {
      if (statusFilter && String(item.status || "").toLowerCase() !== statusFilter) return false;
      if (channelFilter && String(item.channel || "in_app").toLowerCase() !== channelFilter) return false;
      return true;
    });
  }, [channelFilter, events, statusFilter]);

  const selected = filtered.find((item) => item.id === selectedId) || filtered[0] || null;
  const unreadCount = events.filter((item) => !item.isRead).length;
  const failedCount = events.filter((item) => String(item.status || "").toLowerCase() === "failed").length;
  const emailReady = Boolean(emailReadiness?.effective?.canSend);
  const selectedHref = selected ? entityHref(selected) : "";
  const canCompose = selected?.entityId && ["job", "booking"].includes(String(selected.entityType || "").toLowerCase());

  if (!enabled) {
    return (
      <DashboardShell>
        <div className="card">
          <h1>Communications</h1>
          <p className="muted">Customer messages are not enabled for this workspace.</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack" data-testid="communications-hub">
        <OperatorPageHeader
          eyebrow="Communications"
          title="Customer message hub"
          subtitle="Review customer updates, portal messages, manual logs, and delivery status from tenant-scoped records."
          actions={[
            { label: "Message settings", href: "/dashboard/settings?tab=messages", variant: "secondary" },
            { label: "Email templates", href: "/dashboard/email-templates", variant: "secondary" },
          ]}
          stats={[
            { label: "Recent threads", value: String(events.length), hint: "Last 30 days" },
            { label: "Unread", value: String(unreadCount), hint: unreadCount ? "Needs review" : "Clear" },
            { label: "Delivery issues", value: String(failedCount), hint: failedCount ? "Open failed messages" : "None found" },
          ]}
        />

        <section className="card operator-section" data-testid="communications-provider-status">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Channel readiness</h2>
              <p className="operator-section__subtitle">Live providers only appear ready when existing readiness checks say they can send.</p>
            </div>
          </div>
          <div className="communications-readinessGrid">
            <div className="communications-readinessItem">
              <strong>Email</strong>
              <span className={emailReady ? "badge success" : "badge warn"}>{emailReady ? "Ready" : "Setup needed"}</span>
              <p className="muted">{emailReadiness?.effective?.notice || emailReadiness?.effective?.guidance || "Customer messages use the MyTitan email service when delivery is ready."}</p>
            </div>
            <div className="communications-readinessItem">
              <strong>Portal messages</strong>
              <span className="badge success">Available</span>
              <p className="muted">MyTitan-native updates stay available and tenant scoped.</p>
            </div>
            <div className="communications-readinessItem">
              <strong>WhatsApp and SMS</strong>
              <span className="badge">Setup only</span>
              <p className="muted">Live sending is not shown as ready until provider setup and routing are verified.</p>
            </div>
          </div>
        </section>

        <section className="card operator-section" data-testid="communications-thread-view">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Threads</h2>
              <p className="operator-section__subtitle">Open the linked record for replies, attachments, and the full audit trail.</p>
            </div>
            <div className="communications-filters">
              <select className="input" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} aria-label="Filter by channel">
                <option value="">All channels</option>
                <option value="in_app">Portal messages</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
              <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
                <option value="">All statuses</option>
                <option value="queued">Queued</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          {error ? <p className="muted">{error}</p> : null}
          <div className="communications-layout">
            <div className="communications-list">
              {filtered.length ? filtered.map((item) => (
                <button
                  key={item.id}
                  className={`communications-thread ${selected?.id === item.id ? "communications-thread--active" : ""}`}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  data-testid="communications-thread-row"
                >
                  <span>
                    <strong>{item.title || item.reasonKey || "Customer update"}</strong>
                    <small>{channelLabel(item.channel)} • {statusLabel(item.status)}</small>
                  </span>
                  {!item.isRead ? <span className="badge warn">Unread</span> : null}
                </button>
              )) : (
                <div className="operator-note">No communications match these filters.</div>
              )}
            </div>

            <div className="communications-detail" data-testid="communications-selected-thread">
              {selected ? (
                <>
                  <div>
                    <p className="muted" style={{ margin: 0 }}>{entityLabel(selected)}</p>
                    <h3>{selected.title || selected.reasonKey || "Customer update"}</h3>
                    <p>{selected.message || "No message body was stored for this event."}</p>
                  </div>
                  <dl>
                    <div><dt>Channel</dt><dd>{channelLabel(selected.channel)}</dd></div>
                    <div><dt>Status</dt><dd>{statusLabel(selected.status)}</dd></div>
                    <div><dt>Created</dt><dd>{formatDateTime(selected.createdAt)}</dd></div>
                    <div><dt>Delivered</dt><dd>{formatDateTime(selected.deliveredAt)}</dd></div>
                    <div><dt>Opened</dt><dd>{formatDateTime(selected.clickedAt)}</dd></div>
                  </dl>
                  <div className="communications-actions">
                    {selectedHref ? <Link className="button" href={selectedHref}>Open linked record</Link> : null}
                    {canCompose && selectedHref ? <Link className="button secondary" href={selectedHref}>Compose reply</Link> : null}
                  </div>
                  {canCompose ? (
                    <SendUpdatePanel
                      entityType={String(selected.entityType).toLowerCase() as "job" | "booking"}
                      entityId={String(selected.entityId)}
                      defaultChannel="in_app"
                      title="Manual reply"
                      description="Queue a tenant-scoped portal update from the linked record thread."
                      buttonLabel="Queue portal reply"
                      allowedChannels={["in_app"]}
                      onSent={() => void load()}
                      testId="communications-compose-panel"
                    />
                  ) : null}
                </>
              ) : (
                <div className="operator-note">Choose a message to review its thread details.</div>
              )}
            </div>
          </div>
        </section>
      </div>
      <style jsx>{`
        .communications-readinessGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .communications-readinessItem {
          border: 1px solid var(--border, #d9e2ec);
          border-radius: 8px;
          padding: 12px;
          display: grid;
          gap: 8px;
          min-width: 0;
        }
        .communications-filters {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .communications-filters .input {
          min-width: 150px;
        }
        .communications-layout {
          display: grid;
          grid-template-columns: minmax(220px, 340px) minmax(0, 1fr);
          gap: 14px;
        }
        .communications-list {
          display: grid;
          gap: 8px;
          align-content: start;
        }
        .communications-thread {
          width: 100%;
          border: 1px solid var(--border, #d9e2ec);
          background: var(--surface, #fff);
          color: inherit;
          border-radius: 8px;
          padding: 12px;
          text-align: left;
          display: flex;
          justify-content: space-between;
          gap: 10px;
          min-height: 72px;
        }
        .communications-thread--active {
          border-color: var(--brand, #2563eb);
          box-shadow: inset 3px 0 0 var(--brand, #2563eb);
        }
        .communications-thread small {
          display: block;
          margin-top: 5px;
          color: var(--muted, #64748b);
        }
        .communications-detail {
          border: 1px solid var(--border, #d9e2ec);
          border-radius: 8px;
          padding: 14px;
          min-width: 0;
          display: grid;
          gap: 14px;
        }
        .communications-detail h3 {
          margin: 4px 0 8px;
        }
        .communications-detail dl {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 8px;
          margin: 0;
        }
        .communications-detail dt {
          color: var(--muted, #64748b);
          font-size: 12px;
        }
        .communications-detail dd {
          margin: 3px 0 0;
          overflow-wrap: anywhere;
        }
        .communications-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        @media (max-width: 900px) {
          .communications-readinessGrid,
          .communications-layout,
          .communications-detail dl {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </DashboardShell>
  );
}
