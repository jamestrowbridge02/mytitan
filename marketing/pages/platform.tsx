import Link from "next/link";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import {
  MarketingCapabilityCard,
  MarketingCtaBand,
  MarketingPageHero,
  MarketingSectionHeading,
} from "../components/marketing/Sections";
import { platformPillars, SIGN_UP_URL } from "../lib/site-content";

export default function PlatformPage() {
  return (
    <MarketingShell>
      <MarketingSeo
        title="Platform"
        description="Explore the MyTitan product across day-to-day operations, billing follow-through, customer workspace, controls, and reporting."
        path="/platform"
      />

      <MarketingPageHero
        eyebrow="Platform overview"
        title="The product that keeps the service business in sync."
        lead="MyTitan brings live work, customer records, billing follow-through, and team controls into one product."
        actions={
          <>
            <Link className="mkt-btn mkt-btn--primary" href="/demo">
              Book demo
            </Link>
            <Link className="mkt-btn" href="/">
              See home
            </Link>
          </>
        }
        aside={
          <>
            <div>
              <div className="mkt-hero__asideLabel">Product footprint</div>
              <h2 className="mkt-hero__asideTitle">One product across the full service cycle.</h2>
            </div>
            <div className="mkt-card">
              <h3>Day-to-day control</h3>
              <p>Bookings, jobs, scheduling pressure, technician work, and proof of completion stay aligned.</p>
            </div>
            <div className="mkt-card">
              <h3>Billing follow-through</h3>
              <p>Quotes, approvals, collections, and customer visibility stay connected to the work being delivered.</p>
            </div>
          </>
        }
      />

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Core pillars"
          title="Four pillars, one product."
          lead="Each pillar maps to product depth already implemented in MyTitan."
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
          eyebrow="One model"
          title="Stop stitching the business together."
          lead="MyTitan keeps workflow, customer-facing records, billing signals, and team controls in one place."
        />
        <div className="mkt-grid--2">
          <article className="mkt-proof">
            <h3>For day-to-day operators</h3>
            <p>Dispatch, capacity pressure, service-plan runs, missing information, and overdue work remain visible in the same live layer.</p>
          </article>
          <article className="mkt-proof">
            <h3>For owners and managers</h3>
            <p>Permissions, custom fields, integrations, delivery logs, activity history, and compliance controls are built in instead of bolted on later.</p>
          </article>
        </div>
      </section>

      <MarketingCtaBand
        title="Take a guided walkthrough of the product."
        copy="Review live work, customer workspace, billing follow-through, inventory, compliance, and reporting in one pass."
        primaryLabel="Book demo"
        primaryHref="/demo"
        secondaryLabel="Start trial"
        secondaryHref={SIGN_UP_URL}
      />
    </MarketingShell>
  );
}
