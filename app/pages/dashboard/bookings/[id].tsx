import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { DashboardShell } from "../../../components/dashboard-shell";
import DemoCoach from "../../../components//DemoCoach";
import EntityHeader, { type EntityAction } from "../../../components/entity/EntityHeader";
import RelatedLinks from "../../../components/entity/RelatedLinks";
import EntitySection from "../../../components/entity/EntitySection";
import EntityTimeline, { type EntityTimelineItem } from "../../../components/entity/EntityTimeline";
import SendUpdatePanel from "../../../components/notifications/SendUpdatePanel";
import { EmptyState } from "../../../components/states/EmptyState";
import { ErrorState } from "../../../components/states/ErrorState";
import { LoadingState } from "../../../components/states/LoadingState";
import { ApiError, apiFetch } from "../../../lib/api";
import { markDemoStepComplete } from "../../../lib/-coach";
import { isNotificationsV1Enabled, isSchedulingIntelligenceV1Enabled } from "../../../lib/feature-flags";
import { getBookingNextAction } from "../../../lib/next-action";
import { sortTimelineItems, toTimelineItemsFromBookingActivity, toTimelineItemsFromCommsEvents } from "../../../lib/timeline-adapter";
import { SuggestedSlotReasons } from "../../../components/SuggestedSlotReasons";
import { formatSuggestedSlotLabel, type SuggestedSlot } from "../../../lib/suggested-slot";

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

type BookingSummary = {
  id: string;
  status?: string;
  locationId?: string | null;
  jobId?: string | null;
  serviceId?: string | null;
  proServiceId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  tradeAccountId?: string | null;
  startsAt?: string;
  endsAt?: string;
  createdAt?: string;
  updatedAt?: string;
  source?: string;
  assignedUser?: { id: string; email: string } | null;
};

type SuggestionState = {
  suggestions: SuggestedSlot[];
  loading: boolean;
  error: string;
  supportCode?: string;
};

type ReschedulePayload = {
  startsAt: string;
  endsAt: string;
  technicianId: string | null;
};

type UndoState = {
  prev: ReschedulePayload;
  next: ReschedulePayload;
};

type RescheduleStatus = {
  state: 'idle' | 'saving' | 'saved' | 'error';
  message?: string;
  supportCode?: string;
};

const SUGGESTION_WINDOW_DAYS = 7;
const SUGGESTION_LIMIT = 3;

type CommsEvent = {
  id: string;
  channel?: string;
  status?: string;
  reasonKey?: string;
  title?: string;
  createdAt?: string;
};

