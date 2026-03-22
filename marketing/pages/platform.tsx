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
        description="See how MyTitan brings jobs, customers, billing, and team control into one connected product."
        path="/platform"
      />

      <MarketingPageHero
        eyebrow="Platform"
        title="One product for the whole service workflow."
        lead="MyTitan keeps jobs, customer records, approvals, billing, and team controls connected from start to finish."
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
              <div className="mkt-hero__asideLabel">What teams get</div>
              <h2 className="mkt-hero__asideTitle">One shared view of the work, the customer, and the money.</h2>
            </div>
            <div className="mkt-card">
              <h3>Day-to-day control</h3>
              <p>Bookings, jobs, schedules, technician work, and proof of completion stay aligned.</p>
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
          eyebrow="Core areas"
          title="Built around real operating needs."
          lead="Each area below already maps to working product depth inside MyTitan."
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
          eyebrow="Why it matters"
          title="Stop stitching the business together."
          lead="MyTitan keeps work, customer records, billing signals, and team controls in one place."
        />
        <div className="mkt-grid--2">
          <article className="mkt-proof">
            <h3>For day-to-day teams</h3>
            <p>Dispatch, capacity pressure, repeat work, missing information, and overdue jobs stay visible in the same live workspace.</p>
          </article>
          <article className="mkt-proof">
            <h3>For owners and managers</h3>
            <p>Permissions, integrations, delivery logs, activity history, and compliance controls are built in instead of bolted on later.</p>
          </article>
        </div>
      </section>

      <MarketingCtaBand
        title="Take a guided walkthrough of the product."
        copy="Review live work, customer experience, billing follow-through, inventory, compliance, and reporting in one pass."
        primaryLabel="Book demo"
        primaryHref="/demo"
        secondaryLabel="Get started"
        secondaryHref={SIGN_UP_URL}
      />
    </MarketingShell>
  );
}
