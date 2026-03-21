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
        description="Review MyTitan pricing for focused operators, growing teams, and larger multi-location deployments."
        path="/pricing"
      />

      <MarketingPageHero
        eyebrow="Pricing"
        title="Pricing that matches team size and complexity."
        lead="MyTitan pricing is shaped around how much control, scale, and support your team needs."
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
        <div className="mkt-pricingHeader">
          <MarketingSectionHeading
            eyebrow="Commercial model"
            title="Choose the tier that matches your team."
            lead="Larger buyers can use the demo path for rollout planning. Smaller teams can start directly."
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
        title="Use a guided walkthrough if you need a broader rollout plan."
        copy="The demo path is the right place to review deployment shape, multi-location scope, controls, and how the product maps to your operating pressure."
        primaryLabel="Book demo"
        primaryHref="/demo"
        secondaryLabel="See product"
        secondaryHref="/platform"
      />
    </MarketingShell>
  );
}
