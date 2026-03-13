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
  const platformSignals = homepageModules.slice(0, 5);
  const replacementGroups = [
    {
      title: "Fragmented tools",
      description: "Replace separate booking, job, scheduling, portal, and reporting tools with one controlled operating model.",
    },
    {
      title: "Disconnected handoffs",
      description: "Keep quotes, approvals, collections, and billing readiness tied directly to live operational work.",
    },
    {
      title: "Operational blind spots",
      description: "Surface workflow pressure, inventory constraints, SLA risk, and leadership visibility inside the same system.",
    },
    {
      title: "Duplicated systems of record",
      description: "Run the business from one model across operations, revenue, customer workspace, and governance.",
    },
  ];

  return (
    <MarketingShell>
      <MarketingSeo />

      <MarketingPageHero
        brand
        eyebrow="Enterprise operations system for service businesses"
        title="One system to run the service business."
        lead="MyTitan gives service operators one platform for command-centre work, revenue continuity, customer workspace, inventory, compliance, and executive visibility."
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
          <div className="mkt-stack-lg">
            <div>
              <div className="mkt-hero__asideLabel">Platform snapshot</div>
              <h2 className="mkt-hero__asideTitle">Built for operators who need the front line and leadership layer in one system.</h2>
            </div>
            <div className="mkt-card">
              <h3>Command centre</h3>
              <p>Live jobs, bookings, technician load, and workflow pressure stay visible without leaving the command surface.</p>
            </div>
            <div className="mkt-card">
              <h3>Revenue continuity</h3>
              <p>Quotes, approvals, collections, and customer-facing records stay connected to the operational lifecycle.</p>
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
          title="Where the business runs."
          lead="MyTitan is designed so operations, finance, and leadership work from the same source of truth, not parallel systems."
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
          title="A command surface for the whole operating model."
          lead="This is where command centre work, revenue follow-through, customer workspace, and governance come together."
        />
        <div className="mkt-panel mkt-proofStage">
          <div className="mkt-stack-lg">
            <div className="mkt-proofStage__header">
              <div>
                <div className="mkt-eyebrow">Operator workspace</div>
                <h3 className="mkt-proofStage__title">
                  Command centre, revenue continuity, customer workspace, and governance in one shell.
                </h3>
                <p className="mkt-proofStage__copy">
                  The product organizes live work, operational pressure, customer-facing records, and leadership signals inside one consistent operating system.
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
            <div className="mkt-proofStage__body">
              <div className="mkt-card">
                <div className="mkt-stack-md">
                  <div className="mkt-proofStage__metrics">
                    <div className="mkt-stat">
                      <div className="mkt-stat__value">14</div>
                      <div className="mkt-stat__label">Open operational signals</div>
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
                  <div className="mkt-proofRail">
                    {[
                      "Command centre pressure and workflow enforcement",
                      "Revenue operations with approvals, collections, and billing readiness",
                      "Customer workspace, inventory, and service-plan continuity",
                    ].map((item) => (
                      <div key={item} className="mkt-proof mkt-proof--tight">
                        <strong>{item}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mkt-card">
                <div className="mkt-eyebrow">Live layers</div>
                <div className="mkt-proofRail" style={{ marginTop: 16 }}>
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
          title="Four pillars, one operating model."
          lead="The platform is structured around the real control points of the business, not a loose bundle of modules."
        />
        <div className="mkt-grid--2">
          <MarketingCapabilityCard
            title="Operations control"
            description="Coordinate bookings, jobs, scheduling pressure, technician execution, and completion evidence in one place."
            bullets={[
              "Command centre and workflow control",
              "Calendar, scheduling, and capacity visibility",
              "Technician workflow and execution records",
            ]}
          />
          <MarketingCapabilityCard
            title="Revenue continuity"
            description="Keep approvals, billing readiness, collections, and recurring service delivery connected to live work."
            bullets={[
              "Quotes, approvals, and collections",
              "Billing readiness and recurring service plans",
              "Revenue visibility tied to live operational context",
            ]}
          />
          <MarketingCapabilityCard
            title="Customer workspace"
            description="Give customers one controlled place for approvals, records, and completion follow-through."
            bullets={[
              "Customer accounts and portal-safe records",
              "Approvals, documents, and completion acknowledgement",
              "Visibility separated from internal operator controls",
            ]}
          />
          <MarketingCapabilityCard
            title="Governance at scale"
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
          title="One model across the business."
          lead="MyTitan replaces fragmented tools, disconnected handoffs, blind spots, and duplicated systems of record with one accountable platform."
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
          title="Built for operators with real complexity."
          lead="The strongest fit is where service delivery, customer experience, revenue discipline, and governance all matter at the same time."
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
          title="Governance is native to the platform."
          lead="MyTitan keeps tenant boundaries, operator roles, auditability, and customer-safe surfaces explicit across the operating model."
        />
        <div className="mkt-grid--2">
          <article className="mkt-proof">
            <h3 style={{ marginTop: 0 }}>Control at every layer</h3>
            <p>
              Workspace permissions, tenant scope, compliance controls, and integration visibility are already implemented in the live product.
            </p>
            <div className="mkt-actions" style={{ marginTop: 18 }}>
              <Link className="mkt-btn mkt-btn--primary" href="/demo">
                Request demo
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
            See whether MyTitan fits the way your business actually runs.
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
