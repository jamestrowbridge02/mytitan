import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardShell } from '../../../components/dashboard-shell';
import { ErrorState } from '../../../components/states/ErrorState';
import { LoadingState } from '../../../components/states/LoadingState';
import { ApiError, apiFetch } from '../../../lib/api';
import { isSchedulingIntelligenceV1Enabled } from '../../../lib/feature-flags';

type WeeklyScheduleSlot = {
  start?: string | null;
  end?: string | null;
};

type WeeklyScheduleJson = Record<string, WeeklyScheduleSlot[]>;

type TechSchedule = {
  technicianId: string;
  timezone?: string | null;
  weeklyJson: WeeklyScheduleJson;
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
  technicians: Array<{ id: string; name?: string | null; email?: string | null }>;
  schedules: TechSchedule[];
  availabilityMinutesByDay: Record<string, Record<string, number>>;
  exceptions: ScheduleException[];
};

type ScheduleUpdateResponse = {
  technicianId: string;
  timezone: string | null;
  weeklyJson: WeeklyScheduleJson;
};

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const WEEKDAY_LABELS: Record<(typeof WEEKDAY_KEYS)[number], string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

function startOfWeekMonday(input: Date) {
  const date = new Date(input);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

const DEFAULT_SLOT: WeeklyScheduleSlot = { start: '08:00', end: '09:00' };
const EXCEPTION_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export default function ScheduleSettingsPage() {
  const router = useRouter();
  const enabled = isSchedulingIntelligenceV1Enabled();
  const weekStart = useMemo(() => startOfWeekMonday(new Date()), []);
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const [scheduleData, setScheduleData] = useState<ScheduleResponse | null>(null);
  const [weeklyJsonByTech, setWeeklyJsonByTech] = useState<Record<string, WeeklyScheduleJson>>({});
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveRequestId, setSaveRequestId] = useState<string | undefined>(undefined);
  const [successMessage, setSuccessMessage] = useState('');
  const defaultExceptionForm = useMemo(() => buildExceptionFormDefaults(), []);
  const [exceptionForm, setExceptionForm] = useState(defaultExceptionForm);
  const [exceptionSaving, setExceptionSaving] = useState(false);
  const [exceptionError, setExceptionError] = useState('');
  const [exceptionRequestId, setExceptionRequestId] = useState<string | undefined>(undefined);
  const [deletingExceptionId, setDeletingExceptionId] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSuccess = useCallback(() => {
    setSuccessMessage('Saved');
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }
    successTimerRef.current = setTimeout(() => {
      setSuccessMessage('');
    }, 2500);
  }, []);

  useEffect(() => {
    if (!enabled) {
      router.replace('/dashboard/settings');
    }
  }, [enabled, router]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  const loadSchedules = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    setRequestId(undefined);
    try {
      const query = new URLSearchParams({
        from: weekStart.toISOString(),
        to: weekEnd.toISOString(),
      });
      const response = (await apiFetch(`/calendar/schedules?${query.toString()}`)) as ScheduleResponse;
      if (!isMountedRef.current) return;
      setScheduleData(response);
      const map: Record<string, WeeklyScheduleJson> = {};
      for (const schedule of response.schedules) {
        map[schedule.technicianId] = schedule.weeklyJson ?? {};
      }
      setWeeklyJsonByTech(map);
      setSelectedTechId((prev) => prev || response.technicians[0]?.id || '');
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setError(err?.message || 'Failed to load schedules');
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, weekEnd, weekStart]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const activeTech = useMemo(() => {
    if (!scheduleData || !selectedTechId) return null;
    return scheduleData.technicians.find((tech) => tech.id === selectedTechId) ?? null;
  }, [scheduleData, selectedTechId]);

  const currentWeeklyJson = weeklyJsonByTech[selectedTechId] ?? {};
  const formattedSlots = currentWeeklyJson;

  const updateDaySlots = useCallback(
    (day: (typeof WEEKDAY_KEYS)[number], transformer: (slots: WeeklyScheduleSlot[]) => WeeklyScheduleSlot[]) => {
      if (!selectedTechId) return;
      setWeeklyJsonByTech((prev) => {
        const techSlots = prev[selectedTechId] ?? {};
        const currentSlots = techSlots[day] ?? [];
        const updatedSlots = transformer(currentSlots);
        return {
          ...prev,
          [selectedTechId]: {
            ...techSlots,
            [day]: updatedSlots,
          },
        };
      });
    },
    [selectedTechId],
  );

  const handleDayToggle = useCallback(
    (day: (typeof WEEKDAY_KEYS)[number]) => {
      const slots = formattedSlots[day] ?? [];
      if (slots.length) {
        updateDaySlots(day, () => []);
      } else {
        updateDaySlots(day, () => [{ ...DEFAULT_SLOT }]);
      }
    },
    [formattedSlots, updateDaySlots],
  );

  const handleAddSlot = useCallback(
    (day: (typeof WEEKDAY_KEYS)[number]) => {
      const slots = formattedSlots[day] ?? [];
      if (slots.length >= 3) return;
      updateDaySlots(day, (current) => [...current, { ...DEFAULT_SLOT }]);
    },
    [formattedSlots, updateDaySlots],
  );

  const handleRemoveSlot = useCallback(
    (day: (typeof WEEKDAY_KEYS)[number], index: number) => {
      updateDaySlots(day, (current) => current.filter((_, slotIndex) => slotIndex !== index));
    },
    [updateDaySlots],
  );

  const handleSlotChange = useCallback(
    (
      day: (typeof WEEKDAY_KEYS)[number],
      index: number,
      field: 'start' | 'end',
      value: string,
    ) => {
      updateDaySlots(day, (current) =>
        current.map((slot, slotIndex) => (slotIndex === index ? { ...slot, [field]: value } : slot)),
      );
    },
    [updateDaySlots],
  );

  const handleCopyDay = useCallback(
    (day: (typeof WEEKDAY_KEYS)[number]) => {
      if (!selectedTechId) return;
      const source = formattedSlots[day] ?? [];
      if (!source.length) return;
      setWeeklyJsonByTech((prev) => {
        const techSlots = prev[selectedTechId] ?? {};
        const copied = source.map((slot) => ({ ...slot }));
        const next: Record<string, WeeklyScheduleSlot[]> = {};
        for (const key of WEEKDAY_KEYS) {
          next[key] = copied.map((slot) => ({ ...slot }));
        }
        return {
          ...prev,
          [selectedTechId]: {
            ...techSlots,
            ...next,
          },
        };
      });
    },
    [formattedSlots, selectedTechId],
  );

  const upcomingExceptions = useMemo(() => {
    if (!scheduleData || !selectedTechId) return [];
    const now = new Date();
    const horizon = new Date(now.getTime() + EXCEPTION_WINDOW_DAYS * MS_PER_DAY);
    return (scheduleData.exceptions || [])
      .filter((exception) => exception.technicianId === selectedTechId)
      .filter((exception) => {
        const start = new Date(exception.startsAt);
        return !Number.isNaN(start.getTime()) && start >= now && start <= horizon;
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [scheduleData, selectedTechId]);

  const handleExceptionFieldChange = useCallback(
    (field: 'startsAt' | 'endsAt', value: string) => {
      setExceptionForm((prev) => {
        const next = { ...prev, [field]: value };
        if (prev.allDay && field === 'startsAt') {
          const datePart = value.split('T')[0];
          if (datePart) {
            next.startsAt = `${datePart}T00:00`;
            next.endsAt = `${datePart}T23:59`;
          }
        }
        return next;
      });
    },
    [],
  );

  const handleAllDayToggle = useCallback((checked: boolean) => {
    setExceptionForm((prev) => {
      const next = { ...prev, allDay: checked };
      if (checked) {
        const datePart = prev.startsAt.split('T')[0] || toLocalDateString(new Date());
        next.startsAt = `${datePart}T00:00`;
        next.endsAt = `${datePart}T23:59`;
      }
      return next;
    });
  }, []);

  const handleExceptionSubmit = useCallback(async () => {
    if (!selectedTechId) return;
    setExceptionSaving(true);
    setExceptionError('');
    setExceptionRequestId(undefined);
    setSuccessMessage('');
    try {
      const start = new Date(exceptionForm.startsAt);
      const end = new Date(exceptionForm.endsAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error('Invalid dates provided.');
      }
      const payload = {
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        allDay: exceptionForm.allDay,
        reason: exceptionForm.reason.trim() || undefined,
      };
      await apiFetch(`/calendar/schedules/${selectedTechId}/exceptions`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!isMountedRef.current) return;
      await loadSchedules();
      if (!isMountedRef.current) return;
      setExceptionForm({ ...defaultExceptionForm });
      showSuccess();
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setExceptionError(err?.message || 'Failed to save exception');
      setExceptionRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      if (isMountedRef.current) {
        setExceptionSaving(false);
      }
    }
  }, [selectedTechId, exceptionForm, loadSchedules, defaultExceptionForm, showSuccess]);

  const handleDeleteException = useCallback(
    async (exceptionId: string) => {
      if (!exceptionId) return;
      setDeletingExceptionId(exceptionId);
      setExceptionError('');
      setExceptionRequestId(undefined);
      try {
        await apiFetch(`/calendar/exceptions/${exceptionId}`, {
          method: 'DELETE',
        });
        if (!isMountedRef.current) return;
        await loadSchedules();
        if (!isMountedRef.current) return;
        showSuccess();
      } catch (err: any) {
        if (!isMountedRef.current) return;
        setExceptionError(err?.message || 'Failed to delete exception');
        setExceptionRequestId(err instanceof ApiError ? err.requestId : undefined);
      } finally {
        if (isMountedRef.current) {
          setDeletingExceptionId(null);
        }
      }
    },
    [loadSchedules, showSuccess],
  );

  const handleSave = useCallback(async () => {
    if (!selectedTechId) return;
    setSaving(true);
    setSaveError('');
    setSaveRequestId(undefined);
    setSuccessMessage('');
    try {
      const payload = {
        weeklyJson: weeklyJsonByTech[selectedTechId] ?? {},
      };
      const response = (await apiFetch(`/calendar/schedules/${selectedTechId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })) as ScheduleUpdateResponse;
      if (!isMountedRef.current) return;
      setWeeklyJsonByTech((prev) => ({
        ...prev,
        [selectedTechId]: response.weeklyJson ?? {},
      }));
      showSuccess();
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setSaveError(err?.message || 'Failed to save schedules');
      setSaveRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  }, [selectedTechId, weeklyJsonByTech, showSuccess]);

  if (!enabled) {
    return (
      <DashboardShell>
        <LoadingState title="Redirecting" description="Schedule editor is unavailable." />
      </DashboardShell>
  );
}

function toLocalDateTimeString(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function toLocalDateString(date: Date) {
  return toLocalDateTimeString(date).slice(0, 10);
}

function buildExceptionFormDefaults() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 2);
  return {
    startsAt: toLocalDateTimeString(start),
    endsAt: toLocalDateTimeString(end),
    allDay: false,
    reason: '',
  };
}

  if (loading && !scheduleData) {
    return (
      <DashboardShell>
        <LoadingState title="Loading schedules" description="Fetching technician availability." />
      </DashboardShell>
    );
  }

  if (error && !scheduleData) {
    return (
      <DashboardShell>
        <ErrorState
          title="Could not load schedules"
          description={error}
          requestId={requestId}
          primaryAction={{ label: 'Retry', onClick: loadSchedules }}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1>Technician schedules</h1>
            <p className="muted" style={{ margin: 0 }}>
              Define working hours for each technician. Maximum of three slots per day.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="button primary"
              type="button"
              onClick={handleSave}
              disabled={!selectedTechId || saving}
              style={{ minWidth: 120 }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
        {saveError ? (
          <div
            className="card"
            style={{
              borderColor: '#f87171',
              background: '#fef2f2',
              padding: 12,
            }}
          >
            <strong style={{ color: '#b91c1c' }}>Error saving schedule</strong>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {saveError}
            </p>
            {saveRequestId ? (
              <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
                Support code: <code>{saveRequestId}</code>
              </p>
            ) : null}
          </div>
        ) : null}
        {successMessage ? (
          <div
            className="card"
            style={{
              borderColor: '#22c55e',
              background: '#dcfce7',
              padding: 12,
            }}
          >
            <strong style={{ color: '#166534' }}>{successMessage}</strong>
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220, maxWidth: 260 }}>
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(148, 163, 184, 0.2)' }}>
                <strong>Technicians</strong>
              </div>
              {scheduleData?.technicians?.map((tech) => (
                <button
                  key={tech.id}
                  type="button"
                  onClick={() => setSelectedTechId(tech.id)}
                  className="button secondary"
                  style={{
                    borderRadius: 0,
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: tech.id === selectedTechId ? '#e0f2fe' : 'transparent',
                    borderColor: tech.id === selectedTechId ? '#38bdf8' : 'rgba(148, 163, 184, 0.6)',
                  }}
                >
                  <span>{tech.name || tech.email || tech.id}</span>
                  {tech.id === selectedTechId ? <span style={{ fontSize: 10, fontWeight: 600 }}>Edit</span> : null}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <strong>{activeTech?.name || activeTech?.email || 'Select a technician'}</strong>
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                    Weekly schedule window: {weekStart.toLocaleDateString()} – {addDays(weekStart, 6).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={loadSchedules}
                    disabled={loading}
                    style={{ height: 34, fontSize: 12 }}
                  >
                    Refresh
                  </button>
                </div>
              </div>
              {WEEKDAY_KEYS.map((day) => {
                const slots = formattedSlots[day] ?? [];
                const active = slots.length > 0;
                return (
                  <div
                    key={day}
                    style={{
                      border: '1px solid rgba(148, 163, 184, 0.3)',
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 8,
                      }}
                    >
                      <div>
                        <strong>{WEEKDAY_LABELS[day]}</strong>
                        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                          {active ? `${slots.length} slot${slots.length === 1 ? '' : 's'}` : 'Disabled'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => handleDayToggle(day)}
                          style={{ height: 30, fontSize: 12 }}
                        >
                          {active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          className="button ghost"
                          onClick={() => handleCopyDay(day)}
                          disabled={!active}
                          style={{ height: 30, fontSize: 12 }}
                        >
                          Copy to all days
                        </button>
                      </div>
                    </div>
                    {active ? (
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {slots.map((slot, index) => (
                          <div
                            key={`${day}-${index}`}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                          >
                            <label style={{ fontSize: 12 }}>Start</label>
                            <input
                              type="time"
                              step="900"
                              value={slot.start ?? ''}
                              onChange={(event) => handleSlotChange(day, index, 'start', event.target.value)}
                              className="input"
                              style={{ maxWidth: 120 }}
                            />
                            <label style={{ fontSize: 12 }}>End</label>
                            <input
                              type="time"
                              step="900"
                              value={slot.end ?? ''}
                              onChange={(event) => handleSlotChange(day, index, 'end', event.target.value)}
                              className="input"
                              style={{ maxWidth: 120 }}
                            />
                            <button
                              type="button"
                              className="button ghost"
                              onClick={() => handleRemoveSlot(day, index)}
                              style={{ height: 28, fontSize: 11 }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        {slots.length < 3 ? (
                          <button
                            type="button"
                            className="button ghost"
                            onClick={() => handleAddSlot(day)}
                            style={{ width: 'fit-content', fontSize: 12 }}
                          >
                            Add another slot
                          </button>
                        ) : (
                          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                            Maximum of 3 slots per day.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ margin: 0 }}>Exceptions</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Upcoming time off / unavailable periods (next {EXCEPTION_WINDOW_DAYS} days).
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="button ghost"
              onClick={loadSchedules}
              disabled={loading}
              style={{ height: 34, fontSize: 12 }}
            >
              Refresh
            </button>
          </div>
        </div>
        {exceptionError ? (
          <div
            className="card"
            style={{
              borderColor: '#f87171',
              background: '#fef2f2',
              padding: 12,
            }}
          >
            <strong style={{ color: '#b91c1c' }}>Exception error</strong>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {exceptionError}
            </p>
            {exceptionRequestId ? (
              <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
                Support code: <code>{exceptionRequestId}</code>
              </p>
            ) : null}
          </div>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {upcomingExceptions.length ? (
            upcomingExceptions.map((exception) => (
              <div
                key={exception.id}
                style={{
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ maxWidth: 520 }}>
                  <div style={{ fontWeight: 600 }}>
                    {new Date(exception.startsAt).toLocaleString()} – {new Date(exception.endsAt).toLocaleString()}
                    {exception.allDay ? ' (All day)' : ''}
                  </div>
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                    {exception.reason || 'No reason provided'}
                  </p>
                </div>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => handleDeleteException(exception.id)}
                  disabled={Boolean(deletingExceptionId) && deletingExceptionId !== exception.id}
                  style={{ height: 28, fontSize: 11 }}
                >
                  {deletingExceptionId === exception.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            ))
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              No exceptions scheduled in the next {EXCEPTION_WINDOW_DAYS} days.
            </p>
          )}
        </div>
        <div
          style={{
            borderTop: '1px solid rgba(148, 163, 184, 0.3)',
            paddingTop: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
              Start
              <input
                type="datetime-local"
                value={exceptionForm.startsAt}
                onChange={(event) => handleExceptionFieldChange('startsAt', event.target.value)}
                className="input"
                disabled={!selectedTechId}
                style={{ minWidth: 200 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
              End
              <input
                type="datetime-local"
                value={exceptionForm.endsAt}
                onChange={(event) => handleExceptionFieldChange('endsAt', event.target.value)}
                className="input"
                disabled={!selectedTechId || exceptionForm.allDay}
                style={{ minWidth: 200 }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={exceptionForm.allDay}
                onChange={(event) => handleAllDayToggle(event.target.checked)}
                disabled={!selectedTechId}
              />
              All day
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
              Reason
              <input
                type="text"
                value={exceptionForm.reason}
                onChange={(event) => setExceptionForm((prev) => ({ ...prev, reason: event.target.value }))}
                className="input"
                disabled={!selectedTechId}
                style={{ minWidth: 260 }}
                maxLength={80}
                placeholder="Training, holiday, etc."
              />
            </label>
            <button
              type="button"
              className="button primary"
              onClick={handleExceptionSubmit}
              disabled={!selectedTechId || exceptionSaving}
              style={{ height: 34, minWidth: 140 }}
            >
              {exceptionSaving ? 'Saving…' : 'Save exception'}
            </button>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Exceptions must be between {EXCEPTION_WINDOW_DAYS} days from now and reason text up to 80 characters.
          </p>
        </div>
      </div>
    </div>
  </DashboardShell>
);
}
