import { useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';
import { isCommandCentreV1Enabled } from '../../lib/feature-flags';

const STATUS_LABELS: Array<{ key: string; label: string }> = [
  { key: 'OPEN', label: 'New' },
  { key: 'SCHEDULED', label: 'Booked' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'COMPLETED', label: 'Awaiting Approval' },
  { key: 'INVOICED', label: 'Invoiced' },
  { key: 'CANCELLED', label: 'Closed' },
];

export default function CommandCentrePage() {
  const enabled = isCommandCentreV1Enabled();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [locationId, setLocationId] = useState('all');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [board, setBoard] = useState<any>({ grouped: {}, counts: {} });
  const [selected, setSelected] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [bulkStatus, setBulkStatus] = useState('IN_PROGRESS');
  const [bulkLocation, setBulkLocation] = useState('all');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function load() {
    if (!enabled) return;
    try {
      const q = new URLSearchParams();
      if (search) q.set('search', search);
      if (status) q.set('status', status);
      if (locationId) q.set('locationId', locationId);
      const data = await apiFetch(`/jobs/board?${q.toString()}`);
      setBoard(data || { grouped: {}, counts: {} });
    } catch (err: any) {
      setError(err?.message || 'Failed to load board');
    }
  }

  useEffect(() => {
    load();
  }, [search, status, locationId, enabled]);

  const allJobs = useMemo(() => Object.values(board?.grouped || {}).flat() as any[], [board]);

  function toggleSelect(id: string, index: number, shiftKey: boolean) {
    setSelected((prev) => {
      if (shiftKey && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        const idsInRange = allJobs.slice(start, end + 1).map((j: any) => j.id);
        return Array.from(new Set([...prev, ...idsInRange]));
      }
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      return [...prev, id];
    });
    setLastSelectedIndex(index);
  }

  async function runBulk(operation: string, payload: Record<string, any>) {
    const explicitIds = Array.isArray(payload.jobIds) ? payload.jobIds : null;
    const ids = explicitIds && explicitIds.length ? explicitIds : selected;
    if (!ids.length) return;
    const destructive = operation === 'closeJobs';
    if (destructive && typeof window !== 'undefined') {
      if (!window.confirm(`Close ${ids.length} selected jobs?`)) return;
    }
    try {
      const res = await apiFetch('/jobs/bulk', {
        method: 'POST',
        body: JSON.stringify({
          jobIds: ids,
          operation,
          ...payload,
        }),
      });
      setToast(`Updated ${res?.successCount || 0} jobs`);
      setSelected([]);
      load();
    } catch (err: any) {
      setError(err?.message || 'Bulk operation failed');
    }
  }

  async function exportCsv() {
    const rows = ['jobRef,status,customer,vehicleReg,location'];
    for (const job of allJobs) {
      rows.push([job.jobRef, job.status, job.customerName, job.vehicleReg || '', job.location?.name || ''].map((v) => `"${String(v || '').replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'command-centre-jobs.csv';
    a.click();
    URL.revokeObjectURL(url);
    setToast('CSV exported');
  }

  function printPack() {
    if (typeof window === 'undefined') return;
    window.print();
  }

  if (!enabled) {
    return (
      <DashboardShell>
        <div className="card"><h1>Command Centre</h1><p className="muted">Feature is disabled.</p></div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="card" style={{ marginBottom: 14 }}>
        <h1 style={{ marginTop: 0 }}>Job Command Centre</h1>
        <p className="muted">Manage many jobs quickly from one screen.</p>
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
        {toast ? <p style={{ color: '#5eead4' }}>{toast}</p> : null}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="two-col">
          <div>
            <label>Search</label>
            <input className="input" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Job ref, customer, reg..." />
          </div>
          <div>
            <label>Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {STATUS_LABELS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label>Location</label>
            <input className="input" value={locationId} onChange={(e) => setLocationId(e.target.value || 'all')} placeholder="all or location id" />
          </div>
          <div>
            <label>View mode</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`button ${viewMode === 'kanban' ? '' : 'secondary'}`} onClick={() => setViewMode('kanban')} type="button">Kanban</button>
              <button className={`button ${viewMode === 'list' ? '' : 'secondary'}`} onClick={() => setViewMode('list')} type="button">List</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <strong>Bulk actions</strong>
        <p className="muted" style={{ marginTop: 6 }}>Selected jobs: {selected.length}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="input" style={{ margin: 0, width: 170 }} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {STATUS_LABELS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="button secondary" type="button" onClick={() => runBulk('setStatus', { status: bulkStatus })}>Change Status</button>
          <input className="input" style={{ margin: 0, width: 180 }} value={bulkLocation} onChange={(e) => setBulkLocation(e.target.value)} placeholder="location id or all" />
          <button className="button secondary" type="button" onClick={() => runBulk('setLocation', { locationId: bulkLocation })}>Move Location</button>
          <button className="button secondary" type="button" onClick={() => runBulk('closeJobs', {})}>Close</button>
          <button className="button secondary" type="button" onClick={exportCsv}>Export CSV</button>
          <button className="button secondary" type="button" onClick={printPack}>Print Pack</button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Jobs</h2>
          <div className="list">
            {allJobs.map((job: any, index: number) => (
              <div key={job.id} className="integration-card">
                <div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={selected.includes(job.id)} onChange={(e) => toggleSelect(job.id, index, Boolean((e.nativeEvent as any)?.shiftKey))} />
                    <strong>{job.jobRef}</strong>
                  </label>
                  <p className="muted" style={{ margin: '4px 0 0 0' }}>{job.customerName} • {job.status} • {job.location?.name || 'No location'}</p>
                </div>
                <div className="integration-actions">
                  <a className="button secondary" href={`/dashboard/jobs`}>Open</a>
                  <a className="button secondary" href={`/dashboard/jobs/new`}>Message</a>
                  <button className="button secondary" type="button" onClick={() => runBulk('setStatus', { status: 'COMPLETED', jobIds: [job.id] })}>Mark complete</button>
                  <a className="button secondary" href={`/dashboard/jobs`}>Generate PDF</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
          {STATUS_LABELS.map((column) => (
            <div key={column.key} className="card" style={{ padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>{column.label} ({board?.counts?.[column.key] || 0})</h3>
              <div className="list">
                {(board?.grouped?.[column.key] || []).map((job: any) => (
                  <div key={job.id} className="metric-card">
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={selected.includes(job.id)} onChange={(e) => toggleSelect(job.id, allJobs.findIndex((x: any) => x.id === job.id), Boolean((e.nativeEvent as any)?.shiftKey))} />
                      <strong>{job.jobRef}</strong>
                    </label>
                    <p className="muted" style={{ margin: '6px 0' }}>{job.customerName}</p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <a className="button secondary" href="/dashboard/jobs">Open</a>
                      <button className="button secondary" type="button" onClick={() => runBulk('setStatus', { status: 'COMPLETED', jobIds: [job.id] })}>Done</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
