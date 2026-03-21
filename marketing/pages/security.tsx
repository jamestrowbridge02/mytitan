import Link from "next/link";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import {
  MarketingCtaBand,
  MarketingPageHero,
  MarketingSectionHeading,
} from "../components/marketing/Sections";
import { securityPoints } from "../lib/site-content";

export default function SecurityPage() {
  return (
    <MarketingShell>
      <MarketingSeo
        title="Security and Governance"
        description="Review MyTitan's tenant-scoped controls, permissions, compliance tools, integrations, and audit-friendly product seams."
        path="/security"
      />

      <MarketingPageHero
        eyebrow="Security and governance"
        title="Built for controlled operations."
        lead="MyTitan keeps tenant boundaries, permissions, auditability, compliance visibility, and customer-safe access explicit across the product."
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
        aside={
          <>
            <div>
              <div className="mkt-hero__asideLabel">What is already in the product</div>
              <h2 className="mkt-hero__asideTitle">Governance as an operating primitive.</h2>
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
          title="Controls grounded in the real product."
          lead="The site does not claim controls that are not represented in the product. It reflects the guardrails already in place."
        />
        <div className="mkt-securityList">
          {securityPoints.map((point) => (
            <div key={point} className="mkt-moduleItem">
              {point}
            </div>
          ))}
        </div>
      </section>

      <MarketingCtaBand
        title="Review the product with security and control in scope."
        copy="Walk through permissions, integrations, activity visibility, compliance queueing, and the customer-safe access model with the product team."
        primaryLabel="Book demo"
        primaryHref="/demo"
        secondaryLabel="See product"
        secondaryHref="/platform"
      />
    </MarketingShell>
  );
}
