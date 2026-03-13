import Link from "next/link";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import {
  MarketingCtaBand,
  MarketingPageHero,
  MarketingSectionHeading,
} from "../components/marketing/Sections";
import { solutionGroups } from "../lib/site-content";

export default function SolutionsPage() {
  return (
    <MarketingShell>
      <MarketingSeo
        title="Solutions"
        description="See how MyTitan supports operations leadership, revenue teams, and platform owners with one controlled operating system."
        path="/solutions"
      />

      <MarketingPageHero
        eyebrow="Solutions"
        title="One platform for the teams that run the business."
        lead="MyTitan is designed so operations, revenue, and platform owners do not need separate systems to get their view of the business."
        actions={
          <>
            <Link className="mkt-btn mkt-btn--primary" href="/demo">
              Request demo
            </Link>
            <Link className="mkt-btn" href="/platform">
              See platform
            </Link>
          </>
        }
      />

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Buyer framing"
          title="A solution set built around real operating responsibilities."
          lead="Each group below maps to product depth already implemented in the platform."
        />
        <div className="mkt-solutionGrid">
          {solutionGroups.map((group) => (
            <article key={group.title} className="mkt-proof">
              <h3>{group.title}</h3>
              <p>{group.description}</p>
              <ul>
                {group.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-grid--2">
          <article className="mkt-card">
            <div className="mkt-eyebrow">Replace fragmentation</div>
            <h2 className="mkt-sectionTitle">Stop buying separate tools for workflow, portal, finance, and reporting.</h2>
            <p>MyTitan keeps the operational and commercial layers connected so every team works from the same durable model.</p>
          </article>
          <article className="mkt-card">
            <div className="mkt-eyebrow">Scale safely</div>
            <h2 className="mkt-sectionTitle">Move from one team to multi-location operations without rebuilding control from scratch.</h2>
            <p>Location-aware filtering, compliance, analytics, permissions, and performance reporting are already part of the operating system.</p>
          </article>
        </div>
      </section>

      <MarketingCtaBand
        title="See the solution path that fits your operating model."
        copy="Start with your highest-pressure workflow, then evaluate how MyTitan closes the rest of the operating gaps without creating more system sprawl."
        primaryLabel="Request demo"
        primaryHref="/demo"
        secondaryLabel="See platform"
        secondaryHref="/platform"
      />
    </MarketingShell>
  );
}
