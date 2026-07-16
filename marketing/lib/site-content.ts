const DEFAULT_APP_URL = "https://app.mytitan.co.uk";

function normalizePublicUrl(value: string | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return DEFAULT_APP_URL;
  return trimmed.replace(/\/+$/, "");
}

export const APP_URL = normalizePublicUrl(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_PUBLIC_URL);
export const SIGN_IN_URL = `${APP_URL}/login`;
export const SIGN_UP_URL = `${APP_URL}/signup`;
export const BILLING_URL = `${APP_URL}/dashboard/billing`;
export const SALES_EMAIL = "support@mytitan.co.uk";
export const CONTACT_URL = "/contact";
export const BESPOKE_ACCOUNT_URL = "/bespoke-account";
export const ENTERPRISE_ACCOUNT_URL = "/bespoke-account?account=enterprise";

export type GovernancePageContent = {
  slug: "privacy" | "terms" | "cookies" | "data-retention" | "accessibility";
  title: string;
  summary: string;
  statusLabel: string;
  statusNote: string;
  lastUpdated: string;
  sections: Array<{
    title: string;
    body: string[];
  }>;
};

export const governancePages: GovernancePageContent[] = [
  {
    slug: "privacy",
    title: "Privacy policy",
    summary: "How MyTitan handles account, workspace, customer, and operational data in the product and support flows.",
    statusLabel: "Operator approved.",
    statusNote:
      "This page is approved for publication as the current operating privacy policy and should be updated if product handling or support flows materially change.",
    lastUpdated: "May 15, 2026",
    sections: [
      {
        title: "What this page covers",
        body: [
          "This privacy page explains the practical product-level handling of workspace, customer, and support data inside MyTitan.",
          "It is approved for truthful publication based on the current product, workspace, and support handling described here.",
        ],
      },
      {
        title: "Workspace and account data",
        body: [
          "MyTitan stores workspace setup, users, bookings, jobs, billing configuration, integrations, and notification settings inside the tenant boundary.",
          "Customer payment collection remains tenant-owned. MyTitan Stripe is limited to subscriptions and job-completion packs only.",
        ],
      },
      {
        title: "Operational and support data",
        body: [
          "Operational logs, audit history, and support contact records may be retained to investigate product issues, delivery failures, and account-level support requests.",
          `For privacy questions or operator requests, contact ${SALES_EMAIL}.`,
        ],
      },
    ],
  },
  {
    slug: "terms",
    title: "Terms",
    summary: "Practical commercial and operational terms for using MyTitan, approved for current publication.",
    statusLabel: "Operator approved.",
    statusNote:
      "This page is approved for publication as the current operating terms. It is not legal advice and should be updated when subscription, cancellation, refund, or service terms materially change.",
    lastUpdated: "May 15, 2026",
    sections: [
      {
        title: "Service scope",
        body: [
          "MyTitan provides software for managing bookings, jobs, customer communication, billing follow-through, workspace operations, and selected integrations.",
          "Customer service payments and deposits remain the responsibility of the tenant's own payment setup or manual collection path.",
        ],
      },
      {
        title: "Billing scope",
        body: [
          "MyTitan Stripe is used for MyTitan subscription billing and job-completion pack purchases only.",
          "Subscription, cancellation, and refund wording should be kept in sync with the live commercial model whenever those terms change.",
        ],
      },
      {
        title: "Operational use",
        body: [
          "Customers are responsible for configuring their workspace, permissions, notification routing, governance publication, and payment-provider ownership truthfully.",
          `For commercial questions, contact ${SALES_EMAIL}.`,
        ],
      },
    ],
  },
  {
    slug: "cookies",
    title: "Cookie policy",
    summary: "A plain-language summary of the cookies and local browser storage used by MyTitan marketing and product surfaces.",
    statusLabel: "Operator approved.",
    statusNote:
      "This page is approved for publication as the current cookie and browser-storage summary. It should be updated if consent tooling, analytics, or third-party browser storage changes.",
    lastUpdated: "May 15, 2026",
    sections: [
      {
        title: "Essential site behaviour",
        body: [
          "MyTitan uses essential browser storage and cookies for sign-in state, workspace sessions, feature flags, and security-related checks.",
          "Marketing pages may also use browser state for install prompts, navigation preferences, and page experience controls.",
        ],
      },
      {
        title: "Operational cookies and storage",
        body: [
          "Operational storage may be used to keep the product stable, preserve a signed-in session, and support customer-safe flows such as bookings or billing views.",
          "This page should be updated if additional analytics, consent, or third-party tooling is introduced.",
        ],
      },
    ],
  },
  {
    slug: "data-retention",
    title: "Data retention",
    summary: "A practical starting point for how long operational records, workspace data, and support traces should be retained and reviewed.",
    statusLabel: "Operator approved.",
    statusNote:
      "This page is approved for publication as the current retention and deletion policy summary. It should be updated if operational, tax, finance, backup, or support retention requirements materially change.",
    lastUpdated: "May 15, 2026",
    sections: [
      {
        title: "Operational records",
        body: [
          "Jobs, bookings, customer communication history, billing records, audit trails, and support records may need different retention periods based on business, tax, and service requirements.",
          "MyTitan surfaces the operational records, but the operator still owns the final retention policy and deletion decisions.",
        ],
      },
      {
        title: "Review and deletion",
        body: [
          "The operator should keep the published retention windows for customer data, audit history, backups, and finance records aligned with real operating requirements.",
          "If refunded or reversed commercial events affect allowance or billing state, the product reflects that operational truth instead of silently masking it.",
        ],
      },
    ],
  },
  {
    slug: "accessibility",
    title: "Accessibility",
    summary: "How MyTitan approaches readable, keyboard-accessible, and operator-reviewable product and marketing surfaces.",
    statusLabel: "Operator approved.",
    statusNote:
      "This page is approved for publication as the current accessibility statement and should be updated when product support, themes, or assistive-technology coverage materially changes.",
    lastUpdated: "July 16, 2026",
    sections: [
      {
        title: "Current accessibility approach",
        body: [
          "MyTitan targets readable foreground and background combinations, visible focus states, keyboard-operable navigation, and semantic labels across product and public surfaces.",
          "The product keeps theme choices explicit and verifies representative light, dark, and system-theme routes with rendered contrast checks.",
        ],
      },
      {
        title: "Support and review",
        body: [
          "Operators can report accessibility issues through support so they can be reviewed against the live product and public pages.",
          `For accessibility support, contact ${SALES_EMAIL}.`,
        ],
      },
    ],
  },
];

