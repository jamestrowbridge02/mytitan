import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorPageHeader, OperatorStatusBadge } from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import {
  emptyPermissionSnapshot,
  hasWorkspacePermission,
  normalizePermissionSnapshot,
} from "../../lib/workspace-permissions";

type DirectoryStatus = "Connected" | "Setup required" | "Needs attention" | "Requires external account" | "Beta" | "Not implemented" | "Not available";

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

function statusTone(status: DirectoryStatus) {
  if (status === "Connected") return "success" as const;
  if (status === "Needs attention") return "warning" as const;
  return "neutral" as const;
}

function simpleConnectionStatus(status?: ConnectionStatus | null): DirectoryStatus {
  if (status?.connectionState === "needs_reconnect") return "Needs attention";
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
        : "Needs attention";
    const stripeDescription = stripeStatus === "Connected"
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
        description: "Foundation exists for business-owned payment setup. Provider account and credentials are required before checkout can be enabled.",
        action: "Review payment setup",
        href: "/dashboard/settings/payments?provider=sumup",
        testId: "integration-workspace-row-sumup",
      },
      {
        key: "square",
        group: "Payments",
        name: "Square",
        status: "Requires external account",
        description: "Provider credentials and webhook evidence are required before MyTitan can mark Square ready.",
        action: "Review payment setup",
        href: "/dashboard/settings/payments?provider=square",
        testId: "integration-workspace-row-square",
      },
      {
        key: "paypal-business",
        group: "Payments",
        name: "PayPal",
        status: "Requires external account",
        description: "PayPal remains setup-gated until a business account, credentials, webhook signing, and payment canary are verified.",
        action: "Review payment setup",
        href: "/dashboard/settings/payments?provider=paypal-business",
        testId: "integration-workspace-row-paypal",
      },
      {
        key: "zettle",
        group: "Payments",
        name: "Zettle",
        status: "Requires external account",
        description: "Zettle can be tracked as a business-owned provider, but live readiness requires external provider evidence.",
        action: "Review payment setup",
        href: "/dashboard/settings/payments?provider=zettle",
        testId: "integration-workspace-row-zettle",
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
        key: "sage",
        group: "Accounting",
        name: "Sage",
        status: "Requires external account",
        description: "Sage is a setup foundation. OAuth/app registration and tenant mapping evidence are required before sync is available.",
        action: "Review Sage setup",
        href: "/dashboard/settings/integrations/sage",
        testId: "integration-workspace-row-sage",
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
        key: "microsoft-calendar",
        group: "Calendar",
        name: "Microsoft 365 Calendar",
        status: "Requires external account",
        description: "Microsoft calendar sync requires Entra app registration and tenant consent before appointments can sync.",
        action: "Review calendar setup",
        href: "/dashboard/settings/integrations/microsoft-calendar",
        testId: "integration-workspace-row-microsoft-calendar",
      },
      {
        key: "email-sender",
        group: "Communications",
        name: "Email sender",
        status: email?.needsReauth ? "Needs attention" : email?.connected ? "Connected" : "Setup required",
        description: "Send customer messages from your business address.",
        action: "Configure Email",
        href: "/dashboard/settings?tab=messages&section=notifications-email",
        testId: "integration-workspace-row-email",
      },
      ...(whatsapp?.connected ? [{
        key: "whatsapp-business",
        group: "Communications" as const,
        name: "WhatsApp Business",
        status: whatsapp.needsReauth ? "Needs attention" as const : "Connected" as const,
        description: "Send supported customer updates through WhatsApp Business.",
        action: "Manage WhatsApp",
        href: "/dashboard/settings?tab=messages&section=notifications",
        testId: "integration-workspace-row-whatsapp-business",
      }] : []),
      ...(!whatsapp?.connected ? [{
        key: "twilio-sms",
        group: "Communications" as const,
        name: "Twilio SMS",
        status: "Requires external account" as const,
        description: "SMS delivery requires a configured gateway, consent rules, delivery logs, and cost controls before use.",
        action: "Review message setup",
        href: "/dashboard/settings?tab=messages&section=notifications",
        testId: "integration-workspace-row-twilio-sms",
      }, {
        key: "whatsapp-business-foundation",
        group: "Communications" as const,
        name: "WhatsApp Business",
        status: "Requires external account" as const,
        description: "WhatsApp Business requires provider credentials and webhook verification before it can be marked connected.",
        action: "Review WhatsApp setup",
        href: "/dashboard/settings/integrations/whatsapp-business",
        testId: "integration-workspace-row-whatsapp-business-foundation",
      }] : []),
      {
        key: "maps-directions",
        group: "Maps",
        name: "Provider-neutral directions",
        status: "Beta",
        description: "Safe Google, Apple, and provider-neutral directions links can open from saved addresses. Traffic-aware optimisation still needs a configured maps provider.",
        action: "Open scheduling",
        href: "/dashboard/scheduling",
        testId: "integration-workspace-row-directions",
      },
      {
        key: "google-maps",
        group: "Maps",
        name: "Google Maps",
        status: "Requires external account",
        description: "Travel times, geocoding, and live map views require a configured maps provider key and provider evidence.",
        action: "Review maps readiness",
        href: "/dashboard/enterprise#maps",
        testId: "integration-workspace-row-google-maps",
      },
      {
        key: "onedrive",
        group: "Storage",
        name: "OneDrive",
        status: "Not implemented",
        description: "External document storage is not active. Files remain in MyTitan storage until a provider-backed connector is implemented and verified.",
        action: "View documents",
        href: "/dashboard/settings/documents-numbering",
        testId: "integration-workspace-row-onedrive",
      },
      {
        key: "google-drive",
        group: "Storage",
        name: "Google Drive",
        status: "Not implemented",
        description: "Google Drive export is not live. Provider credentials and sync boundaries are required before activation.",
        action: "View documents",
        href: "/dashboard/settings/documents-numbering",
        testId: "integration-workspace-row-google-drive",
      },
      {
        key: "dropbox",
        group: "Storage",
        name: "Dropbox",
        status: "Not implemented",
        description: "Dropbox storage is not implemented and is not shown as connected.",
        action: "View documents",
        href: "/dashboard/settings/documents-numbering",
        testId: "integration-workspace-row-dropbox",
      },
      {
        key: "zapier",
        group: "Automation",
        name: "Zapier",
        status: canManage ? "Beta" : "Not available",
        description: "Use scoped API keys and signed webhooks as the safe foundation for Zapier automation.",
        action: "Open Developer Tools",
        href: "/dashboard/settings/developer-tools#webhooks",
        testId: "integration-workspace-row-zapier",
      },
      {
        key: "make",
        group: "Automation",
        name: "Make",
        status: canManage ? "Beta" : "Not available",
        description: "Use signed webhooks and scoped API keys for Make scenarios. No provider-specific app claim is made.",
        action: "Open Developer Tools",
        href: "/dashboard/settings/developer-tools#webhooks",
        testId: "integration-workspace-row-make",
      },
      {
        key: "n8n",
        group: "Automation",
        name: "n8n",
        status: canManage ? "Beta" : "Not available",
        description: "Self-hosted automation can connect through scoped API keys and signed webhooks.",
        action: "Open Developer Tools",
        href: "/dashboard/settings/developer-tools#api-tokens",
        testId: "integration-workspace-row-n8n",
      },
      {
        key: "google-sign-in",
        group: "Identity",
        name: "Google sign-in",
        status: "Not implemented",
        description: "Password login remains authoritative. Google sign-in needs OAuth registration, account linking, and security review before launch.",
        action: "Review security",
        href: "/dashboard/compliance",
        testId: "integration-workspace-row-google-sign-in",
      },
      {
        key: "microsoft-entra",
        group: "Identity",
        name: "Microsoft Entra ID",
        status: "Not implemented",
        description: "Enterprise SSO is a readiness item, not a live login path.",
        action: "Review security",
        href: "/dashboard/compliance",
        testId: "integration-workspace-row-entra",
      },
      {
        key: "saml-okta",
        group: "Identity",
        name: "SAML / Okta",
        status: "Not implemented",
        description: "SAML/Okta requires enterprise identity design, metadata exchange, and tenant-level enforcement before use.",
        action: "Review security",
        href: "/dashboard/compliance",
        testId: "integration-workspace-row-saml-okta",
      },
      {
        key: "api-tokens",
        group: "Developer Tools",
        name: "API tokens",
        status: canManage ? "Connected" : "Not available",
        description: "Create secure tokens for approved external systems.",
        action: "Manage Tokens",
        href: "/dashboard/settings/developer-tools#api-tokens",
        testId: "integration-developer-api-tokens",
      },
      {
        key: "webhooks",
        group: "Developer Tools",
        name: "Webhooks",
        status: canManage ? "Connected" : "Not available",
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
