import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import {
  OperatorActiveFilters,
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorFilterBar,
  OperatorGuidance,
  OperatorPageHeader,
  OperatorRowActions,
  OperatorSavedViews,
} from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import { isMarketplaceEnabled } from "../../lib/feature-flags";
import { useStickyOperatorView } from "../../lib/operator-view-state";
import { emptyPermissionSnapshot, hasWorkspacePermission, normalizePermissionSnapshot } from "../../lib/workspace-permissions";

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

type IntegrationOps = {
  summary: { connected: number; ready: number; blocked: number };
  providers: Array<{
    provider: string;
    connected: boolean;
    allowed: boolean;
    enabled: boolean;
    oauthConfigured: boolean;
    connectedAt?: string | null;
    nextStep: string;
    blockers: string[];
  }>;
};

type ApiTokenRow = {
  id: string;
  name: string;
  publicId: string;
  tokenPrefix: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

type WebhookEndpointRow = {
  id: string;
  name: string;
  url: string;
  active: boolean;
  subscribedEventTypes: string[];
  secretLastFour?: string | null;
  lastDeliveryAt?: string | null;
  lastSuccessAt?: string | null;
  createdAt: string;
};

type WebhookDeliveryRow = {
  id: string;
  endpointId: string;
  endpointName?: string | null;
  eventType: string;
  status: string;
  responseStatus?: number | null;
  errorMessage?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
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

const WEBHOOK_EVENT_TYPES = [
  "booking.converted",
  "job.created",
  "job.completed",
  "invoice.issued",
  "invoice.overdue",
  "quote.sent",
  "quote.approved",
  "technician.arrived",
  "portal.document_signed",
  "automation.rule_applied",
  "automation.rule_ran",
  "integration.test",
];

function formatDateTime(value?: string | null) {
  if (!value) return "Not yet";
  return new Date(value).toLocaleString();
}

async function fetchMeWithRetry(attempts = 3) {
  let lastError: any = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await apiFetch("/me");
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  if (lastError) {
    throw lastError;
  }
  return null;
}

function roleCanManageIntegrationsFromToken() {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem("mytitan_token");
  if (!raw) return false;
  try {
    const [, payload] = raw.split(".");
    if (!payload) return false;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(window.atob(padded));
    return ["OWNER", "ADMIN"].includes(String(decoded?.role || ""));
  } catch {
    return false;
  }
}

export default function IntegrationsPage() {
  const [items, setItems] = useState<Integration[]>([]);
  const [connections, setConnections] = useState<Record<string, ConnectionStatus>>({});
  const [ops, setOps] = useState<IntegrationOps | null>(null);
  const [apiTokens, setApiTokens] = useState<ApiTokenRow[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEndpointRow[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRow[]>([]);
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [tokenRoleCanManage, setTokenRoleCanManage] = useState(false);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [moduleSearch, setModuleSearch] = useState("");
  const [moduleScope, setModuleScope] = useStickyOperatorView<IntegrationScope>("mytitan_integrations_module_view_v1", "all");
  const [connectionSearch, setConnectionSearch] = useState("");
  const [connectionScope, setConnectionScope] = useStickyOperatorView<ConnectionScope>("mytitan_integrations_connection_view_v1", "all");
  const [tokenName, setTokenName] = useState("Primary API token");
  const [revealedToken, setRevealedToken] = useState("");
  const [webhookName, setWebhookName] = useState("Operations webhook");
  const [webhookUrl, setWebhookUrl] = useState("https://example.invalid/mytitan-webhook");
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["job.created", "job.completed", "invoice.issued"]);
  const [revealedWebhookSecret, setRevealedWebhookSecret] = useState("");
  const marketplaceEnabled = isMarketplaceEnabled();
  const canManageIntegrations = hasWorkspacePermission(permissions, "settings.manage") || tokenRoleCanManage;

  useEffect(() => {
    setTokenRoleCanManage(roleCanManageIntegrationsFromToken());
  }, []);

  const load = async () => {
    let nextPermissions = emptyPermissionSnapshot();
    let nextError = "";
    try {
      const me = await fetchMeWithRetry().catch(() => null);
      nextPermissions = normalizePermissionSnapshot(me?.permissions);
      setPermissions(nextPermissions);
      setPermissionsReady(true);

      try {
        const modules = await apiFetch("/integrations");
        setItems(Array.isArray(modules) ? modules : []);
      } catch (modulesError: any) {
        setItems([]);
        nextError = modulesError?.message || "Failed to load integrations";
      }

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

      try {
        const opsData = await apiFetch("/integrations/ops");
        setOps(opsData);
      } catch {
        setOps(null);
      }

      if (hasWorkspacePermission(nextPermissions, "settings.manage")) {
        const [tokens, endpoints, deliveryRows] = await Promise.all([
          apiFetch("/integrations/api-tokens").catch(() => []),
          apiFetch("/integrations/webhooks").catch(() => []),
          apiFetch("/integrations/webhook-deliveries").catch(() => []),
        ]);
        setApiTokens(Array.isArray(tokens) ? tokens : []);
        setWebhooks(Array.isArray(endpoints) ? endpoints : []);
        setDeliveries(Array.isArray(deliveryRows) ? deliveryRows : []);
      } else {
        setApiTokens([]);
        setWebhooks([]);
        setDeliveries([]);
      }
      setError(nextError);

    } catch (err: any) {
      setError(err.message || "Failed to load integrations");
      setPermissionsReady(true);
    }
  };

  useEffect(() => {
    void load();
  }, [marketplaceEnabled]);

  const toggle = async (item: Integration) => {
    if (!item.allowed || !canManageIntegrations) return;
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
    if (!conn || !canManageIntegrations) return;
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
    if (!conn || !canManageIntegrations) return;
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

  const createApiToken = async () => {
    if (!canManageIntegrations) return;
    setSavingKey("api-token-create");
    try {
      const response = await apiFetch("/integrations/api-tokens", {
        method: "POST",
        body: JSON.stringify({ name: tokenName }),
      });
      setRevealedToken(String(response?.token || ""));
      setTokenName("Primary API token");
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to create API token");
    } finally {
      setSavingKey(null);
    }
  };

  const revokeApiToken = async (id: string) => {
    if (!canManageIntegrations) return;
    setSavingKey(`api-token-${id}`);
    try {
      await apiFetch(`/integrations/api-tokens/${id}/revoke`, { method: "POST" });
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to revoke API token");
    } finally {
      setSavingKey(null);
    }
  };

  const toggleWebhookEvent = (eventType: string) => {
    setWebhookEvents((current) =>
      current.includes(eventType)
        ? current.filter((value) => value !== eventType)
        : [...current, eventType],
    );
  };

  const createWebhook = async () => {
    if (!canManageIntegrations) return;
    setSavingKey("webhook-create");
    try {
      const response = await apiFetch("/integrations/webhooks", {
        method: "POST",
        body: JSON.stringify({
          name: webhookName,
          url: webhookUrl,
          subscribedEventTypes: webhookEvents,
          active: true,
        }),
      });
      setRevealedWebhookSecret(String(response?.secret || ""));
      setWebhookName("Operations webhook");
      setWebhookUrl("https://example.invalid/mytitan-webhook");
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to create webhook endpoint");
    } finally {
      setSavingKey(null);
    }
  };

  const sendWebhookTest = async (id: string) => {
    if (!canManageIntegrations) return;
    setSavingKey(`webhook-test-${id}`);
    try {
      await apiFetch(`/integrations/webhooks/${id}/test`, { method: "POST" });
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to send webhook test");
    } finally {
      setSavingKey(null);
    }
  };

  const deleteWebhook = async (id: string) => {
    if (!canManageIntegrations) return;
    setSavingKey(`webhook-delete-${id}`);
    try {
      await apiFetch(`/integrations/webhooks/${id}`, { method: "DELETE" });
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to delete webhook endpoint");
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
      { label: "Webhooks", value: String(webhooks.length), hint: webhooks.length ? `${deliveries.length} deliveries logged` : "No endpoints yet" },
    ];
  }, [connections, deliveries.length, items, webhooks.length]);

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
          subtitle="Connect external systems through real workspace primitives: module readiness, API tokens, webhook subscriptions, and delivery history."
          actions={[
            { label: "Settings", href: "/dashboard/settings", variant: "secondary" },
            { label: "Bookings", href: "/dashboard/bookings" },
          ]}
          shortcuts={["Provider readiness remains visible", "Webhook delivery logs are tenant scoped"]}
          stats={stats}
        />

        {error ? <p role="alert" style={{ color: "#ff8a8a", marginTop: 0 }}>{error}</p> : null}
        {permissionsReady && !canManageIntegrations ? (
          <div className="card" data-testid="integrations-governance-readonly">
            <strong>Read-only workspace access.</strong>
            <p style={{ marginBottom: 0 }}>
              You can review module and provider readiness here, but API tokens, webhooks, and connection changes require `settings.manage`.
            </p>
          </div>
        ) : null}

        {ops?.providers?.length ? (
          <section className="card operator-section">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Provider readiness</h2>
                <p className="operator-section__subtitle">Deployment and workspace blockers surfaced before operators try to connect a provider.</p>
              </div>
            </div>
            <OperatorDataTable columns="minmax(180px, 1fr) minmax(220px, 1.2fr) minmax(160px, 0.8fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Provider</div>
                <div className="operator-table__cell">Readiness</div>
                <div className="operator-table__cell">State</div>
              </OperatorDataTableHeader>
              {ops.providers.map((provider) => (
                <OperatorDataTableRow key={provider.provider}>
                  <div className="operator-table__cell"><strong>{provider.provider}</strong></div>
                  <div className="operator-table__cell">{provider.blockers.length ? provider.blockers.join(" · ") : provider.nextStep}</div>
                  <div className="operator-table__cell">{provider.connected ? "Connected" : provider.oauthConfigured ? "Ready" : "Deployment setup needed"}</div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          </section>
        ) : null}

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

          <OperatorGuidance
            title="Integration control tips"
            items={[
              "Module activation controls product readiness, not provider credentials.",
              "API tokens and webhooks are governed separately below.",
              "Restrict workspace mutation rights with the existing settings permission model.",
            ]}
          />

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
                          disabled: !item.allowed || !canManageIntegrations || savingKey === item.key,
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
              <p className="operator-section__subtitle">Connection readiness and provider status stay separate from workspace tokens and webhook delivery.</p>
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
                const canConnect = status?.allowed && status?.enabled && canManageIntegrations;
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
                          ? { label: "Disconnect", onClick: () => void disconnect(conn.key), variant: "secondary", disabled: !canManageIntegrations || savingKey === conn.key }
                          : { label: "Connect", onClick: () => void connect(conn.key), disabled: !canConnect || savingKey === conn.key }}
                        actions={[
                          {
                            label: "Configure module",
                            description: "Open the underlying module settings",
                            shortcut: "Open",
                            group: "Provider",
                            href: items.find((item) => item.key === conn.key)?.configureUrl || "/dashboard/settings",
                          },
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

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">API tokens</h2>
              <p className="operator-section__subtitle">Reveal-once workspace tokens for external systems that need a stable read path into MyTitan.</p>
            </div>
          </div>

          {canManageIntegrations ? (
            <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Token name</span>
                <input data-testid="integration-api-token-name-input" value={tokenName} onChange={(event) => setTokenName(event.target.value)} />
              </label>
              <div>
                <button data-testid="integration-api-token-create" onClick={() => void createApiToken()} disabled={savingKey === "api-token-create"}>
                  {savingKey === "api-token-create" ? "Creating..." : "Create API token"}
                </button>
              </div>
              {revealedToken ? (
                <div className="card" data-testid="integration-api-token-reveal">
                  <strong>Copy this token now.</strong>
                  <p style={{ marginBottom: 8 }}>It will not be shown again after this view refreshes.</p>
                  <code>{revealedToken}</code>
                </div>
              ) : null}
            </div>
          ) : null}

          {apiTokens.length ? (
            <OperatorDataTable columns="minmax(220px, 1.3fr) minmax(160px, 0.8fr) minmax(160px, 0.8fr) minmax(150px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Token</div>
                <div className="operator-table__cell">Prefix</div>
                <div className="operator-table__cell">Last used</div>
                <div className="operator-table__cell">Actions</div>
              </OperatorDataTableHeader>
              {apiTokens.map((token) => (
                <OperatorDataTableRow key={token.id}>
                  <div className="operator-table__cell">
                    <div className="operator-cellTitle">
                      {token.name}
                      {token.revokedAt ? <span className="badge warn">Revoked</span> : <span className="operator-tag">Active</span>}
                    </div>
                    <div className="operator-cellSubtle">Created {formatDateTime(token.createdAt)}</div>
                  </div>
                  <div className="operator-table__cell"><code>{token.tokenPrefix}</code></div>
                  <div className="operator-table__cell">{formatDateTime(token.lastUsedAt)}</div>
                  <div className="operator-table__cell operator-table__cell--actions">
                    <OperatorRowActions
                      primaryAction={{
                        label: token.revokedAt ? "Revoked" : "Revoke",
                        onClick: () => void revokeApiToken(token.id),
                        variant: "secondary",
                        disabled: Boolean(token.revokedAt) || !canManageIntegrations || savingKey === `api-token-${token.id}`,
                      }}
                      actions={[]}
                    />
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="No API tokens yet"
              description="Create a workspace token to let external systems read platform activity through the governed integrations endpoint."
            />
          )}
        </section>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Outbound webhooks</h2>
              <p className="operator-section__subtitle">Tenant-scoped endpoint secrets, explicit event subscriptions, and delivery logs tied to real lifecycle events.</p>
            </div>
          </div>

          {canManageIntegrations ? (
            <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Endpoint name</span>
                <input data-testid="integration-webhook-name-input" value={webhookName} onChange={(event) => setWebhookName(event.target.value)} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Destination URL</span>
                <input data-testid="integration-webhook-url-input" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} />
              </label>
              <div style={{ display: "grid", gap: 8 }}>
                <strong>Subscribed events</strong>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                  {WEBHOOK_EVENT_TYPES.map((eventType) => (
                    <label key={eventType} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        data-testid={`integration-webhook-event-${eventType}`}
                        type="checkbox"
                        checked={webhookEvents.includes(eventType)}
                        onChange={() => toggleWebhookEvent(eventType)}
                      />
                      <span>{eventType}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <button data-testid="integration-webhook-create" onClick={() => void createWebhook()} disabled={savingKey === "webhook-create"}>
                  {savingKey === "webhook-create" ? "Creating..." : "Create webhook endpoint"}
                </button>
              </div>
              {revealedWebhookSecret ? (
                <div className="card" data-testid="integration-webhook-secret-reveal">
                  <strong>Copy this signing secret now.</strong>
                  <p style={{ marginBottom: 8 }}>It is only shown once after creation or rotation.</p>
                  <code>{revealedWebhookSecret}</code>
                </div>
              ) : null}
            </div>
          ) : null}

          {webhooks.length ? (
            <OperatorDataTable columns="minmax(220px, 1.3fr) minmax(220px, 1.4fr) minmax(180px, 1fr) minmax(170px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Endpoint</div>
                <div className="operator-table__cell">Subscriptions</div>
                <div className="operator-table__cell">Delivery health</div>
                <div className="operator-table__cell">Actions</div>
              </OperatorDataTableHeader>
              {webhooks.map((webhook) => (
                <OperatorDataTableRow key={webhook.id} data-testid={`integration-webhook-row-${webhook.id}`}>
                  <div className="operator-table__cell">
                    <div className="operator-cellTitle">
                      {webhook.name}
                      {webhook.active ? <span className="operator-tag">Active</span> : <span className="badge warn">Paused</span>}
                    </div>
                    <div className="operator-cellSubtle">{webhook.url}</div>
                  </div>
                  <div className="operator-table__cell">
                    <div className="operator-cellMeta">
                      <span><strong>{webhook.subscribedEventTypes.length} events</strong></span>
                      <span>{webhook.subscribedEventTypes.join(", ")}</span>
                    </div>
                  </div>
                  <div className="operator-table__cell">
                    <div className="operator-cellMeta">
                      <span><strong>Last success: {formatDateTime(webhook.lastSuccessAt)}</strong></span>
                      <span>Last attempt: {formatDateTime(webhook.lastDeliveryAt)} · Secret ending {webhook.secretLastFour || "n/a"}</span>
                    </div>
                  </div>
                  <div className="operator-table__cell operator-table__cell--actions">
                    <OperatorRowActions
                      primaryAction={{
                        label: "Send test",
                        onClick: () => void sendWebhookTest(webhook.id),
                        disabled: !canManageIntegrations || savingKey === `webhook-test-${webhook.id}`,
                      }}
                      actions={[
                        {
                          label: "Delete endpoint",
                          description: "Remove this endpoint and its future deliveries",
                          shortcut: "Del",
                          group: "Webhook",
                          onClick: () => void deleteWebhook(webhook.id),
                          disabled: !canManageIntegrations || savingKey === `webhook-delete-${webhook.id}`,
                        },
                      ]}
                    />
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="No webhook endpoints yet"
              description="Create an endpoint to subscribe external systems to booking, job, billing, portal, technician, and automation lifecycle events."
            />
          )}
        </section>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Delivery logs</h2>
              <p className="operator-section__subtitle">Persisted delivery status and response history for each subscribed event push.</p>
            </div>
          </div>

          {deliveries.length ? (
            <OperatorDataTable columns="minmax(180px, 1fr) minmax(180px, 1fr) minmax(140px, 0.8fr) minmax(220px, 1.4fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Event</div>
                <div className="operator-table__cell">Endpoint</div>
                <div className="operator-table__cell">Status</div>
                <div className="operator-table__cell">Result</div>
              </OperatorDataTableHeader>
              {deliveries.map((delivery) => (
                <OperatorDataTableRow key={delivery.id} data-testid="integration-delivery-log-row">
                  <div className="operator-table__cell">
                    <div className="operator-cellTitle">{delivery.eventType}</div>
                    <div className="operator-cellSubtle">{formatDateTime(delivery.createdAt)}</div>
                  </div>
                  <div className="operator-table__cell">{delivery.endpointName || delivery.endpointId}</div>
                  <div className="operator-table__cell">
                    <span className={delivery.status === "SUCCESS" ? "operator-tag" : "badge warn"}>{delivery.status}</span>
                  </div>
                  <div className="operator-table__cell">
                    {delivery.responseStatus ? `HTTP ${delivery.responseStatus}` : delivery.errorMessage || "Pending"}
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="No delivery history yet"
              description="Delivery rows appear here after seeded events or live webhook activity."
            />
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
