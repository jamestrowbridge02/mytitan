import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import EntityHeader from "../../../components/entity/EntityHeader";
import EntitySection from "../../../components/entity/EntitySection";
import EntityTimeline, { type EntityTimelineItem } from "../../../components/entity/EntityTimeline";
import SendUpdatePanel from "../../../components/notifications/SendUpdatePanel";
import { EmptyState } from "../../../components/states/EmptyState";
import { ErrorState } from "../../../components/states/ErrorState";
import { LoadingState } from "../../../components/states/LoadingState";
import { ApiError, apiFetch } from "../../../lib/api";
import { sortTimelineItems, toTimelineItemsFromCommsEvents } from "../../../lib/timeline-adapter";

type Slot = {
  startsAt: string;
  endsAt: string;
};

type BookingDetail = {
  id: string;
  status?: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  source?: string | null;
  serviceName?: string | null;
  locationId?: string | null;
  publicStatusUrl?: string | null;
  pricingSnapshotJson?: {
    durationMinutes?: number | null;
    effectivePriceCents?: number | null;
    standardPriceCents?: number | null;
    discountPriceCents?: number | null;
    depositDueCents?: number | null;
    remainingBalanceCents?: number | null;
    paymentProvider?: string | null;
    customerNotes?: string | null;
  } | null;
  paymentStateJson?: {
    collectionState?: string | null;
    depositStatus?: string | null;
    depositStatusLabel?: string | null;
    depositRefundStatus?: string | null;
    depositRefundStatusLabel?: string | null;
    note?: string | null;
  } | null;
  assignedUser?: { id: string; email: string } | null;
  job?: { id: string; jobRef?: string | null; status?: string | null } | null;
  jobId?: string | null;
  customerState?: {
    code?: string;
    label?: string;
    nextStep?: string;
    canReschedule?: boolean;
    canCancel?: boolean;
  } | null;
  customerComms?: Array<{
    id: string;
    channel?: string;
    status?: string;
    reasonKey?: string;
    note?: string | null;
    title?: string | null;
    createdAt?: string;
  }>;
};

type AvailabilityResponse = {
  slots: Slot[];
  nextAvailableSlot?: string | null;
  nextAvailableDate?: string | null;
  timezone?: string | null;
};

