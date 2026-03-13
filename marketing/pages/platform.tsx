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
        description="Explore the MyTitan platform across operations control, revenue continuity, customer workspace, governance, and executive visibility."
        path="/platform"
      />

      <MarketingPageHero
        eyebrow="Platform overview"
        title="The operating system for service businesses."
        lead="MyTitan brings the command surface, customer workspace, revenue layer, and governance model into one platform."
        actions={
          <>
            <Link className="mkt-btn mkt-btn--primary" href="/demo">
              Request demo
            </Link>
            <Link className="mkt-btn" href="/">
              See platform
            </Link>
          </>
        }
        aside={
          <>
            <div>
              <div className="mkt-hero__asideLabel">Platform footprint</div>
              <h2 className="mkt-hero__asideTitle">One model across the operating lifecycle.</h2>
            </div>
            <div className="mkt-card">
              <h3>Operational control</h3>
              <p>Bookings, jobs, scheduling pressure, technician execution, and completion evidence stay aligned.</p>
            </div>
            <div className="mkt-card">
              <h3>Revenue continuity</h3>
              <p>Quotes, approvals, collections, and customer visibility stay connected to operational delivery.</p>
            </div>
          </>
        }
      />

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Core pillars"
          title="Four pillars, one platform."
          lead="Each pillar maps to real product depth already implemented in MyTitan."
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
          title="Stop stitching the operating model together."
          lead="MyTitan keeps workflow, customer-facing records, revenue signals, and governance on one system of record."
        />
        <div className="mkt-grid--2">
          <article className="mkt-proof">
            <h3>For day-to-day operators</h3>
            <p>Dispatch, capacity pressure, service-plan runs, missing required information, and overdue work remain visible in the same command layer.</p>
          </article>
          <article className="mkt-proof">
            <h3>For platform owners</h3>
            <p>Permissions, custom fields, integrations, webhook delivery logs, activity history, and compliance controls are native instead of bolted on later.</p>
          </article>
        </div>
      </section>

      <MarketingCtaBand
        title="Take a platform walkthrough with the operating layers already in place."
        copy="Review command centre work, customer workspace, revenue continuity, inventory, compliance, and leadership visibility in one pass."
        primaryLabel="Request demo"
        primaryHref="/demo"
        secondaryLabel="Get started"
        secondaryHref={SIGN_UP_URL}
      />
    </MarketingShell>
  );
}
