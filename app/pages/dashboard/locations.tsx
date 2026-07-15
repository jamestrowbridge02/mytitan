import { useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';
import { isLocationsAdvancedV1Enabled, isLocationsV1Enabled } from '../../lib/feature-flags';
import { DEFAULT_WORKSPACE_TIMEZONE, fetchGeoDefaults, type GeoDefaults } from '../../lib/geo-defaults';
import { formatBusinessTime, parseBusinessTime, weekdayHours } from '../../lib/business-hours';
import { EntityImageUpload } from '../../components/media/EntityImageUpload';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function createLocationForm(defaults?: GeoDefaults | null) {
  return {
    code: '',
    name: '',
    kind: 'BRANCH',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: defaults?.country || '',
    phone: '',
    email: '',
    timezone: defaults?.timezone || DEFAULT_WORKSPACE_TIMEZONE,
    bookingLeadTimeMins: 0,
    bookingCutoffMins: 0,
    slotMinutes: 30,
    arrivalInstructions: '',
    parkingInstructions: '',
    publicVisible: true,
    tradeVisible: true,
    privateVisible: true,
    metadataJson: {} as Record<string, unknown>,
    defaultAssigneeId: '',
    staffUserIds: [] as string[],
    hours: weekdayHours([1, 2, 3, 4, 5]),
  };
}

function VisibilityEyeIcon({ hidden = false }: { hidden?: boolean }) {
  return (
    <svg aria-hidden="true" className="visibility-eye-icon" viewBox="0 0 24 24" focusable="false">
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      {hidden ? <path className="visibility-eye-icon__slash" d="M4 4l16 16" /> : null}
    </svg>
  );
}

function VisibilityIconButton({
  pressed,
  visibleLabel,
  hiddenLabel,
  shortLabel,
  testId,
  onClick,
}: {
  pressed: boolean;
  visibleLabel: string;
  hiddenLabel: string;
  shortLabel: string;
  testId: string;
  onClick: () => void;
}) {
  const label = pressed ? visibleLabel : hiddenLabel;
  return (
    <button
      className={`visibility-icon-button ${pressed ? 'is-visible' : 'is-hidden'}`}
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <VisibilityEyeIcon hidden={!pressed} />
      <span>{shortLabel}</span>
      <span className="visually-hidden">{label}</span>
    </button>
  );
}

export default function LocationsPage() {
  const enabled = isLocationsV1Enabled();
  const advancedEnabled = isLocationsAdvancedV1Enabled();
  const [geoDefaults, setGeoDefaults] = useState<GeoDefaults | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ totals: {}, locations: [] });
  const [onlyMyLocation, setOnlyMyLocation] = useState(false);
  const [form, setForm] = useState<any>(() => createLocationForm());
  const [membershipForm, setMembershipForm] = useState<any>({
    userId: '',
    locationId: '',
    roleOverride: '',
  });
  const [editingId, setEditingId] = useState<string>('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(createLocationForm()));
  const [hourInputs, setHourInputs] = useState<Record<string, string>>({});
  const [copyHoursLocationId, setCopyHoursLocationId] = useState('');
  const isFormValid = useMemo(() => String(form.name || '').trim().length > 0, [form.name]);
  const isDirty = useMemo(() => JSON.stringify(form) !== savedSnapshot, [form, savedSnapshot]);

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

  useEffect(() => {
    let cancelled = false;
    void fetchGeoDefaults().then((defaults) => {
      if (cancelled) return;
      setGeoDefaults(defaults);
      setForm((prev: any) => {
        if (editingId) return prev;
        const next = { ...prev };
        if (!String(prev.country || '').trim()) {
          next.country = defaults.country || '';
        }
        if (!String(prev.timezone || '').trim() || prev.timezone === 'UTC') {
          next.timezone = defaults.timezone || DEFAULT_WORKSPACE_TIMEZONE;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [editingId]);

  function buildLocationPayload() {
    const normalize = (value: any) => {
      const next = typeof value === 'string' ? value.trim() : value;
      return next === '' ? undefined : next;
    };
    return {
      code: normalize(form.code),
      name: normalize(form.name),
      kind: form.kind,
      addressLine1: normalize(form.addressLine1),
      addressLine2: normalize(form.addressLine2),
      city: normalize(form.city),
      state: normalize(form.state),
      postalCode: normalize(form.postalCode),
      country: normalize(form.country) || normalize(geoDefaults?.country) || 'United Kingdom',
      phone: normalize(form.phone),
      email: normalize(form.email),
      timezone: normalize(form.timezone),
      bookingLeadTimeMins: Math.max(0, Number(form.bookingLeadTimeMins || 0)),
      defaultAssigneeId: normalize(form.defaultAssigneeId),
      staffUserIds: Array.isArray(form.staffUserIds) ? form.staffUserIds : [],
      hours: Array.isArray(form.hours) ? form.hours : [],
      metadataJson: {
        ...(form.metadataJson && typeof form.metadataJson === 'object' ? form.metadataJson : {}),
        bookingCutoffMins: Math.max(0, Number(form.bookingCutoffMins || 0)),
        slotMinutes: Math.max(5, Number(form.slotMinutes || 30)),
        arrivalInstructions: normalize(form.arrivalInstructions) || null,
        parkingInstructions: normalize(form.parkingInstructions) || null,
        publicVisible: form.publicVisible !== false,
        tradeVisible: form.tradeVisible !== false,
        privateVisible: form.privateVisible !== false,
      },
    };
  }

  function validateHours() {
    for (const hour of form.hours || []) {
      if (hour.isClosed) continue;
      if (!Number.isInteger(hour.startMinute) || !Number.isInteger(hour.endMinute)) {
        throw new Error(`${WEEKDAYS[hour.weekday]} needs both an opening and closing time.`);
      }
      if (hour.endMinute <= hour.startMinute) {
        throw new Error(`${WEEKDAYS[hour.weekday]} closing time must be later than opening time.`);
      }
    }
  }

  async function createLocation(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !isDirty) return;
    setError('');
    setStatus('');
    setSaving(true);
    try {
      validateHours();
      await apiFetch(editingId ? `/locations/${editingId}` : '/locations', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(buildLocationPayload()),
      });
      const nextForm = createLocationForm(geoDefaults);
      setForm(nextForm);
      setSavedSnapshot(JSON.stringify(nextForm));
      setEditingId('');
      setHourInputs({});
      setStatus(editingId ? 'Saved. The location details are up to date.' : 'Saved. Add another location or continue to booking settings.');
      await load();
    } catch (err: any) {
      setError(`${err?.message || 'Failed to save location'}. Your entered details have been kept so you can correct the issue and try again.`);
    } finally {
      setSaving(false);
    }
  }

  async function uploadLocationImage(file: File) {
    if (!editingId) return;
    const wasDirty = isDirty;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const body = new FormData();
      body.append('file', file);
      const result = await apiFetch(`/locations/${editingId}/image`, { method: 'POST', body });
      const imageUrl = result?.imageUrl || null;
      const nextForm = {
        ...form,
        metadataJson: {
          ...(form.metadataJson && typeof form.metadataJson === 'object' ? form.metadataJson : {}),
          imageUrl,
        },
      };
      setForm(nextForm);
      if (!wasDirty) setSavedSnapshot(JSON.stringify(nextForm));
      setItems((current) => current.map((location) => (
        location.id === editingId
          ? {
              ...location,
              metadataJson: {
                ...(location.metadataJson && typeof location.metadataJson === 'object' ? location.metadataJson : {}),
                imageUrl,
              },
            }
          : location
      )));
      setStatus('Location image updated for public booking.');
    } catch (err: any) {
      setError(err?.message || 'Failed to upload the location image');
      throw err;
    } finally {
      setSaving(false);
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

  function setHourInput(index: number, key: 'startMinute' | 'endMinute', value: string) {
    const inputKey = `${index}-${key}`;
    setHourInputs((current) => ({ ...current, [inputKey]: value }));
    try {
      const parsed = parseBusinessTime(value);
      setHourValue(index, key, parsed);
      setError('');
    } catch (err: any) {
      setHourValue(index, key, null);
      setError(`${WEEKDAYS[form.hours[index].weekday]}: ${err?.message || 'Enter a valid time.'}`);
    }
  }

  function applyHoursPreset(hours: any[], message: string) {
    setForm({ ...form, hours });
    setHourInputs({});
    setError('');
    setStatus(message);
  }

  function copyMondayToWeekdays() {
    const monday = form.hours.find((hour: any) => hour.weekday === 1);
    if (!monday) return;
    applyHoursPreset(
      form.hours.map((hour: any) => (
        hour.weekday >= 1 && hour.weekday <= 5 ? { ...monday, weekday: hour.weekday } : hour
      )),
      'Monday hours copied to weekdays. Save the location to confirm.',
    );
  }

  function copyHoursFromLocation() {
    const source = items.find((location) => location.id === copyHoursLocationId);
    if (!source?.businessHours?.length) {
      setError('Choose a location with saved opening hours.');
      return;
    }
    applyHoursPreset(
      source.businessHours.map((hour: any) => ({
        weekday: hour.weekday,
        startMinute: hour.startMinute,
        endMinute: hour.endMinute,
        isClosed: Boolean(hour.isClosed),
      })),
      `Hours copied from ${source.name}. Save the location to confirm.`,
    );
  }

  async function applyHoursToAllLocations() {
    if (!editingId || isDirty) {
      setError('Save this location first, then apply its saved hours to all active locations.');
      return;
    }
    if (!window.confirm('Apply these saved hours to every other active location?')) return;
    setSaving(true);
    setError('');
    try {
      const result = await apiFetch(`/locations/${editingId}/hours/apply-all`, { method: 'POST' });
      setStatus(`Hours applied to ${Number(result?.updatedLocations || 0)} active locations.`);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Hours could not be applied to all locations.');
    } finally {
      setSaving(false);
    }
  }

  function editLocation(location: any) {
    const metadata = location.metadataJson && typeof location.metadataJson === 'object' ? location.metadataJson : {};
    setEditingId(location.id);
    const nextForm = {
      code: location.code || '',
      name: location.name || '',
      kind: location.kind || 'BRANCH',
      addressLine1: location.addressLine1 || '',
      addressLine2: location.addressLine2 || '',
      city: location.city || '',
      state: location.state || '',
      postalCode: location.postalCode || '',
      country: location.country || geoDefaults?.country || '',
      phone: location.phone || '',
      email: location.email || '',
      timezone: location.timezone || 'UTC',
      bookingLeadTimeMins: Number(location.bookingLeadTimeMins || 0),
      bookingCutoffMins: Number(metadata.bookingCutoffMins || 0),
      slotMinutes: Number(metadata.slotMinutes || 30),
      arrivalInstructions: String(metadata.arrivalInstructions || ''),
      parkingInstructions: String(metadata.parkingInstructions || ''),
      publicVisible: metadata.publicVisible !== false,
      tradeVisible: metadata.tradeVisible !== false,
      privateVisible: metadata.privateVisible !== false,
      metadataJson: metadata,
      defaultAssigneeId: location.defaultAssigneeId || '',
      staffUserIds: Array.isArray(location.memberships) ? location.memberships.filter((membership: any) => membership.active).map((membership: any) => membership.userId) : [],
      hours: Array.isArray(location.businessHours) && location.businessHours.length
        ? location.businessHours.map((hour: any) => ({
            weekday: hour.weekday,
            startMinute: hour.startMinute,
            endMinute: hour.endMinute,
            isClosed: Boolean(hour.isClosed),
          }))
        : weekdayHours([1, 2, 3, 4, 5]),
    };
    setForm(nextForm);
    setHourInputs({});
    setSavedSnapshot(JSON.stringify(nextForm));
    setStatus('Edit mode. Unsaved changes will be shown here.');
    setError('');
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
        <p className="muted" role="status" data-testid="location-save-state">
          {saving ? 'Saving...' : isDirty ? 'Unsaved changes' : editingId ? 'Saved' : 'Ready for a new location'}
        </p>
        <form onSubmit={createLocation}>
          <label>Code</label>
          <input
            className="input"
            data-testid="location-code-input"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <label>Name</label>
          <input
            className="input"
            data-testid="location-name-input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <label>Kind</label>
          <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="BRANCH">Branch</option>
            <option value="WAREHOUSE">Warehouse</option>
            <option value="SERVICE_REGION">Service region</option>
            <option value="FRANCHISE">Franchise</option>
          </select>
          <label>Address line 1</label>
          <input className="input" data-testid="location-address-line-1" value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} />
          <label>Address line 2</label>
          <input className="input" data-testid="location-address-line-2" value={form.addressLine2} onChange={(e) => setForm({ ...form, addressLine2: e.target.value })} />
          <label>Town / City</label>
          <input className="input" data-testid="location-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <label>County / Region</label>
          <input className="input" data-testid="location-region" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          <label>Postcode</label>
          <input className="input" data-testid="location-postcode" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
          <label>Country</label>
          <input className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          {!editingId ? (
            <p className="muted" style={{ marginTop: 6 }}>
              {geoDefaults?.detected && geoDefaults.country
                ? `Detected from your connection. You can change it before saving.`
                : 'Country stays editable and falls back safely if detection is unavailable.'}
            </p>
          ) : null}
          <label>Phone</label>
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <label>Email</label>
          <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          {editingId ? (
            <div className="integration-card" data-testid="location-image-settings" style={{ margin: '14px 0' }}>
              <div>
                <strong>Public booking image</strong>
                <p className="muted" style={{ margin: '4px 0 10px' }}>Shown on the location card. PNG, JPEG, or WebP up to 5 MB.</p>
              </div>
              <EntityImageUpload
                inputId="location-image-file"
                inputTestId="location-image-input"
                fileNameTestId="location-image-file-name"
                selectionTestId="location-image-selection"
                previewTestId="location-image-preview"
                uploadButtonTestId="location-image-upload"
                inputAriaLabel={`Upload image for ${form.name || 'location'}`}
                currentImageUrl={form.metadataJson?.imageUrl ? String(form.metadataJson.imageUrl) : ''}
                previewAlt={`${form.name || 'Location'} preview`}
                disabled={saving}
                onUpload={uploadLocationImage}
                onError={setError}
              />
            </div>
          ) : null}

          {advancedEnabled ? (
            <>
              <label>Timezone</label>
              <input className="input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
              <label>Booking lead time mins</label>
              <input className="input" type="number" value={form.bookingLeadTimeMins} onChange={(e) => setForm({ ...form, bookingLeadTimeMins: Number(e.target.value || 0) })} />
              <label>Booking cutoff mins</label>
              <input className="input" type="number" min={0} value={form.bookingCutoffMins} onChange={(e) => setForm({ ...form, bookingCutoffMins: Number(e.target.value || 0) })} />
              <label>Booking slot length mins</label>
              <input className="input" type="number" min={5} step={5} value={form.slotMinutes} onChange={(e) => setForm({ ...form, slotMinutes: Number(e.target.value || 30) })} />
              <label>Booking visibility</label>
              <div data-testid="location-visibility-controls" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <VisibilityIconButton
                  pressed={form.publicVisible !== false}
                  visibleLabel="Visible publicly"
                  hiddenLabel="Hidden from public"
                  shortLabel="Public"
                  testId="location-public-visible"
                  onClick={() => setForm({ ...form, publicVisible: !(form.publicVisible !== false) })}
                />
                <VisibilityIconButton
                  pressed={form.tradeVisible !== false}
                  visibleLabel="Trade-visible"
                  hiddenLabel="Hidden from trade/private"
                  shortLabel="Trade"
                  testId="location-trade-visible"
                  onClick={() => {
                    const nextVisible = !(form.tradeVisible !== false);
                    setForm({ ...form, tradeVisible: nextVisible, privateVisible: nextVisible });
                  }}
                />
              </div>
              <label>Arrival instructions</label>
              <textarea className="input" value={form.arrivalInstructions} onChange={(e) => setForm({ ...form, arrivalInstructions: e.target.value })} />
              <label>Parking instructions</label>
              <textarea className="input" value={form.parkingInstructions} onChange={(e) => setForm({ ...form, parkingInstructions: e.target.value })} />
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
              <p className="muted">Enter times as 08:00, 0800, 8:00, or 800. Saved hours use 24-hour time.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <button className="button secondary" type="button" onClick={() => applyHoursPreset(weekdayHours([1, 2, 3, 4, 5]), 'Mon-Fri 08:00-17:00 applied. Save to confirm.')}>Mon-Fri 08:00-17:00</button>
                <button className="button secondary" type="button" onClick={() => applyHoursPreset(weekdayHours([1, 2, 3, 4, 5, 6]), 'Mon-Sat 08:00-17:00 applied. Save to confirm.')}>Mon-Sat 08:00-17:00</button>
                <button className="button secondary" type="button" onClick={() => applyHoursPreset(weekdayHours([0, 1, 2, 3, 4, 5, 6], 0, 1440), '24/7 hours applied. Save to confirm.')}>24/7</button>
                <button className="button secondary" type="button" onClick={() => applyHoursPreset(form.hours.map((hour: any) => hour.weekday === 0 || hour.weekday === 6 ? { ...hour, startMinute: null, endMinute: null, isClosed: true } : hour), 'Weekends closed. Save to confirm.')}>Closed weekends</button>
                <button className="button secondary" type="button" onClick={copyMondayToWeekdays}>Copy Monday to weekdays</button>
              </div>
              {form.hours.map((hour: any, idx: number) => (
                <div key={hour.weekday} style={{ display: 'grid', gridTemplateColumns: '80px 120px 120px 120px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <strong>{WEEKDAYS[hour.weekday]}</strong>
                  <input aria-label={`${WEEKDAYS[hour.weekday]} opening time`} className="input" inputMode="numeric" placeholder="08:00" disabled={hour.isClosed} value={hourInputs[`${idx}-startMinute`] ?? formatBusinessTime(hour.startMinute)} onChange={(e) => setHourInput(idx, 'startMinute', e.target.value)} />
                  <input aria-label={`${WEEKDAYS[hour.weekday]} closing time`} className="input" inputMode="numeric" placeholder="17:00" disabled={hour.isClosed} value={hourInputs[`${idx}-endMinute`] ?? formatBusinessTime(hour.endMinute)} onChange={(e) => setHourInput(idx, 'endMinute', e.target.value)} />
                  <label><input type="checkbox" checked={Boolean(hour.isClosed)} onChange={(e) => {
                    const isClosed = Boolean(e.target.checked);
                    const next = [...form.hours];
                    next[idx] = {
                      ...next[idx],
                      isClosed,
                      startMinute: isClosed ? null : next[idx].startMinute ?? 8 * 60,
                      endMinute: isClosed ? null : next[idx].endMinute ?? 17 * 60,
                    };
                    setForm({ ...form, hours: next });
                    setHourInputs({});
                  }} /> Closed</label>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) auto', gap: 8, marginTop: 12 }}>
                <select className="input" value={copyHoursLocationId} onChange={(event) => setCopyHoursLocationId(event.target.value)}>
                  <option value="">Copy hours from another location</option>
                  {items.filter((location) => location.id !== editingId).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
                <button className="button secondary" type="button" onClick={copyHoursFromLocation} disabled={!copyHoursLocationId}>Copy hours</button>
              </div>
              {editingId ? <button className="button secondary" style={{ marginTop: 8 }} type="button" onClick={() => void applyHoursToAllLocations()} disabled={saving}>Apply saved hours to all locations</button> : null}
              <p className="muted"><a href="/dashboard/booking/settings">Manage holiday closures and special booking dates</a></p>
            </>
          ) : null}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="button" data-testid="location-save" type="submit" disabled={!isFormValid || !isDirty || saving}>
              {saving ? 'Saving...' : editingId ? 'Save changes' : 'Save location'}
            </button>
            {editingId ? <button className="button secondary" type="button" disabled={saving} onClick={() => {
              const nextForm = createLocationForm(geoDefaults);
              setEditingId('');
              setForm(nextForm);
              setSavedSnapshot(JSON.stringify(nextForm));
              setStatus('');
              setError('');
            }}>Cancel edit</button> : null}
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
                {loc.metadataJson?.imageUrl ? (
                  <img
                    src={String(loc.metadataJson.imageUrl)}
                    alt=""
                    loading="lazy"
                    style={{ width: 92, height: 64, objectFit: 'cover', borderRadius: 12, marginBottom: 8 }}
                  />
                ) : null}
                <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 999, background: loc.color || '#C2410C', border: '1px solid currentColor' }} />
                  {loc.name}
                </strong>
                <p className="muted" style={{ margin: '4px 0 0 0' }}>
                  {[loc.code, loc.kind, loc.addressLine1, loc.addressLine2, loc.city, loc.state, loc.postalCode, loc.country].filter(Boolean).join(' • ')}
                </p>
                {advancedEnabled ? (
                  <p className="muted" style={{ margin: '4px 0 0 0' }}>
                    TZ: {loc.timezone || '—'} • Lead: {Number(loc.bookingLeadTimeMins || 0)} mins • Staff: {loc.memberships?.filter((membership: any) => membership.active).length || 0}
                  </p>
                ) : null}
                <p className="muted visibility-state-row" style={{ margin: '6px 0 0 0' }} data-testid="location-visibility-state">
                  <span className={`visibility-state-pill ${loc.metadataJson?.publicVisible === false ? 'is-hidden' : 'is-visible'}`}>
                    <VisibilityEyeIcon hidden={loc.metadataJson?.publicVisible === false} />
                    {loc.metadataJson?.publicVisible === false ? 'Hidden from public' : 'Visible publicly'}
                  </span>
                  <span className={`visibility-state-pill ${loc.metadataJson?.tradeVisible === false ? 'is-hidden' : 'is-visible'}`}>
                    <VisibilityEyeIcon hidden={loc.metadataJson?.tradeVisible === false} />
                    {loc.metadataJson?.tradeVisible === false ? 'Hidden from trade/private' : 'Trade-visible'}
                  </span>
                </p>
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
