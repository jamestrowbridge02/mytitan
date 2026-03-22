import Link from "next/link";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import {
  MarketingCapabilityCard,
  MarketingCtaBand,
  MarketingPageHero,
  MarketingSectionHeading,
} from "../components/marketing/Sections";
import { platformPillars, SIGN_IN_URL } from "../lib/site-content";

export default function PlatformPage() {
  return (
    <MarketingShell>
      <MarketingSeo
        title="Platform"
        description="See how MyTitan brings jobs, customers, billing, and team control into one connected product."
        path="/platform"
      />

      <MarketingPageHero
        eyebrow="Platform"
        title="See how the work stays connected from booking to billing."
        lead="This page shows how MyTitan keeps the booking, the live job, the customer record, and the billing follow-through in one product."
        actions={<Link className="mkt-btn mkt-btn--primary" href="/demo">Book demo</Link>}
        aside={
          <>
            <div>
              <div className="mkt-hero__asideLabel">What this page explains</div>
              <h2 className="mkt-hero__asideTitle">Where the workflow starts, how the team works, and what happens after the job is done.</h2>
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
          eyebrow="Workflow stages"
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
            />
          ))}
        </div>
      </section>

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="What stays connected"
          title="The job, the customer, and the money stay in the same flow."
          lead="This is the main product difference: work does not need to be re-entered or re-explained as it moves through the business."
        />
        <div className="mkt-grid--2">
          <article className="mkt-proof">
            <h3>For day-to-day teams</h3>
            <p>Dispatch, live jobs, repeat work, missing information, and overdue actions stay visible in the same workspace.</p>
          </article>
          <article className="mkt-proof">
            <h3>For owners and managers</h3>
            <p>Controls, delivery logs, permissions, and reporting are already in place when the team needs more structure.</p>
          </article>
        </div>
      </section>

      <MarketingCtaBand
        title="Walk through the full workflow with your own use case."
        copy="Use a demo to review how MyTitan would handle your bookings, live work, customer communication, approvals, and billing follow-through."
        primaryLabel="Book demo"
        primaryHref="/demo"
        secondaryLabel="Sign in"
        secondaryHref={SIGN_IN_URL}
      />
    </MarketingShell>
  );
}
