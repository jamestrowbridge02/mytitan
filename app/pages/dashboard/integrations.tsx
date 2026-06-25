import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorPageHeader, OperatorStatusBadge } from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import {
  emptyPermissionSnapshot,
  hasWorkspacePermission,
  normalizePermissionSnapshot,
} from "../../lib/workspace-permissions";

type DirectoryStatus = "Ready" | "Needs setup" | "Needs attention" | "Not available";

type DirectoryCard = {
  key: string;
  group: "Payments" | "Accounting" | "Calendar" | "Communications" | "Developer Tools";
  name: string;
  status: DirectoryStatus;
  description: string;
  action: string;
  href: string;
  testId: string;
};

type ByogRow = {
  provider: string;
  providerKey: string;
  advancedProviderName: string;
  connected: boolean;
  needsReauth: boolean;
  status: string;
  metadata?: Record<string, unknown>;
};

type ConnectionStatus = {
  connected?: boolean;
  connectionState?: string;
  setupAvailable?: boolean;
  allowed?: boolean;
  enabled?: boolean;
};

type StripeReadiness = {
  readinessState?: "not_connected" | "needs_setup" | "needs_attention" | "ready";
  checkoutEligible?: boolean;
  summary?: string;
  tenantAction?: string;
};

const GROUPS: DirectoryCard["group"][] = [
  "Payments",
  "Accounting",
  "Calendar",
  "Communications",
  "Developer Tools",
];

function statusTone(status: DirectoryStatus) {
  if (status === "Ready") return "success" as const;
  if (status === "Needs attention") return "warning" as const;
  return "neutral" as const;
}

function simpleConnectionStatus(status?: ConnectionStatus | null): DirectoryStatus {
  if (status?.connectionState === "needs_reconnect") return "Needs attention";
  if (status?.connected) return "Ready";
  if (!status?.setupAvailable || status.allowed === false || status.enabled === false) return "Not available";
  return "Needs setup";
}

