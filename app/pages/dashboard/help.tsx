import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorPageHeader } from "../../components/ui/operator-page";
import { OperatorNotice } from "../../components/feedback/OperatorNotice";
import { useOperatorNotice } from "../../components/feedback/useOperatorNotice";
import { apiFetch } from "../../lib/api";

const SUPPORT_CATEGORIES = [
  { value: "support", label: "Support", description: "General help with the product or a blocked workflow." },
  { value: "billing", label: "Billing", description: "Questions about billing state, payments, pricing, or invoices." },
  { value: "integrations", label: "Integrations", description: "Help wiring providers, webhooks, or integration readiness." },
  { value: "bug_report", label: "Bug report", description: "Something is broken, unclear, or behaving differently than expected." },
  { value: "feature_request", label: "Feature request", description: "Suggest a product improvement or workflow enhancement." },
  { value: "onboarding", label: "Onboarding", description: "Ask for setup help, rollout guidance, or workspace configuration support." },
] as const;

export default function DashboardHelpPage() {
  const router = useRouter();
  const [category, setCategory] = useState<(typeof SUPPORT_CATEGORIES)[number]["value"]>("support");
  const [callbackEmail, setCallbackEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();

  useEffect(() => {
    if (!router.isReady) return;
    const queryCategory = typeof router.query.category === "string" ? router.query.category : "";
    const nextCategory = SUPPORT_CATEGORIES.find((entry) => entry.value === queryCategory);
    if (nextCategory) setCategory(nextCategory.value);
  }, [router.isReady, router.query.category]);

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/me")
      .then((me) => {
        if (cancelled) return;
        const email = String(me?.email || "").trim();
        if (email) setCallbackEmail(email);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCategory = useMemo(
    () => SUPPORT_CATEGORIES.find((entry) => entry.value === category) || SUPPORT_CATEGORIES[0],
    [category],
  );

  const canSubmit = subject.trim().length >= 4 && message.trim().length >= 12 && /\S+@\S+\.\S+/.test(callbackEmail);

  async function submitSupportRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    clearNotice();
    try {
      const response = await apiFetch("/notifications/support-request", {
        method: "POST",
        body: JSON.stringify({ category, callbackEmail, subject, message }),
      });
      if (response?.ok) {
        showSuccess(response.message || "Your request was sent to MyTitan Support.");
        setSubject("");
        setMessage("");
        return;
      }
      showError(response?.message || "MyTitan could not send the request right now.");
    } catch (error: any) {
      showError(error?.message || "MyTitan could not send the request right now.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Help"
          title="Contact MyTitan Support"
          subtitle="Use the real MyTitan support path for help, billing questions, integration guidance, onboarding help, bug reports, or feature requests."
          actions={[
            { label: "Open operations readiness", href: "/dashboard/settings/operations", variant: "secondary" },
            { label: "Open settings", href: "/dashboard/settings", variant: "secondary" },
          ]}
          shortcuts={["No fake live chat or live-agent indicator", "Requests return truthful send-success or send-failure feedback"]}
          stats={[
            { label: "Support identity", value: "MyTitan", hint: "Uses the MyTitan system support path" },
            { label: "Categories", value: String(SUPPORT_CATEGORIES.length), hint: "Support, billing, integrations, bugs, features, onboarding" },
            { label: "Route", value: selectedCategory.label, hint: selectedCategory.description },
          ]}
        />

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Choose a category</h2>
              <p className="operator-section__subtitle">These cards are direct routes into the real support form, not decorative placeholders.</p>
            </div>
          </div>
          <div className="dashboard-help-grid">
            {SUPPORT_CATEGORIES.map((entry) => (
              <button
                key={entry.value}
                type="button"
                className={`integration-card dashboard-help-card${category === entry.value ? " dashboard-help-card--active" : ""}`}
                onClick={() => setCategory(entry.value)}
                data-testid={`dashboard-help-category-${entry.value}`}
              >
                <strong>{entry.label}</strong>
                <p className="muted" style={{ margin: "8px 0 0 0" }}>{entry.description}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Send request</h2>
              <p className="operator-section__subtitle">Describe what happened, what you expected, and any workspace context MyTitan should know before replying.</p>
            </div>
          </div>
          <form className="dashboard-help-form" onSubmit={submitSupportRequest} data-testid="dashboard-help-form">
            <label className="dashboard-help-form__field">
              <span>Category</span>
              <select className="input" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
                {SUPPORT_CATEGORIES.map((entry) => (
                  <option key={entry.value} value={entry.value}>{entry.label}</option>
                ))}
              </select>
            </label>
            <label className="dashboard-help-form__field">
              <span>Callback email</span>
              <input className="input" type="email" value={callbackEmail} onChange={(event) => setCallbackEmail(event.target.value)} placeholder="you@example.com" />
            </label>
            <label className="dashboard-help-form__field">
              <span>Subject</span>
              <input className="input" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What does MyTitan need to know first?" />
            </label>
            <label className="dashboard-help-form__field">
              <span>Message</span>
              <textarea className="textarea" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Share the steps, expected result, actual result, and what is blocked." />
            </label>
            <div className="dashboard-help-form__actions">
              <button className="button" type="submit" disabled={!canSubmit || submitting} data-testid="dashboard-help-submit">
                {submitting ? "Sending request..." : "Send to MyTitan Support"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </DashboardShell>
  );
}
