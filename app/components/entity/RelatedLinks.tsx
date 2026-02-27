import Link from "next/link";

type RelatedLinksProps = {
  tradeAccountId?: string | null;
  tradeAccountLabel?: string | null;
  jobId?: string | null;
  bookingId?: string | null;
  vehicleLabel?: string | null;
  locationLabel?: string | null;
};

export default function RelatedLinks({
  tradeAccountId,
  tradeAccountLabel,
  jobId,
  bookingId,
  vehicleLabel,
  locationLabel,
}: RelatedLinksProps) {
  const hasLinks = Boolean(tradeAccountId || jobId || bookingId || vehicleLabel || locationLabel);
  if (!hasLinks) return null;

  return (
    <div className="card" style={{ marginBottom: 16, padding: 16 }}>
      <strong style={{ display: "block", marginBottom: 8 }}>Related</strong>
      <div className="pill-row" style={{ marginBottom: 0 }}>
        {tradeAccountId ? (
          <Link className="pill" href={`/dashboard/trade-accounts/${tradeAccountId}`}>
            {tradeAccountLabel || "Trade account"}
          </Link>
        ) : null}
        {jobId ? (
          <Link className="pill" href={`/dashboard/jobs/${jobId}`}>
            Job
          </Link>
        ) : null}
        {bookingId ? (
          <Link className="pill" href={`/dashboard/bookings/${bookingId}`}>
            Booking
          </Link>
        ) : null}
        {vehicleLabel ? <span className="pill">{vehicleLabel}</span> : null}
        {locationLabel ? <span className="pill">{locationLabel}</span> : null}
      </div>
    </div>
  );
}
