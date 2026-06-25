import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardShell } from '../../../components/dashboard-shell';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ApiError, apiFetch } from '../../../lib/api';
import { SuggestedSlotReasons } from '../../../components/SuggestedSlotReasons';
import { ErrorState } from '../../../components/states/ErrorState';
import { formatSuggestedSlotLabel, type SuggestedSlot } from '../../../lib/suggested-slot';
import { isBookingProV1Enabled, isSchedulingIntelligenceV1Enabled } from '../../../lib/feature-flags';

const SUGGESTION_WINDOW_DAYS = 7;
const SUGGESTION_LIMIT = 3;

function normalizeDraftDuration(value?: number) {
  const numeric = Number.isFinite(value ?? NaN) ? Number(value) : 60;
  const clamped = Math.min(480, Math.max(15, numeric));
  const increment = Math.ceil(clamped / 15) * 15;
  return Math.max(15, Math.min(480, increment));
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function BookingProCalendarPage() {
  const router = useRouter();
  const enabled = isBookingProV1Enabled();
  const [bookings, setBookings] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [locationId, setLocationId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [staffUserId, setStaffUserId] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [error, setError] = useState('');
  const schedulingEnabled = isSchedulingIntelligenceV1Enabled();
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [draftSuggestions, setDraftSuggestions] = useState<SuggestedSlot[]>([]);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [draftSupportCode, setDraftSupportCode] = useState<string | undefined>(undefined);
  const [draftAppliedMessage, setDraftAppliedMessage] = useState('');
  const [draftToast, setDraftToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    apiFetch('/bookings').then((data) => setBookings(Array.isArray(data) ? data : [])).catch(() => setBookings([]));
    apiFetch('/booking/services').then((data) => setServices(Array.isArray(data) ? data : [])).catch(() => setServices([]));
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !serviceId || !date) return;
    const q = new URLSearchParams({ serviceId, date });
    if (locationId) q.set('locationId', locationId);
    if (staffUserId) q.set('staffUserId', staffUserId);
    apiFetch(`/booking/availability?${q.toString()}`)
      .then((data) => setSlots(Array.isArray(data) ? data : []))
      .catch(() => setSlots([]));
  }, [enabled, serviceId, date, locationId, staffUserId]);

  useEffect(() => {
    if (!router.isReady) return;
    if (typeof router.query.customerName === 'string') setCustomerName(router.query.customerName);
    if (typeof router.query.customerEmail === 'string') setCustomerEmail(router.query.customerEmail);
    if (typeof router.query.customerPhone === 'string') setCustomerPhone(router.query.customerPhone);
  }, [router.isReady, router.query.customerName, router.query.customerEmail, router.query.customerPhone]);

  async function createBooking() {
    if (!selectedSlot || !serviceId) return;
    setError('');
    try {
      await apiFetch('/booking', {
        method: 'POST',
        body: JSON.stringify({
          serviceId,
          startsAt: selectedSlot,
          locationId: locationId || undefined,
          staffUserId: staffUserId || undefined,
          customerName,
          customerEmail,
          customerPhone: customerPhone || undefined,
        }),
      });
      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
      setSelectedSlot('');
      const data = await apiFetch('/bookings');
      setBookings(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to create booking');
    }
  }

  const selectedService = services.find((service) => service.id === serviceId);
  const selectedServiceDuration = selectedService?.durationMinutes;

  useEffect(() => {
    setDraftSuggestions([]);
    setDraftError('');
    setDraftSupportCode(undefined);
  }, [serviceId]);

  useEffect(() => {
    if (!draftAppliedMessage) return;
    const timer = setTimeout(() => setDraftAppliedMessage(''), 4000);
    return () => clearTimeout(timer);
  }, [draftAppliedMessage]);

  useEffect(() => {
    if (!draftToast) return;
    const timer = setTimeout(() => setDraftToast(null), 3000);
    return () => clearTimeout(timer);
  }, [draftToast]);

  const pushDraftToast = (message: string, type: 'success' | 'error') => {
    setDraftToast({ message, type });
  };

  const loadDraftSuggestions = useCallback(async () => {
    if (!schedulingEnabled) return [];
    if (!serviceId) {
      setDraftError('Select a service to load suggested slots.');
      return [];
    }
    setDraftLoading(true);
    setDraftError('');
    setDraftSupportCode(undefined);
    try {
      const durationMinutes = normalizeDraftDuration(selectedServiceDuration ?? 60);
      const query = new URLSearchParams({
        durationMinutes: String(durationMinutes),
        windowDays: String(SUGGESTION_WINDOW_DAYS),
        limit: String(SUGGESTION_LIMIT),
      });
      const response = (await apiFetch(`/calendar/suggest-draft?${query.toString()}`)) as {
        suggestions?: SuggestedSlot[];
      };
      const suggestions = Array.isArray(response?.suggestions) ? response.suggestions : [];
      setDraftSuggestions(suggestions);
      return suggestions;
    } catch (err: any) {
      const message = err?.message || 'Failed to load suggested slots';
      const supportCode = err instanceof ApiError ? err.requestId : undefined;
      setDraftError(message);
      setDraftSupportCode(supportCode);
      return [];
    } finally {
      setDraftLoading(false);
    }
  }, [schedulingEnabled, serviceId, selectedServiceDuration]);

  const applySuggestionToForm = (suggestion: SuggestedSlot) => {
    const start = new Date(suggestion.startsAt);
    setDate(toDateInputValue(start));
    setSelectedSlot(suggestion.startsAt);
    setStaffUserId(suggestion.technicianId);
    setDraftAppliedMessage(`Applied suggestion: ${formatSuggestedSlotLabel(
      suggestion.startsAt,
      suggestion.technicianName,
    )}`);
    pushDraftToast('Applied suggestion', 'success');
  };

  const handleToggleSuggestions = () => {
    const nextOpen = !suggestionsOpen;
    setSuggestionsOpen(nextOpen);
    if (
      nextOpen &&
      !draftSuggestions.length &&
      !draftLoading &&
      !draftError &&
      schedulingEnabled
    ) {
      void loadDraftSuggestions();
    }
  };

  const handleApplyBest = async () => {
    if (!schedulingEnabled) return;
    if (!serviceId) {
      setDraftError('Select a service to load suggested slots.');
      return;
    }
    setDraftAppliedMessage('');
    let suggestions = draftSuggestions;
    if (!suggestions.length) {
      suggestions = await loadDraftSuggestions();
    }
    if (!suggestions.length) {
      pushDraftToast('No suggested slots found', 'error');
      return;
    }
    applySuggestionToForm(suggestions[0]);
  };

  if (!enabled) {
    return <DashboardShell><div className="card"><h1>Booking Pro Calendar</h1><p className="muted">Feature is disabled.</p></div></DashboardShell>;
  }

  return (
    <DashboardShell>
      <div style={{ display: 'grid', gap: 16, maxWidth: 1180, margin: '0 auto', width: '100%' }} data-testid="booking-calendar-page">
      <div className="card" style={{ marginBottom: 0, overflow: 'clip' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0 }}>Location scheduling</p>
            <h1 style={{ margin: '4px 0 0' }}>Booking calendar</h1>
          </div>
          <span className="badge">Week/day ready</span>
        </div>
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', alignItems: 'end' }}>
          <label style={{ minWidth: 0 }}>Service
            <select className="input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">Select service</option>
              {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
            </select>
          </label>
          <label style={{ minWidth: 0 }}>Location
            <input className="input" placeholder="Any location" value={locationId} onChange={(e) => setLocationId(e.target.value)} />
          </label>
          <label style={{ minWidth: 0 }}>Team member
            <input className="input" placeholder="Auto-assign or paste user ID" value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)} />
          </label>
          <label style={{ minWidth: 0 }}>Date
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label style={{ minWidth: 0 }}>Available slots
            <select className="input" value={selectedSlot} onChange={(e) => setSelectedSlot(e.target.value)}>
              <option value="">Select slot</option>
              {slots.map((slot: any) => <option key={slot.startsAt} value={slot.startsAt}>{new Date(slot.startsAt).toLocaleString()}</option>)}
            </select>
          </label>
        </div>

        {schedulingEnabled ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 8,
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(248, 250, 252, 0.9)',
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div>
                <strong>Suggested slots</strong>
                <p className="muted" style={{ margin: 0, fontSize: 11 }}>
                  Optional shortcuts—manual inputs stay primary.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="button secondary"
                  type="button"
                  onClick={handleToggleSuggestions}
                  style={{ height: 28, fontSize: 11, padding: '0 10px' }}
                >
                  {suggestionsOpen ? 'Hide' : 'Show'} suggestions
                </button>
                <button
                  className="button primary"
                  type="button"
                  onClick={handleApplyBest}
                  disabled={!serviceId || draftLoading || !schedulingEnabled}
                  style={{ height: 28, fontSize: 11, padding: '0 10px' }}
                >
                  {draftLoading ? 'Loading…' : 'Apply best'}
                </button>
              </div>
            </div>
            {draftToast ? (
              <div
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: draftToast.type === 'error' ? '#991b1b' : '#14532d',
                  background: draftToast.type === 'error' ? '#fef2f2' : '#dcfce7',
                }}
              >
                {draftToast.message}
              </div>
            ) : null}
            {draftAppliedMessage ? (
              <p className="muted" style={{ margin: 0, fontSize: 11 }}>
                {draftAppliedMessage}
              </p>
            ) : null}
            {suggestionsOpen ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {draftLoading ? (
                  <div className="space-y-2" style={{ margin: 0 }}>
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : draftError ? (
                  <ErrorState
                    title="Could not load suggested slots"
                    description={draftError}
                    requestId={draftSupportCode}
                  />
                ) : !serviceId ? (
                  <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                    Select a service to load suggested slots.
                  </p>
                ) : !draftSuggestions.length ? (
                  <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                    No suggestions in the next {SUGGESTION_WINDOW_DAYS} days.
                  </p>
                ) : (
                  draftSuggestions.slice(0, SUGGESTION_LIMIT).map((suggestion) => (
                    <div
                      key={`${suggestion.technicianId}-${suggestion.startsAt}`}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ fontSize: 12, flex: 1, minWidth: 0 }}>
                        {formatSuggestedSlotLabel(suggestion.startsAt, suggestion.technicianName)}
                        <SuggestedSlotReasons reasons={suggestion.reasons} />
                      </div>
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => applySuggestionToForm(suggestion)}
                        style={{ height: 28, fontSize: 11, padding: '0 10px' }}
                      >
                        Apply
                      </button>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 14 }}>
          <label style={{ minWidth: 0 }}>Customer name
            <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </label>
          <label style={{ minWidth: 0 }}>Customer email
            <input className="input" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} type="email" />
          </label>
          <label style={{ minWidth: 0 }}>Customer phone
            <input className="input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </label>
        </div>

        <button className="button" type="button" onClick={createBooking} style={{ marginTop: 14 }}>Create booking</button>
      </div>

      <div className="card" style={{ overflow: 'clip' }}>
        <h3 style={{ marginTop: 0 }}>Upcoming bookings</h3>
        <div className="list">
          {bookings.map((booking) => (
            <div key={booking.id} className="integration-card" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <strong>{new Date(booking.startsAt).toLocaleString()}</strong>
              <span>{booking.customerName || booking.customerEmail || 'Customer'}</span>
            </div>
          ))}
          {bookings.length === 0 ? <p className="muted">No bookings yet.</p> : null}
        </div>
      </div>
      </div>
    </DashboardShell>
  );
}
