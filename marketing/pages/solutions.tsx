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
        description="See how MyTitan helps owners, service managers, and admin teams run the business from one shared system."
        path="/solutions"
      />

      <MarketingPageHero
        eyebrow="Solutions"
        title="Made for the people who keep the day moving."
        lead="MyTitan helps owners, service managers, dispatch teams, and admin staff work from the same clear picture."
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
          eyebrow="Who it helps"
          title="Built around real responsibilities."
          lead="Each group below reflects a real part of the service workflow already supported in the product."
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
            <h2 className="mkt-sectionTitle">Stop switching between separate systems to run one job.</h2>
            <p>MyTitan keeps the work, the customer communication, and the money tied together so every team sees the same picture.</p>
          </article>
          <article className="mkt-card">
            <div className="mkt-eyebrow">Scale safely</div>
            <h2 className="mkt-sectionTitle">Grow from one team to multiple sites without losing control.</h2>
            <p>Location-aware filtering, permissions, compliance, and reporting are already part of the product.</p>
          </article>
        </div>
      </section>

      <MarketingCtaBand
        title="See the setup that fits your team."
        copy="Start with the workflow under the most pressure, then see how MyTitan closes the rest of the gaps without adding more software sprawl."
        primaryLabel="Book demo"
        primaryHref="/demo"
        secondaryLabel="See product"
        secondaryHref="/platform"
      />
    </MarketingShell>
  );
}