export default function IntegrationsPage() {
  const [permissions, setPermissions] = useState(emptyPermissionSnapshot());
  const [role, setRole] = useState("");
  const [byog, setByog] = useState<ByogRow[]>([]);
  const [stripe, setStripe] = useState<StripeReadiness | null>(null);
  const [xero, setXero] = useState<ConnectionStatus | null>(null);
  const [quickbooks, setQuickbooks] = useState<ConnectionStatus | null>(null);
  const [google, setGoogle] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canManage = hasWorkspacePermission(permissions, "settings.manage");
  const canManagePersonal = !["VIEWER", "READ_ONLY"].includes(role);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      apiFetch("/me"),
      apiFetch("/integrations/byog").catch(() => []),
      apiFetch("/billing/customer-payment-readiness").catch(() => ({ providers: [] })),
      apiFetch("/integrations/xero/status").catch(() => null),
      apiFetch("/integrations/qbo/status").catch(() => null),
      apiFetch("/integrations/google/status").catch(() => null),
    ]).then(([me, rows, readiness, xeroStatus, qboStatus, googleStatus]) => {
      if (cancelled) return;
      setPermissions(normalizePermissionSnapshot(me?.permissions));
      setRole(String(me?.role || ""));
      setByog(Array.isArray(rows) ? rows : []);
      setStripe(
        (Array.isArray(readiness?.providers) ? readiness.providers : [])
          .find((provider: any) => provider.provider === "stripe-connect") || null,
      );
      setXero(xeroStatus);
      setQuickbooks(qboStatus);
      setGoogle(googleStatus);
      setLoading(false);
    }).catch((nextError: any) => {
      if (cancelled) return;
      setError(nextError?.message || "Connected tools could not be loaded.");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const byogByProvider = useMemo(
    () => new Map(byog.map((row) => [row.provider, row])),
    [byog],
  );

  const cards = useMemo<DirectoryCard[]>(() => {
    const stripeStatus: DirectoryStatus = stripe?.readinessState === "ready" && stripe.checkoutEligible
      ? "Ready"
      : stripe?.readinessState === "not_connected"
        ? "Needs setup"
        : "Needs attention";
    const stripeDescription = stripeStatus === "Ready"
      ? "Customers can pay deposits online."
      : "Stripe needs to be verified before customers can pay deposits online.";
    const bank = byogByProvider.get("bank-transfer");
    const terminal = byogByProvider.get("manual-card-terminal");
    const email = byogByProvider.get("workspace-sender") || byogByProvider.get("email-sender");
    const whatsapp = byogByProvider.get("whatsapp-business");

    return [
      {
        key: "stripe",
        group: "Payments",
        name: "Stripe",
        status: stripeStatus,
        description: stripeDescription,
        action: stripeStatus === "Ready" ? "Manage Stripe" : "Fix Stripe setup",
        href: "/dashboard/settings/payments/stripe",
        testId: "integration-workspace-row-stripe",
      },
      {
        key: "bank-transfer",
        group: "Payments",
        name: "Bank transfer",
        status: bank?.connected ? "Ready" : "Needs setup",
        description: "Add bank details for invoices and payment requests.",
        action: bank?.connected ? "Manage Bank Details" : "Add Bank Details",
        href: "/dashboard/settings/payments?provider=bank-transfer",
        testId: "integration-workspace-row-bank-transfer",
      },
      {
        key: "manual-card-terminal",
        group: "Payments",
        name: "Manual card terminal",
        status: terminal?.connected ? "Ready" : "Needs setup",
        description: "Record payments collected through your own card terminal.",
        action: terminal?.connected ? "Manage Terminal" : "Configure Terminal",
        href: "/dashboard/settings/payments?provider=manual-card-terminal",
        testId: "integration-workspace-row-manual-card-terminal",
      },
      {
        key: "xero",
        group: "Accounting",
        name: "Xero",
        status: simpleConnectionStatus(xero),
        description: "Connect your accounts so invoices can sync when ready.",
        action: xero?.connected ? "Manage Xero" : "Connect Xero",
        href: "/dashboard/settings/integrations/xero",
        testId: "integration-workspace-row-xero",
      },
      {
        key: "quickbooks",
        group: "Accounting",
        name: "QuickBooks",
        status: simpleConnectionStatus(quickbooks),
        description: "Connect your accounts so invoices can sync when ready.",
        action: quickbooks?.connected ? "Manage QuickBooks" : "Connect QuickBooks",
        href: "/dashboard/settings/integrations/quickbooks",
        testId: "integration-workspace-row-quickbooks",
      },
      {
        key: "google-calendar",
        group: "Calendar",
        name: "Google Calendar",
        status: simpleConnectionStatus(google),
        description: "Keep supported appointments connected to your calendar.",
        action: google?.connected ? "Manage Calendar" : "Connect Google Calendar",
        href: "/dashboard/settings/integrations/google-calendar",
        testId: "integration-personal-row-google",
      },
      {
        key: "email-sender",
        group: "Communications",
        name: "Email sender",
        status: email?.needsReauth ? "Needs attention" : email?.connected ? "Ready" : "Needs setup",
        description: "Send customer messages from your business address.",
        action: "Configure Email",
        href: "/dashboard/settings?tab=messages&section=notifications-email",
        testId: "integration-workspace-row-email",
      },
      ...(whatsapp?.connected ? [{
        key: "whatsapp-business",
        group: "Communications" as const,
        name: "WhatsApp Business",
        status: whatsapp.needsReauth ? "Needs attention" as const : "Ready" as const,
        description: "Send supported customer updates through WhatsApp Business.",
        action: "Manage WhatsApp",
        href: "/dashboard/settings?tab=messages&section=notifications",
        testId: "integration-workspace-row-whatsapp-business",
      }] : []),
      {
        key: "api-tokens",
        group: "Developer Tools",
        name: "API tokens",
        status: canManage ? "Ready" : "Not available",
        description: "Create secure tokens for approved external systems.",
        action: "Manage Tokens",
        href: "/dashboard/settings/developer-tools#api-tokens",
        testId: "integration-developer-api-tokens",
      },
      {
        key: "webhooks",
        group: "Developer Tools",
        name: "Webhooks",
        status: canManage ? "Ready" : "Not available",
        description: "Send selected business events to approved external systems.",
        action: "Manage Webhooks",
        href: "/dashboard/settings/developer-tools#webhooks",
        testId: "integration-developer-webhooks",
      },
    ];
  }, [byogByProvider, canManage, google, quickbooks, stripe, xero]);

  return (
    <DashboardShell>
      <OperatorPageHeader
        eyebrow="Settings"
        title="Connected tools"
        subtitle="Connect the services your business uses and go straight to the next setup action."
        actions={[
          { label: "Payments & Invoices", href: "/dashboard/settings/payments", variant: "secondary" },
          ...(canManage ? [{ label: "Developer Tools", href: "/dashboard/settings/developer-tools", variant: "secondary" as const }] : []),
        ]}
      />

      {error ? <div className="alert error" role="alert">{error}</div> : null}
      {!canManage && !loading ? (
        <div className="card" data-testid="integrations-governance-readonly">
          <strong>Read-only access</strong>
          <p className="muted" style={{ marginBottom: 0 }}>An owner or admin can change workspace connections.</p>
        </div>
      ) : null}

      <div data-testid="integrations-workspace-section" className="connected-tools-directory">
        {GROUPS.map((group) => {
          const groupCards = cards.filter((card) => card.group === group);
          if (!groupCards.length || (group === "Developer Tools" && !canManage)) return null;
          return (
            <section className="operator-section" key={group} data-testid={`connected-tools-group-${group.toLowerCase().replace(/\s+/g, "-")}`}>
              <div className="operator-section__header">
                <div>
                  <h2 className="operator-section__title">{group}</h2>
                  <p className="operator-section__subtitle">
                    {group === "Developer Tools" ? "Technical connections for approved external systems." : `Manage your ${group.toLowerCase()} connections.`}
                  </p>
                </div>
              </div>
              <div className="connected-tools-grid">
                {groupCards.map((card) => {
                  const disabled = card.status === "Not available" || (card.key !== "google-calendar" ? !canManage : !canManagePersonal);
                  return (
                    <article className="integration-card connected-tool-card" key={card.key} data-testid={card.testId}>
                      <div className="connected-tool-card__header">
                        <strong>{card.name}</strong>
                        <OperatorStatusBadge label={loading ? "Checking" : card.status} tone={statusTone(card.status)} />
                      </div>
                      <p className="muted">{card.description}</p>
                      {disabled ? (
                        <button className="button disabled" type="button" disabled>
                          {card.action}
                        </button>
                      ) : (
                        <a className="button" href={card.href}>
                          {card.action}
                        </a>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </DashboardShell>
  );
}
