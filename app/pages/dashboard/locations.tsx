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
  const [memberships, setMemberships] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ totals: {}, locations: [] });
  const [onlyMyLocation, setOnlyMyLocation] = useState(false);
  const [form, setForm] = useState<any>({
    code: '',
    name: '',
    kind: 'BRANCH',
    addressLine1: '',
    city: '',
    country: 'UK',
    phone: '',
    email: '',
    timezone: 'UTC',
    bookingLeadTimeMins: 0,
    defaultAssigneeId: '',
    staffUserIds: [] as string[],
    hours: WEEKDAYS.map((_, i) => ({ weekday: i, startMinute: i === 0 || i === 6 ? null : 540, endMinute: i === 0 || i === 6 ? null : 1020, isClosed: i === 0 || i === 6 })),
  });
  const [membershipForm, setMembershipForm] = useState<any>({
    userId: '',
    locationId: '',
    roleOverride: '',
  });
  const [editingId, setEditingId] = useState<string>('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const isFormValid = useMemo(() => String(form.name || '').trim().length > 0, [form.name]);

  async function load() {
    if (!enabled) return;
    try {
      const [data, usersData, meLocation, membershipData, summaryData] = await Promise.all([
        apiFetch('/locations'),
        apiFetch('/users').catch(() => []),
        apiFetch('/me/location').catch(() => null),
        apiFetch('/locations/memberships').catch(() => []),
        apiFetch('/locations/summary').catch(() => ({ totals: {}, locations: [] })),
      ]);
      setItems(Array.isArray(data) ? data : []);
      setUsers(Array.isArray(usersData) ? usersData : []);
      setOnlyMyLocation(Boolean(meLocation?.onlyMyLocation));
      setMemberships(Array.isArray(membershipData) ? membershipData : []);
      setSummary(summaryData || { totals: {}, locations: [] });
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
      await apiFetch(editingId ? `/locations/${editingId}` : '/locations', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(form),
      });
      setForm({
        code: '',
        name: '',
        kind: 'BRANCH',
        addressLine1: '',
        city: '',
        country: 'UK',
        phone: '',
        email: '',
        timezone: 'UTC',
        bookingLeadTimeMins: 0,
        defaultAssigneeId: '',
        staffUserIds: [],
        hours: WEEKDAYS.map((_, i) => ({ weekday: i, startMinute: i === 0 || i === 6 ? null : 540, endMinute: i === 0 || i === 6 ? null : 1020, isClosed: i === 0 || i === 6 })),
      });
      setEditingId('');
      setStatus(editingId ? 'Location updated' : 'Location saved');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to save location');
    }
  }

  async function createMembership(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('');
    try {
      await apiFetch('/locations/memberships', {
        method: 'POST',
        body: JSON.stringify({
          userId: membershipForm.userId,
          locationId: membershipForm.locationId,
          roleOverride: membershipForm.roleOverride || undefined,
          active: true,
        }),
      });
      setMembershipForm({ userId: '', locationId: '', roleOverride: '' });
      setStatus('Location membership saved');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to save location membership');
    }
  }

  async function toggleMembership(membership: any) {
    setError('');
    setStatus('');
    try {
      await apiFetch(`/locations/memberships/${membership.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !membership.active }),
      });
      setStatus('Location membership updated');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to update location membership');
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

  function editLocation(location: any) {
    setEditingId(location.id);
    setForm({
      code: location.code || '',
      name: location.name || '',
      kind: location.kind || 'BRANCH',
      addressLine1: location.addressLine1 || '',
      city: location.city || '',
      country: location.country || 'UK',
      phone: location.phone || '',
      email: location.email || '',
      timezone: location.timezone || 'UTC',
      bookingLeadTimeMins: Number(location.bookingLeadTimeMins || 0),
      defaultAssigneeId: location.defaultAssigneeId || '',
      staffUserIds: Array.isArray(location.memberships) ? location.memberships.filter((membership: any) => membership.active).map((membership: any) => membership.userId) : [],
      hours: Array.isArray(location.businessHours) && location.businessHours.length
        ? location.businessHours.map((hour: any) => ({
            weekday: hour.weekday,
            startMinute: hour.startMinute,
            endMinute: hour.endMinute,
            isClosed: Boolean(hour.isClosed),
          }))
        : WEEKDAYS.map((_, i) => ({ weekday: i, startMinute: i === 0 || i === 6 ? null : 540, endMinute: i === 0 || i === 6 ? null : 1020, isClosed: i === 0 || i === 6 })),
    });
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
        <h2 style={{ marginTop: 0 }}>Location summary</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          <div className="integration-card">
            <strong>{Number(summary?.totals?.locations || 0)}</strong>
            <p className="muted" style={{ margin: '4px 0 0 0' }}>Configured locations</p>
          </div>
          <div className="integration-card">
            <strong>{Number(summary?.totals?.activeLocations || 0)}</strong>
            <p className="muted" style={{ margin: '4px 0 0 0' }}>Active locations</p>
          </div>
          <div className="integration-card">
            <strong>{Number(summary?.totals?.memberships || 0)}</strong>
            <p className="muted" style={{ margin: '4px 0 0 0' }}>Active memberships</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }} data-testid="location-create">
        <h2 style={{ marginTop: 0 }}>{editingId ? 'Edit Location' : 'Add Location'}</h2>
        <form onSubmit={createLocation}>
          <label>Code</label>
          <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <label>Name</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <label>Kind</label>
          <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="BRANCH">Branch</option>
            <option value="WAREHOUSE">Warehouse</option>
            <option value="SERVICE_REGION">Service region</option>
            <option value="FRANCHISE">Franchise</option>
          </select>
          <label>Address line 1</label>
          <input className="input" value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} />
          <label>City</label>
          <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <label>Country</label>
          <input className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          <label>Phone</label>
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <label>Email</label>
          <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

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

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="button" data-testid="location-save" type="submit" disabled={!isFormValid}>{editingId ? 'Update location' : 'Save location'}</button>
            {editingId ? <button className="button secondary" type="button" onClick={() => setEditingId('')}>Cancel edit</button> : null}
          </div>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 16 }} data-testid="location-membership-list">
        <h2 style={{ marginTop: 0 }}>Location memberships</h2>
        <form onSubmit={createMembership} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginBottom: 16 }}>
          <select className="input" value={membershipForm.userId} onChange={(e) => setMembershipForm({ ...membershipForm, userId: e.target.value })} required>
            <option value="">Select user</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
          </select>
          <select className="input" value={membershipForm.locationId} onChange={(e) => setMembershipForm({ ...membershipForm, locationId: e.target.value })} required>
            <option value="">Select location</option>
            {items.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>
          <select className="input" value={membershipForm.roleOverride} onChange={(e) => setMembershipForm({ ...membershipForm, roleOverride: e.target.value })}>
            <option value="">No override</option>
            <option value="ADMIN">Admin</option>
            <option value="STAFF">Staff</option>
            <option value="READ_ONLY">Read only</option>
            <option value="TECHNICIAN">Technician</option>
            <option value="FINANCE">Finance</option>
          </select>
          <button className="button" type="submit">Assign membership</button>
        </form>
        <div className="list">
          {memberships.map((membership) => (
            <div key={membership.id} className="integration-card">
              <div>
                <strong>{membership.user?.email || 'User'}</strong>
                <p className="muted" style={{ margin: '4px 0 0 0' }}>
                  {membership.location?.name || 'Location'}{membership.roleOverride ? ` • ${membership.roleOverride}` : ''}{membership.active ? '' : ' • inactive'}
                </p>
              </div>
              <button className="button secondary" type="button" onClick={() => toggleMembership(membership)}>
                {membership.active ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          ))}
          {memberships.length === 0 ? <p className="muted">No memberships yet.</p> : null}
        </div>
      </div>

      <div className="card" data-testid="location-list">
        <h2 style={{ marginTop: 0 }}>Your Locations</h2>
        <div className="list">
          {items.map((loc) => (
            <div key={loc.id} className="integration-card">
              <div>
                <strong>{loc.name}</strong>
                <p className="muted" style={{ margin: '4px 0 0 0' }}>
                  {[loc.code, loc.kind, loc.addressLine1, loc.city, loc.country].filter(Boolean).join(' • ')}
                </p>
                {advancedEnabled ? (
                  <p className="muted" style={{ margin: '4px 0 0 0' }}>
                    TZ: {loc.timezone || '—'} • Lead: {Number(loc.bookingLeadTimeMins || 0)} mins • Staff: {loc.memberships?.filter((membership: any) => membership.active).length || 0}
                  </p>
                ) : null}
              </div>
              <div className="integration-actions">
                <span className={`badge ${loc.isActive ? '' : 'warn'}`}>{loc.isActive ? 'Active' : 'Archived'}</span>
                <button className="button secondary" type="button" onClick={() => editLocation(loc)}>Edit</button>
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