export const homepageProblems = [
  {
    title: "The job gets done but the record is weak",
    description: "Photos, notes, sign-off, customer messaging, and billing often get split across different tools or lost in chat threads.",
    outcome: "Keep one finished record with the work, proof, signatures, and customer-ready output attached.",
  },
  {
    title: "Completion is not the same as handoff",
    description: "Many systems stop at job admin, leaving the team to build the customer result and payment follow-up manually after the work is done.",
    outcome: "Finish the job, send the result, and keep payment tied to the same completed work.",
  },
  {
    title: "Payment gets detached from the work",
    description: "Invoices and payment chasing become unreliable when they are not anchored to the completed job and customer-safe record.",
    outcome: "Keep billing follow-through attached to the completed job and customer send.",
  },
];

export const homepageOutcomes = [
  "One submitted job stays authoritative from capture through send and payment",
  "Proof media, signatures, pricing, and customer-ready output stay attached to the same record",
  "The customer sees a finished summary instead of a vague completion message",
  "Payment follow-up stays downstream of completed work instead of becoming a separate admin chase",
];

export const homepageSignals = [
  {
    label: "Operator-first workflow",
    value: "One route",
    detail: "Booking, live job, send, and payment stay connected instead of splitting into separate admin tools.",
  },
  {
    label: "Clear commercial fit",
    value: "20 / 60 / 200 / 500",
    detail: "Monthly completed-job allowances are stated directly across pricing and billing.",
  },
  {
    label: "Readiness already visible",
    value: "Built in",
    detail: "Billing truth, ops readiness, integrations readiness, and customer-safe output are already surfaced in the product.",
  },
];

