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
        title="See where MyTitan is the strongest fit."
        lead="This page is for businesses deciding whether their service model matches the way MyTitan is built."
        actions={<Link className="mkt-btn mkt-btn--primary" href="/demo">Book demo</Link>}
      />

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Where it fits best"
          title="A strong fit for busy, operationally heavy service businesses."
          lead="MyTitan is strongest where daily workload, customer communication, and billing follow-through all matter at the same time."
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
          <div className="mkt-eyebrow">What these industries have in common</div>
          <h2 className="mkt-sectionTitle">They all need strong follow-through after the booking is made.</h2>
          <p>
            If the job is only one part of the challenge and the real pressure is in updates, approvals, repeat work, and billing, MyTitan is usually a much better fit than a basic booking tool.
          </p>
        </div>
      </section>

      <MarketingCtaBand
        title="Map MyTitan to your service model."
        copy="Use a demo to walk through the workflow that matters most in your industry, then review whether the rest of the product matches your business shape."
        primaryLabel="Book demo"
        primaryHref="/demo"
        secondaryLabel="Sign in"
        secondaryHref="https://app.mytitan.co.uk/login"
      />
    </MarketingShell>
  );
}
