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
      description: "Replace separate booking, job, scheduling, portal, and reporting tools with one clear workspace.",
    },
    {
      title: "Disconnected handoffs",
      description: "Keep quotes, approvals, collections, and billing tied directly to live work.",
    },
    {
      title: "Operational blind spots",
      description: "Surface workflow pressure, inventory constraints, SLA risk, and leadership visibility in the same place.",
    },
    {
      title: "Duplicated systems of record",
      description: "Run the business from one product across operations, billing, customer workspace, and controls.",
    },
  ];

  return (
    <MarketingShell>
      <MarketingSeo />

      <MarketingPageHero
        brand
        eyebrow="Service business software"
        title="Run the day from one clear workspace."
        lead="MyTitan brings jobs, scheduling, customers, approvals, billing, and live operations together so your team can run the business without jumping between systems."
        actions={
          <>
            <a className="mkt-btn mkt-btn--primary" href={SIGN_UP_URL}>
              Start trial
            </a>
            <Link className="mkt-btn" href="/demo">
              Book demo
            </Link>
            <Link className="mkt-btn" href="/platform">
              See product
            </Link>
          </>
        }
        aside={
          <div className="mkt-stack-lg">
            <div>
              <div className="mkt-hero__asideLabel">What teams see first</div>
              <h2 className="mkt-hero__asideTitle">A calmer, clearer way to run jobs, people, customers, and cash.</h2>
            </div>
            <div className="mkt-card">
              <h3>Live control</h3>
              <p>Live jobs, bookings, technician load, and blockers stay visible without leaving the main work surface.</p>
            </div>
            <div className="mkt-card">
              <h3>Billing follow-through</h3>
              <p>Quotes, approvals, collections, and customer-facing records stay tied to the work that created them.</p>
            </div>
            <div className="mkt-card">
              <h3>Scale with control</h3>
              <p>Multi-location operations, permissions, integrations, and activity history are already part of the core product.</p>
            </div>
          </div>
        }
      />

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Platform snapshot"
          title="One place to run the business."
          lead="MyTitan is designed so operations, finance, and leadership can work from the same live picture instead of parallel systems."
        />
        <div className="mkt-kpiGrid">
          <div className="mkt-stat">
            <div className="mkt-stat__value">Run the day</div>
            <div className="mkt-stat__label">Bookings, jobs, scheduling, and technician work stay in one place.</div>
          </div>
          <div className="mkt-stat">
            <div className="mkt-stat__value">Protect the money</div>
            <div className="mkt-stat__label">Quotes, approvals, collections, and billing stay close to the work itself.</div>
          </div>
          <div className="mkt-stat">
            <div className="mkt-stat__value">Grow without chaos</div>
            <div className="mkt-stat__label">Inventory, compliance, analytics, and location-aware controls are built into the core product.</div>
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Platform screenshot"
          title="A work surface for the whole business."
          lead="This is where live work, billing follow-through, customer workspace, and controls come together."
        />
        <div className="mkt-panel mkt-proofStage">
          <div className="mkt-stack-lg">
            <div className="mkt-proofStage__header">
              <div>
                <div className="mkt-eyebrow">Operator workspace</div>
                <h3 className="mkt-proofStage__title">
                  Live control, billing follow-through, customer workspace, and controls in one shell.
                </h3>
                <p className="mkt-proofStage__copy">
                  The product organizes live work, customer-facing records, billing actions, and leadership signals inside one consistent workspace.
                </p>
              </div>
              <div className="mkt-actions" style={{ justifyContent: "flex-start" }}>
                <Link className="mkt-btn mkt-btn--primary" href="/demo">
                  Book demo
                </Link>
                <Link className="mkt-btn" href="/platform">
                  See product
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
                      "Live work control and workflow checks",
                      "Quotes, approvals, collections, and billing follow-through",
                      "Customer workspace, inventory, and repeat work",
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
          title="Four pillars, one product."
          lead="The product is structured around the real control points of the business, not a loose bundle of modules."
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
            title="Revenue follow-through"
            description="Keep approvals, billing, collections, and repeat service delivery connected to live work."
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
          title="One product across the business."
          lead="MyTitan replaces fragmented tools, disconnected handoffs, blind spots, and duplicated systems with one accountable product."
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
          lead="The strongest fit is where service delivery, customer experience, revenue discipline, and team controls all matter at the same time."
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
          title="Controls are native to the product."
          lead="MyTitan keeps tenant boundaries, operator roles, auditability, and customer-safe surfaces explicit across the product."
        />
        <div className="mkt-grid--2">
          <article className="mkt-proof">
            <h3 style={{ marginTop: 0 }}>Control at every layer</h3>
            <p>
              Workspace permissions, tenant scope, compliance controls, and integration visibility are already implemented in the live product.
            </p>
            <div className="mkt-actions" style={{ marginTop: 18 }}>
              <Link className="mkt-btn mkt-btn--primary" href="/demo">
                Book demo
              </Link>
              <Link className="mkt-btn" href="/platform">
                See product
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
            Walk through the product against real workflow pressure, customer approvals, billing follow-through, inventory control, and multi-location operations.
          </p>
          <div className="mkt-actions" style={{ marginTop: 18 }}>
            <Link className="mkt-btn mkt-btn--primary" href="/demo">
              Book demo
            </Link>
            <Link className="mkt-btn" href="/platform">
              See product
            </Link>
            <a className="mkt-btn" href={SIGN_UP_URL}>
              Start trial
            </a>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
