import { useState } from "react";
import Link from "next/link";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import {
  MarketingCtaBand,
  MarketingPageHero,
  MarketingSectionHeading,
} from "../components/marketing/Sections";
import { BESPOKE_ACCOUNT_URL, ENTERPRISE_ACCOUNT_URL, pricingTiers, SIGN_UP_URL } from "../lib/site-content";

const PRICING_FAQS = [
  {
    question: "Are customer deposits or invoice payments processed by MyTitan billing?",
    answer: "No. MyTitan billing is for subscriptions and job-completion packs only. Customer money stays on the business payment setup or a manual collection path.",
  },
  {
    question: "Are extra job packs live automatically?",
    answer: "No. Packs are only sold when Stripe products, webhook-backed granting, and readiness checks are configured. Until then, the product shows setup state truthfully.",
  },
  {
    question: "Can larger businesses request custom allowances?",
    answer: "Yes. Bespoke and enterprise allowances are handled through controlled MyTitan platform administration with audit evidence, not hidden checkout behavior.",
  },
  {
    question: "Does annual billing change operational limits?",
    answer: "No. Annual billing changes the subscription interval only. Completed-job allowances, provider readiness, tenant boundaries, and customer payment separation stay the same.",
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <MarketingShell>
      <MarketingSeo
        title="Pricing"
        description="Review MyTitan pricing for operators who want one clean path from finished work to customer send and payment."
        path="/pricing"
      />

      <MarketingPageHero
        eyebrow="Pricing"
        title="Pricing with clear allowances and clean billing boundaries."
        lead="Choose Free, Sole Trader, Business, or Enterprise with clear completed-job allowances, visible annual pricing, and no confusion between MyTitan billing and your customer payments."
        actions={
          <>
            <a className="mkt-btn mkt-btn--primary" href={SIGN_UP_URL}>Start 14-day trial</a>
            <Link className="mkt-btn" href="/platform">
              See the workflow
            </Link>
            <Link className="mkt-btn mkt-btn--ghost" href={BESPOKE_ACCOUNT_URL}>
              Discuss bespoke account
            </Link>
          </>
        }
        meta={
          <>
            <span className="mkt-chip">Truthful monthly allowances</span>
            <span className="mkt-chip">No fake overage checkout</span>
            <span className="mkt-chip">Customer payments stay separate from MyTitan billing</span>
          </>
        }
      />

      <section className="mkt-section">
        <div className="mkt-pricingHeader">
          <MarketingSectionHeading
            eyebrow="Plans"
            title="Choose the monthly allowance that fits."
            lead="Every plan keeps the same truthful workflow. The difference is how many completed jobs the allowance is designed to cover each month."
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

        <div className="mkt-darkSection mkt-bespokeBand">
          <div>
            <p className="mkt-darkSection__eyebrow">Larger operations</p>
            <h2>Need a custom completed-job allowance?</h2>
            <p>Standard job packs remain available. Larger businesses can request a bespoke or unlimited allowance discussion, configured only through controlled MyTitan platform administration.</p>
          </div>
          <div className="mkt-actions">
            <Link className="mkt-btn mkt-btn--dark" href={BESPOKE_ACCOUNT_URL}>Discuss bespoke account</Link>
            <Link className="mkt-btn" href={ENTERPRISE_ACCOUNT_URL}>Request enterprise account</Link>
          </div>
        </div>

        <div className="mkt-pricing">
          {pricingTiers.map((tier) => (
            <article key={tier.name} className={`mkt-pricingCard${tier.featured ? " mkt-pricingCard--featured" : ""}`} data-testid={`pricing-plan-${tier.name.toLowerCase().replace(/\s+/g, "-")}`}>
              <div className="mkt-pricingCard__eyebrow">{tier.featured ? "Most common" : "Plan"}</div>
              <h3>{tier.name}</h3>
              <p className="mkt-pricingCard__price">{annual ? tier.priceAnnual : tier.priceMonthly}</p>
              <p>{tier.summary}</p>
              <div className="mkt-pricingAllowance">
                <strong>{tier.completedJobsHeading}</strong>
                <p>{tier.completedJobsLabel}</p>
              </div>
              <p>{tier.allowanceNote}</p>
              {"upgradeSignal" in tier && typeof tier.upgradeSignal === "string" ? <p><strong>Upgrade when:</strong> {tier.upgradeSignal}</p> : null}
              <p className="mkt-pricingCard__footnote">{tier.extraJobs}</p>
              <div className="mkt-actions mkt-actions--pricingCard">
                <a className="mkt-btn mkt-btn--primary" href={tier.href}>
                  {tier.cta}
                </a>
                <Link className="mkt-inlineLink" href="/platform">
                  Review workflow fit
                </Link>
              </div>
            </article>
          ))}
        </div>

        <div className="mkt-proof mkt-pricingTruth">
          <div>
            <div className="mkt-eyebrow">Allowance truth</div>
            <h2 className="mkt-sectionTitle" style={{ marginTop: 14 }}>What happens if you have a busier month?</h2>
          </div>
          <div className="mkt-grid--2">
            <div className="mkt-card">
              <h3>What is live today</h3>
              <p>MyTitan now states the monthly completed-job allowance for each plan clearly across pricing and billing.</p>
              <p>Completed jobs stay authoritative. There is no fake overage billing, no hidden pack checkout, and no silent plan change.</p>
              <p>Customer payments and booking deposits still go through the business payment setup, not MyTitan billing.</p>
            </div>
            <div className="mkt-card">
              <h3>What is planned next</h3>
              <p>10, 25, 50, and 100 extra job packs are priced at £5, £12.50, £25, and £50.</p>
              <p>Those packs are not sold unless their Stripe products are synced and MyTitan webhook-backed granting is live.</p>
            </div>
          </div>
        </div>

        <div className="mkt-proof mkt-pricingCompare">
          <div>
            <div className="mkt-eyebrow">Comparison</div>
            <h2 className="mkt-sectionTitle" style={{ marginTop: 14 }}>Completed jobs per month at a glance</h2>
          </div>
          <div className="mkt-pricingCompare__rows">
            {pricingTiers.map((tier) => (
              <Link key={`${tier.name}-compare`} href="/platform" className="mkt-pricingCompare__row mkt-linkCard">
                <div>
                  <strong>{tier.name}</strong>
                  <p>{tier.summary}</p>
                </div>
                <div>
                  <strong>{tier.completedJobsLabel}</strong>
                  <p>{annual ? tier.priceAnnual : tier.priceMonthly}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="mkt-proof mkt-pricingFaq" data-testid="pricing-truthful-faq">
          <div>
            <div className="mkt-eyebrow">Pricing FAQ</div>
            <h2 className="mkt-sectionTitle" style={{ marginTop: 14 }}>Clear answers before checkout.</h2>
            <p>Short answers to the commercial questions that should never be hidden in small print.</p>
          </div>
          <div className="mkt-pricingFaq__items">
            {PRICING_FAQS.map((item) => (
              <details key={item.question} className="mkt-pricingFaq__item">
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <MarketingCtaBand
        title="Start with the allowance that matches the work you complete now."
        copy="Start Free if you are proving the workflow, or move onto the paid annual or monthly path when your workload and commercial setup need it."
        primaryLabel="Create your workspace"
        primaryHref={SIGN_UP_URL}
        secondaryLabel="See how MyTitan works"
        secondaryHref="/platform"
      />
    </MarketingShell>
  );
}
