import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import { MarketingPageHero, MarketingSectionHeading } from "../components/marketing/Sections";
import { APP_URL, SIGN_IN_URL, SIGN_UP_URL } from "../lib/site-content";

function getApiBase() {
  const configured = String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:3000";
  return `${APP_URL.replace(/\/+$/, "")}/api`;
}

export default function BespokeAccountPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [estimatedMonthlyJobs, setEstimatedMonthlyJobs] = useState("750");
  const [locationsCount, setLocationsCount] = useState("2");
  const [message, setMessage] = useState("");
  const [consentToContact, setConsentToContact] = useState(false);
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (router.query.account === "enterprise") {
      setMessage("We would like to discuss an enterprise account and a custom completed-job allowance.");
    }
  }, [router.query.account]);

  const canSubmit = useMemo(() => (
    businessName.trim().length >= 2 &&
    contactName.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(email) &&
    Number(estimatedMonthlyJobs) >= 1 &&
    Number(locationsCount) >= 1 &&
    message.trim().length >= 12 &&
    consentToContact
  ), [businessName, contactName, consentToContact, email, estimatedMonthlyJobs, locationsCount, message]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const response = await fetch(`${getApiBase()}/public/bespoke-account-enquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          contactName,
          email,
          phone: phone || undefined,
          estimatedMonthlyJobs: Number(estimatedMonthlyJobs),
          locationsCount: Number(locationsCount),
          message,
          consentToContact,
          website,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus({ tone: "error", text: payload?.message || "The enquiry could not be recorded right now." });
        return;
      }
      setStatus({ tone: "success", text: payload?.message || "Your enquiry has been recorded." });
      setMessage("");
      setConsentToContact(false);
    } catch {
      setStatus({ tone: "error", text: "The enquiry could not be recorded right now." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MarketingShell>
      <MarketingSeo
        title="Bespoke and Enterprise Accounts"
        description="Discuss a bespoke MyTitan account for larger completed-job volumes, multi-location operations, or a custom allowance."
        path="/bespoke-account"
      />
      <MarketingPageHero
        eyebrow="Bespoke accounts"
        title="A controlled commercial path for larger field-service operations."
        lead="Standard job packs remain available. Larger businesses can discuss a custom completed-job allowance, including unlimited access where MyTitan platform administration approves and configures it."
        actions={
          <>
            <a className="mkt-btn mkt-btn--primary" href="#bespoke-enquiry">Discuss your requirements</a>
            <a className="mkt-btn" href={SIGN_UP_URL}>Start standard setup</a>
            <a className="mkt-btn mkt-btn--ghost" href={SIGN_IN_URL}>Sign in</a>
          </>
        }
        meta={
          <>
            <span className="mkt-chip">No public custom-price promise</span>
            <span className="mkt-chip">Platform-admin controlled allowances</span>
            <span className="mkt-chip">Standard packs remain available</span>
          </>
        }
      />

      <section className="mkt-section" id="bespoke-enquiry">
        <MarketingSectionHeading
          eyebrow="Request an account discussion"
          title="Tell MyTitan what your operation needs."
          lead="This enquiry does not change billing, create an unlimited allowance, or promise a price. It gives the platform team enough context for a controlled follow-up."
        />
        <div className="mkt-grid--2">
          <form className="mkt-proof mkt-demoForm" onSubmit={submit} data-testid="bespoke-account-form">
            <label>Business name<input value={businessName} onChange={(event) => setBusinessName(event.target.value)} /></label>
            <label>Contact name<input value={contactName} onChange={(event) => setContactName(event.target.value)} /></label>
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Phone <span className="mkt-muted">(optional)</span><input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
            <label>Estimated monthly job volume<input type="number" min="1" max="1000000" value={estimatedMonthlyJobs} onChange={(event) => setEstimatedMonthlyJobs(event.target.value)} /></label>
            <label>Locations or branches<input type="number" min="1" max="10000" value={locationsCount} onChange={(event) => setLocationsCount(event.target.value)} /></label>
            <label>Operating requirements<textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Describe volume, locations, workflow, and rollout needs." /></label>
            <label className="mkt-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
            <label className="mkt-checkLabel">
              <input type="checkbox" checked={consentToContact} onChange={(event) => setConsentToContact(event.target.checked)} />
              I consent to MyTitan using these details to contact me about this enquiry.
            </label>
            {status ? <div className={`mkt-formNotice mkt-formNotice--${status.tone}`} role="status">{status.text}</div> : null}
            <button className="mkt-btn mkt-btn--primary" type="submit" disabled={!canSubmit || submitting}>
              {submitting ? "Recording enquiry…" : "Request account discussion"}
            </button>
          </form>
          <div className="mkt-stack-lg">
            <article className="mkt-card">
              <h3>Standard capacity</h3>
              <p>Published plans and configured extra job packs remain the normal route for standard operating volumes.</p>
            </article>
            <article className="mkt-card">
              <h3>Bespoke allowance</h3>
              <p>MyTitan can review a custom monthly allowance for larger or multi-location operations without silently changing a tenant’s subscription.</p>
            </article>
            <article className="mkt-card">
              <h3>Unlimited access</h3>
              <p>Unlimited completed-job access is not self-serve. It can be arranged only through an approved platform-admin account control.</p>
            </article>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
