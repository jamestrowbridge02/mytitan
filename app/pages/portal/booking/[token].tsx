import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { getApiBase } from '../../../lib/api';
import { isBookingProV1Enabled, isDemoPolishV1Enabled, isMarketplaceEnabled } from '../../../lib/feature-flags';

const API_BASE = getApiBase();

type Service = {
  id: string;
  name: string;
  description?: string | null;
  unitPrice?: string;
  durationMinutes: number;
  priceCents?: number;
  depositCents?: number;
};

type Slot = { startsAt: string; endsAt: string };

export default function PublicBookingPage() {
  const router = useRouter();
  const { token } = router.query;
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Array<{ id: string; email: string }>>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [tenant, setTenant] = useState<any>(null);
  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [locationId, setLocationId] = useState<string>('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [step, setStep] = useState<'details' | 'confirm' | 'done'>('details');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [emailConfigured, setEmailConfigured] = useState(true);
  const marketplaceEnabled = isMarketplaceEnabled();
  const bookingProEnabled = isBookingProV1Enabled();
  const demoPolishEnabled = isDemoPolishV1Enabled();

  useEffect(() => {
    if (!token || !marketplaceEnabled) return;
    fetch(`${API_BASE}/public/booking/${token}/config`)
      .then((res) => res.json())
      .then((data) => {
        setServices(data.services || []);
        setTenant(data.tenant || null);
        setStaff(Array.isArray(data.staff) ? data.staff : []);
        setLocations(Array.isArray(data.locations) ? data.locations : []);
        setQuestions(Array.isArray(data.questions) ? data.questions : []);
      })
      .catch(() => setError('Booking page not available.'));
  }, [token, marketplaceEnabled]);

  useEffect(() => {
    if (!token || !selectedService || !date) return;
    const params = new URLSearchParams({ date, serviceId: selectedService });
    if (locationId) params.set('locationId', locationId);
    fetch(`${API_BASE}/public/booking/${token}/slots?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setSlots(Array.isArray(data) ? data : []))
      .catch(() => setSlots([]));
  }, [token, selectedService, date, locationId]);

  const selectedServiceDetails = useMemo(() => services.find((service) => service.id === selectedService) || null, [services, selectedService]);

  const submit = async () => {
    setError('');
    setStatus('');
    if (!selectedSlot) {
      setError('Please select a time slot.');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/public/booking/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: selectedService,
          startsAt: selectedSlot.startsAt,
          locationId: locationId || undefined,
          staffUserId: selectedStaff || undefined,
          customerName,
          customerEmail,
          customerPhone: customerPhone || undefined,
          answers: Object.entries(answers).map(([questionId, valueText]) => ({ questionId, valueText })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || 'Booking failed');
        return;
      }
      setStatus('Booking request received. We will confirm shortly.');
      setEmailConfigured(Boolean(data?.emailConfigured));
      setStep('done');
    } catch {
      setError('Booking failed');
    }
  };

  if (!marketplaceEnabled) {
    return (
      <div className="container">
        <div className="card">
          <h1>Bookings</h1>
          <p className="muted">Booking portal is currently disabled.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Book a time</h1>
        {tenant?.name ? <p className="muted">for {tenant.name}</p> : null}
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}
        {status && <p style={{ color: '#7bdba5' }}>{status}</p>}
        {!emailConfigured ? <p className="muted">Email not configured. We will contact you manually.</p> : null}

        {step === 'details' ? (
          <>
            <label>1) Choose a service</label>
            <select className="input" value={selectedService} onChange={(e) => setSelectedService(e.target.value)}>
              <option value="">Select a service</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>

            {bookingProEnabled ? (
              <>
                <label>2) Select staff (optional)</label>
                <select className="input" value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)}>
                  <option value="">Any available staff</option>
                  {staff.map((member) => <option key={member.id} value={member.id}>{member.email}</option>)}
                </select>

                <label>Location (optional)</label>
                {demoPolishEnabled ? (
                  <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                    <option value="">Any location</option>
                    {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                  </select>
                ) : (
                  <input className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)} placeholder="Location ID" />
                )}
              </>
            ) : null}

            <label>3) Pick a date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

            <label>4) Choose a time</label>
            <div className="pill-row">
              {slots.map((slot) => (
                <button
                  key={slot.startsAt}
                  type="button"
                  className={`pill ${selectedSlot?.startsAt === slot.startsAt ? 'active' : ''}`}
                  onClick={() => setSelectedSlot(slot)}
                >
                  {new Date(slot.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </button>
              ))}
            </div>

            <label>5) Your details</label>
            <input className="input" placeholder="Full name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <input className="input" placeholder="Email" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
            <input className="input" placeholder="Phone (optional)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />

            {bookingProEnabled && questions.length > 0 ? (
              <>
                <label>6) Additional questions</label>
                {questions.map((question) => (
                  <input
                    key={question.id}
                    className="input"
                    placeholder={question.label}
                    value={answers[question.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                  />
                ))}
              </>
            ) : null}

            <button className="button" type="button" onClick={() => setStep('confirm')}>
              Review booking
            </button>
          </>
        ) : null}

        {step === 'confirm' ? (
          <>
            <h3>Confirmation</h3>
            <p className="muted">Service: {selectedServiceDetails?.name || 'Not selected'}</p>
            <p className="muted">Time: {selectedSlot ? new Date(selectedSlot.startsAt).toLocaleString() : 'Not selected'}</p>
            <p className="muted">Staff: {selectedStaff || 'Any available'}</p>
            {bookingProEnabled && selectedServiceDetails?.depositCents ? (
              <p className="muted">Optional deposit: {(Number(selectedServiceDetails.depositCents || 0) / 100).toFixed(2)}</p>
            ) : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="button" type="button" onClick={submit}>Confirm booking</button>
              <button className="button secondary" type="button" onClick={() => setStep('details')}>Back</button>
            </div>
          </>
        ) : null}

        {step === 'done' ? (
          <>
            <h3>Booked</h3>
            <p className="muted">Your request has been submitted. We will confirm by email.</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