export const homepageJourney = [
  {
    title: "Publish bookings with confidence",
    description: "Services, availability, deposits, and customer-facing booking truth stay tied to the workspace setup.",
    href: "/platform",
    action: "See booking flow",
  },
  {
    title: "Run the job from one record",
    description: "The full job sheet remains authoritative through work, proof, signatures, and service record output.",
    href: "/solutions",
    action: "See team workflow",
  },
  {
    title: "Keep billing attached to completed work",
    description: "Invoice follow-up, deposits, refunds, and payment truth stay connected to the actual finished job.",
    href: "/pricing",
    action: "See commercial model",
  },
  {
    title: "Stay in control as you grow",
    description: "Permissions, audit surfaces, integrations, and operational readiness are already part of the live system.",
    href: "/security",
    action: "Review controls",
  },
];

export const trustIndicators = [
  {
    title: "Real CTAs only",
    description: "The site points to live signup, pricing, and product pages only. No dead paths, fake demos, or placeholder actions.",
    href: "/pricing",
    action: "See pricing",
  },
  {
    title: "Truthful payment and booking messaging",
    description: "MyTitan billing stays separate from customer money, and deposits or service payments are described according to the real business payment setup.",
    href: "/platform",
    action: "See product flow",
  },
  {
    title: "Security and governance support",
    description: "Tenant boundaries, role-based access, audit surfaces, and readiness checks are visible across the product.",
    href: "/security",
    action: "Review security",
  },
];

export const platformPillars = [
  {
    title: "Capture the work properly",
    description:
      "Start the job with the customer, vehicle, worksheet detail, pricing, and service context already tied together.",
    bullets: [
      "Customer, vehicle, and service detail in one job",
      "Worksheet fields that feed the submitted record instead of a side document",
      "Pricing and payment state kept on the live job from the start",
    ],
    href: "/solutions",
    action: "See team impact",
  },
  {
    title: "Complete the job",
    description:
      "Finish the work with proof, signatures, and technician checks still attached to the same submitted job.",
    bullets: [
      "Before and after photos, torque proof, and sign-off captured in-flow",
      "Customer-safe output prepared from the submitted job, not rebuilt later",
      "Readiness comes from the real job state",
    ],
    href: "/platform",
    action: "See workflow detail",
  },
  {
    title: "Send it and get paid",
    description:
      "Send the finished summary to the customer and keep billing follow-through on the same authority path.",
    bullets: [
      "Customer page and summary PDF published from the completed job",
      "Customer-safe proof, signatures, and documents available online",
      "Invoice and payment continuation tied to the finished work",
    ],
    href: "/pricing",
    action: "See commercial fit",
  },
  {
    title: "Stay in control",
    description:
      "Add control, reporting, and integrations without rebuilding the way the team already works.",
    bullets: [
      "Role-based access and workspace controls",
      "API tokens, webhooks, and delivery logs",
      "Compliance queues, analytics, and multi-location visibility",
    ],
    href: "/security",
    action: "Review controls",
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
    href: "/platform",
    action: "See operating model",
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
    href: "/solutions",
    action: "See workflow fit",
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
    href: "/pricing",
    action: "See plan fit",
  },
];

export const industries = [
  {
    title: "Tyres and workshops",
    description: "Best for teams handling a high daily volume of bookings, jobs, approvals, customer updates, and invoicing.",
    href: "/platform",
    action: "See workflow",
  },
  {
    title: "Field service and mobile teams",
    description: "Best for businesses coordinating dispatch, technician work, proof of completion, and customer follow-through on the move.",
    href: "/solutions",
    action: "See team use",
  },
  {
    title: "Fleet and recurring service businesses",
    description: "Best for teams managing repeat work, service plans, renewal decisions, and a steady flow of customer requests.",
    href: "/platform",
    action: "See recurring work",
  },
  {
    title: "Multi-location service operators",
    description: "Best for businesses standardising process across sites, branches, or regions without losing local visibility.",
    href: "/security",
    action: "See governance",
  },
];

