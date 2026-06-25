import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { LoadingState } from "../../../../components/states/LoadingState";
import { getApiBase } from "../../../../lib/api";

const API_BASE = getApiBase();

type Slot = {
  startsAt: string;
  endsAt: string;
};

type BookingStatusResponse = {
  id: string;
  serviceName?: string | null;
  startsAt?: string | null;
  customerName?: string | null;
  assignedUser?: { email: string } | null;
  job?: { id: string; jobRef?: string | null } | null;
  pricingSnapshotJson?: {
    effectivePriceCents?: number | null;
    depositDueCents?: number | null;
    remainingBalanceCents?: number | null;
    durationMinutes?: number | null;
  } | null;
  serviceLines?: Array<{
    id?: string;
    serviceNameSnapshot?: string | null;
    quantity?: number | null;
    lineTotalCents?: number | null;
    durationSnapshot?: number | null;
  }>;
  paymentStateJson?: {
    note?: string | null;
    depositStatusLabel?: string | null;
    depositStatus?: string | null;
    depositRefundStatusLabel?: string | null;
    depositRefundStatus?: string | null;
    refundedAmountCents?: number | null;
    depositRefundPendingAmountCents?: number | null;
  } | null;
  customerState?: {
    label?: string;
    nextStep?: string;
    canReschedule?: boolean;
    canCancel?: boolean;
  } | null;
  customerComms?: Array<{
    id: string;
    title?: string | null;
    reasonKey?: string | null;
    note?: string | null;
    createdAt?: string;
  }>;
};

type AvailabilityResponse = {
  slots: Slot[];
  nextAvailableSlot?: string | null;
  nextAvailableDate?: string | null;
  timezone?: string | null;
};

function formatMoney(value?: number | null) {
  return typeof value === "number" ? `£${(value / 100).toFixed(2)}` : "Not set";
}

