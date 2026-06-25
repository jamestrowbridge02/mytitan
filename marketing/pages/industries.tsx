import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import {
  MarketingCtaBand,
  MarketingPageHero,
  MarketingSectionHeading,
} from "../components/marketing/Sections";
import { industries, SIGN_IN_URL, SIGN_UP_URL } from "../lib/site-content";

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
        actions={<a className="mkt-btn mkt-btn--primary" href={SIGN_UP_URL}>Start now</a>}
        meta={
          <>
            <span className="mkt-chip">Busy service teams</span>
            <span className="mkt-chip">Recurring and multi-site ready</span>
            <span className="mkt-chip">Customer follow-through built in</span>
          </>
        }
      />

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Where it fits best"
          title="A strong fit for busy, operationally heavy service businesses."
          lead="MyTitan is strongest where daily workload, customer communication, and billing follow-through all matter at the same time."
        />
        <div className="mkt-grid--2">
          {industries.map((industry) => (
            <a key={industry.title} className="mkt-card mkt-linkCard" href={industry.href}>
              <h3>{industry.title}</h3>
              <p>{industry.description}</p>
              <span className="mkt-inlineLink">{industry.action}</span>
            </a>
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
        copy="Review the workflow that matters most in your industry, then create the workspace when the fit is right."
        primaryLabel="Create your workspace"
        primaryHref={SIGN_UP_URL}
        secondaryLabel="Sign in"
        secondaryHref={SIGN_IN_URL}
      />
    </MarketingShell>
  );
}
