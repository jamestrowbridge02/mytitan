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
        description="See where MyTitan fits across field service, recurring maintenance, multi-location operations, and commercial service delivery."
        path="/industries"
      />

      <MarketingPageHero
        eyebrow="Industries"
        title="Built for service businesses with real operating complexity."
        lead="MyTitan fits teams where workflow drift, dispatch pressure, customer follow-through, and control gaps have real cost."
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
          eyebrow="Segments"
          title="A fit for teams that need one product to hold together."
          lead="The strongest fit is where operations, billing follow-through, and team controls all matter."
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
          <h2 className="mkt-sectionTitle">From a focused team to a multi-location operating group.</h2>
          <p>
            MyTitan can support a focused operator today, then extend into broader live oversight, recurring service delivery,
            finance operations, compliance pressure, and location-based visibility as complexity increases.
          </p>
        </div>
      </section>

      <MarketingCtaBand
        title="Map MyTitan to your service model."
        copy="Use a demo to walk through the workflows that matter most for your segment, then evaluate how the broader product closes the rest of the gaps."
        primaryLabel="Book demo"
        primaryHref="/demo"
        secondaryLabel="See product"
        secondaryHref="/platform"
      />
    </MarketingShell>
  );
}
