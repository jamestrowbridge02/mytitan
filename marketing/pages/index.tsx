import Link from "next/link";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import { ApprovedReviews } from "../components/marketing/ApprovedReviews";
import { BESPOKE_ACCOUNT_URL, pricingTiers, SIGN_IN_URL, SIGN_UP_URL } from "../lib/site-content";

const OPERATING_SECTIONS = [
  {
    title: "Operational command centre",
    copy: "See the work that needs attention, the jobs moving today, and the commercial follow-through that cannot wait.",
    proof: ["Live work priorities", "Location-aware pressure", "Source-linked reporting"],
  },
  {
    title: "Booking and calendar flow",
    copy: "Publish real services and availability, receive booking requests, schedule the work, and keep customers on a clear status path.",
    proof: ["Public booking controls", "Day, week, and month planning", "Service, team, and location colours"],
  },
  {
    title: "Job sheets and proof-of-work",
    copy: "Keep notes, configured fields, photos, signatures, parts, and completion evidence on the authoritative job record.",
    proof: ["Configurable job sheets", "Media and signatures", "Customer-ready completion output"],
  },
  {
    title: "Customer portal and payments",
    copy: "Give customers a safe view of progress, approvals, completion records, invoices, and the payment route the business actually uses.",
    proof: ["Customer-safe portal", "Approval workflows", "Truthful payment state"],
  },
  {
    title: "Inventory, suppliers, and media records",
    copy: "Track parts, stock locations, supplier references, purchase orders, and job media without losing the link to live work.",
    proof: ["Stock pressure", "Internal purchasing", "Job-linked evidence"],
  },
  {
    title: "Offline field workflow",
    copy: "Technicians can carry assigned job context, queue supported field updates, and return work through controlled sync paths.",
    proof: ["Assigned-work scope", "Conflict-aware sync", "Dedicated mobile workflow"],
  },
];

const INTEGRATIONS = [
  ["Xero", "Accounting connection and onboarding are readiness-gated until the workspace completes provider setup."],
  ["QuickBooks", "Accounting connection and onboarding are readiness-gated until the workspace completes provider setup."],
  ["Google Calendar", "Calendar connection surfaces are available with tenant-owned setup and controlled export paths."],
  ["Microsoft Calendar", "Calendar readiness is available through the governed integration setup."],
  ["Apple iCal", "Standards-based calendar feed support is available for configured workspaces."],
  ["Gmail", "Workspace-owned email setup is supported without exposing credentials in the product."],
  ["Outlook", "Workspace-owned email setup is supported without presenting gated delivery as live."],
];

const TRUST_CONTROLS = [
  "Tenant-scoped data access",
  "Role-based permissions",
  "Audited operational changes",
  "Timed and reason-gated support mode",
  "Billing boundaries that keep MyTitan subscriptions separate from customer money",
  "Backup and restore readiness evidence",
];

const LAUNCH_PROOF = [
  {
    label: "Payments",
    value: "Tenant-owned",
    detail: "Customer deposits and invoice payments use the business payment setup, not MyTitan billing Stripe.",
  },
  {
    label: "Provider readiness",
    value: "Truthful",
    detail: "Stripe, accounting, email, calendar, and webhook surfaces show setup state before any live claim.",
  },
  {
    label: "Operations",
    value: "Audited",
    detail: "Commercial controls, support mode, launch checks, and platform actions keep a reasoned audit trail.",
  },
  {
    label: "Launch status",
    value: "Evidence-led",
    detail: "External uptime, canary, and backup checks are shown as configured only when real evidence exists.",
  },
];

