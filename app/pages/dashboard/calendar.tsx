import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { DashboardShell } from '../../components/dashboard-shell';
import { Skeleton } from '../../components/ui/Skeleton';
import { OperatorPageHeader } from '../../components/ui/operator-page';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';
import { ApiError, apiFetch } from '../../lib/api';
import {
  isCalendarV2DragEnabled,
  isCalendarV2HardConflictsEnabled,
  isSchedulingIntelligenceV1Enabled,
} from '../../lib/feature-flags';
import { formatSuggestedSlotLabel, type SuggestedSlot } from '../../lib/suggested-slot';
import { SuggestedSlotReasons } from '../../components/SuggestedSlotReasons';

type BookingWarning =
  | { code: 'OVERLAP'; id: string; startsAt: string; endsAt: string }
  | { code: 'OUTSIDE_WORKING_HOURS'; day: string }
  | { code: 'OVER_CAPACITY'; day: string; bookedMinutes: number; capacityMinutes: number }
  | { code: 'TIME_OFF'; exceptionIds: string[]; startsAt: string; endsAt: string };

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
  warnings?: BookingWarning[];
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

type RescheduleSnapshot = {
  startsAt: string;
  endsAt: string;
  technicianId?: string | null;
  technician?: CalendarTechnician | null;
};

type UndoState = {
  bookingId: string;
  prev: RescheduleSnapshot;
  next: RescheduleSnapshot;
  expiresAt: number;
};

type ToastState = {
  message: string;
  type: 'success' | 'error';
  supportCode?: string;
};

type StatusFilterKey = 'ALL' | 'UNASSIGNED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED';

type WeeklyScheduleSlot = {
  start?: string | null;
  end?: string | null;
};

type WeeklyScheduleJson = Record<string, WeeklyScheduleSlot[]>;

type ScheduleDailyAvailability = {
  date: string;
  minutes: number;
};

type TechSchedule = {
  technicianId: string;
  timezone?: string | null;
  weeklyJson: WeeklyScheduleJson;
  dailyAvailability: ScheduleDailyAvailability[];
};

type ScheduleException = {
  id: string;
  technicianId: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  reason?: string | null;
};

type ScheduleResponse = {
  from: string;
  to: string;
  technicians: Array<{ id: string; name: string }>;
  schedules: TechSchedule[];
  availabilityMinutesByDay: Record<string, Record<string, number>>;
  exceptions: ScheduleException[];
};

type SuggestResponse = {
  bookingId?: string;
  windowDays: number;
  suggestions: SuggestedSlot[];
};

type SuggestionState = {
  open: boolean;
  loading: boolean;
  suggestions?: SuggestedSlot[];
  error?: string;
  supportCode?: string;
};

type UtilizationStatus = 'Under' | 'OK' | 'Over' | 'Off';

const GRID_START_HOUR = 8;
const GRID_END_HOUR = 18;
const GRID_TOTAL_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60;
const PIXELS_PER_MINUTE = 1.1;
const ROW_HEIGHT = GRID_TOTAL_MINUTES * PIXELS_PER_MINUTE;
const UNDO_DURATION_MS = 10_000;
const REVERT_TOAST_DURATION_MS = 3_500;
const CONFLICT_HIGHLIGHT_DURATION_MS = 3_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const UTILIZATION_STATUS_STYLES: Record<UtilizationStatus, { bg: string; text: string }> = {
  Under: { bg: '#dcfce7', text: '#14532d' },
  OK: { bg: '#fef3c7', text: '#92400e' },
  Over: { bg: '#fee2e2', text: '#991b1b' },
  Off: { bg: '#e5e7eb', text: '#1f2937' },
};

const WARNING_LABELS: Record<BookingWarning['code'], string> = {
  OVERLAP: 'Overlap',
  OUTSIDE_WORKING_HOURS: 'Outside hours',
  OVER_CAPACITY: 'Over capacity',
  TIME_OFF: 'Time off',
};