function formatDateTime(value?: string | null, timeZone = "UTC") {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

function formatDateInput(value?: string | null) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function formatTeamLabel(value?: string | null) {
  if (!value) return "Assigned before the visit";
  const localPart = value.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (!localPart) return "Assigned before the visit";
  return localPart.replace(/\b\w/g, (match) => match.toUpperCase());
}

export default function PublicBookingStatusPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : "";
  const [booking, setBooking] = useState<BookingStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [availability, setAvailability] = useState<AvailabilityResponse>({ slots: [], nextAvailableSlot: null, nextAvailableDate: null, timezone: "UTC" });
  const [selectedSlot, setSelectedSlot] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "reschedule" | "cancel">("");

  async function load() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const response = (await fetch(`${API_BASE}/public/booking-status/${token}`).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || "Booking status not available.");
        return data;
      })) as BookingStatusResponse;
      setBooking(response);
      setDate(formatDateInput(response.startsAt));
    } catch (err: any) {
      setError(err?.message || "Booking status not available.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  useEffect(() => {
    if (!token || !booking?.customerState?.canReschedule) {
      setAvailability({ slots: [], nextAvailableSlot: null, nextAvailableDate: null, timezone: "UTC" });
      return;
    }
    let active = true;
    fetch(`${API_BASE}/public/booking-status/${token}/slots?date=${encodeURIComponent(date)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({ slots: [] }));
        if (!active) return;
        if (!res.ok) throw new Error(data?.message || "Availability not available.");
        setAvailability({
          slots: Array.isArray(data?.slots) ? data.slots : [],
          nextAvailableSlot: data?.nextAvailableSlot || null,
          nextAvailableDate: data?.nextAvailableDate || null,
          timezone: data?.timezone || "UTC",
        });
      })
      .catch(() => {
        if (!active) return;
        setAvailability({ slots: [], nextAvailableSlot: null, nextAvailableDate: null, timezone: "UTC" });
      });
    return () => {
      active = false;
    };
  }, [token, date, booking?.customerState?.canReschedule]);

  useEffect(() => {
    setSelectedSlot("");
  }, [date, booking?.id]);

  const canReschedule = Boolean(booking?.customerState?.canReschedule);
  const canCancel = Boolean(booking?.customerState?.canCancel);
  const timezone = availability.timezone || "UTC";
  const summaryRows = useMemo(
    () => [
      { label: "Service", value: booking?.serviceLines && booking.serviceLines.length > 1 ? `${booking.serviceLines.length} services` : booking?.serviceName || "Service" },
      { label: "Time", value: formatDateTime(booking?.startsAt, timezone) },
      { label: "Assigned specialist", value: formatTeamLabel(booking?.assignedUser?.email) },
      { label: "Price", value: formatMoney(booking?.pricingSnapshotJson?.effectivePriceCents) },
      { label: "Deposit due", value: formatMoney(booking?.pricingSnapshotJson?.depositDueCents) },
      { label: "Balance", value: formatMoney(booking?.pricingSnapshotJson?.remainingBalanceCents) },
      { label: "Deposit status", value: booking?.paymentStateJson?.depositStatusLabel || "Not set" },
      ...(booking?.paymentStateJson?.depositRefundStatusLabel
        ? [{ label: "Refund status", value: booking.paymentStateJson.depositRefundStatusLabel }]
        : []),
    ],
    [booking, timezone],
  );

  const latestUpdate = booking?.customerComms?.[0] || null;
  const bookingMoment = useMemo(() => {
    if (booking?.customerState?.label) {
      return {
        title: booking.customerState.label,
        detail: booking.customerState.nextStep || "Your latest booking details are shown below.",
      };
    }
    if (booking?.job?.jobRef) {
      return {
        title: "Your booking is linked and moving",
        detail: `The team has linked this booking to job ${booking.job.jobRef}.`,
      };
    }
    if (booking?.paymentStateJson?.depositRefundStatusLabel) {
      return {
        title: booking.paymentStateJson.depositRefundStatusLabel,
        detail: booking.paymentStateJson.note || "Any deposit update will stay clear here.",
      };
    }
    return {
      title: "Your booking is in place",
      detail: "Review the latest time, payment, and update details below.",
    };
  }, [booking]);

  async function sendAction(kind: "reschedule" | "cancel", body: Record<string, unknown>) {
    setBusy(kind);
    setStatus("");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/public/booking-status/${token}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "We couldn't update this booking right now.");
      setStatus(kind === "reschedule" ? "Booking moved." : "Booking cancelled.");
      await load();
    } catch (err: any) {
      setError(err?.message || "We couldn't update this booking right now.");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return <div className="container"><LoadingState title="Loading booking status" description="Bringing in the latest visit, payment, and update details." /></div>;
  }

  if (error && !booking) {
    return <div className="container"><section className="card status-shell"><h1>Booking status unavailable</h1><p className="muted">{error}</p></section></div>;
  }

  return (
    <div className="container booking-status-page">
      <section className="card booking-status-hero">
        <p className="booking-status-hero__eyebrow">Booking status</p>
        <h1>{bookingMoment.title}</h1>
        <p className="booking-status-hero__copy">{bookingMoment.detail}</p>
        {status ? <p className="booking-status-hero__notice booking-status-hero__notice--success">{status}</p> : null}
        {error ? <p className="booking-status-hero__notice booking-status-hero__notice--error">{error}</p> : null}
      </section>

      <div className="booking-status-grid">
        <section className="card booking-status-panel booking-status-panel--summary" data-testid="public-booking-status-summary">
          <h2>Your booking</h2>
          <dl className="booking-status-summary">
            {summaryRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          {booking?.serviceLines && booking.serviceLines.length > 1 ? (
            <div className="booking-status-serviceLines" data-testid="public-booking-status-services">
              {booking.serviceLines.map((line, index) => (
                <article key={line.id || `${line.serviceNameSnapshot}-${index}`} className="booking-status-serviceLine">
                  <strong>{line.quantity || 1}x {line.serviceNameSnapshot || "Service"}</strong>
                  <span>{formatMoney(line.lineTotalCents)}</span>
                </article>
              ))}
            </div>
          ) : null}
          <p className="booking-status-panel__note">{booking?.paymentStateJson?.note || "Payment details stay clear here."}</p>
          {booking?.job?.jobRef ? <p className="booking-status-panel__note">Linked to job {booking.job.jobRef}.</p> : null}
          {latestUpdate?.title || latestUpdate?.note ? (
            <p className="booking-status-panel__note">
              Latest update: {latestUpdate?.title || latestUpdate?.note}
            </p>
          ) : (
            <p className="booking-status-panel__note">No updates have been sent yet.</p>
          )}
          <p className="booking-status-panel__note">If online payment is not set up yet, the team will confirm payment with you directly.</p>
        </section>

        <section className="card booking-status-panel booking-status-panel--action">
          <h2>Choose a new time</h2>
          {canReschedule ? (
            <>
              <label className="booking-status-field">
                <span>Date</span>
                <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              {!availability.slots.length ? (
                <div className="booking-status-empty" data-testid="public-booking-status-no-slots">
                  <strong>No open times on this date.</strong>
                  {availability.nextAvailableSlot ? (
                    <p>Next available: {formatDateTime(availability.nextAvailableSlot, timezone)}</p>
                  ) : (
                    <p>No times are available right now.</p>
                  )}
                  {availability.nextAvailableDate ? (
                    <button type="button" className="button secondary" onClick={() => setDate(availability.nextAvailableDate || date)}>
                      Jump to next available
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="booking-status-slotList">
                {availability.slots.map((slot) => (
                  <button
                    key={slot.startsAt}
                    type="button"
                    data-testid={`public-booking-status-slot-${slot.startsAt}`}
                    className={`booking-status-slot${selectedSlot === slot.startsAt ? " is-active" : ""}`}
                    onClick={() => setSelectedSlot(slot.startsAt)}
                  >
                    <strong>{formatDateTime(slot.startsAt, timezone)}</strong>
                  </button>
                ))}
              </div>
              <label className="booking-status-field">
                <span>Note</span>
                <textarea className="input" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note" />
              </label>
              <button type="button" className="button" disabled={!selectedSlot || busy !== ""} onClick={() => void sendAction("reschedule", { startsAt: selectedSlot, customerNote: note || undefined })}>
                {busy === "reschedule" ? "Saving..." : "Move booking"}
              </button>
            </>
          ) : (
            <p className="muted">This booking can no longer be moved from this page.</p>
          )}
        </section>

        <section className="card booking-status-panel booking-status-panel--action">
          <h2>Need to cancel?</h2>
          {canCancel ? (
            <>
              <label className="booking-status-field">
                <span>Note</span>
                <textarea className="input" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note" />
              </label>
              <button type="button" className="button secondary" disabled={busy !== ""} onClick={() => void sendAction("cancel", { customerNote: note || undefined })}>
                {busy === "cancel" ? "Cancelling..." : "Cancel booking"}
              </button>
            </>
          ) : (
            <p className="muted">This booking can no longer be cancelled from this page.</p>
          )}
        </section>

        <section className="card booking-status-panel booking-status-panel--updates">
          <h2>Updates sent</h2>
          <div className="booking-status-updates">
            {booking?.customerComms?.length ? booking.customerComms.map((entry) => (
              <article key={entry.id} className="booking-status-update">
                <strong>{entry.title || entry.reasonKey || "Booking update"}</strong>
                <p>{formatDateTime(entry.createdAt, timezone)}</p>
                {entry.note ? <p>{entry.note}</p> : null}
              </article>
            )) : <p className="muted">No updates have been sent yet.</p>}
          </div>
        </section>
      </div>

      <style jsx>{`
        .status-shell,
        .booking-status-hero,
        .booking-status-panel {
          padding: 22px;
        }

        .booking-status-hero {
          position: relative;
          overflow: hidden;
          border-color: rgba(96, 115, 148, 0.16);
          background:
            radial-gradient(300px 140px at 0% 0%, rgba(37, 99, 255, 0.14), transparent 72%),
            radial-gradient(220px 120px at 100% 0%, rgba(101, 88, 245, 0.1), transparent 72%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(241, 247, 255, 0.96));
          box-shadow: 0 22px 48px rgba(9, 20, 35, 0.08);
        }

        .booking-status-panel {
          border-color: rgba(96, 115, 148, 0.16);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(243, 248, 255, 0.94));
          box-shadow: 0 18px 36px rgba(9, 20, 35, 0.07);
        }

        .booking-status-hero__eyebrow {
          margin: 0 0 10px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #2550c8;
        }

        .booking-status-hero__copy,
        .booking-status-panel__note {
          color: #52606d;
        }

        .booking-status-hero__notice {
          margin-top: 14px;
          padding: 12px 14px;
          border-radius: 14px;
        }

        .booking-status-hero__notice--success {
          background: linear-gradient(180deg, rgba(16, 185, 129, 0.12), rgba(52, 211, 153, 0.08));
          color: #0f7b5e;
        }

        .booking-status-hero__notice--error {
          background: linear-gradient(180deg, rgba(217, 72, 95, 0.12), rgba(248, 113, 113, 0.08));
          color: #b93449;
        }

        .booking-status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
          margin-top: 16px;
        }

        .booking-status-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
        }

        .booking-status-panel--summary {
          grid-column: span 2;
        }

        .booking-status-summary dt,
        .booking-status-field span {
          color: #52606d;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .booking-status-summary dd {
          margin: 6px 0 0;
          font-weight: 600;
        }

        .booking-status-field {
          display: grid;
          gap: 6px;
          margin-bottom: 12px;
        }

        .booking-status-slotList,
        .booking-status-serviceLines,
        .booking-status-updates {
          display: grid;
          gap: 10px;
        }

        .booking-status-slot,
        .booking-status-serviceLine,
        .booking-status-update,
        .booking-status-empty {
          border: 1px solid rgba(96, 115, 148, 0.16);
          border-radius: 16px;
          padding: 14px;
          background: rgba(255, 255, 255, 0.9);
          text-align: left;
        }

        .booking-status-serviceLine {
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }

        .booking-status-slot.is-active {
          border-color: #2563ff;
          background: linear-gradient(180deg, rgba(239, 246, 255, 0.98), rgba(220, 234, 255, 0.88));
        }

        @media (max-width: 1120px) {
          .booking-status-panel--summary {
            grid-column: span 1;
          }
        }

        @media (max-width: 860px) {
          .booking-status-grid,
          .booking-status-summary {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
