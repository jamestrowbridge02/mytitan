import Link from "next/link";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import {
  MarketingCtaBand,
  MarketingCapabilityCard,
  MarketingPageHero,
  MarketingSectionHeading,
} from "../components/marketing/Sections";
import { SIGN_UP_URL } from "../lib/site-content";

const integrationRoutes = [
  {
    title: "Accounting",
    description: "Use MyTitan Finance, readiness-gated Xero setup, governed API connections, signed webhooks, or finance file exchange.",
    bullets: ["Built-in finance path", "Xero setup status", "CSV, API token, and webhook alternatives"],
  },
  {
    title: "Payments",
    description: "Connect payment operations through tenant-owned providers, hosted payment links, signed status webhooks, reconciliation import, or manual collection.",
    bullets: ["No MyTitan Billing Stripe for customer funds", "Pending until verified", "Audited manual routes"],
  },
  {
    title: "Calendar",
    description: "Publish secure calendar feeds and connect external scheduling systems through standards, API tokens, and signed webhooks where supported.",
    bullets: ["Opaque ICS feed tokens", "Scoped location and workforce views", "No fake two-way sync"],
  },
];

export default function IntegrationsPage() {
  return (
    <MarketingShell>
      <MarketingSeo
        title="Integrations"
        description="Connect accounting, payments, calendar, and developer workflows through truthful native, API, webhook, file, and standards-based routes."
        path="/integrations"
      />

      <MarketingPageHero
        eyebrow="Integrations"
        title="Connect the systems your business already uses."
        lead="MyTitan distinguishes built-in capabilities, native connectors, governed API paths, signed webhooks, file exchange, and standards-based routes so every next action is truthful."
        actions={
          <>
            <a className="mkt-btn mkt-btn--primary" href={SIGN_UP_URL}>Start now</a>
            <Link className="mkt-btn" href="/security">Review controls</Link>
          </>
        }
        meta={
          <>
            <span className="mkt-chip">Native and generic paths are separated</span>
            <span className="mkt-chip">Secrets stay protected</span>
            <span className="mkt-chip">Dead-end roadmap cards are avoided</span>
          </>
        }
      />

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Connection routes"
          title="Usable routes without fake native claims."
          lead="The marketplace surfaces the strongest currently supported connection route for each provider category."
        />
        <div className="mkt-grid--3">
          {integrationRoutes.map((route) => (
            <MarketingCapabilityCard
              key={route.title}
              title={route.title}
              description={route.description}
              bullets={route.bullets}
            />
          ))}
        </div>
      </section>

      <MarketingCtaBand
        title="Review integrations with controls in scope."
        copy="Walk through accounting, payment, calendar, API token, webhook, and file exchange paths with the product team."
        primaryLabel="Create your workspace"
        primaryHref={SIGN_UP_URL}
        secondaryLabel="Contact us"
        secondaryHref="/contact"
      />
    </MarketingShell>
  );
}
