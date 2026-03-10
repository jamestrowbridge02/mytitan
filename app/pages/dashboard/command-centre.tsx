import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import OnboardingCoach from '../../components/coach/OnboardingCoach';
import { OperatorNotice } from '../../components/feedback/OperatorNotice';
import { useOperatorNotice } from '../../components/feedback/useOperatorNotice';
import { DashboardShell } from '../../components/dashboard-shell';
import JobQuickActions from '../../components/command-centre/JobQuickActions';
import { ApiError, apiFetch } from '../../lib/api';
import { isCommandCentrePremiumV1Enabled, isCommandCentreV1Enabled } from '../../lib/feature-flags';
import OpsSignalsBar from '../../components/entity/OpsSignalsBar';
import { getJobSignals } from '../../lib/ops-signals';

const STATUS_LABELS: Array<{ key: string; label: string }> = [
  { key: 'OPEN', label: 'New' },
  { key: 'SCHEDULED', label: 'Booked' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'COMPLETED', label: 'Awaiting Approval' },
  { key: 'INVOICED', label: 'Invoiced' },
  { key: 'CANCELLED', label: 'Closed' },
];

type SavedView = {
  id: string;
  name: string;
  filtersJson: Record<string, any>;
  isDefault?: boolean;
};

function formatMoney(cents: number, currency = 'GBP') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format((cents || 0) / 100);
}

