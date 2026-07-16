import { FormEvent, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorPageHeader, OperatorStatusBadge } from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import {
  emptyPermissionSnapshot,
  hasWorkspacePermission,
  normalizePermissionSnapshot,
} from "../../lib/workspace-permissions";

type DirectoryStatus = "Built in" | "Connected" | "Available" | "Setup required" | "Continue setup" | "Requires external account" | "Limited / Beta" | "Action required" | "Native" | "Connect now" | "API connection" | "Webhook connection" | "File exchange" | "Calendar standard" | "Payment link" | "Manual collection" | "Built in alternative";
type AccountingSection = "Recommended" | "Popular accounting" | "Enterprise accounting" | "Flexible connections";
type ConnectionFilter = "All" | "Built in" | "Native" | "Connect now" | "API" | "Webhooks" | "File exchange" | "Calendar standard" | "Manual" | "Connected";

type DirectoryCard = {
  key: string;
  group: "Payments" | "Accounting" | "Calendar" | "Communications" | "Storage" | "Automation" | "CRM" | "Identity" | "Developer";
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
  filters?: ConnectionFilter[];
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

const GROUPS: DirectoryCard["group"][] = ["Payments", "Accounting", "Calendar", "Communications", "Storage", "Automation", "CRM", "Identity", "Developer"];
const CATEGORY_FILTERS = ["All", ...GROUPS] as const;
const CONNECTION_FILTERS: ConnectionFilter[] = ["All", "Built in", "Native", "Connect now", "API", "Webhooks", "File exchange", "Calendar standard", "Manual", "Connected"];
const ACCOUNTING_SECTIONS: AccountingSection[] = ["Recommended", "Popular accounting", "Enterprise accounting", "Flexible connections"];

function statusTone(status: DirectoryStatus) {
  if (status === "Built in" || status === "Connected" || status === "Available" || status === "Native" || status === "Connect now" || status === "API connection" || status === "Webhook connection" || status === "File exchange" || status === "Calendar standard" || status === "Payment link" || status === "Manual collection" || status === "Built in alternative") return "success" as const;
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
  { row: "Invoices", finance: "Included", xero: "Supported", quickbooks: "Limited", sage: "Export only", custom: "Supported" },
  { row: "Customers/contacts", finance: "Included", xero: "Supported", quickbooks: "Limited", sage: "Export only", custom: "Supported" },
  { row: "Payment status", finance: "Included", xero: "Limited", quickbooks: "Limited", sage: "Export only", custom: "Limited" },
  { row: "Tax data", finance: "Included", xero: "Limited", quickbooks: "Export only", sage: "Export only", custom: "Export only" },
  { row: "Services/items", finance: "Included", xero: "Limited", quickbooks: "Limited", sage: "Export only", custom: "Limited" },
  { row: "Credit notes", finance: "Included", xero: "Not supported", quickbooks: "Not supported", sage: "Not supported", custom: "Not supported" },
  { row: "Two-way sync", finance: "Included", xero: "Not supported", quickbooks: "Not supported", sage: "Not supported", custom: "Not supported" },
  { row: "Scheduled sync", finance: "Included", xero: "Not supported", quickbooks: "Not supported", sage: "Not supported", custom: "Not supported" },
  { row: "CSV export", finance: "Included", xero: "Export only", quickbooks: "Export only", sage: "Export only", custom: "Export only" },
  { row: "API/webhooks", finance: "Included", xero: "Limited", quickbooks: "Limited", sage: "Limited", custom: "Supported" },
];

const ACCOUNTING_API_PROVIDERS = [
  ["quickbooks", "QuickBooks", "QB", "Popular accounting"],
  ["freeagent", "FreeAgent", "FA", "Popular accounting"],
  ["freshbooks", "FreshBooks", "FB", "Popular accounting"],
  ["zoho-books", "Zoho Books", "ZB", "Popular accounting"],
  ["dynamics-365-business-central", "Microsoft Dynamics 365 Business Central", "BC", "Enterprise accounting"],
  ["netsuite", "NetSuite", "NS", "Enterprise accounting"],
  ["sap-business-one", "SAP Business One", "SB", "Enterprise accounting"],
  ["oracle-accounting-erp", "Oracle accounting/ERP", "OR", "Enterprise accounting"],
  ["myob", "MYOB", "MY", "Enterprise accounting"],
  ["odoo", "Odoo", "OD", "Enterprise accounting"],
  ["exact-online", "Exact Online", "EX", "Enterprise accounting"],
] as const;

const ACCOUNTING_FILE_PROVIDERS = [
  ["sage", "Sage", "SA", "Set up file exchange"],
  ["kashflow", "KashFlow", "KF", "Set up connection"],
] as const;

const PAYMENT_PROVIDER_CARDS = [
  ["paypal-business", "PayPal", "PP", "Payment link", "Use provider-hosted PayPal payment links now, or configure an approved API/webhook route.", "Set up PayPal"],
  ["square", "Square", "SQ", "Payment link", "Use Square payment links, terminal recording, or reconciliation reports without using MyTitan billing Stripe.", "Set up Square"],
  ["sumup", "SumUp", "SU", "Manual collection", "Record SumUp terminal payments or configure provider-hosted payment requests.", "Set up SumUp"],
  ["zettle", "Zettle", "ZT", "Manual collection", "Record Zettle terminal payments and reconcile provider reports.", "Set up Zettle"],
  ["gocardless", "GoCardless", "GC", "Payment link", "Use provider-hosted payment instructions and reconcile verified provider reports.", "Set up GoCardless"],
  ["worldpay", "Worldpay", "WP", "Payment link", "Use Worldpay payment links, signed webhook events, or reconciliation imports where approved.", "Set up Worldpay"],
  ["adyen", "Adyen", "AD", "Payment link", "Use provider-hosted payment links and reviewed settlement imports.", "Set up Adyen"],
  ["checkout-com", "Checkout.com", "CO", "Payment link", "Use provider-hosted payment links and reviewed settlement imports.", "Set up Checkout.com"],
  ["mollie", "Mollie", "MO", "Payment link", "Use provider-hosted payment links and reviewed settlement imports.", "Set up Mollie"],
  ["braintree", "Braintree", "BT", "Payment link", "Use provider-hosted payment links and verified reconciliation before marking payments paid.", "Set up Braintree"],
  ["opayo", "Opayo", "OP", "Payment link", "Use provider-hosted payment links and reviewed settlement imports.", "Set up Opayo"],
  ["elavon", "Elavon", "EL", "Manual collection", "Record terminal payments and reconcile provider settlement reports.", "Set up Elavon"],
  ["global-payments", "Global Payments", "GP", "Manual collection", "Record terminal payments and reconcile provider settlement reports.", "Set up Global Payments"],
  ["dojo", "Dojo", "DO", "Manual collection", "Record Dojo terminal payments and reconcile provider reports.", "Set up Dojo"],
  ["tyl", "Tyl", "TY", "Manual collection", "Record terminal payments and reconcile provider reports.", "Set up Tyl"],
  ["takepayments", "Takepayments", "TP", "Manual collection", "Record terminal payments and reconcile provider reports.", "Set up Takepayments"],
  ["barclaycard", "Barclaycard", "BC", "Manual collection", "Record terminal payments and reconcile provider reports.", "Set up Barclaycard"],
  ["lloyds-cardnet", "Lloyds Cardnet", "LC", "Manual collection", "Record terminal payments and reconcile provider reports.", "Set up Lloyds Cardnet"],
] as const;

const CALENDAR_STANDARD_CARDS = [
  ["microsoft-calendar", "Microsoft 365 Calendar", "M365", "Subscribe to a secure MyTitan calendar feed or use approved API/webhook events. Native Microsoft OAuth is not claimed here."],
  ["outlook", "Outlook", "OU", "Subscribe to a secure MyTitan calendar feed. Native Outlook OAuth is not claimed here."],
  ["exchange", "Exchange", "EX", "Subscribe to a secure MyTitan calendar feed or configure an approved scheduling API route."],
  ["apple-calendar", "Apple Calendar", "AC", "Subscribe using a secure MyTitan ICS calendar feed."],
  ["generic-ics-calendar", "Generic ICS calendar", "ICS", "Subscribe to MyTitan bookings with a revocable ICS feed."],
  ["caldav", "CalDAV", "CD", "Use the MyTitan ICS feed now. CalDAV remains separately gated until secure discovery and sync are complete."],
] as const;

const SCHEDULING_API_CARDS = [
  ["calendly", "Calendly", "CL"],
  ["cal-com", "Cal.com", "CC"],
  ["deputy", "Deputy", "DP"],
  ["rotacloud", "RotaCloud", "RC"],
  ["when-i-work", "When I Work", "WI"],
  ["sling", "Sling", "SL"],
  ["humanity", "Humanity", "HU"],
  ["custom-scheduling-system", "Custom scheduling system", "CS"],
] as const;

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
  const [connectionFilter, setConnectionFilter] = useState<ConnectionFilter>("All");
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
    const qboStatus: DirectoryStatus = quickbooks?.connected ? "Connected" : "API connection";
    const qboAction = quickbooks?.connected ? "Manage" : "Configure API connection";
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
        filters: ["Built in", "Connect now"],
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
        filters: ["Native", "Connect now"],
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
          : "Connect supported accounting records through a governed API connection, or use validated finance exports.",
        action: qboAction,
        href: quickbooks?.connected ? "/dashboard/settings/integrations/quickbooks" : "/dashboard/settings/developer-tools#api-tokens",
        secondaryAction: quickbooks?.connected ? "Check setup" : "Use file exchange",
        secondaryHref: quickbooks?.connected ? "/dashboard/settings/integrations/quickbooks" : "/dashboard/finance",
        testId: "integration-workspace-row-quickbooks",
        filters: quickbooks?.connected ? ["Connected"] : ["API", "File exchange", "Connect now"],
        availableNow: ["Scoped API tokens", "signed webhooks", "finance CSV exports", "dry-run export queues"],
        notSupported: quickbooks?.connected ? ["Automatic two-way sync"] : ["Native tenant OAuth connection", "fake QuickBooks Connect action", "delivery date promise"],
        setupRequirements: ["Create scoped API credentials or export finance records before exchanging data with QuickBooks."],
        primaryMode: "link",
      },
      ...ACCOUNTING_FILE_PROVIDERS.map(([key, name, icon, action]) => ({
        key,
        group: "Accounting" as const,
        section: "Popular accounting" as const,
        name,
        providerIcon: icon,
        status: "File exchange" as const,
        description: `${name} can use validated finance exports now, with API tokens and webhooks available for approved external workflows.`,
        action,
        href: "/dashboard/finance",
        secondaryAction: "Configure API",
        secondaryHref: "/dashboard/settings/developer-tools#api-tokens",
        testId: `integration-workspace-row-${key}`,
        filters: ["File exchange", "API", "Webhooks", "Connect now"] as ConnectionFilter[],
        availableNow: ["Finance CSV exports", "scoped API tokens", "signed webhooks", "manual review before external posting"],
        notSupported: ["Native OAuth connection", "fake Connect action", "delivery date promise"],
        primaryMode: "link" as const,
      })),
      ...ACCOUNTING_API_PROVIDERS.filter(([key]) => key !== "quickbooks").map(([key, name, icon, section]) => ({
        key,
        group: "Accounting" as const,
        section: section as AccountingSection,
        name,
        providerIcon: icon,
        status: "API connection" as const,
        description: `Connect ${name} through scoped API tokens, signed webhooks or validated file exchange without claiming a native connector.`,
        action: "Configure API connection",
        href: "/dashboard/settings/developer-tools#api-tokens",
        secondaryAction: "Use file exchange",
        secondaryHref: "/dashboard/finance",
        testId: `integration-workspace-row-${key}`,
        filters: ["API", "Webhooks", "File exchange", "Connect now"] as ConnectionFilter[],
        availableNow: ["Scoped API tokens", "signed webhook events", "finance CSV exports", "request native connector from Details"],
        notSupported: ["Native connector", "provider password collection", "two-way sync", "official partnership claim"],
        primaryMode: "link" as const,
      })),
      {
        key: "csv-export",
        group: "Accounting",
        section: "Flexible connections",
        name: "CSV import/export",
        providerIcon: "CSV",
        status: "File exchange",
        description: "Export supported finance records for accountants or external accounting tools. Imports are not shown unless implemented.",
        action: "Open Finance exports",
        href: "/dashboard/finance",
        testId: "integration-workspace-row-csv-export",
        filters: ["File exchange", "Connect now"],
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
        status: "API connection",
        description: "Create scoped API tokens for approved external systems without exposing provider secrets.",
        action: "Manage API tokens",
        href: "/dashboard/settings/developer-tools#api-tokens",
        testId: "integration-workspace-row-accounting-api-tokens",
        filters: ["API", "Connect now"],
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
        status: "Webhook connection",
        description: "Send selected business events to approved external accounting workflows using signed deliveries.",
        action: "Manage webhooks",
        href: "/dashboard/settings/developer-tools#webhooks",
        testId: "integration-workspace-row-accounting-webhooks",
        filters: ["Webhooks", "Connect now"],
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
        status: "Connect now",
        description: "Connect an approved external system using scoped API tokens and signed webhooks.",
        action: "Developer tools",
        href: "/dashboard/settings/developer-tools",
        secondaryAction: "Integration guide",
        secondaryHref: "/dashboard/help?category=integrations",
        testId: "integration-workspace-row-custom-accounting-system",
        filters: ["API", "Webhooks", "File exchange", "Connect now"],
        availableNow: ["Scoped API tokens", "signed webhook delivery", "finance exports", "request native connector from Details"],
        notSupported: ["Unreviewed external write access", "provider password collection", "raw technical configuration in catalogue cards"],
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
        filters: ["Native", "Connected"],
      },
      {
        key: "bank-transfer",
        group: "Payments",
        name: "Bank transfer",
        status: bank?.connected ? "Connected" : "Manual collection",
        description: "Add bank details for invoices and payment requests.",
        action: bank?.connected ? "Manage Bank Details" : "Add Bank Details",
        href: "/dashboard/settings/payments?provider=bank-transfer",
        testId: "integration-workspace-row-bank-transfer",
        filters: ["Manual", "Connect now"],
      },
      {
        key: "manual-card-terminal",
        group: "Payments",
        name: "Manual card terminal",
        status: terminal?.connected ? "Connected" : "Manual collection",
        description: "Record payments collected through your own card terminal.",
        action: terminal?.connected ? "Manage Terminal" : "Configure Terminal",
        href: "/dashboard/settings/payments?provider=manual-card-terminal",
        testId: "integration-workspace-row-manual-card-terminal",
        filters: ["Manual", "Connect now"],
      },
      ...PAYMENT_PROVIDER_CARDS.map(([key, name, icon, status, description, action]) => ({
        key,
        group: "Payments" as const,
        name,
        providerIcon: icon,
        status: status as DirectoryStatus,
        description,
        action,
        href: `/dashboard/settings/payments?provider=${key}`,
        secondaryAction: status === "Manual collection" ? "Open Finance" : "Manage webhooks",
        secondaryHref: status === "Manual collection" ? "/dashboard/finance" : "/dashboard/settings/developer-tools#webhooks",
        testId: key === "paypal-business" ? "integration-workspace-row-paypal" : `integration-workspace-row-${key}`,
        filters: status === "Manual collection" ? ["Manual", "Connect now"] as ConnectionFilter[] : ["Connect now", "Webhooks"] as ConnectionFilter[],
        availableNow: ["Provider-hosted payment links or instructions", "manual collection recording", "signed webhook or reconciliation review where configured"],
        notSupported: ["Using MyTitan subscription Stripe for customer funds", "marking paid from unverified webhook", "collecting provider passwords"],
        primaryMode: "link" as const,
      })),
      {
        key: "custom-payment-provider",
        group: "Payments",
        name: "Custom payment provider",
        providerIcon: "CP",
        status: "Connect now",
        description: "Use payment links, signed webhooks, reconciliation imports or manual collection.",
        action: "Configure provider",
        href: "/dashboard/settings/payments?provider=custom",
        secondaryAction: "Manage webhooks",
        secondaryHref: "/dashboard/settings/developer-tools#webhooks",
        testId: "integration-workspace-row-custom-payment-provider",
        filters: ["Connect now", "Webhooks", "Manual"],
        availableNow: ["Payment-link tracking", "manual payment recording", "signed webhook review", "reconciliation import review"],
        notSupported: ["Provider password collection", "unverified payment completion", "MyTitan Billing Stripe for tenant funds"],
        primaryMode: "link",
      },
      ...accountingCards,
      {
        key: "google-calendar",
        group: "Calendar",
        name: "Google Calendar",
        status: simpleConnectionStatus(google),
        description: "Keep supported appointments connected to your calendar.",
        action: google?.connected ? "Manage" : "Connect",
        href: "/dashboard/settings/integrations/google-calendar",
        testId: "integration-personal-row-google",
        filters: ["Native", "Connected"],
      },
      ...CALENDAR_STANDARD_CARDS.map(([key, name, icon, description]) => ({
        key,
        group: "Calendar" as const,
        name,
        providerIcon: icon,
        status: "Calendar standard" as const,
        description,
        action: "Add calendar feed",
        href: "/dashboard/bookings",
        secondaryAction: "Booking settings",
        secondaryHref: "/dashboard/booking/settings",
        testId: `integration-workspace-row-${key}`,
        filters: ["Calendar standard", "Connect now"] as ConnectionFilter[],
        availableNow: ["Outbound ICS feed", "copy feed URL from Bookings", "tenant-scoped booking visibility", "revocable booking settings token"],
        notSupported: ["Fake provider OAuth", "two-way calendar sync from ICS alone", key === "caldav" ? "CalDAV discovery and sync in this release" : "Native provider connector unless separately configured"],
        primaryMode: "link" as const,
      })),
      ...SCHEDULING_API_CARDS.map(([key, name, icon]) => ({
        key,
        group: "Calendar" as const,
        name,
        providerIcon: icon,
        status: "API connection" as const,
        description: `${name} can exchange approved scheduling events through scoped API tokens and signed webhooks.`,
        action: "Configure scheduling API",
        href: "/dashboard/settings/developer-tools#api-tokens",
        secondaryAction: "Add calendar feed",
        secondaryHref: "/dashboard/bookings",
        testId: `integration-workspace-row-${key}`,
        filters: ["API", "Webhooks", "Calendar standard", "Connect now"] as ConnectionFilter[],
        availableNow: ["Scoped API tokens", "signed webhook events", "outbound ICS feed for calendar visibility"],
        notSupported: ["Fake native OAuth", "silent inbound booking creation without validation", "two-way sync unless explicitly implemented"],
        primaryMode: "link" as const,
      })),
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
        group: "Automation",
        name: "Provider-neutral directions",
        status: "Limited / Beta",
        description: "Open directions from saved addresses.",
        action: "Open scheduling",
        href: "/dashboard/scheduling",
        testId: "integration-workspace-row-directions",
      },
      {
        key: "google-maps",
        group: "Automation",
        name: "Google Maps",
        status: "API connection",
        description: "Use provider-neutral directions now, or connect approved map data through scoped APIs when reviewed.",
        action: "Open scheduling",
        href: "/dashboard/scheduling",
        secondaryAction: "Developer tools",
        secondaryHref: "/dashboard/settings/developer-tools#api-tokens",
        testId: "integration-workspace-row-google-maps",
        filters: ["API", "Connect now"],
      },
      {
        key: "onedrive",
        group: "Storage",
        name: "OneDrive",
        status: "API connection",
        description: "Connect document workflows through scoped API tokens and signed webhooks; MyTitan documents remain available now.",
        action: "View documents",
        href: "/dashboard/settings/documents-numbering",
        secondaryAction: "Developer tools",
        secondaryHref: "/dashboard/settings/developer-tools#api-tokens",
        testId: "integration-workspace-row-onedrive",
        filters: ["API", "Webhooks", "Connect now"],
      },
      {
        key: "google-drive",
        group: "Storage",
        name: "Google Drive",
        status: "API connection",
        description: "Connect document workflows through scoped API tokens and signed webhooks; MyTitan documents remain available now.",
        action: "View documents",
        href: "/dashboard/settings/documents-numbering",
        secondaryAction: "Developer tools",
        secondaryHref: "/dashboard/settings/developer-tools#api-tokens",
        testId: "integration-workspace-row-google-drive",
        filters: ["API", "Webhooks", "Connect now"],
      },
      {
        key: "dropbox",
        group: "Storage",
        name: "Dropbox",
        status: "API connection",
        description: "Connect document workflows through scoped API tokens and signed webhooks; MyTitan documents remain available now.",
        action: "View documents",
        href: "/dashboard/settings/documents-numbering",
        secondaryAction: "Developer tools",
        secondaryHref: "/dashboard/settings/developer-tools#api-tokens",
        testId: "integration-workspace-row-dropbox",
        filters: ["API", "Webhooks", "Connect now"],
      },
      {
        key: "zapier",
        group: "Automation",
        name: "Zapier",
        status: "Webhook connection",
        description: "Connect approved automations using API tokens and webhooks.",
        action: "Open Developer Tools",
        href: "/dashboard/settings/developer-tools#webhooks",
        testId: "integration-workspace-row-zapier",
        filters: ["Webhooks", "API", "Connect now"],
      },
      {
        key: "make",
        group: "Automation",
        name: "Make",
        status: "Webhook connection",
        description: "Connect approved scenarios using API tokens and webhooks.",
        action: "Open Developer Tools",
        href: "/dashboard/settings/developer-tools#webhooks",
        testId: "integration-workspace-row-make",
        filters: ["Webhooks", "API", "Connect now"],
      },
      {
        key: "n8n",
        group: "Automation",
        name: "n8n",
        status: "API connection",
        description: "Self-hosted automation can connect through scoped API keys and signed webhooks.",
        action: "Open Developer Tools",
        href: "/dashboard/settings/developer-tools#api-tokens",
        testId: "integration-workspace-row-n8n",
        filters: ["API", "Webhooks", "Connect now"],
      },
      {
        key: "custom-connection",
        group: "Automation",
        name: "Custom connection",
        providerIcon: "CC",
        status: "Connect now",
        description: "Build a governed connection using REST API guidance, API tokens, signed webhooks, file exchange, ICS, payment links or manual collection.",
        action: "Configure",
        href: "/dashboard/settings/developer-tools#api-tokens",
        secondaryAction: "Open Finance exports",
        secondaryHref: "/dashboard/finance",
        testId: "integration-workspace-row-custom-connection",
        filters: ["API", "Webhooks", "File exchange", "Calendar standard", "Manual", "Connect now"],
        availableNow: ["Scoped API tokens", "signed webhooks", "file exchange", "ICS feeds", "payment-link tracking", "manual payment recording"],
        notSupported: ["Arbitrary code execution", "unreviewed REST calls from MyTitan servers", "provider password collection"],
        primaryMode: "link",
      },
      {
        key: "hubspot",
        group: "CRM",
        name: "HubSpot",
        providerIcon: "HS",
        status: "API connection",
        description: "Exchange approved customer and activity records through scoped API tokens and signed webhooks.",
        action: "Configure API connection",
        href: "/dashboard/settings/developer-tools#api-tokens",
        testId: "integration-workspace-row-hubspot",
        filters: ["API", "Webhooks", "Connect now"],
      },
      {
        key: "salesforce",
        group: "CRM",
        name: "Salesforce",
        providerIcon: "SF",
        status: "API connection",
        description: "Exchange approved customer and activity records through scoped API tokens and signed webhooks.",
        action: "Configure API connection",
        href: "/dashboard/settings/developer-tools#api-tokens",
        testId: "integration-workspace-row-salesforce",
        filters: ["API", "Webhooks", "Connect now"],
      },
      {
        key: "google-sign-in",
        group: "Identity",
        name: "Google sign-in",
        status: "Built in alternative",
        description: "Use MyTitan sign-in and workspace RBAC now; external identity can be reviewed as an enterprise API/security request.",
        action: "Manage users",
        href: "/dashboard/compliance",
        testId: "integration-workspace-row-google-sign-in",
        filters: ["Built in"],
      },
      {
        key: "microsoft-entra",
        group: "Identity",
        name: "Microsoft Entra ID",
        status: "Built in alternative",
        description: "Use MyTitan sign-in and workspace RBAC now; Entra SSO remains an enterprise security review item.",
        action: "Manage users",
        href: "/dashboard/compliance",
        testId: "integration-workspace-row-entra",
        filters: ["Built in"],
      },
      {
        key: "saml-okta",
        group: "Identity",
        name: "SAML / Okta",
        status: "Built in alternative",
        description: "Use MyTitan sign-in and workspace RBAC now; SAML can be reviewed as an enterprise security request.",
        action: "Manage users",
        href: "/dashboard/compliance",
        testId: "integration-workspace-row-saml-okta",
        filters: ["Built in"],
      },
      {
        key: "api-tokens",
        group: "Developer",
        name: "API tokens",
        status: "API connection",
        description: "Create secure tokens for approved external systems.",
        action: "Manage",
        href: "/dashboard/settings/developer-tools#api-tokens",
        testId: "integration-developer-api-tokens",
        filters: ["API", "Connect now"],
      },
      {
        key: "webhooks",
        group: "Developer",
        name: "Webhooks",
        status: "Webhook connection",
        description: "Send selected business events to approved external systems.",
        action: "Manage",
        href: "/dashboard/settings/developer-tools#webhooks",
        testId: "integration-developer-webhooks",
        filters: ["Webhooks", "Connect now"],
      },
    ];
  }, [byogByProvider, canManage, google, quickbooks, stripe, xero]);

  const filteredCards = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return cards.filter((card) => {
      const categoryMatch = category === "All" || card.group === category;
      const connectionMatch = connectionFilter === "All" || card.filters?.includes(connectionFilter);
      const searchMatch = !cleanQuery || `${card.name} ${card.description} ${card.group} ${card.section || ""}`.toLowerCase().includes(cleanQuery);
      return categoryMatch && connectionMatch && searchMatch;
    });
  }, [cards, category, connectionFilter, query]);

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
    const publicActions = ["mytitan-finance", "csv-export", "custom-accounting-system", "apple-calendar", "generic-ics-calendar", "caldav"];
    const disabled = card.primaryMode !== "request" && (card.key !== "google-calendar" ? !canManage && !publicActions.includes(card.key) : !canManagePersonal);
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
        <div className="settings-tab-grid" style={{ marginTop: 14 }} role="tablist" aria-label="Connection method filters">
            {CONNECTION_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                className={`tab-button settings-tab-button ${connectionFilter === filter ? "active" : ""}`}
                onClick={() => setConnectionFilter(filter)}
                aria-selected={connectionFilter === filter}
              >
                <strong>{filter}</strong>
              </button>
            ))}
        </div>
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
          if (!groupCards.length || (group === "Developer" && !canManage)) return null;
          return (
            <section className="operator-section" key={group} data-testid={`connected-tools-group-${group.toLowerCase().replace(/\s+/g, "-")}`}>
              <div className="operator-section__header">
                <div>
                  <h2 className="operator-section__title">{group}</h2>
                  <p className="operator-section__subtitle">
                    {group === "Developer" ? "Technical connections for approved external systems." : `Manage your ${group.toLowerCase()} connections.`}
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
              setConnectionFilter("All");
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
              {cardAction(selectedCard, false)}
              {selectedCard.key !== "mytitan-finance" ? (
                <button className="button secondary" type="button" onClick={() => {
                  setRequestCard(selectedCard);
                  setSelectedCard(null);
                }}>
                  Request native integration
                </button>
              ) : null}
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
