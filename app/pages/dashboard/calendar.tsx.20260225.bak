import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useRouter } from 'next/router';
import { DashboardShell } from '../../components/dashboard-shell';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';
import { ApiError, apiFetch } from '../../lib/api';
import { isCalendarV1Enabled, isCalendarV2DragEnabled } from '../../lib/feature-flags';

type CalendarTechnician = {
  id: string;
  name: string;
  email: string;
};

type CalendarBlock = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  customer?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  technician?: {
    id: string;
    name: string;
    email: string;
  } | null;
  location?: {
    id: string;
    name?: string | null;
  } | null;
  jobSummary?: {
    id: string;
    jobRef?: string | null;
    status?: string | null;
  } | null;
  source?: string;
  warnings?: Array<{ id: string; startsAt: string; endsAt: string }>;
};

type CalendarResponse = {
  from: string;
  to: string;
  effectiveTo: string;
  clamped: boolean;
  technicians: CalendarTechnician[];
  blocks: CalendarBlock[];
};

type PositionedBlock = {
  booking: CalendarBlock;
  top: number;
  height: number;
  lane: number;
  laneCount: number;
  hasOverlap: boolean;
  conflictCount: number;
};

type StatusFilterKey = 'ALL' | 'UNASSIGNED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED';

const GRID_START_HOUR = 8;
const GRID_END_HOUR = 18;
const GRID_TOTAL_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60;
const PIXELS_PER_MINUTE = 1.1;
const ROW_HEIGHT = GRID_TOTAL_MINUTES * PIXELS_PER_MINUTE;

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  PENDING: { bg: '#fef9c3', border: '#facc15', text: '#713f12' },
  PLANNED: { bg: '#dbeafe', border: '#60a5fa', text: '#1e3a8a' },
  CONFIRMED: { bg: '#dcfce7', border: '#22c55e', text: '#14532d' },
  IN_PROGRESS: { bg: '#ffedd5', border: '#fb923c', text: '#7c2d12' },
  COMPLETED: { bg: '#e5e7eb', border: '#9ca3af', text: '#111827' },
  CANCELLED: { bg: '#fee2e2', border: '#ef4444', text: '#7f1d1d' },
};

const STATUS_FILTERS: Array<{ key: StatusFilterKey; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'UNASSIGNED', label: 'Unassigned' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'COMPLETED', label: 'Completed' },
];

