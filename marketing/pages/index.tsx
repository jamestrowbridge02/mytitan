import Link from "next/link";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import {
  MarketingCapabilityCard,
  MarketingPageHero,
  MarketingSectionHeading,
} from "../components/marketing/Sections";
import { homepageModules, industries, securityPoints, SIGN_UP_URL } from "../lib/site-content";

export default function MarketingHome() {
  const platformSignals = homepageModules.slice(0, 6);
  const replacementGroups = [
    {
      title: "Scheduling plus dispatch sprawl",
      description: "Replace separate booking, job, calendar, and technician views with one command surface.",
    },
    {
      title: "Revenue handoff gaps",
      description: "Keep quotes, approvals, collections, and billing readiness tied to live operational work.",
    },
    {
      title: "Portal and evidence patchwork",
      description: "Give customers one controlled workspace for approvals, records, and completion visibility.",
    },
    {
      title: "Reporting after the fact",
      description: "Surface inventory pressure, SLA risk, performance, and location context inside the platform itself.",
    },
  ];

  return (
    <MarketingShell>
      <MarketingSeo />

      <MarketingPageHero
        brand
        eyebrow="Enterprise operations system for service businesses"
        title="One operating system for service delivery, revenue, and control."
        lead="MyTitan gives service businesses one premium command layer for jobs, scheduling, customer approvals, recurring work, inventory, compliance, and executive visibility."
        actions={
          <>
            <Link className="mkt-btn mkt-btn--primary" href="/demo">
              Request demo
            </Link>
            <Link className="mkt-btn" href="/platform">
              See platform
            </Link>
            <a className="mkt-btn" href={SIGN_UP_URL}>
              Get started
            </a>
          </>
        }
        aside={
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div className="mkt-hero__asideLabel">Platform snapshot</div>
              <h2 className="mkt-hero__asideTitle">Built for operators who need the front line and leadership layer in the same system.</h2>
            </div>
            <div className="mkt-card">
              <h3>Command centre</h3>
              <p>Live jobs, bookings, technician load, and workflow pressure stay visible without switching tools.</p>
            </div>
            <div className="mkt-card">
              <h3>Commercial continuity</h3>
              <p>Quotes, approvals, collections, and customer-facing records stay connected to the job lifecycle.</p>
            </div>
            <div className="mkt-card">
              <h3>Governed scale</h3>
              <p>Multi-location operations, compliance, integrations, and auditability are already part of the core platform.</p>
            </div>
          </div>
        }
      />

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Platform snapshot"
          title="A single system that stays readable under real operating pressure."
          lead="MyTitan is designed so operations, finance, and leadership can work from the same source of truth."
        />
        <div className="mkt-kpiGrid">
          <div className="mkt-stat">
            <div className="mkt-stat__value">Control the day</div>
            <div className="mkt-stat__label">Bookings, jobs, scheduling, and technician execution stay in one operating layer.</div>
          </div>
          <div className="mkt-stat">
            <div className="mkt-stat__value">Protect the money flow</div>
            <div className="mkt-stat__label">Quotes, approvals, collections, and billing readiness stay close to the work itself.</div>
          </div>
          <div className="mkt-stat">
            <div className="mkt-stat__value">Scale with control</div>
            <div className="mkt-stat__label">Inventory, compliance, analytics, and location-aware governance are built into the platform core.</div>
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Platform screenshot"
          title="A product surface that looks unified because the operating model is unified."
          lead="From the homepage, the product should read as one premium system rather than a set of stitched modules."
        />
        <div className="mkt-panel" style={{ padding: 28 }}>
          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div className="mkt-eyebrow">Operator workspace</div>
                <h3 style={{ margin: "14px 0 8px", fontSize: "1.9rem", letterSpacing: "-0.04em" }}>
                  Command centre, revenue follow-through, and governance in one view.
                </h3>
                <p style={{ margin: 0, color: "var(--muted)", maxWidth: "48rem" }}>
                  The product organizes live work, operational pressure, customer-facing records, and leadership signals inside one consistent shell.
                </p>
              </div>
              <div className="mkt-actions" style={{ justifyContent: "flex-start" }}>
                <Link className="mkt-btn mkt-btn--primary" href="/demo">
                  Request demo
                </Link>
                <Link className="mkt-btn" href="/platform">
                  See platform
                </Link>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.8fr)", gap: 16 }}>
              <div className="mkt-card" style={{ padding: 22 }}>
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                    <div className="mkt-stat">
                      <div className="mkt-stat__value">14</div>
                      <div className="mkt-stat__label">Open workflow signals</div>
                    </div>
                    <div className="mkt-stat">
                      <div className="mkt-stat__value">6</div>
                      <div className="mkt-stat__label">Operator workspaces</div>
                    </div>
                    <div className="mkt-stat">
                      <div className="mkt-stat__value">2</div>
                      <div className="mkt-stat__label">Locations in scope</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {[
                      "Command centre pressure and workflow enforcement",
                      "Revenue operations with approvals and collections",
                      "Inventory, procurement, and service-plan continuity",
                    ].map((item) => (
                      <div key={item} className="mkt-proof" style={{ padding: 16 }}>
                        <strong>{item}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mkt-card" style={{ padding: 22 }}>
                <div className="mkt-eyebrow">Live layers</div>
                <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                  {platformSignals.map((item) => (
                    <div key={item} className="mkt-moduleItem">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Platform pillars"
          title="The core platform is organized around the real seams of the business."
          lead="MyTitan holds up when the day gets messy because the product model follows the operating model."
        />
        <div className="mkt-grid--3">
          <MarketingCapabilityCard
            title="Operations"
            description="Coordinate bookings, jobs, scheduling pressure, technician execution, and completion evidence in one place."
            bullets={[
              "Command centre and workflow control",
              "Calendar, scheduling, and capacity visibility",
              "Technician workflow and execution records",
            ]}
          />
          <MarketingCapabilityCard
            title="Commercial"
            description="Keep the customer, approvals, billing readiness, and recurring service model connected to live work."
            bullets={[
              "Quotes, approvals, and collections",
              "Customer workspace and portal-safe records",
              "Recurring service plans and revenue continuity",
            ]}
          />
          <MarketingCapabilityCard
            title="Governance"
            description="Scale the platform without losing control over permissions, locations, integrations, or compliance."
            bullets={[
              "RBAC, custom fields, and auditability",
              "Multi-location operations and inventory visibility",
              "Compliance, analytics, and performance signals",
            ]}
          />
        </div>
      </section>

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="What MyTitan replaces"
          title="Replace tool sprawl with one accountable operating layer."
          lead="The value is not another dashboard. It is removing the seams between delivery, customer follow-through, and governance."
        />
        <div className="mkt-grid--2">
          {replacementGroups.map((group) => (
            <article key={group.title} className="mkt-proof">
              <h3>{group.title}</h3>
              <p>{group.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Industries"
          title="Built for serious service operators."
          lead="The strongest fit is where operations, customer experience, and governance all matter at the same time."
        />
        <div className="mkt-grid--2">
          {industries.map((industry) => (
            <article key={industry.title} className="mkt-card">
              <h3>{industry.title}</h3>
              <p>{industry.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Security"
          title="Governance is part of the platform model, not an add-on page."
          lead="MyTitan keeps tenant boundaries, operator roles, auditability, and customer-safe surfaces explicit."
        />
        <div className="mkt-grid--2">
          <article className="mkt-proof">
            <h3 style={{ marginTop: 0 }}>Control at every layer</h3>
            <p>
              Workspace permissions, tenant scope, compliance controls, and integration visibility are already implemented in the live product.
            </p>
            <div className="mkt-actions" style={{ marginTop: 18 }}>
              <Link className="mkt-btn" href="/security">
                Security details
              </Link>
              <Link className="mkt-btn" href="/platform">
                See platform
              </Link>
            </div>
          </article>
          <div className="mkt-card" style={{ padding: 24 }}>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 10, color: "var(--muted)" }}>
              {securityPoints.slice(0, 5).map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-final">
          <div className="mkt-eyebrow">Final step</div>
          <h2 className="mkt-sectionTitle" style={{ marginTop: 14 }}>
            See whether MyTitan fits the way your operation actually runs.
          </h2>
          <p>
            Walk through the platform against real workflow pressure, customer approvals, billing readiness, inventory control, and multi-location operations.
          </p>
          <div className="mkt-actions" style={{ marginTop: 18 }}>
            <Link className="mkt-btn mkt-btn--primary" href="/demo">
              Request demo
            </Link>
            <Link className="mkt-btn" href="/platform">
              See platform
            </Link>
            <a className="mkt-btn" href={SIGN_UP_URL}>
              Get started
            </a>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
