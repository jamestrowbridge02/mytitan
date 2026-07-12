import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { EntityCustomFieldsCard } from "../../components/custom-fields/EntityCustomFieldsCard";
import { OperatorNotice } from "../../components/feedback/OperatorNotice";
import { useOperatorNotice } from "../../components/feedback/useOperatorNotice";
import { DashboardShell } from "../../components/dashboard-shell";
import {
  OperatorActiveFilters,
  OperatorBulkBar,
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorFilterBar,
  OperatorFilterField,
  OperatorRowActions,
  OperatorSavedViews,
} from "../../components/ui/operator-page";
import { ApiError, apiFetch } from "../../lib/api";
import { getBusinessTerms } from "../../lib/business-config";
import { getMissingRequiredCustomFieldKeys, type CustomField, type CustomFieldValue } from "../../lib/custom-fields";
import { isMarketplaceEnabled } from "../../lib/feature-flags";
import { readActiveLocationId, subscribeActiveLocationId } from "../../lib/location-context";
import { useOperationalRefresh } from "../../lib/operational-refresh";
import { useStickyOperatorView } from "../../lib/operator-view-state";
import { useTenantSettings } from "../../lib/tenant-settings";
import { getBookingStages, mapStatusToStage } from "../../lib/workflow-config";

type BookingSettings = {
  publicEnabled: boolean;
  publicUrl?: string | null;
  icsUrl?: string | null;
  autoConfirmPublicBookings?: boolean;
  bookingWorkflow?: {
    autoCreateJobFromBooking?: boolean;
    autoAssignWorkflow?: boolean;
    manualReviewMode?: boolean;
    locationFirstScheduling?: boolean;
  };
  businessHours: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>;
  slotMinutes: number;
  publicState?: "live" | "setup_required" | "no_slots";
  publicMessage?: string | null;
  publishedServiceCount?: number;
  nextAvailableSlot?: string | null;
};

type BookingServiceOption = {
  id: string;
  name: string;
  durationMinutes?: number | null;
  effectivePriceCents?: number | null;
  standardPriceCents?: number | null;
  priceCents?: number | null;
  depositDueCents?: number | null;
  remainingBalanceCents?: number | null;
};

type DraftBookingServiceLine = {
  serviceId: string;
  quantity: number;
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

function formatMoney(value?: number | null) {
  if (typeof value !== "number") return "No price set";
  return `£${(value / 100).toFixed(2)}`;
}

function toDateTimeLocalValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function addMinutesToDateTimeLocal(value: string, minutes: number) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  return toDateTimeLocalValue(new Date(date.getTime() + Math.max(5, minutes) * 60_000));
}

