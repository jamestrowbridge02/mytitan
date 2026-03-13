import Link from "next/link";
import { FormEvent, useState } from "react";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import {
  MarketingPageHero,
  MarketingSectionHeading,
} from "../components/marketing/Sections";
import { SALES_EMAIL } from "../lib/site-content";

function buildMailto(name: string, company: string, email: string, focus: string, notes: string) {
  const subject = encodeURIComponent(`MyTitan demo request${company ? ` - ${company}` : ""}`);
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
        title="Request a Demo"
        description="Request a MyTitan demo and walk through operations control, revenue continuity, customer workspace, governance, and multi-location scale."
        path="/demo"
      />

      <MarketingPageHero
        eyebrow="Request a demo"
        title="Walk the platform against your operating model."
        lead="Use the demo path to review the workflows, commercial controls, customer experience, governance model, and rollout shape that matter to your team."
        actions={
          <>
            <Link className="mkt-btn mkt-btn--primary" href="/demo">
              Request demo
            </Link>
            <Link className="mkt-btn" href="/platform">
              See platform
            </Link>
          </>
        }
      />

      <section className="mkt-section">
        <div className="mkt-grid--2">
          <article className="mkt-proof">
            <div className="mkt-eyebrow">What the demo covers</div>
            <h2 className="mkt-sectionTitle">A practical walkthrough, not a feature recital.</h2>
            <p>
              We can focus the conversation around command-centre operations, multi-location scale, customer workspace,
              revenue continuity, compliance controls, or leadership visibility depending on where the pressure is highest.
            </p>
          </article>
          <article className="mkt-panel mkt-demoPanel">
            <MarketingSectionHeading
              eyebrow="Demo request"
              title="Tell us what you need to see."
              lead="This route opens a structured email to the MyTitan team. No fake form backend is used here."
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
                  <option>Command centre and workflow control</option>
                  <option>Recurring service plans and customer workspace</option>
                  <option>Revenue, approvals, and collections</option>
                  <option>Compliance, SLA, and audit controls</option>
                  <option>Multi-location operations and executive visibility</option>
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
                  Email request
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
