import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getApiBase } from '../../../lib/api';
import { isMarketplaceEnabled } from '../../../lib/feature-flags';

const API_BASE = getApiBase();

type Service = {
  id: string;
  name: string;
  description?: string | null;
  unitPrice: string;
  durationMinutes: number;
};

type Slot = { startsAt: string; endsAt: string };

export default function PublicBookingPage() {
  const router = useRouter();
  const { token } = router.query;
  const [services, setServices] = useState<Service[]>([]);
  const [tenant, setTenant] = useState<any>(null);
  const [selectedService, setSelectedService] = useState<string>('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [emailConfigured, setEmailConfigured] = useState(true);
  const marketplaceEnabled = isMarketplaceEnabled();

  useEffect(() => {
    if (!token || !marketplaceEnabled) return;
    fetch(`${API_BASE}/public/booking/${token}/config`)
      .then((res) => res.json())
      .then((data) => {
        setServices(data.services || []);
        setTenant(data.tenant || null);
      })
      .catch(() => setError('Booking page not available.'));
  }, [token, marketplaceEnabled]);

  useEffect(() => {
    if (!token || !selectedService || !date) return;
    fetch(`${API_BASE}/public/booking/${token}/slots?date=${date}&serviceId=${selectedService}`)
      .then((res) => res.json())
      .then((data) => setSlots(Array.isArray(data) ? data : []))
      .catch(() => setSlots([]));
  }, [token, selectedService, date]);

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
          customerName,
          customerEmail,
          customerPhone: customerPhone || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || 'Booking failed');
        return;
      }
      setStatus('Booking request received. We will confirm shortly.');
      setEmailConfigured(Boolean(data?.emailConfigured));
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

        <label>1) Choose a service</label>
        <select className="input" value={selectedService} onChange={(e) => setSelectedService(e.target.value)}>
          <option value="">Select a service</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>

        <label>2) Pick a date</label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

        <label>3) Choose a time</label>
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

        <label>4) Your details</label>
        <input className="input" placeholder="Full name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        <input className="input" placeholder="Email" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
        <input className="input" placeholder="Phone (optional)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />

        <button className="button" type="button" onClick={submit}>
          Confirm booking
        </button>
      </div>
    </div>
  );
}
