import { useEffect, useMemo, useRef, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';
import { isCommandCentreV2Enabled } from '../../lib/feature-flags';

const STATUS_LABELS: Array<{ key: string; label: string }> = [
  { key: 'OPEN', label: 'New' },
  { key: 'SCHEDULED', label: 'Booked' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'COMPLETED', label: 'Awaiting Approval' },
  { key: 'INVOICED', label: 'Invoiced' },
  { key: 'CANCELLED', label: 'Closed' },
];

export default function CommandCentreV2Page() {
  const enabled = isCommandCentreV2Enabled();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [locationIds, setLocationIds] = useState<string[]>(['all']);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [board, setBoard] = useState<any>({ grouped: {}, counts: {} });
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState('IN_PROGRESS');
  const [bulkLocation, setBulkLocation] = useState('all');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [locations, setLocations] = useState<any[]>([]);
  const [views, setViews] = useState<any[]>([]);
  const [activeViewId, setActiveViewId] = useState('');
  const [saveViewName, setSaveViewName] = useState('');
  const [showSaveView, setShowSaveView] = useState(false);
  const [openedJob, setOpenedJob] = useState<any>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function loadBoard() {
    if (!enabled) return;
    try {
      const q = new URLSearchParams();
      if (search) q.set('search', search);
      if (status) q.set('status', status);
      const selectedLocationIds = locationIds.filter((x) => x !== 'all');
      if (selectedLocationIds.length > 0) q.set('locationIds', selectedLocationIds.join(','));
      const data = await apiFetch(`/jobs/board-v2?${q.toString()}`);
      setBoard(data || { grouped: {}, counts: {} });
    } catch (err: any) {
      setError(err?.message || 'Failed to load board');
    }
  }

  async function loadViews() {
    try {
      const data = await apiFetch('/board-views');
      setViews(Array.isArray(data) ? data : []);
    } catch {
      setViews([]);
    }
  }

  useEffect(() => {
    if (!enabled) return;
    Promise.all([
      apiFetch('/locations').catch(() => []),
      loadViews(),
      loadBoard(),
    ]).then(([l]) => setLocations(Array.isArray(l) ? l : []));
  }, [enabled]);

  useEffect(() => {
    loadBoard();
  }, [search, status, locationIds.join(',')]);

  const allJobs = useMemo(() => Object.values(board?.grouped || {}).flat() as any[], [board]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!enabled) return;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement as HTMLElement)?.tagName || '')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setOpenedJob(null);
        setShowSaveView(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  function applyView(id: string) {
    setActiveViewId(id);
    const next = views.find((v) => v.id === id);
    if (!next) return;
    const f = next.filtersJson || {};
    setSearchInput(String(f.search || ''));
    setStatus(String(f.status || ''));
    setLocationIds(Array.isArray(f.locationIds) && f.locationIds.length ? f.locationIds : ['all']);
    setViewMode(f.viewType === 'list' ? 'list' : 'kanban');
  }

  async function saveView() {
    try {
      if (activeViewId) {
        await apiFetch(`/board-views/${activeViewId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: saveViewName || 'Saved view',
            filters: { search, status, locationIds, viewType: viewMode },
            viewType: viewMode,
          }),
        });
      } else {
        await apiFetch('/board-views', {
          method: 'POST',
          body: JSON.stringify({
            name: saveViewName || 'Saved view',
            filters: { search, status, locationIds, viewType: viewMode },
            viewType: viewMode,
          }),
        });
      }
      setToast('View saved');
      setShowSaveView(false);
      await loadViews();
    } catch (err: any) {
      setError(err?.message || 'Failed to save view');
    }
  }

  async function runBulk(operation: string, payload: Record<string, any>) {
    const ids = selected;
    if (!ids.length) return;
    try {
      const res = await apiFetch('/jobs/bulk-v2', {
        method: 'POST',
        body: JSON.stringify({ jobIds: ids, operation, ...payload }),
      });
      setToast(`Updated ${res?.successCount || 0} jobs. Undo available.`);
      setSelected([]);
      await loadBoard();
    } catch (err: any) {
      setError(err?.message || 'Bulk operation failed');
    }
  }

  async function patchJob(jobId: string, payload: Record<string, any>) {
    try {
      await apiFetch(`/jobs/${jobId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setToast('Job updated');
      await loadBoard();
    } catch (err: any) {
      setError(err?.message || 'Inline update failed');
    }
  }

  if (!enabled) {
    return (
      <DashboardShell>
        <div className="card"><h1>Command Centre V2</h1><p className="muted">Feature is disabled.</p></div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="card" style={{ marginBottom: 14 }}>
        <h1 style={{ marginTop: 0 }}>Command Centre V2</h1>
        <p className="muted">Operations brain: board, bulk, reminders, inline updates.</p>
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
        {toast ? <p style={{ color: '#5eead4' }}>{toast}</p> : null}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="two-col">
          <div>
            <label>Search</label>
            <input ref={searchRef} className="input" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <div>
            <label>Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {STATUS_LABELS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label>Locations</label>
            <select
              multiple
              className="input"
              value={locationIds}
              onChange={(e) => {
                const values = Array.from(e.target.selectedOptions).map((x) => x.value);
                setLocationIds(values.length ? values : ['all']);
              }}
            >
              <option value="all">All locations</option>
              {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
            </select>
          </div>
          <div>
            <label>Mode</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`button ${viewMode === 'kanban' ? '' : 'secondary'}`} type="button" onClick={() => setViewMode('kanban')}>Kanban</button>
              <button className={`button ${viewMode === 'list' ? '' : 'secondary'}`} type="button" onClick={() => setViewMode('list')}>List</button>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="input" style={{ margin: 0, width: 260 }} value={activeViewId} onChange={(e) => applyView(e.target.value)}>
            <option value="">Saved views</option>
            {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button className="button secondary" type="button" onClick={() => { setShowSaveView(true); setSaveViewName(''); }}>Save view</button>
        </div>
      </div>

      {showSaveView ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <input className="input" value={saveViewName} onChange={(e) => setSaveViewName(e.target.value)} placeholder="View name" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="button" type="button" onClick={saveView}>Save</button>
            <button className="button secondary" type="button" onClick={() => setShowSaveView(false)}>Cancel</button>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 14 }}>
        <strong>Bulk bar</strong>
        <p className="muted">Selected: {selected.length}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="input" style={{ margin: 0, width: 170 }} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {STATUS_LABELS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="button secondary" type="button" onClick={() => runBulk('setStatus', { status: bulkStatus })}>Status</button>
          <select className="input" style={{ margin: 0, width: 220 }} value={bulkLocation} onChange={(e) => setBulkLocation(e.target.value)}>
            <option value="all">All / none</option>
            {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>
          <button className="button secondary" type="button" onClick={() => runBulk('setLocation', { locationId: bulkLocation })}>Location</button>
          <button className="button secondary" type="button" onClick={() => runBulk('closeJobs', {})}>Close</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        {viewMode === 'list' ? (
          <div className="list">
            {allJobs.map((job: any) => (
              <div key={job.id} className="integration-card">
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={selected.includes(job.id)} onChange={() => setSelected((prev) => prev.includes(job.id) ? prev.filter((x) => x !== job.id) : [...prev, job.id])} />
                  <strong>{job.jobRef}</strong>
                </label>
                <div>
                  <button className="button secondary" type="button" onClick={() => setOpenedJob(job)}>Open</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
            {Object.entries(board.grouped || {}).map(([col, jobs]: [string, any]) => (
              <div key={col} className="card" style={{ padding: 12 }}>
                <strong>{col} ({Array.isArray(jobs) ? jobs.length : 0})</strong>
                <div className="list" style={{ marginTop: 8 }}>
                  {(jobs || []).map((job: any) => (
                    <button key={job.id} type="button" className="integration-card" onClick={() => setOpenedJob(job)}>
                      <span>{job.jobRef}</span>
                      <span className="muted">{job.customerName || 'Customer'}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {openedJob ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>Side Panel</h3>
          <p className="muted">{openedJob.jobRef} • {openedJob.customerName}</p>
          <label>Status</label>
          <select className="input" value={openedJob.status} onChange={(e) => setOpenedJob({ ...openedJob, status: e.target.value })}>
            {STATUS_LABELS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="button" type="button" onClick={() => patchJob(openedJob.id, { status: openedJob.status })}>Inline save</button>
          <button className="button secondary" type="button" onClick={() => setOpenedJob(null)}>Close</button>
        </div>
      ) : null}
    </DashboardShell>
  );
}