function formatDateTime(value?: string | null, timeZone = "UTC") {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString("en-GB", {
    weekday: "short",
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

function formatMoney(value?: number | null) {
  return typeof value === "number" ? `£${(value / 100).toFixed(2)}` : "Not set";
}

function formatTimeOnly(value?: string | null, timeZone = "UTC") {
  if (!value) return "Time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
}

export default function BookingDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState("");
  const [actionRequestId, setActionRequestId] = useState<string | undefined>(undefined);
  const [busyAction, setBusyAction] = useState<"" | "confirm" | "reschedule" | "cancel" | "convert">("");
  const [emailReadiness, setEmailReadiness] = useState<any>(null);
  const [customerNote, setCustomerNote] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState(new Date().toISOString().slice(0, 10));
  const [availability, setAvailability] = useState<AvailabilityResponse>({ slots: [], nextAvailableSlot: null, nextAvailableDate: null, timezone: "UTC" });
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    setRequestId(undefined);
    try {
      const data = (await apiFetch(`/bookings/${id}`)) as BookingDetail;
      setBooking(data);
      setRescheduleDate(formatDateInput(data?.startsAt));
    } catch (err: any) {
      setError(err?.message || "Failed to load booking");
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    apiFetch("/tenant/settings/email-readiness")
      .then((data) => setEmailReadiness(data || null))
      .catch(() => setEmailReadiness(null));
  }, [id]);

  useEffect(() => {
    if (!id || !booking?.customerState?.canReschedule || booking?.jobId) {
      setAvailability({ slots: [], nextAvailableSlot: null, nextAvailableDate: null, timezone: "UTC" });
      return;
    }
    let active = true;
    setAvailabilityLoading(true);
    apiFetch(`/bookings/${id}/availability?date=${encodeURIComponent(rescheduleDate)}`)
      .then((data) => {
        if (!active) return;
        const next = (data || {}) as AvailabilityResponse;
        setAvailability({
          slots: Array.isArray(next.slots) ? next.slots : [],
          nextAvailableSlot: next.nextAvailableSlot || null,
          nextAvailableDate: next.nextAvailableDate || null,
          timezone: next.timezone || "UTC",
        });
      })
      .catch(() => {
        if (!active) return;
        setAvailability({ slots: [], nextAvailableSlot: null, nextAvailableDate: null, timezone: "UTC" });
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, rescheduleDate, booking?.customerState?.canReschedule, booking?.jobId]);

  useEffect(() => {
    setSelectedSlot("");
  }, [rescheduleDate, booking?.id]);

  const timelineItems = useMemo(() => {
    const events = Array.isArray(booking?.customerComms)
      ? booking.customerComms.map((entry) => ({
          channel: entry.channel,
          status: entry.status,
          reasonKey: entry.reasonKey,
          title: entry.title || undefined,
          createdAt: entry.createdAt,
        }))
      : [];
    const items: EntityTimelineItem[] = sortTimelineItems([
      ...toTimelineItemsFromCommsEvents(events),
      ...(booking?.createdAt
        ? [{ label: "Booking created", description: booking.source ? `Source: ${booking.source}` : undefined, timestamp: booking.createdAt }]
        : []),
      ...(booking?.updatedAt && booking.updatedAt !== booking.createdAt
        ? [{ label: "Booking updated", description: booking.status || undefined, timestamp: booking.updatedAt }]
        : []),
      ...(booking?.job?.id
        ? [{ label: "Booking linked to work", description: booking.job.jobRef || booking.job.id, timestamp: booking.updatedAt || booking.createdAt || undefined, href: `/dashboard/jobs/${booking.job.id}` }]
        : []),
    ]);
    return items;
  }, [booking]);

  const convertHref = booking?.jobId ? `/dashboard/jobs/${booking.jobId}` : `/dashboard/jobs/new?bookingId=${encodeURIComponent(id)}`;

  async function runAction(
    action: "confirm" | "reschedule" | "cancel" | "convert",
    request: () => Promise<any>,
    successLoader = true,
  ) {
    setBusyAction(action);
    setActionError("");
    setActionRequestId(undefined);
    try {
      const result = await request();
      if (result?.job?.id) {
        void router.push(`/dashboard/jobs/${result.job.id}`);
        return;
      }
      if (successLoader) {
        await load();
      }
    } catch (err: any) {
      setActionError(err?.message || "Action failed");
      setActionRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setBusyAction("");
    }
  }

  if (loading && !booking) {
    return (
      <DashboardShell>
        <LoadingState title="Loading booking" description="Fetching booking details." />
      </DashboardShell>
    );
  }

  if (error && !booking) {
    return (
      <DashboardShell>
        <ErrorState
          title="Could not load booking"
          description={error}
          requestId={requestId}
          primaryAction={{ label: "Try again", onClick: () => void load() }}
          secondaryAction={{ label: "Back to bookings", href: "/dashboard/bookings" }}
        />
      </DashboardShell>
    );
  }

  if (!booking) {
    return (
      <DashboardShell>
        <EmptyState title="Booking not found" description="That booking is no longer available." primaryAction={{ label: "Back to bookings", href: "/dashboard/bookings" }} />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <EntityHeader
        title={booking.customerName || booking.customerEmail || "Booking"}
        subtitle={`${booking.serviceName || "Service"} · ${formatDateTime(booking.startsAt)}`}
        badges={
          <>
            <span className="badge">{booking.customerState?.label || booking.status || "Booking"}</span>
            {booking.job?.jobRef ? <span className="badge">Linked to {booking.job.jobRef}</span> : null}
          </>
        }
        primaryAction={
          booking.jobId
            ? { label: "Open job", href: `/dashboard/jobs/${booking.jobId}` }
            : { label: "Start job", href: convertHref }
        }
        secondaryActions={[
          ...(booking.publicStatusUrl ? [{ label: "Open customer page", href: booking.publicStatusUrl }] : []),
          { label: "Back to bookings", href: "/dashboard/bookings" },
        ]}
      />

      {actionError ? (
        <ErrorState
          title="Action failed"
          description={actionError}
          requestId={actionRequestId}
          primaryAction={{ label: "Try again", onClick: () => setActionError("") }}
        />
      ) : null}

      <div className="booking-detail-grid">
        <div className="booking-detail-main">
          <EntitySection title="What happens next" subtitle="Keep the customer and the schedule in sync.">
            <div className="booking-summary-grid">
              <article className="booking-lifecycle-card" data-testid="booking-operator-status">
                <strong>{booking.customerState?.label || booking.status || "Booking"}</strong>
                <p>{booking.customerState?.nextStep || "Review the booking and choose the next safe action."}</p>
              </article>
              <article className="booking-lifecycle-card">
                <strong>Customer page</strong>
                <p>{booking.publicStatusUrl ? "Safe booking-only link for the customer." : "Customer page will appear once the booking is saved."}</p>
                {booking.publicStatusUrl ? (
                  <a className="button secondary" href={booking.publicStatusUrl} target="_blank" rel="noreferrer">
                    Open customer page
                  </a>
                ) : null}
              </article>
            </div>
          </EntitySection>

          <EntitySection title="Booking actions" subtitle="Confirm, move, cancel, or start work.">
            <div className="booking-action-stack">
              <label className="booking-field">
                <span>Customer note</span>
                <textarea
                  className="input"
                  rows={3}
                  value={customerNote}
                  onChange={(event) => setCustomerNote(event.target.value)}
                  placeholder="Optional note for the customer"
                />
              </label>

              <div className="booking-action-row">
                <button
                  type="button"
                  className="button"
                  onClick={() =>
                    void runAction("confirm", () =>
                      apiFetch(`/bookings/${booking.id}/confirm`, {
                        method: "POST",
                        body: JSON.stringify({ customerNote: customerNote || undefined }),
                      }),
                    )
                  }
                  disabled={busyAction !== "" || booking.status === "CONFIRMED" || booking.status === "CANCELLED" || Boolean(booking.jobId)}
                >
                  {busyAction === "confirm" ? "Confirming..." : "Confirm booking"}
                </button>

                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    void runAction("cancel", () =>
                      apiFetch(`/bookings/${booking.id}/cancel`, {
                        method: "POST",
                        body: JSON.stringify({ customerNote: customerNote || undefined }),
                      }),
                    )
                  }
                  disabled={busyAction !== "" || booking.status === "CANCELLED" || Boolean(booking.jobId)}
                >
                  {busyAction === "cancel" ? "Cancelling..." : "Cancel booking"}
                </button>

                <button
                  type="button"
                  className="button secondary"
                  onClick={() => void runAction("convert", () => apiFetch(`/bookings/${booking.id}/convert`, { method: "POST" }), false)}
                  disabled={busyAction !== "" || Boolean(booking.jobId) || booking.status === "CANCELLED"}
                >
                  {busyAction === "convert" ? "Starting..." : "Start job"}
                </button>
              </div>
            </div>
          </EntitySection>

          <EntitySection title="Move booking" subtitle="Only valid open times are shown.">
            <div className="booking-action-stack">
              <label className="booking-field">
                <span>Date</span>
                <input type="date" className="input" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} />
              </label>

              {availabilityLoading ? <p className="muted">Checking live availability...</p> : null}

              {!availabilityLoading && availability.slots.length === 0 ? (
                <div className="booking-empty">
                  <strong>No open times on this date.</strong>
                  {availability.nextAvailableSlot ? (
                    <p>
                      Next available: {formatDateTime(availability.nextAvailableSlot, availability.timezone || "UTC")}
                    </p>
                  ) : (
                    <p>No valid reschedule times are available right now.</p>
                  )}
                  {availability.nextAvailableDate ? (
                    <button type="button" className="button secondary" onClick={() => setRescheduleDate(availability.nextAvailableDate || rescheduleDate)}>
                      Jump to next available
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="booking-slot-list" data-testid="booking-reschedule-slot-list">
                {availability.slots.map((slot) => (
                  <button
                    key={slot.startsAt}
                    type="button"
                    className={`booking-slot${selectedSlot === slot.startsAt ? " is-active" : ""}`}
                    data-testid={`booking-reschedule-slot-${slot.startsAt}`}
                    onClick={() => setSelectedSlot(slot.startsAt)}
                  >
                    <strong>{formatTimeOnly(slot.startsAt, availability.timezone || "UTC")}</strong>
                    <span>{formatDateTime(slot.startsAt, availability.timezone || "UTC")}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="button"
                onClick={() =>
                  void runAction("reschedule", () =>
                    apiFetch(`/bookings/${booking.id}/reschedule`, {
                      method: "POST",
                      body: JSON.stringify({
                        startsAt: selectedSlot,
                        customerNote: customerNote || undefined,
                      }),
                    }),
                  )
                }
                disabled={busyAction !== "" || !selectedSlot || Boolean(booking.jobId) || booking.status === "CANCELLED"}
              >
                {busyAction === "reschedule" ? "Moving..." : "Move booking"}
              </button>
            </div>
          </EntitySection>

          <EntitySection title="Summary" subtitle="Service, customer, and payment truth.">
            <div className="booking-summary-grid">
              <article className="booking-lifecycle-card">
                <strong>Visit</strong>
                <p>{booking.serviceName || "Service"}</p>
                <p>{formatDateTime(booking.startsAt)}</p>
                <p>{booking.pricingSnapshotJson?.durationMinutes ? `${booking.pricingSnapshotJson.durationMinutes} min` : "Duration not set"}</p>
                {booking.assignedUser?.email ? <p>Provider: {booking.assignedUser.email}</p> : null}
              </article>
              <article className="booking-lifecycle-card">
                <strong>Customer</strong>
                <p>{booking.customerName || "Not set"}</p>
                <p>{booking.customerEmail || "No email"}</p>
                <p>{booking.customerPhone || "No phone"}</p>
              </article>
              <article className="booking-lifecycle-card">
                <strong>Price</strong>
                <p>Total: {formatMoney(booking.pricingSnapshotJson?.effectivePriceCents)}</p>
                <p>Deposit: {formatMoney(booking.pricingSnapshotJson?.depositDueCents)}</p>
                <p>Balance: {formatMoney(booking.pricingSnapshotJson?.remainingBalanceCents)}</p>
                <p>{booking.paymentStateJson?.depositStatusLabel || "Deposit status not set"}</p>
                {booking.paymentStateJson?.depositRefundStatusLabel ? <p>{booking.paymentStateJson.depositRefundStatusLabel}</p> : null}
                <p>{booking.paymentStateJson?.note || `Provider: ${booking.pricingSnapshotJson?.paymentProvider || "MANUAL"}`}</p>
              </article>
            </div>
          </EntitySection>

          <EntitySection title="What the customer has been told" subtitle="Recent booking emails and booking updates.">
            {booking.customerComms?.length ? (
              <div className="booking-comms-list">
                {booking.customerComms.map((entry) => (
                  <article key={entry.id} className="booking-comms-item">
                    <strong>{entry.title || entry.reasonKey || "Booking update"}</strong>
                    <p>{formatDateTime(entry.createdAt)}</p>
                    {entry.note ? <p>{entry.note}</p> : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>No customer updates recorded yet.</p>
            )}
          </EntitySection>
        </div>

        <aside className="booking-detail-rail">
          {booking.customerEmail ? (
            <EntitySection title="Customer email" subtitle="Live delivery path for booking updates.">
              <p className="muted" style={{ marginTop: 0 }}>
                {emailReadiness?.effective?.canSend
                  ? emailReadiness?.effective?.notice || "Booking updates will use the workspace sender that is ready."
                  : emailReadiness?.effective?.guidance || "Customer email is unavailable right now. Finish setup in Settings."}
              </p>
              {!emailReadiness?.effective?.canSend ? (
                <Link className="button secondary" href="/dashboard/settings?tab=messages">
                  Open Email settings
                </Link>
              ) : null}
            </EntitySection>
          ) : null}
          <SendUpdatePanel entityType="booking" entityId={booking.id} defaultTemplateKey="booking.reminder" defaultChannel="sms" />
          <EntityTimeline
            timelineItems={timelineItems}
            emptyTitle="No activity yet"
            emptyDescription="Booking updates will appear here as actions are recorded."
          />
          <EntitySection title="Linked work" subtitle="Move from booking into live work without losing pricing truth.">
            {booking.job?.id ? (
              <Link className="button secondary" href={`/dashboard/jobs/${booking.job.id}`}>
                Open {booking.job.jobRef || "job"}
              </Link>
            ) : (
              <button type="button" className="button" onClick={() => void runAction("convert", () => apiFetch(`/bookings/${booking.id}/convert`, { method: "POST" }), false)} disabled={busyAction !== "" || booking.status === "CANCELLED"}>
                Start job
              </button>
            )}
          </EntitySection>
        </aside>
      </div>

      <style jsx>{`
        .booking-detail-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 16px;
          align-items: start;
        }

        .booking-detail-main,
        .booking-detail-rail,
        .booking-action-stack,
        .booking-comms-list {
          display: grid;
          gap: 16px;
        }

        .booking-detail-rail {
          position: sticky;
          top: 88px;
        }

        .booking-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .booking-lifecycle-card,
        .booking-comms-item {
          border: 1px solid rgba(17, 24, 39, 0.08);
          border-radius: 18px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.92);
        }

        .booking-lifecycle-card p,
        .booking-comms-item p {
          margin: 8px 0 0;
        }

        .booking-field {
          display: grid;
          gap: 6px;
        }

        .booking-field span {
          font-size: 12px;
          font-weight: 700;
          color: #52606d;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .booking-action-row,
        .booking-slot-list {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .booking-slot {
          min-width: 170px;
          border: 1px solid rgba(17, 24, 39, 0.12);
          border-radius: 16px;
          padding: 12px 14px;
          background: #fff;
          text-align: left;
        }

        .booking-slot strong,
        .booking-slot span {
          display: block;
        }

        .booking-slot span {
          margin-top: 4px;
          color: #52606d;
          font-size: 13px;
        }

        .booking-slot.is-active {
          border-color: #0f766e;
          background: rgba(15, 118, 110, 0.08);
        }

        .booking-empty {
          border: 1px dashed rgba(17, 24, 39, 0.18);
          border-radius: 18px;
          padding: 16px;
          background: rgba(248, 250, 252, 0.9);
        }

        @media (max-width: 980px) {
          .booking-detail-grid {
            grid-template-columns: 1fr;
          }

          .booking-detail-rail {
            position: static;
          }

          .booking-summary-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </DashboardShell>
  );
}
