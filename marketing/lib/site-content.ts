export const APP_URL = "https://app.mytitan.co.uk";
export const SIGN_IN_URL = `${APP_URL}/login`;
export const SIGN_UP_URL = `${APP_URL}/signup`;
export const BILLING_URL = `${APP_URL}/dashboard/billing`;
export const SALES_EMAIL = "sales@mytitan.co.uk";

export const platformPillars = [
  {
    title: "Operations control",
    description:
      "Run bookings, jobs, dispatch pressure, required-field enforcement, and technician coordination from one operating layer.",
    bullets: [
      "Command centre, workflow control, and booking intake",
      "Scheduling pressure, technician execution, and completion records",
      "Required-field enforcement with visible operational pressure",
    ],
  },
  {
    title: "Revenue continuity",
    description:
      "Move from quote to collections, approvals, billing readiness, and recurring service delivery without handoff drift.",
    bullets: [
      "Quotes, approvals, collections, and billing readiness",
      "Recurring service plans that create real operational work",
      "Revenue visibility tied directly to live operational context",
    ],
  },
  {
    title: "Customer workspace",
    description:
      "Give customers one controlled place for approvals, records, status, and completion follow-through.",
    bullets: [
      "Customer accounts, approvals, and portal-safe records",
      "Completion acknowledgement, documents, and workspace access",
      "Visibility that stays separate from internal operator controls",
    ],
  },
  {
    title: "Governance at scale",
    description:
      "Keep growth controllable with tenant scope, location context, integrations, compliance, and auditability built in.",
    bullets: [
      "Workspace governance, RBAC, and audit-friendly automation",
      "API tokens, webhooks, and delivery logs",
      "Compliance exceptions, analytics, and multi-location visibility",
    ],
  },
];

export const solutionGroups = [
  {
    title: "Operations leadership",
    description:
      "For teams running daily service delivery across bookings, jobs, dispatch, scheduling, and recurring work.",
    points: [
      "Keep missing required data visible before work advances",
      "Surface unassigned, overdue, and breached work in one command layer",
      "Hold together field execution, service plans, and inventory pressure",
    ],
  },
  {
    title: "Revenue and finance teams",
    description:
      "For operators who need quotes, approvals, collections, and billing controls to stay close to the job lifecycle.",
    points: [
      "Track quote conversion and collections in the same system as operations",
      "Keep billing actions governed by permissions and activity visibility",
      "Use commercial signals in analytics, performance, and accountability reviews",
    ],
  },
  {
    title: "Platform and branch owners",
    description:
      "For businesses standardizing across locations, teams, and governance expectations without creating new system sprawl.",
    points: [
      "Tenant-scoped custom fields, automations, and integrations",
      "Multi-location operating context without fake org-chart theater",
      "Executive analytics, SLA pressure, and compliance visibility built into the platform",
    ],
  },
];

export const industries = [
  {
    title: "Field service and mobile teams",
    description: "Businesses coordinating dispatch, technician execution, completion records, and customer follow-through without splitting the operating model.",
  },
  {
    title: "Multi-location service operators",
    description: "Operators coordinating branches, warehouses, service regions, or franchise-style footprints with shared governance and explicit location context.",
  },
  {
    title: "Recurring maintenance businesses",
    description: "Teams managing service plans, renewals, change requests, recurring run history, and proof of completed work.",
  },
  {
    title: "Commercial service providers",
    description: "Operators where approvals, documents, quotes, collections, and auditability matter as much as day-of-work execution.",
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
    cta: "Request demo",
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
