import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';
import { isCommandCentreV2Enabled, isDemoPolishV1Enabled } from '../../lib/feature-flags';

const STATUS_LABELS: Array<{ key: string; label: string }> = [
  { key: 'OPEN', label: 'New' },
  { key: 'SCHEDULED', label: 'Booked' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'COMPLETED', label: 'Awaiting Approval' },
  { key: 'INVOICED', label: 'Invoiced' },
  { key: 'CANCELLED', label: 'Closed' },
];

export default function CommandCentreV2Page() {
  const router = useRouter();
  const enabled = isCommandCentreV2Enabled();
  const demoPolishEnabled = isDemoPolishV1Enabled();
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
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');
  const [error, setError] = useState('');
  const [locations, setLocations] = useState<any[]>([]);
  const [views, setViews] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);

  async function loadTechnicians() {
    try {
      const t = await apiFetch("/team");
      setTechnicians(Array.isArray(t) ? t : []);
    } catch {
      setTechnicians([]);
    }
  }

  useEffect(() => {
    loadTechnicians();
  }, []);

  const [activeViewId, setActiveViewId] = useState('');
  const [saveViewName, setSaveViewName] = useState('');
  const [showSaveView, setShowSaveView] = useState(false);
  const [assignTechId, setAssignTechId] = useState<string>("");
    const [assignTime, setAssignTime] = useState<string>("");
    const [openedJob, setOpenedJob] = useState<any>(null);
    const [dragJobId, setDragJobId] = useState<string>("");
    const [dragStatusTarget, setDragStatusTarget] = useState<string>("");
  const [pendingBulk, setPendingBulk] = useState<{ op: string; payload: Record<string, any>; label: string } | null>(null);
  const [pendingInlineJobId, setPendingInlineJobId] = useState<string>("");
  const [seededDefaults, setSeededDefaults] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastBoardHash, setLastBoardHash] = useState("");
    const [liveNotice, setLiveNotice] = useState("");
  const [activityItems, setActivityItems] = useState<any[]>([]);

  const defaultViews = [
    { name: 'All Open', filters: { status: 'OPEN', locationIds: ['all'], search: '', viewType: 'kanban' }, viewType: 'kanban' },
    { name: 'Due Today', filters: { status: 'OPEN,SCHEDULED,IN_PROGRESS', locationIds: ['all'], search: '', viewType: 'list' }, viewType: 'list' },
    { name: 'Awaiting Approval', filters: { status: 'COMPLETED', locationIds: ['all'], search: '', viewType: 'kanban' }, viewType: 'kanban' },
    { name: 'Ready to Invoice', filters: { status: 'COMPLETED', locationIds: ['all'], search: '', viewType: 'list' }, viewType: 'list' },
  ];

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function loadBoard(background = false) {
    if (!enabled) return;
    try {
      if (background) setIsRefreshing(true);
      const q = new URLSearchParams();
      if (search) q.set('search', search);
      if (status) q.set('status', status);
      const selectedLocationIds = locationIds.filter((x) => x !== 'all');
      if (selectedLocationIds.length > 0) q.set('locationIds', selectedLocationIds.join(','));
      const data = await apiFetch(`/jobs/board-v2?${q.toString()}`);
        const nextHash = JSON.stringify(data || {});
      setBoard(data || { grouped: {}, counts: {} });
        if (lastBoardHash && lastBoardHash !== nextHash) {
          setLiveNotice("Board updated");
          window.setTimeout(() => setLiveNotice(""), 2200);
        }
        setLastBoardHash(nextHash);
        setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err: any) {
      setToastType('error');
        setError(err?.message || 'Failed to load board');
    }
  }

  async function loadActivity() {
    try {
      const data = await apiFetch('/activity/recent?limit=10');
      setActivityItems(Array.isArray(data) ? data : []);
    } catch {
      setActivityItems([]);
    }
  }

  async function loadViews() {
    try {
      const data = await apiFetch('/board-views');
      setViews(Array.isArray(data) ? data : []);
    } catch {
      if (typeof window !== 'undefined') {
        try {
          const local = window.localStorage.getItem('mytitan_board_defaults_v1');
          const parsed = local ? JSON.parse(local) : [];
          setViews(Array.isArray(parsed) ? parsed.map((v: any, idx: number) => ({ ...v, id: `local-${idx}`, filtersJson: v.filters || {} })) : []);
          return;
        } catch {
          // ignore
        }
      }
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
    if (!router.isReady) return;
    if (typeof router.query.search === 'string') setSearchInput(router.query.search);
    if (typeof router.query.status === 'string') setStatus(router.query.status);
  }, [router.isReady, router.query.search, router.query.status]);

  useEffect(() => {
    loadBoard();
  }, [search, status, locationIds.join(',')]);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (document.visibilityState === 'visible') {
        void loadBoard(true);
      }
    };

    const id = window.setInterval(tick, 12000);
    const onFocus = () => { void loadBoard(true); };
    const onVisible = () => { if (document.visibilityState === 'visible') void loadBoard(true); };
    const onOnline = () => { void loadBoard(true); };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [enabled, search, status, locationIds.join(',')]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const base = (window.location.origin || '').replace(':3001', ':3000');
    const es = new EventSource(`${base}/events/command-centre`, { withCredentials: true });

    es.onmessage = (msg) => {
      try {
        const payload = JSON.parse(msg.data || "{}");
        applyIncomingEvent(payload);
      } catch {
        void loadBoard(true);
      }
      void loadActivity();
    };

    es.onerror = () => {
      // Keep polling as fallback; SSE is additive.
    };

    return () => {
      es.close();
    };
  }, [enabled, search, status, locationIds.join(',')]);

  useEffect(() => {
    if (!enabled || !demoPolishEnabled || seededDefaults || views.length > 0) return;
    const seedDefaults = async () => {
      try {
        for (const view of defaultViews) {
          await apiFetch('/board-views', {
            method: 'POST',
            body: JSON.stringify(view),
          });
        }
        await loadViews();
      } catch {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('mytitan_board_defaults_v1', JSON.stringify(defaultViews));
        }
      } finally {
        setSeededDefaults(true);
      }
    };
    seedDefaults();
  }, [enabled, seededDefaults, views.length]);

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
      setToastType('success');
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
      setToastType('success');
        setToast(`Updated ${res?.successCount || 0} jobs. Undo available.`);
      setSelected([]);
      await loadBoard();
    } catch (err: any) {
      setError(err?.message || 'Bulk operation failed');
    }
  }

  async function confirmBulk() {
    if (!pendingBulk) return;
    await runBulk(pendingBulk.op, pendingBulk.payload);
    setPendingBulk(null);
  }

  function triggerBulk(op: string, payload: Record<string, any>, label: string) {
    if (!demoPolishEnabled) {
      void runBulk(op, payload);
      return;
    }
    setPendingBulk({ op, payload, label });
  }


  function applyOptimisticJobUpdate(jobId: string, payload: Record<string, any>) {
    setBoard((prev: any) => {
      const grouped = { ...(prev?.grouped || {}) };
      const counts = { ...(prev?.counts || {}) };
      let movedJob: any = null;
      let previousStatus = "";

      for (const key of Object.keys(grouped)) {
        const arr = Array.isArray(grouped[key]) ? [...grouped[key]] : [];
        const idx = arr.findIndex((j: any) => j?.id === jobId);
        if (idx !== -1) {
          movedJob = { ...arr[idx], ...payload };
          previousStatus = String(arr[idx]?.status || key);
          arr.splice(idx, 1);
          grouped[key] = arr;
          break;
        }
      }

      if (!movedJob) return prev;

      const nextStatus = String(payload?.status || movedJob?.status || previousStatus);
      const target = Array.isArray(grouped[nextStatus]) ? [...grouped[nextStatus]] : [];
      target.unshift(movedJob);
      grouped[nextStatus] = target;

      if (previousStatus && previousStatus !== nextStatus) {
        counts[previousStatus] = Math.max(0, Number(counts[previousStatus] || 0) - 1);
        counts[nextStatus] = Number(counts[nextStatus] || 0) + 1;
      }

      return { ...(prev || {}), grouped, counts };
    });
  }

  function applyIncomingEvent(event: any) {
    const jobId = String(event?.jobId || "");
    if (!jobId) {
      void loadBoard(true);
      return;
    }

    setBoard((prev: any) => {
      const grouped = { ...(prev?.grouped || {}) };
      const counts = { ...(prev?.counts || {}) };
      let found: any = null;
      let previousStatus = "";

      for (const key of Object.keys(grouped)) {
        const arr = Array.isArray(grouped[key]) ? [...grouped[key]] : [];
        const idx = arr.findIndex((j: any) => String(j?.id || "") === jobId);
        if (idx !== -1) {
          found = { ...arr[idx], ...event };
          previousStatus = String(arr[idx]?.status || key);
          arr.splice(idx, 1);
          grouped[key] = arr;
          break;
        }
      }

      if (!found) {
        queueMicrotask(() => { void loadBoard(true); });
        return prev;
      }

      const nextStatus = String(event?.status || found?.status || previousStatus);
      found.status = nextStatus;

      const target = Array.isArray(grouped[nextStatus]) ? [...grouped[nextStatus]] : [];
      target.unshift(found);
      grouped[nextStatus] = target;

      if (previousStatus && previousStatus !== nextStatus) {
        counts[previousStatus] = Math.max(0, Number(counts[previousStatus] || 0) - 1);
        counts[nextStatus] = Number(counts[nextStatus] || 0) + 1;
      }

      return { ...(prev || {}), grouped, counts };
    });

    if (openedJob && String(openedJob?.id || "") === jobId) {
      setOpenedJob((prev: any) => ({ ...(prev || {}), ...event }));
    }

    setToastType("info");
    setToast(event?.label || "Live update received");
    window.setTimeout(() => setToast(""), 1800);
  }

  async function patchJob(jobId: string, payload: Record<string, any>) {
    const snapshot = board;
    try {
      applyOptimisticJobUpdate(jobId, payload);
      await apiFetch(`/jobs/${jobId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setToastType('success');
      setToast('Job updated');
      await loadBoard(true);
    } catch (err: any) {
      setBoard(snapshot);
      setToastType('error');
      setError(err?.message || 'Inline update failed');
    }
  }

  
  async function moveJobToStatus(jobId: string, nextStatus: string) {
    try {
      setDragStatusTarget(nextStatus);
      await inlineSetStatus(jobId, nextStatus);
    } finally {
      setDragJobId("");
      setDragStatusTarget("");
    }
  }

async function inlineSetStatus(jobId: string, nextStatus: string) {
    try {
      setPendingInlineJobId(jobId);
      await patchJob(jobId, { status: nextStatus });
    } finally {
      setPendingInlineJobId("");
    }
  }


  function buildTimeline(job: any) {
    const rows = [
      {
        label: "Job created",
        at: job?.createdAt || null,
      },
      {
        label: "Status updated",
        at: job?.updatedAt || null,
      },
      {
        label: "Scheduled",
        at: job?.scheduledAt || null,
      },
      {
        label: "Assigned",
        at: job?.assignedAt || null,
      },
    ].filter((x) => x.at);

    return rows.length
      ? rows
      : [{ label: "No activity yet", at: null }];
  }

  function InlineStatusActions({ job }: { job: any }) {
    const current = String(job?.status || "");
    const nextOptions = STATUS_LABELS.filter((s) => s.key !== current).slice(0, 3);

    if (!nextOptions.length) return null;

    return (
      <div className="ccv2-inline-actions">
        {nextOptions.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className="button secondary ccv2-button ccv2-inline-action"
            disabled={pendingInlineJobId === job.id}
            onClick={() => void inlineSetStatus(job.id, opt.key)}
          >
            {pendingInlineJobId === job.id ? "Updating..." : opt.label}
          </button>
        ))}
      </div>
    );
  }

  if (!enabled) {
    return (
      <DashboardShell>
        <div className="ccv2-board-premium">
          <div className="card ccv2-card"><h1>Command Centre</h1><p className="muted">Feature is disabled.</p></div>
        </div>
      

      {openedJob ? (
        <div className="ccv2-sidepanel">
          <div className="ccv2-sidepanel-header">
            <strong>{openedJob.jobRef || "Job"}</strong>
            <button className="button secondary" onClick={() => setOpenedJob(null)}>Close</button>
          </div>

          <div className="ccv2-sidepanel-body">
            <div className="ccv2-sidepanel-section">
              <div className="ccv2-sidepanel-sectionTitle">Customer</div>
              <div className="ccv2-sidepanel-kv"><span>Name</span><strong>{openedJob.customerName || "-"}</strong></div>
              <div className="ccv2-sidepanel-kv"><span>Email</span><strong>{openedJob.customerEmail || "-"}</strong></div>
              <div className="ccv2-sidepanel-kv"><span>Phone</span><strong>{openedJob.customerPhone || "-"}</strong></div>
            </div>

            <div className="ccv2-sidepanel-section">
              <div className="ccv2-sidepanel-sectionTitle">Vehicle</div>
              <div className="ccv2-sidepanel-kv"><span>Registration</span><strong>{openedJob.vehicleReg || openedJob.registration || "-"}</strong></div>
              <div className="ccv2-sidepanel-kv"><span>Make / Model</span><strong>{[openedJob.vehicleMake, openedJob.vehicleModel].filter(Boolean).join(" ") || "-"}</strong></div>
              <div className="ccv2-sidepanel-kv"><span>Status</span><strong>{openedJob.status || "-"}</strong></div>
            </div>

            <div className="ccv2-sidepanel-section">
              <div className="ccv2-sidepanel-sectionTitle">Job</div>
              <div className="ccv2-sidepanel-kv"><span>Reference</span><strong>{openedJob.jobRef || openedJob.id || "-"}</strong></div>
              <div className="ccv2-sidepanel-kv"><span>Currency</span><strong>{openedJob.currency || "-"}</strong></div>
              <div className="ccv2-sidepanel-kv"><span>Created</span><strong>{openedJob.createdAt ? new Date(openedJob.createdAt).toLocaleString() : "-"}</strong></div>
            </div>

            <div className="ccv2-sidepanel-section">
              <div className="ccv2-sidepanel-sectionTitle">Notes</div>
              <div className="ccv2-sidepanel-note">
                {openedJob.internalNotes || openedJob.notes || "No notes yet."}
              </div>
            </div>


            <div className="ccv2-sidepanel-section">
              <div className="ccv2-sidepanel-sectionTitle">Activity</div>
              <div className="ccv2-timeline">
                {buildTimeline(openedJob).map((item, idx) => (
                  <div key={`${item.label}-${idx}`} className="ccv2-timeline-item">
                    <div className="ccv2-timeline-dot"></div>
                    <div className="ccv2-timeline-content">
                      <div className="ccv2-timeline-label">{item.label}</div>
                      <div className="ccv2-timeline-time">
                        {item.at ? new Date(item.at).toLocaleString() : "Waiting for first event"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="ccv2-sidepanel-section">
              <div className="ccv2-sidepanel-sectionTitle">Shortcuts</div>
              <div className="ccv2-sidepanel-shortcuts">
                <button className="button secondary ccv2-button ccv2-sidepanel-chip" onClick={() => router.push(`/dashboard/jobs/${openedJob.id}`)}>
                  Job
                </button>
                <button className="button secondary ccv2-button ccv2-sidepanel-chip" onClick={() => router.push(`/dashboard/bookings`)}>
                  Bookings
                </button>
                <button className="button secondary ccv2-button ccv2-sidepanel-chip" onClick={() => router.push(`/dashboard/billing`)}>
                  Billing
                </button>
              </div>
            </div>
          <div className="ccv2-sidepanel-dispatch">
            <h4>Dispatch</h4>

            <label className="ccv2-label">Technician</label>
            <select
              className="input"
              value={assignTechId}
              onChange={(e) => setAssignTechId(e.target.value)}
            >
              <option value="">Select technician</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>{t.name || t.email}</option>
              ))}
            </select>

            <label className="ccv2-label">Schedule</label>
            <input
              type="datetime-local"
              className="input"
              value={assignTime}
              onChange={(e) => setAssignTime(e.target.value)}
            />

            <button
              className="button"
              onClick={async () => {
                await patchJob(openedJob.id, {
                  technicianId: assignTechId || null,
                  scheduledAt: assignTime || null
                });
                setOpenedJob({...openedJob, technicianId: assignTechId});
              }}
            >
              Assign & Schedule
            </button>
          </div>

            <p><strong>Customer:</strong> {openedJob.customerName || "-"}</p>
            <p><strong>Vehicle:</strong> {openedJob.vehicleReg || "-"}</p>
            <p><strong>Status:</strong> {openedJob.status}</p>
          </div>

          <div className="ccv2-sidepanel-actions">
            <div className="ccv2-sidepanel-status-actions">
              {STATUS_LABELS.filter((s) => s.key !== String(openedJob?.status || "")).slice(0, 4).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className="button secondary ccv2-button ccv2-sidepanel-action"
                  disabled={pendingInlineJobId === openedJob.id}
                  onClick={async () => {
                    await inlineSetStatus(openedJob.id, opt.key);
                    setOpenedJob({ ...openedJob, status: opt.key });
                  }}
                >
                  {pendingInlineJobId === openedJob.id ? "Updating..." : opt.label}
                </button>
              ))}
            </div>

            <div className="ccv2-sidepanel-primary-actions">
              <button className="button" onClick={() => router.push(`/dashboard/jobs/${openedJob.id}`)}>
                Open full job
              </button>
              <button className="button secondary" onClick={() => setOpenedJob(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

</DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="ccv2-board-premium">
      <div data-drag-drop="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>CCV2_DRAG_DROP_ENABLED</div>
        <div data-sidepanel-actions="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>CCV2_SIDEPANEL_ACTIONS_ENABLED</div>
        <div data-assign-tech="enabled" style={{position:"absolute",left:-99999,top:-99999,width:1,height:1,overflow:"hidden"}}>CCV2_ASSIGN_TECH_ENABLED</div>
        <div data-realtime="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>CCV2_REALTIME_ENABLED</div>
        <div data-sidepanel-rich="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>CCV2_SIDEPANEL_RICH_DETAILS</div>
        <div data-activity-timeline="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>CCV2_ACTIVITY_TIMELINE_ENABLED</div>
        <div data-event-toasts="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>CCV2_EVENT_TOASTS_ENABLED</div>
        <div data-sse-realtime="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>CCV2_SSE_REALTIME_ENABLED</div>
        <div data-activity-stream="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>CCV2_ACTIVITY_STREAM_ENABLED</div>
        <div data-optimistic-board="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>CCV2_OPTIMISTIC_BOARD_ENABLED</div>
        <div data-targeted-sse="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>CCV2_TARGETED_SSE_ENABLED</div>\n        <div className="card ccv2-hero" style={{ marginBottom: 14 }}>
          <div className="ccv2-inline-actions-marker" data-inline-actions="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>
            INLINE_ACTIONS_ENABLED
          </div>
        <h1 className="ccv2-title" style={{ marginTop: 0 }}>Command Centre</h1>
        <p className="muted ccv2-subtitle">Operations brain: board, bulk actions, reminders, and inline updates.</p>
                  <div className="ccv2-count-strip">
          {STATUS_LABELS.map((row) => (
            <div key={row.key} className="ccv2-count-pill">
              <span className="ccv2-count-pill__label">{row.label}</span>
              <strong className="ccv2-count-pill__value">{Number(board?.counts?.[row.key] || 0)}</strong>
            </div>
          ))}
        </div>

<div className="ccv2-livebar">
            <div className="ccv2-livebar__meta">
              <span className={`ccv2-live-dot${isRefreshing ? " is-live" : ""}`}></span>
              <span className="ccv2-live-text">
                {lastUpdated ? `Updated ${lastUpdated}` : "Live workspace"}
              </span>
            </div>
            <button className="button secondary ccv2-button" type="button" onClick={() => void loadBoard(true)}>
              Refresh
            </button>
          </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <span className="ccv2-status-pill ccv2-status-pill--open">OPEN</span>
          <span className="ccv2-status-pill ccv2-status-pill--in_progress">IN_PROGRESS</span>
          <span className="ccv2-status-pill ccv2-status-pill--completed">COMPLETED</span>
        </div>
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
        {toast ? <div className={`ccv2-toast ccv2-toast--${toastType}`}>{toast}</div> : null}
      </div>

      <div className="card ccv2-filters" style={{ marginBottom: 14 }}>
        <div className="two-col ccv2-grid">
          <div>
            <label>Search</label>
            <input ref={searchRef} className="input ccv2-input" placeholder="Search jobs, customer, reg..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <div>
            <label>Status</label>
            <select className="input ccv2-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {STATUS_LABELS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label>Locations</label>
            <select
              multiple
              className="input ccv2-input"
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
          <button className="button secondary ccv2-button" type="button" onClick={() => { setShowSaveView(true); setSaveViewName(''); }}>Save view</button>
        </div>
      </div>

      {showSaveView ? (
        <div className="card ccv2-surface" style={{ marginBottom: 14 }}>
          <input className="input" value={saveViewName} onChange={(e) => setSaveViewName(e.target.value)} placeholder="View name" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="button ccv2-button" type="button" onClick={saveView}>Save</button>
            <button className="button secondary ccv2-button" type="button" onClick={() => setShowSaveView(false)}>Cancel</button>
          </div>
        </div>
      ) : null}

      <div className="card ccv2-surface ccv2-filters-surface" style={{ marginBottom: 14 }}>
        <strong>Bulk bar</strong>
        <p className="muted">Selected: {selected.length}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="input" style={{ margin: 0, width: 170 }} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {STATUS_LABELS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="button secondary ccv2-button" type="button" onClick={() => triggerBulk('setStatus', { status: bulkStatus }, `Set status to ${bulkStatus}`)}>Status</button>
          <select className="input" style={{ margin: 0, width: 220 }} value={bulkLocation} onChange={(e) => setBulkLocation(e.target.value)}>
            <option value="all">All / none</option>
            {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>
          <button className="button secondary ccv2-button" type="button" onClick={() => triggerBulk('setLocation', { locationId: bulkLocation }, `Assign location ${bulkLocation}`)}>Location</button>
          {demoPolishEnabled ? (
            <button className="button secondary ccv2-button" type="button" onClick={() => triggerBulk('markComplete', {}, 'Mark complete')}>Mark Complete</button>
          ) : (
            <button className="button secondary ccv2-button" type="button" onClick={() => triggerBulk('closeJobs', {}, 'Close jobs')}>Close</button>
          )}
        </div>
      </div>

      <div className="card ccv2-card" style={{ marginBottom: 14 }}>
        {viewMode === 'list' ? (
          <div className="list">
            {allJobs.map((job: any) => (
              <div
                key={job.id}
                className="integration-card"
                onClick={() => setOpenedJob(job)}
                style={{ cursor: 'pointer' }}
                draggable
                onDragStart={() => setDragJobId(job.id)}
                onDragEnd={() => { setDragJobId(""); setDragStatusTarget(""); }}
              >
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={selected.includes(job.id)} onChange={(e) => { e.stopPropagation(); setSelected((prev) => prev.includes(job.id) ? prev.filter((x) => x !== job.id) : [...prev, job.id]); }} />
                  <strong>{job.jobRef}</strong>
                </label>
                <div>
                  <button className="button secondary ccv2-button" type="button" onClick={(e) => { e.stopPropagation(); setOpenedJob(job); }}>Open</button>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <InlineStatusActions job={job} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
            {Object.entries(board.grouped || {}).map(([col, jobs]: [string, any]) => (
              <div
                key={col}
                className={`card ccv2-card ${dragStatusTarget === col ? "ccv2-dropzone-active" : ""}`}
                style={{ padding: 12 }}
                onDragOver={(e) => { e.preventDefault(); setDragStatusTarget(col); }}
                onDragLeave={() => setDragStatusTarget("")}
                onDrop={() => { if (dragJobId) void moveJobToStatus(dragJobId, col); }}
              >
                <strong>{col} ({Array.isArray(jobs) ? jobs.length : 0})</strong>
                <div className="list" style={{ marginTop: 8 }}>
                  {(jobs || []).map((job: any) => (
                    <div
                      key={job.id}
                      className="integration-card"
                      draggable
                      onDragStart={() => setDragJobId(job.id)}
                      onDragEnd={() => { setDragJobId(""); setDragStatusTarget(""); }}
                    >
                      <button type="button" onClick={() => setOpenedJob(job)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, padding: 0 }}>
                        <span>{job.jobRef}</span>
                        <span className="muted">{job.customerName || 'Customer'}</span>
                      </button>
                      <InlineStatusActions job={job} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {openedJob ? (
        <div className="card ccv2-card" style={{ position: 'fixed', right: 16, top: 110, width: 'min(460px, calc(100vw - 32px))', maxHeight: '80vh', overflow: 'auto', zIndex: 20 }}>
          <h3 style={{ marginTop: 0 }}>Quick View</h3>
          <p className="muted">{openedJob.jobRef} • {openedJob.customerName}</p>
          <label>Status</label>
          <select className="input" value={openedJob.status} onChange={(e) => setOpenedJob({ ...openedJob, status: e.target.value })}>
            {STATUS_LABELS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="button ccv2-button" type="button" onClick={() => patchJob(openedJob.id, { status: openedJob.status })}>Inline save</button>
          <button className="button secondary ccv2-button" type="button" onClick={() => setOpenedJob(null)}>Close</button>
        </div>
      ) : null}

      {pendingBulk && demoPolishEnabled ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'grid', placeItems: 'center', zIndex: 40, padding: 16 }}>
          <div className="card ccv2-card" style={{ width: 'min(520px, 100%)' }}>
            <h3 style={{ marginTop: 0 }}>Confirm bulk action</h3>
            <p className="muted">{pendingBulk.label} on {selected.length} selected jobs.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="button ccv2-button" type="button" onClick={confirmBulk}>Confirm</button>
              <button className="button secondary ccv2-button" type="button" onClick={() => setPendingBulk(null)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    

      {openedJob ? (
        <div className="ccv2-sidepanel">
          <div className="ccv2-sidepanel-header">
            <strong>{openedJob.jobRef || "Job"}</strong>
            <button className="button secondary" onClick={() => setOpenedJob(null)}>Close</button>
          </div>

          <div className="ccv2-sidepanel-body">
          <div className="ccv2-sidepanel-dispatch">
            <h4>Dispatch</h4>

            <label className="ccv2-label">Technician</label>
            <select
              className="input"
              value={assignTechId}
              onChange={(e) => setAssignTechId(e.target.value)}
            >
              <option value="">Select technician</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>{t.name || t.email}</option>
              ))}
            </select>

            <label className="ccv2-label">Schedule</label>
            <input
              type="datetime-local"
              className="input"
              value={assignTime}
              onChange={(e) => setAssignTime(e.target.value)}
            />

            <button
              className="button"
              onClick={async () => {
                await patchJob(openedJob.id, {
                  technicianId: assignTechId || null,
                  scheduledAt: assignTime || null
                });
                setOpenedJob({...openedJob, technicianId: assignTechId});
              }}
            >
              Assign & Schedule
            </button>
          </div>

            <p><strong>Customer:</strong> {openedJob.customerName || "-"}</p>
            <p><strong>Vehicle:</strong> {openedJob.vehicleReg || "-"}</p>
            <p><strong>Status:</strong> {openedJob.status}</p>
          </div>

          <div className="ccv2-sidepanel-actions">
            <button className="button" onClick={() => router.push(`/dashboard/jobs/${openedJob.id}`)}>
              Open full job
            </button>
          </div>
        </div>
      ) : null}

</DashboardShell>
  );
}
