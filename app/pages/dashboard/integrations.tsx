import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import {
  OperatorActiveFilters,
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorFilterBar,
  OperatorPageHeader,
  OperatorRowActions,
  OperatorSavedViews,
} from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import { isMarketplaceEnabled } from "../../lib/feature-flags";
import { useStickyOperatorView } from "../../lib/operator-view-state";

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

type IntegrationScope = "all" | "enabled" | "restricted";
type ConnectionScope = "all" | "connected" | "ready" | "blocked";

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
  const [moduleSearch, setModuleSearch] = useState("");
  const [moduleScope, setModuleScope] = useStickyOperatorView<IntegrationScope>("mytitan_integrations_module_view_v1", "all");
  const [connectionSearch, setConnectionSearch] = useState("");
  const [connectionScope, setConnectionScope] = useStickyOperatorView<ConnectionScope>("mytitan_integrations_connection_view_v1", "all");
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
      setError("");
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

  const filteredItems = useMemo(() => {
    const normalizedSearch = moduleSearch.trim().toLowerCase();
    return items.filter((item) => {
      const searchable = `${item.name} ${item.description} ${item.key}`.toLowerCase();
      if (normalizedSearch && !searchable.includes(normalizedSearch)) return false;
      if (moduleScope === "enabled" && !item.enabled) return false;
      if (moduleScope === "restricted" && item.allowed) return false;
      return true;
    });
  }, [items, moduleScope, moduleSearch]);

  const filteredConnections = useMemo(() => {
    const normalizedSearch = connectionSearch.trim().toLowerCase();
    return CONNECTIONS.filter((conn) => {
      const status = connections[conn.key];
      const searchable = `${conn.name} ${conn.description} ${conn.benefits}`.toLowerCase();
      if (normalizedSearch && !searchable.includes(normalizedSearch)) return false;
      if (connectionScope === "connected" && !status?.connected) return false;
      if (connectionScope === "ready" && !(status?.allowed && status?.enabled && !status?.connected)) return false;
      if (connectionScope === "blocked" && status?.allowed) return false;
      return true;
    });
  }, [connectionScope, connectionSearch, connections]);

  const clearModuleFilters = () => {
    setModuleSearch("");
    setModuleScope("all");
  };

  const clearConnectionFilters = () => {
    setConnectionSearch("");
    setConnectionScope("all");
  };

  const moduleFilterChips = [
    moduleScope !== "all" ? { id: "module-view", label: `View: ${moduleScope}`, onClear: () => setModuleScope("all") } : null,
    moduleSearch ? { id: "module-search", label: `Search: ${moduleSearch}`, onClear: () => setModuleSearch("") } : null,
  ].filter((chip): chip is { id: string; label: string; onClear: () => void } => Boolean(chip));

  const connectionFilterChips = [
    connectionScope !== "all" ? { id: "connection-view", label: `View: ${connectionScope}`, onClear: () => setConnectionScope("all") } : null,
    connectionSearch ? { id: "connection-search", label: `Search: ${connectionSearch}`, onClear: () => setConnectionSearch("") } : null,
  ].filter((chip): chip is { id: string; label: string; onClear: () => void } => Boolean(chip));

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Platform"
          title="Integrations"
          subtitle="Structured activation and connection tables so this page behaves like a control surface instead of a placeholder settings list."
          actions={[
            { label: "Settings", href: "/dashboard/settings", variant: "secondary" },
            { label: "Bookings", href: "/dashboard/bookings" },
          ]}
          shortcuts={["Search modules locally", "Activation and connection states are separated cleanly"]}
          stats={stats}
        />

        {error ? <p style={{ color: "#ff8a8a", marginTop: 0 }}>{error}</p> : null}

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Product modules</h2>
              <p className="operator-section__subtitle">Activation state, access level, and next action stay aligned in one table.</p>
            </div>
          </div>

          <OperatorSavedViews
            views={[
              { id: "all", label: "All", count: items.length },
              { id: "enabled", label: "Enabled", count: items.filter((item) => item.enabled).length },
              { id: "restricted", label: "Restricted", count: items.filter((item) => !item.allowed).length },
            ]}
            activeView={moduleScope}
            onChange={(view) => setModuleScope(view as IntegrationScope)}
          />

          <OperatorFilterBar
            searchValue={moduleSearch}
            onSearchChange={setModuleSearch}
            searchPlaceholder="Search module, description, or key"
            resultsLabel={`${filteredItems.length} shown of ${items.length} modules`}
            actions={[
              { label: "Reset filters", variant: "secondary", onClick: clearModuleFilters },
            ]}
          />

          <OperatorActiveFilters chips={moduleFilterChips} onClearAll={moduleFilterChips.length ? clearModuleFilters : undefined} />

          {filteredItems.length ? (
            <OperatorDataTable columns="minmax(220px, 1.4fr) minmax(160px, 0.9fr) minmax(160px, 0.9fr) minmax(170px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Module</div>
                <div className="operator-table__cell">Access</div>
                <div className="operator-table__cell">State</div>
                <div className="operator-table__cell">Actions</div>
              </OperatorDataTableHeader>

              {filteredItems.map((item) => (
                <OperatorDataTableRow key={item.key}>
                  <div className="operator-table__cell">
                    <div className="operator-cellTitle">
                      {item.name}
                      {!item.allowed ? <span className="badge warn">Restricted</span> : item.enabled ? <span className="operator-tag">Enabled</span> : null}
                    </div>
                    <div className="operator-cellSubtle">{item.description}</div>
                  </div>
                  <div className="operator-table__cell">
                    <div className="operator-cellMeta">
                      <span><strong>{item.allowed ? "Allowed" : "Workspace gated"}</strong></span>
                      <span>{item.allowed ? "Ready to configure" : "Plan or policy restricted"}</span>
                    </div>
                  </div>
                  <div className="operator-table__cell">
                    <div className="operator-cellMeta">
                      <span><strong>{item.enabled ? "Enabled" : "Disabled"}</strong></span>
                      <span>Setup time 2-5 min</span>
                    </div>
                  </div>
                  <div className="operator-table__cell operator-table__cell--actions">
                    <OperatorRowActions
                      primaryAction={{ label: "Configure", href: item.configureUrl, variant: "secondary" }}
                      actions={[
                        {
                          label: item.enabled ? "Disable module" : "Enable module",
                          description: item.enabled ? "Turn this module off for the workspace" : "Turn this module on for the workspace",
                          shortcut: item.enabled ? "Off" : "On",
                          group: "Module",
                          onClick: () => void toggle(item),
                          disabled: !item.allowed || savingKey === item.key,
                        },
                      ]}
                    />
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="No modules match this filter"
              description="Clear the search or scope filter to review the full activation matrix."
              actions={[{ label: "Reset filters", variant: "secondary", onClick: clearModuleFilters }]}
            />
          )}
        </section>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Accounting and calendars</h2>
              <p className="operator-section__subtitle">Connection readiness and provider status now read like a real integration control table.</p>
            </div>
          </div>

          <OperatorSavedViews
            views={[
              { id: "all", label: "All", count: CONNECTIONS.length },
              { id: "connected", label: "Connected", count: CONNECTIONS.filter((conn) => connections[conn.key]?.connected).length },
              { id: "ready", label: "Needs setup", count: CONNECTIONS.filter((conn) => connections[conn.key]?.allowed && connections[conn.key]?.enabled && !connections[conn.key]?.connected).length },
              { id: "blocked", label: "Blocked", count: CONNECTIONS.filter((conn) => !connections[conn.key]?.allowed).length },
            ]}
            activeView={connectionScope}
            onChange={(view) => setConnectionScope(view as ConnectionScope)}
          />

          <OperatorFilterBar
            searchValue={connectionSearch}
            onSearchChange={setConnectionSearch}
            searchPlaceholder="Search provider or benefit"
            resultsLabel={`${filteredConnections.length} shown of ${CONNECTIONS.length} providers`}
            actions={[
              { label: "Reset filters", variant: "secondary", onClick: clearConnectionFilters },
            ]}
          />

          <OperatorActiveFilters chips={connectionFilterChips} onClearAll={connectionFilterChips.length ? clearConnectionFilters : undefined} />

          {filteredConnections.length ? (
            <OperatorDataTable columns="minmax(220px, 1.4fr) minmax(160px, 0.9fr) minmax(180px, 1fr) minmax(170px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Provider</div>
                <div className="operator-table__cell">Connection</div>
                <div className="operator-table__cell">Readiness</div>
                <div className="operator-table__cell">Actions</div>
              </OperatorDataTableHeader>

              {filteredConnections.map((conn) => {
                const status = connections[conn.key];
                const canConnect = status?.allowed && status?.enabled;
                return (
                  <OperatorDataTableRow key={conn.key}>
                    <div className="operator-table__cell">
                      <div className="operator-cellTitle">
                        {conn.name}
                        {status?.connected ? <span className="operator-tag">Connected</span> : <span className="badge warn">Not connected</span>}
                      </div>
                      <div className="operator-cellSubtle">{conn.description}</div>
                    </div>
                    <div className="operator-table__cell">
                      <div className="operator-cellMeta">
                        <span><strong>{status?.connected ? "Connected" : "Not connected"}</strong></span>
                        <span>{status?.connectedAt ? new Date(status.connectedAt).toLocaleString() : "No connection timestamp"}</span>
                      </div>
                    </div>
                    <div className="operator-table__cell">
                      <div className="operator-cellMeta">
                        <span><strong>{status?.allowed ? (status?.enabled ? "Ready" : "Module disabled") : "Blocked"}</strong></span>
                        <span>{conn.benefits}</span>
                      </div>
                    </div>
                    <div className="operator-table__cell operator-table__cell--actions">
                      <OperatorRowActions
                        primaryAction={status?.connected
                          ? { label: "Disconnect", onClick: () => void disconnect(conn.key), variant: "secondary", disabled: savingKey === conn.key }
                          : { label: "Connect", onClick: () => void connect(conn.key), disabled: !canConnect || savingKey === conn.key }}
                        actions={[
                          ...(items.find((item) => item.key === conn.key)?.configureUrl
                            ? [{
                                label: "Configure module",
                                description: "Open the underlying module settings",
                                shortcut: "Open",
                                group: "Provider",
                                href: items.find((item) => item.key === conn.key)?.configureUrl as string,
                              }]
                            : []),
                        ]}
                      />
                    </div>
                  </OperatorDataTableRow>
                );
              })}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="No providers match this filter"
              description="Clear the search or scope filter to review the full provider connection matrix."
              actions={[{ label: "Reset filters", variant: "secondary", onClick: clearConnectionFilters }]}
            />
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
