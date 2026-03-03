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

          {/* Logo bar */}
          <div className={sideNavEnabled ? "mkt-lux-logos" : ""} aria-label="Trusted by">
            <div className="mkt-lux-logo">Workshop teams</div>
            <div className="mkt-lux-logo">Mobile operators</div>
            <div className="mkt-lux-logo">Multi-site groups</div>
            <div className="mkt-lux-logo">Specialists</div>
          </div>
        </section>

        {/* STATS */}
        <section className={sideNavEnabled ? "mkt-lux-section" : "section"}>
          <div className={sideNavEnabled ? "mkt-lux-stats" : ""}>
            <div className="mkt-lux-stat">
              <div className="mkt-lux-statnum">Fast</div>
              <div className="mkt-lux-statlabel">Designed to reduce clicks and speed handovers</div>
            </div>
            <div className="mkt-lux-stat">
              <div className="mkt-lux-statnum">Secure</div>
              <div className="mkt-lux-statlabel">Tenant isolation + audit-friendly patterns</div>
            </div>
            <div className="mkt-lux-stat">
              <div className="mkt-lux-statnum">Scalable</div>
              <div className="mkt-lux-statlabel">Built for 10,000s of businesses</div>
            </div>
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

        {/* TESTIMONIAL */}
        <section className={sideNavEnabled ? "mkt-lux-section" : "section"}>
          <div className={sideNavEnabled ? "mkt-lux-testimonial" : "card"}>
            <div className="mkt-lux-quote">
              “We cut admin time, bookings stopped clashing, and the team finally has one source of truth.”
            </div>
            <div className="mkt-lux-byline">Operations Lead — Multi-site workshop</div>
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
            <article className={sideNavEnabled ? "mkt-lux-card mkt-lux-card-plan" : "card"}>
              <h3>Sole Trader</h3>
              <p className="mkt-lux-price">{pricing.sole}</p>
              <div className="mkt-lux-planline">Scheduling, jobs, CRM, templates</div>
              <a className="mkt-lux-inline" href={billingHref}>Start subscription</a>
            </article>

            <article className={sideNavEnabled ? "mkt-lux-card mkt-lux-card-plan mkt-lux-card-featured" : "card"}>
              <div className="mkt-lux-badge">Most popular</div>
              <h3>Business</h3>
              <p className="mkt-lux-price">{pricing.business}</p>
              <div className="mkt-lux-planline">Team workflows, approvals, portal</div>
              <a className="mkt-lux-inline" href={billingHref}>Start subscription</a>
            </article>

            <article className={sideNavEnabled ? "mkt-lux-card mkt-lux-card-plan" : "card"}>
              <h3>Enterprise</h3>
              <p className="mkt-lux-price">{pricing.enterprise}</p>
              <div className="mkt-lux-planline">Multi-site, custom limits, support</div>
              <a className="mkt-lux-inline" href={billingHref}>Contact sales</a>
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

        {/* FINAL CTA */}
        <section className={sideNavEnabled ? "mkt-lux-final" : "section"}>
          <div className="mkt-lux-finalcard">
            <h2 className="mkt-lux-h2">Get started in minutes</h2>
            <p className="mkt-lux-lead">
              Create your account, run guided setup, and start booking work — with billing enforcement for non-owner accounts.
            </p>
            <div className="mkt-lux-actions">
              <a className="mkt-lux-btn" href={signInHref}>Sign in</a>
              <a className="mkt-lux-btn mkt-lux-btn-primary" href={getStartedHref}>Get started</a>
            </div>
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}
