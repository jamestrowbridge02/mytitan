export const APP_URL = "https://app.mytitan.co.uk";
export const SIGN_IN_URL = `${APP_URL}/login`;
export const SIGN_UP_URL = `${APP_URL}/signup`;
export const BILLING_URL = `${APP_URL}/dashboard/billing`;
export const SALES_EMAIL = "support@mytitan.co.uk";

export const platformPillars = [
  {
    title: "Run the day in one place",
    description:
      "Keep bookings, jobs, dispatch, schedules, and technician work in one shared workspace.",
    bullets: [
      "Live board for open work, blockers, and handoffs",
      "Scheduling and capacity views that stay tied to real work",
      "Completion records, evidence, and required checks built into the flow",
    ],
  },
  {
    title: "Keep work and money connected",
    description:
      "Move from quote to approval, billing, payment, and repeat work without losing context.",
    bullets: [
      "Quotes, approvals, collections, and billing follow-up",
      "Recurring service plans that create real work, not reminders",
      "Financial follow-through that stays linked to the customer and the job",
    ],
  },
  {
    title: "Give customers a clear path",
    description:
      "Give customers one place for approvals, documents, updates, and completed work.",
    bullets: [
      "Customer accounts with customer-safe records and actions",
      "Approvals, proof of work, and completion acknowledgement",
      "Clear separation between customer views and internal operator controls",
    ],
  },
  {
    title: "Add control as you grow",
    description:
      "Use permissions, locations, integrations, and audit trails without bolting on extra systems later.",
    bullets: [
      "Role-based access and workspace controls",
      "API tokens, webhooks, and delivery logs",
      "Compliance queues, analytics, and multi-location visibility",
    ],
  },
];

export const solutionGroups = [
  {
    title: "Owners and operators",
    description:
      "For teams that need to see the full day clearly without switching between five different tools.",
    points: [
      "See new work, overdue work, and blocked work in one view",
      "Keep dispatch, field execution, and repeat work connected",
      "Reduce handoff mistakes and missed follow-up",
    ],
  },
  {
    title: "Service managers",
    description:
      "For teams coordinating people, schedules, service plans, and customer updates every day.",
    points: [
      "Track technician load and job status without guesswork",
      "Keep customer communication tied to the work itself",
      "Use one system for live control and follow-through",
    ],
  },
  {
    title: "Finance and admin teams",
    description:
      "For teams that need approvals, billing, collections, and records to stay close to service delivery.",
    points: [
      "Quotes, approvals, and billing follow-up linked to the real work",
      "Permission-aware actions for sensitive financial steps",
      "Clear records for customer, operator, and audit review",
    ],
  },
];

export const industries = [
  {
    title: "Tyres and workshops",
    description: "For teams handling bookings, jobs, approvals, customer updates, and billing in one busy daily workflow.",
  },
  {
    title: "Field service and mobile teams",
    description: "For businesses coordinating dispatch, technician work, proof of completion, and customer follow-through on the move.",
  },
  {
    title: "Fleet and recurring service businesses",
    description: "For teams managing repeat work, service plans, renewal decisions, and a steady flow of customer requests.",
  },
  {
    title: "Multi-location service operators",
    description: "For businesses standardising process across sites, branches, or regions without losing local visibility.",
  },
];

export const securityPoints = [
  "Tenant-scoped data across jobs, customers, billing, and integrations",
  "Role-based access for settings, finance actions, technician views, and customer-facing areas",
  "Activity history and evidence trails across important actions",
  "Compliance queues and exception handling built into the product",
  "API tokens, webhooks, and delivery logs for controlled integrations",
  "Customer-facing surfaces kept separate from internal operator workflows",
];

export const pricingTiers = [
  {
    name: "Sole Trader",
    priceMonthly: "GBP 49 per month",
    priceAnnual: "GBP 39 per month, billed annually",
    summary: "For smaller teams that need jobs, customers, updates, and billing in one place.",
    cta: "Get started",
    href: SIGN_UP_URL,
  },
  {
    name: "Business",
    priceMonthly: "GBP 119 per month",
    priceAnnual: "GBP 95 per month, billed annually",
    summary: "For growing service teams that need stronger control, repeat work, and better team visibility.",
    cta: "Get started",
    href: SIGN_UP_URL,
    featured: true,
  },
  {
    name: "Enterprise",
    priceMonthly: "From GBP 299 per month",
    priceAnnual: "From GBP 239 per month, billed annually",
    summary: "For larger or multi-location businesses that need rollout planning, integrations, and broader controls.",
    cta: "Book demo",
    href: "/demo",
  },
];

export const homepageModules = [
  "Live board for jobs and bookings",
  "Scheduling and team capacity",
  "Recurring service plans and repeat work",
  "Customer accounts and approvals",
  "Quotes, collections, and billing follow-up",
  "Scheduling and capacity visibility",
  "Inventory, parts, and procurement controls",
  "Completion records and proof of work",
  "Multi-location operations",
  "Compliance and audit controls",
  "Analytics and performance views",
  "API tokens, webhooks, and documents",
];
