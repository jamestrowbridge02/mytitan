import Link from "next/link";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import {
  MarketingCapabilityCard,
  MarketingPageHero,
  MarketingSectionHeading,
} from "../components/marketing/Sections";
import { homepageOutcomes, homepageProblems, platformPillars, securityPoints } from "../lib/site-content";

export default function MarketingHome() {
  return (
    <MarketingShell>
      <MarketingSeo />

      <MarketingPageHero
        brand
        eyebrow="Service business software"
        title="The system that keeps jobs, customers, and billing in sync."
        lead="MyTitan gives service businesses one clear place to run bookings, jobs, scheduling, customer updates, approvals, and billing."
        actions={
          <Link className="mkt-btn mkt-btn--primary" href="/demo">
            Book demo
          </Link>
        }
        aside={
          <div className="mkt-stack-lg">
            <div>
              <div className="mkt-hero__asideLabel">Best for teams that feel stretched</div>
              <h2 className="mkt-hero__asideTitle">If the work is moving but the follow-through is messy, this is the gap MyTitan closes.</h2>
            </div>
            <div className="mkt-card">
              <h3>Stop switching tools</h3>
              <p>Run the job, the customer communication, and the billing follow-through in one system.</p>
            </div>
            <div className="mkt-card">
              <h3>See the day clearly</h3>
              <p>Know what is booked, blocked, overdue, or waiting for approval without chasing updates.</p>
            </div>
            <div className="mkt-card">
              <h3>Protect revenue</h3>
              <p>Keep quotes, approvals, repeat work, and billing tied to the job that created them.</p>
            </div>
          </div>
        }
      />

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="What goes wrong without one system"
          title="Most service businesses are not short on work. They are short on clarity."
          lead="MyTitan is built for the problems that show up when jobs, customer communication, and billing are managed in separate places."
        />
        <div className="mkt-grid--2">
          {homepageProblems.map((item) => (
            <article key={item.title} className="mkt-proof">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <p><strong>With MyTitan:</strong> {item.outcome}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="What changes after rollout"
          title="The team gets one clear flow instead of constant handoffs."
          lead="MyTitan is designed so the work, the customer, and the money stay connected from start to finish."
        />
        <div className="mkt-grid--2">
          {homepageOutcomes.map((item) => (
            <article key={item} className="mkt-card">
              <h3>{item}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="How it holds together"
          title="One workflow from booking to billing."
          lead="MyTitan keeps the key stages of the service journey inside one connected product."
        />
        <div className="mkt-grid--2">
          {platformPillars.slice(0, 3).map((pillar) => (
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
          eyebrow="Why teams trust it"
          title="Built to stay usable as the business gets more complex."
          lead="MyTitan already includes the controls service businesses need once more people, sites, and billing complexity are in play."
        />
        <div className="mkt-grid--2">
          <article className="mkt-proof">
            <h3>Built-in control</h3>
            <p>Permissions, tenant boundaries, and customer-safe access are part of the live product from the start.</p>
          </article>
          <article className="mkt-proof">
            <h3>Real operational depth</h3>
            <p>Jobs, repeat work, approvals, billing follow-through, and reporting all live in the same system.</p>
          </article>
        </div>
      </section>

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Security"
          title="Control is built in."
          lead="Tenant boundaries, permissions, audit history, and customer-safe access are part of the product from the start."
        />
        <div className="mkt-grid--2">
          <article className="mkt-proof">
            <h3 style={{ marginTop: 0 }}>Control at every layer</h3>
            <p>
              Workspace permissions, tenant scope, compliance controls, and integration visibility are already part of the live product.
            </p>
            <div className="mkt-actions" style={{ marginTop: 18 }}>
              <Link className="mkt-btn mkt-btn--primary" href="/demo">
                Book demo
              </Link>
            </div>
          </article>
          <div className="mkt-card" style={{ padding: 24 }}>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 10, color: "var(--muted)" }}>
              {securityPoints.slice(0, 5).map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-final">
          <div className="mkt-eyebrow">Final step</div>
          <h2 className="mkt-sectionTitle" style={{ marginTop: 14 }}>
            See how MyTitan would fit the way your business actually runs.
          </h2>
          <p>
            Use a live demo to review your workflow, team handoffs, customer communication, approvals, and billing follow-through in one pass.
          </p>
          <div className="mkt-actions" style={{ marginTop: 18 }}>
            <Link className="mkt-btn mkt-btn--primary" href="/demo">
              Book demo
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
