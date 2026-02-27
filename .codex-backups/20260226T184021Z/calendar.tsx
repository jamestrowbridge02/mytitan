import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardShell } from '../../../components/dashboard-shell';
import { apiFetch } from '../../../lib/api';
import { isBookingProV1Enabled } from '../../../lib/feature-flags';

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

  if (!enabled) {
    return <DashboardShell><div className="card"><h1>Booking Pro Calendar</h1><p className="muted">Feature is disabled.</p></div></DashboardShell>;
  }

  return (
    <DashboardShell>
      <div className="card" style={{ marginBottom: 14 }}>
        <h1>Booking Pro Calendar</h1>
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
        <label>Service</label>
        <select className="input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          <option value="">Select service</option>
          {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
        </select>
        <label>Location ID (optional)</label>
        <input className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)} />
        <label>Staff user ID (optional)</label>
        <input className="input" value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)} />
        <label>Date</label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

        <label>Available slots</label>
        <select className="input" value={selectedSlot} onChange={(e) => setSelectedSlot(e.target.value)}>
          <option value="">Select slot</option>
          {slots.map((slot: any) => <option key={slot.startsAt} value={slot.startsAt}>{new Date(slot.startsAt).toLocaleString()}</option>)}
        </select>

        <label>Customer name</label>
        <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        <label>Customer email</label>
        <input className="input" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} type="email" />
        <label>Customer phone</label>
        <input className="input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />

        <button className="button" type="button" onClick={createBooking}>Create booking</button>
      </div>

      <div className="card">
        <h3>Upcoming bookings</h3>
        <div className="list">
          {bookings.map((booking) => (
            <div key={booking.id} className="integration-card">
              <strong>{new Date(booking.startsAt).toLocaleString()}</strong>
              <span>{booking.customerName || booking.customerEmail || 'Customer'}</span>
            </div>
          ))}
          {bookings.length === 0 ? <p className="muted">No bookings yet.</p> : null}
        </div>
      </div>
    </DashboardShell>
  );
}
