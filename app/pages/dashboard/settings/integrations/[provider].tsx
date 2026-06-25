import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { DashboardShell } from "../../../../components/dashboard-shell";
import { OperatorPageHeader, OperatorStatusBadge } from "../../../../components/ui/operator-page";
import { apiFetch } from "../../../../lib/api";
import {
  emptyPermissionSnapshot,
  hasWorkspacePermission,
  normalizePermissionSnapshot,
} from "../../../../lib/workspace-permissions";

type ProviderKey = "xero" | "quickbooks" | "google-calendar";

const PROVIDERS: Record<ProviderKey, {
  name: string;
  description: string;
  statusPath: string;
  connectPath: string;
  checkPath?: string;
  disconnectPath: string;
}> = {
  xero: {
    name: "Xero",
    description: "Connect your accounts so invoices and payments can sync when ready.",
    statusPath: "/integrations/xero/status",
    connectPath: "/integrations/xero/connect",
    checkPath: "/integrations/xero/check",
    disconnectPath: "/integrations/xero/disconnect",
  },
  quickbooks: {
    name: "QuickBooks",
    description: "Connect your accounts so invoices and payments can sync when ready.",
    statusPath: "/integrations/qbo/status",
    connectPath: "/integrations/qbo/connect",
    checkPath: "/integrations/qbo/check",
    disconnectPath: "/integrations/qbo/disconnect",
  },
  "google-calendar": {
    name: "Google Calendar",
    description: "Connect your calendar to keep supported appointments in sync.",
    statusPath: "/integrations/google/status",
    connectPath: "/integrations/google/connect",
    disconnectPath: "/integrations/google/disconnect",
  },
};

export default function ProviderSetupPage() {
  const router = useRouter();
  const providerKey = String(router.query.provider || "") as ProviderKey;
  const provider = PROVIDERS[providerKey];
  const [status, setStatus] = useState<any>(null);
  const [permissions, setPermissions] = useState(emptyPermissionSnapshot());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canManage = hasWorkspacePermission(permissions, "settings.manage");

  async function load() {
    if (!provider) return;
    const [me, nextStatus] = await Promise.all([
      apiFetch("/me"),
      apiFetch(provider.statusPath),
    ]);
    setPermissions(normalizePermissionSnapshot(me?.permissions));
    setStatus(nextStatus || null);
    setLoading(false);
  }

  useEffect(() => {
    if (!router.isReady || !provider) return;
    void load().catch((nextError: any) => {
      setError(nextError?.message || "Setup status could not be loaded.");
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerKey, router.isReady]);

  const state = useMemo(() => {
    if (!status?.setupAvailable || status?.allowed === false || status?.enabled === false) return "Not available";
    if (status?.connectionState === "needs_reconnect") return "Needs attention";
    if (status?.connected) return "Connected";
    return "Needs setup";
  }, [status]);

  async function connect() {
    if (!provider || !canManage) return;
    setBusy("connect");
    setError("");
    setMessage("");
    try {
      const result = await apiFetch(provider.connectPath, { method: "POST" });
      if (!result?.url) throw new Error("Provider onboarding could not be opened.");
      window.location.assign(result.url);
    } catch (nextError: any) {
      setError(nextError?.message || "Provider onboarding could not be opened.");
      setBusy("");
    }
  }

  async function verify() {
    if (!provider || !canManage) return;
    setBusy("verify");
    setError("");
    setMessage("");
    try {
      if (provider.checkPath) {
        await apiFetch(provider.checkPath, { method: "POST" });
      }
      await load();
      setMessage(provider.checkPath ? "Connection verified." : "Connection status refreshed.");
    } catch (nextError: any) {
      setError(nextError?.message || "Connection verification failed.");
    } finally {
      setBusy("");
    }
  }

  async function disconnect() {
    if (!provider || !canManage || !window.confirm(`Disconnect ${provider.name}?`)) return;
    setBusy("disconnect");
    setError("");
    setMessage("");
    try {
      await apiFetch(provider.disconnectPath, { method: "POST" });
      await load();
      setMessage(`${provider.name} disconnected.`);
    } catch (nextError: any) {
      setError(nextError?.message || "Connection could not be disconnected.");
    } finally {
      setBusy("");
    }
  }

  if (router.isReady && !provider) {
    return (
      <DashboardShell>
        <OperatorPageHeader eyebrow="Connected tools" title="Provider not available" subtitle="This provider does not have a tenant setup route." />
        <a className="button" href="/dashboard/integrations">Back to Connected Tools</a>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <OperatorPageHeader
        eyebrow="Connected tools"
        title={provider?.name || "Provider setup"}
        subtitle={provider?.description || "Loading provider setup."}
        actions={[{ label: "Back to Connected Tools", href: "/dashboard/integrations", variant: "secondary" }]}
      />

      {error ? <div className="alert error" role="alert">{error}</div> : null}
      {message ? <div className="alert success" role="status">{message}</div> : null}

      <section className="card operator-section" data-testid="provider-setup-wizard">
        <div className="operator-row">
          <div>
            <h2 className="operator-section__title">Setup</h2>
            <p className="operator-section__subtitle">Nothing becomes active until the provider confirms the account connection.</p>
          </div>
          <OperatorStatusBadge
            label={loading ? "Checking" : state}
            tone={state === "Connected" ? "success" : state === "Needs attention" ? "warning" : "neutral"}
          />
        </div>

        <ol className="provider-setup-steps" aria-label={`${provider?.name || "Provider"} setup progress`}>
          <li><strong>What this connects</strong><span>{provider?.description}</span></li>
          <li><strong>Connect account</strong><span>Sign in directly with the provider and approve the requested access.</span></li>
          <li><strong>Verify connection</strong><span>Confirm the stored connection still belongs to this workspace.</span></li>
          <li><strong>Test safely</strong><span>Run a status check without sending invoices, payments, or customer messages.</span></li>
          <li><strong>Complete</strong><span>Live sync remains off until mappings and explicit activation controls are satisfied.</span></li>
        </ol>

        <div className="billing-page-actions">
          {!status?.connected ? (
            <button className="button" type="button" disabled={!canManage || !status?.setupAvailable || busy === "connect"} onClick={() => void connect()}>
              {busy === "connect" ? "Opening..." : `Connect ${provider?.name || "provider"}`}
            </button>
          ) : (
            <>
              <button className="button" type="button" disabled={!canManage || busy === "verify"} onClick={() => void verify()}>
                {busy === "verify" ? "Verifying..." : "Verify connection"}
              </button>
              <button className="button secondary" type="button" disabled={!canManage || busy === "disconnect"} onClick={() => void disconnect()}>
                {busy === "disconnect" ? "Disconnecting..." : "Disconnect"}
              </button>
            </>
          )}
        </div>
      </section>
    </DashboardShell>
  );
}
