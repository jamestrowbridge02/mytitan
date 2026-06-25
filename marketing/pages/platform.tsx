import Link from "next/link";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import {
  MarketingCapabilityCard,
  MarketingCtaBand,
  MarketingPageHero,
  MarketingSectionHeading,
} from "../components/marketing/Sections";
import { platformPillars, SIGN_IN_URL, SIGN_UP_URL } from "../lib/site-content";

export default function PlatformPage() {
  return (
    <MarketingShell>
      <MarketingSeo
        title="How it works"
        description="See how MyTitan keeps jobs, customers, billing, and team control connected."
        path="/platform"
      />

      <MarketingPageHero
        eyebrow="How it works"
        title="See how work stays connected from booking to billing."
        lead="This page shows how MyTitan keeps the booking, the live job, the customer record, and the billing follow-through in one product."
        actions={<a className="mkt-btn mkt-btn--primary" href={SIGN_UP_URL}>Create your workspace</a>}
        meta={
          <>
            <span className="mkt-chip">Booking to billing in one system</span>
            <span className="mkt-chip">Customer-safe output from the real job</span>
            <span className="mkt-chip">Controls stay attached as you grow</span>
          </>
        }
        aside={
          <>
            <div>
              <div className="mkt-hero__asideLabel">What this page explains</div>
              <h2 className="mkt-hero__asideTitle">Where work starts, how the team runs it, and what happens after the job is done.</h2>
            </div>
            <div className="mkt-card">
              <h3>Before work</h3>
              <p>Bookings, schedules, and customer context are created in the same system.</p>
            </div>
            <div className="mkt-card">
              <h3>After work</h3>
              <p>Approvals, billing, repeat service, and reporting stay connected to the original job.</p>
            </div>
          </>
        }
      />

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Step by step"
          title="The product follows the way service work actually moves."
          lead="Each stage below shows how MyTitan keeps the job journey connected instead of splitting it across separate systems."
        />
        <div className="mkt-grid--2">
          {platformPillars.map((pillar) => (
            <MarketingCapabilityCard
              key={pillar.title}
              title={pillar.title}
              description={pillar.description}
              bullets={pillar.bullets}
              href={pillar.href}
              actionLabel={pillar.action}
            />
          ))}
        </div>
      </section>

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Why it matters"
          title="The job, the customer, and the money stay in the same flow."
          lead="This is the main product difference: work does not need to be re-entered or re-explained as it moves through the business."
        />
        <div className="mkt-grid--2">
          <Link className="mkt-proof mkt-linkCard" href="/solutions">
            <h3>For day-to-day teams</h3>
            <p>Dispatch, live jobs, repeat work, missing information, and overdue actions stay visible in the same workspace.</p>
            <span className="mkt-inlineLink">See team workflows</span>
          </Link>
          <Link className="mkt-proof mkt-linkCard" href="/security">
            <h3>For owners and managers</h3>
            <p>Controls, delivery logs, permissions, and reporting are already in place when the team needs more structure.</p>
            <span className="mkt-inlineLink">Review control surfaces</span>
          </Link>
        </div>
      </section>

      <MarketingCtaBand
        title="Walk through the full flow with your own use case."
        copy="Review the workflow, choose your plan, then create the workspace and booking link that match your operation."
        primaryLabel="Create your workspace"
        primaryHref={SIGN_UP_URL}
        secondaryLabel="Sign in"
        secondaryHref={SIGN_IN_URL}
      />
    </MarketingShell>
  );
}
