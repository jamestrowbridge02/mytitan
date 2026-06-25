import { useEffect, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { OperatorPageHeader, OperatorStatusBadge } from "../../../components/ui/operator-page";
import { apiFetch } from "../../../lib/api";
import {
  emptyPermissionSnapshot,
  hasWorkspacePermission,
  normalizePermissionSnapshot,
} from "../../../lib/workspace-permissions";

type ApiToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
};

type Webhook = {
  id: string;
  name: string;
  url: string;
  active: boolean;
  subscribedEventTypes: string[];
  lastSuccessAt?: string | null;
};

type WebhookDelivery = {
  id: string;
  endpointName?: string | null;
  eventType: string;
  status: string;
  responseStatus?: number | null;
  createdAt: string;
};

const EVENTS = [
  ["booking.converted", "Booking confirmed"],
  ["job.created", "Job created"],
  ["job.completed", "Job completed"],
  ["invoice.issued", "Invoice issued"],
  ["invoice.overdue", "Invoice overdue"],
  ["quote.sent", "Quote sent"],
  ["quote.approved", "Quote approved"],
  ["technician.arrived", "Team member arrived"],
  ["portal.document_signed", "Customer document signed"],
];

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Not yet";
}

function eventLabel(value: string) {
  return EVENTS.find(([event]) => event === value)?.[1] || String(value || "").replace(/[._]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function DeveloperToolsPage() {
  const [permissions, setPermissions] = useState(emptyPermissionSnapshot());
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [tokenName, setTokenName] = useState("Primary API token");
  const [revealedToken, setRevealedToken] = useState("");
  const [webhookName, setWebhookName] = useState("Operations webhook");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [events, setEvents] = useState(["job.created", "job.completed", "invoice.issued"]);
  const [revealedSecret, setRevealedSecret] = useState("");
  const [webhookStorageReady, setWebhookStorageReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canManage = hasWorkspacePermission(permissions, "settings.manage");

  async function load() {
    const me = await apiFetch("/me");
    const nextPermissions = normalizePermissionSnapshot(me?.permissions);
    setPermissions(nextPermissions);
    setPermissionsReady(true);
    if (!hasWorkspacePermission(nextPermissions, "settings.manage")) return;
    const [tokenRows, webhookRows, deliveryRows, health] = await Promise.all([
      apiFetch("/integrations/api-tokens"),
      apiFetch("/integrations/webhooks"),
      apiFetch("/integrations/webhook-deliveries"),
      apiFetch("/integrations/health"),
    ]);
    setTokens(Array.isArray(tokenRows) ? tokenRows : []);
    setWebhooks(Array.isArray(webhookRows) ? webhookRows : []);
    setDeliveries(Array.isArray(deliveryRows) ? deliveryRows : []);
    setWebhookStorageReady(Boolean(health?.webhookPlatform?.encryptionConfigured));
  }

  useEffect(() => {
    void load().catch((nextError: any) => setError(nextError?.message || "Developer Tools could not be loaded."));
  }, []);

  async function createToken() {
    setBusy("token");
    setError("");
    try {
      const result = await apiFetch("/integrations/api-tokens", {
        method: "POST",
        body: JSON.stringify({ name: tokenName }),
      });
      setRevealedToken(String(result?.token || ""));
      setMessage("API token created. Copy it now because it will not be shown again.");
      await load();
    } catch (nextError: any) {
      setError(nextError?.message || "API token could not be created.");
    } finally {
      setBusy("");
    }
  }

  async function revokeToken(id: string) {
    setBusy(`token-${id}`);
    setError("");
    try {
      await apiFetch(`/integrations/api-tokens/${id}/revoke`, { method: "POST" });
      setMessage("API token revoked.");
      await load();
    } catch (nextError: any) {
      setError(nextError?.message || "API token could not be revoked.");
    } finally {
      setBusy("");
    }
  }

  async function createWebhook() {
    setBusy("webhook");
    setError("");
    try {
      const result = await apiFetch("/integrations/webhooks", {
        method: "POST",
        body: JSON.stringify({
          name: webhookName,
          url: webhookUrl,
          active: true,
          subscribedEventTypes: events,
        }),
      });
      setRevealedSecret(String(result?.secret || ""));
      setMessage("Webhook saved. Copy the signing secret now because it will not be shown again.");
      await load();
    } catch (nextError: any) {
      setError(nextError?.message || "Webhook could not be created.");
    } finally {
      setBusy("");
    }
  }

  async function testWebhook(id: string) {
    setBusy(`test-${id}`);
    setError("");
    try {
      await apiFetch(`/integrations/webhooks/${id}/test`, { method: "POST" });
      setMessage("Webhook test queued.");
      await load();
    } catch (nextError: any) {
      setError(nextError?.message || "Webhook test could not be sent.");
    } finally {
      setBusy("");
    }
  }

  async function rotateSecret(id: string) {
    setBusy(`rotate-${id}`);
    setError("");
    try {
      const result = await apiFetch(`/integrations/webhooks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ rotateSecret: true }),
      });
      setRevealedSecret(String(result?.secret || ""));
      setMessage("Webhook signing secret rotated. Copy it now.");
    } catch (nextError: any) {
      setError(nextError?.message || "Webhook secret could not be rotated.");
    } finally {
      setBusy("");
    }
  }

  async function retryDelivery(id: string) {
    setBusy(`retry-${id}`);
    setError("");
    try {
      await apiFetch(`/integrations/webhook-deliveries/${id}/retry`, { method: "POST" });
      setMessage("Webhook delivery retry queued.");
      await load();
    } catch (nextError: any) {
      setError(nextError?.message || "Webhook delivery could not be retried.");
    } finally {
      setBusy("");
    }
  }

  if (!canManage && permissionsReady) {
    return (
      <DashboardShell>
        <OperatorPageHeader eyebrow="Settings" title="Developer Tools" subtitle="Technical connections are restricted to workspace owners and admins." />
        <div className="card"><strong>Access restricted</strong></div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <OperatorPageHeader
        eyebrow="Settings"
        title="Developer Tools"
        subtitle="Manage approved API tokens and webhook connections."
        actions={[{ label: "Back to Connected Tools", href: "/dashboard/integrations", variant: "secondary" }]}
      />
      {error ? <div className="alert error" role="alert">{error}</div> : null}
      {message ? <div className="alert success" role="status">{message}</div> : null}

      <section className="card operator-section" id="api-tokens" data-testid="developer-api-tokens">
        <div className="operator-section__header">
          <div>
            <h2 className="operator-section__title">API tokens</h2>
            <p className="operator-section__subtitle">Create secure, reveal-once tokens for approved external systems.</p>
          </div>
        </div>
        <div className="developer-tools-form">
          <label>Token name<input className="input" value={tokenName} onChange={(event) => setTokenName(event.target.value)} /></label>
          <button className="button" type="button" onClick={() => void createToken()} disabled={!canManage || busy === "token"} data-testid="integration-api-token-create">
            {busy === "token" ? "Creating..." : "Create token"}
          </button>
        </div>
        {revealedToken ? <div className="alert warning"><strong>Copy this token now:</strong> <code>{revealedToken}</code></div> : null}
        <div className="developer-tools-list">
          {tokens.map((token) => (
            <article className="integration-card" key={token.id}>
              <div className="connected-tool-card__header">
                <strong>{token.name}</strong>
                <OperatorStatusBadge label={token.revokedAt ? "Revoked" : "Ready"} tone={token.revokedAt ? "neutral" : "success"} />
              </div>
              <p className="muted"><code>{token.tokenPrefix}</code> · Last used {formatDate(token.lastUsedAt)}</p>
              <button className="button secondary" type="button" disabled={Boolean(token.revokedAt) || busy === `token-${token.id}`} onClick={() => void revokeToken(token.id)}>Revoke</button>
            </article>
          ))}
        </div>
        <div className="developer-tools-deliveries" data-testid="developer-webhook-deliveries">
          <h3>Delivery logs</h3>
          {deliveries.length ? deliveries.slice(0, 20).map((delivery) => (
            <div className="developer-tools-delivery" key={delivery.id} data-testid="integration-delivery-log-row">
              <span><strong>{eventLabel(delivery.eventType)}</strong> · {delivery.endpointName || "Webhook endpoint"}</span>
              <span>
                {delivery.status}{delivery.responseStatus ? ` · HTTP ${delivery.responseStatus}` : ""} · {formatDate(delivery.createdAt)}
                {delivery.status === "FAILED" ? (
                  <button
                    className="button secondary"
                    type="button"
                    data-testid={`integration-delivery-retry-${delivery.id}`}
                    disabled={!webhookStorageReady || busy === `retry-${delivery.id}`}
                    onClick={() => void retryDelivery(delivery.id)}
                  >
                    Retry delivery
                  </button>
                ) : null}
              </span>
            </div>
          )) : <p className="muted">No webhook deliveries yet.</p>}
        </div>
      </section>

      <section className="card operator-section" id="webhooks" data-testid="developer-webhooks">
        <div className="operator-section__header">
          <div>
            <h2 className="operator-section__title">Webhooks</h2>
            <p className="operator-section__subtitle">Choose the business events sent to an approved HTTPS endpoint.</p>
          </div>
        </div>
        {!webhookStorageReady ? (
          <div className="alert warning" data-testid="integration-encryption-guidance">
            Webhook management needs attention. Ask a platform administrator to update integration encryption before creating, testing, or rotating an endpoint.
          </div>
        ) : null}
        <div className="developer-tools-form">
          <label>Endpoint name<input className="input" value={webhookName} onChange={(event) => setWebhookName(event.target.value)} /></label>
          <label>Destination URL<input className="input" type="url" placeholder="https://example.com/webhooks/mytitan" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} /></label>
          <fieldset className="developer-tools-events">
            <legend>Event subscriptions</legend>
            {EVENTS.map(([value, label]) => (
              <label key={value}>
                <input
                  type="checkbox"
                  checked={events.includes(value)}
                  onChange={() => setEvents((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <button className="button" type="button" onClick={() => void createWebhook()} disabled={!canManage || !webhookStorageReady || busy === "webhook" || !webhookUrl} data-testid="integration-webhook-create">
            {busy === "webhook" ? "Saving..." : "Create webhook"}
          </button>
        </div>
        {revealedSecret ? <div className="alert warning"><strong>Copy this signing secret now:</strong> <code>{revealedSecret}</code></div> : null}
        <div className="developer-tools-list">
          {webhooks.map((webhook) => (
            <article className="integration-card" key={webhook.id}>
              <div className="connected-tool-card__header">
                <strong>{webhook.name}</strong>
                <OperatorStatusBadge label={webhook.active ? "Ready" : "Needs attention"} tone={webhook.active ? "success" : "warning"} />
              </div>
              <p className="muted">{webhook.url}</p>
              <p className="muted">{webhook.subscribedEventTypes.length} event subscriptions · Last success {formatDate(webhook.lastSuccessAt)}</p>
              <div className="billing-page-actions">
                <button className="button secondary" type="button" disabled={!webhookStorageReady || busy === `test-${webhook.id}`} onClick={() => void testWebhook(webhook.id)}>Test webhook</button>
                <button className="button secondary" type="button" disabled={!webhookStorageReady || busy === `rotate-${webhook.id}`} onClick={() => void rotateSecret(webhook.id)}>Rotate secret</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}
