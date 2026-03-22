import Link from "next/link";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import {
  MarketingCtaBand,
  MarketingPageHero,
  MarketingSectionHeading,
} from "../components/marketing/Sections";
import { industries } from "../lib/site-content";

export default function IndustriesPage() {
  return (
    <MarketingShell>
      <MarketingSeo
        title="Industries"
        description="See where MyTitan fits across tyres, workshops, field service, mobile teams, fleets, and recurring service businesses."
        path="/industries"
      />

      <MarketingPageHero
        eyebrow="Industries"
        title="Built for service businesses that run on detail and follow-through."
        lead="MyTitan fits teams where workflow drift, dispatch pressure, customer follow-up, and billing delays have a real cost."
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
          eyebrow="Where it fits best"
          title="A strong fit for busy, operationally heavy teams."
          lead="The strongest fit is where operations, customer communication, and billing follow-through all matter every day."
        />
        <div className="mkt-grid--2">
          {industries.map((industry) => (
            <article key={industry.title} className="mkt-card">
              <h3>{industry.title}</h3>
              <p>{industry.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-proof">
          <div className="mkt-eyebrow">Growth path</div>
          <h2 className="mkt-sectionTitle">Start with one team. Keep the same system as you grow.</h2>
          <p>
            MyTitan can support a focused operator today, then extend into broader oversight, recurring service delivery,
            finance follow-through, compliance pressure, and location-based visibility as complexity increases.
          </p>
        </div>
      </section>

      <MarketingCtaBand
        title="Map MyTitan to your service model."
        copy="Use a demo to walk through the workflows that matter most for your business, then evaluate how the wider product closes the rest of the gaps."
        primaryLabel="Book demo"
        primaryHref="/demo"
        secondaryLabel="See product"
        secondaryHref="/platform"
      />
    </MarketingShell>
  );
}
