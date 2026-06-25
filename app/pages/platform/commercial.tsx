import { useEffect, useState } from "react";

import { PlatformShell } from "../../components/platform-shell";
import { apiFetch } from "../../lib/api";

type Enquiry = {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone?: string | null;
  estimatedMonthlyJobs: number;
  locationsCount: number;
  message: string;
  status: "NEW" | "CONTACTED" | "CLOSED" | "ARCHIVED";
  emailDeliveryStatus?: string | null;
  internalNote?: string | null;
};

type ModerationReview = {
  id: string;
  tenant: { id: string; name: string };
  rating: number;
  quote: string;
  businessName: string;
  reviewerName?: string | null;
  reviewerTitle?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "ARCHIVED";
  pinned: boolean;
  sortOrder: number;
  moderationNote?: string | null;
};

export default function PlatformCommercialPage() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [reviews, setReviews] = useState<ModerationReview[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  async function load() {
    setError("");
    const [enquiryRows, reviewRows] = await Promise.all([
      apiFetch("/admin/platform/commercial/enquiries"),
      apiFetch("/admin/platform/commercial/reviews"),
    ]);
    setEnquiries(Array.isArray(enquiryRows) ? enquiryRows : []);
    setReviews(Array.isArray(reviewRows) ? reviewRows : []);
  }

  useEffect(() => {
    void load().catch((loadError: any) => setError(loadError?.message || "Commercial inbox could not be loaded."));
  }, []);

  async function updateEnquiry(enquiry: Enquiry, status: Enquiry["status"]) {
    setSaving(enquiry.id);
    setError("");
    try {
      await apiFetch(`/admin/platform/commercial/enquiries/${enquiry.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, internalNote: enquiry.internalNote || undefined }),
      });
      await load();
    } catch (updateError: any) {
      setError(updateError?.message || "Enquiry could not be updated.");
    } finally {
      setSaving("");
    }
  }

  async function moderate(review: ModerationReview, status: ModerationReview["status"]) {
    setSaving(review.id);
    setError("");
    try {
      await apiFetch(`/admin/platform/commercial/reviews/${review.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          displayQuote: review.quote,
          displayBusinessName: review.businessName,
          displayReviewerName: review.reviewerName || undefined,
          displayReviewerTitle: review.reviewerTitle || undefined,
          pinned: review.pinned,
          sortOrder: Number(review.sortOrder || 0),
          moderationNote: review.moderationNote || undefined,
        }),
      });
      await load();
    } catch (moderationError: any) {
      setError(moderationError?.message || "Review could not be moderated.");
    } finally {
      setSaving("");
    }
  }

  return (
    <PlatformShell>
      <div className="platform-admin-stack">
        <section className="platform-admin-section card">
          <div className="platform-admin-section__head">
            <div className="platform-admin-section-copy">
              <div className="platform-admin-section-copy__eyebrow">Commercial inbox</div>
              <h2>Bespoke account enquiries</h2>
              <p>Internal-only contact details and operating volume. Updates do not mutate billing or job allowances.</p>
            </div>
            <button className="button secondary" type="button" onClick={() => void load()}>Refresh</button>
          </div>
          {error ? <div className="error" role="alert">{error}</div> : null}
          <div className="platform-admin-list" data-testid="platform-bespoke-enquiry-inbox">
            {enquiries.map((enquiry) => (
              <article className="card platform-admin-card-stack" key={enquiry.id}>
                <div className="platform-admin-card-stack__header">
                  <div><strong>{enquiry.businessName}</strong><p>{enquiry.contactName} · {enquiry.email}</p></div>
                  <span className="platform-admin-chip">{enquiry.status.toLowerCase()}</span>
                </div>
                <p>{enquiry.message}</p>
                <div className="platform-admin-chip-row">
                  <span className="platform-admin-chip">{enquiry.estimatedMonthlyJobs} jobs/month</span>
                  <span className="platform-admin-chip">{enquiry.locationsCount} locations</span>
                  <span className="platform-admin-chip">email {enquiry.emailDeliveryStatus || "not sent"}</span>
                </div>
                <label>Internal note<textarea className="input" value={enquiry.internalNote || ""} onChange={(event) => setEnquiries((current) => current.map((item) => item.id === enquiry.id ? { ...item, internalNote: event.target.value } : item))} /></label>
                <div className="button-row">
                  <button className="button" type="button" disabled={saving === enquiry.id} onClick={() => void updateEnquiry(enquiry, "CONTACTED")}>Mark contacted</button>
                  <button className="button secondary" type="button" disabled={saving === enquiry.id} onClick={() => void updateEnquiry(enquiry, "CLOSED")}>Close</button>
                  <button className="button secondary" type="button" disabled={saving === enquiry.id} onClick={() => void updateEnquiry(enquiry, "ARCHIVED")}>Archive</button>
                </div>
              </article>
            ))}
            {!enquiries.length ? <p className="muted">No bespoke enquiries are currently recorded.</p> : null}
          </div>
        </section>

        <section className="platform-admin-section card">
          <div className="platform-admin-section-copy">
            <div className="platform-admin-section-copy__eyebrow">Review moderation</div>
            <h2>Approve only display-safe, consented reviews</h2>
            <p>Rejected, pending, and archived reviews are never returned by the public marketing endpoint.</p>
          </div>
          <div className="platform-admin-list" data-testid="platform-review-moderation-inbox">
            {reviews.map((review) => (
              <article className="card platform-admin-card-stack" key={review.id}>
                <div className="platform-admin-card-stack__header">
                  <div><strong>{review.businessName}</strong><p>{review.tenant.name} · {review.rating}/5</p></div>
                  <span className="platform-admin-chip">{review.status.toLowerCase()}</span>
                </div>
                <label>Display quote<textarea className="input" value={review.quote} onChange={(event) => setReviews((current) => current.map((item) => item.id === review.id ? { ...item, quote: event.target.value } : item))} /></label>
                <div className="form-grid">
                  <label>Display business<input className="input" value={review.businessName} onChange={(event) => setReviews((current) => current.map((item) => item.id === review.id ? { ...item, businessName: event.target.value } : item))} /></label>
                  <label>Reviewer name<input className="input" value={review.reviewerName || ""} onChange={(event) => setReviews((current) => current.map((item) => item.id === review.id ? { ...item, reviewerName: event.target.value } : item))} /></label>
                  <label>Reviewer title<input className="input" value={review.reviewerTitle || ""} onChange={(event) => setReviews((current) => current.map((item) => item.id === review.id ? { ...item, reviewerTitle: event.target.value } : item))} /></label>
                  <label>Order<input className="input" type="number" value={review.sortOrder} onChange={(event) => setReviews((current) => current.map((item) => item.id === review.id ? { ...item, sortOrder: Number(event.target.value) } : item))} /></label>
                </div>
                <label className="check-row"><input type="checkbox" checked={review.pinned} onChange={(event) => setReviews((current) => current.map((item) => item.id === review.id ? { ...item, pinned: event.target.checked } : item))} /> Pin this approved review</label>
                <label>Moderation note<textarea className="input" value={review.moderationNote || ""} onChange={(event) => setReviews((current) => current.map((item) => item.id === review.id ? { ...item, moderationNote: event.target.value } : item))} /></label>
                <div className="button-row">
                  <button className="button" type="button" disabled={saving === review.id} onClick={() => void moderate(review, "APPROVED")}>Approve</button>
                  <button className="button secondary" type="button" disabled={saving === review.id} onClick={() => void moderate(review, "REJECTED")}>Reject</button>
                  <button className="button secondary" type="button" disabled={saving === review.id} onClick={() => void moderate(review, "ARCHIVED")}>Archive</button>
                </div>
              </article>
            ))}
            {!reviews.length ? <p className="muted">No reviews are awaiting or retaining moderation state.</p> : null}
          </div>
        </section>
      </div>
    </PlatformShell>
  );
}
