import Link from "next/link";
import { FormEvent, useState } from "react";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import {
  MarketingPageHero,
  MarketingSectionHeading,
} from "../components/marketing/Sections";
import { SALES_EMAIL, SIGN_UP_URL } from "../lib/site-content";

function buildMailto(name: string, company: string, email: string, focus: string, notes: string) {
  const subject = encodeURIComponent(`MyTitan rollout request${company ? ` - ${company}` : ""}`);
  const body = encodeURIComponent(
    [
      `Name: ${name || "-"}`,
      `Company: ${company || "-"}`,
      `Email: ${email || "-"}`,
      `Primary focus: ${focus || "-"}`,
      "",
      "Notes:",
      notes || "-",
    ].join("\n"),
  );
  return `mailto:${SALES_EMAIL}?subject=${subject}&body=${body}`;
}

export default function DemoPage() {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [focus, setFocus] = useState("Command centre and workflow control");
  const [notes, setNotes] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.location.href = buildMailto(name, company, email, focus, notes);
  }

  return (
    <MarketingShell>
      <MarketingSeo
        title="Set Up Booking Link"
        description="Use this page to request rollout help for bookings, jobs, billing follow-through, and workspace setup."
        path="/demo"
      />

      <MarketingPageHero
        eyebrow="Rollout help"
        title="Set up the product against your real workflow."
        lead="Use this path when you want help shaping bookings, customer journeys, billing steps, team controls, and rollout order around your business."
        actions={
          <>
            <a className="mkt-btn mkt-btn--primary" href={SIGN_UP_URL}>Create your workspace</a>
            <Link className="mkt-btn" href="/platform">
              See product
            </Link>
          </>
        }
      />

      <section className="mkt-section">
        <div className="mkt-grid--2">
          <article className="mkt-proof">
            <div className="mkt-eyebrow">What this covers</div>
            <h2 className="mkt-sectionTitle">A practical rollout conversation, not a feature recital.</h2>
            <p>
              We can focus the conversation around daily operations, repeat work, customer updates,
              billing follow-through, controls, or rollout shape depending on where the pressure is highest.
            </p>
          </article>
          <article className="mkt-panel mkt-demoPanel">
            <MarketingSectionHeading
              eyebrow="Rollout request"
              title="Tell us what you need to set up."
              lead="This opens a structured email to the MyTitan team. We keep it simple instead of pretending there is a live marketing form backend."
            />
            <form className="mkt-demoForm" onSubmit={handleSubmit}>
              <label>
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" />
              </label>
              <label>
                Company
                <input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Northfield Service Group" />
              </label>
              <label>
                Work email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="alex@company.com"
                />
              </label>
              <label>
                Primary focus
                <select value={focus} onChange={(event) => setFocus(event.target.value)}>
                  <option>Live operations and workflow control</option>
                  <option>Recurring service plans and customer workspace</option>
                  <option>Quotes, approvals, and billing follow-up</option>
                  <option>Compliance, SLA, and audit controls</option>
                  <option>Multi-location operations and reporting</option>
                </select>
              </label>
              <label>
                Notes
                <textarea
                  rows={5}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Describe your operating model, team shape, or the workflows you want to review."
                />
              </label>
              <div className="mkt-actions">
                <button className="mkt-btn mkt-btn--primary" type="submit">
                  Send request
                </button>
                <a className="mkt-btn" href={`mailto:${SALES_EMAIL}`}>
                  {SALES_EMAIL}
                </a>
              </div>
            </form>
          </article>
        </div>
      </section>
    </MarketingShell>
  );
}
