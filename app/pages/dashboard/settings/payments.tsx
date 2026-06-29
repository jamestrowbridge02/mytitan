import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { DashboardShell } from "../../../components/dashboard-shell";
import { OperatorPageHeader, OperatorStatusBadge } from "../../../components/ui/operator-page";
import { apiFetch } from "../../../lib/api";
import { emptyPermissionSnapshot, hasWorkspacePermission, normalizePermissionSnapshot } from "../../../lib/workspace-permissions";
import { useOperationalRefresh } from "../../../lib/operational-refresh";

type ProviderRow = {
  provider: string;
  providerKey: string;
  advancedProviderName: string;
  status: string;
  connected: boolean;
  needsReauth: boolean;
  lastChecked?: string | null;
  lastWebhookReceivedAt?: string | null;
  webhookHealth: string;
  metadata?: Record<string, unknown>;
  readinessState?: "not_connected" | "needs_setup" | "needs_attention" | "ready";
  readinessLabel?: string;
  checkoutEligible?: boolean;
  tenantAction?: string;
  summary?: string;
};

const PAYMENT_TYPES: Record<string, string> = {
  "stripe-customer-payments": "Connect each business's own Stripe account so customers can pay that business directly.",
  "manual-card-terminal": "Authorised manual terminal recording",
  "bank-transfer": "Bank transfer instructions and manual confirmation",
};

const PAYMENT_CATEGORIES: Record<string, string> = {
  "stripe-customer-payments": "Tenant-owned account",
  "manual-card-terminal": "External terminal",
  "bank-transfer": "Manual transfer",
};

function providerDisplayName(provider: ProviderRow) {
  if (provider.provider === "stripe-customer-payments") return "Stripe Connect";
  return provider.advancedProviderName;
}