function getStatusColor(status?: string) {
  if (!status) return STATUS_COLORS.PLANNED;
  return STATUS_COLORS[status] || STATUS_COLORS.PLANNED;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeekMonday(input: Date) {
  const date = new Date(input);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function minutesFromGridStart(date: Date) {
  return date.getHours() * 60 + date.getMinutes() - GRID_START_HOUR * 60;
}

function clampMinute(minute: number) {
  if (minute < 0) return 0;
  if (minute > GRID_TOTAL_MINUTES) return GRID_TOTAL_MINUTES;
  return minute;
}

function roundTo15(minute: number) {
  return Math.round(minute / 15) * 15;
}

function getBookingTitle(block: CalendarBlock) {
  if (block.jobSummary?.jobRef) return block.jobSummary.jobRef;
  if (block.customer?.name) return block.customer.name;
  if (block.customer?.email) return block.customer.email;
  return `Booking ${block.id.slice(0, 8)}`;
}

function buildPositionedBlocks(bookings: CalendarBlock[], dayStart: Date, dayEnd: Date): PositionedBlock[] {
  const entries = bookings
    .map((booking) => {
      const start = new Date(booking.startsAt);
      const end = new Date(booking.endsAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
      if (end <= dayStart || start >= dayEnd) return null;

      const clippedStart = start < dayStart ? dayStart : start;
      const clippedEnd = end > dayEnd ? dayEnd : end;
      const startMinute = clampMinute(minutesFromGridStart(clippedStart));
      const endMinute = clampMinute(minutesFromGridStart(clippedEnd));
      if (endMinute <= startMinute) return null;

      return {
        booking,
        startMinute,
        endMinute,
        lane: 0,
        laneCount: 1,
        hasOverlap: false,
        conflictCount: 0,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => (a.startMinute - b.startMinute) || (a.endMinute - b.endMinute)) as Array<{
      booking: CalendarBlock;
      startMinute: number;
      endMinute: number;
      lane: number;
      laneCount: number;
      hasOverlap: boolean;
      conflictCount: number;
    }>;

  const laneEndMinutes: number[] = [];
  const activeIndexes: number[] = [];

  for (let i = 0; i < entries.length; i += 1) {
    const item = entries[i];

    for (let j = activeIndexes.length - 1; j >= 0; j -= 1) {
      const activeIndex = activeIndexes[j];
      if (entries[activeIndex].endMinute <= item.startMinute) {
        activeIndexes.splice(j, 1);
      }
    }

    let lane = laneEndMinutes.findIndex((endMinute) => endMinute <= item.startMinute);
    if (lane === -1) {
      lane = laneEndMinutes.length;
      laneEndMinutes.push(item.endMinute);
    } else {
      laneEndMinutes[lane] = item.endMinute;
    }

    item.lane = lane;
    activeIndexes.push(i);

    const overlapping = activeIndexes.map((index) => entries[index]);
    const overlapSize = overlapping.length;
    if (overlapSize > 1) {
      for (const target of overlapping) {
        target.hasOverlap = true;
        target.laneCount = Math.max(target.laneCount, overlapSize);
      }
    }
  }

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    let conflicts = 0;
    for (let j = 0; j < entries.length; j += 1) {
      if (i === j) continue;
      if (entries[j].startMinute < entry.endMinute && entries[j].endMinute > entry.startMinute) {
        conflicts += 1;
      }
    }
    entry.conflictCount = conflicts;
    entry.hasOverlap = conflicts > 0;
  }

  return entries.map((entry) => ({
    booking: entry.booking,
    top: entry.startMinute * PIXELS_PER_MINUTE,
    height: Math.max((entry.endMinute - entry.startMinute) * PIXELS_PER_MINUTE, 20),
    lane: entry.lane,
    laneCount: entry.laneCount,
    hasOverlap: entry.hasOverlap,
    conflictCount: entry.conflictCount,
  }));
}

function normalizeBooking(record: any): CalendarBlock {
  return {
    id: record.id,
    startsAt: record.startsAt,
    endsAt: record.endsAt,
    status: record.status,
    source: record.source,
    customer: {
      name: record.customerName || null,
      email: record.customerEmail || null,
      phone: record.customerPhone || null,
    },
    technician: record.assignedUser
      ? {
          id: record.assignedUser.id,
          name: record.assignedUser.email,
          email: record.assignedUser.email,
        }
      : null,
    location: record.location
      ? {
          id: record.location.id,
          name: record.location.name,
        }
      : null,
    jobSummary: record.job
      ? {
          id: record.job.id,
          jobRef: record.job.jobRef,
          status: record.job.status,
        }
      : null,
    warnings: record.warnings ?? [],
  };
}

export default function CalendarPage() {
  const router = useRouter();
  const enabled = isCalendarV1Enabled();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('ALL');
  const [selectedTechId, setSelectedTechId] = useState('ALL');
  const [selectedLocationId, setSelectedLocationId] = useState('ALL');
  const [isMobile, setIsMobile] = useState(false);
  const [nowMinutes, setNowMinutes] = useState(() => clampMinute(minutesFromGridStart(new Date())));
  const [draggingBookingId, setDraggingBookingId] = useState<string | null>(null);
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleErrorRequestId, setRescheduleErrorRequestId] = useState<string | undefined>(undefined);
  const dragEnabled = isCalendarV2DragEnabled();

  const nowPosition = nowMinutes * PIXELS_PER_MINUTE;
  const showNowLine = nowMinutes >= 0 && nowMinutes <= GRID_TOTAL_MINUTES;

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  const hasUnassigned = useMemo(
    () => Boolean(data?.blocks?.some((block) => !block.technician?.id)),
    [data],
  );
  const technicians = useMemo(() => {
    const base = data?.technicians || [];
    if (!hasUnassigned) return base;
    return [{ id: '__unassigned__', name: 'Unassigned', email: 'Unassigned' }, ...base];
  }, [data, hasUnassigned]);

  const technicianFilterOptions = useMemo(() => {
    const seen = new Set<string>();
    return technicians.filter((tech) => {
      if (seen.has(tech.id)) return false;
      seen.add(tech.id);
      return true;
    });
  }, [technicians]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const refresh = () => {
      if (document.hidden) return;
      setNowMinutes(clampMinute(minutesFromGridStart(new Date())));
    };
    refresh();
    const handleVisibility = () => {
      if (!document.hidden) {
        refresh();
      }
    };
    const intervalId = window.setInterval(() => {
      refresh();
    }, 60_000);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const load = async () => {
      setLoading(true);
      setError('');
      setRequestId(undefined);
      try {
        const from = weekStart.toISOString();
        const to = addDays(weekStart, 7).toISOString();
        const query = new URLSearchParams({ from, to });
        const result = await apiFetch(`/calendar/bookings?${query.toString()}`);
        setData((result || null) as CalendarResponse | null);
      } catch (err: any) {
        setError(err?.message || 'Failed to load calendar');
        setRequestId(err instanceof ApiError ? err.requestId : undefined);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [enabled, weekStart]);

  useEffect(() => {
    if (!data || !scrollRef.current) return;
    scrollRef.current.scrollTo({ top: Math.max(nowPosition - 120, 0) });
  }, [data, nowPosition]);

  const handleReschedule = async (
    bookingId: string,
    techId: string,
    newStart: Date,
    newEnd: Date,
  ) => {
    if (!data) return;
    const original = data.blocks.find((block) => block.id === bookingId);
    if (!original) return;
    const targetTech = technicians.find((tech) => tech.id === techId) ?? null;
    const optimisticBlocks = data.blocks.map((block) =>
      block.id === bookingId
        ? {
            ...block,
            startsAt: newStart.toISOString(),
            endsAt: newEnd.toISOString(),
            technician: techId === '__unassigned__' ? null : targetTech,
            warnings: [],
          }
        : block,
    );
    setData((prev) => (prev ? { ...prev, blocks: optimisticBlocks } : prev));

    try {
      const payload = {
        startsAt: newStart.toISOString(),
        endsAt: newEnd.toISOString(),
        technicianId: techId === '__unassigned__' ? null : techId,
      };
      const response = (await apiFetch(`/calendar/bookings/${bookingId}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })) as { booking: any; warnings?: Array<{ id: string; startsAt: string; endsAt: string }> };
      const normalized = normalizeBooking({ ...response.booking, warnings: response.warnings ?? [] });
      setData((prev) =>
        prev
          ? {
              ...prev,
              blocks: prev.blocks.map((block) => (block.id === bookingId ? normalized : block)),
            }
          : prev,
      );
      setRescheduleError('');
      setRescheduleErrorRequestId(undefined);
    } catch (err: any) {
      setData((prev) =>
        prev ? { ...prev, blocks: prev.blocks.map((block) => (block.id === bookingId ? original : block)) } : prev,
      );
      setRescheduleError(err?.message || 'Failed to reschedule booking');
      setRescheduleErrorRequestId(err instanceof ApiError ? err.requestId : undefined);
    }
  };

  const handleLaneDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!dragEnabled) return;
    event.preventDefault();
  };

  const handleLaneDrop = (event: DragEvent<HTMLDivElement>, day: Date, techId: string) => {
    if (!dragEnabled) return;
    event.preventDefault();
    const bookingId = event.dataTransfer?.getData('text/plain');
    if (!bookingId || !data) return;
    const booking = data.blocks.find((block) => block.id === bookingId);
    if (!booking) return;
    const laneRect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - laneRect.top;
    const minutes = clampMinute(offsetY / PIXELS_PER_MINUTE);
    const durationMs = Math.max(
      0,
      new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime(),
    );
    const durationMinutes = durationMs / 60000;
    const maxStart = Math.max(GRID_TOTAL_MINUTES - durationMinutes, 0);
    const snappedMinutes = Math.min(roundTo15(minutes), maxStart);
    const dayStart = new Date(day);
    dayStart.setHours(GRID_START_HOUR, 0, 0, 0);
    const newStart = new Date(dayStart.getTime() + snappedMinutes * 60 * 1000);
    const newEnd = new Date(newStart.getTime() + durationMs);
    handleReschedule(bookingId, techId, newStart, newEnd);
  };

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, bookingId: string) => {
    if (!dragEnabled) return;
    event.dataTransfer?.setData('text/plain', bookingId);
    event.dataTransfer?.setDragImage(new Image(), 0, 0);
    setDraggingBookingId(bookingId);
  };

  const handleDragEnd = () => {
    setDraggingBookingId(null);
  };

  if (!enabled) {
    return (
      <DashboardShell>
        <div className="card">
          <h1>Calendar</h1>
          <p className="muted">Calendar V1 is disabled.</p>
        </div>
      </DashboardShell>
    );
  }

  const locationOptions = useMemo(() => {
    if (!data?.blocks) return [] as Array<{ id: string; label: string }>;
    const seen = new Map<string, string>();
    for (const block of data.blocks) {
      if (!block.location?.id) continue;
      seen.set(block.location.id, block.location.name || block.location.id);
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
  }, [data]);

  const filteredBlocks = useMemo(() => {
    if (!data) return [] as CalendarBlock[];
    return data.blocks.filter((block) => {
      if (statusFilter === 'UNASSIGNED' && block.technician?.id) return false;
      if (statusFilter === 'CONFIRMED' && block.status !== 'CONFIRMED') return false;
      if (statusFilter === 'IN_PROGRESS' && block.status !== 'IN_PROGRESS') return false;
      if (statusFilter === 'COMPLETED' && block.status !== 'COMPLETED') return false;
      if (selectedTechId !== 'ALL') {
        const match = selectedTechId === '__unassigned__'
          ? !block.technician?.id
          : block.technician?.id === selectedTechId;
        if (!match) return false;
      }
      if (selectedLocationId !== 'ALL') {
        if (block.location?.id !== selectedLocationId) return false;
      }
      return true;
    });
  }, [data, selectedTechId, selectedLocationId, statusFilter]);

  const visibleTechnicians = useMemo(() => {
    if (!isMobile) return technicians;
    const techId = selectedTechId === 'ALL' ? technicians[0]?.id ?? '__unassigned__' : selectedTechId;
    return technicians.filter((tech) => tech.id === techId);
  }, [isMobile, selectedTechId, technicians]);

  return (
    <DashboardShell>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ marginBottom: 6 }}>Calendar</h1>
            <p className="muted" style={{ margin: 0 }}>Week view with technician lanes (08:00 - 18:00).</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="button secondary" type="button" onClick={() => setWeekStart((prev) => addDays(prev, -7))}>Prev week</button>
            <button className="button secondary" type="button" onClick={() => setWeekStart(startOfWeekMonday(new Date()))}>Current week</button>
            <button className="button secondary" type="button" onClick={() => setWeekStart((prev) => addDays(prev, 7))}>Next week</button>
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
            Filter tech
            <select className="input" value={selectedTechId} onChange={(event) => setSelectedTechId(event.target.value)}>
              <option value="ALL">All technicians</option>
              {technicianFilterOptions.map((tech) => (
                <option key={tech.id} value={tech.id}>{tech.name || tech.email}</option>
              ))}
            </select>
          </label>
          {locationOptions.length > 0 ? (
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
              Filter location
              <select className="input" value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)}>
                <option value="ALL">All locations</option>
                {locationOptions.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={`button secondary${statusFilter === filter.key ? ' active' : ''}`}
                onClick={() => setStatusFilter(filter.key)}
                style={{ height: 32, fontSize: 12 }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        {rescheduleError ? (
          <div
            className="card"
            style={{ marginTop: 12, borderColor: '#f87171', padding: 12, background: '#fef2f2' }}
          >
            <strong style={{ color: '#b91c1c' }}>Reschedule error</strong>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              {rescheduleError}
            </p>
            {rescheduleErrorRequestId ? (
              <p className="muted" style={{ fontSize: 12 }}>
                Support code: <code>{rescheduleErrorRequestId}</code>
              </p>
            ) : null}
          </div>
        ) : null}

        {loading && !data ? (
          <LoadingState title="Loading calendar" description="Fetching booking blocks for this week." />
        ) : null}
        {error && !data ? (
          <ErrorState
            title="Could not load calendar"
            description={error}
            requestId={requestId}
            primaryAction={{ label: 'Retry', onClick: () => setWeekStart((prev) => new Date(prev)) }}
            secondaryAction={{ label: 'Back to bookings', href: '/dashboard/bookings' }}
          />
        ) : null}

        {data ? (
          <>
            {data.clamped ? <p className="muted" style={{ marginTop: 12 }}>Requested range exceeded 14 days and was clamped.</p> : null}
            <div style={{ marginTop: 12, maxHeight: ROW_HEIGHT + 80, overflow: 'auto' }} ref={scrollRef}>
              <div
                style={{
                  minWidth: isMobile ? 320 : 1960,
                  display: 'grid',
                  gridTemplateColumns: `repeat(7, minmax(280px, 1fr))`,
                  gap: 10,
                }}
              >
                {days.map((day) => {
                  const dayStart = new Date(day);
                  dayStart.setHours(GRID_START_HOUR, 0, 0, 0);
                  const dayEnd = new Date(day);
                  dayEnd.setHours(GRID_END_HOUR, 0, 0, 0);
                  const dayKey = formatDateKey(day);

                  return (
                    <div key={dayKey} className="card" style={{ padding: 10, margin: 0 }}>
                      <div style={{ marginBottom: 8 }}>
                        <strong>{day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: `64px repeat(${Math.max(visibleTechnicians.length, 1)}, minmax(170px, 1fr))`,
                          gap: 8,
                        }}
                      >
                        <div />
                        {!isMobile ? (
                          visibleTechnicians.map((tech) => (
                            <div
                              key={`${dayKey}-${tech.id}-label`}
                              style={{
                                fontSize: 12,
                                color: '#9ca3af',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {tech.name}
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: 12, color: '#9ca3af' }}>{visibleTechnicians[0]?.name || 'Unassigned'}</div>
                        )}

                        <div
                          style={{
                            position: 'relative',
                            height: ROW_HEIGHT,
                            borderRight: '1px solid rgba(148, 163, 184, 0.25)',
                            paddingRight: 6,
                          }}
                        >
                          {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, index) => {
                            const hour = GRID_START_HOUR + index;
                            const top = index * 60 * PIXELS_PER_MINUTE;
                            return (
                              <div
                                key={`${dayKey}-time-${hour}`}
                                style={{
                                  position: 'absolute',
                                  top: top - 8,
                                  right: 2,
                                  fontSize: 11,
                                  color: '#94a3b8',
                                }}
                              >
                                {String(hour).padStart(2, '0')}:00
                              </div>
                            );
                          })}
                        </div>

                        {visibleTechnicians.map((tech) => {
                          const dayBookings = filteredBlocks.filter((block) => {
                            const blockStart = new Date(block.startsAt);
                            const blockEnd = new Date(block.endsAt);
                            const sameTech = tech.id === '__unassigned__'
                              ? !block.technician?.id
                              : block.technician?.id === tech.id;
                            return sameTech && blockEnd > dayStart && blockStart < dayEnd;
                          });
                          const positioned = buildPositionedBlocks(dayBookings, dayStart, dayEnd);

                          return (
                            <div
                              key={`${dayKey}-${tech.id}-lane`}
                              style={{
                                position: 'relative',
                                height: ROW_HEIGHT,
                                border: '1px solid rgba(148, 163, 184, 0.25)',
                                borderRadius: 10,
                                background: 'rgba(15, 23, 42, 0.15)',
                              }}
                              onDragOver={handleLaneDragOver}
                              onDrop={(event) => handleLaneDrop(event, day, tech.id)}
                            >
                              {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, index) => {
                                const top = index * 60 * PIXELS_PER_MINUTE;
                                return (
                                  <div
                                    key={`${dayKey}-${tech.id}-line-${index}`}
                                    style={{
                                      position: 'absolute',
                                      left: 0,
                                      right: 0,
                                      top,
                                      borderTop: '1px solid rgba(148, 163, 184, 0.18)',
                                    }}
                                  />
                                );
                              })}

                              {showNowLine ? (
                                <div
                                  style={{
                                    position: 'absolute',
                                    left: 0,
                                    right: 0,
                                    top: nowPosition,
                                    borderTop: '2px dashed #f87171',
                                    zIndex: 2,
                                  }}
                                />
                              ) : null}

                              {positioned.map((entry) => {
                                const color = getStatusColor(entry.booking.status);
                                const width = entry.laneCount > 1 ? `${Math.max(30, 100 / entry.laneCount - 2)}%` : '98%';
                                const left = entry.laneCount > 1 ? `${(100 / entry.laneCount) * entry.lane}%` : '1%';

                                return (
                                  <button
                                    key={entry.booking.id}
                                    type="button"
                                    draggable={dragEnabled}
                                    onDragStart={(event) => handleDragStart(event, entry.booking.id)}
                                    onDragEnd={handleDragEnd}
                                    onClick={() => router.push(`/dashboard/bookings/${entry.booking.id}`)}
                                    title={`${getBookingTitle(entry.booking)} (${entry.booking.status})`}
                                    style={{
                                      position: 'absolute',
                                      top: entry.top,
                                      left,
                                      width,
                                      height: entry.height,
                                      borderRadius: 8,
                                      border: `1px solid ${entry.hasOverlap ? '#f97316' : color.border}`,
                                      boxShadow: entry.hasOverlap ? '0 0 0 1px rgba(249, 115, 22, 0.45)' : 'none',
                                      background: color.bg,
                                      color: color.text,
                                      textAlign: 'left',
                                      fontSize: 11,
                                      lineHeight: 1.2,
                                      padding: 6,
                                      overflow: 'hidden',
                                      cursor: 'pointer',
                                      opacity: draggingBookingId === entry.booking.id ? 0.6 : 1,
                                    }}
                                  >
                                    <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {getBookingTitle(entry.booking)}
                                    </div>
                                    <div style={{ marginTop: 2, opacity: 0.85 }}>
                                      {new Date(entry.booking.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      {' – '}
                                      {new Date(entry.booking.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    {entry.conflictCount > 0 ? (
                                      <span
                                        style={{
                                          marginTop: 4,
                                          display: 'inline-flex',
                                          gap: 4,
                                          alignItems: 'center',
                                          fontSize: 10,
                                          fontWeight: 600,
                                        }}
                                      >
                                        <span style={{ background: '#fde68a', borderRadius: 999, padding: '0 6px', color: '#92400e' }}>
                                          {entry.conflictCount} conflict{entry.conflictCount > 1 ? 's' : ''}
                                        </span>
                                      </span>
                                    ) : null}
                                    {entry.booking.warnings?.length ? (
                                      <div
                                        style={{
                                          marginTop: 4,
                                          fontSize: 10,
                                          fontWeight: 600,
                                          color: '#b45309',
                                        }}
                                      >
                                        Warning{entry.booking.warnings.length > 1 ? 's' : ''}: {entry.booking.warnings.length}
                                      </div>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}
