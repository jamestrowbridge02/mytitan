import { useEffect, useMemo, useState } from "react";

import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorPageHeader } from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";

type Review = {
  id: string;
  rating: number;
  quote: string;
  businessName: string;
  reviewerName?: string | null;
  reviewerTitle?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "ARCHIVED";
  moderationNote?: string | null;
  createdAt: string;
};

export default function WorkspaceReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState("5");
  const [quote, setQuote] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerTitle, setReviewerTitle] = useState("");
  const [consentToPublish, setConsentToPublish] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const rows = await apiFetch("/marketing-reviews");
    setReviews(Array.isArray(rows) ? rows : []);
  }

  useEffect(() => {
    void load().catch((loadError: any) => setError(loadError?.message || "Reviews could not be loaded."));
  }, []);

  const canSubmit = useMemo(() => (
    Number(rating) >= 1 &&
    Number(rating) <= 5 &&
    quote.trim().length >= 12 &&
    businessName.trim().length >= 2 &&
    consentToPublish
  ), [businessName, consentToPublish, quote, rating]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setStatus("");
    setError("");
    try {
      const created = await apiFetch("/marketing-reviews", {
        method: "POST",
        body: JSON.stringify({
          rating: Number(rating),
          quote,
          businessName,
          reviewerName: reviewerName || undefined,
          reviewerTitle: reviewerTitle || undefined,
          consentToPublish,
        }),
      });
      setStatus(`Review submitted with ${created.status.toLowerCase()} moderation status.`);
      setQuote("");
      setReviewerName("");
      setReviewerTitle("");
      setConsentToPublish(false);
      await load();
    } catch (submitError: any) {
      setError(submitError?.message || "The review could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Workspace review"
          title="Submit a review for moderation"
          subtitle="Owners and admins can submit a short testimonial. Nothing appears on the public site until explicit consent and platform approval are both present."
          actions={[
            { label: "Open settings", href: "/dashboard/settings", variant: "secondary" },
            { label: "Contact MyTitan", href: "/dashboard/help", variant: "secondary" },
          ]}
          shortcuts={["Pending by default", "No customer data", "Platform moderation required"]}
          stats={[
            { label: "Submitted", value: String(reviews.length), hint: "Visible only inside this workspace and platform moderation" },
            { label: "Approved", value: String(reviews.filter((review) => review.status === "APPROVED").length), hint: "Eligible for approved public display" },
            { label: "Pending", value: String(reviews.filter((review) => review.status === "PENDING").length), hint: "Awaiting platform review" },
          ]}
        />

        <section className="card operator-section" data-testid="workspace-review-submission">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Review details</h2>
              <p className="operator-section__subtitle">Do not include customer names, job details, addresses, payment information, or other sensitive data.</p>
            </div>
          </div>
          <form className="form-grid" onSubmit={submit}>
            <label>
              Rating
              <select className="input" value={rating} onChange={(event) => setRating(event.target.value)}>
                <option value="5">5 - Excellent</option>
                <option value="4">4 - Very good</option>
                <option value="3">3 - Good</option>
                <option value="2">2 - Fair</option>
                <option value="1">1 - Poor</option>
              </select>
            </label>
            <label>
              Business name
              <input className="input" value={businessName} onChange={(event) => setBusinessName(event.target.value)} maxLength={160} />
            </label>
            <label>
              Reviewer name (optional)
              <input className="input" value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} maxLength={120} />
            </label>
            <label>
              Reviewer title (optional)
              <input className="input" value={reviewerTitle} onChange={(event) => setReviewerTitle(event.target.value)} maxLength={120} />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Short review
              <textarea className="input" value={quote} onChange={(event) => setQuote(event.target.value)} maxLength={500} rows={5} />
            </label>
            <label className="check-row" style={{ gridColumn: "1 / -1" }}>
              <input type="checkbox" checked={consentToPublish} onChange={(event) => setConsentToPublish(event.target.checked)} />
              I confirm this contains no customer or sensitive data and consent to MyTitan publishing it after moderation.
            </label>
            {status ? <div className="success" role="status" style={{ gridColumn: "1 / -1" }}>{status}</div> : null}
            {error ? <div className="error" role="alert" style={{ gridColumn: "1 / -1" }}>{error}</div> : null}
            <div style={{ gridColumn: "1 / -1" }}>
              <button className="button" type="submit" disabled={!canSubmit || submitting}>
                {submitting ? "Submitting..." : "Submit for approval"}
              </button>
            </div>
          </form>
        </section>

        <section className="card operator-section" data-testid="workspace-review-history">
          <h2 className="operator-section__title">Submission history</h2>
          <div className="operator-list">
            {reviews.map((review) => (
              <article className="operator-list__item" key={review.id}>
                <div>
                  <strong>{review.businessName}</strong>
                  <p>{review.quote}</p>
                  {review.moderationNote ? <small>Moderation note: {review.moderationNote}</small> : null}
                </div>
                <span className="operator-tag">{review.status.toLowerCase()}</span>
              </article>
            ))}
            {!reviews.length ? <p className="muted">No review has been submitted from this workspace.</p> : null}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
