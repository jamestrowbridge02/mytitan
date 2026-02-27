import { useEffect, useState } from 'react';
import { DashboardShell } from '../../../components/dashboard-shell';
import { apiFetch } from '../../../lib/api';
import { isBookingProV1Enabled } from '../../../lib/feature-flags';

export default function BookingProSettingsPage() {
  const enabled = isBookingProV1Enabled();
  const [settings, setSettings] = useState<any>(null);
  const [error, setError] = useState('');
  const [publicEnabled, setPublicEnabled] = useState(false);

  async function load() {
    if (!enabled) return;
    try {
      const data = await apiFetch('/booking/settings');
      setSettings(data);
      setPublicEnabled(Boolean(data?.publicEnabled));
    } catch (err: any) {
      setError(err?.message || 'Failed to load settings');
    }
  }

  useEffect(() => { load(); }, [enabled]);

  async function save() {
    setError('');
    try {
      const updated = await apiFetch('/booking/settings', {
        method: 'POST',
        body: JSON.stringify({
          publicEnabled,
          staffAvailability: settings?.staffAvailability || [],
          blackoutDates: settings?.blackoutDates || [],
          questions: settings?.questions || [],
        }),
      });
      setSettings(updated);
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    }
  }

  if (!enabled) {
    return <DashboardShell><div className="card"><h1>Booking Pro Settings</h1><p className="muted">Feature is disabled.</p></div></DashboardShell>;
  }

  return (
    <DashboardShell>
      <div className="card">
        <h1>Booking Pro Settings</h1>
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
        <label className="toggle-row">
          <input type="checkbox" checked={publicEnabled} onChange={(e) => setPublicEnabled(e.target.checked)} />
          Enable public bookings
        </label>

        <h3>Blackout dates</h3>
        <div className="list">
          {(settings?.blackoutDates || []).map((date: any) => (
            <div key={date.id || `${date.date}-${date.locationId || ''}`} className="integration-card">
              <span>{String(date.date).slice(0, 10)} {date.reason ? `• ${date.reason}` : ''}</span>
            </div>
          ))}
          {(settings?.blackoutDates || []).length === 0 ? <p className="muted">No blackout dates</p> : null}
        </div>

        <h3>Custom questions</h3>
        <div className="list">
          {(settings?.questions || []).map((question: any) => (
            <div key={question.id} className="integration-card">
              <span>{question.label} ({question.type})</span>
            </div>
          ))}
          {(settings?.questions || []).length === 0 ? <p className="muted">No custom questions</p> : null}
        </div>

        <button className="button" type="button" onClick={save}>Save</button>
      </div>
    </DashboardShell>
  );
}
