import { FormEvent, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorPageHeader, OperatorStatusBadge } from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import {
  emptyPermissionSnapshot,
  hasWorkspacePermission,
  normalizePermissionSnapshot,
} from "../../lib/workspace-permissions";

type DirectoryStatus = "Built in" | "Connected" | "Available" | "Setup required" | "Continue setup" | "Requires external account" | "Limited / Beta" | "Action required" | "Import/export available" | "API/webhook compatible" | "Coming soon" | "Not available";
type AccountingSection = "Recommended" | "Popular accounting" | "Enterprise accounting" | "Flexible connections";
type AccountingFilter = "All" | "Native" | "Available" | "Import & export" | "API & webhooks" | "Coming soon";

type DirectoryCard = {
  key: string;
  group: "Payments" | "Accounting" | "Calendar" | "Communications" | "Maps" | "Storage" | "Automation" | "Identity" | "Developer Tools";
  name: string;
  status: DirectoryStatus;
  description: string;
  action: string;
  href: string;
  testId: string;
  section?: AccountingSection;
  providerIcon?: string;
  secondaryAction?: string;
  secondaryHref?: string;
  filters?: AccountingFilter[];
  primaryMode?: "link" | "details" | "request";
  availableNow?: string[];
  notSupported?: string[];
  setupRequirements?: string[];
  permissions?: string[];
  lastSuccessfulSyncAt?: string | null;
  recentSafeError?: string | null;
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
  lastSuccessfulSyncAt?: string | null;
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
const ACCOUNTING_FILTERS: AccountingFilter[] = ["All", "Native", "Available", "Import & export", "API & webhooks", "Coming soon"];
const ACCOUNTING_SECTIONS: AccountingSection[] = ["Recommended", "Popular accounting", "Enterprise accounting", "Flexible connections"];

function statusTone(status: DirectoryStatus) {
  if (status === "Built in" || status === "Connected" || status === "Available" || status === "Import/export available" || status === "API/webhook compatible") return "success" as const;
  if (status === "Action required" || status === "Setup required" || status === "Continue setup") return "warning" as const;
  return "neutral" as const;
}

function simpleConnectionStatus(status?: ConnectionStatus | null): DirectoryStatus {
  if (status?.connectionState === "needs_reconnect") return "Action required";
  if (status?.connectionState === "select_organisation") return "Continue setup";
  if (status?.connected) return "Connected";
  if (status?.allowed === false || status?.enabled === false) return "Setup required";
  if (!status?.setupAvailable) return "Setup required";
  return "Available";
}

function xeroAction(status?: ConnectionStatus | null) {
  const state = simpleConnectionStatus(status);
  if (state === "Connected") return "Manage";
  if (state === "Continue setup") return "Select organisation";
  if (state === "Action required") return "Reconnect";
  if (state === "Setup required") return "View setup status";
  return "Connect";
}

const CAPABILITY_MATRIX = [
  { row: "Invoices", finance: "Included", xero: "Supported", quickbooks: "Planned", sage: "Planned", custom: "Supported" },
  { row: "Customers/contacts", finance: "Included", xero: "Supported", quickbooks: "Planned", sage: "Planned", custom: "Supported" },
  { row: "Payment status", finance: "Included", xero: "Limited", quickbooks: "Planned", sage: "Planned", custom: "Limited" },
  { row: "Tax data", finance: "Included", xero: "Limited", quickbooks: "Planned", sage: "Planned", custom: "Export only" },
  { row: "Services/items", finance: "Included", xero: "Limited", quickbooks: "Planned", sage: "Planned", custom: "Limited" },
  { row: "Credit notes", finance: "Included", xero: "Not supported", quickbooks: "Planned", sage: "Planned", custom: "Not supported" },
  { row: "Two-way sync", finance: "Included", xero: "Not supported", quickbooks: "Planned", sage: "Planned", custom: "Not supported" },
  { row: "Scheduled sync", finance: "Included", xero: "Not supported", quickbooks: "Planned", sage: "Planned", custom: "Not supported" },
  { row: "CSV export", finance: "Included", xero: "Export only", quickbooks: "Export only", sage: "Export only", custom: "Export only" },
  { row: "API/webhooks", finance: "Included", xero: "Limited", quickbooks: "Limited", sage: "Limited", custom: "Supported" },
];

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
  const [requestMessage, setRequestMessage] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORY_FILTERS)[number]>("All");
  const [accountingFilter, setAccountingFilter] = useState<AccountingFilter>("All");
  const [selectedCard, setSelectedCard] = useState<DirectoryCard | null>(null);
  const [requestCard, setRequestCard] = useState<DirectoryCard | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestForm, setRequestForm] = useState({
    businessReason: "",
    records: "Invoices, customers, payment status",
    syncPreference: "One-way export or sync",
    currentSoftware: "",
    contactPermission: false,
  });

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

    const xeroStatus = simpleConnectionStatus(xero);
    const qboStatus = quickbooks?.connected ? "Connected" : "Coming soon";
    const qboPrimaryMode = quickbooks?.connected ? "link" : "request";
    const qboAction = quickbooks?.connected ? "Manage" : "Request integration";
    const accountingCards: DirectoryCard[] = [
      {
        key: "mytitan-finance",
        group: "Accounting",
        section: "Recommended",
        name: "MyTitan Finance",
        providerIcon: "MF",
        status: "Built in",
        description: "Create invoices, track payments, manage balances, statements, VAT records and payment requests in MyTitan.",
        action: "Open Finance",
        href: "/dashboard/finance",
        secondaryAction: "Finance settings",
        secondaryHref: "/dashboard/settings?section=finance",
        testId: "integration-workspace-row-mytitan-finance",
        filters: ["Native", "Available"],
        availableNow: ["Invoices", "payment requests", "balances", "statements", "VAT record support", "finance reports"],
        notSupported: ["Tax filing", "professional tax advice", "regulated accounting-service claims"],
        primaryMode: "link",
      },
      {
        key: "xero",
        group: "Accounting",
        section: "Recommended",
        name: "Xero",
        providerIcon: "XE",
        status: xeroStatus,
        description: xeroStatus === "Setup required"
          ? "Connect your Xero account after the MyTitan Xero app is activated."
          : "Sync supported accounting records with your selected Xero organisation.",
        action: xeroAction(xero),
        href: "/dashboard/settings/integrations/xero",
        testId: "integration-workspace-row-xero",
        filters: ["Available"],
        availableNow: ["OAuth setup route", "organisation selection", "encrypted token storage", "read-only verification", "mapping preview gate"],
        notSupported: ["Automatic live mutation without explicit activation", "two-way sync", "tax filing"],
        setupRequirements: xeroStatus === "Setup required" ? ["Platform Admin must configure Xero client ID, client secret and redirect URI."] : ["Select the correct Xero organisation before verification completes."],
        permissions: ["Workspace owner or admin", "Accounting feature access"],
        lastSuccessfulSyncAt: xero?.lastSuccessfulSyncAt || null,
        recentSafeError: xeroStatus === "Action required" ? "Stored connection needs reconnect." : null,
        primaryMode: "link",
      },
      {
        key: "quickbooks",
        group: "Accounting",
        section: "Popular accounting",
        name: "QuickBooks",
        providerIcon: "QB",
        status: qboStatus,
        description: quickbooks?.connected
          ? "QuickBooks connection is verified for this workspace."
          : "QuickBooks connection is planned. Use MyTitan Finance, exports, API tokens, or webhooks in the meantime.",
        action: qboAction,
        href: "/dashboard/settings/integrations/quickbooks",
        secondaryAction: quickbooks?.connected ? "Check setup" : "View options",
        secondaryHref: "/dashboard/settings/integrations/quickbooks",
        testId: "integration-workspace-row-quickbooks",
        filters: quickbooks?.connected ? ["Available"] : ["Coming soon", "API & webhooks", "Import & export"],
        availableNow: ["Request integration", "CSV export alternatives", "API tokens", "signed webhooks"],
        notSupported: quickbooks?.connected ? ["Automatic two-way sync"] : ["Tenant OAuth connection in production", "fake Connect action", "delivery date promise"],
        primaryMode: qboPrimaryMode,
      },
      {
        key: "sage",
        group: "Accounting",
        section: "Popular accounting",
        name: "Sage",
        providerIcon: "SA",
        status: "Coming soon",
        description: "Sage connection is planned. Use MyTitan Finance, exports, API tokens, or webhooks in the meantime.",
        action: "Request integration",
        secondaryAction: "View options",
        secondaryHref: "/dashboard/settings/developer-tools",
        href: "/dashboard/integrations?request=sage",
        testId: "integration-workspace-row-sage",
        filters: ["Coming soon", "API & webhooks", "Import & export"],
        availableNow: ["Request integration", "CSV export alternatives", "API tokens", "signed webhooks"],
        notSupported: ["Tenant OAuth connection", "fake Connect action", "delivery date promise"],
        primaryMode: "request",
      },
      ...[
        ["freeagent", "FreeAgent", "FA"],
        ["freshbooks", "FreshBooks", "FB"],
        ["zoho-books", "Zoho Books", "ZB"],
        ["kashflow", "KashFlow", "KF"],
      ].map(([key, name, icon]) => ({
        key,
        group: "Accounting" as const,
        section: "Popular accounting" as const,
        name,
        providerIcon: icon,
        status: "Coming soon" as const,
        description: `${name} connection is not implemented yet. Request it or use MyTitan Finance and developer options.`,
        action: "Request integration",
        href: `/dashboard/integrations?request=${key}`,
        testId: `integration-workspace-row-${key}`,
        filters: ["Coming soon", "API & webhooks", "Import & export"] as AccountingFilter[],
        availableNow: ["Request integration", "CSV export alternatives", "API tokens", "signed webhooks"],
        notSupported: ["Native OAuth connection", "official partnership claim"],
        primaryMode: "request" as const,
      })),
      ...[
        ["dynamics-365-business-central", "Microsoft Dynamics 365 Business Central", "BC"],
        ["netsuite", "NetSuite", "NS"],
        ["sap-business-one", "SAP Business One", "SB"],
        ["oracle-accounting-erp", "Oracle accounting/ERP", "OR"],
        ["myob", "MYOB", "MY"],
      ].map(([key, name, icon]) => ({
        key,
        group: "Accounting" as const,
        section: "Enterprise accounting" as const,
        name,
        providerIcon: icon,
        status: "Coming soon" as const,
        description: `${name} is not implemented as a native connector in this release. Use scoped APIs and signed webhooks for approved external systems.`,
        action: "Request integration",
        href: `/dashboard/integrations?request=${key}`,
        testId: `integration-workspace-row-${key}`,
        filters: ["Coming soon", "API & webhooks"] as AccountingFilter[],
        availableNow: ["Request integration", "API-token guidance", "signed webhook guidance"],
        notSupported: ["Native connector", "two-way sync", "official partnership claim"],
        primaryMode: "request" as const,
      })),
      {
        key: "csv-export",
        group: "Accounting",
        section: "Flexible connections",
        name: "CSV import/export",
        providerIcon: "CSV",
        status: "Import/export available",
        description: "Export supported finance records for accountants or external accounting tools. Imports are not shown unless implemented.",
        action: "Open Finance exports",
        href: "/dashboard/finance",
        testId: "integration-workspace-row-csv-export",
        filters: ["Import & export", "Available"],
        availableNow: ["Invoices", "customers", "finance records", "payment status where recorded", "VAT/tax record support"],
        notSupported: ["Accounting CSV import from this catalogue"],
        primaryMode: "link",
      },
      {
        key: "accounting-api-tokens",
        group: "Accounting",
        section: "Flexible connections",
        name: "API tokens",
        providerIcon: "API",
        status: canManage ? "Available" : "Not available",
        description: "Create scoped API tokens for approved external systems without exposing provider secrets.",
        action: "Manage API tokens",
        href: "/dashboard/settings/developer-tools#api-tokens",
        testId: "integration-workspace-row-accounting-api-tokens",
        filters: ["API & webhooks", "Available"],
        availableNow: ["Reveal-once API tokens", "tenant-scoped access", "audit logging"],
        notSupported: ["Raw provider secret storage in catalogue cards"],
        permissions: ["settings.manage"],
        primaryMode: "link",
      },
      {
        key: "accounting-webhooks",
        group: "Accounting",
        section: "Flexible connections",
        name: "Signed webhooks",
        providerIcon: "WH",
        status: canManage ? "Available" : "Not available",
        description: "Send selected business events to approved external accounting workflows using signed deliveries.",
        action: "Manage webhooks",
        href: "/dashboard/settings/developer-tools#webhooks",
        testId: "integration-workspace-row-accounting-webhooks",
        filters: ["API & webhooks", "Available"],
        availableNow: ["Webhook endpoints", "test delivery", "delivery logs", "retry controls"],
        notSupported: ["Unsigned delivery", "secret values after creation"],
        permissions: ["settings.manage"],
        primaryMode: "link",
      },
      {
        key: "custom-accounting-system",
        group: "Accounting",
        section: "Flexible connections",
        name: "Custom accounting system",
        providerIcon: "CA",
        status: "API/webhook compatible",
        description: "Connect an approved external system using scoped API tokens and signed webhooks.",
        action: "Developer tools",
        href: "/dashboard/settings/developer-tools",
        secondaryAction: "Integration guide",
        secondaryHref: "/dashboard/help?category=integrations",
        testId: "integration-workspace-row-custom-accounting-system",
        filters: ["API & webhooks", "Available"],
        availableNow: ["Scoped API tokens", "signed webhook delivery", "support request path"],
        notSupported: ["Unreviewed external write access", "raw technical configuration in catalogue cards"],
        primaryMode: "link",
      },
    ];

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
      ...accountingCards,
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
      const accountingMatch = card.group !== "Accounting" || accountingFilter === "All" || card.filters?.includes(accountingFilter);
      const searchMatch = !cleanQuery || `${card.name} ${card.description} ${card.group} ${card.section || ""}`.toLowerCase().includes(cleanQuery);
      return categoryMatch && accountingMatch && searchMatch;
    });
  }, [accountingFilter, cards, category, query]);

  const accountingCards = filteredCards.filter((card) => card.group === "Accounting");

  async function submitIntegrationRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestCard || requestBusy) return;
    setRequestBusy(true);
    setRequestMessage("");
    try {
      const response = await apiFetch("/notifications/support-request", {
        method: "POST",
        body: JSON.stringify({
          category: "integrations",
          subject: `Accounting integration request: ${requestCard.name}`,
          message: [
            `Provider: ${requestCard.name}`,
            `Business reason: ${requestForm.businessReason}`,
            `Records to synchronise: ${requestForm.records}`,
            `Sync preference: ${requestForm.syncPreference}`,
            `Current accounting software: ${requestForm.currentSoftware || "Not provided"}`,
            `Contact permission: ${requestForm.contactPermission ? "yes" : "no"}`,
            "No secrets were requested or submitted from this marketplace flow.",
          ].join("\n"),
        }),
      });
      setRequestMessage(response?.message || "Integration request recorded.");
      setRequestCard(null);
      setRequestForm({
        businessReason: "",
        records: "Invoices, customers, payment status",
        syncPreference: "One-way export or sync",
        currentSoftware: "",
        contactPermission: false,
      });
    } catch (nextError: any) {
      setRequestMessage(nextError?.message || "Integration request could not be sent.");
    } finally {
      setRequestBusy(false);
    }
  }

  function cardAction(card: DirectoryCard, disabled: boolean) {
    if (card.primaryMode === "request") {
      return (
        <button className="button" type="button" disabled={disabled} onClick={() => setRequestCard(card)}>
          {card.action}
        </button>
      );
    }
    if (card.primaryMode === "details") {
      return (
        <button className="button" type="button" disabled={disabled} onClick={() => setSelectedCard(card)}>
          {card.action}
        </button>
      );
    }
    return disabled ? (
      <button className="button disabled" type="button" disabled>
        {card.action}
      </button>
    ) : (
      <a className="button" href={card.href}>
        {card.action}
      </a>
    );
  }

  function renderCard(card: DirectoryCard) {
    const disabled = card.status === "Not available" || (card.primaryMode !== "request" && (card.key !== "google-calendar" ? !canManage && !["mytitan-finance", "csv-export", "custom-accounting-system"].includes(card.key) : !canManagePersonal));
    return (
      <article className="integration-card connected-tool-card" key={card.key} data-testid={card.testId}>
        <div className="connected-tool-card__header">
          <span className="connected-tool-card__title">
            <span className="connected-tool-card__icon" aria-hidden="true">{card.providerIcon || card.name.slice(0, 2).toUpperCase()}</span>
            <strong>{card.name}</strong>
          </span>
          <OperatorStatusBadge label={loading ? "Checking" : card.status} tone={statusTone(card.status)} />
        </div>
        <p className="muted">{card.description}</p>
        <div className="billing-page-actions connected-tool-card__actions">
          {cardAction(card, disabled)}
          <button className="button secondary" type="button" onClick={() => setSelectedCard(card)}>Details</button>
          {card.secondaryAction && card.secondaryHref ? <a className="button secondary" href={card.secondaryHref}>{card.secondaryAction}</a> : null}
        </div>
      </article>
    );
  }

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
        <label className="settings-premium-label" htmlFor="connected-tools-query">{category === "Accounting" ? "Search accounting tools" : "Search tools"}</label>
        <input
          id="connected-tools-query"
          className="input settings-premium-input"
          placeholder={category === "Accounting" ? "Search accounting tools..." : "Search payments, Xero, email, webhooks..."}
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
        {(category === "All" || category === "Accounting") ? (
          <div className="settings-tab-grid" style={{ marginTop: 14 }} role="tablist" aria-label="Accounting integration filters">
            {ACCOUNTING_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                className={`tab-button settings-tab-button ${accountingFilter === filter ? "active" : ""}`}
                onClick={() => setAccountingFilter(filter)}
                aria-selected={accountingFilter === filter}
              >
                <strong>{filter}</strong>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div data-testid="integrations-workspace-section" className="connected-tools-directory">
        {(category === "All" || category === "Accounting") && accountingCards.length ? (
          <section className="operator-section" data-testid="connected-tools-group-accounting">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Accounting</h2>
                <p className="operator-section__subtitle">Connect MyTitan with your accounts, or manage invoicing and payments directly in MyTitan.</p>
              </div>
            </div>
            {requestMessage ? <div className="alert info" role="status">{requestMessage}</div> : null}
            {ACCOUNTING_SECTIONS.map((section) => {
              const sectionCards = accountingCards.filter((card) => card.section === section);
              if (!sectionCards.length) return null;
              return (
                <div className="operator-subsection" key={section} data-testid={`accounting-section-${section.toLowerCase().replace(/\s+/g, "-")}`}>
                  <h3>{section.toUpperCase()}</h3>
                  <div className="connected-tools-grid">
                    {sectionCards.map(renderCard)}
                  </div>
                </div>
              );
            })}
            <div className="card settings-premium-card" data-testid="accounting-capability-matrix">
              <h3 style={{ marginTop: 0 }}>Capability matrix</h3>
              <div className="settings-table-scroll">
                <table className="settings-table">
                  <thead>
                    <tr>
                      <th>Capability</th>
                      <th>MyTitan Finance</th>
                      <th>Xero</th>
                      <th>QuickBooks</th>
                      <th>Sage</th>
                      <th>Custom API</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CAPABILITY_MATRIX.map((row) => (
                      <tr key={row.row}>
                        <td>{row.row}</td>
                        <td>{row.finance}</td>
                        <td>{row.xero}</td>
                        <td>{row.quickbooks}</td>
                        <td>{row.sage}</td>
                        <td>{row.custom}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}
        {GROUPS.map((group) => {
          if (group === "Accounting") return null;
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
                {groupCards.map(renderCard)}
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

      {selectedCard ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedCard(null)}>
          <section className="modal-panel accounting-detail-drawer" role="dialog" aria-modal="true" aria-label={`${selectedCard.name} details`} onClick={(event) => event.stopPropagation()} data-testid="accounting-detail-drawer">
            <div className="connected-tool-card__header">
              <h2 style={{ margin: 0 }}>{selectedCard.name}</h2>
              <OperatorStatusBadge label={selectedCard.status} tone={statusTone(selectedCard.status)} />
            </div>
            <p className="muted">{selectedCard.description}</p>
            <div className="settings-tab-grid">
              <div><strong>Available now</strong><p className="muted">{(selectedCard.availableNow || ["No live capability is claimed for this card."]).join(", ")}</p></div>
              <div><strong>Not currently supported</strong><p className="muted">{(selectedCard.notSupported || ["No unsupported items recorded."]).join(", ")}</p></div>
              <div><strong>Setup requirements</strong><p className="muted">{(selectedCard.setupRequirements || ["No additional setup requirement shown in this catalogue."]).join(" ")}</p></div>
              <div><strong>Permissions/scopes</strong><p className="muted">{(selectedCard.permissions || ["Use normal workspace permissions for the linked workflow."]).join(", ")}</p></div>
            </div>
            <p className="muted">Last successful sync: {selectedCard.lastSuccessfulSyncAt || "Not recorded"}</p>
            <p className="muted">Recent safe error: {selectedCard.recentSafeError || "None shown"}</p>
            <div className="billing-page-actions">
              {cardAction(selectedCard, selectedCard.status === "Not available")}
              <button className="button secondary" type="button" onClick={() => setSelectedCard(null)}>Close</button>
            </div>
          </section>
        </div>
      ) : null}

      {requestCard ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setRequestCard(null)}>
          <form className="modal-panel accounting-detail-drawer" role="dialog" aria-modal="true" aria-label={`Request ${requestCard.name}`} onSubmit={submitIntegrationRequest} onClick={(event) => event.stopPropagation()} data-testid="accounting-request-integration-form">
            <h2 style={{ marginTop: 0 }}>Request integration</h2>
            <label>Provider name<input className="input" value={requestCard.name} readOnly /></label>
            <label>Business reason<textarea className="input" minLength={12} required value={requestForm.businessReason} onChange={(event) => setRequestForm((current) => ({ ...current, businessReason: event.target.value }))} /></label>
            <label>Records to synchronise<input className="input" required value={requestForm.records} onChange={(event) => setRequestForm((current) => ({ ...current, records: event.target.value }))} /></label>
            <label>One-way or two-way preference<select className="input" value={requestForm.syncPreference} onChange={(event) => setRequestForm((current) => ({ ...current, syncPreference: event.target.value }))}>
              <option>One-way export or sync</option>
              <option>Two-way preference for future review</option>
              <option>Unsure</option>
            </select></label>
            <label>Current accounting software<input className="input" value={requestForm.currentSoftware} onChange={(event) => setRequestForm((current) => ({ ...current, currentSoftware: event.target.value }))} /></label>
            <label className="settings-checkbox-row"><input type="checkbox" checked={requestForm.contactPermission} onChange={(event) => setRequestForm((current) => ({ ...current, contactPermission: event.target.checked }))} /> MyTitan may contact me about this request.</label>
            <p className="muted">Do not enter passwords, API keys, client secrets, tokens, organisation references, or workspace identifiers.</p>
            <div className="billing-page-actions">
              <button className="button" type="submit" disabled={requestBusy || requestForm.businessReason.trim().length < 12}>{requestBusy ? "Sending..." : "Send request"}</button>
              <button className="button secondary" type="button" onClick={() => setRequestCard(null)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}
    </DashboardShell>
  );
}