function isToday(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function describeBookingOperatorState(booking: any, readinessIssues: string[]) {
  const hasLinkedJob = Boolean(booking?.jobId);
  const today = isToday(booking?.startsAt);
  const status = String(booking?.status || "").toUpperCase();
  const source = String(booking?.source || "").toUpperCase();

  if (status === "CANCELLED") {
    return {
      label: "Closed",
      summary: "This booking was cancelled and no further action is needed.",
      actionLabel: "Review booking",
    };
  }

  if (!hasLinkedJob && status === "PENDING" && source === "PUBLIC") {
    return {
      label: "Needs action",
      summary: "The customer is waiting for confirmation, a move, or a cancellation.",
      actionLabel: "Review booking",
    };
  }

  if (!hasLinkedJob && status === "CONFIRMED" && source === "PUBLIC") {
    return {
      label: "Upcoming work",
      summary: "The booking is confirmed and ready to move into live work.",
      actionLabel: "Start job",
    };
  }

  if (!hasLinkedJob && readinessIssues.length) {
      return {
        label: "Blocked",
        summary: `Add ${readinessIssues.join(", ")} before this booking can become work.`,
        actionLabel: "Review booking",
      };
  }

  if (!hasLinkedJob && today) {
    return {
      label: "Ready to convert today",
      summary: "This visit is due today and can move straight into a job.",
      actionLabel: "Convert to job",
    };
  }

  if (!hasLinkedJob) {
    return {
      label: "Needs conversion",
      summary: "The visit is booked but not linked to a job yet.",
      actionLabel: "Convert to job",
    };
  }

  if (today) {
    return {
      label: "In today's schedule",
      summary: "The booking is linked and should move with today's work.",
      actionLabel: "Open linked job",
    };
  }

  return {
    label: "Linked and scheduled",
    summary: "The booking is already attached to live work.",
    actionLabel: "Review linked job",
  };
}

function hydrateBookingSettingsForm(
  nextSettings: BookingSettings | null,
  apply: {
    setSettings: (value: BookingSettings | null) => void;
  },
) {
  apply.setSettings(nextSettings);
}

export default function BookingsPage() {
  const { settings: tenantSettings } = useTenantSettings();
  const terms = getBusinessTerms(tenantSettings);
  const bookingStages = getBookingStages(tenantSettings);
  const [bookings, setBookings] = useState<any[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [jobId, setJobId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [serviceLines, setServiceLines] = useState<DraftBookingServiceLine[]>([]);
  const [bookingServices, setBookingServices] = useState<BookingServiceOption[]>([]);
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [creatingBooking, setCreatingBooking] = useState(false);
  const [createBookingOpen, setCreateBookingOpen] = useState(false);
  const creatingBookingRef = useRef(false);
  const createPanelRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [timingFilter, setTimingFilter] = useState<TimingFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyConvertId, setBusyConvertId] = useState<string | null>(null);
  const [savedView, setSavedView] = useStickyOperatorView<BookingSavedView>("mytitan_bookings_saved_view_v1", "all");
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<CustomFieldValue[]>([]);
  const [customFieldBookingId, setCustomFieldBookingId] = useState<string | null>(null);
  const [activeLocationId, setActiveLocationId] = useState('all');
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();
  const marketplaceEnabled = isMarketplaceEnabled();

  const load = async () => {
    try {
      const data = await apiFetch(`/bookings?locationId=${encodeURIComponent(activeLocationId)}`);
      setBookings(Array.isArray(data) ? data : []);
      if (notice?.kind === "error") clearNotice();
    } catch (err: any) {
      showError(err.message || "Failed to load bookings");
    }
  };
  const { refreshNow, lastUpdatedAt, isRefreshing } = useOperationalRefresh(load);

  const loadSettings = async () => {
    if (!marketplaceEnabled) return;
    try {
      const [data, serviceRows] = await Promise.all([
        apiFetch("/bookings/settings"),
        apiFetch("/booking/services").catch(() => []),
      ]);
      hydrateBookingSettingsForm(data as BookingSettings, {
        setSettings,
      });
      setBookingServices(Array.isArray(serviceRows) ? serviceRows : []);
    } catch (err: any) {
      return undefined;
    }
  };

  useEffect(() => {
    setActiveLocationId(readActiveLocationId());
    return subscribeActiveLocationId(setActiveLocationId);
  }, []);

  useEffect(() => {
    void load();
    void loadSettings();
  }, [marketplaceEnabled, activeLocationId]);

  useEffect(() => {
    async function loadCustomFieldData() {
      if (!bookings.length) {
        setCustomFieldValues([]);
        return;
      }
      try {
        const [fieldRows, valueRows] = await Promise.all([
          apiFetch("/custom-fields?entityType=booking&visible=true"),
          apiFetch(`/custom-fields/values?entityType=booking&entityIds=${encodeURIComponent(bookings.map((booking) => booking.id).join(","))}`),
        ]);
        setCustomFields(Array.isArray(fieldRows) ? fieldRows : []);
        setCustomFieldValues(Array.isArray(valueRows?.values) ? valueRows.values : []);
      } catch {
        setCustomFields([]);
        setCustomFieldValues([]);
      }
    }
    void loadCustomFieldData();
  }, [bookings]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const selectedLines = serviceLines
      .map((line, index) => ({
        serviceId: line.serviceId,
        quantity: Math.max(1, Math.min(99, Math.round(Number(line.quantity || 1)))),
        sortOrder: index,
      }))
      .filter((line) => line.serviceId);
    if (creatingBookingRef.current) return;
    const selectedService = bookingServices.find((service) => service.id === selectedLines[0]?.serviceId);
    const normalizedCustomerName = customerName.trim();

    creatingBookingRef.current = true;
    setCreatingBooking(true);
    try {
      await apiFetch("/bookings", {
        method: "POST",
        body: JSON.stringify({
          startsAt,
          endsAt,
          serviceId: selectedLines[0]?.serviceId || undefined,
          serviceLines: selectedLines.length ? selectedLines : undefined,
          jobId: jobId || undefined,
          customerName: normalizedCustomerName || undefined,
          customerEmail: customerEmail.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
        }),
      });
      setStartsAt("");
      setEndsAt("");
      setJobId("");
      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      setServiceId("");
      setServiceLines([]);
      setCreateBookingOpen(false);
      showSuccess(selectedService ? `Booking created with ${selectedService.name}${selectedLines.length > 1 ? ` and ${selectedLines.length - 1} more service${selectedLines.length > 2 ? "s" : ""}` : ""}. It is now ready in the queue.` : "Booking created. It is now ready in the queue.");
      await refreshNow();
    } catch (err: any) {
      showError(err.message || "Failed to create booking");
    } finally {
      creatingBookingRef.current = false;
      setCreatingBooking(false);
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
            ? `Duplicate conversion prevented. Opening the linked job ${jobRef}.`
            : `Booking already linked to ${jobRef}. Opening the job now.`
          : dispatchFollowUpCreated
          ? `Converted booking to ${jobRef}. Dispatch follow-up is queued and the linked job is opening.`
          : `Converted booking to ${jobRef}. Opening the linked job now.`,
      );
      if (jobId) {
        setBookings((current) =>
          current.map((item) => (item.id === bookingId ? { ...item, jobId } : item)),
        );
        window.setTimeout(() => window.location.assign(`/dashboard/jobs/${jobId}`), 1_000);
      } else {
        await load();
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
    const needsConversion = bookings.filter((booking) => !booking.jobId).length;
    const todaysWork = bookings.filter((booking) => isToday(booking.startsAt)).length;
    const upcoming = bookings.filter((booking) => {
      const startsAt = booking?.startsAt ? new Date(booking.startsAt) : null;
      return Boolean(startsAt && !Number.isNaN(startsAt.getTime()) && startsAt.getTime() >= Date.now());
    }).length;
    return [
      { label: "Today", value: String(todaysWork), hint: `${todaysWork} scheduled today` },
      { label: "Upcoming", value: String(upcoming), hint: `${upcoming} upcoming` },
      { label: "Needs conversion", value: String(needsConversion), hint: `${needsConversion} not linked to ${terms.jobs.toLowerCase()}` },
      { label: `Linked to ${terms.jobs.toLowerCase()}`, value: String(linkedJobs), hint: `${linkedJobs} linked` },
    ];
  }, [bookings, terms.jobs]);

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
  const selectedServiceLineDetails = serviceLines
    .map((line) => ({ ...line, service: bookingServices.find((service) => service.id === line.serviceId) || null }))
    .filter((line) => line.service);
  const serviceBundleTotalCents = selectedServiceLineDetails.reduce((sum, line) => {
    const unit = Number(line.service?.effectivePriceCents ?? line.service?.standardPriceCents ?? line.service?.priceCents ?? 0);
    return sum + unit * Math.max(1, Number(line.quantity || 1));
  }, 0);
  const serviceBundleDurationMinutes = selectedServiceLineDetails.reduce((sum, line) => sum + Number(line.service?.durationMinutes || 60) * Math.max(1, Number(line.quantity || 1)), 0);
  const updateStart = (value: string) => {
    setStartsAt(value);
    if (serviceBundleDurationMinutes && value) {
      setEndsAt(addMinutesToDateTimeLocal(value, serviceBundleDurationMinutes));
    }
  };
  const updateService = (value: string) => {
    setServiceId(value);
  };
  const addSelectedService = () => {
    if (!serviceId) return;
    setServiceLines((current) => {
      if (current.some((line) => line.serviceId === serviceId)) return current;
      const next = [...current, { serviceId, quantity: 1 }];
      const nextDuration = next.reduce((sum, line) => {
        const service = bookingServices.find((item) => item.id === line.serviceId);
        return sum + Number(service?.durationMinutes || 60) * Math.max(1, Number(line.quantity || 1));
      }, 0);
      if (startsAt && nextDuration) setEndsAt(addMinutesToDateTimeLocal(startsAt, nextDuration));
      return next;
    });
  };
  const updateServiceLineQuantity = (lineServiceId: string, quantity: number) => {
    setServiceLines((current) => {
      const next = current.map((line) => line.serviceId === lineServiceId ? { ...line, quantity: Math.max(1, Math.min(99, Math.round(Number(quantity || 1)))) } : line);
      const nextDuration = next.reduce((sum, line) => {
        const service = bookingServices.find((item) => item.id === line.serviceId);
        return sum + Number(service?.durationMinutes || 60) * Math.max(1, Number(line.quantity || 1));
      }, 0);
      if (startsAt && nextDuration) setEndsAt(addMinutesToDateTimeLocal(startsAt, nextDuration));
      return next;
    });
  };
  const removeServiceLine = (lineServiceId: string) => {
    setServiceLines((current) => {
      const next = current.filter((line) => line.serviceId !== lineServiceId);
      const nextDuration = next.reduce((sum, line) => {
        const service = bookingServices.find((item) => item.id === line.serviceId);
        return sum + Number(service?.durationMinutes || 60) * Math.max(1, Number(line.quantity || 1));
      }, 0);
      if (startsAt && nextDuration) setEndsAt(addMinutesToDateTimeLocal(startsAt, nextDuration));
      return next;
    });
  };
  const moveServiceLine = (lineServiceId: string, direction: -1 | 1) => {
    setServiceLines((current) => {
      const index = current.findIndex((line) => line.serviceId === lineServiceId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [line] = next.splice(index, 1);
      next.splice(target, 0, line);
      return next;
    });
  };

  useEffect(() => {
    if (!createBookingOpen) return;
    const input = createPanelRef.current?.querySelector<HTMLElement>('select, input, button, a[href]');
    input?.focus();
  }, [createBookingOpen]);

  const publicStatusLabel = !settings
    ? "Unavailable"
    : settings.publicEnabled
    ? settings.publicState === "no_slots"
      ? "Live, no slots"
      : "Live"
    : "Not live";
  const bookingRuleSummary = settings
    ? `${settings.bookingWorkflow?.locationFirstScheduling === false ? terms.technicians : "Location"}-first · ${settings.autoConfirmPublicBookings ? "Auto-confirm on" : "Manual approval"}`
    : "Review settings";
  const hasActiveFilters = activeFilters.length > 0;

  return (
    <DashboardShell>
      <div className="operator-stack bookings-premium" data-testid="bookings-premium-workspace">
        <header className="bookings-premium-header">
          <div>
            <h1>{terms.bookings}</h1>
            <p>{lastUpdatedAt ? "Updated just now" : "Live booking queue"}</p>
          </div>
          <div className="bookings-premium-header__actions">
            <button className="button" type="button" data-testid="bookings-create-primary" onClick={() => setCreateBookingOpen(true)}>
              Create booking
            </button>
            <Link className="button secondary" href="/dashboard/calendar">
              Calendar
            </Link>
            <Link className="button secondary" href="/dashboard/booking/settings">
              Settings
            </Link>
            <button className="button secondary operator-compact-button" type="button" disabled={isRefreshing} onClick={() => void refreshNow()}>
              Refresh
            </button>
          </div>
        </header>

        <section className="bookings-metric-grid" aria-label="Booking overview">
          {stats.map((stat) => (
            <button
              key={stat.label}
              type="button"
              className="bookings-metric-card"
              onClick={() => {
                if (stat.label === "Today") setSavedView("today");
                if (stat.label === "Upcoming") setSavedView("upcoming");
                if (stat.label === "Needs conversion") setSavedView("unlinked");
                if (stat.label.startsWith("Linked")) setSavedView("all");
              }}
            >
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </button>
          ))}
        </section>

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        {savedViewCounts.unlinked > 0 ? (
          <section className="card bookings-conversion-strip" data-testid="bookings-conversion-strip">
            <strong>{savedViewCounts.unlinked} {savedViewCounts.unlinked === 1 ? "booking needs" : "bookings need"} jobs</strong>
            <div className="operator-inline-actions">
              <button
                className="button secondary operator-compact-button"
                type="button"
                onClick={() => {
                  setSavedView("unlinked");
                  setTimingFilter("unlinked");
                }}
              >
                Review
              </button>
            </div>
          </section>
        ) : null}

        <div className={marketplaceEnabled && settings ? "operator-split" : "operator-stack"}>
          {createBookingOpen ? (
          <section className="card operator-section bookings-create-panel" data-testid="booking-create-panel" ref={createPanelRef}>
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Create {terms.bookings.slice(0, -1).toLowerCase() || "booking"}</h2>
              </div>
              <button className="button secondary operator-compact-button" type="button" onClick={() => setCreateBookingOpen(false)}>
                Close
              </button>
            </div>

            <form onSubmit={onCreate} className="operator-stack">
              <div>
                <label>Service</label>
                <div className="operator-inline-actions" style={{ alignItems: "stretch" }}>
                  <select className="input" data-testid="booking-create-service" value={serviceId} onChange={(event) => updateService(event.target.value)}>
                    <option value="">Choose a service</option>
                    {bookingServices.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                  <button className="button secondary" type="button" data-testid="booking-create-service-add" onClick={addSelectedService} disabled={!serviceId || serviceLines.some((line) => line.serviceId === serviceId)}>
                    Add service
                  </button>
                </div>
                {selectedServiceLineDetails.length ? (
                  <div className="operator-guidance" data-testid="booking-create-service-summary" style={{ marginTop: 10 }}>
                    <strong>Selected services</strong>
                    <div className="booking-service-bundle">
                      {selectedServiceLineDetails.map((line, index) => {
                        const service = line.service!;
                        const unitPrice = Number(service.effectivePriceCents ?? service.standardPriceCents ?? service.priceCents ?? 0);
                        const quantity = Math.max(1, Number(line.quantity || 1));
                        return (
                          <article className="booking-service-bundle__line" data-testid={`booking-create-service-line-${service.id}`} key={service.id}>
                            <div>
                              <strong>{index === 0 ? "Primary: " : ""}{service.name}</strong>
                              <p>{service.durationMinutes || 60} min · {formatMoney(unitPrice)} each · {formatMoney(unitPrice * quantity)}</p>
                            </div>
                            <div className="booking-service-bundle__controls">
                              <input
                                aria-label={`Quantity for ${service.name}`}
                                className="input"
                                data-testid={`booking-create-service-quantity-${service.id}`}
                                type="number"
                                min="1"
                                max="99"
                                value={quantity}
                                onChange={(event) => updateServiceLineQuantity(service.id, Number(event.target.value))}
                              />
                              <button className="button secondary operator-compact-button" type="button" onClick={() => moveServiceLine(service.id, -1)} disabled={index === 0}>Up</button>
                              <button className="button secondary operator-compact-button" type="button" onClick={() => moveServiceLine(service.id, 1)} disabled={index === selectedServiceLineDetails.length - 1}>Down</button>
                              <button className="button secondary operator-compact-button" type="button" data-testid={`booking-create-service-remove-${service.id}`} onClick={() => removeServiceLine(service.id)}>Remove</button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    <p data-testid="booking-create-service-total">
                      Total duration {serviceBundleDurationMinutes} minutes · Estimated total {formatMoney(serviceBundleTotalCents)}
                    </p>
                  </div>
                ) : (
                  <p className="operator-note" style={{ marginTop: 8 }}>
                    Services come from Booking settings and are preserved as a pricing snapshot when selected.
                  </p>
                )}
              </div>

              <div className="operator-formGrid">
                <div>
                  <label>Customer name</label>
                  <input className="input" data-testid="booking-create-customer-name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
                </div>
                <div>
                  <label>Customer email</label>
                  <input className="input" type="email" data-testid="booking-create-customer-email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
                </div>
                <div>
                  <label>Customer phone</label>
                  <input className="input" data-testid="booking-create-customer-phone" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
                </div>
              </div>

              <div className="operator-formGrid">
                <div>
                  <label>Start time</label>
                  <input className="input" type="datetime-local" data-testid="booking-create-start" value={startsAt} onChange={(e) => updateStart(e.target.value)} required />
                </div>
                <div>
                  <label>End time</label>
                  <input className="input" type="datetime-local" data-testid="booking-create-end" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
                </div>
              </div>

              <div>
                <label>Job ID (optional)</label>
                <input className="input" value={jobId} onChange={(e) => setJobId(e.target.value)} />
              </div>

              <div className="operator-inline-actions">
                <button className="button" type="submit" disabled={creatingBooking}>
                  {creatingBooking ? "Creating booking..." : "Create booking"}
                </button>
                <Link className="button secondary" href="/dashboard/calendar">
                  Open calendar
                </Link>
              </div>
            </form>
          </section>
          ) : null}

          {marketplaceEnabled && settings ? (
            <section className="card operator-section bookings-public-status" data-testid="bookings-settings-handoff">
              <div className="operator-section__header">
                <div>
                  <h2 className="operator-section__title">Public booking</h2>
                  <p className="operator-section__subtitle">{publicStatusLabel}</p>
                </div>
              </div>

              <div className="operator-stack">
                <div className="booking-summary-grid">
                  <article className="booking-lifecycle-card">
                    <strong>{publicStatusLabel}</strong>
                    <p>{String(settings.publishedServiceCount || 0)} services available</p>
                  </article>
                  <article className="booking-lifecycle-card">
                    <strong>Next slot</strong>
                    <p>{settings.nextAvailableSlot ? formatDateTime(settings.nextAvailableSlot) : "Not available"}</p>
                  </article>
                  <article className="booking-lifecycle-card">
                    <strong>Booking rules</strong>
                    <p>{bookingRuleSummary}</p>
                  </article>
                </div>

                <div className="operator-inline-actions">
                  {settings.publicUrl ? (
                    <Link className="button secondary" href={settings.publicUrl} target="_blank" rel="noreferrer">
                      Preview
                    </Link>
                  ) : null}
                  {settings.publicUrl ? (
                    <button className="button secondary" type="button" onClick={() => void copyText(settings.publicUrl || "", "Public booking link")}>
                      Copy link
                    </button>
                  ) : null}
                  <Link className="button secondary" href="/dashboard/booking/settings">
                    Manage
                  </Link>
                  <Link className="button secondary" href="/dashboard/settings?tab=messages">
                    Notifications
                  </Link>
                  {settings.icsUrl ? (
                    <button className="button secondary" type="button" onClick={() => void copyText(settings.icsUrl || "", "ICS feed")}>
                      Copy ICS
                    </button>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">{terms.bookings} queue</h2>
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
            searchPlaceholder="Search bookings..."
            resultsLabel={`${filteredBookings.length} shown of ${bookings.length} ${terms.bookings.toLowerCase()}`}
            actions={hasActiveFilters ? [
              { label: "Reset filters", variant: "secondary", onClick: clearFilters },
            ] : undefined}
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
                const operatorState = describeBookingOperatorState(booking, readinessIssues);
                const stage = mapStatusToStage(String(booking.status || "PLANNED"), bookingStages);
                const missingStageFields = getMissingRequiredCustomFieldKeys(stage?.requiredCustomFieldKeys, customFields, customFieldValues, "booking", booking.id);
                const visibleFieldSummaries = customFieldValues.filter((value) => value.entityId === booking.id && value.field?.visible !== false).slice(0, 2);
                return (
                  <OperatorDataTableRow key={booking.id} selected={selected} data-testid={`booking-row-${booking.id}`}>
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
                        <span className="badge">{operatorState.label}</span>
                      </div>
                      {booking.serviceName ? <div className="operator-cellSubtle">{booking.serviceName}</div> : null}
                      <div className="operator-cellSubtle">{operatorState.summary}</div>
                      {visibleFieldSummaries.length ? (
                        <div className="operator-cellSubtle" style={{ marginTop: 6 }}>
                          {visibleFieldSummaries.map((value) => `${value.field?.label}: ${String(value.valueJson)}`).join(" | ")}
                        </div>
                      ) : null}
                    </div>
                    <div className="operator-table__cell">
                      <div className="operator-cellMeta">
                        <span><strong>{formatDateTime(booking.startsAt)}</strong></span>
                        <span>Ends {formatDateTime(booking.endsAt)}</span>
                      </div>
                    </div>
                    <div className="operator-table__cell">
                      <div className="operator-cellMeta">
                        <span><strong data-testid="workflow-stage-label">{stage?.label || booking.status || "PLANNED"}</strong></span>
                        <span>{booking.status || "PLANNED"}</span>
                        <span>{isToday(booking.startsAt) ? "Today" : "Scheduled"}</span>
                        {missingStageFields.length ? <span data-testid="custom-field-stage-warning">{missingStageFields.join(", ")} required</span> : null}
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
                      {(() => {
                        const primaryAction = !booking.jobId
                          ? canConvert
                            ? {
                                label: busyConvertId === booking.id ? "Converting..." : "Convert to job",
                                onClick: () => void convertBooking(booking.id),
                                disabled: busyConvertId === booking.id,
                                testId: `booking-convert-primary-${booking.id}`,
                              }
                            : {
                                label: "Convert to job",
                                onClick: () => void convertBooking(booking.id),
                                disabled: true,
                                testId: `booking-convert-${booking.id}`,
                              }
                          : {
                              label: "Review linked job",
                              href: `/dashboard/jobs/${booking.jobId}`,
                              testId: `booking-open-job-primary-${booking.id}`,
                            };
                        return (
                          <OperatorRowActions
                            primaryAction={primaryAction}
                            actions={[
                              {
                                label: "Schedule",
                                description: "Open the calendar and schedule around the visit",
                                shortcut: "Cal",
                                group: "Booking",
                                href: "/dashboard/calendar",
                                testId: `booking-schedule-${booking.id}`,
                              },
                              {
                                label: "Review booking",
                                description: "Review the booking detail record",
                                shortcut: "View",
                                group: "Booking",
                                href: `/dashboard/bookings/${booking.id}`,
                                testId: `booking-open-${booking.id}`,
                              },
                              ...(!booking.jobId ? [{
                                label: busyConvertId === booking.id ? "Converting..." : operatorState.actionLabel,
                                description: canConvert ? "Create a linked scheduled job from this booking" : `Blocked until ${readinessIssues.join(" and ")} ${readinessIssues.length > 1 ? "are" : "is"} added`,
                                shortcut: "New",
                                group: "Booking",
                                onClick: () => void convertBooking(booking.id),
                                disabled: busyConvertId === booking.id || !canConvert,
                                testId: canConvert ? `booking-convert-${booking.id}` : `booking-convert-menu-${booking.id}`,
                              }] : []),
                              ...(booking.jobId ? [{
                                label: operatorState.actionLabel,
                                description: "Review the linked job record",
                                shortcut: "View",
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
                              {
                                label: "Custom fields",
                                description: "Review and edit workspace-specific booking fields",
                                group: "Tools",
                                onClick: () => setCustomFieldBookingId(booking.id),
                              },
                            ]}
                          />
                        );
                      })()}
                    </div>
                  </OperatorDataTableRow>
                );
              })}
            </OperatorDataTable>
          ) : !notice || notice.kind !== "error" ? (
            <div className="bookings-empty-state" data-testid="bookings-empty-state">
              <h3>{hasActiveFilters ? `No ${terms.bookings.toLowerCase()} match these filters` : `No ${terms.bookings.toLowerCase()} yet`}</h3>
              <div className="operator-inline-actions">
                {hasActiveFilters ? (
                  <button className="button secondary" type="button" onClick={clearFilters}>Clear filters</button>
                ) : (
                  <>
                    <button className="button" type="button" onClick={() => setCreateBookingOpen(true)}>Create booking</button>
                    {settings?.publicUrl ? <Link className="button secondary" href={settings.publicUrl} target="_blank" rel="noreferrer">Open public booking</Link> : null}
                  </>
                )}
              </div>
            </div>
          ) : null}
        </section>

        {customFieldBookingId ? (
          <EntityCustomFieldsCard
            title="Booking custom fields"
            entityType="booking"
            entityId={customFieldBookingId}
            onSaved={() => {
              void load();
            }}
          />
        ) : null}
      </div>
    </DashboardShell>
  );
}
