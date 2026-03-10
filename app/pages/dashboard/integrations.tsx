import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorPageHeader } from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import { isMarketplaceEnabled } from "../../lib/feature-flags";

type Integration = {
  key: string;
  name: string;
  description: string;
  configureUrl: string;
  enabled: boolean;
  allowed: boolean;
};

type ConnectionStatus = {
  provider: string;
  connected: boolean;
  connectedAt?: string | null;
  allowed: boolean;
  enabled: boolean;
};

const CONNECTIONS = [
  {
    key: "xero",
    name: "Xero",
    description: "Sync invoices and payouts to your accounting ledger.",
    time: "5-10 min",
    benefits: "Automatic bookkeeping handoff for your accountant.",
    statusEndpoint: "/integrations/xero/status",
    connectEndpoint: "/integrations/xero/connect",
    disconnectEndpoint: "/integrations/xero/disconnect",
  },
  {
    key: "qbo",
    name: "QuickBooks Online",
    description: "Send invoices and payments straight into QBO.",
    time: "5-10 min",
    benefits: "Keep finance reports up to date automatically.",
    statusEndpoint: "/integrations/qbo/status",
    connectEndpoint: "/integrations/qbo/connect",
    disconnectEndpoint: "/integrations/qbo/disconnect",
  },
  {
    key: "google",
    name: "Google Calendar",
    description: "Mirror bookings to your team calendars.",
    time: "3-5 min",
    benefits: "Avoid double-bookings and keep staff aligned.",
    statusEndpoint: "/integrations/google/status",
    connectEndpoint: "/integrations/google/connect",
    disconnectEndpoint: "/integrations/google/disconnect",
  },
];

export default function IntegrationsPage() {
  const [items, setItems] = useState<Integration[]>([]);
  const [connections, setConnections] = useState<Record<string, ConnectionStatus>>({});
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const marketplaceEnabled = isMarketplaceEnabled();

  const load = async () => {
    try {
      const data = await apiFetch("/integrations");
      setItems(Array.isArray(data) ? data : []);
      const statusEntries = await Promise.all(
        CONNECTIONS.map(async (conn) => {
          try {
            const status = await apiFetch(conn.statusEndpoint);
            return [conn.key, status];
          } catch {
            return [conn.key, { provider: conn.key, connected: false, allowed: false, enabled: false }];
          }
        }),
      );
      setConnections(Object.fromEntries(statusEntries));
    } catch (err: any) {
      setError(err.message || "Failed to load integrations");
    }
  };

  useEffect(() => {
    void load();
  }, [marketplaceEnabled]);

  const toggle = async (item: Integration) => {
    if (!item.allowed) return;
    setSavingKey(item.key);
    try {
      await apiFetch("/integrations", {
        method: "PATCH",
        body: JSON.stringify({ key: item.key, enabled: !item.enabled }),
      });
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to update integration");
    } finally {
      setSavingKey(null);
    }
  };

  const connect = async (connKey: string) => {
    const conn = CONNECTIONS.find((entry) => entry.key === connKey);
    if (!conn) return;
    setSavingKey(conn.key);
    try {
      const res = await apiFetch(conn.connectEndpoint, { method: "POST" });
      if (res?.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect");
    } finally {
      setSavingKey(null);
    }
  };

  const disconnect = async (connKey: string) => {
    const conn = CONNECTIONS.find((entry) => entry.key === connKey);
    if (!conn) return;
    setSavingKey(conn.key);
    try {
      await apiFetch(conn.disconnectEndpoint, { method: "POST" });
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to disconnect");
    } finally {
      setSavingKey(null);
    }
  };

  const stats = useMemo(() => {
    const enabled = items.filter((item) => item.enabled).length;
    const connected = Object.values(connections).filter((item) => item?.connected).length;
    const blocked = items.filter((item) => !item.allowed).length;
    return [
      { label: "Available", value: String(items.length), hint: `${enabled} enabled now` },
      { label: "Connected", value: String(connected), hint: "External accounts linked" },
      { label: "Blocked", value: String(blocked), hint: blocked ? "Workspace permissions required" : "No marketplace blockers" },
    ];
  }, [connections, items]);

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Platform"
          title="Integrations"
          subtitle="Enable core product modules, then connect finance and calendar providers from the same operational page."
          actions={[
            { label: "Settings", href: "/dashboard/settings", variant: "secondary" },
            { label: "Bookings", href: "/dashboard/bookings" },
          ]}
          shortcuts={["Configure first, connect second", "Unavailable tools show workspace gating immediately"]}
          stats={stats}
        />

        {error ? <p style={{ color: "#ff8a8a", marginTop: 0 }}>{error}</p> : null}

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Product modules</h2>
              <p className="operator-section__subtitle">Activation state and configuration stay visible in one scan.</p>
            </div>
          </div>
          <div className="operator-list">
            {items.map((item) => (
              <article key={item.key} className="operator-row">
                <div className="operator-row__main">
                  <div className="operator-row__title">
                    {item.name}
                    {!item.allowed ? <span className="badge warn">Restricted</span> : item.enabled ? <span className="operator-tag">Enabled</span> : null}
                  </div>
                  <div className="operator-row__subtitle">{item.description}</div>
                </div>

                <div className="operator-row__meta">
                  <div className="operator-row__metaLine">Setup time: <strong>2-5 min</strong></div>
                  <div className="operator-row__metaLine">Access: <strong>{item.allowed ? "Allowed" : "Workspace gated"}</strong></div>
                </div>

                <div className="operator-row__actions">
                  <a className="button secondary operator-compact-button" href={item.configureUrl}>
                    Configure
                  </a>
                  <button
                    className={`toggle ${item.enabled ? "on" : ""}`}
                    type="button"
                    onClick={() => void toggle(item)}
                    disabled={!item.allowed || savingKey === item.key}
                  >
                    {item.enabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Accounting and calendars</h2>
              <p className="operator-section__subtitle">Connection state, setup time, and next action stay aligned.</p>
            </div>
          </div>
          <div className="operator-list">
            {CONNECTIONS.map((conn) => {
              const status = connections[conn.key];
              const canConnect = status?.allowed && status?.enabled;
              return (
                <article key={conn.key} className="operator-row">
                  <div className="operator-row__main">
                    <div className="operator-row__title">
                      {conn.name}
                      {status?.connected ? <span className="operator-tag">Connected</span> : <span className="badge warn">Not connected</span>}
                    </div>
                    <div className="operator-row__subtitle">{conn.description}</div>
                  </div>

                  <div className="operator-row__meta">
                    <div className="operator-row__metaLine">Setup time: <strong>{conn.time}</strong></div>
                    <div className="operator-row__metaLine">Benefit: <strong>{conn.benefits}</strong></div>
                  </div>

                  <div className="operator-row__actions">
                    {!status?.allowed ? <span className="badge warn">Restricted</span> : null}
                    {status?.connected ? (
                      <button className="button secondary operator-compact-button" type="button" onClick={() => void disconnect(conn.key)} disabled={savingKey === conn.key}>
                        Disconnect
                      </button>
                    ) : (
                      <button className="button operator-compact-button" type="button" onClick={() => void connect(conn.key)} disabled={!canConnect || savingKey === conn.key}>
                        Connect
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
