import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { DashboardShell } from '../../components/dashboard-shell';
import { FeatureGate } from '../../components/feature-gate';
import { isMarketplaceEnabled } from '../../lib/feature-flags';

type BookingSettings = {
  publicEnabled: boolean;
  publicUrl?: string | null;
  icsUrl?: string | null;
  businessHours: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>;
  blackoutDates: Array<{ date: string; reason?: string | null }>;
  slotMinutes: number;
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [jobId, setJobId] = useState('');
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [startHour, setStartHour] = useState('09:00');
  const [endHour, setEndHour] = useState('17:00');
  const [blackoutDates, setBlackoutDates] = useState<Array<{ date: string; reason?: string | null }>>([]);
  const [newBlackoutDate, setNewBlackoutDate] = useState('');
  const [newBlackoutReason, setNewBlackoutReason] = useState('');
  const [saving, setSaving] = useState(false);
  const marketplaceEnabled = isMarketplaceEnabled();

  const load = () => {
    apiFetch('/bookings')
      .then((data) => setBookings(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || 'Failed to load bookings'));
  };

  const loadSettings = () => {
    if (!marketplaceEnabled) return;
    apiFetch('/bookings/settings')
      .then((data) => {
        setSettings(data);
        setPublicEnabled(Boolean(data.publicEnabled));
        setBlackoutDates(Array.isArray(data.blackoutDates) ? data.blackoutDates : []);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    load();
    loadSettings();
  }, [marketplaceEnabled]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    try {
      await apiFetch('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          startsAt,
          endsAt,
          jobId: jobId || undefined,
        }),
      });
      setStartsAt('');
      setEndsAt('');
      setJobId('');
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to create booking');
    }
  }

  async function saveSettings() {
    setSaving(true);
    setError('');
    try {
      const [startH, startM] = startHour.split(':').map(Number);
      const [endH, endM] = endHour.split(':').map(Number);
      const startMinute = startH * 60 + startM;
      const endMinute = endH * 60 + endM;
      const businessHours = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinute, endMinute }));

      const updated = await apiFetch('/bookings/settings', {
        method: 'POST',
        body: JSON.stringify({
          publicEnabled,
          businessHours,
          blackoutDates,
        }),
      });
      setSettings(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to update booking settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell>
      <FeatureGate featureKey="bookings_enabled">
        <div className="card">
          <h1>Bookings</h1>
          {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}

          {marketplaceEnabled && settings ? (
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
              <h3>Public booking link</h3>
              <p className="muted">Share this with customers to accept booking requests.</p>
              <div className="list">
                {settings.publicUrl ? (
                  <p className="muted">{settings.publicUrl}</p>
                ) : (
                  <p className="muted">Enable public bookings to generate a link.</p>
                )}
                {settings.icsUrl ? <p className="muted">ICS feed: {settings.icsUrl}</p> : null}
              </div>

              <label className="toggle-row">
                <input type="checkbox" checked={publicEnabled} onChange={(e) => setPublicEnabled(e.target.checked)} />
                Enable public bookings
              </label>

              <div className="two-col">
                <div>
                  <label>Start time</label>
                  <input className="input" type="time" value={startHour} onChange={(e) => setStartHour(e.target.value)} />
                </div>
                <div>
                  <label>End time</label>
                  <input className="input" type="time" value={endHour} onChange={(e) => setEndHour(e.target.value)} />
                </div>
              </div>

              <div className="card" style={{ padding: 12, marginTop: 12 }}>
                <strong>Blackout dates</strong>
                <p className="muted">Block dates you cannot accept bookings.</p>
                <div className="two-col">
                  <input className="input" type="date" value={newBlackoutDate} onChange={(e) => setNewBlackoutDate(e.target.value)} />
                  <input className="input" placeholder="Reason (optional)" value={newBlackoutReason} onChange={(e) => setNewBlackoutReason(e.target.value)} />
                </div>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    if (!newBlackoutDate) return;
                    setBlackoutDates((prev) => [...prev, { date: newBlackoutDate, reason: newBlackoutReason || null }]);
                    setNewBlackoutDate('');
                    setNewBlackoutReason('');
                  }}
                >
                  Add blackout date
                </button>
                {blackoutDates.length > 0 ? (
                  <div className="list" style={{ marginTop: 10 }}>
                    {blackoutDates.map((item) => (
                      <div key={`${item.date}-${item.reason || ''}`} className="integration-card">
                        <div>
                          <strong>{item.date}</strong>
                          {item.reason ? <p className="muted">{item.reason}</p> : null}
                        </div>
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => setBlackoutDates((prev) => prev.filter((entry) => entry !== item))}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <button className="button" type="button" onClick={saveSettings} disabled={saving}>
                {saving ? 'Saving...' : 'Save booking settings'}
              </button>
            </div>
          ) : null}

          <form onSubmit={onCreate}>
            <label>Start time</label>
            <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />

            <label>End time</label>
            <input className="input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />

            <label>Job ID (optional)</label>
            <input className="input" value={jobId} onChange={(e) => setJobId(e.target.value)} />

            <button className="button" type="submit">Create Booking</button>
          </form>

          <div className="list" style={{ marginTop: 20 }}>
            <h3>Calendar view</h3>
            {bookings.map((booking) => (
              <div key={booking.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{new Date(booking.startsAt).toLocaleString()}</strong>
                  <span className="badge">{booking.status}</span>
                </div>
                <p className="muted" style={{ marginBottom: 0 }}>
                  Ends: {new Date(booking.endsAt).toLocaleString()}
                </p>
                {booking.customerName ? <p className="muted">Customer: {booking.customerName}</p> : null}
              </div>
            ))}
            {bookings.length === 0 && !error && <p>No bookings yet.</p>}
          </div>
        </div>
      </FeatureGate>
    </DashboardShell>
  );
}