export default function BookingDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [commsEvents, setCommsEvents] = useState<CommsEvent[]>([]);
  const [commsLoading, setCommsLoading] = useState(false);
  const [commsError, setCommsError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [notFound, setNotFound] = useState(false);
  const commsEnabled = isNotificationsV1Enabled();
  const schedulingEnabled = isSchedulingIntelligenceV1Enabled();
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionState, setSuggestionState] = useState<SuggestionState>({
    suggestions: [],
    loading: false,
    error: "",
    supportCode: undefined,
  });
  const [applyingBest, setApplyingBest] = useState(false);
  const [rescheduleStatus, setRescheduleStatus] = useState<RescheduleStatus>({ state: "idle" });
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const isRescheduling = rescheduleStatus.state === "saving";

  const load = useMemo(() => {
    return async () => {
      if (!id) return;
      setError("");
      setRequestId(undefined);
      setCommsError("");
      setNotFound(false);
      setLoading(true);
      if (commsEnabled) setCommsLoading(true);
      try {
        const bookings = await apiFetch("/bookings");
        const list = Array.isArray(bookings) ? bookings : [];
        const found = list.find((item) => item.id === id) || null;
        setBooking(found);
        setNotFound(!found);
        if (commsEnabled) {
          await loadComms();
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load booking");
        setRequestId(err instanceof ApiError ? err.requestId : undefined);
      } finally {
        setLoading(false);
        setCommsLoading(false);
      }
    };
  }, [id, commsEnabled]);

  async function loadComms() {
    if (!commsEnabled || !id) return;
    setCommsLoading(true);
    try {
      const res = await apiFetch(`/notifications/entity?entityType=booking&entityId=${id}`);
      setCommsEvents(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setCommsError(err?.message || "Failed to load communications");
    } finally {
      setCommsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!booking) return;
    markDemoStepComplete("booking_to_job");
  }, [booking?.id]);

  useEffect(() => {
    setSuggestionState({
      suggestions: [],
      loading: false,
      error: "",
      supportCode: undefined,
    });
    setSuggestionsOpen(false);
    setUndoState(null);
  }, [booking?.id]);

  const fetchSuggestions = useCallback(async () => {
    if (!booking?.id) return [];
    setSuggestionState((prev) => ({ ...prev, loading: true, error: "", supportCode: undefined }));
    try {
      const query = new URLSearchParams({
        bookingId: booking.id,
        windowDays: String(SUGGESTION_WINDOW_DAYS),
        limit: String(SUGGESTION_LIMIT),
      });
      const response = (await apiFetch(`/calendar/suggest?${query.toString()}`)) as {
        suggestions?: SuggestedSlot[];
      };
      const suggestions = Array.isArray(response?.suggestions) ? response.suggestions : [];
      setSuggestionState({ suggestions, loading: false, error: "", supportCode: undefined });
      return suggestions;
    } catch (err: any) {
      const message = err?.message || "Failed to load suggested slots";
      const supportCode = err instanceof ApiError ? err.requestId : undefined;
      setSuggestionState({ suggestions: [], loading: false, error: message, supportCode });
      return [];
    }
  }, [booking?.id]);

  const applySuggestion = useCallback(
    async (suggestion: SuggestedSlot) => {
      if (!booking) return;
      const payload: ReschedulePayload = {
        startsAt: suggestion.startsAt,
        endsAt: suggestion.endsAt,
        technicianId: suggestion.technicianId,
      };
      const prevPayload: ReschedulePayload = {
        startsAt: booking.startsAt || "",
        endsAt: booking.endsAt || "",
        technicianId: booking.assignedUser?.id ?? null,
      };
      setRescheduleStatus({ state: "saving", message: "Saving...", supportCode: undefined });
      try {
        const response = (await apiFetch(`/calendar/bookings/${booking.id}/reschedule`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })) as { booking: any; warnings?: any[] };
        setBooking((prevState) => (prevState ? { ...prevState, ...response.booking } : response.booking));
        setUndoState({ prev: prevPayload, next: payload });
        setRescheduleStatus({ state: "saved", message: "Saved", supportCode: undefined });
      } catch (err: any) {
        const supportCode = err instanceof ApiError ? err.requestId : undefined;
        const message = err?.message || "Failed to reschedule booking";
        setRescheduleStatus({ state: "error", message, supportCode });
      }
    },
    [booking],
  );

  const handleToggleSuggestions = () => {
    const nextOpen = !suggestionsOpen;
    setSuggestionsOpen(nextOpen);
    if (nextOpen && !suggestionState.suggestions.length && !suggestionState.loading) {
      void fetchSuggestions();
    }
  };

  const handleApplyBest = async () => {
    if (!booking) return;
    setApplyingBest(true);
    try {
      let suggestions = suggestionState.suggestions;
      if (!suggestions.length) {
        suggestions = await fetchSuggestions();
      }
      if (!suggestions.length) {
        setRescheduleStatus({ state: "error", message: "No suggested slots found", supportCode: undefined });
        return;
      }
      await applySuggestion(suggestions[0]);
    } finally {
      setApplyingBest(false);
    }
  };

  const handleUndo = useCallback(async () => {
    if (!booking?.id || !undoState) return;
    setRescheduleStatus({ state: "saving", message: "Reverting...", supportCode: undefined });
    try {
      const response = (await apiFetch(`/calendar/bookings/${booking.id}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify(undoState.prev),
      })) as { booking: any; warnings?: any[] };
      setBooking((prevState) => (prevState ? { ...prevState, ...response.booking } : response.booking));
      setRescheduleStatus({ state: "saved", message: "Reverted", supportCode: undefined });
      setUndoState(null);
    } catch (err: any) {
      const supportCode = err instanceof ApiError ? err.requestId : undefined;
      const message = err?.message || "Undo failed";
      setRescheduleStatus({ state: "error", message, supportCode });
    }
  }, [booking?.id, undoState]);

  const title = booking?.customerName || booking?.customerEmail || "Booking";
  const subtitleParts = [
    booking?.serviceId ? `Service ${booking.serviceId}` : null,
    booking?.proServiceId ? `Service ${booking.proServiceId}` : null,
    booking?.startsAt ? formatDateTime(booking.startsAt) : null,
  ].filter(Boolean);
  const subtitle = subtitleParts.join(" | ");

  const convertHref = `/dashboard/jobs/new?bookingId=${encodeURIComponent(id)}&customerName=${encodeURIComponent(
    booking?.customerName || ""
  )}&customerEmail=${encodeURIComponent(booking?.customerEmail || "")}&customerPhone=${encodeURIComponent(
    booking?.customerPhone || ""
  )}`;

  const primary = getBookingNextAction(booking, { convertHref });

  const secondaryActions: EntityAction[] = [];
  if (booking?.jobId) {
    secondaryActions.push({ label: "Open Job", href: `/dashboard/jobs/${booking.jobId}` });
  } else {
    secondaryActions.push({ label: "Convert to Job", href: convertHref });
  }

  const bookingActivity: Array<{ label?: string; message?: string; createdAt?: string; href?: string }> = [];
  if (booking?.startsAt) {
    bookingActivity.push({
      label: "Scheduled",
      message: `Starts ${formatDateTime(booking.startsAt)} - Ends ${formatDateTime(booking.endsAt)}`,
      createdAt: booking.startsAt,
    });
  }
  if (booking?.createdAt) {
    bookingActivity.push({
      label: "Created",
      message: booking?.source ? `Source: ${booking.source}` : "Booking created",
      createdAt: booking.createdAt,
    });
  }
  if (booking?.updatedAt && booking.updatedAt !== booking.createdAt) {
    bookingActivity.push({
      label: "Updated",
      message: booking?.status ? `Status: ${booking.status}` : "Booking updated",
      createdAt: booking.updatedAt,
    });
  }
  if (booking?.jobId) {
    bookingActivity.push({
      label: "Job linked",
      message: "View job",
      createdAt: booking.updatedAt || booking.createdAt,
      href: `/dashboard/jobs/${booking.jobId}`,
    });
  }
  const timelineItems: EntityTimelineItem[] = sortTimelineItems([
    ...toTimelineItemsFromBookingActivity(bookingActivity),
    ...toTimelineItemsFromCommsEvents(commsEvents),
  ]);

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
          primaryAction={{ label: "Try again", onClick: load }}
          secondaryAction={{ label: "Back to bookings", href: "/dashboard/bookings" }}
        />
      </DashboardShell>
    );
  }

  if (notFound) {
    return (
      <DashboardShell>
        <EmptyState
          title="Booking not found"
          description="We couldn't find that booking. It may have been removed."
          primaryAction={{ label: "Back to bookings", href: "/dashboard/bookings" }}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <EntityHeader
        title={title}
        subtitle={subtitle || "Booking overview"}
        badges={
          <>
            <span className="badge">{booking?.status || "PLANNED"}</span>
            {booking?.locationId ? <span className="badge">Location {booking.locationId}</span> : null}
          </>
        }
        primaryAction={primary ? { label: primary.label, href: primary.href } : undefined}
        primaryActionHint={primary?.reason}
        secondaryActions={secondaryActions}
      />

      {error ? (
        <ErrorState
          title="Action failed"
          description={error}
          requestId={requestId}
          primaryAction={{ label: "Reload", onClick: load }}
        />
      ) : null}

      <div className="entity-grid">
        <div>
          <RelatedLinks
            tradeAccountId={booking?.tradeAccountId || null}
            tradeAccountLabel={booking?.tradeAccountId ? `Trade ${booking.tradeAccountId}` : null}
            jobId={booking?.jobId || null}
            locationLabel={booking?.locationId ? `Location ${booking.locationId}` : null}
          />
          <EntitySection title="Summary" subtitle="Key timing and service details.">
            <div className="two-col">
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Booking ID
                </p>
                <p style={{ marginTop: 4 }}>{booking?.id || id}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Status
                </p>
                <p style={{ marginTop: 4 }}>{booking?.status || "PLANNED"}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Starts
                </p>
                <p style={{ marginTop: 4 }}>{formatDateTime(booking?.startsAt)}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Ends
                </p>
                <p style={{ marginTop: 4 }}>{formatDateTime(booking?.endsAt)}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Location
                </p>
                <p style={{ marginTop: 4 }}>{booking?.locationId || "-"}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Service
                </p>
                <p style={{ marginTop: 4 }}>{booking?.serviceId || booking?.proServiceId || "-"}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Created
                </p>
                <p style={{ marginTop: 4 }}>{formatDate(booking?.createdAt)}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Updated
                </p>
                <p style={{ marginTop: 4 }}>{formatDate(booking?.updatedAt)}</p>
              </div>
            </div>
          </EntitySection>

          <EntitySection title="Customer" subtitle="Contact details and trade account link.">
            <div className="two-col">
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Customer
                </p>
                <p style={{ marginTop: 4 }}>{booking?.customerName || "-"}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Email
                </p>
                {booking?.customerEmail ? (
                  <a href={`mailto:${booking.customerEmail}`}>{booking.customerEmail}</a>
                ) : (
                  <p style={{ marginTop: 4 }}>-</p>
                )}
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Phone
                </p>
                {booking?.customerPhone ? (
                  <a href={`https://wa.me/${String(booking.customerPhone).replace(/[^\d]/g, "")}`}>
                    {booking.customerPhone}
                  </a>
                ) : (
                  <p style={{ marginTop: 4 }}>-</p>
                )}
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Trade account
                </p>
                {booking?.tradeAccountId ? (
                  <Link href={`/dashboard/trade-accounts/${booking.tradeAccountId}`}>{booking.tradeAccountId}</Link>
                ) : (
                  <p style={{ marginTop: 4 }}>-</p>
                )}
              </div>
            </div>
          </EntitySection>

          {schedulingEnabled ? (
            <EntitySection title="Suggested slots" subtitle="Use scheduling intelligence to reschedule quickly.">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div>
                  <strong>Booking suggestions</strong>
                  <p className="muted" style={{ margin: 0, fontSize: 11 }}>
                    Manual time selection stays primary; suggestions are optional.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={handleToggleSuggestions}
                    style={{ height: 30, fontSize: 11, padding: "0 10px" }}
                  >
                    {suggestionsOpen ? "Hide" : "Show"} suggestions
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    onClick={handleApplyBest}
                    disabled={isRescheduling || applyingBest}
                    style={{ height: 30, fontSize: 11, padding: "0 10px" }}
                  >
                    {applyingBest ? "Applying…" : "Apply best"}
                  </button>
                </div>
              </div>
              {isRescheduling ? (
                <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                  {rescheduleStatus.message || "Saving…"}
                </p>
              ) : rescheduleStatus.state === "saved" ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "#166534", fontWeight: 600 }}>
                    {rescheduleStatus.message || "Saved"}
                  </span>
                  {undoState ? (
                    <button
                      className="button secondary"
                      type="button"
                      onClick={handleUndo}
                      style={{ padding: "0 10px", fontSize: 11 }}
                    >
                      Undo
                    </button>
                  ) : null}
                </div>
              ) : rescheduleStatus.state === "error" ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <span style={{ color: "#b91c1c", fontSize: 12 }}>
                    {rescheduleStatus.message || "Reschedule failed"}
                  </span>
                  {rescheduleStatus.supportCode ? (
                    <span className="muted" style={{ fontSize: 11 }}>
                      Support code: <code>{rescheduleStatus.supportCode}</code>
                    </span>
                  ) : null}
                  {undoState ? (
                    <button
                      className="button secondary"
                      type="button"
                      onClick={handleUndo}
                      disabled={isRescheduling}
                      style={{ padding: "0 10px", fontSize: 11, alignSelf: "flex-start" }}
                    >
                      Undo
                    </button>
                  ) : null}
                </div>
              ) : null}
              {suggestionsOpen ? (
                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  {suggestionState.loading ? (
                    <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                      Loading suggestions…
                    </p>
                  ) : suggestionState.error ? (
                    <ErrorState
                      title="Could not load suggestions"
                      description={suggestionState.error}
                      requestId={suggestionState.supportCode}
                    />
                  ) : !suggestionState.suggestions.length ? (
                    <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                      No suggestions available in the next {SUGGESTION_WINDOW_DAYS} days.
                    </p>
                  ) : (
                    suggestionState.suggestions.slice(0, SUGGESTION_LIMIT).map((suggestion) => (
                      <div
                        key={`${suggestion.technicianId}-${suggestion.startsAt}`}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ fontSize: 12, flex: 1, minWidth: 0 }}>
                          {formatSuggestedSlotLabel(suggestion.startsAt, suggestion.technicianName)}
                          <SuggestedSlotReasons reasons={suggestion.reasons} />
                        </div>
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => applySuggestion(suggestion)}
                          disabled={isRescheduling || applyingBest}
                          style={{ height: 28, fontSize: 11, padding: "0 10px" }}
                        >
                          Apply
                        </button>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </EntitySection>
          ) : null}

          <EntitySection title="Communications" subtitle="Quick customer follow-ups.">
            <div style={{ display: "grid", gap: 10 }}>
              {booking?.customerEmail ? (
                <a className="button secondary" href={`mailto:${booking.customerEmail}`}>
                  Email customer
                </a>
              ) : null}
              {booking?.customerPhone ? (
                <a
                  className="button secondary"
                  href={`https://wa.me/${String(booking.customerPhone).replace(/[^\d]/g, "")}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  WhatsApp customer
                </a>
              ) : null}
            </div>
          </EntitySection>

          <EntitySection title="Payment & Deposit" subtitle="No payment recorded for this booking.">
            <p className="muted" style={{ marginTop: 0 }}>
              Payments are collected when the booking is converted into a job.
            </p>
          </EntitySection>

          <EntitySection title="Related Job" subtitle="Linked job created from this booking.">
            {booking?.jobId ? (
              <Link className="button secondary" href={`/dashboard/jobs/${booking.jobId}`}>
                View job
              </Link>
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>
                No job linked yet.
              </p>
            )}
          </EntitySection>
        </div>
        <div className="entity-rail">
          <DemoCoach
            actions={{
              booking_to_job: booking?.jobId
                ? [{ label: "View job", href: `/dashboard/jobs/` }]
                : [{ label: "Convert to job", href: convertHref }],
            }}
          />
          <SendUpdatePanel
            entityType="booking"
            entityId={booking?.id || id}
            defaultTemplateKey="booking.reminder"
            defaultChannel="sms"
            onSent={loadComms}
          />
          {commsLoading && timelineItems.length === 0 ? (
            <LoadingState title="Loading timeline" description="Fetching booking activity and communications." />
          ) : (
            <EntityTimeline
              timelineItems={timelineItems}
              emptyTitle="No activity yet"
              emptyDescription="Booking updates will appear here as they happen."
            />
          )}
          {commsError ? (
            <p className="muted" style={{ marginTop: 8 }}>{commsError}</p>
          ) : null}
        </div>
      </div>
      <style jsx>{`
        .entity-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 16px;
          align-items: start;
        }

        .entity-rail {
          position: sticky;
          top: 90px;
        }

        @media (max-width: 900px) {
          .entity-grid {
            grid-template-columns: 1fr;
          }

          .entity-rail {
            position: static;
          }
        }
      `}</style>
    </DashboardShell>
  );
}