export default function PaymentSettingsPage() {
  const router = useRouter();
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [permissions, setPermissions] = useState(emptyPermissionSnapshot());
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});

  const canManage = hasWorkspacePermission(permissions, "settings.manage");

  async function load() {
    const [me, rows, readiness] = await Promise.all([
      apiFetch("/me"),
      apiFetch("/integrations/byog"),
      apiFetch("/billing/customer-payment-readiness"),
    ]);
    setPermissions(normalizePermissionSnapshot(me?.permissions));
    const readinessByKey = new Map(
      (Array.isArray(readiness?.providers) ? readiness.providers : [])
        .map((provider: any) => [String(provider.providerKey || ""), provider]),
    );
    setProviders((Array.isArray(rows) ? rows : []).filter((row: ProviderRow) => (
      PAYMENT_TYPES[row.provider] &&
      (
        row.provider === "stripe-customer-payments" ||
        row.provider === "bank-transfer" ||
        row.provider === "manual-card-terminal"
      )
    )).map((row: ProviderRow) => {
      const providerReadiness = readinessByKey.get(row.providerKey) as any;
      return {
        ...row,
        readinessState: providerReadiness?.readinessState,
        readinessLabel: providerReadiness?.readinessLabel,
        checkoutEligible: providerReadiness?.checkoutEligible,
        tenantAction: providerReadiness?.tenantAction,
        summary: providerReadiness?.summary,
      };
    }));
    setReady(true);
  }

  useEffect(() => {
    void load().catch((err) => {
      setError(err?.message || "Failed to load payment providers");
      setReady(true);
    });
  }, []);
  const { refreshNow, lastUpdatedAt, isRefreshing } = useOperationalRefresh(load);

  useEffect(() => {
    if (!router.isReady || !providers.length) return;
    const target = typeof router.query.provider === "string" ? router.query.provider : "";
    const provider = providers.find((row) => row.provider === target);
    if (provider && ["stripe-customer-payments", "bank-transfer", "manual-card-terminal"].includes(provider.provider)) {
      openSetup(provider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers.length, router.isReady, router.query.provider]);

  const counts = useMemo(() => ({
    connected: providers.filter((provider) => provider.readinessState === "ready" || (
      provider.provider !== "stripe-customer-payments" && provider.connected
    )).length,
    attention: providers.filter((provider) => provider.readinessState === "needs_attention" || provider.needsReauth || provider.status === "error").length,
  }), [providers]);

  function providerStatus(provider: ProviderRow) {
    if (provider.provider === "stripe-customer-payments") {
      return {
        label: provider.readinessLabel || "Needs setup",
        tone: provider.readinessState === "ready"
          ? "success" as const
          : provider.readinessState === "needs_attention"
            ? "warning" as const
            : "neutral" as const,
      };
    }
    return {
      label: provider.needsReauth ? "Needs attention" : provider.connected ? "Connected" : "Needs setup",
      tone: provider.needsReauth ? "warning" as const : provider.connected ? "success" as const : "neutral" as const,
    };
  }

  function openSetup(provider: ProviderRow) {
    if (provider.provider === "stripe-customer-payments") {
      void router.push("/dashboard/settings/payments/stripe");
      return;
    }
    setEditing(provider.provider);
    setForm({
      displayName: provider.advancedProviderName,
      accountReference: "",
      secret: "",
      accountName: "",
      sortCode: "",
      accountNumber: "",
      paymentReference: "",
      enabled: provider.metadata?.enabled === false ? "" : "yes",
    });
    setError("");
    setMessage("");
  }

  async function save(provider: ProviderRow) {
    setBusy(provider.provider);
    setError("");
    setMessage("");
    try {
      const isBankTransfer = provider.provider === "bank-transfer";
      if (isBankTransfer) {
        if (!String(form.accountName || "").trim()) throw new Error("Add the account holder name.");
        if (!/^\d{6}$/.test(String(form.sortCode || "").replace(/\D/g, ""))) throw new Error("Enter a valid 6-digit sort code.");
        if (!/^\d{8}$/.test(String(form.accountNumber || "").replace(/\D/g, ""))) throw new Error("Enter a valid 8-digit account number.");
      }
      const credentials = isBankTransfer
        ? {
            accountName: form.accountName.trim(),
            sortCode: form.sortCode.replace(/\D/g, ""),
            accountNumber: form.accountNumber.replace(/\D/g, ""),
          }
        : provider.provider === "stripe-customer-payments"
          ? {
              connectedAccountId: form.accountReference.trim(),
            }
        : {
            accountReference: form.accountReference,
          };
      await apiFetch(`/integrations/byog/${provider.provider}`, {
        method: "PUT",
        body: JSON.stringify({
          scope: "WORKSPACE",
          displayName: form.displayName || provider.advancedProviderName,
          credentialType: "MERCHANT_PAYMENT_GATEWAY_CONFIG",
          status: isBankTransfer || provider.provider === "manual-card-terminal" ? "CONNECTED" : "SETUP_NEEDED",
          credentials,
          secretMaterial: form.secret || undefined,
          metadata: {
            paymentReference: isBankTransfer ? form.paymentReference : undefined,
            accountLabel: isBankTransfer ? form.accountName : form.accountReference,
            enabled: form.enabled === "yes",
            setupSource: "payments_hub",
          },
        }),
      });
      setEditing("");
      setMessage(`${providerDisplayName(provider)} setup saved.`);
      await load();
    } catch (err: any) {
      setError(err?.message || "Payment provider setup could not be saved");
    } finally {
      setBusy("");
    }
  }

  return (
    <DashboardShell>
      <OperatorPageHeader
        eyebrow="Settings"
        title="Payments & Invoices"
        subtitle="Accept customer payments and manage invoices for your business."
      />
      <div className="operator-inline-actions">
        <span className="muted">{isRefreshing ? "Refreshing payment readiness..." : lastUpdatedAt ? "Updated just now" : ready ? "Showing current payment state" : "Loading payment state"}</span>
        <button className="button secondary operator-compact-button" type="button" disabled={isRefreshing || Boolean(busy)} onClick={() => void refreshNow()}>
          Refresh
        </button>
      </div>

      {error ? <div className="alert error">{error}</div> : null}
      {message ? <div className="alert success">{message}</div> : null}

      <section className="operator-section">
        <div className="operator-section__header">
          <div>
            <h2 className="operator-section__title">What do you want to do?</h2>
            <p className="operator-section__subtitle">Choose one task.</p>
          </div>
        </div>
        <div className="settings-premium-grid">
          {[
            ["Accept customer payments", "#customer-payment-methods"],
            ["Invoice settings", "/dashboard/settings?tab=general&section=finance"],
            ["Payment terms", "/dashboard/finance#invoice-records"],
            ["Statements", "/dashboard/finance#statements"],
            ["Refunds", "/dashboard/finance#refunds"],
          ].map(([label, href]) => (
            <a className="integration-card mt-linkCard" href={href} key={label}>
              <strong>{label}</strong>
              <span className="mt-linkCard__action">Open</span>
            </a>
          ))}
        </div>
      </section>

      <section className="operator-section" id="customer-payment-methods" data-testid="payments-hub">
        <div className="operator-section__header">
          <div>
            <h2 className="operator-section__title">Accept customer payments</h2>
            <p className="operator-section__subtitle">Customer deposits, invoice payments, refunds, and trade payments go directly through the provider owned or connected by your business. Platform billing is not a customer payment option.</p>
          </div>
          <OperatorStatusBadge label={ready ? `${counts.connected} connected` : "Loading"} tone={counts.attention ? "warning" : "info"} />
        </div>

        <div className="billing-provider-list">
          {providers.map((provider) => (
            <article className="billing-provider-card" key={provider.provider} data-testid={`payments-provider-${provider.provider}`}>
              <div className="billing-ops-panel__header">
                <div>
                  <p className="muted" style={{ margin: "0 0 4px" }} data-testid={`payments-provider-category-${provider.provider}`}>{PAYMENT_CATEGORIES[provider.provider]}</p>
                  <strong>{providerDisplayName(provider)}</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>{PAYMENT_TYPES[provider.provider]}</p>
                </div>
                <OperatorStatusBadge
                  label={providerStatus(provider).label}
                  tone={providerStatus(provider).tone}
                />
              </div>
              {provider.provider === "stripe-customer-payments" ? (
                <p className="muted" data-testid="stripe-customer-payment-readiness">
                  {provider.summary || "Stripe needs to be verified before customers can pay online."}
                </p>
              ) : null}

              {editing === provider.provider && provider.provider !== "stripe-customer-payments" ? (
                <div className="settings-premium-grid" style={{ marginTop: 12 }} data-testid={`payments-setup-${provider.provider}`}>
                  {provider.provider === "bank-transfer" ? (
                    <>
                      <label>Account holder name<input className="input" value={form.accountName || ""} onChange={(event) => setForm({ ...form, accountName: event.target.value })} /></label>
                      <label>Sort code<input className="input" inputMode="numeric" value={form.sortCode || ""} onChange={(event) => setForm({ ...form, sortCode: event.target.value })} /></label>
                      <label>Account number<input className="input" inputMode="numeric" value={form.accountNumber || ""} onChange={(event) => setForm({ ...form, accountNumber: event.target.value })} /></label>
                      <label>Payment reference format<input className="input" value={form.paymentReference || ""} onChange={(event) => setForm({ ...form, paymentReference: event.target.value })} /></label>
                      <label><input type="checkbox" checked={form.enabled === "yes"} onChange={(event) => setForm({ ...form, enabled: event.target.checked ? "yes" : "" })} /> Show bank transfer on customer invoices and payment requests</label>
                    </>
                  ) : (
                    <>
                      <label>Terminal name<input className="input" value={form.accountReference || ""} onChange={(event) => setForm({ ...form, accountReference: event.target.value })} /></label>
                    </>
                  )}
                  <div className="billing-page-actions">
                    <button className="button" type="button" onClick={() => void save(provider)} disabled={busy === provider.provider} data-testid={`payments-save-${provider.provider}`}>Save setup</button>
                    <button className="button secondary" type="button" onClick={() => setEditing("")}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="billing-page-actions" style={{ marginTop: 12 }}>
                  {["bank-transfer", "manual-card-terminal"].includes(provider.provider) ? (
                    <button className="button secondary" type="button" onClick={() => openSetup(provider)} disabled={!canManage} data-testid={`payments-configure-${provider.provider}`}>
                      {provider.provider === "bank-transfer" ? (provider.connected ? "Manage Bank Details" : "Add Bank Details") : (provider.connected ? "Manage Terminal" : "Add Card Terminal")}
                    </button>
                  ) : null}
                  {provider.provider === "stripe-customer-payments" ? (
                    <button className="button secondary" type="button" onClick={() => void router.push("/dashboard/settings/payments/stripe")} disabled={!canManage} data-testid="payments-fix-stripe">
                      {provider.tenantAction || (provider.readinessState === "ready" ? "Manage Stripe" : "Fix Stripe setup")}
                    </button>
                  ) : null}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}
