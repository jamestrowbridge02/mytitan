import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import SendUpdatePanel from "../../components/notifications/SendUpdatePanel";
import {
  OperatorActiveFilters,
  OperatorEmptyStateCard,
  OperatorFilterBar,
  OperatorFilterField,
  OperatorPageHeader,
  OperatorRowActions,
  OperatorSavedViews,
  OperatorStatusBadge,
} from "../../components/ui/operator-page";
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
  eventClass?: string | null;
  to?: string | null;
  context?: Record<string, any> | null;
  isRead?: boolean | null;
  createdAt?: string | null;
  deliveredAt?: string | null;
  clickedAt?: string | null;
};

type ThreadView = "all" | "unread" | "attention" | "issues";

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
  if (key === "manual") return "Manual log";
  return "Portal message";
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

function linkedRecordLabel(item: CommsEvent) {
  const type = String(item.entityType || "").trim().toLowerCase();
  if (type === "job") return "Job";
  if (type === "booking") return "Booking";
  if (type === "customer" || type === "trade_account") return "Customer";
  return "Business record";
}

function previewText(item: CommsEvent) {
  return String(item.message || item.context?.note || item.reasonKey || "No message body recorded.").replace(/\s+/g, " ").trim();
}

function needsAttention(item: CommsEvent) {
  const status = String(item.status || "").toLowerCase();
  return status === "failed" || status === "queued" || !item.isRead;
}

