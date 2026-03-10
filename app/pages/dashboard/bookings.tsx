import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { OperatorNotice } from "../../components/feedback/OperatorNotice";
import { useOperatorNotice } from "../../components/feedback/useOperatorNotice";
import { DashboardShell } from "../../components/dashboard-shell";
import {
  OperatorActiveFilters,
  OperatorBulkBar,
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorFilterBar,
  OperatorFilterField,
  OperatorGuidance,
  OperatorPageHeader,
  OperatorRowActions,
  OperatorSavedViews,
} from "../../components/ui/operator-page";
import { ApiError, apiFetch } from "../../lib/api";
import { isMarketplaceEnabled } from "../../lib/feature-flags";
import { useStickyOperatorView } from "../../lib/operator-view-state";

type BookingSettings = {
  publicEnabled: boolean;
  publicUrl?: string | null;
  icsUrl?: string | null;
  businessHours: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>;
  blackoutDates: Array<{ date: string; reason?: string | null }>;
  slotMinutes: number;
};

type TimingFilter = "all" | "upcoming" | "today" | "unlinked";
type BookingSavedView = "all" | "upcoming" | "today" | "unlinked";

function getConversionIssues(booking: any) {
  const issues: string[] = [];
  if (!booking?.customerName) issues.push("customer name");
  if (!booking?.startsAt || !booking?.endsAt) issues.push("time window");
  return issues;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Unscheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unscheduled";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isToday(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

export default function BookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<any[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [jobId, setJobId] = useState("");
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [startHour, setStartHour] = useState("09:00");
  const [endHour, setEndHour] = useState("17:00");
  const [blackoutDates, setBlackoutDates] = useState<Array<{ date: string; reason?: string | null }>>([]);
  const [newBlackoutDate, setNewBlackoutDate] = useState("");
  const [newBlackoutReason, setNewBlackoutReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [timingFilter, setTimingFilter] = useState<TimingFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyConvertId, setBusyConvertId] = useState<string | null>(null);
  const [savedView, setSavedView] = useStickyOperatorView<BookingSavedView>("mytitan_bookings_saved_view_v1", "all");
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();
  const marketplaceEnabled = isMarketplaceEnabled();

  const load = async () => {
    try {
      const data = await apiFetch("/bookings");
      setBookings(Array.isArray(data) ? data : []);
      if (notice?.kind === "error") clearNotice();
    } catch (err: any) {
      showError(err.message || "Failed to load bookings");
    }
  };

  const loadSettings = async () => {
    if (!marketplaceEnabled) return;
    try {
      const data = await apiFetch("/bookings/settings");
      setSettings(data);
      setPublicEnabled(Boolean(data.publicEnabled));
      setBlackoutDates(Array.isArray(data.blackoutDates) ? data.blackoutDates : []);
    } catch {
      return undefined;
    }
  };

  useEffect(() => {
    void load();
    void loadSettings();
  }, [marketplaceEnabled]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();

    try {
      await apiFetch("/bookings", {
        method: "POST",
        body: JSON.stringify({
          startsAt,
          endsAt,
          jobId: jobId || undefined,
        }),
      });
      setStartsAt("");
      setEndsAt("");
      setJobId("");
      showSuccess("Booking created");
      await load();
    } catch (err: any) {
      showError(err.message || "Failed to create booking");
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const [startH, startM] = startHour.split(":").map(Number);
      const [endH, endM] = endHour.split(":").map(Number);
      const startMinute = startH * 60 + startM;
      const endMinute = endH * 60 + endM;
      const businessHours = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinute, endMinute }));

      const updated = await apiFetch("/bookings/settings", {
        method: "POST",
        body: JSON.stringify({
          publicEnabled,
          businessHours,
          blackoutDates,
        }),
      });
      setSettings(updated);
      showSuccess("Booking settings saved");
    } catch (err: any) {
      showError(err.message || "Failed to update booking settings");
    } finally {
      setSaving(false);
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      showSuccess(`${label} copied`);
    } catch {
      showError(`Could not copy ${label.toLowerCase()}`);
    }
  }

  async function convertBooking(bookingId: string) {
    const booking = bookings.find((item) => item.id === bookingId);
    const readinessIssues = getConversionIssues(booking);
    if (readinessIssues.length) {
      showError(`Booking cannot be converted yet. Missing: ${readinessIssues.join(", ")}`);
      return;
    }
    setBusyConvertId(bookingId);
    try {
      const res = await apiFetch(`/bookings/${bookingId}/convert`, { method: "POST" });
      const jobId = res?.job?.id;
      const jobRef = res?.job?.jobRef || jobId;
      const dispatchFollowUpCreated = Boolean(res?.conversion?.dispatchFollowUpCreated);
      const duplicatePrevented = Boolean(res?.conversion?.duplicatePrevented);
      showSuccess(
        res?.alreadyLinked
          ? duplicatePrevented
            ? `Duplicate conversion prevented. Booking is linked to ${jobRef}`
            : `Booking already linked to ${jobRef}`
          : dispatchFollowUpCreated
          ? `Converted booking to ${jobRef} and queued dispatch follow-up`
          : `Converted booking to ${jobRef}`,
      );
      await load();
      if (jobId) {
        void router.push(`/dashboard/jobs/${jobId}`);
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.payload && typeof err.payload === "object" && (err.payload as any).code === "BOOKING_CONVERSION_NOT_READY") {
        const issues = Array.isArray((err.payload as any).issues) ? (err.payload as any).issues : [];
        const labels = issues.map((issue: string) =>
          issue === "customer_name_missing"
            ? "customer name"
            : issue === "time_window_missing"
            ? "time window"
            : issue,
        );
        showError(`Booking cannot be converted yet. Missing: ${labels.join(", ")}`);
      } else {
        showError(err?.message || "Failed to convert booking");
      }
    } finally {
      setBusyConvertId(null);
    }
  }

  const stats = useMemo(() => {
    const linkedJobs = bookings.filter((booking) => booking.jobId).length;
    const upcoming = bookings.filter((booking) => booking.startsAt && new Date(booking.startsAt).getTime() >= Date.now()).length;
    return [
      { label: "Bookings", value: String(bookings.length), hint: `${linkedJobs} linked to jobs` },
      { label: "Upcoming", value: String(upcoming), hint: "Future schedule load" },
      { label: "Public booking", value: publicEnabled ? "Live" : "Off", hint: publicEnabled ? "Customers can request time" : "Internal only" },
    ];
  }, [bookings, publicEnabled]);

  const statusOptions = useMemo(() => Array.from(new Set(bookings.map((booking) => String(booking.status || "PLANNED")))).sort(), [bookings]);

  const filteredBookings = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return bookings.filter((booking) => {
      const searchable = [booking.customerName, booking.status, booking.jobId, booking.id].filter(Boolean).join(" ").toLowerCase();
      const startsAt = booking?.startsAt ? new Date(booking.startsAt) : null;

      if (normalizedSearch && !searchable.includes(normalizedSearch)) return false;
      if (savedView === "upcoming" && (!startsAt || Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now())) return false;
      if (savedView === "today" && !isToday(booking.startsAt)) return false;
      if (savedView === "unlinked" && booking.jobId) return false;
      if (statusFilter !== "all" && String(booking.status || "PLANNED") !== statusFilter) return false;
      if (timingFilter === "upcoming" && (!startsAt || Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now())) return false;
      if (timingFilter === "today" && !isToday(booking.startsAt)) return false;
      if (timingFilter === "unlinked" && booking.jobId) return false;
      return true;
    });
  }, [bookings, savedView, search, statusFilter, timingFilter]);

  const savedViewCounts = useMemo(() => {
    const counts: Record<BookingSavedView, number> = {
      all: bookings.length,
      upcoming: 0,
      today: 0,
      unlinked: 0,
    };
    for (const booking of bookings) {
      const startsAt = booking?.startsAt ? new Date(booking.startsAt) : null;
      if (startsAt && !Number.isNaN(startsAt.getTime()) && startsAt.getTime() >= Date.now()) counts.upcoming += 1;
      if (isToday(booking.startsAt)) counts.today += 1;
      if (!booking.jobId) counts.unlinked += 1;
    }
    return counts;
  }, [bookings]);

  const clearFilters = () => {
    setSavedView("all");
    setSearch("");
    setStatusFilter("all");
    setTimingFilter("all");
  };

  const activeFilters = [
    savedView !== "all" ? { id: "view", label: `View: ${savedView.replace(/-/g, " ")}`, onClear: () => setSavedView("all") } : null,
    search ? { id: "search", label: `Search: ${search}`, onClear: () => setSearch("") } : null,
    statusFilter !== "all" ? { id: "status", label: `Status: ${statusFilter}`, onClear: () => setStatusFilter("all") } : null,
    timingFilter !== "all" ? { id: "timing", label: `Timing: ${timingFilter}`, onClear: () => setTimingFilter("all") } : null,
  ].filter((chip): chip is { id: string; label: string; onClear: () => void } => Boolean(chip));

  const allVisibleSelected = filteredBookings.length > 0 && filteredBookings.every((booking) => selectedIds.includes(booking.id));

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Scheduling"
          title="Bookings"
          subtitle="A denser booking queue with local filtering, quick conversion to jobs, and safer operator actions around the public calendar."
          actions={[
            { label: "Calendar", href: "/dashboard/calendar", variant: "secondary" },
            { label: "Booking settings", href: "/dashboard/booking/settings" },
          ]}
          shortcuts={["Use filters to isolate today's load or unlinked bookings", "Convert unlinked bookings into jobs from the queue"]}
          stats={stats}
        />

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        <div className={marketplaceEnabled && settings ? "operator-split" : "operator-stack"}>
          <section className="card operator-section">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Create booking</h2>
                <p className="operator-section__subtitle">Keep manual entry compact and adjacent to the live queue.</p>
              </div>
            </div>

            <form onSubmit={onCreate} className="operator-stack">
              <div className="operator-formGrid">
                <div>
                  <label>Start time</label>
                  <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
                </div>
                <div>
                  <label>End time</label>
                  <input className="input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
                </div>
              </div>

              <div>
                <label>Job ID (optional)</label>
                <input className="input" value={jobId} onChange={(e) => setJobId(e.target.value)} />
              </div>

              <div className="operator-inline-actions">
                <button className="button" type="submit">Create booking</button>
                <Link className="button secondary" href="/dashboard/calendar">
                  Open calendar
                </Link>
              </div>
            </form>
          </section>

          {marketplaceEnabled && settings ? (
            <section className="card operator-section">
              <div className="operator-section__header">
                <div>
                  <h2 className="operator-section__title">Public booking controls</h2>
                  <p className="operator-section__subtitle">Keep the share link, working hours, and blackout dates together.</p>
                </div>
              </div>

              <div className="operator-stack">
                <div>
                  <div className="operator-kicker">Public link</div>
                  <div className="operator-row__subtitle" style={{ marginTop: 6 }}>
                    {settings.publicUrl || "Enable public bookings to generate a shareable link."}
                  </div>
                  {settings.icsUrl ? <div className="operator-note" style={{ marginTop: 6 }}>ICS feed: {settings.icsUrl}</div> : null}
                </div>

                <label className="toggle-row">
                  <input type="checkbox" checked={publicEnabled} onChange={(e) => setPublicEnabled(e.target.checked)} />
                  Enable public bookings
                </label>

                <div className="operator-formGrid">
                  <div>
                    <label>Start time</label>
                    <input className="input" type="time" value={startHour} onChange={(e) => setStartHour(e.target.value)} />
                  </div>
                  <div>
                    <label>End time</label>
                    <input className="input" type="time" value={endHour} onChange={(e) => setEndHour(e.target.value)} />
                  </div>
                </div>

                <div>
                  <div className="operator-kicker">Blackout dates</div>
                  <div className="operator-note" style={{ marginTop: 6 }}>Block dates you cannot accept bookings.</div>
                  <div className="operator-formGrid" style={{ marginTop: 10 }}>
                    <input className="input" type="date" value={newBlackoutDate} onChange={(e) => setNewBlackoutDate(e.target.value)} />
                    <input className="input" placeholder="Reason (optional)" value={newBlackoutReason} onChange={(e) => setNewBlackoutReason(e.target.value)} />
                  </div>
                  <div className="operator-inline-actions" style={{ marginTop: 8 }}>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => {
                        if (!newBlackoutDate) return;
                        setBlackoutDates((prev) => [...prev, { date: newBlackoutDate, reason: newBlackoutReason || null }]);
                        setNewBlackoutDate("");
                        setNewBlackoutReason("");
                      }}
                    >
                      Add blackout date
                    </button>
                    {settings.publicUrl ? (
                      <button className="button secondary" type="button" onClick={() => void copyText(settings.publicUrl || "", "Public booking link")}>
                        Copy link
                      </button>
                    ) : null}
                  </div>
                </div>

                {blackoutDates.length ? (
                  <div className="operator-list">
                    {blackoutDates.map((item) => (
                      <article key={`${item.date}-${item.reason || ""}`} className="operator-row">
                        <div className="operator-row__main">
                          <div className="operator-row__title">{item.date}</div>
                          <div className="operator-row__subtitle">{item.reason || "No reason added"}</div>
                        </div>
                        <div className="operator-row__meta">
                          <div className="operator-row__metaLine">Availability block</div>
                        </div>
                        <div className="operator-row__actions">
                          <button
                            className="button secondary operator-compact-button"
                            type="button"
                            onClick={() => setBlackoutDates((prev) => prev.filter((entry) => entry !== item))}
                          >
                            Remove
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}

                <div className="operator-inline-actions">
                  <button className="button" type="button" onClick={saveSettings} disabled={saving}>
                    {saving ? "Saving..." : "Save booking settings"}
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Booking queue</h2>
              <p className="operator-section__subtitle">Filter the visible queue before you reschedule, convert, or open the booking detail.</p>
            </div>
          </div>

          <OperatorSavedViews
            views={[
              { id: "all", label: "All", count: savedViewCounts.all },
              { id: "upcoming", label: "Upcoming", count: savedViewCounts.upcoming },
              { id: "today", label: "Today", count: savedViewCounts.today },
              { id: "unlinked", label: "Needs conversion", count: savedViewCounts.unlinked },
            ]}
            activeView={savedView}
            onChange={(view) => setSavedView(view as BookingSavedView)}
          />

          <OperatorFilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search customer, booking id, job id, or status"
            resultsLabel={`${filteredBookings.length} shown of ${bookings.length} bookings`}
            actions={[
              { label: "Reset filters", variant: "secondary", onClick: clearFilters },
            ]}
          >
            <OperatorFilterField label="Status">
              <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </OperatorFilterField>
            <OperatorFilterField label="Timing">
              <select className="input" value={timingFilter} onChange={(event) => setTimingFilter(event.target.value as TimingFilter)}>
                <option value="all">All bookings</option>
                <option value="upcoming">Upcoming</option>
                <option value="today">Today</option>
                <option value="unlinked">Not linked to a job</option>
              </select>
            </OperatorFilterField>
          </OperatorFilterBar>

          <OperatorActiveFilters chips={activeFilters} onClearAll={activeFilters.length ? clearFilters : undefined} />

          <OperatorGuidance
            title="Booking queue tips"
            items={[
              "Saved views keep upcoming, today, and conversion-focused queues sticky on this device.",
              "Select rows to copy booking references or customer names before dispatch handoff.",
              "Use the row menu for detail and conversion actions while keeping schedule access as the primary action.",
            ]}
          />

          <OperatorBulkBar count={selectedIds.length} hint="Bulk tools stay non-destructive on bookings">
            <button className="button secondary operator-compact-button" type="button" onClick={() => setSelectedIds([])}>
              Clear
            </button>
            <button
              className="button secondary operator-compact-button"
              type="button"
              onClick={() =>
                void copyText(
                  bookings
                    .filter((booking) => selectedIds.includes(booking.id))
                    .map((booking) => booking.id)
                    .join(", "),
                  "Booking IDs",
                )
              }
            >
              Copy IDs
            </button>
            <button
              className="button secondary operator-compact-button"
              type="button"
              onClick={() =>
                void copyText(
                  bookings
                    .filter((booking) => selectedIds.includes(booking.id))
                    .map((booking) => booking.customerName || booking.id)
                    .join(", "),
                  "Booking customers",
                )
              }
            >
              Copy customers
            </button>
          </OperatorBulkBar>

          {filteredBookings.length ? (
            <OperatorDataTable columns="28px minmax(220px, 1.5fr) minmax(170px, 1fr) minmax(140px, 0.8fr) minmax(140px, 0.8fr) minmax(170px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">
                  <input
                    aria-label={allVisibleSelected ? "Clear visible booking selection" : "Select all visible bookings"}
                    className="operator-checkbox"
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedIds(Array.from(new Set([...selectedIds, ...filteredBookings.map((booking) => booking.id)])));
                        return;
                      }
                      setSelectedIds((prev) => prev.filter((id) => !filteredBookings.some((booking) => booking.id === id)));
                    }}
                  />
                </div>
                <div className="operator-table__cell">Booking</div>
                <div className="operator-table__cell">Schedule</div>
                <div className="operator-table__cell">Status</div>
                <div className="operator-table__cell">Job link</div>
                <div className="operator-table__cell">Actions</div>
              </OperatorDataTableHeader>

              {filteredBookings.map((booking) => {
                const selected = selectedIds.includes(booking.id);
                const readinessIssues = getConversionIssues(booking);
                const canConvert = !booking.jobId && readinessIssues.length === 0;
                return (
                  <OperatorDataTableRow key={booking.id} selected={selected}>
                    <div className="operator-table__cell">
                      <input
                        aria-label={`Select booking ${booking.customerName || booking.id}`}
                        className="operator-checkbox"
                        type="checkbox"
                        checked={selected}
                        onChange={() => setSelectedIds((prev) => prev.includes(booking.id) ? prev.filter((id) => id !== booking.id) : [...prev, booking.id])}
                      />
                    </div>
                    <div className="operator-table__cell">
                      <div className="operator-cellTitle">
                        <Link href={`/dashboard/bookings/${booking.id}`}>{booking.customerName || booking.id}</Link>
                      </div>
                      <div className="operator-cellSubtle">Booking ID {booking.id}</div>
                    </div>
                    <div className="operator-table__cell">
                      <div className="operator-cellMeta">
                        <span><strong>{formatDateTime(booking.startsAt)}</strong></span>
                        <span>Ends {formatDateTime(booking.endsAt)}</span>
                      </div>
                    </div>
                    <div className="operator-table__cell">
                      <div className="operator-cellMeta">
                        <span><strong>{booking.status || "PLANNED"}</strong></span>
                        <span>{isToday(booking.startsAt) ? "Today" : "Scheduled"}</span>
                      </div>
                    </div>
                    <div className="operator-table__cell">
                      <div className="operator-cellMeta">
                        <span><strong>{booking.jobId || "Not linked"}</strong></span>
                        <span>
                          {booking.jobId
                            ? "Existing job linked"
                            : readinessIssues.length
                            ? `Conversion blocked: missing ${readinessIssues.join(", ")}`
                            : "Ready to convert into a job"}
                        </span>
                      </div>
                    </div>
                    <div className="operator-table__cell operator-table__cell--actions">
                      <OperatorRowActions
                        primaryAction={{ label: "Schedule", href: "/dashboard/calendar", testId: `booking-schedule-${booking.id}` }}
                        actions={[
                          {
                            label: "Open booking",
                            description: "Open the booking detail record",
                            shortcut: "Open",
                            group: "Booking",
                            href: `/dashboard/bookings/${booking.id}`,
                            testId: `booking-open-${booking.id}`,
                          },
                          ...(!booking.jobId ? [{
                            label: busyConvertId === booking.id ? "Converting..." : "Convert to job",
                            description: canConvert ? "Create a linked scheduled job from this booking" : `Blocked until ${readinessIssues.join(" and ")} ${readinessIssues.length > 1 ? "are" : "is"} added`,
                            shortcut: "New",
                            group: "Booking",
                            onClick: () => void convertBooking(booking.id),
                            disabled: busyConvertId === booking.id || !canConvert,
                            testId: `booking-convert-${booking.id}`,
                          }] : []),
                          ...(booking.jobId ? [{
                            label: "Open linked job",
                            description: "Open the linked job record",
                            shortcut: "Open",
                            group: "Booking",
                            href: `/dashboard/jobs/${booking.jobId}`,
                            testId: `booking-open-job-${booking.id}`,
                          }] : []),
                          {
                            label: "Copy booking ID",
                            description: "Copy the booking reference",
                            shortcut: "Copy",
                            group: "Tools",
                            onClick: () => void copyText(booking.id, "Booking ID"),
                          },
                        ]}
                      />
                    </div>
                  </OperatorDataTableRow>
                );
              })}
            </OperatorDataTable>
          ) : !notice || notice.kind !== "error" ? (
            <OperatorEmptyStateCard
              title="No bookings match this view"
              description="Clear the filters, open the calendar, or create a fresh booking from this page."
              actions={[
                { label: "Reset filters", variant: "secondary", onClick: clearFilters },
                { label: "Open calendar", href: "/dashboard/calendar" },
              ]}
            />
          ) : null}
        </section>
      </div>
    </DashboardShell>
  );
}
