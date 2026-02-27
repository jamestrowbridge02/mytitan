import { useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';
import { isLocationsAdvancedV1Enabled, isLocationsV1Enabled } from '../../lib/feature-flags';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function LocationsPage() {
  const enabled = isLocationsV1Enabled();
  const advancedEnabled = isLocationsAdvancedV1Enabled();
  const [items, setItems] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [onlyMyLocation, setOnlyMyLocation] = useState(false);
  const [form, setForm] = useState<any>({
    name: '',
    addressLine1: '',
    city: '',
    country: 'UK',
    phone: '',
    timezone: 'UTC',
    bookingLeadTimeMins: 0,
    defaultAssigneeId: '',
    staffUserIds: [] as string[],
    hours: WEEKDAYS.map((_, i) => ({ weekday: i, startMinute: i === 0 || i === 6 ? null : 540, endMinute: i === 0 || i === 6 ? null : 1020, isClosed: i === 0 || i === 6 })),
  });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const isFormValid = useMemo(() => String(form.name || '').trim().length > 0, [form.name]);

  async function load() {
    if (!enabled) return;
    try {
      const [data, usersData, meLocation] = await Promise.all([
        apiFetch('/locations'),
        apiFetch('/users').catch(() => []),
        apiFetch('/me/location').catch(() => null),
      ]);
      setItems(Array.isArray(data) ? data : []);
      setUsers(Array.isArray(usersData) ? usersData : []);
      setOnlyMyLocation(Boolean(meLocation?.onlyMyLocation));
    } catch (err: any) {
      setError(err?.message || 'Failed to load locations');
    }
  }

  useEffect(() => {
    load();
  }, [enabled]);

  async function createLocation(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('');
    try {
      await apiFetch('/locations', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({
        name: '',
        addressLine1: '',
        city: '',
        country: 'UK',
        phone: '',
        timezone: 'UTC',
        bookingLeadTimeMins: 0,
        defaultAssigneeId: '',
        staffUserIds: [],
        hours: WEEKDAYS.map((_, i) => ({ weekday: i, startMinute: i === 0 || i === 6 ? null : 540, endMinute: i === 0 || i === 6 ? null : 1020, isClosed: i === 0 || i === 6 })),
      });
      setStatus('Location saved');
      load();
    } catch (err: any) {
      setError(err?.message || 'Failed to save location');
    }
  }

  async function archive(id: string, nextActive: boolean) {
    try {
      if (nextActive) {
        await apiFetch(`/locations/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive: true }) });
      } else {
        await apiFetch(`/locations/${id}/archive`, { method: 'POST' });
      }
      load();
    } catch (err: any) {
      setError(err?.message || 'Failed to update location status');
    }
  }

  async function saveRestriction(value: boolean) {
    setOnlyMyLocation(value);
    try {
      await apiFetch('/locations/staff-restriction', {
        method: 'POST',
        body: JSON.stringify({ onlyMyLocation: value }),
      });
      setStatus('Staff restriction updated');
    } catch (err: any) {
      setError(err?.message || 'Failed to update staff restriction');
    }
  }

  function setHourValue(index: number, key: 'startMinute' | 'endMinute' | 'isClosed', value: any) {
    const next = [...form.hours];
    next[index] = { ...next[index], [key]: value };
    setForm({ ...form, hours: next });
  }

  return (
    <DashboardShell>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>Locations</h1>
        <p className="muted">Manage your workshops, vans, or depots.</p>
        {!enabled ? <p className="muted">Locations feature is disabled.</p> : null}
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
        {status ? <p style={{ color: '#5eead4' }}>{status}</p> : null}
      </div>

      {advancedEnabled ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Staff restrictions</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={onlyMyLocation} onChange={(e) => saveRestriction(Boolean(e.target.checked))} />
            Only show my default location
          </label>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Add Location</h2>
        <form onSubmit={createLocation}>
          <label>Name</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <label>Address line 1</label>
          <input className="input" value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} />
          <label>City</label>
          <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <label>Country</label>
          <input className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          <label>Phone</label>
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />

          {advancedEnabled ? (
            <>
              <label>Timezone</label>
              <input className="input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
              <label>Booking lead time mins</label>
              <input className="input" type="number" value={form.bookingLeadTimeMins} onChange={(e) => setForm({ ...form, bookingLeadTimeMins: Number(e.target.value || 0) })} />
              <label>Default assignee</label>
              <select className="input" value={form.defaultAssigneeId} onChange={(e) => setForm({ ...form, defaultAssigneeId: e.target.value })}>
                <option value="">None</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
              </select>
              <label>Staff assignment (multi-select)</label>
              <select
                multiple
                className="input"
                value={form.staffUserIds}
                onChange={(e) => setForm({ ...form, staffUserIds: Array.from(e.target.selectedOptions).map((x) => x.value) })}
              >
                {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
              </select>
              <h3>Hours</h3>
              {form.hours.map((hour: any, idx: number) => (
                <div key={hour.weekday} style={{ display: 'grid', gridTemplateColumns: '80px 120px 120px 120px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <strong>{WEEKDAYS[hour.weekday]}</strong>
                  <input className="input" type="number" value={hour.startMinute ?? ''} onChange={(e) => setHourValue(idx, 'startMinute', e.target.value === '' ? null : Number(e.target.value))} />
                  <input className="input" type="number" value={hour.endMinute ?? ''} onChange={(e) => setHourValue(idx, 'endMinute', e.target.value === '' ? null : Number(e.target.value))} />
                  <label><input type="checkbox" checked={Boolean(hour.isClosed)} onChange={(e) => setHourValue(idx, 'isClosed', Boolean(e.target.checked))} /> Closed</label>
                </div>
              ))}
            </>
          ) : null}

          <button className="button" type="submit" disabled={!isFormValid}>Save location</button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Your Locations</h2>
        <div className="list">
          {items.map((loc) => (
            <div key={loc.id} className="integration-card">
              <div>
                <strong>{loc.name}</strong>
                <p className="muted" style={{ margin: '4px 0 0 0' }}>
                  {[loc.addressLine1, loc.city, loc.country].filter(Boolean).join(', ')}
                </p>
                {advancedEnabled ? (
                  <p className="muted" style={{ margin: '4px 0 0 0' }}>
                    TZ: {loc.timezone || '—'} • Lead: {Number(loc.bookingLeadTimeMins || 0)} mins • Staff: {loc.staffAssignments?.length || 0}
                  </p>
                ) : null}
              </div>
              <div className="integration-actions">
                <span className={`badge ${loc.isActive ? '' : 'warn'}`}>{loc.isActive ? 'Active' : 'Archived'}</span>
                <button className="button secondary" type="button" onClick={() => archive(loc.id, !loc.isActive)}>{loc.isActive ? 'Archive' : 'Unarchive'}</button>
              </div>
            </div>
          ))}
          {items.length === 0 ? <p className="muted">No locations yet.</p> : null}
        </div>
      </div>
    </DashboardShell>
  );
}
