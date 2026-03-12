export const APP_URL = "https://app.mytitan.co.uk";
export const SIGN_IN_URL = `${APP_URL}/login`;
export const SIGN_UP_URL = `${APP_URL}/signup`;
export const BILLING_URL = `${APP_URL}/dashboard/billing`;
export const SALES_EMAIL = "sales@mytitan.co.uk";

export const platformPillars = [
  {
    title: "Command centre and workflow control",
    description:
      "Run bookings, jobs, dispatch pressure, required-field enforcement, and day-of-work coordination from one operating layer.",
    bullets: [
      "Configurable terminology and workflow stages",
      "Required-field enforcement with visible operational pressure",
      "Command centre and technician execution visibility",
    ],
  },
  {
    title: "Revenue, recurring work, and customer follow-through",
    description:
      "Move from quote to collections, recurring service delivery, approvals, and customer-safe records without handing work across disconnected tools.",
    bullets: [
      "Quotes, approvals, collections, and billing readiness",
      "Recurring service plans that create real operational work",
      "Customer workspace, portal routes, and completion acknowledgement",
    ],
  },
  {
    title: "Governance, compliance, and extensibility",
    description:
      "Keep growth controllable with tenant-scoped permissions, SLA/compliance pressure, integrations, auditability, and operational evidence.",
    bullets: [
      "Workspace governance, RBAC, and audit-friendly automation",
      "API tokens, outbound webhooks, and delivery logs",
      "Compliance exceptions, SLA tracking, and execution evidence",
    ],
  },
];

export const solutionGroups = [
  {
    title: "Operations leaders",
    description:
      "Reduce handoff drift across bookings, jobs, dispatch, scheduling, and recurring service execution.",
    points: [
      "Keep missing required data explicit before work advances",
      "Surface unassigned, overdue, and breached work in one command layer",
      "Scale cleanly across teams, branches, and franchise-style structures",
    ],
  },
  {
    title: "Finance and revenue operators",
    description:
      "Protect the commercial lifecycle from quote follow-up through invoice collections and compensation-ready performance signals.",
    points: [
      "Track quote conversion and collections tasks in the same system as operations",
      "Keep billing actions governed by permissions and activity visibility",
      "Use real commercial signals in analytics, performance, and accountability reviews",
    ],
  },
  {
    title: "Enterprise buyers and platform owners",
    description:
      "Adopt one controllable platform instead of stitching workflow, portal, scheduling, documents, and reporting together.",
    points: [
      "Tenant-scoped custom fields, automations, and integrations",
      "Multi-location operating context without fake org-chart theater",
      "Executive analytics, SLA pressure, and compliance visibility built into the platform",
    ],
  },
];

export const industries = [
  {
    title: "Field service operators",
    description: "Teams that need dispatch control, technician execution, completion records, and customer follow-through in one governed system.",
  },
  {
    title: "Multi-location service businesses",
    description: "Operators coordinating branches, warehouses, service regions, or franchise-style footprints with shared governance and explicit location context.",
  },
  {
    title: "Maintenance and recurring service businesses",
    description: "Businesses managing service plans, renewals, change requests, recurring run history, and proof of completed work.",
  },
  {
    title: "Commercial service providers",
    description: "Businesses where approvals, documents, quotes, collections, and auditability matter as much as day-of-work execution.",
  },
];

export const securityPoints = [
  "Tenant-scoped data model across workflow, customer, finance, integration, and governance surfaces",
  "Workspace permissions and role-aware access to settings, finance, technician, portal, and compliance actions",
  "Explainable automation history, activity records, and operational evidence trails",
  "Compliance queueing, SLA breach visibility, and operator-managed exception resolution",
  "API tokens, webhook subscriptions, and delivery logs as platform primitives",
  "Customer-facing surfaces kept separate from internal compliance and governance controls",
];

export const pricingTiers = [
  {
    name: "Sole Trader",
    priceMonthly: "GBP 49 per month",
    priceAnnual: "GBP 39 per month, billed annually",
    summary: "Core workflow, jobs, CRM, and customer-visible foundations for a smaller operating footprint.",
    cta: "Get started",
    href: SIGN_UP_URL,
  },
  {
    name: "Business",
    priceMonthly: "GBP 119 per month",
    priceAnnual: "GBP 95 per month, billed annually",
    summary: "Team workflows, customer approvals, service plans, command-centre control, and governed operating surfaces.",
    cta: "See platform",
    href: "/platform",
    featured: true,
  },
  {
    name: "Enterprise",
    priceMonthly: "From GBP 299 per month",
    priceAnnual: "From GBP 239 per month, billed annually",
    summary: "Multi-location deployment, broader governance, integration-first rollout, and support for more complex operating models.",
    cta: "Talk to sales",
    href: "/demo",
  },
];

export const homepageModules = [
  "Command centre and live operational control",
  "Configurable workflows with required-field enforcement",
  "Recurring service plans and recurring work engine",
  "Customer accounts, approvals, and portal-safe records",
  "Quotes, collections, and revenue operations",
  "Scheduling optimization and capacity pressure visibility",
  "Inventory, parts, and procurement controls",
  "Execution evidence and completion records",
  "Multi-location operations and location-aware filtering",
  "SLA, compliance, and audit controls",
  "Executive analytics, benchmarking, and performance ops",
  "API tokens, webhooks, and document/artifact foundations",
];
