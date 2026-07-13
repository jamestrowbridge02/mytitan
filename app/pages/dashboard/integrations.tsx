import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorPageHeader, OperatorStatusBadge } from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import {
  emptyPermissionSnapshot,
  hasWorkspacePermission,
  normalizePermissionSnapshot,
} from "../../lib/workspace-permissions";

type DirectoryStatus = "Connected" | "Available" | "Setup required" | "Requires external account" | "Limited / Beta" | "Action required" | "Not available";

type DirectoryCard = {
  key: string;
  group: "Payments" | "Accounting" | "Calendar" | "Communications" | "Maps" | "Storage" | "Automation" | "Identity" | "Developer Tools";
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
  "Maps",
  "Storage",
  "Automation",
  "Identity",
  "Developer Tools",
];
const CATEGORY_FILTERS = ["All", ...GROUPS] as const;

function statusTone(status: DirectoryStatus) {
  if (status === "Connected") return "success" as const;
  if (status === "Action required" || status === "Setup required") return "warning" as const;
  return "neutral" as const;
}

function simpleConnectionStatus(status?: ConnectionStatus | null): DirectoryStatus {
  if (status?.connectionState === "needs_reconnect") return "Action required";
  if (status?.connected) return "Connected";
  if (!status?.setupAvailable || status.allowed === false || status.enabled === false) return "Not available";
  return "Setup required";
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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORY_FILTERS)[number]>("All");

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
      ? "Connected"
      : stripe?.readinessState === "not_connected"
        ? "Setup required"
        : "Action required";
    const stripeDescription = stripeStatus === "Connected"
      ? "Customers can pay deposits online."
      : "Finish Stripe setup before online card payments are offered.";
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
        action: stripeStatus === "Connected" ? "Manage Stripe" : "Fix Stripe setup",
        href: "/dashboard/settings/payments/stripe",
        testId: "integration-workspace-row-stripe",
      },
      {
        key: "bank-transfer",
        group: "Payments",
        name: "Bank transfer",
        status: bank?.connected ? "Connected" : "Setup required",
        description: "Add bank details for invoices and payment requests.",
        action: bank?.connected ? "Manage Bank Details" : "Add Bank Details",
        href: "/dashboard/settings/payments?provider=bank-transfer",
        testId: "integration-workspace-row-bank-transfer",
      },
      {
        key: "manual-card-terminal",
        group: "Payments",
        name: "Manual card terminal",
        status: terminal?.connected ? "Connected" : "Setup required",
        description: "Record payments collected through your own card terminal.",
        action: terminal?.connected ? "Manage Terminal" : "Configure Terminal",
        href: "/dashboard/settings/payments?provider=manual-card-terminal",
        testId: "integration-workspace-row-manual-card-terminal",
      },
      {
        key: "sumup",
        group: "Payments",
        name: "SumUp",
        status: "Requires external account",
        description: "Connect a supported business-owned SumUp account before taking payments.",
        action: "View payment options",
        href: "/dashboard/settings/payments?provider=sumup",
        testId: "integration-workspace-row-sumup",
      },
      {
        key: "square",
        group: "Payments",
        name: "Square",
        status: "Requires external account",
        description: "Connect a supported business-owned Square account before taking payments.",
        action: "View payment options",
        href: "/dashboard/settings/payments?provider=square",
        testId: "integration-workspace-row-square",
      },
      {
        key: "paypal-business",
        group: "Payments",
        name: "PayPal",
        status: "Requires external account",
        description: "Connect a supported business-owned PayPal account before taking payments.",
        action: "View payment options",
        href: "/dashboard/settings/payments?provider=paypal-business",
        testId: "integration-workspace-row-paypal",
      },
      {
        key: "zettle",
        group: "Payments",
        name: "Zettle",
        status: "Requires external account",
        description: "Connect a supported business-owned Zettle account before taking payments.",
        action: "View payment options",
        href: "/dashboard/settings/payments?provider=zettle",
        testId: "integration-workspace-row-zettle",
      },
      {
        key: "xero",
        group: "Accounting",
        name: "Xero",
        status: simpleConnectionStatus(xero),
        description: "Connect your accounts so invoices can sync when ready.",
        action: xero?.connected ? "Manage Xero" : simpleConnectionStatus(xero) === "Not available" ? "Learn more" : "Connect Xero",
        href: "/dashboard/settings/integrations/xero",
        testId: "integration-workspace-row-xero",
      },
      {
        key: "quickbooks",
        group: "Accounting",
        name: "QuickBooks",
        status: simpleConnectionStatus(quickbooks),
        description: "Connect your accounts so invoices can sync when ready.",
        action: quickbooks?.connected ? "Manage QuickBooks" : simpleConnectionStatus(quickbooks) === "Not available" ? "Learn more" : "Connect QuickBooks",
        href: "/dashboard/settings/integrations/quickbooks",
        testId: "integration-workspace-row-quickbooks",
      },
      {
        key: "sage",
        group: "Accounting",
        name: "Sage",
        status: "Not available",
        description: "Sage sync is not available yet.",
        action: "Learn more",
        href: "/dashboard/settings/integrations/sage",
        testId: "integration-workspace-row-sage",
      },
      {
        key: "google-calendar",
        group: "Calendar",
        name: "Google Calendar",
        status: simpleConnectionStatus(google),
        description: "Keep supported appointments connected to your calendar.",
        action: google?.connected ? "Manage" : simpleConnectionStatus(google) === "Not available" ? "Learn more" : "Connect",
        href: "/dashboard/settings/integrations/google-calendar",
        testId: "integration-personal-row-google",
      },
      {
        key: "microsoft-calendar",
        group: "Calendar",
        name: "Microsoft 365 Calendar",
        status: "Not available",
        description: "Microsoft calendar sync is not available yet.",
        action: "Learn more",
        href: "/dashboard/settings/integrations/microsoft-calendar",
        testId: "integration-workspace-row-microsoft-calendar",
      },
      {
        key: "email-sender",
        group: "Communications",
        name: "Email sender",
        status: email?.needsReauth ? "Action required" : email?.connected ? "Connected" : "Available",
        description: "Send customer messages with MyTitan email delivery.",
        action: email?.connected ? "Manage" : "Set up",
        href: "/dashboard/settings?tab=messages&section=notifications-email",
        testId: "integration-workspace-row-email",
      },
      ...(whatsapp?.connected ? [{
        key: "whatsapp-business",
        group: "Communications" as const,
        name: "WhatsApp Business",
        status: whatsapp.needsReauth ? "Action required" as const : "Connected" as const,
        description: "Send supported customer updates through WhatsApp Business.",
        action: "Manage WhatsApp",
        href: "/dashboard/settings?tab=messages&section=notifications",
        testId: "integration-workspace-row-whatsapp-business",
      }] : []),
      ...(!whatsapp?.connected ? [{
        key: "twilio-sms",
        group: "Communications" as const,
        name: "Twilio SMS",
        status: "Setup required" as const,
        description: "Set up SMS before sending customer text messages.",
        action: "Set up",
        href: "/dashboard/settings?tab=messages&section=notifications",
        testId: "integration-workspace-row-twilio-sms",
      }, {
        key: "whatsapp-business-foundation",
        group: "Communications" as const,
        name: "WhatsApp Business",
        status: "Setup required" as const,
        description: "Set up WhatsApp Business before sending customer updates.",
        action: "Set up",
        href: "/dashboard/settings/integrations/whatsapp-business",
        testId: "integration-workspace-row-whatsapp-business-foundation",
      }] : []),
      {
        key: "maps-directions",
        group: "Maps",
        name: "Provider-neutral directions",
        status: "Limited / Beta",
        description: "Open directions from saved addresses.",
        action: "Open scheduling",
        href: "/dashboard/scheduling",
        testId: "integration-workspace-row-directions",
      },
      {
        key: "google-maps",
        group: "Maps",
        name: "Google Maps",
        status: "Not available",
        description: "Advanced maps and travel-time features are not yet available.",
        action: "Learn more",
        href: "/dashboard/enterprise#maps",
        testId: "integration-workspace-row-google-maps",
      },
      {
        key: "onedrive",
        group: "Storage",
        name: "OneDrive",
        status: "Not available",
        description: "External document storage is not yet available.",
        action: "View documents",
        href: "/dashboard/settings/documents-numbering",
        testId: "integration-workspace-row-onedrive",
      },
      {
        key: "google-drive",
        group: "Storage",
        name: "Google Drive",
        status: "Not available",
        description: "Google Drive storage is not yet available.",
        action: "View documents",
        href: "/dashboard/settings/documents-numbering",
        testId: "integration-workspace-row-google-drive",
      },
      {
        key: "dropbox",
        group: "Storage",
        name: "Dropbox",
        status: "Not available",
        description: "Dropbox storage is not yet available.",
        action: "View documents",
        href: "/dashboard/settings/documents-numbering",
        testId: "integration-workspace-row-dropbox",
      },
      {
        key: "zapier",
        group: "Automation",
        name: "Zapier",
        status: canManage ? "Limited / Beta" : "Not available",
        description: "Connect approved automations using API tokens and webhooks.",
        action: "Open Developer Tools",
        href: "/dashboard/settings/developer-tools#webhooks",
        testId: "integration-workspace-row-zapier",
      },
      {
        key: "make",
        group: "Automation",
        name: "Make",
        status: canManage ? "Limited / Beta" : "Not available",
        description: "Connect approved scenarios using API tokens and webhooks.",
        action: "Open Developer Tools",
        href: "/dashboard/settings/developer-tools#webhooks",
        testId: "integration-workspace-row-make",
      },
      {
        key: "n8n",
        group: "Automation",
        name: "n8n",
        status: canManage ? "Limited / Beta" : "Not available",
        description: "Self-hosted automation can connect through scoped API keys and signed webhooks.",
        action: "Open Developer Tools",
        href: "/dashboard/settings/developer-tools#api-tokens",
        testId: "integration-workspace-row-n8n",
      },
      {
        key: "google-sign-in",
        group: "Identity",
        name: "Google sign-in",
        status: "Not available",
        description: "Google sign-in is not yet available.",
        action: "Learn more",
        href: "/dashboard/compliance",
        testId: "integration-workspace-row-google-sign-in",
      },
      {
        key: "microsoft-entra",
        group: "Identity",
        name: "Microsoft Entra ID",
        status: "Not available",
        description: "Microsoft SSO is not yet available.",
        action: "Learn more",
        href: "/dashboard/compliance",
        testId: "integration-workspace-row-entra",
      },
      {
        key: "saml-okta",
        group: "Identity",
        name: "SAML / Okta",
        status: "Not available",
        description: "SAML and Okta SSO are not yet available.",
        action: "Learn more",
        href: "/dashboard/compliance",
        testId: "integration-workspace-row-saml-okta",
      },
      {
        key: "api-tokens",
        group: "Developer Tools",
        name: "API tokens",
        status: canManage ? "Connected" : "Not available",
        description: "Create secure tokens for approved external systems.",
        action: "Manage",
        href: "/dashboard/settings/developer-tools#api-tokens",
        testId: "integration-developer-api-tokens",
      },
      {
        key: "webhooks",
        group: "Developer Tools",
        name: "Webhooks",
        status: canManage ? "Connected" : "Not available",
        description: "Send selected business events to approved external systems.",
        action: "Manage",
        href: "/dashboard/settings/developer-tools#webhooks",
        testId: "integration-developer-webhooks",
      },
    ];
  }, [byogByProvider, canManage, google, quickbooks, stripe, xero]);

  const filteredCards = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return cards.filter((card) => {
      const categoryMatch = category === "All" || card.group === category;
      const searchMatch = !cleanQuery || `${card.name} ${card.description} ${card.group}`.toLowerCase().includes(cleanQuery);
      return categoryMatch && searchMatch;
    });
  }, [cards, category, query]);

  return (
    <DashboardShell>
      <OperatorPageHeader
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

      <div className="card settings-premium-card" data-testid="connected-tools-search">
        <label className="settings-premium-label" htmlFor="connected-tools-query">Search tools</label>
        <input
          id="connected-tools-query"
          className="input settings-premium-input"
          placeholder="Search payments, Xero, email, webhooks..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="settings-tab-grid" style={{ marginTop: 14 }} role="tablist" aria-label="Connected tool categories">
          {CATEGORY_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`tab-button settings-tab-button ${category === filter ? "active" : ""}`}
              onClick={() => setCategory(filter)}
              aria-selected={category === filter}
            >
              <strong>{filter}</strong>
            </button>
          ))}
        </div>
      </div>

      <div data-testid="integrations-workspace-section" className="connected-tools-directory">
        {GROUPS.map((group) => {
          const groupCards = filteredCards.filter((card) => card.group === group);
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
        {!filteredCards.length ? (
          <div className="card settings-premium-card" data-testid="connected-tools-empty">
            <h2 style={{ marginTop: 0 }}>No tools match this search</h2>
            <button className="button secondary" type="button" onClick={() => {
              setQuery("");
              setCategory("All");
            }}>Clear search</button>
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}