export default function CommunicationsPage() {
  const enabled = isNotificationsV1Enabled();
  const [events, setEvents] = useState<CommsEvent[]>([]);
  const [emailReadiness, setEmailReadiness] = useState<any>(null);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ThreadView>("all");
  const [composerOpen, setComposerOpen] = useState(false);

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
      setError(err?.message || "Failed to load conversations");
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
    const q = query.trim().toLowerCase();
    return events.filter((item) => {
      const status = String(item.status || "").toLowerCase();
      const channel = String(item.channel || "in_app").toLowerCase();
      if (statusFilter && status !== statusFilter) return false;
      if (channelFilter && channel !== channelFilter) return false;
      if (view === "unread" && item.isRead) return false;
      if (view === "attention" && !needsAttention(item)) return false;
      if (view === "issues" && status !== "failed") return false;
      if (q && ![item.title, item.message, item.reasonKey, item.to, linkedRecordLabel(item)].some((value) => String(value || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [channelFilter, events, query, statusFilter, view]);

  const selected = filtered.find((item) => item.id === selectedId) || filtered[0] || null;
  const unreadCount = events.filter((item) => !item.isRead).length;
  const failedCount = events.filter((item) => String(item.status || "").toLowerCase() === "failed").length;
  const attentionCount = events.filter(needsAttention).length;
  const emailReady = Boolean(emailReadiness?.effective?.canSend);
  const selectedHref = selected ? entityHref(selected) : "";
  const canCompose = selected?.entityId && ["job", "booking"].includes(String(selected.entityType || "").toLowerCase());
  const filtersActive = Boolean(query || statusFilter || channelFilter || view !== "all");

  function resetFilters() {
    setQuery("");
    setStatusFilter("");
    setChannelFilter("");
    setView("all");
  }

  if (!enabled) {
    return (
      <DashboardShell>
        <OperatorEmptyStateCard
          title="Communications"
          description="Customer messages are not enabled for this account."
          eyebrow={null}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack" data-testid="communications-hub">
        <OperatorPageHeader
          title="Communications"
          actions={[
            { label: "Message customer", onClick: () => setComposerOpen(true), testId: "communications-message-customer" },
            { label: "Settings", href: "/dashboard/settings?tab=messages", variant: "secondary" },
            { label: "Templates", href: "/dashboard/email-templates", variant: "secondary" },
          ]}
          stats={[
            { label: "Conversations", value: String(events.length) },
            { label: "Unread", value: String(unreadCount) },
            { label: "Needs attention", value: String(attentionCount) },
            { label: "Delivery issues", value: String(failedCount) },
          ]}
        />

        <section className="card operator-section" data-testid="communications-thread-view">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Threads</h2>
            </div>
          </div>

          <OperatorSavedViews
            label="Conversation views"
            activeView={view}
            onChange={(next) => setView(next as ThreadView)}
            views={[
              { id: "all", label: "All", count: events.length },
              { id: "unread", label: "Unread", count: unreadCount },
              { id: "attention", label: "Needs attention", count: attentionCount },
              { id: "issues", label: "Delivery issues", count: failedCount },
            ]}
          />

          <OperatorFilterBar
            searchValue={query}
            onSearchChange={setQuery}
            searchPlaceholder="Search conversations..."
            actions={filtersActive ? [{ label: "Reset", onClick: resetFilters, variant: "secondary" }] : []}
            resultsLabel={`${filtered.length} shown`}
          >
            <OperatorFilterField label="Channel">
              <select className="input" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} aria-label="Channel">
                <option value="">All channels</option>
                <option value="in_app">Portal messages</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="manual">Manual log</option>
              </select>
            </OperatorFilterField>
            <OperatorFilterField label="Status">
              <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Status">
                <option value="">All statuses</option>
                <option value="queued">Queued</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
              </select>
            </OperatorFilterField>
          </OperatorFilterBar>
          <OperatorActiveFilters
            chips={[
              channelFilter ? { id: "channel", label: channelLabel(channelFilter), onClear: () => setChannelFilter("") } : null,
              statusFilter ? { id: "status", label: statusLabel(statusFilter), onClear: () => setStatusFilter("") } : null,
              query ? { id: "query", label: query, onClear: () => setQuery("") } : null,
            ].filter(Boolean) as any}
          />

          {error ? (
            <div className="operator-note">
              <strong>Conversations unavailable</strong>
              <p>We couldn't load conversations.</p>
              <button className="button secondary" type="button" onClick={() => void load()}>Retry</button>
            </div>
          ) : null}

          <div className="communications-layout">
            <div className="communications-list" aria-label="Conversation list">
              {filtered.length ? filtered.map((item) => {
                const href = entityHref(item);
                const failed = String(item.status || "").toLowerCase() === "failed";
                return (
                  <article
                    key={item.id}
                    className={`communications-thread ${selected?.id === item.id ? "communications-thread--active" : ""}`}
                    data-testid="communications-thread-row"
                  >
                    <button type="button" onClick={() => setSelectedId(item.id)} className="communications-thread__main">
                      <span className="communications-thread__title">{item.title || item.reasonKey || "Customer update"}</span>
                      <span className="communications-thread__preview">{previewText(item)}</span>
                      <span className="communications-thread__meta">
                        {channelLabel(item.channel)} · {linkedRecordLabel(item)} · {formatDateTime(item.createdAt)}
                      </span>
                    </button>
                    <div className="communications-thread__aside">
                      {!item.isRead ? <span className="badge warn">Unread</span> : null}
                      <OperatorStatusBadge label={statusLabel(item.status)} compact tone={failed ? "critical" : undefined} />
                      <OperatorRowActions
                        primaryAction={failed ? { label: "Review delivery", onClick: () => setSelectedId(item.id) } : { label: "Open conversation", onClick: () => setSelectedId(item.id) }}
                        actions={[
                          ...(href ? [{ label: "Open linked record", href, group: "Record" }] : []),
                          ...(canCompose && selected?.id === item.id ? [{ label: "Reply", onClick: () => setComposerOpen(true), group: "Conversation" }] : []),
                        ]}
                      />
                    </div>
                  </article>
                );
              }) : (
                <OperatorEmptyStateCard
                  title={filtersActive ? "No conversations match these filters." : "No conversations yet"}
                  description={filtersActive ? "Clear filters to see more conversations." : "Start by messaging a customer from a linked job or booking."}
                  eyebrow={null}
                  actions={filtersActive ? [{ label: "Clear filters", onClick: resetFilters }] : [{ label: "Message customer", onClick: () => setComposerOpen(true) }]}
                />
              )}
            </div>

            <aside className="communications-detail" data-testid="communications-selected-thread" aria-label="Conversation detail">
              {selected ? (
                <>
                  <div className="communications-detail__header">
                    <div>
                      <p className="muted" style={{ margin: 0 }}>{linkedRecordLabel(selected)}</p>
                      <h3>{selected.title || selected.reasonKey || "Customer update"}</h3>
                    </div>
                    <OperatorStatusBadge label={statusLabel(selected.status)} tone={String(selected.status || "").toLowerCase() === "failed" ? "critical" : undefined} />
                  </div>
                  <div className="communications-message">
                    <div className="communications-message__meta">
                      <span>{channelLabel(selected.channel)}</span>
                      <span>{formatDateTime(selected.createdAt)}</span>
                    </div>
                    <p>{previewText(selected)}</p>
                  </div>
                  <dl className="communications-timeline">
                    <div><dt>Recipient</dt><dd>{selected.to || "Customer"}</dd></div>
                    <div><dt>Sent</dt><dd>{formatDateTime(selected.deliveredAt || selected.createdAt)}</dd></div>
                    <div><dt>Opened</dt><dd>{formatDateTime(selected.clickedAt)}</dd></div>
                    <div><dt>Linked record</dt><dd>{linkedRecordLabel(selected)}</dd></div>
                  </dl>
                  <div className="communications-actions">
                    {selectedHref ? <Link className="button secondary" href={selectedHref}>Open linked record</Link> : null}
                    {canCompose ? <button className="button" type="button" onClick={() => setComposerOpen(true)}>Reply</button> : null}
                  </div>
                  {canCompose ? (
                    <SendUpdatePanel
                      entityType={String(selected.entityType).toLowerCase() as "job" | "booking"}
                      entityId={String(selected.entityId)}
                      defaultChannel="in_app"
                      title="Reply"
                      description="Send a portal message on this conversation."
                      buttonLabel="Send reply"
                      allowedChannels={["in_app"]}
                      onSent={() => void load()}
                      testId="communications-compose-panel"
                    />
                  ) : null}
                </>
              ) : (
                <div className="operator-note">Choose a conversation to review the timeline.</div>
              )}
            </aside>
          </div>
        </section>

        <section className="card operator-section" data-testid="communications-provider-status">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Channels</h2>
            </div>
            <Link className="button secondary" href="/dashboard/settings?tab=messages">Manage channels</Link>
          </div>
          <div className="communications-readinessGrid">
            <div><strong>Email</strong><OperatorStatusBadge label={emailReady ? "Ready" : "Setup required"} tone={emailReady ? "success" : "warning"} compact /></div>
            <div><strong>Portal messages</strong><OperatorStatusBadge label="Available" tone="success" compact /></div>
            <div><strong>SMS</strong><OperatorStatusBadge label="Setup required" tone="warning" compact /></div>
            <div><strong>WhatsApp</strong><OperatorStatusBadge label="Setup required" tone="warning" compact /></div>
          </div>
        </section>

        {composerOpen ? (
          <div className="communications-modal" role="dialog" aria-modal="true" aria-labelledby="communications-compose-title">
            <div className="communications-modal__panel">
              <div className="operator-section__header">
                <div>
                  <h2 id="communications-compose-title" className="operator-section__title">Message customer</h2>
                </div>
                <button className="button secondary" type="button" onClick={() => setComposerOpen(false)}>Close</button>
              </div>
              {selected && canCompose ? (
                <SendUpdatePanel
                  entityType={String(selected.entityType).toLowerCase() as "job" | "booking"}
                  entityId={String(selected.entityId)}
                  defaultChannel="in_app"
                  title="New message"
                  description="Choose a ready channel and send a customer update."
                  buttonLabel="Send message"
                  allowedChannels={["in_app", "email"]}
                  onSent={() => {
                    setComposerOpen(false);
                    void load();
                  }}
                  testId="communications-message-customer-panel"
                />
              ) : (
                <OperatorEmptyStateCard
                  title="Select a linked job or booking"
                  description="Customer messages are sent from linked records so recipient and permission checks stay enforced."
                  eyebrow={null}
                  actions={[{ label: "Open jobs", href: "/dashboard/jobs" }]}
                />
              )}
            </div>
          </div>
        ) : null}
      </div>
      <style jsx>{`
        .communications-layout {
          display: grid;
          grid-template-columns: minmax(280px, 420px) minmax(0, 1fr);
          gap: 14px;
        }
        .communications-list,
        .communications-detail,
        .communications-readinessGrid {
          display: grid;
          gap: 10px;
          align-content: start;
          min-width: 0;
        }
        .communications-thread {
          border: 1px solid var(--border, #d9e2ec);
          border-radius: 8px;
          padding: 10px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          background: var(--surface, #fff);
        }
        .communications-thread--active {
          border-color: var(--brand, #2563eb);
          box-shadow: inset 3px 0 0 var(--brand, #2563eb);
        }
        .communications-thread__main {
          border: 0;
          background: transparent;
          color: inherit;
          display: grid;
          gap: 4px;
          text-align: left;
          min-width: 0;
          padding: 0;
        }
        .communications-thread__title {
          font-weight: 700;
        }
        .communications-thread__preview,
        .communications-thread__meta {
          color: var(--muted, #64748b);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .communications-thread__aside,
        .communications-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .communications-detail {
          border: 1px solid var(--border, #d9e2ec);
          border-radius: 8px;
          padding: 14px;
        }
        .communications-detail__header,
        .communications-message__meta {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .communications-detail h3 {
          margin: 4px 0 0;
        }
        .communications-message {
          border-left: 3px solid var(--brand, #2563eb);
          padding-left: 12px;
        }
        .communications-message p {
          overflow-wrap: anywhere;
        }
        .communications-timeline {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          margin: 0;
        }
        .communications-timeline dt {
          color: var(--muted, #64748b);
          font-size: 12px;
        }
        .communications-timeline dd {
          margin: 3px 0 0;
          overflow-wrap: anywhere;
        }
        .communications-readinessGrid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .communications-readinessGrid > div {
          border: 1px solid var(--border, #d9e2ec);
          border-radius: 8px;
          padding: 12px;
          display: flex;
          justify-content: space-between;
          gap: 8px;
          align-items: center;
        }
        .communications-modal {
          position: fixed;
          inset: 0;
          z-index: 60;
          background: rgba(15, 23, 42, 0.42);
          display: grid;
          place-items: center;
          padding: 20px;
        }
        .communications-modal__panel {
          background: var(--surface, #fff);
          color: inherit;
          border-radius: 8px;
          width: min(720px, 100%);
          max-height: min(720px, calc(100vh - 40px));
          overflow: auto;
          padding: 16px;
        }
        @media (max-width: 980px) {
          .communications-layout,
          .communications-timeline,
          .communications-readinessGrid {
            grid-template-columns: 1fr;
          }
          .communications-thread {
            grid-template-columns: 1fr;
          }
          .communications-thread__aside {
            justify-content: flex-start;
          }
        }
      `}</style>
    </DashboardShell>
  );
}
