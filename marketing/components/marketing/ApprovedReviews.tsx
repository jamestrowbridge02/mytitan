import { useEffect, useState } from "react";

import { APP_URL } from "../../lib/site-content";

type ApprovedReview = {
  id: string;
  rating: number;
  quote: string;
  businessName: string;
  reviewerName?: string | null;
  reviewerTitle?: string | null;
};

function getApiBase() {
  const configured = String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:3000";
  return `${APP_URL.replace(/\/+$/, "")}/api`;
}

export function ApprovedReviews() {
  const [reviews, setReviews] = useState<ApprovedReview[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${getApiBase()}/public/marketing-reviews`)
      .then((response) => response.ok ? response.json() : [])
      .then((payload) => {
        if (active) setReviews(Array.isArray(payload) ? payload : []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="mkt-editorialSection mkt-approvedReviews" aria-labelledby="approved-reviews-title">
      <div className="mkt-editorialSection__intro">
        <h2 id="approved-reviews-title">Reviews</h2>
      </div>
      {reviews.length ? (
        <div className="mkt-reviewGrid" data-testid="approved-marketing-reviews">
          {reviews.map((review) => (
            <figure className="mkt-reviewCard" key={review.id}>
              <div className="mkt-reviewCard__rating" aria-label={`${review.rating} out of 5 stars`}>
                {"★".repeat(review.rating)}<span aria-hidden="true">{"☆".repeat(5 - review.rating)}</span>
              </div>
              <blockquote>“{review.quote}”</blockquote>
              <figcaption>
                <strong>{review.businessName}</strong>
                {review.reviewerName ? <span>{review.reviewerName}{review.reviewerTitle ? `, ${review.reviewerTitle}` : ""}</span> : null}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : loaded ? (
        <p className="mkt-reviewsEmpty" data-testid="approved-marketing-reviews-empty">No reviews published yet.</p>
      ) : (
        <p className="mkt-muted" aria-live="polite">Loading reviews...</p>
      )}
    </section>
  );
}
