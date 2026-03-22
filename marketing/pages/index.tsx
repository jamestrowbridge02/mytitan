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
  const buyerOutcomes = [
    {
      title: "Less chasing",
      description: "Keep jobs, approvals, customer updates, and billing in one flow so work does not stall between teams.",
    },
    {
      title: "Clearer workload",
      description: "See what is booked, blocked, overdue, or waiting without piecing together separate screens.",
    },
    {
      title: "Fewer missed follow-ups",
      description: "Tie billing, recurring work, and customer communication to the real job instead of separate reminders.",
    },
    {
      title: "Better control as you grow",
      description: "Add permissions, locations, integrations, and audit trails without rebuilding the way your team works.",
    },
  ];

  return (
    <MarketingShell>
      <MarketingSeo />

      <MarketingPageHero
        brand
        eyebrow="Service business software"
        title="Run jobs, customers, and billing in one place."
        lead="MyTitan gives service businesses one clear workspace for bookings, jobs, schedules, approvals, customer updates, and billing."
        actions={
          <>
            <a className="mkt-btn mkt-btn--primary" href={SIGN_UP_URL}>
              Get started
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
              <div className="mkt-hero__asideLabel">Why teams switch</div>
              <h2 className="mkt-hero__asideTitle">One system for the work, the customer, and the money.</h2>
            </div>
            <div className="mkt-card">
              <h3>See the whole day</h3>
              <p>Bookings, jobs, technician load, and blockers stay visible in the same workspace.</p>
            </div>
            <div className="mkt-card">
              <h3>Keep work moving</h3>
              <p>Quotes, approvals, billing, and customer records stay tied to the job that created them.</p>
            </div>
            <div className="mkt-card">
              <h3>Stay in control</h3>
              <p>Permissions, locations, integrations, and activity history are built into the product as you grow.</p>
            </div>
          </div>
        }
      />

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="What it helps with"
          title="One place to run the business."
          lead="MyTitan keeps the day-to-day work, the customer journey, and the billing follow-through in the same system."
        />
        <div className="mkt-kpiGrid">
          <div className="mkt-stat">
            <div className="mkt-stat__value">Run the work</div>
            <div className="mkt-stat__label">Bookings, jobs, schedules, and technician activity stay together.</div>
          </div>
          <div className="mkt-stat">
            <div className="mkt-stat__value">Protect revenue</div>
            <div className="mkt-stat__label">Quotes, approvals, billing, and collections stay close to the work itself.</div>
          </div>
          <div className="mkt-stat">
            <div className="mkt-stat__value">Grow with control</div>
            <div className="mkt-stat__label">Permissions, locations, reporting, and controls are ready when the business gets more complex.</div>
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Inside the product"
          title="A workspace your whole team can follow."
          lead="Dispatch, customer updates, billing actions, and controls live in one consistent shell."
        />
        <div className="mkt-panel mkt-proofStage">
          <div className="mkt-stack-lg">
            <div className="mkt-proofStage__header">
              <div>
                <div className="mkt-eyebrow">Operator workspace</div>
                <h3 className="mkt-proofStage__title">The team sees the same live picture of the business.</h3>
                <p className="mkt-proofStage__copy">
                  The product keeps open work, customer records, billing actions, and operational signals together so teams can act without second-guessing the source of truth.
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
                      <div className="mkt-stat__label">Live work signals</div>
                    </div>
                    <div className="mkt-stat">
                      <div className="mkt-stat__value">6</div>
                      <div className="mkt-stat__label">Core work areas</div>
                    </div>
                    <div className="mkt-stat">
                      <div className="mkt-stat__value">2</div>
                      <div className="mkt-stat__label">Locations in view</div>
                    </div>
                  </div>
                  <div className="mkt-proofRail">
                    {[
                      "Live jobs, bookings, and workflow checks",
                      "Quotes, approvals, billing, and collections",
                      "Customer accounts, inventory, and repeat work",
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
          eyebrow="Core product"
          title="Built around the parts of the business that matter most."
          lead="MyTitan is organised around how service businesses actually work, not around a loose list of add-ons."
        />
        <div className="mkt-grid--2">
          <MarketingCapabilityCard
            title="Operations"
            description="Coordinate bookings, jobs, schedules, technician work, and completion records in one place."
            bullets={[
              "Live board for open work and blockers",
              "Calendar, scheduling, and capacity visibility",
              "Technician workflow and completion records",
            ]}
          />
          <MarketingCapabilityCard
            title="Revenue"
            description="Keep approvals, billing, collections, and repeat service delivery connected to the real work."
            bullets={[
              "Quotes, approvals, and collections",
              "Billing follow-through and recurring service plans",
              "Revenue visibility tied to real operational context",
            ]}
          />
          <MarketingCapabilityCard
            title="Customer experience"
            description="Give customers one clear place for approvals, documents, updates, and completed work."
            bullets={[
              "Customer accounts and customer-safe records",
              "Approvals, documents, and completion acknowledgement",
              "Clear separation from internal operator controls",
            ]}
          />
          <MarketingCapabilityCard
            title="Control"
            description="Scale the product without losing track of permissions, locations, integrations, or audit needs."
            bullets={[
              "Role-based access and audit history",
              "Multi-location operations and inventory visibility",
              "Compliance, analytics, and performance views",
            ]}
          />
        </div>
      </section>

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Why teams switch"
          title="Replace disconnected tools with one clear system."
          lead="MyTitan closes the gaps between operations, customer communication, and billing."
        />
        <div className="mkt-grid--2">
          {buyerOutcomes.map((group) => (
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
          title="Built for busy service businesses."
          lead="The strongest fit is where service delivery, customer communication, and revenue follow-through all need to stay tightly connected."
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
          title="Control is built in."
          lead="Tenant boundaries, permissions, audit history, and customer-safe access are part of the product from the start."
        />
        <div className="mkt-grid--2">
          <article className="mkt-proof">
            <h3 style={{ marginTop: 0 }}>Control at every layer</h3>
            <p>
              Workspace permissions, tenant scope, compliance controls, and integration visibility are already part of the live product.
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
            Walk through the product against your real workflow pressure, customer approvals, billing follow-through, inventory control, and multi-location needs.
          </p>
          <div className="mkt-actions" style={{ marginTop: 18 }}>
            <Link className="mkt-btn mkt-btn--primary" href="/demo">
              Book demo
            </Link>
            <Link className="mkt-btn" href="/platform">
              See product
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
