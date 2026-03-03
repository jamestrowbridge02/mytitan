import MarketingShell from "../components/layout/MarketingShell";
import { useMemo, useState } from "react";

const sideNavEnabled =
  (process.env.NEXT_PUBLIC_MYTITAN_MARKETING_SIDENAV_V1 || "").trim().toLowerCase() === "on" ||
  (process.env.NEXT_PUBLIC_MYTITAN_MARKETING_SIDENAV_V1 || "").trim().toLowerCase() === "true" ||
  (process.env.NEXT_PUBLIC_MYTITAN_MARKETING_SIDENAV_V1 || "").trim().toLowerCase() === "1";

export default function MarketingHome() {
  const [annual, setAnnual] = useState(false);
  const signInHref = "https://app.mytitan.co.uk/login";
  const getStartedHref = "https://app.mytitan.co.uk/signup";
  const billingHref = "https://app.mytitan.co.uk/dashboard/billing";

  const pricing = useMemo(
    () => ({
      sole: annual ? "£39/mo billed annually" : "£49/mo",
      business: annual ? "£95/mo billed annually" : "£119/mo",
      enterprise: annual ? "From £239/mo billed annually" : "From £299/mo",
    }),
    [annual],
  );

  return (
    <MarketingShell>
      {/* If luxury shell flag is OFF, keep a simple readable layout (no heavy styling changes) */}
      <div className={sideNavEnabled ? "" : "page"}>
        {/* HERO */}
        <section id="product" className={sideNavEnabled ? "mkt-lux-hero" : "hero"}>
          <div className={sideNavEnabled ? "mkt-lux-eyebrow" : "pill"}>Business OS for workshops</div>
          <h1 className={sideNavEnabled ? "mkt-lux-h1" : ""}>
            Jobs, bookings, payments, and customer comms — built for garages, wheels, bodyshops & mobile techs.
          </h1>
          <p className={sideNavEnabled ? "mkt-lux-lead" : ""}>
            Run the full workflow from quote to completion with guided setup, templates, customer portal, and integrations —
            without sacrificing speed, clarity, or tenant isolation.
          </p>

          <div className={sideNavEnabled ? "mkt-lux-actions" : "actions"}>
            <a className={sideNavEnabled ? "mkt-lux-btn mkt-lux-btn" : "mkt-btn"} href={signInHref}>
              Sign in
            </a>
            <a className={sideNavEnabled ? "mkt-lux-btn mkt-lux-btn-primary" : "mkt-btn"} href={getStartedHref}>
              Get started
            </a>
          </div>

          <div className={sideNavEnabled ? "mkt-lux-trust" : "muted-line"}>
            Trusted workflow: scheduling → jobs → CRM → invoices → payments → portal.
          </div>
        </section>

        {/* VALUE */}
        <section className={sideNavEnabled ? "mkt-lux-section" : "section"}>
          <h2 className={sideNavEnabled ? "mkt-lux-h2" : ""}>Why teams choose MyTitan</h2>

          <div className={sideNavEnabled ? "mkt-lux-grid3" : "grid four"}>
            <article className={sideNavEnabled ? "mkt-lux-card" : "card"}>
              <h3>Speed</h3>
              <p>Fast job creation, clean handovers, and fewer clicks across the day.</p>
            </article>

            <article className={sideNavEnabled ? "mkt-lux-card" : "card"}>
              <h3>Guided setup</h3>
              <p>Defaults, templates, and onboarding that get teams live without technical friction.</p>
            </article>

            <article className={sideNavEnabled ? "mkt-lux-card" : "card"}>
              <h3>Clarity</h3>
              <p>One system with consistent statuses, notes, and accountability across roles.</p>
            </article>
          </div>

          <div className={sideNavEnabled ? "mkt-lux-marquee" : "card trust"}>
            <h3>Built for scale</h3>
            <p>
              Multi-tenant by default with strong tenant isolation, feature flags per tenant, and billing enforcement —
              designed for 10,000s of businesses.
            </p>
          </div>
        </section>

        {/* TRADES */}
        <section className={sideNavEnabled ? "mkt-lux-section" : "section"}>
          <h2 className={sideNavEnabled ? "mkt-lux-h2" : ""}>Trades supported</h2>

          <div className={sideNavEnabled ? "mkt-lux-grid4" : "grid four"}>
            <article className={sideNavEnabled ? "mkt-lux-card" : "card"}>
              <h3>Wheels</h3>
              <p>Repair, powder coat, straightening, and more.</p>
            </article>
            <article className={sideNavEnabled ? "mkt-lux-card" : "card"}>
              <h3>Bodyshop</h3>
              <p>Paint and repair workflows with progress tracking.</p>
            </article>
            <article className={sideNavEnabled ? "mkt-lux-card" : "card"}>
              <h3>Garage</h3>
              <p>Service and diagnostic jobs with clear status.</p>
            </article>
            <article className={sideNavEnabled ? "mkt-lux-card" : "card"}>
              <h3>Mobile Tech</h3>
              <p>Field-first flow with straightforward job capture.</p>
            </article>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className={sideNavEnabled ? "mkt-lux-section" : "section"}>
          <div className={sideNavEnabled ? "mkt-lux-row" : ""}>
            <h2 className={sideNavEnabled ? "mkt-lux-h2" : ""}>Pricing</h2>
            <div className={sideNavEnabled ? "mkt-lux-toggle" : "actions"}>
              <button
                className={sideNavEnabled ? "mkt-lux-btn" : `button ${annual ? "ghost" : ""}`}
                type="button"
                onClick={() => setAnnual(false)}
              >
                Monthly
              </button>
              <button
                className={sideNavEnabled ? "mkt-lux-btn mkt-lux-btn-primary" : `button ${annual ? "" : "ghost"}`}
                type="button"
                onClick={() => setAnnual(true)}
              >
                Annual
              </button>
            </div>
          </div>

          <div className={sideNavEnabled ? "mkt-lux-grid3" : "grid three"}>
            <article className={sideNavEnabled ? "mkt-lux-card" : "card"}>
              <h3>Sole Trader</h3>
              <p className={sideNavEnabled ? "mkt-lux-price" : ""}>{pricing.sole}</p>
              <a className={sideNavEnabled ? "mkt-lux-inline" : "inline-cta"} href={billingHref}>
                Start subscription
              </a>
            </article>

            <article className={sideNavEnabled ? "mkt-lux-card" : "card"}>
              <h3>Business</h3>
              <p className={sideNavEnabled ? "mkt-lux-price" : ""}>{pricing.business}</p>
              <a className={sideNavEnabled ? "mkt-lux-inline" : "inline-cta"} href={billingHref}>
                Start subscription
              </a>
            </article>

            <article className={sideNavEnabled ? "mkt-lux-card" : "card"}>
              <h3>Enterprise</h3>
              <p className={sideNavEnabled ? "mkt-lux-price" : ""}>{pricing.enterprise}</p>
              <a className={sideNavEnabled ? "mkt-lux-inline" : "inline-cta"} href={billingHref}>
                Contact sales
              </a>
            </article>
          </div>
        </section>

        {/* SECURITY */}
        <section id="security" className={sideNavEnabled ? "mkt-lux-section" : "section"}>
          <h2 className={sideNavEnabled ? "mkt-lux-h2" : ""}>Security + isolation</h2>
          <div className={sideNavEnabled ? "mkt-lux-grid2" : "grid two"}>
            <article className={sideNavEnabled ? "mkt-lux-card" : "card"}>
              <h3>Tenant isolation</h3>
              <p>Strong scoping patterns across services with defensive checks and audit trails.</p>
            </article>
            <article className={sideNavEnabled ? "mkt-lux-card" : "card"}>
              <h3>Production-safe controls</h3>
              <p>Feature flags per tenant, locked-down admin surfaces, and safe-by-default operations.</p>
            </article>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={sideNavEnabled ? "mkt-lux-section" : "section"}>
          <h2 className={sideNavEnabled ? "mkt-lux-h2" : ""}>FAQ</h2>
          <div className={sideNavEnabled ? "mkt-lux-faq" : "grid two"}>
            <details className={sideNavEnabled ? "mkt-lux-faqitem" : "card"}>
              <summary>Can I try it first?</summary>
              <p>Yes. Create your account and explore the platform immediately.</p>
            </details>
            <details className={sideNavEnabled ? "mkt-lux-faqitem" : "card"}>
              <summary>Is setup technical?</summary>
              <p>No. Guided setup and defaults are designed for workshop teams.</p>
            </details>
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}