const SCHEDULE_WARNING_CODES: BookingWarning['code'][] = [
  'OUTSIDE_WORKING_HOURS',
  'OVER_CAPACITY',
  'TIME_OFF',
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
  const rawWarnings = Array.isArray(record.warnings) ? record.warnings : [];
  const toIso = (value: string | Date | undefined | null) =>
    value instanceof Date ? value.toISOString() : value ?? '';
  const warnings: BookingWarning[] = rawWarnings
    .map((warning: any) => {
      if (warning && typeof warning === 'object' && typeof warning.code === 'string') {
        const code = warning.code as BookingWarning['code'];
        if (code === 'OVERLAP') {
          return {
            code,
            id: warning.id ?? '',
            startsAt: toIso(warning.startsAt),
            endsAt: toIso(warning.endsAt),
          };
        }
        if (code === 'OUTSIDE_WORKING_HOURS') {
          return {
            code,
            day: warning.day ?? formatDateKey(new Date()),
          };
        }
        if (code === 'OVER_CAPACITY') {
          return {
            code,
            day: warning.day ?? formatDateKey(new Date()),
            bookedMinutes: typeof warning.bookedMinutes === 'number' ? warning.bookedMinutes : 0,
            capacityMinutes: typeof warning.capacityMinutes === 'number' ? warning.capacityMinutes : 0,
          };
        }
        if (code === 'TIME_OFF') {
          return {
            code,
            exceptionIds: Array.isArray(warning.exceptionIds)
              ? (warning.exceptionIds as unknown[]).filter((id): id is string => typeof id === 'string')
              : [],
            startsAt: toIso(warning.startsAt),
            endsAt: toIso(warning.endsAt),
          };
        }
      }
      if (warning && typeof warning === 'object') {
        return {
          code: 'OVERLAP',
          id: warning.id ?? '',
          startsAt: toIso(warning.startsAt),
          endsAt: toIso(warning.endsAt),
        };
      }
      return null;
    })
    .filter(Boolean) as BookingWarning[];
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
    warnings,
  };
}

function parseTimeToMinutes(value?: string | null) {
  if (!value) {
    return null;
  }
  const parts = value.split(':').map((part) => Number(part));
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
    return null;
  }
  return parts[0] * 60 + parts[1];
}

function formatHours(minutes: number) {
  const hours = minutes / 60;
  const normalized = Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1);
  return `${normalized}h`;
}

