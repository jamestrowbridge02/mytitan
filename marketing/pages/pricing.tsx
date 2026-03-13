import { useState } from "react";
import Link from "next/link";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import {
  MarketingCtaBand,
  MarketingPageHero,
  MarketingSectionHeading,
} from "../components/marketing/Sections";
import { pricingTiers } from "../lib/site-content";

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <MarketingShell>
      <MarketingSeo
        title="Pricing"
        description="Review MyTitan pricing across focused operators, growing teams, and enterprise multi-location deployments."
        path="/pricing"
      />

      <MarketingPageHero
        eyebrow="Pricing"
        title="Pricing aligned to operating complexity."
        lead="MyTitan pricing is positioned around operational depth, team control, and platform scale."
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
        <div className="mkt-pricingHeader">
          <MarketingSectionHeading
            eyebrow="Commercial model"
            title="Choose the tier that matches the team and operating complexity."
            lead="Enterprise buyers can use the demo path for rollout and governance planning. Smaller teams can start directly."
          />
          <div className="mkt-actions">
            <button className={`mkt-btn${annual ? "" : " mkt-btn--primary"}`} type="button" onClick={() => setAnnual(false)}>
              Monthly
            </button>
            <button className={`mkt-btn${annual ? " mkt-btn--primary" : ""}`} type="button" onClick={() => setAnnual(true)}>
              Annual
            </button>
          </div>
        </div>

        <div className="mkt-pricing">
          {pricingTiers.map((tier) => (
            <article key={tier.name} className={`mkt-pricingCard${tier.featured ? " mkt-pricingCard--featured" : ""}`}>
              <h3>{tier.name}</h3>
              <p className="mkt-pricingCard__price">{annual ? tier.priceAnnual : tier.priceMonthly}</p>
              <p>{tier.summary}</p>
              {tier.href.startsWith("/") ? (
                <Link className="mkt-inlineLink" href={tier.href}>
                  {tier.cta}
                </Link>
              ) : (
                <a className="mkt-inlineLink" href={tier.href}>
                  {tier.cta}
                </a>
              )}
            </article>
          ))}
        </div>
      </section>

      <MarketingCtaBand
        title="Use a commercial walkthrough if you need a broader rollout plan."
        copy="The demo path is the right place to review deployment shape, multi-location scope, governance expectations, and how the platform maps to your operating pressure."
        primaryLabel="Request demo"
        primaryHref="/demo"
        secondaryLabel="See platform"
        secondaryHref="/platform"
      />
    </MarketingShell>
  );
}
