import { useMemo, useState } from "react";
import MarketingShell from "../components/layout/MarketingShell";

export default function MarketingHome() {
  const [annual, setAnnual] = useState(false);
  const signInHref = "https://app.mytitan.co.uk/login";
  const getStartedHref = "https://app.mytitan.co.uk/signup";
  const billingHref = "https://app.mytitan.co.uk/dashboard/billing";

  const pricing = useMemo(
    () => ({
      sole: annual ? "GBP 39 per month, billed annually" : "GBP 49 per month",
      business: annual ? "GBP 95 per month, billed annually" : "GBP 119 per month",
      enterprise: annual ? "From GBP 239 per month, billed annually" : "From GBP 299 per month",
    }),
    [annual],
  );

  return (
    <MarketingShell>
      <section className="mkt-hero">
        <div className="mkt-hero__copy">
          <div className="mkt-hero__brand mkt-brand-glimmer">
            <img src="/brand/mytitan-logo-light.svg" alt="MyTitan" className="mkt-hero__brandLogo" />
          </div>
          <div className="mkt-eyebrow">Operations system for service businesses</div>
          <h1 className="mkt-hero__title">One operating layer for the whole service lifecycle.</h1>
          <p className="mkt-hero__lead">
            MyTitan brings workflow control, scheduling pressure, recurring work, approvals, documents, billing readiness,
            customer workspace access, and governed automations into one operational system built for teams that cannot afford handoff drift.
          </p>
          <div className="mkt-actions" style={{ marginTop: 22 }}>
            <a className="mkt-btn mkt-btn--primary" href={getStartedHref}>Start workspace</a>
            <a className="mkt-btn" href={signInHref}>Open product</a>
          </div>
          <div className="mkt-hero__meta">
            <span className="mkt-chip">Workflow stages with required-field enforcement</span>
            <span className="mkt-chip">Recurring work and capacity-aware scheduling</span>
            <span className="mkt-chip">Customer approvals, portal, and governed documents</span>
          </div>
        </div>

        <aside className="mkt-hero__aside">
          <div>
            <div className="mkt-hero__asideLabel">What makes it credible</div>
            <h2 className="mkt-hero__asideTitle">Operational depth instead of disconnected tools.</h2>
          </div>
          <div className="mkt-card">
            <h3>Execution clarity</h3>
            <p>Command-centre workflow, technician load signals, and service-plan pressure all stay visible in the same system.</p>
          </div>
          <div className="mkt-card">
            <h3>Governance built in</h3>
            <p>Workspace permissions, tenant scoping, audit history, webhook delivery logs, and portal-safe sharing are part of the platform.</p>
          </div>
          <div className="mkt-card">
            <h3>Customer-ready operations</h3>
            <p>Approvals, account access, documents, invoices, and service visibility are surfaced without leaking internal operator context.</p>
          </div>
        </aside>
      </section>

      <section className="mkt-section">
        <div className="mkt-kpiGrid">
          <div className="mkt-stat">
            <div className="mkt-stat__value">Workflow control</div>
            <div className="mkt-stat__label">Custom stages, required fields, approvals, and deterministic automation history.</div>
          </div>
          <div className="mkt-stat">
            <div className="mkt-stat__value">Recurring revenue ops</div>
            <div className="mkt-stat__label">Service plans create real operational work without hiding a fake subscription engine underneath.</div>
          </div>
          <div className="mkt-stat">
            <div className="mkt-stat__value">Capacity awareness</div>
            <div className="mkt-stat__label">Technician availability, exceptions, due work, and explainable assignment recommendations.</div>
          </div>
        </div>
      </section>

      <section className="mkt-section" id="platform">
        <div className="mkt-eyebrow">Platform</div>
        <h2 className="mkt-sectionTitle">The system that holds the business together.</h2>
        <p className="mkt-sectionLead">
          MyTitan is designed for operators who need one dependable operating model across front-of-house, dispatch, finance, and customer-facing follow-through.
        </p>
        <div className="mkt-grid--3">
          <article className="mkt-card">
            <h3>Workflow and execution</h3>
            <p>Bookings, jobs, technician actions, workflow rules, command-centre coordination, and enforcement all stay aligned.</p>
            <ul>
              <li>Configurable stages and terminology</li>
              <li>Required-field enforcement with warnings or hard blocks</li>
              <li>Command-centre visibility for missing operational data</li>
            </ul>
          </article>
          <article className="mkt-card">
            <h3>Governance and extensibility</h3>
            <p>Workspace RBAC, API tokens, signed webhooks, audit-friendly automation, and tenant-scoped custom fields create a controllable platform seam.</p>
            <ul>
              <li>Permissions for money, workflow, portal, and technician actions</li>
              <li>Webhook subscriptions and delivery history</li>
              <li>Custom fields propagated into operational surfaces</li>
            </ul>
          </article>
          <article className="mkt-card">
            <h3>Customer-safe records</h3>
            <p>Documents, receipts, approvals, account access, and portal-visible service information are managed with explicit visibility controls.</p>
            <ul>
              <li>Document artifact foundation</li>
              <li>Customer accounts and approvals workspace</li>
              <li>Portal-compatible visibility without replacing existing tokenized flows</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="mkt-section" id="operations">
        <div className="mkt-proof">
          <div className="mkt-eyebrow">Operations</div>
          <h2 className="mkt-sectionTitle">Built for businesses where scheduling, execution, and customer follow-through collide every day.</h2>
          <div className="mkt-proofGrid">
            <article className="mkt-card">
              <h3>Dispatch and pressure</h3>
              <p>See overloaded days, unassigned due work, and technician recommendations that explain why a person is a good fit.</p>
            </article>
            <article className="mkt-card">
              <h3>Recurring service delivery</h3>
              <p>Run service plans into real bookings or jobs with idempotent run history and explicit operational visibility.</p>
            </article>
            <article className="mkt-card">
              <h3>Billing and handover readiness</h3>
              <p>Keep invoice and document readiness visible without breaking the existing lifecycle or introducing billing theater.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="mkt-section" id="governance">
        <div className="mkt-grid--2">
          <article className="mkt-card">
            <div className="mkt-eyebrow">Why leaders buy</div>
            <h2 className="mkt-sectionTitle">A credible operations platform, not a stitched dashboard.</h2>
            <p className="mkt-sectionLead">
              MyTitan combines workflow discipline, customer visibility, service-plan execution, capacity planning, integrations, and governance into one SaaS operating model.
            </p>
          </article>
          <article className="mkt-card">
            <h3>For operational leaders</h3>
            <p>Reduce handoff ambiguity, missing required data, and service-plan drift while keeping dispatch and customer follow-through in view.</p>
            <h3 style={{ marginTop: 18 }}>For finance and control owners</h3>
            <p>Protect invoice, portal, and settings actions with permissions, activity logging, and explainable platform behavior.</p>
          </article>
        </div>
      </section>

      <section className="mkt-section" id="pricing">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div className="mkt-eyebrow">Pricing</div>
            <h2 className="mkt-sectionTitle" style={{ marginTop: 12 }}>Choose the operating footprint that fits the team.</h2>
          </div>
          <div className="mkt-actions">
            <button className={`mkt-btn${annual ? "" : " mkt-btn--primary"}`} type="button" onClick={() => setAnnual(false)}>Monthly</button>
            <button className={`mkt-btn${annual ? " mkt-btn--primary" : ""}`} type="button" onClick={() => setAnnual(true)}>Annual</button>
          </div>
        </div>
        <div className="mkt-pricing">
          <article className="mkt-pricingCard">
            <h3>Sole trader</h3>
            <p className="mkt-pricingCard__price">{pricing.sole}</p>
            <p>Core bookings, jobs, CRM, workflow control, and the foundations needed to run work cleanly.</p>
            <a className="mkt-inlineLink" href={billingHref}>Start subscription</a>
          </article>
          <article className="mkt-pricingCard mkt-pricingCard--featured">
            <h3>Business</h3>
            <p className="mkt-pricingCard__price">{pricing.business}</p>
            <p>Team workflows, customer approvals, portal operations, service plans, and governed operational surfaces.</p>
            <a className="mkt-inlineLink" href={billingHref}>Start subscription</a>
          </article>
          <article className="mkt-pricingCard">
            <h3>Enterprise</h3>
            <p className="mkt-pricingCard__price">{pricing.enterprise}</p>
            <p>Multi-site deployment, larger-team governance, integration-first rollout, and commercial support for more complex operations.</p>
            <a className="mkt-inlineLink" href={billingHref}>Contact sales</a>
          </article>
        </div>
      </section>

      <section className="mkt-section" id="faq">
        <div className="mkt-eyebrow">FAQ</div>
        <h2 className="mkt-sectionTitle" style={{ marginTop: 12 }}>Practical questions buyers ask first.</h2>
        <div className="mkt-faq">
          <details className="mkt-faqItem">
            <summary>Can we start with a small team and grow into broader operations?</summary>
            <p>Yes. The platform already supports governed settings, integrations, documents, recurring work, customer approvals, and capacity planning as the operation matures.</p>
          </details>
          <details className="mkt-faqItem">
            <summary>Does customer access replace the existing public portal?</summary>
            <p>No. Customer accounts are additive. Tokenized portal routes continue to work while account-based access adds a more durable workspace for approved customers.</p>
          </details>
          <details className="mkt-faqItem">
            <summary>Are integrations real platform primitives or just readiness placeholders?</summary>
            <p>API tokens, outbound webhooks, subscribed event types, and delivery logs are already part of the tenant-scoped platform layer.</p>
          </details>
          <details className="mkt-faqItem">
            <summary>How much of the workflow can be configured safely?</summary>
            <p>Terminology, stages, required-field enforcement, custom fields, automations, permissions, and portal-safe visibility are configurable without bypassing core lifecycle rules.</p>
          </details>
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-final">
          <div className="mkt-eyebrow">Start with the system, not another point tool</div>
          <h2 className="mkt-sectionTitle" style={{ marginTop: 14 }}>Move from fragmented service operations to one controlled operating model.</h2>
          <p>
            Give operators a readable command surface, give customers a safer workspace, and give leadership a platform that can keep growing without losing workflow discipline.
          </p>
          <div className="mkt-actions" style={{ marginTop: 18 }}>
            <a className="mkt-btn mkt-btn--primary" href={getStartedHref}>Start workspace</a>
            <a className="mkt-btn" href={signInHref}>Sign in</a>
          </div>
          <div className="mkt-footer">
            <div className="mkt-footer__logo">
              <img src="/brand/mytitan-logo-light.svg" alt="MyTitan" className="mkt-footer__logoImage" />
            </div>
            <div>MyTitan aligns workflow, recurring service delivery, customer approvals, integrations, artifacts, and governance in one operational SaaS platform.</div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
