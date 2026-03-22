export const APP_URL = "https://app.mytitan.co.uk";
export const SIGN_IN_URL = `${APP_URL}/login`;
export const SIGN_UP_URL = `${APP_URL}/signup`;
export const BILLING_URL = `${APP_URL}/dashboard/billing`;
export const SALES_EMAIL = "support@mytitan.co.uk";

export const homepageProblems = [
  {
    title: "Too many handoffs",
    description: "Teams lose time when bookings, jobs, customer updates, and billing live in different tools.",
    outcome: "Keep the whole job journey in one place so work keeps moving.",
  },
  {
    title: "No clear live view",
    description: "Owners and managers struggle to see what is booked, blocked, overdue, or waiting for approval.",
    outcome: "See the day clearly without asking three people for status updates.",
  },
  {
    title: "Missed follow-through",
    description: "Quotes, approvals, repeat work, and billing often break away from the job that created them.",
    outcome: "Keep revenue follow-through tied to the actual work and customer record.",
  },
];

export const homepageOutcomes = [
  "Less chasing between dispatch, workshop, field, and office teams",
  "Faster approvals and clearer customer communication",
  "Better billing follow-through after work is complete",
  "Cleaner growth into repeat work, multiple teams, and multiple sites",
];

export const platformPillars = [
  {
    title: "Before the job starts",
    description:
      "Capture the booking, assign the work, and keep the schedule tied to the real customer and job.",
    bullets: [
      "Bookings and jobs created in the same system",
      "Scheduling and capacity views tied to live work",
      "Customer context visible before work begins",
    ],
  },
  {
    title: "While the job is live",
    description:
      "Keep the team aligned while the job is in progress, with updates, evidence, and blockers in one view.",
    bullets: [
      "Live board for open work, blockers, and handoffs",
      "Completion records and required checks built into the flow",
      "Customer updates tied to the live job",
    ],
  },
  {
    title: "After the work is done",
    description:
      "Move into approvals, billing, payment follow-through, and repeat service without switching systems.",
    bullets: [
      "Quotes, approvals, collections, and billing follow-up",
      "Recurring service plans that create real work, not reminders",
      "Customer records and completed work history in one place",
    ],
  },
  {
    title: "As the business grows",
    description:
      "Add control, reporting, and integrations without rebuilding the way the team already works.",
    bullets: [
      "Role-based access and workspace controls",
      "API tokens, webhooks, and delivery logs",
      "Compliance queues, analytics, and multi-location visibility",
    ],
  },
];

export const solutionGroups = [
  {
    title: "Owners and general managers",
    description:
      "For leaders who need one clear view of work, team load, customer follow-through, and revenue.",
    points: [
      "See what is booked, blocked, overdue, or waiting",
      "Spot handoff issues before they turn into delays or missed billing",
      "Grow without adding more disconnected admin tools",
    ],
  },
  {
    title: "Dispatch, workshop, and service managers",
    description:
      "For teams coordinating people, schedules, repeat work, and customer updates every day.",
    points: [
      "Track technician load and job status without guesswork",
      "Keep customer communication tied to the work itself",
      "Use one system for live control, completion, and follow-through",
    ],
  },
  {
    title: "Office, finance, and admin teams",
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
    description: "Best for teams handling a high daily volume of bookings, jobs, approvals, customer updates, and invoicing.",
  },
  {
    title: "Field service and mobile teams",
    description: "Best for businesses coordinating dispatch, technician work, proof of completion, and customer follow-through on the move.",
  },
  {
    title: "Fleet and recurring service businesses",
    description: "Best for teams managing repeat work, service plans, renewal decisions, and a steady flow of customer requests.",
  },
  {
    title: "Multi-location service operators",
    description: "Best for businesses standardising process across sites, branches, or regions without losing local visibility.",
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
    cta: "Book demo",
    href: "/demo",
  },
  {
    name: "Business",
    priceMonthly: "GBP 119 per month",
    priceAnnual: "GBP 95 per month, billed annually",
    summary: "For growing service teams that need stronger control, repeat work, and better team visibility.",
    cta: "Book demo",
    href: "/demo",
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
