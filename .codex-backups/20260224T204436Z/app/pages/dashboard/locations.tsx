import { useEffect, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';
import { isLocationsV1Enabled } from '../../lib/feature-flags';

export default function LocationsPage() {
  const enabled = isLocationsV1Enabled();
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ name: '', addressLine1: '', city: '', country: 'UK', phone: '' });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function load() {
    if (!enabled) return;
    try {
      const data = await apiFetch('/locations');
      setItems(Array.isArray(data) ? data : []);
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
      setForm({ name: '', addressLine1: '', city: '', country: 'UK', phone: '' });
      setStatus('Location saved');
      load();
    } catch (err: any) {
      setError(err?.message || 'Failed to save location');
    }
  }

  async function archive(id: string) {
    try {
      await apiFetch(`/locations/${id}/archive`, { method: 'POST' });
      load();
    } catch (err: any) {
      setError(err?.message || 'Failed to archive location');
    }
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
          <button className="button" type="submit">Save location</button>
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
              </div>
              <div className="integration-actions">
                <span className={`badge ${loc.isActive ? '' : 'warn'}`}>{loc.isActive ? 'Active' : 'Archived'}</span>
                {loc.isActive ? <button className="button secondary" type="button" onClick={() => archive(loc.id)}>Archive</button> : null}
              </div>
            </div>
          ))}
          {items.length === 0 ? <p className="muted">No locations yet.</p> : null}
        </div>
      </div>
    </DashboardShell>
  );
}