export const securityPoints = [
  {
    title: "Tenant-scoped data",
    description: "Jobs, customers, billing, and integrations stay inside the tenant boundary.",
    href: "/security",
    action: "See tenant model",
  },
  {
    title: "Role-based access",
    description: "Settings, finance actions, technician views, and customer-facing areas stay permission-aware.",
    href: "/solutions",
    action: "See team surfaces",
  },
  {
    title: "Activity history",
    description: "Important actions keep proof and timeline visibility instead of relying on chat or memory.",
    href: "/platform",
    action: "See product chain",
  },
  {
    title: "Compliance queues",
    description: "Operational exceptions and governance work remain visible in product queues.",
    href: "/security",
    action: "Review governance",
  },
  {
    title: "Controlled integrations",
    description: "API tokens, webhooks, delivery logs, and readiness checks help operators wire real integrations safely.",
    href: "/platform",
    action: "See integrations",
  },
  {
    title: "Customer-safe access",
    description: "Customer-facing pages stay separate from internal team views and use scoped access only.",
    href: "/solutions",
    action: "See customer flow",
  },
];

export const pricingTiers = [
  {
    name: "Free",
    priceMonthly: "Free",
    priceAnnual: "Free",
    summary: "For trying the operator workflow with a lighter monthly allowance.",
    completedJobsLabel: "Up to 20 job completions/month",
    completedJobsValue: 20,
    completedJobsHeading: "Completed jobs per month",
    allowanceNote: "A truthful entry point for smaller workloads before you need a paid subscription.",
    upgradeSignal: "you complete more work each month or want the paid commercial path ready.",
    extraJobs: "Extra job packs are £5, £12.50, £25, and £50 when synced and enabled.",
    cta: "Create free workspace",
    href: SIGN_UP_URL,
  },
  {
    name: "Sole Trader",
    priceMonthly: "£19 per month",
    priceAnnual: "£190 per year, billed annually",
    summary: "For solo operators and owner-led workshops.",
    completedJobsLabel: "Up to 60 job completions/month",
    completedJobsValue: 60,
    completedJobsHeading: "Completed jobs per month",
    allowanceNote: "Clear allowance for a steady solo workload without changing how jobs are completed.",
    upgradeSignal: "scheduling, approvals, or repeat work become part of the daily flow.",
    extraJobs: "Extra job packs are £5, £12.50, £25, and £50 when synced and enabled.",
    cta: "Start 14-day trial",
    href: SIGN_UP_URL,
  },
  {
    name: "Business",
    priceMonthly: "£59 per month",
    priceAnnual: "£590 per year, billed annually",
    summary: "For growing teams handling more daily throughput.",
    completedJobsLabel: "Up to 200 job completions/month",
    completedJobsValue: 200,
    completedJobsHeading: "Completed jobs per month",
    allowanceNote: "Built for a busier workshop or service team before you need full scale controls.",
    upgradeSignal: "bookings, repeat work, and customer self-serve become core to daily throughput.",
    extraJobs: "Extra job packs are £5, £12.50, £25, and £50 when synced and enabled.",
    cta: "Start 14-day trial",
    href: SIGN_UP_URL,
    featured: true,
  },
  {
    name: "Enterprise",
    priceMonthly: "£159 per month",
    priceAnnual: "£1,590 per year, billed annually",
    summary: "For larger businesses.",
    completedJobsLabel: "Up to 500 job completions/month",
    completedJobsValue: 500,
    completedJobsHeading: "Completed jobs per month",
    allowanceNote: "For larger service operations that need more room before planning add-on capacity.",
    upgradeSignal: "integrations, governance, or multi-site control become commercially important.",
    extraJobs: "Extra job packs are £5, £12.50, £25, and £50 when synced and enabled.",
    cta: "Start 14-day trial",
    href: SIGN_UP_URL,
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