export default function CommandCentrePage() {
  const enabled = isCommandCentreV1Enabled();
  const premiumEnabled = isCommandCentrePremiumV1Enabled();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [locationIds, setLocationIds] = useState<string[]>(['all']);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [board, setBoard] = useState<any>({ grouped: {}, counts: {} });
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedCursor, setSelectedCursor] = useState(0);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [bulkStatus, setBulkStatus] = useState('IN_PROGRESS');
  const [bulkLocation, setBulkLocation] = useState('all');
  const [locations, setLocations] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState('');
  const [defaultViewApplied, setDefaultViewApplied] = useState(false);
  const [showSaveView, setShowSaveView] = useState(false);
  const [saveViewName, setSaveViewName] = useState('');
  const [openedJob, setOpenedJob] = useState<any>(null);
  const [savingView, setSavingView] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { notice, showSuccess, showError, clearNotice } = useOperatorNotice();

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!enabled) return;
    Promise.all([apiFetch('/locations').catch(() => []), apiFetch('/users').catch(() => [])]).then(([l, u]) => {
      setLocations(Array.isArray(l) ? l : []);
      setUsers(Array.isArray(u) ? u : []);
    });
    if (premiumEnabled) {
      apiFetch('/command-centre/views')
        .then((data) => setViews(Array.isArray(data) ? data : []))
        .catch(() => setViews([]));
    }
  }, [enabled, premiumEnabled]);

  useEffect(() => {
    if (!enabled || !premiumEnabled || defaultViewApplied || activeViewId || views.length === 0) return;
    const defaultView = views.find((view) => view?.isDefault);
    if (!defaultView?.id) return;
    applyView(defaultView.id);
    setSaveViewName(String(defaultView.name || ''));
    setDefaultViewApplied(true);
  }, [enabled, premiumEnabled, defaultViewApplied, activeViewId, views]);

  async function load() {
    if (!enabled) return;
    try {
      const q = new URLSearchParams();
      if (search) q.set('search', search);
      if (status) q.set('status', status);
      const selectedLocationIds = locationIds.filter((x) => x !== 'all');
      if (selectedLocationIds.length > 0) q.set('locationIds', selectedLocationIds.join(','));
      const data = await apiFetch(`/jobs/board?${q.toString()}`);
      setBoard(data || { grouped: {}, counts: {} });
      if (notice?.kind === 'error') clearNotice();
    } catch (err: any) {
      showError(err?.message || 'Failed to load board');
    }
  }

  useEffect(() => {
    load();
  }, [search, status, locationIds.join(','), enabled]);

  const allJobs = useMemo(() => Object.values(board?.grouped || {}).flat() as any[], [board]);
  const opsSummary = useMemo(() => {
    const summary = {
      cashAtRiskCents: 0,
      unpaidCount: 0,
      blockedCount: 0,
      unassignedCount: 0,
      overdueCount: 0,
    };
    for (const job of allJobs) {
      const statusValue = String(job?.status || '').toUpperCase();
      const total = Number(job?.totalCents || 0);
      const paid = Boolean(job?.invoicePaidAt || job?.paymentReceiptUrl);
      const unpaid = !paid && total > 0 && ['COMPLETED', 'INVOICED'].includes(statusValue);
      if (unpaid) {
        summary.cashAtRiskCents += total;
        summary.unpaidCount += 1;
      }
      const signals = getJobSignals(job);
      if (signals.blockedBy.length) summary.blockedCount += 1;
      if (signals.blockedBy.includes('Unassigned')) summary.unassignedCount += 1;
      if (signals.risks.includes('Overdue invoice')) summary.overdueCount += 1;
    }
    return summary;
  }, [allJobs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!enabled || !premiumEnabled) return;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement as HTMLElement)?.tagName || '')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setOpenedJob(null);
        setShowSaveView(false);
      }
      if (e.key.toLowerCase() === 'j') {
        setSelectedCursor((v) => Math.min(v + 1, Math.max(0, allJobs.length - 1)));
      }
      if (e.key.toLowerCase() === 'k') {
        setSelectedCursor((v) => Math.max(0, v - 1));
      }
      if (e.key === 'Enter' && allJobs[selectedCursor]) {
        setOpenedJob(allJobs[selectedCursor]);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && showSaveView) {
        e.preventDefault();
        saveView();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, allJobs, selectedCursor, showSaveView, saveViewName, search, status, locationIds.join(',')]);

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

  async function undoLastChange() {
    try {
      const res = await apiFetch('/jobs/undo-last', { method: 'POST' });
      if (res?.ok) {
        showSuccess(`Undid ${res?.count || 0} updates`);
        await load();
      } else {
        showSuccess(res?.message || 'Nothing to undo');
      }
    } catch (err: any) {
      showError(err?.message || 'Undo failed');
    }
  }

  async function runBulk(operation: string, payload: Record<string, any>) {
    if (bulkBusy) return;
    const explicitIds = Array.isArray(payload.jobIds) ? payload.jobIds : null;
    const ids = explicitIds && explicitIds.length ? explicitIds : selected;
    if (!ids.length) return;
    const destructive = operation === 'closeJobs';
    if (destructive && typeof window !== 'undefined') {
      if (!window.confirm(`Close ${ids.length} selected jobs?`)) return;
    }
    setBulkBusy(true);
    try {
      const res = await apiFetch('/jobs/bulk', {
        method: 'POST',
        body: JSON.stringify({ jobIds: ids, operation, ...payload }),
      });
      showSuccess(`Updated ${res?.successCount || 0} jobs. Undo?`);
      setSelected([]);
      await load();
    } catch (err: any) {
      showError(err?.message || 'Bulk operation failed');
    } finally {
      setBulkBusy(false);
    }
  }

  async function saveView() {
    if (savingView) return;
    setSavingView(true);
    const filters = {
      search,
      status,
      locationIds,
      viewMode,
    };
    try {
      if (activeViewId) {
        await apiFetch(`/command-centre/views/${activeViewId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: saveViewName || 'Saved view', filters }),
        });
      } else {
        await apiFetch('/command-centre/views', {
          method: 'POST',
          body: JSON.stringify({ name: saveViewName || 'Saved view', filters }),
        });
      }
      const data = await apiFetch('/command-centre/views');
      setViews(Array.isArray(data) ? data : []);
      setShowSaveView(false);
      showSuccess('View saved');
    } catch (err: any) {
      showError(err?.message || 'Failed to save view');
    } finally {
      setSavingView(false);
    }
  }

  function applyView(id: string) {
    setActiveViewId(id);
    const next = views.find((v) => v.id === id);
    if (!next) return;
    const f = next.filtersJson || {};
    setSearchInput(String(f.search || ''));
    setSearch(String(f.search || ''));
    setStatus(String(f.status || ''));
    setLocationIds(Array.isArray(f.locationIds) && f.locationIds.length ? f.locationIds : ['all']);
    setViewMode(f.viewMode === 'list' ? 'list' : 'kanban');
  }

  async function removeView() {
    if (!activeViewId) return;
    try {
      await apiFetch(`/command-centre/views/${activeViewId}`, { method: 'DELETE' });
      setViews((prev) => prev.filter((v) => v.id !== activeViewId));
      setActiveViewId('');
      showSuccess('View deleted');
    } catch (err: any) {
      showError(err?.message || 'Failed to delete view');
    }
  }

  async function patchJob(jobId: string, payload: Record<string, any>) {
    try {
      await apiFetch(`/jobs/${jobId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      showSuccess('Job updated. Undo?');
      await load();
      if (openedJob?.id === jobId) {
        const fresh = allJobs.find((j: any) => j.id === jobId);
        if (fresh) setOpenedJob(fresh);
      }
    } catch (err: any) {
      showError(err?.message || 'Update failed');
    }
  }

  async function updateJobStatus(jobId: string, nextStatus: string) {
    try {
      await apiFetch(`/jobs/${jobId}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
      showSuccess(`Job moved to ${nextStatus}`);
      await load();
    } catch (err: any) {
      showError(err instanceof ApiError && err.requestId ? `Status update failed. Support code: ${err.requestId}` : (err?.message || 'Status update failed'));
    }
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
        <OperatorNotice
          notice={notice}
          onDismiss={clearNotice}
          actions={premiumEnabled && notice?.kind === 'success' && notice.message.includes('Undo') ? <button className="button secondary" type="button" onClick={undoLastChange}>Undo</button> : undefined}
        />
      </div>

      <OnboardingCoach
        actions={{
          booking_to_job: [{ label: 'Open bookings', href: '/dashboard/bookings' }],
          start_job: [{ label: 'Open jobs', href: '/dashboard/jobs' }],
          collect_payment: [{ label: 'Review jobs', href: '/dashboard/jobs' }],
        }}
      />

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="two-col">
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>Cash at Risk</h3>
            {allJobs.length === 0 ? (
              <p className="muted">No job data yet.</p>
            ) : (
              <>
                <p style={{ fontSize: 22, margin: '6px 0' }}>{formatMoney(opsSummary.cashAtRiskCents)}</p>
                <p className="muted" style={{ marginTop: 0 }}>
                  {opsSummary.unpaidCount} unpaid job{opsSummary.unpaidCount === 1 ? '' : 's'} ready for collection.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link className="button secondary" href="/dashboard/jobs?filter=unpaid">View unpaid jobs</Link>
                  <Link className="button secondary" href="/dashboard/jobs?status=COMPLETED">View awaiting approval</Link>
                </div>
              </>
            )}
          </div>
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>Stuck Jobs</h3>
            {allJobs.length === 0 ? (
              <p className="muted">No job data yet.</p>
            ) : (
              <>
                <p style={{ fontSize: 22, margin: '6px 0' }}>{opsSummary.blockedCount}</p>
                <p className="muted" style={{ marginTop: 0 }}>
                  {opsSummary.unassignedCount} unassigned · {opsSummary.overdueCount} overdue invoice
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link className="button secondary" href="/dashboard/jobs?filter=unassigned">View unassigned</Link>
                  <Link className="button secondary" href="/dashboard/jobs?filter=overdue">View overdue invoices</Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="two-col">
          <div>
            <label>Search</label>
            <input ref={searchRef} className="input" data-testid="ccv1-search-input" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Job ref, customer, reg..." />
          </div>
          <div>
            <label>Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
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
            <label>View mode</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`button ${viewMode === 'kanban' ? '' : 'secondary'}`} onClick={() => setViewMode('kanban')} type="button">Kanban</button>
              <button className={`button ${viewMode === 'list' ? '' : 'secondary'}`} onClick={() => setViewMode('list')} type="button">List</button>
            </div>
          </div>
        </div>
        {premiumEnabled ? (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="input" data-testid="ccv1-saved-view-select" style={{ margin: 0, width: 260 }} value={activeViewId} onChange={(e) => applyView(e.target.value)}>
              <option value="">Quick switch saved view</option>
              {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <button className="button secondary" data-testid="ccv1-save-view-trigger" type="button" disabled={savingView} onClick={() => { setShowSaveView(true); setSaveViewName(''); }}>Save View</button>
            <button className="button secondary" data-testid="ccv1-delete-view" type="button" onClick={removeView} disabled={!activeViewId || savingView}>Delete View</button>
          </div>
        ) : null}
      </div>

      {showSaveView ? (
        <div aria-label="Save command centre view" className="card" data-testid="ccv1-save-view-panel" style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>Save view</h3>
          <input aria-label="Saved view name" className="input" data-testid="ccv1-save-view-input" value={saveViewName} onChange={(e) => setSaveViewName(e.target.value)} placeholder="View name" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="button" data-testid="ccv1-save-view-submit" type="button" disabled={savingView || !saveViewName.trim()} onClick={saveView}>{savingView ? 'Saving...' : 'Save'}</button>
            <button className="button secondary" data-testid="ccv1-save-view-cancel" type="button" disabled={savingView} onClick={() => setShowSaveView(false)}>Cancel</button>
          </div>
        </div>
      ) : null}

      <div className="card" data-testid="ccv1-bulk-bar" style={{ marginBottom: 14 }}>
        <strong>Bulk actions</strong>
        <p className="muted" data-testid="ccv1-selected-count" style={{ marginTop: 6 }}>Selected jobs: {selected.length}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="input" data-testid="ccv1-bulk-status-select" style={{ margin: 0, width: 170 }} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {STATUS_LABELS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="button secondary" data-testid="ccv1-bulk-status-action" type="button" disabled={bulkBusy || !selected.length} onClick={() => runBulk('setStatus', { status: bulkStatus })}>Change Status</button>
          <select className="input" data-testid="ccv1-bulk-location-select" style={{ margin: 0, width: 220 }} value={bulkLocation} onChange={(e) => setBulkLocation(e.target.value)}>
            <option value="all">All / none</option>
            {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>
          <button className="button secondary" data-testid="ccv1-bulk-location-action" type="button" disabled={bulkBusy || !selected.length} onClick={() => runBulk('setLocation', { locationId: bulkLocation })}>Move Location</button>
          <button className="button secondary" data-testid="ccv1-bulk-close-action" type="button" disabled={bulkBusy || !selected.length} onClick={() => runBulk('closeJobs', {})}>Close</button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Jobs</h2>
          <div className="list">
            {allJobs.map((job: any, index: number) => (
              <div key={job.id} className="integration-card" onClick={() => premiumEnabled && setOpenedJob(job)} style={{ cursor: 'pointer', outline: selectedCursor === index ? '2px solid #5eead4' : 'none' }}>
                <div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={selected.includes(job.id)} onChange={(e) => toggleSelect(job.id, index, Boolean((e.nativeEvent as any)?.shiftKey))} onClick={(e) => e.stopPropagation()} />
                    <strong>
                      <Link href={`/dashboard/jobs/${job.id}`} onClick={(e) => e.stopPropagation()}>
                        {job.jobRef}
                      </Link>
                    </strong>
                  </label>
                  <p className="muted" style={{ margin: '4px 0 0 0' }}>{job.customerName} • {job.status} • {job.location?.name || 'No location'}</p>
                  <OpsSignalsBar {...getJobSignals(job)} compact />
                  <JobQuickActions job={job} onStatusChange={updateJobStatus} compact />
                </div>
                {premiumEnabled ? (
                  <div className="integration-actions" onClick={(e) => e.stopPropagation()}>
                    <select className="input" value={job.status} onChange={(e) => patchJob(job.id, { status: e.target.value })}>
                      {STATUS_LABELS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    <select className="input" value={job.assignedUserId || ''} onChange={(e) => patchJob(job.id, { assignedUserId: e.target.value || null })}>
                      <option value="">Unassigned</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
                    </select>
                    <input className="input" type="date" value={job.invoiceDueAt ? String(job.invoiceDueAt).slice(0, 10) : ''} onChange={(e) => patchJob(job.id, { invoiceDueAt: e.target.value || null })} />
                  </div>
                ) : null}
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
                  <div key={job.id} className="metric-card" onClick={() => premiumEnabled && setOpenedJob(job)} style={{ cursor: 'pointer' }}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={selected.includes(job.id)} onChange={(e) => toggleSelect(job.id, allJobs.findIndex((x: any) => x.id === job.id), Boolean((e.nativeEvent as any)?.shiftKey))} onClick={(e) => e.stopPropagation()} />
                      <strong>
                        <Link href={`/dashboard/jobs/${job.id}`} onClick={(e) => e.stopPropagation()}>
                          {job.jobRef}
                        </Link>
                      </strong>
                    </label>
                    <p className="muted" style={{ margin: '6px 0' }}>{job.customerName}</p>
                    <OpsSignalsBar {...getJobSignals(job)} compact />
                    <JobQuickActions job={job} onStatusChange={updateJobStatus} compact />
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                      <button className="button secondary" type="button" onClick={() => patchJob(job.id, { status: 'COMPLETED' })}>Done</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {openedJob && premiumEnabled ? (
        <div className="card" style={{ position: 'fixed', right: 8, top: 80, width: 'min(420px,95vw)', zIndex: 40, maxHeight: '85vh', overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ marginTop: 0 }}>
              <Link href={`/dashboard/jobs/${openedJob.id}`}>{openedJob.jobRef}</Link>
            </h3>
            <button className="button secondary" type="button" onClick={() => setOpenedJob(null)}>Close</button>
          </div>
          <p className="muted">{openedJob.customerName}</p>
          <label>Status</label>
          <select className="input" value={openedJob.status || ''} onChange={(e) => patchJob(openedJob.id, { status: e.target.value })}>
            {STATUS_LABELS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <label>Assignee</label>
          <select className="input" value={openedJob.assignedUserId || ''} onChange={(e) => patchJob(openedJob.id, { assignedUserId: e.target.value || null })}>
            <option value="">Unassigned</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
          </select>
          <label>Due date</label>
          <input className="input" type="date" value={openedJob.invoiceDueAt ? String(openedJob.invoiceDueAt).slice(0, 10) : ''} onChange={(e) => patchJob(openedJob.id, { invoiceDueAt: e.target.value || null })} />
          <label>Notes</label>
          <textarea className="input" value={openedJob.pricingNotes || ''} onChange={(e) => setOpenedJob({ ...openedJob, pricingNotes: e.target.value })} />
          <button className="button secondary" type="button" onClick={() => patchJob(openedJob.id, { pricingNotes: openedJob.pricingNotes || null })}>Save Notes</button>
          <label>Customer contact</label>
          <input className="input" placeholder="Email" value={openedJob.customerEmail || ''} onChange={(e) => setOpenedJob({ ...openedJob, customerEmail: e.target.value })} />
          <input className="input" placeholder="Phone" value={openedJob.customerPhone || ''} onChange={(e) => setOpenedJob({ ...openedJob, customerPhone: e.target.value })} />
          <button className="button secondary" type="button" onClick={() => patchJob(openedJob.id, { customerEmail: openedJob.customerEmail || null, customerPhone: openedJob.customerPhone || null })}>Save Contact</button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="button secondary" href={`/dashboard/jobs/${openedJob.id}`}>Open job detail</Link>
            {openedJob.bookingId ? (
              <Link className="button secondary" href={`/dashboard/bookings/${openedJob.bookingId}`}>Open booking</Link>
            ) : (
              <Link className="button secondary" href={`/dashboard/bookings?jobId=${openedJob.id}`}>Booking link</Link>
            )}
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
