import Link from "next/link";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import {
  MarketingCapabilityCard,
  MarketingCtaBand,
  MarketingPageHero,
  MarketingSectionHeading,
} from "../components/marketing/Sections";
import { homepageModules, SIGN_IN_URL, SIGN_UP_URL } from "../lib/site-content";

export default function MarketingHome() {
  return (
    <MarketingShell>
      <MarketingSeo />

      <MarketingPageHero
        brand
        eyebrow="Enterprise operations system for service businesses"
        title="Run the whole service business from one controlled operating layer."
        lead="MyTitan connects command-centre operations, recurring service delivery, customer approvals, revenue follow-through, inventory, compliance, and executive visibility in one platform built for real operating pressure."
        actions={
          <>
            <Link className="mkt-btn mkt-btn--primary" href="/demo">
              Request demo
            </Link>
            <Link className="mkt-btn" href="/platform">
              See platform
            </Link>
            <a className="mkt-btn" href={SIGN_UP_URL}>
              Get started
            </a>
          </>
        }
        aside={
          <>
            <div>
              <div className="mkt-hero__asideLabel">Why MyTitan holds up</div>
              <h2 className="mkt-hero__asideTitle">Depth across the full operating model, not a stitched surface.</h2>
            </div>
            <div className="mkt-card">
              <h3>Command-centre control</h3>
              <p>Dispatch pressure, unassigned work, workflow enforcement, technician load, and recurring demand stay in the same system.</p>
            </div>
            <div className="mkt-card">
              <h3>Commercial follow-through</h3>
              <p>Quotes, approvals, collections, customer workspace access, and documents stay close to day-of-work execution.</p>
            </div>
            <div className="mkt-card">
              <h3>Governed scale</h3>
              <p>Multi-location operations, permissions, integrations, compliance controls, and performance visibility are already part of the platform.</p>
            </div>
          </>
        }
      />

      <section className="mkt-section">
        <div className="mkt-kpiGrid">
          <div className="mkt-stat">
            <div className="mkt-stat__value">Control workflow drift</div>
            <div className="mkt-stat__label">Configurable stages, required-field enforcement, and explainable automation keep work moving without hidden exceptions.</div>
          </div>
          <div className="mkt-stat">
            <div className="mkt-stat__value">Scale recurring revenue cleanly</div>
            <div className="mkt-stat__label">Service plans create real bookings and jobs, with renewal, change, and run history visible to operators.</div>
          </div>
          <div className="mkt-stat">
            <div className="mkt-stat__value">Give leadership real visibility</div>
            <div className="mkt-stat__label">Analytics, SLA pressure, compliance exceptions, performance signals, and multi-location views are built into the core platform.</div>
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="What MyTitan is"
          title="One system for operations, revenue, governance, customer visibility, and scale."
          lead="MyTitan replaces fragmented scheduling, workflow, revenue, evidence, and reporting tools with one operating model that stays readable as the business grows."
        />
        <div className="mkt-grid--3">
          <MarketingCapabilityCard
            title="Operate the day cleanly"
            description="Coordinate bookings, jobs, scheduling pressure, technician execution, and completion evidence in one place."
            bullets={[
              "Command centre and bookings/workflow control",
              "Scheduling optimization and capacity awareness",
              "Execution evidence and completion records",
            ]}
          />
          <MarketingCapabilityCard
            title="Keep the customer and money flow connected"
            description="Move from quote to approval, recurring work, collections, and customer workspace follow-through without handoff blind spots."
            bullets={[
              "Quotes, approvals, and collections workflows",
              "Customer accounts, portal-safe records, and documents",
              "Recurring service plans and recurring work engine",
            ]}
          />
          <MarketingCapabilityCard
            title="Scale with control"
            description="Keep governance, location context, integrations, compliance, and performance management native to the platform."
            bullets={[
              "Tenant-scoped RBAC, custom fields, and webhooks",
              "Multi-location operations and location filtering",
              "SLA, compliance, analytics, and compensation-ready metrics",
            ]}
          />
        </div>
      </section>

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Platform modules"
          title="Proof by capability, not by claims."
          lead="Every major operational layer already exists in the platform and can be marketed directly."
        />
        <div className="mkt-moduleGrid">
          {homepageModules.map((module) => (
            <div key={module} className="mkt-moduleItem">
              {module}
            </div>
          ))}
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-grid--2">
          <article className="mkt-proof">
            <div className="mkt-eyebrow">Who it is for</div>
            <h2 className="mkt-sectionTitle">Built for operators, finance leaders, and enterprise buyers who need the same system to hold together.</h2>
            <p>
              MyTitan works for service businesses that have outgrown point tools and need one accountable system for work intake, execution, approvals, billing readiness, customer access, and leadership visibility.
            </p>
            <div className="mkt-actions" style={{ marginTop: 18 }}>
              <Link className="mkt-btn" href="/solutions">
                Explore solutions
              </Link>
              <Link className="mkt-btn" href="/industries">
                View industries
              </Link>
            </div>
          </article>
          <article className="mkt-proof">
            <div className="mkt-eyebrow">Why it is different</div>
            <h2 className="mkt-sectionTitle">It scales from one operator to multi-location governance without changing the operating model.</h2>
            <p>
              The same platform can support a smaller service team, a branch-led operating business, or a franchise-style footprint with permissions, location context, auditability, and compliance pressure already in place.
            </p>
            <div className="mkt-actions" style={{ marginTop: 18 }}>
              <Link className="mkt-btn" href="/security">
                Security and governance
              </Link>
              <a className="mkt-btn" href={SIGN_IN_URL}>
                Open product
              </a>
            </div>
          </article>
        </div>
      </section>

      <MarketingCtaBand
        title="See whether MyTitan fits the way your operation actually runs."
        copy="Walk through the platform with the workflows, compliance pressure, recurring service delivery, and commercial control already in place."
        primaryLabel="Request demo"
        primaryHref="/demo"
        secondaryLabel="See pricing"
        secondaryHref="/pricing"
      />
    </MarketingShell>
  );
}