export default function MarketingHome() {
  return (
    <MarketingShell>
      <MarketingSeo
        title="Field Service Operating System"
        description="MyTitan connects booking, scheduling, job sheets, proof-of-work, customer portals, inventory, reporting, and payment follow-through for field-service teams."
      />

      <section className="mkt-billionHero">
        <div className="mkt-billionHero__copy">
          <img src="/brand/mytitan-logo-dark.svg" alt="MyTitan" className="mkt-billionHero__logo" />
          <h1>Run field service from one clear system.</h1>
          <p className="mkt-billionHero__lead">
            Connect bookings, jobs, customer updates, invoices, and payment follow-through without losing the work between teams.
          </p>
          <div className="mkt-billionHero__actions">
            <a className="mkt-btn mkt-btn--primary" href={SIGN_UP_URL}>Start 14-day trial</a>
          </div>
        </div>

        <div className="mkt-productSurface" data-testid="marketing-command-centre-preview" aria-label="MyTitan operational command centre preview">
          <div className="mkt-productSurface__top">
            <div>
              <strong>Operational command centre</strong>
            </div>
            <span>Sample preview</span>
          </div>
          <div className="mkt-productSurface__metrics">
            <div><small>Bookings</small><strong>24</strong></div>
            <div><small>Active jobs</small><strong>17</strong></div>
            <div><small>Awaiting approval</small><strong>3</strong></div>
            <div><small>Outstanding invoices</small><strong>5</strong></div>
          </div>
          <div className="mkt-productSurface__timeline">
            <div><i className="is-blue" /><span><strong>Booking confirmed</strong><small>09:20</small></span></div>
            <div><i className="is-orange" /><span><strong>Job in progress</strong><small>10:05</small></span></div>
            <div><i className="is-green" /><span><strong>Completion ready</strong><small>11:40</small></span></div>
            <div><i className="is-violet" /><span><strong>Invoice sent</strong><small>12:15</small></span></div>
          </div>
          <div className="mkt-productSurface__status">
            <span>Today</span>
            <strong>Work and follow-up in one view</strong>
          </div>
        </div>
      </section>

      <section className="mkt-workflowStrip" aria-label="MyTitan workflow">
        {["Book work", "Complete jobs", "Get paid", "Grow"].map((step) => (
          <div key={step}>
            <span aria-hidden="true" />
            <strong>{step}</strong>
          </div>
        ))}
      </section>

      <section className="mkt-proofStrip" aria-label="Core product truths">
        <div><strong>One record</strong><span>from booking through completion</span></div>
        <div><strong>One customer path</strong><span>for status, proof, approvals, and payment</span></div>
        <div><strong>Clear boundaries</strong><span>for tenants, roles, billing, and support</span></div>
      </section>

      <section className="mkt-editorialSection" id="features">
        <div className="mkt-editorialSection__intro">
          <p>Run the whole operation</p>
          <h2>Every stage of field service should strengthen the next.</h2>
          <span>MyTitan keeps operational detail attached to the work instead of scattering it across disconnected tools.</span>
        </div>
        <div className="mkt-operatingGrid">
          {OPERATING_SECTIONS.map((item) => (
            <details className="mkt-operatingCard" key={item.title}>
              <summary>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
                <span>View details</span>
              </summary>
              <ul>{item.proof.map((proof) => <li key={proof}>{proof}</li>)}</ul>
            </details>
          ))}
        </div>
      </section>

      <section className="mkt-darkSection">
        <div>
          <p className="mkt-darkSection__eyebrow">Business intelligence</p>
          <h2>See the pressure behind the numbers, then open the source record.</h2>
          <p>Operational reporting, capacity, revenue follow-through, stock demand, and completion velocity stay grounded in retained workspace data.</p>
          <Link className="mkt-btn mkt-btn--dark" href="/platform">Explore the platform</Link>
        </div>
        <div className="mkt-intelligencePanel">
          <div><span>Workload</span><strong>Source-linked</strong></div>
          <div><span>Revenue</span><strong>Evidence-led</strong></div>
          <div><span>Capacity</span><strong>Location-aware</strong></div>
          <div><span>Risk</span><strong>Explainable</strong></div>
        </div>
      </section>

      <section className="mkt-editorialSection" id="integrations">
        <div className="mkt-editorialSection__intro">
          <p>Integration readiness</p>
          <h2>Connect the tools you own, with setup state shown truthfully.</h2>
          <span>Provider credentials remain tenant-owned. Readiness-gated connections are never described as live before their safety gates pass.</span>
        </div>
        <div className="mkt-integrationGrid">
          {INTEGRATIONS.map(([name, description]) => (
            <article key={name}>
              <div><h3>{name}</h3><p>{description}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mkt-trustSection">
        <div>
          <p>Security and operational trust</p>
          <h2>Controls designed around real workspace boundaries.</h2>
          <span>Review the controls and operational evidence available in MyTitan today.</span>
        </div>
        <ul>{TRUST_CONTROLS.map((control) => <li key={control}>{control}</li>)}</ul>
        <Link className="mkt-btn" href="/security">Review security</Link>
      </section>

      <section className="mkt-launchProof" aria-label="Launch proof and readiness">
        <div className="mkt-launchProof__intro">
          <p>Launch proof</p>
          <h2>Premium should also mean honest.</h2>
          <span>MyTitan presents the state the product can prove today. Setup-dependent providers, live payment checks, uptime monitoring, and canary evidence are never dressed up as complete before they are configured.</span>
        </div>
        <div className="mkt-launchProof__grid">
          {LAUNCH_PROOF.map((item) => (
            <article key={item.label} className="mkt-launchProof__card">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
        <div className="mkt-actions">
          <Link className="mkt-btn" href="/security">Review controls</Link>
          <Link className="mkt-btn mkt-btn--ghost" href="/contact">Ask about launch checks</Link>
        </div>
      </section>

      <ApprovedReviews />

      <section className="mkt-editorialSection mkt-editorialSection--pricing">
        <div className="mkt-editorialSection__intro">
          <p>Pricing clarity</p>
          <h2>Monthly completed-job allowances are clear from the start.</h2>
          <span>Choose the operating capacity that fits now. Standard job packs remain available, while larger operations can request a controlled bespoke allowance review.</span>
        </div>
        <div className="mkt-planGrid">
          {pricingTiers.map((tier) => (
            <Link key={tier.name} href="/pricing" className="mkt-planCard" data-testid={`marketing-home-plan-${tier.name.toLowerCase().replace(/\s+/g, "-")}`}>
              <span>{tier.name}</span>
              <strong>{tier.priceMonthly}</strong>
              <p>{tier.completedJobsLabel}</p>
              <small>{tier.summary}</small>
            </Link>
          ))}
        </div>
        <div className="mkt-actions">
          <Link className="mkt-btn" href="/pricing">Compare plans</Link>
          <Link className="mkt-btn mkt-btn--ghost" href={BESPOKE_ACCOUNT_URL}>Discuss bespoke account</Link>
        </div>
      </section>

      <section className="mkt-billionFinal">
        <p>Build the operating rhythm once.</p>
        <h2>Book the work. Prove the result. Keep revenue moving.</h2>
        <div>
          <a className="mkt-btn mkt-btn--primary" href={SIGN_UP_URL}>Start 14-day trial</a>
          <Link className="mkt-btn" href="/contact">Contact Us</Link>
          <a className="mkt-btn mkt-btn--ghost" href={SIGN_IN_URL}>Sign In</a>
        </div>
      </section>
    </MarketingShell>
  );
}
