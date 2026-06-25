import Link from "next/link";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import {
  MarketingCtaBand,
  MarketingPageHero,
  MarketingSectionHeading,
} from "../components/marketing/Sections";
import { securityPoints, SIGN_UP_URL } from "../lib/site-content";

export default function SecurityPage() {
  return (
    <MarketingShell>
      <MarketingSeo
        title="Security"
        description="Review MyTitan's tenant-scoped controls, permissions, audit history, integrations, and customer-safe access model."
        path="/security"
      />

      <MarketingPageHero
        eyebrow="Security"
        title="Built with clear boundaries and controls."
        lead="MyTitan keeps tenant boundaries, permissions, audit history, compliance visibility, and customer-safe access explicit across the product."
        actions={
          <>
            <a className="mkt-btn mkt-btn--primary" href={SIGN_UP_URL}>Start now</a>
            <Link className="mkt-btn" href="/platform">
              See product
            </Link>
          </>
        }
        meta={
          <>
            <span className="mkt-chip">Tenant boundaries stay explicit</span>
            <span className="mkt-chip">Role-based access stays product-native</span>
            <span className="mkt-chip">Operational controls stay reviewable</span>
          </>
        }
        aside={
          <>
            <div>
              <div className="mkt-hero__asideLabel">What is already in the product</div>
              <h2 className="mkt-hero__asideTitle">Control is part of the day-to-day system, not an afterthought.</h2>
            </div>
            <div className="mkt-card">
              <h3>Tenant-scoped by design</h3>
              <p>Workflow, customer, finance, integration, document, and compliance areas all operate inside the tenant model.</p>
            </div>
            <div className="mkt-card">
              <h3>Role-aware access</h3>
              <p>Permissions already govern settings, money actions, technician views, portal access, and compliance management.</p>
            </div>
          </>
        }
      />

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Control points"
          title="Controls grounded in the live product."
          lead="Review the guardrails represented in the product today."
        />
        <div className="mkt-securityList">
          {securityPoints.map((point) => (
            <Link key={point.title} href={point.href} className="mkt-card mkt-linkCard mkt-securityCard">
              <h3>{point.title}</h3>
              <p>{point.description}</p>
              <span className="mkt-inlineLink">{point.action}</span>
            </Link>
          ))}
        </div>
      </section>

      <MarketingCtaBand
        title="Review the product with security in scope."
        copy="Walk through permissions, integrations, activity visibility, compliance queueing, and customer-safe access with the product team."
        primaryLabel="Create your workspace"
        primaryHref={SIGN_UP_URL}
        secondaryLabel="See product"
        secondaryHref="/platform"
      />
    </MarketingShell>
  );
}
