import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { OperatorNotice } from '../../components/feedback/OperatorNotice';
import { useOperatorNotice } from '../../components/feedback/useOperatorNotice';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';
import {
  COMMAND_CENTRE_SECTION_KEYS,
  getBusinessTerms,
  getCommandCentreWorkspaceLayout,
  type CommandCentreSectionKey,
} from '../../lib/business-config';
import { getCommandCentreRealtimeMode, getCommandCentreSseUrl, isCommandCentreRealtimeDisabled } from '../../lib/command-centre-realtime';
import { getRequiredFieldWarningLabel } from '../../lib/custom-fields';
import { isCommandCentreV2Enabled, isDemoPolishV1Enabled } from '../../lib/feature-flags';
import { useOperationalRefresh } from '../../lib/operational-refresh';
import { useTenantSettings } from '../../lib/tenant-settings';
import { emptyPermissionSnapshot, hasWorkspacePermission, normalizePermissionSnapshot } from '../../lib/workspace-permissions';
import { getJobStages, getStageStatus, getVisibleStages, mapStatusToStage } from '../../lib/workflow-config';

const STATUS_FILTER_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'OPEN', label: 'Open' },
  { key: 'SCHEDULED', label: 'Scheduled' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'INVOICED', label: 'Invoiced' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

const DEFAULT_SECTION_ORDER = [...COMMAND_CENTRE_SECTION_KEYS];
const SECTION_META: Record<CommandCentreSectionKey, { title: string; description: string; hideable: boolean }> = {
  filters: {
    title: 'Filters and saved views',
    description: 'Search, status, location, and saved team views.',
    hideable: false,
  },
  'recent-updates': {
    title: 'Recent updates',
    description: 'Live changes across the workspace.',
    hideable: true,
  },
  'bulk-actions': {
    title: 'Bulk actions',
    description: 'Batch updates for selected work.',
    hideable: true,
  },
  'work-board': {
    title: 'Live work board',
    description: 'The active list or board for today’s work.',
    hideable: false,
  },
};

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function moveItem(items: string[], key: string, direction: 'up' | 'down') {
  const index = items.indexOf(key);
  if (index === -1) return items;
  const nextIndex = direction === 'up' ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function CommandCentreV2Page() {
  const router = useRouter();
  const { settings, refresh } = useTenantSettings();
  const terms = getBusinessTerms(settings);
  const jobStages = getJobStages(settings);
  const visibleJobStages = getVisibleStages(jobStages);
  const commandCentreLayout = getCommandCentreWorkspaceLayout(settings);
  const enabled = isCommandCentreV2Enabled();
  const demoPolishEnabled = isDemoPolishV1Enabled();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [locationIds, setLocationIds] = useState<string[]>(['all']);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>(commandCentreLayout.defaultViewMode);
  const [layoutDefaultViewMode, setLayoutDefaultViewMode] = useState<'kanban' | 'list'>(commandCentreLayout.defaultViewMode);
  const [board, setBoard] = useState<any>({ grouped: {}, counts: {} });
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [sectionOrder, setSectionOrder] = useState<CommandCentreSectionKey[]>(commandCentreLayout.sectionOrder);
  const [hiddenSections, setHiddenSections] = useState<CommandCentreSectionKey[]>(commandCentreLayout.hiddenSections);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState('IN_PROGRESS');
  const [bulkLocation, setBulkLocation] = useState('all');
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

  useEffect(() => {
    apiFetch('/me')
      .then((me) => setPermissions(normalizePermissionSnapshot(me?.permissions)))
      .catch(() => setPermissions(emptyPermissionSnapshot()));
  }, []);

  const [activeViewId, setActiveViewId] = useState('');
  const [saveViewName, setSaveViewName] = useState('');
  const [showSaveView, setShowSaveView] = useState(false);
  const [savingView, setSavingView] = useState(false);
  const [assignTechId, setAssignTechId] = useState<string>("");
  const [assignTime, setAssignTime] = useState<string>("");
  const [openedJob, setOpenedJob] = useState<any>(null);
  const [dragJobId, setDragJobId] = useState<string>("");
  const [dragStatusTarget, setDragStatusTarget] = useState<string>("");
  const [capacityPressure, setCapacityPressure] = useState<any>(null);
  const [assignmentRecommendations, setAssignmentRecommendations] = useState<any[]>([]);
  const [complianceSummary, setComplianceSummary] = useState<any>({ totals: { breachedEvents: 0, openExceptions: 0 } });
  const [pendingBulk, setPendingBulk] = useState<{ op: string; payload: Record<string, any>; label: string } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pendingInlineJobId, setPendingInlineJobId] = useState<string>("");
  const [seededDefaults, setSeededDefaults] = useState(false);
  const [defaultViewApplied, setDefaultViewApplied] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastBoardHash, setLastBoardHash] = useState("");
    const [liveNotice, setLiveNotice] = useState("");
  const [activityItems, setActivityItems] = useState<any[]>([]);
  const [savingLayout, setSavingLayout] = useState(false);
  const [savedLayoutApplied, setSavedLayoutApplied] = useState(false);
  const { notice, showSuccess, showError, clearNotice } = useOperatorNotice();
  const realtimeMode = getCommandCentreRealtimeMode();
  const initialLayoutRef = useRef(commandCentreLayout);
  const sectionOrderRef = useRef<CommandCentreSectionKey[]>(commandCentreLayout.sectionOrder);
  const hiddenSectionsRef = useRef<CommandCentreSectionKey[]>(commandCentreLayout.hiddenSections);
  const layoutDefaultViewModeRef = useRef<'kanban' | 'list'>(commandCentreLayout.defaultViewMode);
  const canManageLayout = hasWorkspacePermission(permissions, 'settings.manage');
  const layoutControlsReady = Boolean(settings) && savedLayoutApplied;

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
    const refreshStartedAt = background ? Date.now() : 0;
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
      if (notice?.kind === 'error') clearNotice();
        if (lastBoardHash && lastBoardHash !== nextHash) {
          setLiveNotice("Board updated");
          window.setTimeout(() => setLiveNotice(""), 2200);
        }
        setLastBoardHash(nextHash);
        setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err: any) {
      showError('We could not refresh live work right now.');
    } finally {
      if (background) {
        const minimumRefreshIndicatorMs = 500;
        const remainingIndicatorMs = minimumRefreshIndicatorMs - (Date.now() - refreshStartedAt);
        if (remainingIndicatorMs > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, remainingIndicatorMs));
        }
        setIsRefreshing(false);
      }
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

  async function loadComplianceSummary() {
    try {
      const selectedLocationIds = locationIds.filter((x) => x !== 'all');
      const scope = selectedLocationIds.length === 1 ? `?locationId=${encodeURIComponent(selectedLocationIds[0])}` : '';
      const data = await apiFetch(`/compliance/summary${scope}`);
      setComplianceSummary(data || { totals: { breachedEvents: 0, openExceptions: 0 } });
    } catch {
      setComplianceSummary({ totals: { breachedEvents: 0, openExceptions: 0 } });
    }
  }

  useEffect(() => {
    if (!enabled) return;
    Promise.all([
      apiFetch('/locations').catch(() => []),
      loadViews(),
      loadBoard(),
      loadActivity(),
      loadComplianceSummary(),
    ]).then(([l]) => setLocations(Array.isArray(l) ? l : []));
  }, [enabled]);

  useEffect(() => {
    if (!router.isReady) return;
    if (typeof router.query.search === 'string') setSearchInput(router.query.search);
    if (typeof router.query.status === 'string') setStatus(router.query.status);
  }, [router.isReady, router.query.search, router.query.status]);

  useEffect(() => {
    if (!settings || savedLayoutApplied) return;
    setSectionOrder(commandCentreLayout.sectionOrder);
    setHiddenSections(commandCentreLayout.hiddenSections);
    setViewMode(commandCentreLayout.defaultViewMode);
    setLayoutDefaultViewMode(commandCentreLayout.defaultViewMode);
    sectionOrderRef.current = [...commandCentreLayout.sectionOrder];
    hiddenSectionsRef.current = [...commandCentreLayout.hiddenSections];
    layoutDefaultViewModeRef.current = commandCentreLayout.defaultViewMode;
    initialLayoutRef.current = commandCentreLayout;
    setSavedLayoutApplied(true);
  }, [savedLayoutApplied, commandCentreLayout, settings]);

  useEffect(() => {
    loadBoard();
  }, [search, status, locationIds.join(',')]);

  useEffect(() => {
    if (!enabled) return;
    void loadComplianceSummary();
  }, [enabled, locationIds.join(',')]);

  useEffect(() => {
    if (!openedJob) return;
    setAssignTechId(String(openedJob.assignedUserId || openedJob.technicianId || ""));
    if (openedJob.scheduledAt) {
      const dt = new Date(openedJob.scheduledAt);
      if (!Number.isNaN(dt.getTime())) {
        const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setAssignTime(local);
        return;
      }
    }
    setAssignTime("");
  }, [openedJob]);

  useEffect(() => {
    if (!openedJob) {
      setCapacityPressure(null);
      setAssignmentRecommendations([]);
      return;
    }
    const target = assignTime
      ? new Date(assignTime)
      : openedJob?.scheduledAt
      ? new Date(openedJob.scheduledAt)
      : new Date();
    if (Number.isNaN(target.getTime())) {
      setCapacityPressure(null);
      setAssignmentRecommendations([]);
      return;
    }
    const day = target.toISOString().slice(0, 10);
    const params = new URLSearchParams({
      entityType: "job",
      entityId: String(openedJob.id),
      scheduledAt: target.toISOString(),
    });
    Promise.all([
      apiFetch(`/schedule/pressure?date=${day}`).catch(() => null),
      apiFetch(`/schedule/recommendations?${params.toString()}`).catch(() => null),
    ]).then(([pressureRes, recommendationRes]) => {
      setCapacityPressure(pressureRes || null);
      setAssignmentRecommendations(Array.isArray(recommendationRes?.recommendations) ? recommendationRes.recommendations : []);
    });
  }, [openedJob, assignTime]);

  useOperationalRefresh(
    () => Promise.all([loadBoard(true), loadActivity(), loadComplianceSummary()]),
    { enabled },
  );

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    if (isCommandCentreRealtimeDisabled()) {
      setLiveNotice("Realtime paused in deterministic mode");
      return;
    }

    const es = new EventSource(getCommandCentreSseUrl(), { withCredentials: true });

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

  useEffect(() => {
    if (!enabled || defaultViewApplied || activeViewId || views.length === 0) return;
    const defaultView = views.find((view) => view?.isDefault);
    if (!defaultView?.id) return;
    applyView(defaultView.id, { preserveViewMode: true });
    setSaveViewName(String(defaultView.name || ""));
    setDefaultViewApplied(true);
  }, [enabled, defaultViewApplied, activeViewId, views]);

  const allJobs = useMemo(() => Object.values(board?.grouped || {}).flat() as any[], [board]);
  const stageBoardGrouped = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    for (const stage of visibleJobStages) grouped[stage.id] = [];
    for (const job of allJobs) {
      const stage = mapStatusToStage(job?.status, jobStages);
      if (!stage || stage.visible === false) continue;
      grouped[stage.id] = [...(grouped[stage.id] || []), job];
    }
    return grouped;
  }, [allJobs, jobStages, visibleJobStages]);
  const stageCounts = useMemo(() => {
    return Object.fromEntries(
      visibleJobStages.map((stage) => [
        stage.id,
        allJobs.filter((job) => mapStatusToStage(job?.status, jobStages)?.id === stage.id).length,
      ]),
    );
  }, [allJobs, jobStages, visibleJobStages]);
  const liveWorkRecommendation = useMemo(() => {
    const breachedEvents = Number(complianceSummary?.totals?.breachedEvents || 0);
    const openExceptions = Number(complianceSummary?.totals?.openExceptions || 0);
    const inProgressJob = allJobs.find((job) => mapStatusToStage(job?.status, jobStages)?.id === 'IN_PROGRESS') || null;
    const completedJob = allJobs.find((job) => mapStatusToStage(job?.status, jobStages)?.id === 'COMPLETED') || null;
    const scheduledJob = allJobs.find((job) => mapStatusToStage(job?.status, jobStages)?.id === 'SCHEDULED') || null;

    if (breachedEvents > 0 || openExceptions > 0) {
      return {
        eyebrow: "Recommended next action",
        title: "Review compliance pressure first",
        detail: `${breachedEvents} breached SLA item${breachedEvents === 1 ? '' : 's'} and ${openExceptions} open compliance check${openExceptions === 1 ? '' : 's'} need operator review before more work is moved.`,
        href: "/dashboard/compliance",
        action: "Review compliance",
      };
    }

    if (inProgressJob) {
      return {
        eyebrow: "Recommended next action",
        title: `${inProgressJob.jobRef || inProgressJob.id} is already live`,
        detail: `${inProgressJob.customerName || "This customer"} has work in progress now. Resume the active job sheet before opening another queue item.`,
        href: `/dashboard/jobs/${inProgressJob.id}`,
        action: "Resume live job",
      };
    }

    if (completedJob) {
      return {
        eyebrow: "Recommended next action",
        title: "Close the handoff loop on completed work",
        detail: `${completedJob.jobRef || completedJob.id} is ready for handoff, sending, or billing follow-up next.`,
        href: `/dashboard/jobs/${completedJob.id}`,
        action: "Review completed job",
      };
    }

    if (scheduledJob) {
      return {
        eyebrow: "Recommended next action",
        title: "Pull the next scheduled job into focus",
        detail: `${scheduledJob.jobRef || scheduledJob.id} is scheduled and ready to be reviewed before the day slips forward.`,
        href: `/dashboard/jobs/${scheduledJob.id}`,
        action: "Open scheduled job",
      };
    }

    return {
      eyebrow: "Recommended next action",
      title: "No live blockers right now",
      detail: "Use filters, saved views, or the full jobs queue to pull the next item into view without overloading the board.",
      href: "/dashboard/jobs",
      action: "Open all jobs",
    };
  }, [allJobs, complianceSummary?.totals?.breachedEvents, complianceSummary?.totals?.openExceptions, jobStages]);

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

  function applyView(id: string, options?: { preserveViewMode?: boolean }) {
    setActiveViewId(id);
    const next = views.find((v) => v.id === id);
    if (!next) return;
    const f = next.filtersJson || {};
    setSearchInput(String(f.search || ''));
    setStatus(String(f.status || ''));
    setLocationIds(Array.isArray(f.locationIds) && f.locationIds.length ? f.locationIds : ['all']);
    if (!options?.preserveViewMode) {
      setViewMode(f.viewType === 'list' ? 'list' : 'kanban');
    }
  }

  async function saveView() {
    if (savingView) return;
    setSavingView(true);
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
      showSuccess('View saved');
      setShowSaveView(false);
      await loadViews();
    } catch (err: any) {
      showError(err?.message || 'Failed to save view');
    } finally {
      setSavingView(false);
    }
  }

  async function runBulk(operation: string, payload: Record<string, any>) {
    if (bulkBusy) return;
    const ids = selected;
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      const res = await apiFetch('/jobs/bulk-v2', {
        method: 'POST',
        body: JSON.stringify({ jobIds: ids, operation, ...payload }),
      });
      showSuccess(`Updated ${res?.successCount || 0} jobs. Undo available.`);
      setSelected([]);
      await loadBoard();
    } catch (err: any) {
      showError(err?.message || 'Bulk operation failed');
    } finally {
      setBulkBusy(false);
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

  const orderedSections = Array.from(new Set([...sectionOrder, ...DEFAULT_SECTION_ORDER])) as CommandCentreSectionKey[];
  const visibleSections = orderedSections.filter((sectionKey) => !hiddenSections.includes(sectionKey));
  const layoutDirty =
    !arraysEqual(sectionOrder, initialLayoutRef.current.sectionOrder) ||
    !arraysEqual(hiddenSections, initialLayoutRef.current.hiddenSections) ||
    layoutDefaultViewMode !== initialLayoutRef.current.defaultViewMode;
  const layoutAtDefaults =
    arraysEqual(sectionOrder, DEFAULT_SECTION_ORDER) &&
    hiddenSections.length === 0 &&
    layoutDefaultViewMode === 'kanban';

  async function saveLayout() {
    if (!canManageLayout || savingLayout) return;
    clearNotice();
    setSavingLayout(true);
    const nextSectionOrder = [...sectionOrderRef.current];
    const nextHiddenSections = [...hiddenSectionsRef.current];
    const nextDefaultViewMode = layoutDefaultViewModeRef.current;
    try {
      const tenantSettings = await apiFetch('/tenant/settings');
      const currentBusinessConfig = tenantSettings?.businessConfigJson && typeof tenantSettings.businessConfigJson === 'object'
        ? tenantSettings.businessConfigJson
        : {};
      const currentCommandCentre = currentBusinessConfig.commandCentre && typeof currentBusinessConfig.commandCentre === 'object'
        ? currentBusinessConfig.commandCentre
        : {};
      await apiFetch('/tenant/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          businessConfigJson: {
            ...currentBusinessConfig,
            commandCentre: {
              ...currentCommandCentre,
              sectionOrder: nextSectionOrder,
              hiddenSections: nextHiddenSections,
              defaultViewMode: nextDefaultViewMode,
            },
          },
        }),
      });
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const refreshedSettings = await apiFetch('/tenant/settings');
        const refreshedLayout = getCommandCentreWorkspaceLayout(refreshedSettings as any);
        if (
          arraysEqual(refreshedLayout.sectionOrder, nextSectionOrder) &&
          arraysEqual(refreshedLayout.hiddenSections, nextHiddenSections) &&
          refreshedLayout.defaultViewMode === nextDefaultViewMode
        ) {
          initialLayoutRef.current = {
            sectionOrder: [...refreshedLayout.sectionOrder],
            hiddenSections: [...refreshedLayout.hiddenSections],
            defaultViewMode: refreshedLayout.defaultViewMode,
          };
          await refresh();
          showSuccess('Command Centre layout saved');
          return;
        }
        await wait(250);
      }
      showError('Command Centre layout is still saving. Please try again.');
    } catch (error: any) {
      showError(error?.message || 'Failed to save Command Centre layout');
    } finally {
      setSavingLayout(false);
    }
  }

  function resetLayout() {
    clearNotice();
    sectionOrderRef.current = [...DEFAULT_SECTION_ORDER];
    hiddenSectionsRef.current = [];
    layoutDefaultViewModeRef.current = 'kanban';
    setSectionOrder(DEFAULT_SECTION_ORDER);
    setHiddenSections([]);
    setLayoutDefaultViewMode('kanban');
    setViewMode('kanban');
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

    setLiveNotice(event?.label || "Live update received");
    window.setTimeout(() => setLiveNotice(""), 1800);
  }

  async function patchJob(jobId: string, payload: Record<string, any>) {
    const snapshot = board;
    try {
      applyOptimisticJobUpdate(jobId, payload);
      const updated = await apiFetch(`/jobs/${jobId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      showSuccess('Job updated');
      await loadBoard(true);
      return updated;
    } catch (err: any) {
      setBoard(snapshot);
      showError(err?.message || 'Inline update failed');
      throw err;
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
      return await patchJob(jobId, { status: nextStatus });
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
      : [{ label: "No updates yet", at: null }];
  }

  function InlineStatusActions({ job }: { job: any }) {
    const current = String(job?.status || "");
    const currentStage = mapStatusToStage(current, jobStages);
    const nextOptions = visibleJobStages.filter((stage) => stage.id !== currentStage?.id).slice(0, 3);

    if (!nextOptions.length) return null;

    return (
      <div className="ccv2-inline-actions">
        {nextOptions.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className="button secondary ccv2-button ccv2-inline-action"
            disabled={pendingInlineJobId === job.id}
            onClick={() => void inlineSetStatus(job.id, getStageStatus(opt))}
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
          <div className="card ccv2-card"><h1>Live work unavailable</h1><p className="muted">This workspace is not using live work right now.</p></div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="ccv2-board-premium">
      <div data-drag-drop="enabled" hidden>CCV2_DRAG_DROP_ENABLED</div>
        <div data-sidepanel-actions="enabled" hidden>CCV2_SIDEPANEL_ACTIONS_ENABLED</div>
        <div data-assign-tech="enabled" hidden>CCV2_ASSIGN_TECH_ENABLED</div>
        <div data-realtime="enabled" hidden>CCV2_REALTIME_ENABLED</div>
        <div data-sidepanel-rich="enabled" hidden>CCV2_SIDEPANEL_RICH_DETAILS</div>
        <div data-activity-timeline="enabled" hidden>CCV2_ACTIVITY_TIMELINE_ENABLED</div>
        <div data-event-toasts="enabled" hidden>CCV2_EVENT_TOASTS_ENABLED</div>
        <div data-sse-realtime="enabled" hidden>CCV2_SSE_REALTIME_ENABLED</div>
        <div data-activity-stream="enabled" hidden>CCV2_ACTIVITY_STREAM_ENABLED</div>
        <div data-optimistic-board="enabled" hidden>CCV2_OPTIMISTIC_BOARD_ENABLED</div>
        <div data-targeted-sse="enabled" hidden>CCV2_TARGETED_SSE_ENABLED</div>
        <div data-persistent-activity="enabled" hidden>CCV2_PERSISTENT_ACTIVITY_ENABLED</div>
        <div data-customer-timeline-shortcut="enabled" hidden>CUSTOMER_TIMELINE_SHORTCUT_ENABLED</div>
        <div className="card ccv2-hero" style={{ marginBottom: 14 }}>
          <div className="ccv2-inline-actions-marker" data-inline-actions="enabled" hidden>
            INLINE_ACTIONS_ENABLED
          </div>
        <p className="ccv2-eyebrow">Live work</p>
        <h1 className="ccv2-title" style={{ marginTop: 0 }}>Live work</h1>
        <p className="muted ccv2-subtitle">See what needs action now, move into the job sheet quickly, and keep assignments clear.</p>
        <div className="ccv2-count-strip" data-testid="ccv2-status-summary">
          {visibleJobStages.map((row) => (
            <div key={row.id} className="ccv2-count-pill" data-testid={`ccv2-count-pill-${row.id.toLowerCase()}`}>
              <span className="ccv2-count-pill__label">{row.label}</span>
              <strong className="ccv2-count-pill__value">{Number(stageCounts?.[row.id] || 0)}</strong>
            </div>
          ))}
        </div>

<div className="ccv2-livebar">
            <div className="ccv2-livebar__meta">
              <span className={`ccv2-live-dot${isRefreshing ? " is-live" : ""}`}></span>
              <span className="ccv2-live-text" data-testid="ccv2-realtime-state">
                {realtimeMode === 'fallback' ? 'Live updates are paused in this test mode' : lastUpdated ? `Updated ${lastUpdated}` : "Everything running normally"}
              </span>
            </div>
            <button className="button secondary ccv2-button" data-testid="ccv2-refresh-button" type="button" onClick={() => void loadBoard(true)} disabled={isRefreshing}>
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {visibleJobStages.slice(0, 3).map((stage) => (
            <span key={stage.id} className="ccv2-status-pill ccv2-status-pill--open">{stage.label}</span>
          ))}
        </div>
        <div data-testid="ccv2-compliance-pressure" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginTop: 12 }}>
          <div className="integration-card">
            <strong>Needs attention</strong>
            <div className="muted" style={{ marginTop: 6 }}>
              {Number(complianceSummary?.totals?.breachedEvents || 0)} breached SLA item{Number(complianceSummary?.totals?.breachedEvents || 0) === 1 ? '' : 's'}
            </div>
            <div className="muted">
              {Number(complianceSummary?.totals?.openExceptions || 0)} open compliance check{Number(complianceSummary?.totals?.openExceptions || 0) === 1 ? '' : 's'}
            </div>
            <button className="button secondary ccv2-button" type="button" style={{ marginTop: 10 }} onClick={() => void router.push('/dashboard/compliance')}>
              Review checks
            </button>
          </div>
        </div>
        <OperatorNotice notice={notice} onDismiss={clearNotice} />
        {liveNotice ? <div aria-live="polite" className="ccv2-live-notice" role="status">{liveNotice}</div> : null}
      </div>

      <section className="integration-card mt-priority-card ccv2-priority-card mt-target-section" data-testid="ccv2-next-action-card">
        <div className="mt-priority-card__eyebrow">{liveWorkRecommendation.eyebrow}</div>
        <div className="mt-priority-card__title">{liveWorkRecommendation.title}</div>
        <p className="mt-priority-card__text">{liveWorkRecommendation.detail}</p>
        <div className="mt-priority-card__actions">
          <Link className="button" href={liveWorkRecommendation.href}>
            {liveWorkRecommendation.action}
          </Link>
          <Link className="button secondary" href="/dashboard/settings?tab=general">
            Review workspace layout
          </Link>
        </div>
      </section>

      {canManageLayout && layoutControlsReady ? (
        <div className="card ccv2-surface" data-testid="ccv2-layout-settings-link" style={{ marginBottom: 14 }}>
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Layout lives in Settings</h2>
              <p className="operator-section__subtitle">Live work stays focused on the queue. Save board style and section visibility from Workspace layout.</p>
            </div>
            <Link className="button secondary ccv2-button" href="/dashboard/settings?tab=general">
              Open Workspace layout
            </Link>
          </div>
        </div>
      ) : null}

      {visibleSections.includes('recent-updates') ? (
      <div className="card ccv2-activity-stream" data-testid="ccv2-recent-updates" style={{ marginBottom: 14 }}>
        <div className="ccv2-activity-stream__head">
          <h3 style={{ margin: 0 }} data-testid="ccv2-recent-updates-title">Latest movement</h3>
          <span className="muted">A short view of what changed most recently</span>
        </div>

        <div className="ccv2-activity-stream__list">
          {activityItems.length ? activityItems.map((item) => (
            <div key={item.id || `${item.type}-${item.at}`} className="ccv2-activity-stream__item">
              <div className="ccv2-activity-stream__dot"></div>
              <div className="ccv2-activity-stream__content">
                <div className="ccv2-activity-stream__label">{item.label || item.type}</div>
                <div className="ccv2-activity-stream__meta">
                  <span>{item.jobRef || "Job"}</span>
                  <span>•</span>
                  <span>{item.customerName || "No customer"}</span>
                  <span>•</span>
                  <span>{item.at ? new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                </div>
              </div>
            </div>
          )) : (
            <div className="muted">No new updates yet.</div>
          )}
        </div>
      </div>
      ) : null}

      {visibleSections.includes('filters') ? (
      <div className="card ccv2-filters" data-testid="ccv2-filters-card" style={{ marginBottom: 14 }}>
        <div className="two-col ccv2-grid">
          <div>
            <label>Find work</label>
            <input ref={searchRef} className="input ccv2-input" data-testid="ccv2-search-input" placeholder="Search jobs, customers, or reg" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <div>
            <label>Stage</label>
            <select className="input ccv2-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {STATUS_FILTER_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label>Places</label>
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
            <label>View</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`button ${viewMode === 'kanban' ? '' : 'secondary'}`} type="button" onClick={() => setViewMode('kanban')}>Board</button>
              <button className={`button ${viewMode === 'list' ? '' : 'secondary'}`} type="button" onClick={() => setViewMode('list')}>List</button>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="input" data-testid="ccv2-saved-view-select" style={{ margin: 0, width: 260 }} value={activeViewId} onChange={(e) => applyView(e.target.value)}>
            <option value="">Choose a saved view</option>
            {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button className="button secondary ccv2-button" data-testid="ccv2-save-view-trigger" type="button" disabled={savingView} onClick={() => { setShowSaveView(true); setSaveViewName(''); }}>Save view</button>
        </div>
      </div>
      ) : null}

      {showSaveView ? (
        <div aria-label="Save board view" className="card ccv2-surface" data-testid="ccv2-save-view-panel" style={{ marginBottom: 14 }}>
          <input aria-label="Saved board view name" className="input" data-testid="ccv2-save-view-input" value={saveViewName} onChange={(e) => setSaveViewName(e.target.value)} placeholder="Name this view" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="button ccv2-button" data-testid="ccv2-save-view-submit" type="button" disabled={savingView || !saveViewName.trim()} onClick={saveView}>{savingView ? 'Saving...' : 'Save'}</button>
            <button className="button secondary ccv2-button" data-testid="ccv2-save-view-cancel" type="button" disabled={savingView} onClick={() => setShowSaveView(false)}>Cancel</button>
          </div>
        </div>
      ) : null}

      {visibleSections.includes('bulk-actions') ? (
      <div className="card ccv2-surface ccv2-filters-surface" data-testid="ccv2-bulk-bar" style={{ marginBottom: 14 }}>
        <strong>Move selected work</strong>
        <p className="muted" data-testid="ccv2-selected-count">{selected.length} job{selected.length === 1 ? '' : 's'} selected</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="input" data-testid="ccv2-bulk-status-select" style={{ margin: 0, width: 170 }} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {STATUS_FILTER_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="button secondary ccv2-button" data-testid="ccv2-bulk-status-action" type="button" disabled={bulkBusy || !selected.length} onClick={() => triggerBulk('setStatus', { status: bulkStatus }, `Set stage to ${mapStatusToStage(bulkStatus, jobStages)?.label || bulkStatus}`)}>Change stage</button>
          <select className="input" data-testid="ccv2-bulk-location-select" style={{ margin: 0, width: 220 }} value={bulkLocation} onChange={(e) => setBulkLocation(e.target.value)}>
            <option value="all">All / none</option>
            {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>
          <button className="button secondary ccv2-button" data-testid="ccv2-bulk-location-action" type="button" disabled={bulkBusy || !selected.length} onClick={() => triggerBulk('setLocation', { locationId: bulkLocation }, `Assign location ${bulkLocation}`)}>Change location</button>
          {demoPolishEnabled ? (
            <button className="button secondary ccv2-button" data-testid="ccv2-bulk-complete-action" type="button" disabled={bulkBusy || !selected.length} onClick={() => triggerBulk('markComplete', {}, 'Mark complete')}>Mark done</button>
          ) : (
            <button className="button secondary ccv2-button" data-testid="ccv2-bulk-close-action" type="button" disabled={bulkBusy || !selected.length} onClick={() => triggerBulk('closeJobs', {}, 'Close jobs')}>Close jobs</button>
          )}
        </div>
      </div>
      ) : null}

      {visibleSections.includes('work-board') ? (
      <div className="card ccv2-card" data-testid="ccv2-work-board" style={{ marginBottom: 14 }}>
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
                  <input data-testid={`ccv2-select-${job.id}`} type="checkbox" checked={selected.includes(job.id)} onChange={(e) => { e.stopPropagation(); setSelected((prev) => prev.includes(job.id) ? prev.filter((x) => x !== job.id) : [...prev, job.id]); }} />
                  <strong>{job.jobRef}</strong>
                </label>
                <div className="muted" data-testid="workflow-stage-label">{mapStatusToStage(job?.status, jobStages)?.label || job.status}</div>
                {Array.isArray(job?.missingRequiredFields) && job.missingRequiredFields.length ? (
                  <div className="badge warn" data-testid="ccv2-required-fields-warning">{getRequiredFieldWarningLabel(job.missingRequiredFields)}</div>
                ) : null}
                <div>
                  <button className="button secondary ccv2-button" data-testid={`ccv2-open-${job.id}`} type="button" onClick={(e) => { e.stopPropagation(); setOpenedJob(job); }}>Open</button>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <InlineStatusActions job={job} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
            {visibleJobStages.map((stage) => (
              <div
                key={stage.id}
                className={`card ccv2-card ${dragStatusTarget === stage.id ? "ccv2-dropzone-active" : ""}`}
                style={{ padding: 12 }}
                onDragOver={(e) => { e.preventDefault(); setDragStatusTarget(stage.id); }}
                onDragLeave={() => setDragStatusTarget("")}
                onDrop={() => { if (dragJobId) void moveJobToStatus(dragJobId, getStageStatus(stage)); }}
              >
                <strong>{stage.label} ({Array.isArray(stageBoardGrouped[stage.id]) ? stageBoardGrouped[stage.id].length : 0})</strong>
                <div className="list" style={{ marginTop: 8 }}>
                  {(stageBoardGrouped[stage.id] || []).map((job: any) => (
                    <div
                      key={job.id}
                      className="integration-card"
                      draggable
                      onDragStart={() => setDragJobId(job.id)}
                      onDragEnd={() => { setDragJobId(""); setDragStatusTarget(""); }}
                    >
                      <button data-testid={`ccv2-card-open-${job.id}`} type="button" onClick={() => setOpenedJob(job)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, padding: 0 }}>
                        <span>{job.jobRef}</span>
                        <span className="muted">{job.customerName || 'Customer'}</span>
                        <span className="muted" data-testid="workflow-stage-label">{stage.label}</span>
                        {Array.isArray(job?.missingRequiredFields) && job.missingRequiredFields.length ? (
                          <span className="badge warn" data-testid="ccv2-required-fields-warning">{getRequiredFieldWarningLabel(job.missingRequiredFields)}</span>
                        ) : null}
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
      ) : null}

      {pendingBulk && demoPolishEnabled ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'grid', placeItems: 'center', zIndex: 40, padding: 16 }}>
          <div aria-labelledby="ccv2-bulk-confirm-title" aria-modal="true" className="card ccv2-card" data-testid="ccv2-bulk-confirm-dialog" role="dialog" style={{ width: 'min(520px, 100%)' }}>
            <h3 id="ccv2-bulk-confirm-title" style={{ marginTop: 0 }}>Confirm bulk action</h3>
            <p className="muted">{pendingBulk.label} on {selected.length} selected jobs.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="button ccv2-button" data-testid="ccv2-bulk-confirm-submit" type="button" disabled={bulkBusy} onClick={confirmBulk}>{bulkBusy ? 'Applying...' : 'Apply change'}</button>
              <button className="button secondary ccv2-button" data-testid="ccv2-bulk-confirm-cancel" type="button" disabled={bulkBusy} onClick={() => setPendingBulk(null)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    

      {openedJob ? (
        <div className="ccv2-sidepanel" data-testid="ccv2-sidepanel">
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
              <div className="ccv2-sidepanel-kv"><span>Stage</span><strong>{mapStatusToStage(openedJob.status, jobStages)?.label || openedJob.status || "-"}</strong></div>
              <div className="ccv2-sidepanel-kv"><span>Status</span><strong>{openedJob.status || "-"}</strong></div>
            </div>

            {Array.isArray(openedJob?.missingRequiredFields) && openedJob.missingRequiredFields.length ? (
              <div className="ccv2-sidepanel-section">
                <div className="ccv2-sidepanel-sectionTitle">Required fields</div>
                <div className="badge warn" data-testid="ccv2-required-fields-warning">{getRequiredFieldWarningLabel(openedJob.missingRequiredFields)}</div>
                <div className="muted" style={{ marginTop: 8 }}>
                  Fill these in before you move this job on: {openedJob.missingRequiredFields.join(', ')}
                </div>
              </div>
            ) : null}

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

            <div className="ccv2-sidepanel-dispatch">
              <h4>Next step</h4>
              {capacityPressure?.technicians?.length ? (
                <div className="ccv2-sidepanel-section" style={{ padding: 0, marginBottom: 12 }}>
                  <div className="ccv2-sidepanel-sectionTitle">Capacity pressure</div>
                  <div className="muted" style={{ marginBottom: 8 }}>
                    {capacityPressure.overloadedTechnicians?.length
                      ? `${capacityPressure.overloadedTechnicians.length} technician day${capacityPressure.overloadedTechnicians.length === 1 ? "" : "s"} overloaded`
                      : "No overloaded technician days for the selected schedule date"}
                  </div>
                  {Array.isArray(assignmentRecommendations) && assignmentRecommendations.length ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      {assignmentRecommendations.slice(0, 3).map((row) => (
                        <div key={row.technicianId} className="integration-card" style={{ padding: 10 }}>
                          <strong>{row.technicianName}</strong>
                          <div className="muted">Score {row.score} · {row.remainingMinutesAfterAssign} min after assign</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
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
                  const updated = await patchJob(openedJob.id, {
                    assignedUserId: assignTechId || null,
                    scheduledAt: assignTime || null,
                  });
                  setOpenedJob(updated || { ...openedJob, assignedUserId: assignTechId || null, scheduledAt: assignTime || null });
                }}
              >
                Save assignment
              </button>
            </div>

            <div className="ccv2-sidepanel-section">
              <div className="ccv2-sidepanel-sectionTitle">Shortcuts</div>
              <div className="ccv2-sidepanel-shortcuts">
                <button className="button secondary ccv2-button ccv2-sidepanel-chip" onClick={() => router.push(`/dashboard/jobs/${openedJob.id}`)}>
                  Job
                </button>
                <button className="button secondary ccv2-button ccv2-sidepanel-chip" onClick={() => router.push(`/dashboard/bookings`)}>
                  {terms.bookings}
                </button>
                <button className="button secondary ccv2-button ccv2-sidepanel-chip" onClick={() => router.push(`/dashboard/billing`)}>
                  Billing
                </button>
                <button
                  className="button secondary ccv2-button ccv2-sidepanel-chip"
                  onClick={() => router.push(`/dashboard/customers/${openedJob.customerId || openedJob.id}?name=${encodeURIComponent(openedJob.customerName || "Customer")}`)}
                >
                  Timeline
                </button>
              </div>
            </div>
          </div>

          <div className="ccv2-sidepanel-actions">
            <div className="ccv2-sidepanel-status-actions">
              {visibleJobStages.filter((stage) => stage.id !== mapStatusToStage(openedJob?.status, jobStages)?.id).slice(0, 4).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="button secondary ccv2-button ccv2-sidepanel-action"
                  disabled={pendingInlineJobId === openedJob.id}
                  onClick={async () => {
                    const nextStatus = getStageStatus(opt);
                    const updated = await inlineSetStatus(openedJob.id, nextStatus);
                    setOpenedJob(updated || { ...openedJob, status: nextStatus });
                  }}
                >
                  {pendingInlineJobId === openedJob.id ? "Updating..." : opt.label}
                </button>
              ))}
            </div>
            <div className="ccv2-sidepanel-primary-actions">
              <button className="button" onClick={() => router.push(`/dashboard/jobs/${openedJob.id}`)}>
                Open job sheet
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
