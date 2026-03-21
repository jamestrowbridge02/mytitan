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
        description="See how MyTitan supports operations leaders, finance teams, and owners with one clear product."
        path="/solutions"
      />

      <MarketingPageHero
        eyebrow="Solutions"
        title="One product for the teams that run the business."
        lead="MyTitan is designed so operations, finance, and owners do not need separate systems to understand what is happening."
        actions={
          <>
            <Link className="mkt-btn mkt-btn--primary" href="/demo">
              Book demo
            </Link>
            <Link className="mkt-btn" href="/platform">
              See product
            </Link>
          </>
        }
      />

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Buyer framing"
          title="Built around real responsibilities."
          lead="Each group below maps to product depth already implemented in MyTitan."
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
            <div className="mkt-eyebrow">Replace extra tools</div>
            <h2 className="mkt-sectionTitle">Stop buying separate tools for workflow, customer updates, finance, and reporting.</h2>
            <p>MyTitan keeps the work and money layers connected so every team sees the same picture.</p>
          </article>
          <article className="mkt-card">
            <div className="mkt-eyebrow">Scale safely</div>
            <h2 className="mkt-sectionTitle">Move from one team to multiple locations without rebuilding your controls from scratch.</h2>
            <p>Location-aware filtering, compliance, analytics, permissions, and performance reporting are already part of the product.</p>
          </article>
        </div>
      </section>

      <MarketingCtaBand
        title="See the path that fits your team."
        copy="Start with your highest-pressure workflow, then evaluate how MyTitan closes the rest of the gaps without creating more software sprawl."
        primaryLabel="Book demo"
        primaryHref="/demo"
        secondaryLabel="See product"
        secondaryHref="/platform"
      />
    </MarketingShell>
  );
}
