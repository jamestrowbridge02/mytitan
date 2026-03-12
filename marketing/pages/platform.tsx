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
        description="Explore the MyTitan platform across workflow control, recurring service delivery, customer operations, revenue follow-through, governance, and executive visibility."
        path="/platform"
      />

      <MarketingPageHero
        eyebrow="Platform overview"
        title="The full service operations platform, not a stack of disconnected modules."
        lead="MyTitan brings the command surface, execution layer, customer workspace, commercial follow-through, and governance model into one operating system."
        actions={
          <>
            <Link className="mkt-btn mkt-btn--primary" href="/demo">
              Request demo
            </Link>
            <Link className="mkt-btn" href="/pricing">
              See pricing
            </Link>
          </>
        }
        aside={
          <>
            <div>
              <div className="mkt-hero__asideLabel">Platform footprint</div>
              <h2 className="mkt-hero__asideTitle">One model across the service lifecycle.</h2>
            </div>
            <div className="mkt-card">
              <h3>Operational control</h3>
              <p>Bookings, jobs, scheduling pressure, technician execution, and completion evidence stay aligned.</p>
            </div>
            <div className="mkt-card">
              <h3>Commercial continuity</h3>
              <p>Quotes, approvals, collections, and customer visibility stay connected to operational delivery.</p>
            </div>
          </>
        }
      />

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Core pillars"
          title="The main platform capabilities are already integrated."
          lead="Each pillar below maps to real platform layers already implemented in MyTitan."
        />
        <div className="mkt-grid--3">
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
          eyebrow="How it replaces fragmented tools"
          title="Stop switching between workflow, scheduling, finance, portal, evidence, and governance layers."
          lead="MyTitan keeps the operating logic, customer-facing records, and leadership signals on one data model."
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
        title="Take a platform walkthrough with the real operating layers in place."
        copy="Review the command centre, workflow controls, revenue operations, inventory, compliance, and leadership visibility in one pass."
        primaryLabel="Request demo"
        primaryHref="/demo"
        secondaryLabel="Get started"
        secondaryHref={SIGN_UP_URL}
      />
    </MarketingShell>
  );
}
