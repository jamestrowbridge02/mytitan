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
        lead="MyTitan fits teams where workflow drift, dispatch pressure, customer follow-through, and governance gaps have real operational cost."
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
          eyebrow="Segments"
          title="A fit for operators who need one system to hold together."
          lead="The platform depth is strongest where operations, commercial follow-through, and governance all matter."
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
          <div className="mkt-eyebrow">Operating scale</div>
          <h2 className="mkt-sectionTitle">From a focused team to a multi-location operating group.</h2>
          <p>
            MyTitan can support a focused operator today, then extend into broader command-centre oversight, recurring service delivery,
            finance operations, compliance pressure, and location-based visibility as complexity increases.
          </p>
        </div>
      </section>

      <MarketingCtaBand
        title="Map MyTitan to your service model."
        copy="Use a demo to walk through the workflows that matter most for your segment, then evaluate how the broader platform closes the rest of the gaps."
        primaryLabel="Request demo"
        primaryHref="/demo"
        secondaryLabel="See platform"
        secondaryHref="/platform"
      />
    </MarketingShell>
  );
}
