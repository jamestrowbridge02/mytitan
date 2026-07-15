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
  organisationsPath?: string;
  selectOrganisationPath?: string;
}> = {
  xero: {
    name: "Xero",
    description: "Connect your accounts so invoices and payments can sync when ready.",
    statusPath: "/integrations/xero/status",
    connectPath: "/integrations/xero/connect",
    checkPath: "/integrations/xero/check",
    disconnectPath: "/integrations/xero/disconnect",
    organisationsPath: "/integrations/xero/organisations",
    selectOrganisationPath: "/integrations/xero/organisations/select",
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
  const [organisations, setOrganisations] = useState<any[]>([]);
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
    if (provider.organisationsPath && nextStatus?.connectionState === "select_organisation") {
      const orgResult = await apiFetch(provider.organisationsPath).catch(() => null);
      setOrganisations(Array.isArray(orgResult?.organisations) ? orgResult.organisations : []);
    } else {
      setOrganisations([]);
    }
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
    if (status?.allowed === false || status?.enabled === false) return "Not available";
    if (!status?.setupAvailable) return "Setup required";
    if (status?.connectionState === "needs_reconnect") return "Needs attention";
    if (status?.connectionState === "select_organisation") return "Select organisation";
    if (status?.connected) return "Connected";
    return "Available";
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

  async function selectOrganisation(selectionId: string) {
    if (!provider?.selectOrganisationPath || !canManage) return;
    setBusy(`select-${selectionId}`);
    setError("");
    setMessage("");
    try {
      await apiFetch(provider.selectOrganisationPath, {
        method: "POST",
        body: JSON.stringify({ selectionId }),
      });
      await load();
      setMessage("Xero organisation selected and read-only verification recorded.");
    } catch (nextError: any) {
      setError(nextError?.message || "Xero organisation could not be selected.");
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

        {status?.diagnostics?.nextAction ? (
          <div className="alert info" role="status">
            {status.diagnostics.nextAction}
          </div>
        ) : null}

        {!status?.setupAvailable && providerKey === "xero" ? (
          <div className="operator-empty-state" data-testid="xero-platform-config-required">
            <h3>Xero app configuration required</h3>
            <p>Platform Admin must configure the Xero client ID, client secret and API redirect URI before tenant admins can connect.</p>
            <p>Callback URL: <code>{status?.diagnostics?.callbackUrl || "/integrations/xero/callback on the API origin"}</code></p>
          </div>
        ) : null}

        {status?.connectionState === "select_organisation" ? (
          <div className="operator-subsection" data-testid="xero-organisation-selector">
            <h3>Select Xero organisation</h3>
            <p>Choose the Xero organisation that belongs to this MyTitan business. MyTitan will only run a read-only verification.</p>
            {organisations.length ? (
              <div className="settings-list">
                {organisations.map((organisation) => (
                  <div className="settings-list__row" key={organisation.selectionId}>
                    <div>
                      <strong>{organisation.tenantName || "Xero organisation"}</strong>
                      <span>{organisation.tenantType || "Organisation"} · provider identifier kept server-side</span>
                    </div>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={!canManage || busy === `select-${organisation.selectionId}`}
                      onClick={() => void selectOrganisation(organisation.selectionId)}
                    >
                      {busy === `select-${organisation.selectionId}` ? "Selecting..." : "Select organisation"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="alert warning" role="status">No Xero organisations were returned for this connection. Reconnect after confirming the Xero account has organisation access.</div>
            )}
          </div>
        ) : null}

        <div className="billing-page-actions">
          {!status?.connected ? (
            <button className="button" type="button" disabled={!canManage || !status?.setupAvailable || busy === "connect" || status?.connectionState === "select_organisation"} onClick={() => void connect()}>
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