export default function CalendarPage() {
  const router = useRouter();
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
  const hardConflictEnabled = isCalendarV2HardConflictsEnabled();
  const [highlightedConflictIds, setHighlightedConflictIds] = useState<string[]>([]);
  const schedulingEnabled = isSchedulingIntelligenceV1Enabled();
  const [scheduleData, setScheduleData] = useState<ScheduleResponse | null>(null);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [toastState, setToastState] = useState<ToastState | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [suggestionsByBooking, setSuggestionsByBooking] = useState<Record<string, SuggestionState>>({});
  const deepLinkRef = useRef<string | null>(null);
  const [deepLinkTarget, setDeepLinkTarget] = useState<{ dayKey: string; techId: string } | null>(null);
  const [applyingBestBookingId, setApplyingBestBookingId] = useState<string | null>(null);

  const clearToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToastState(null);
  }, []);

  const pushToast = useCallback((message: string, type: ToastState['type'], supportCode?: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToastState({ message, type, supportCode });
    toastTimerRef.current = setTimeout(() => {
      setToastState(null);
      toastTimerRef.current = null;
    }, REVERT_TOAST_DURATION_MS);
  }, []);

  const highlightConflicts = (ids: string[]) => {
    if (!hardConflictEnabled || ids.length === 0) return;
    setHighlightedConflictIds(ids);
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedConflictIds([]);
      highlightTimerRef.current = null;
    }, CONFLICT_HIGHLIGHT_DURATION_MS);

    const container = scrollRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      const target = container.querySelector<HTMLButtonElement>(`[data-calendar-booking="${ids[0]}"]`);
      if (!target) return;
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      if (
        targetRect.top < containerRect.top ||
        targetRect.bottom > containerRect.bottom
      ) {
        const offset = targetRect.top - containerRect.top + container.scrollTop;
        container.scrollTo({
          top: Math.max(offset - 80, 0),
          behavior: 'smooth',
        });
      }
    });
  };

  const nowPosition = nowMinutes * PIXELS_PER_MINUTE;
  const showNowLine = nowMinutes >= 0 && nowMinutes <= GRID_TOTAL_MINUTES;

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const dayMeta = useMemo(
    () =>
      days.map((day) => ({
        date: day,
        key: formatDateKey(day),
        weekday: WEEKDAY_KEYS[day.getDay()],
      })),
    [days],
  );
  const scheduleSegments = useMemo(() => {
    const map = new Map<string, Array<{ top: number; height: number }>>();
    if (!scheduleData) {
      return map;
    }
    for (const schedule of scheduleData.schedules) {
      for (const day of dayMeta) {
        const slots = schedule.weeklyJson?.[day.weekday] ?? [];
        const segments = slots
          .map((slot) => {
            const startMinutes = parseTimeToMinutes(slot?.start ?? null);
            const endMinutes = parseTimeToMinutes(slot?.end ?? null);
            if (startMinutes === null || endMinutes === null) {
              return null;
            }
            const relativeStart = clampMinute(startMinutes - GRID_START_HOUR * 60);
            const relativeEnd = clampMinute(endMinutes - GRID_START_HOUR * 60);
            if (relativeEnd <= relativeStart) {
              return null;
            }
            return {
              top: relativeStart * PIXELS_PER_MINUTE,
              height: Math.max((relativeEnd - relativeStart) * PIXELS_PER_MINUTE, 4),
            };
          })
          .filter(Boolean) as Array<{ top: number; height: number }>;
        map.set(`${schedule.technicianId}|${day.key}`, segments);
      }
    }
    return map;
  }, [dayMeta, scheduleData]);

  const exceptionSegments = useMemo(() => {
    const map = new Map<string, Array<{ top: number; height: number }>>();
    if (!scheduleData?.exceptions?.length) {
      return map;
    }
    for (const exception of scheduleData.exceptions) {
      const techId = exception.technicianId;
      const start = new Date(exception.startsAt);
      const end = new Date(exception.endsAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        continue;
      }
      for (const day of dayMeta) {
        const dayStart = new Date(day.date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart.getTime() + MS_PER_DAY);
        if (end <= dayStart || start >= dayEnd) continue;
        const segmentStart = Math.max(start.getTime(), dayStart.getTime());
        const segmentEnd = Math.min(end.getTime(), dayEnd.getTime());
        const startMinutes = clampMinute(minutesFromGridStart(new Date(segmentStart)));
        const endMinutes = clampMinute(minutesFromGridStart(new Date(segmentEnd)));
        if (endMinutes <= startMinutes) continue;
        const key = `${techId}|${day.key}`;
        const entries = map.get(key) ?? [];
        entries.push({
          top: startMinutes * PIXELS_PER_MINUTE,
          height: Math.max((endMinutes - startMinutes) * PIXELS_PER_MINUTE, 4),
        });
        map.set(key, entries);
      }
    }
    return map;
  }, [dayMeta, scheduleData]);
  const getExceptionSegmentsFor = useCallback(
    (techId: string, dayKey: string) => exceptionSegments.get(`${techId}|${dayKey}`) ?? [],
    [exceptionSegments],
  );
  const availabilityMap = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    if (!scheduleData) return map;
    for (const schedule of scheduleData.schedules) {
      const bucket: Record<string, number> = {};
      for (const entry of schedule.dailyAvailability || []) {
        bucket[entry.date] = entry.minutes;
      }
      map.set(schedule.technicianId, bucket);
    }
    return map;
  }, [scheduleData]);
  const bookedMinutesMap = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    if (!data) return map;
    for (const block of data.blocks) {
      const techId = block.technician?.id;
      if (!techId) continue;
      const dayKey = formatDateKey(new Date(block.startsAt));
      const durationMinutes = Math.max(
        0,
        Math.round((new Date(block.endsAt).getTime() - new Date(block.startsAt).getTime()) / 60000),
      );
      const bucket = map.get(techId) ?? {};
      bucket[dayKey] = (bucket[dayKey] || 0) + durationMinutes;
      map.set(techId, bucket);
    }
    return map;
  }, [data]);
  const getScheduleSegmentsFor = useCallback(
    (techId: string, dayKey: string) => scheduleSegments.get(`${techId}|${dayKey}`) ?? [],
    [scheduleSegments],
  );
  const getUtilization = useCallback(
    (techId: string, dayKey: string) => {
      if (!schedulingEnabled) return null;
      const availability = availabilityMap.get(techId)?.[dayKey];
      if (typeof availability !== 'number') {
        return null;
      }
      const booked = bookedMinutesMap.get(techId)?.[dayKey] ?? 0;
      const percent = availability > 0 ? Math.round((booked / Math.max(1, availability)) * 100) : 0;
      const status: UtilizationStatus =
        availability === 0
          ? 'Off'
          : percent > 100
          ? 'Over'
          : percent >= 75
          ? 'OK'
          : 'Under';
      return {
        minutesAvailable: availability,
        minutesBooked: booked,
        percent,
        status,
      };
    },
    [availabilityMap, bookedMinutesMap, schedulingEnabled],
  );

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
  const calendarStats = useMemo(() => {
    const bookingCount = data?.blocks?.length || 0;
    const warningCount = data?.blocks?.filter((block) => (block.warnings ?? []).length > 0).length || 0;
    const activeTechs = technicians.filter((tech) => tech.id !== '__unassigned__').length;
    return [
      { label: 'Week range', value: `${days[0]?.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) || '-'} to ${days[6]?.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) || '-'}`, hint: 'Current planning window' },
      { label: 'Bookings', value: String(bookingCount), hint: warningCount ? `${warningCount} with warnings` : 'No schedule warnings' },
      { label: 'Technicians', value: String(activeTechs), hint: hasUnassigned ? 'Includes unassigned lane' : 'Assigned lanes only' },
    ];
  }, [data?.blocks, days, hasUnassigned, technicians]);

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
    const load = async () => {
      setLoading(true);
      setError('');
      setRequestId(undefined);
      setUndoState(null);
      setSuggestionsByBooking({});
      clearToast();
      setRescheduleError('');
      setRescheduleErrorRequestId(undefined);
      setHighlightedConflictIds([]);
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
  }, [weekStart, clearToast]);

  useEffect(() => {
    if (!schedulingEnabled) {
      setScheduleData(null);
      setScheduleError('');
      setScheduleLoading(false);
      return undefined;
    }
    let isActive = true;
    const load = async () => {
      setScheduleLoading(true);
      setScheduleError('');
      try {
        const from = weekStart.toISOString();
        const to = addDays(weekStart, 7).toISOString();
        const query = new URLSearchParams({ from, to });
        const result = await apiFetch(`/calendar/schedules?${query.toString()}`);
        if (isActive) {
          setScheduleData((result || null) as ScheduleResponse | null);
        }
      } catch (err: any) {
        if (isActive) {
          setScheduleError(err?.message || 'Failed to load schedules');
        }
      } finally {
        if (isActive) {
          setScheduleLoading(false);
        }
      }
    };
    load();
    return () => {
      isActive = false;
    };
  }, [schedulingEnabled, weekStart]);

  useEffect(() => {
    if (!data || !scrollRef.current) return;
    scrollRef.current.scrollTo({ top: Math.max(nowPosition - 120, 0) });
  }, [data, nowPosition]);

  useEffect(() => {
    if (!router.isReady) return;
    const dayParam = typeof router.query.day === 'string' ? router.query.day : undefined;
    const techParam = typeof router.query.techId === 'string' ? router.query.techId : undefined;
    if (!dayParam) return;
    const key = `${dayParam}|${techParam ?? 'ALL'}`;
    if (deepLinkRef.current === key) return;
    deepLinkRef.current = key;
    const parsed = new Date(dayParam);
    if (Number.isNaN(parsed.getTime())) return;
    const targetWeek = startOfWeekMonday(parsed);
    setWeekStart((prev) =>
      formatDateKey(prev) === formatDateKey(targetWeek) ? prev : targetWeek,
    );
    setSelectedTechId(techParam ?? 'ALL');
    setDeepLinkTarget({
      dayKey: formatDateKey(parsed),
      techId: techParam ?? 'ALL',
    });
  }, [router.isReady, router.query.day, router.query.techId]);

  useEffect(() => {
    if (!deepLinkTarget || !scrollRef.current) return;
    const container = scrollRef.current;
    requestAnimationFrame(() => {
      let minutes: number | null = null;
      const segmentKey = `${deepLinkTarget.techId}|${deepLinkTarget.dayKey}`;
      const segments = scheduleSegments.get(segmentKey) ?? [];
      if (segments.length) {
        minutes = segments[0].top / PIXELS_PER_MINUTE;
      }
      if (minutes === null && data) {
        const relevant = data.blocks.filter((block) => block.technician?.id === deepLinkTarget.techId);
        let earliest = Infinity;
        for (const block of relevant) {
          const start = new Date(block.startsAt);
          if (Number.isNaN(start.getTime())) continue;
          const minute = clampMinute(minutesFromGridStart(start));
          if (minute < earliest) earliest = minute;
        }
        if (earliest !== Infinity) {
          minutes = earliest;
        }
      }
      const targetMinutes = minutes ?? 0;
      container.scrollTo({
        top: Math.max(targetMinutes * PIXELS_PER_MINUTE - 40, 0),
        behavior: "smooth",
      });
      setDeepLinkTarget(null);
    });
  }, [deepLinkTarget, scheduleSegments, data]);

  useEffect(() => {
    if (!undoState) return;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    const remaining = Math.max(0, undoState.expiresAt - Date.now());
    if (remaining <= 0) {
      setUndoState(null);
      return;
    }
    undoTimerRef.current = setTimeout(() => {
      setUndoState(null);
      undoTimerRef.current = null;
    }, remaining);
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
    };
  }, [undoState]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const handleReschedule = async (
    bookingId: string,
    techId: string,
    newStart: Date,
    newEnd: Date,
    options?: { showSavedToast?: boolean; showErrorToast?: boolean },
  ) => {
    if (!data) return;
    const original = data.blocks.find((block) => block.id === bookingId);
    if (!original) return;
    const prevSnapshot: RescheduleSnapshot = {
      startsAt: original.startsAt,
      endsAt: original.endsAt,
      technicianId: original.technician?.id ?? null,
      technician: original.technician ?? null,
    };
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
      const nextSnapshot: RescheduleSnapshot = {
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        technicianId: normalized.technician?.id ?? null,
        technician: normalized.technician ?? null,
      };
      setUndoState({
        bookingId,
        prev: prevSnapshot,
        next: nextSnapshot,
        expiresAt: Date.now() + UNDO_DURATION_MS,
      });
      clearToast();
      const scheduleWarnings = normalized.warnings?.filter((warning) => warning.code !== 'OVERLAP');
      if (schedulingEnabled && scheduleWarnings?.length) {
        const message = scheduleWarnings
          .map((warning) => {
            const label = WARNING_LABELS[warning.code] || warning.code;
            const hasDay = 'day' in warning && typeof warning.day === 'string' && warning.day;
            return hasDay ? `${label} (${warning.day})` : label;
          })
          .join(', ');
        pushToast(`Warning: ${message}`, 'error');
      } else if (options?.showSavedToast) {
        pushToast('Saved', 'success');
      }
      setRescheduleError('');
      setRescheduleErrorRequestId(undefined);
    } catch (err: any) {
      setData((prev) =>
        prev ? { ...prev, blocks: prev.blocks.map((block) => (block.id === bookingId ? original : block)) } : prev,
      );
      if (err instanceof ApiError && err.statusCode === 409) {
        const payload = err.payload as { code?: string; conflicts?: unknown } | undefined;
        const conflictIds =
          payload?.code === 'CALENDAR_CONFLICT' && Array.isArray(payload.conflicts)
            ? payload.conflicts.filter((value): value is string => typeof value === 'string')
            : [];
        highlightConflicts(conflictIds);
        pushToast('Conflict — not saved', 'error', err.requestId);
        setRescheduleError('');
        setRescheduleErrorRequestId(undefined);
        return;
      }
      const message = err?.message || 'Failed to reschedule booking';
      const supportCode = err instanceof ApiError ? err.requestId : undefined;
      if (options?.showErrorToast) {
        pushToast(message, 'error', supportCode);
        setRescheduleError('');
        setRescheduleErrorRequestId(undefined);
      } else {
        setRescheduleError(message);
        setRescheduleErrorRequestId(supportCode);
      }
    }
  };

  const handleUndo = useCallback(async () => {
    if (!undoState) return;
    const { bookingId, prev } = undoState;
    try {
      const payload = {
        startsAt: prev.startsAt,
        endsAt: prev.endsAt,
        technicianId: prev.technicianId ?? null,
      };
      const response = (await apiFetch(`/calendar/bookings/${bookingId}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })) as { booking: any; warnings?: Array<{ id: string; startsAt: string; endsAt: string }> };
      const normalized = normalizeBooking({ ...response.booking, warnings: response.warnings ?? [] });
      setData((prevState) =>
        prevState
          ? {
              ...prevState,
              blocks: prevState.blocks.map((block) => (block.id === bookingId ? normalized : block)),
            }
          : prevState,
      );
      setUndoState(null);
      pushToast('Reverted', 'success');
    } catch (err: any) {
      pushToast(
        err?.message || 'Undo failed',
        'error',
        err instanceof ApiError ? err.requestId : undefined,
      );
    }
  }, [undoState, pushToast]);

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

  const handleDragStart = (event: DragEvent<HTMLDivElement>, bookingId: string) => {
    if (!dragEnabled) return;
    event.dataTransfer?.setData('text/plain', bookingId);
    event.dataTransfer?.setDragImage(new Image(), 0, 0);
    setDraggingBookingId(bookingId);
  };

  const handleDragEnd = () => {
    setDraggingBookingId(null);
  };

  const isSuggestEligible = useCallback((booking: CalendarBlock) => {
    if (!schedulingEnabled) return false;
    if (!booking.technician?.id) return true;
    return (booking.warnings ?? []).some((warning) => SCHEDULE_WARNING_CODES.includes(warning.code));
  }, [schedulingEnabled]);

  const requestSuggestions = useCallback(
    async (bookingId: string): Promise<SuggestedSlot[]> => {
      setSuggestionsByBooking((prev) => ({
        ...prev,
        [bookingId]: {
          ...(prev[bookingId] || { open: true }),
          open: true,
          loading: true,
          error: '',
          supportCode: undefined,
        },
      }));
      try {
        const query = new URLSearchParams({
          bookingId,
          windowDays: '7',
          limit: '3',
        });
        const response = (await apiFetch(`/calendar/suggest?${query.toString()}`)) as SuggestResponse;
        const suggestions = Array.isArray(response?.suggestions) ? response.suggestions : [];
        setSuggestionsByBooking((prev) => ({
          ...prev,
          [bookingId]: {
            ...(prev[bookingId] || { open: true }),
            open: true,
            loading: false,
            suggestions,
            error: '',
            supportCode: undefined,
          },
        }));
        return suggestions;
      } catch (err: any) {
        const message = err?.message || 'Failed to load suggestions';
        const supportCode = err instanceof ApiError ? err.requestId : undefined;
        setSuggestionsByBooking((prev) => ({
          ...prev,
          [bookingId]: {
            ...(prev[bookingId] || { open: true }),
            open: true,
            loading: false,
            error: message,
            supportCode,
          },
        }));
        pushToast(message, 'error', supportCode);
        return [];
      }
    },
    [pushToast],
  );

  const handleSuggestionToggle = useCallback(
    (bookingId: string) => {
      const current = suggestionsByBooking[bookingId];
      const nextOpen = !(current?.open ?? false);
      setSuggestionsByBooking((prev) => ({
        ...prev,
        [bookingId]: {
          ...(prev[bookingId] || { open: true, loading: false }),
          open: nextOpen,
        },
      }));
      if (nextOpen && !current?.loading && !current?.suggestions) {
        requestSuggestions(bookingId);
      }
    },
    [requestSuggestions, suggestionsByBooking],
  );

  const handleApplyBest = async (booking: CalendarBlock) => {
    if (!schedulingEnabled || !isSuggestEligible(booking)) return;
    const bookingId = booking.id;
    setApplyingBestBookingId(bookingId);
    try {
      let suggestions = suggestionsByBooking[bookingId]?.suggestions ?? [];
      if (!suggestions.length) {
        suggestions = await requestSuggestions(bookingId);
      }
      if (!suggestions.length) {
        pushToast('No suggested slots found', 'error');
        return;
      }
      const best = suggestions[0];
      await handleReschedule(
        bookingId,
        best.technicianId,
        new Date(best.startsAt),
        new Date(best.endsAt),
        { showSavedToast: true, showErrorToast: true },
      );
    } finally {
      setApplyingBestBookingId((prev) => (prev === bookingId ? null : prev));
    }
  };

  const handleBookingClick = useCallback(
    (booking: CalendarBlock) => {
      if (isSuggestEligible(booking)) {
        handleSuggestionToggle(booking.id);
        return;
      }
      router.push(`/dashboard/bookings/${booking.id}`);
    },
    [handleSuggestionToggle, isSuggestEligible, router],
  );

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
    <>
      <DashboardShell>
        <div className="operator-stack">
          <OperatorPageHeader
            eyebrow="Scheduling"
            title="Calendar"
            subtitle="Weekly technician lanes with drag rescheduling, schedule overlays, and conflict visibility kept in one operational view."
            actions={[
              { label: 'Bookings', href: '/dashboard/bookings', variant: 'secondary' },
              { label: 'Current week', onClick: () => setWeekStart(startOfWeekMonday(new Date())) },
            ]}
            shortcuts={['Drag bookings to reschedule', 'Filter by technician, location, or status']}
            stats={calendarStats}
          />

          <div className="card operator-section">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Weekly planner</h2>
                <p className="operator-section__subtitle">Week view with technician lanes from 08:00 to 18:00.</p>
              </div>
              <div className="operator-inline-actions">
                <button className="button secondary operator-compact-button" type="button" onClick={() => setWeekStart((prev) => addDays(prev, -7))}>Prev week</button>
                <button className="button secondary operator-compact-button" type="button" onClick={() => setWeekStart(startOfWeekMonday(new Date()))}>Current week</button>
                <button className="button secondary operator-compact-button" type="button" onClick={() => setWeekStart((prev) => addDays(prev, 7))}>Next week</button>
                <Link className="button secondary operator-compact-button" href="/dashboard/bookings">
                  Booking queue
                </Link>
              </div>
            </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
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
        {schedulingEnabled && scheduleLoading ? (
          <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>Loading schedules…</p>
        ) : null}
        {schedulingEnabled && scheduleError ? (
          <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>Schedule overlay: {scheduleError}</p>
        ) : null}
        {toastState ? (
          <div
              className="card"
              style={{
                marginTop: 12,
                padding: 12,
                background: toastState.type === 'error' ? '#fef2f2' : '#dcfce7',
                borderColor: toastState.type === 'error' ? '#f87171' : '#22c55e',
                color: toastState.type === 'error' ? '#991b1b' : '#14532d',
              }}
            >
              <div style={{ fontWeight: 600 }}>{toastState.message}</div>
              {toastState.supportCode ? (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Support code: <code>{toastState.supportCode}</code>
                </div>
              ) : null}
            </div>
          ) : null}
          {undoState ? (
            <div
              className="card"
              style={{
                marginTop: 12,
                padding: 12,
                borderColor: '#4ade80',
                background: '#ecfccb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div>
                <strong style={{ color: '#166534' }}>Saved</strong>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                  Undo available for 10 seconds
                </p>
              </div>
              <button className="button secondary" type="button" onClick={handleUndo} style={{ height: 34 }}>
                Undo
              </button>
            </div>
          ) : null}
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
                          const utilization = getUtilization(tech.id, dayKey);
                          const workingSegments = schedulingEnabled
                            ? getScheduleSegmentsFor(tech.id, dayKey)
                            : [];

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
                              {utilization ? (
                                <div
                                  style={{
                                    position: 'absolute',
                                    top: 6,
                                    right: 6,
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                    fontSize: 10,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    background: UTILIZATION_STATUS_STYLES[utilization.status].bg,
                                    color: UTILIZATION_STATUS_STYLES[utilization.status].text,
                                    zIndex: 4,
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <span>
                                    {formatHours(utilization.minutesBooked)} / {formatHours(utilization.minutesAvailable)} ({utilization.percent}%)
                                  </span>
                                  <strong style={{ fontSize: 10 }}>{utilization.status}</strong>
                                </div>
                              ) : null}
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

                              {workingSegments.map((segment, index) => (
                                <div
                                  key={`${tech.id}-${dayKey}-segment-${index}`}
                                  style={{
                                    position: 'absolute',
                                    top: segment.top,
                                    left: 6,
                                    right: 6,
                                    height: segment.height,
                                    background: 'rgba(34, 197, 94, 0.18)',
                                    borderRadius: 8,
                                    pointerEvents: 'none',
                                    zIndex: 1,
                                  }}
                                />
                              ))}
                              {getExceptionSegmentsFor(tech.id, dayKey).map((segment, index) => (
                                <div
                                  key={`${tech.id}-${dayKey}-exception-${index}`}
                                  style={{
                                    position: 'absolute',
                                    top: segment.top,
                                    left: 4,
                                    right: 4,
                                    height: segment.height,
                                    background: 'rgba(248, 113, 113, 0.35)',
                                    borderRadius: 8,
                                    pointerEvents: 'none',
                                    zIndex: 2,
                                  }}
                                />
                              ))}

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
                                const scheduleWarnings = entry.booking.warnings?.filter((warning) => warning.code !== 'OVERLAP') ?? [];
                                const hasTimeOffWarning = entry.booking.warnings?.some((warning) => warning.code === 'TIME_OFF') ?? false;
                                const isConflictHighlight = highlightedConflictIds.includes(entry.booking.id);
                                const suggestEligible = isSuggestEligible(entry.booking);
                                const suggestState = suggestionsByBooking[entry.booking.id];
                                const applyingBest = applyingBestBookingId === entry.booking.id;
                                const conflictStyles = isConflictHighlight
                                  ? {
                                      borderColor: '#dc2626',
                                      boxShadow: '0 0 0 5px rgba(220, 38, 38, 0.35)',
                                        animation: 'conflictPulse 1.2s ease-in-out infinite',
                                      }
                                    : {};

                                  return (
                                    <div
                                      key={entry.booking.id}
                                      draggable={dragEnabled}
                                      onDragStart={(event) => handleDragStart(event, entry.booking.id)}
                                      onDragEnd={handleDragEnd}
                                      onClick={() => handleBookingClick(entry.booking)}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                          event.preventDefault();
                                          handleBookingClick(entry.booking);
                                        }
                                      }}
                                      title={`${getBookingTitle(entry.booking)} (${entry.booking.status})`}
                                      data-calendar-booking={entry.booking.id}
                                      role="button"
                                      tabIndex={0}
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
                                        ...conflictStyles,
                                        transition: 'border-color 0.2s ease, box-shadow 0.3s ease',
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
                                      {hasTimeOffWarning ? (
                                        <div
                                          style={{
                                            marginTop: 4,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            fontSize: 10,
                                            fontWeight: 600,
                                            padding: '0 6px',
                                            borderRadius: 999,
                                            background: '#fee2e2',
                                            color: '#b91c1c',
                                          }}
                                        >
                                          Time off
                                        </div>
                                      ) : null}
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
                                    {scheduleWarnings.length ? (
                                      <div
                                        style={{
                                          marginTop: 4,
                                          display: 'flex',
                                          flexWrap: 'wrap',
                                          gap: 4,
                                        }}
                                      >
                                        {scheduleWarnings.map((warning) => {
                                          const hasDay = 'day' in warning && typeof warning.day === 'string' && warning.day;
                                          const label = WARNING_LABELS[warning.code] ?? warning.code;
                                          return (
                                            <span
                                              key={`${warning.code}-${hasDay ? warning.day : ''}`}
                                              style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 4,
                                                fontSize: 10,
                                                fontWeight: 600,
                                                padding: '0 6px',
                                                borderRadius: 999,
                                                background: '#fef3c7',
                                                color: '#92400e',
                                              }}
                                            >
                                              {label}
                                              {hasDay ? ` (${warning.day})` : ''}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    ) : null}
                                      {suggestEligible ? (
                                        <div
                                          style={{
                                            marginTop: 6,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            flexWrap: 'wrap',
                                          }}
                                        >
                                          <button
                                            className="button secondary"
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              handleSuggestionToggle(entry.booking.id);
                                            }}
                                            style={{ height: 24, fontSize: 10, padding: '0 8px' }}
                                          >
                                            {suggestState?.open ? 'Hide' : 'Suggest'}
                                          </button>
                                          <button
                                            className="button primary"
                                            type="button"
                                            disabled={Boolean(suggestState?.loading) || applyingBest}
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              handleApplyBest(entry.booking);
                                            }}
                                            style={{ height: 24, fontSize: 10, padding: '0 8px' }}
                                          >
                                            Apply best
                                          </button>
                                          {suggestState?.loading && !applyingBest ? (
                                            <Skeleton className="h-3 w-14" />
                                          ) : null}
                                          {applyingBest ? (
                                            <span className="muted" style={{ fontSize: 10 }}>Applying…</span>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    {suggestEligible && suggestState?.open ? (
                                      <div
                                        style={{
                                          marginTop: 6,
                                          padding: 6,
                                          borderRadius: 8,
                                          border: '1px solid rgba(148, 163, 184, 0.35)',
                                          background: 'rgba(248, 250, 252, 0.95)',
                                          display: 'grid',
                                          gap: 6,
                                        }}
                                        onClick={(event) => event.stopPropagation()}
                                      >
                                        <div
                                          style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.04em',
                                            color: '#475569',
                                          }}
                                        >
                                          Suggested Slots
                                        </div>
                                        {suggestState?.error ? (
                                          <div style={{ fontSize: 11, color: '#b91c1c' }}>
                                            {suggestState.error}
                                            {suggestState.supportCode ? (
                                              <span style={{ marginLeft: 6 }}>
                                                <span className="muted">Support:</span>{' '}
                                                <code>{suggestState.supportCode}</code>
                                              </span>
                                            ) : null}
                                          </div>
                                        ) : null}
                                        {!suggestState?.loading && !suggestState?.error && !(suggestState?.suggestions?.length) ? (
                                          <div className="muted" style={{ fontSize: 11 }}>
                                            No suggestions in the next 7 days.
                                          </div>
                                        ) : null}
                                        {(suggestState?.suggestions || []).slice(0, 3).map((suggestion) => (
                                          <div
                                            key={`${suggestion.technicianId}-${suggestion.startsAt}`}
                                            style={{
                                              display: 'flex',
                                              alignItems: 'flex-start',
                                              justifyContent: 'space-between',
                                              gap: 6,
                                              flexWrap: 'wrap',
                                            }}
                                          >
                                            <div style={{ fontSize: 11, flex: 1, minWidth: 0 }}>
                                              {formatSuggestedSlotLabel(suggestion.startsAt, suggestion.technicianName)}
                                              <SuggestedSlotReasons reasons={suggestion.reasons} />
                                            </div>
                                            <button
                                              className="button secondary"
                                              type="button"
                                              onClick={() =>
                                                handleReschedule(
                                                  entry.booking.id,
                                                  suggestion.technicianId,
                                                  new Date(suggestion.startsAt),
                                                  new Date(suggestion.endsAt),
                                                  { showSavedToast: true, showErrorToast: true },
                                                )
                                              }
                                              style={{ height: 24, fontSize: 10, padding: '0 8px' }}
                                            >
                                              Apply
                                            </button>
                                          </div>
                                        ))}
                                      </div>
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
                                    </div>
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
        </div>
      </DashboardShell>
      <style jsx global>{`
        @keyframes conflictPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.45);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 0 6px rgba(220, 38, 38, 0);
            transform: scale(1.01) translateY(-1px);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(220, 38, 38, 0);
            transform: scale(1);
          }
        }
      `}</style>
    </>
  );
}
