import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import { MarketingCtaBand, MarketingPageHero, MarketingSectionHeading } from "../components/marketing/Sections";
import { APP_URL, SALES_EMAIL, SIGN_UP_URL } from "../lib/site-content";

const CONTACT_CATEGORIES = [
  { value: "support", label: "Support" },
  { value: "billing", label: "Billing" },
  { value: "integrations", label: "Integrations" },
  { value: "bug_report", label: "Bug report" },
  { value: "feature_request", label: "Feature request" },
  { value: "onboarding", label: "Onboarding" },
] as const;

function getMarketingApiBase() {
  const explicit = String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
  if (explicit) return explicit;
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:3000";
  return `${APP_URL.replace(/\/$/, "")}/api`;
}

export default function ContactPage() {
  const router = useRouter();
  const [category, setCategory] = useState<(typeof CONTACT_CATEGORIES)[number]["value"]>("support");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{ tone: "success" | "warning" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const requested = typeof router.query.category === "string" ? router.query.category : "";
    if (CONTACT_CATEGORIES.some((entry) => entry.value === requested)) {
      setCategory(requested as typeof category);
    }
  }, [router.query.category]);

  const canSubmit = useMemo(() => {
    return name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && subject.trim().length >= 4 && message.trim().length >= 12;
  }, [email, message, name, subject]);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const response = await fetch(`${getMarketingApiBase()}/public/contact-mytitan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, name, email, companyName, subject, message }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus({ tone: "error", text: payload?.message || "MyTitan could not accept the request right now. Please try again shortly." });
        return;
      }
      setStatus({
        tone: payload?.ok ? "success" : "warning",
        text: payload?.message || "Your request has been recorded for MyTitan Support.",
      });
      if (payload?.ok) {
        setSubject("");
        setMessage("");
      }
    } catch {
      setStatus({ tone: "error", text: "MyTitan could not accept the request right now. Please try again shortly." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MarketingShell>
      <MarketingSeo
        title="Contact MyTitan"
        description="Contact MyTitan for support, billing help, integrations guidance, onboarding help, bug reports, or feature requests."
        path="/contact"
      />

      <MarketingPageHero
        eyebrow="Contact MyTitan"
        title="Get real help through the MyTitan support path."
        lead="Get help with support, billing, setup, onboarding, bugs, or feature requests through the same real MyTitan support route."
        actions={
          <>
            <a className="mkt-btn mkt-btn--primary" href={`mailto:${SALES_EMAIL}`}>Email MyTitan</a>
            <a className="mkt-btn" href={SIGN_UP_URL}>Create your workspace</a>
          </>
        }
        meta={
          <>
            <span className="mkt-chip">No fake live chat</span>
            <span className="mkt-chip">Real categories and support routing</span>
            <span className="mkt-chip">Truthful delivery feedback</span>
          </>
        }
        aside={
          <div className="mkt-stack-lg">
            <div className="mkt-card">
              <h3>What you can send</h3>
              <p>Ask for operational support, billing help, integration guidance, onboarding help, bug follow-up, or suggest a feature.</p>
            </div>
            <div className="mkt-card">
              <h3>How it is routed</h3>
              <p>Requests go through the real MyTitan support identity and return truthful send-success or send-failure feedback.</p>
            </div>
          </div>
        }
      />

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Support entry points"
          title="Choose the route that matches the help you need."
          lead="Every card below goes to a real source or action. There are no dead buttons and no pretend live-agent surfaces."
        />
        <div className="mkt-grid--3">
          {CONTACT_CATEGORIES.map((entry) => (
            <button
              key={entry.value}
              type="button"
              className={`mkt-card mkt-linkCard mkt-contactCard${category === entry.value ? " mkt-contactCard--active" : ""}`}
              onClick={() => setCategory(entry.value)}
            >
              <h3>{entry.label}</h3>
              <p>Select {entry.label.toLowerCase()} and the form below will route it through the right MyTitan support category.</p>
              <span className="mkt-inlineLink">Use this category</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-grid--2">
          <div className="mkt-proof">
            <div className="mkt-eyebrow">Send request</div>
            <h2 className="mkt-sectionTitle" style={{ marginTop: 14 }}>Contact MyTitan directly</h2>
            <form className="mkt-demoForm" onSubmit={submitForm} data-testid="marketing-contact-form">
              <label>
                Category
                <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
                  {CONTACT_CATEGORIES.map((entry) => (
                    <option key={entry.value} value={entry.value}>{entry.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
              </label>
              <label>
                Email
                <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" type="email" />
              </label>
              <label>
                Company
                <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Optional" />
              </label>
              <label>
                Subject
                <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What do you need help with?" />
              </label>
              <label>
                Message
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Tell MyTitan what you need, what you expected, and what happened." />
              </label>
              {status ? <div className={`mkt-formNotice mkt-formNotice--${status.tone}`} data-testid="marketing-contact-status">{status.text}</div> : null}
              <div className="mkt-actions">
                <button className="mkt-btn mkt-btn--primary" type="submit" disabled={!canSubmit || submitting}>
                  {submitting ? "Sending request..." : "Send to MyTitan"}
                </button>
                <a className="mkt-btn" href={`mailto:${SALES_EMAIL}`}>Use email instead</a>
              </div>
            </form>
          </div>

          <div className="mkt-proof">
            <div className="mkt-eyebrow">Direct routes</div>
            <h2 className="mkt-sectionTitle" style={{ marginTop: 14 }}>Prefer a different entry point?</h2>
            <div className="mkt-stack-md">
              <Link className="mkt-card mkt-linkCard" href="/pricing">
                <h3>Commercial fit first</h3>
                <p>Review allowances, plan fit, and billing truth before sending a pricing or billing question.</p>
                <span className="mkt-inlineLink">Open pricing</span>
              </Link>
              <Link className="mkt-card mkt-linkCard" href="/platform">
                <h3>Understand the workflow</h3>
                <p>See the booking, job sheet, customer page, and payment flow before asking how the product works.</p>
                <span className="mkt-inlineLink">Open platform</span>
              </Link>
              <div className="mkt-card">
                <h3>Support identity</h3>
                <p>MyTitan support requests route through <strong>{SALES_EMAIL}</strong>. There is no fake live chat or pretend agent status on this site.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketingCtaBand
        title="Start with a workspace, then ask for help when you need it."
        copy="Use the direct contact flow for real help, or start your workspace and use the in-app support route later."
        primaryLabel="Create your workspace"
        primaryHref={SIGN_UP_URL}
        secondaryLabel="See pricing"
        secondaryHref="/pricing"
      />
    </MarketingShell>
  );
}
