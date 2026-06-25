import { useEffect, useMemo, useState } from "react";
import { EntityCustomFieldsCard } from "../../components/custom-fields/EntityCustomFieldsCard";
import { OperatorNotice } from "../../components/feedback/OperatorNotice";
import { useOperatorNotice } from "../../components/feedback/useOperatorNotice";
import { DashboardShell } from "../../components/dashboard-shell";
import {
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorPageHeader,
  OperatorRowActions,
} from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import { getBusinessTerms } from "../../lib/business-config";
import { getMissingRequiredCustomFieldKeys, type CustomField, type CustomFieldValue } from "../../lib/custom-fields";
import {
  clearOfflineBinaryQueue,
  clearOfflineQueue,
  getOfflineBinaryQueue,
  getOfflineQueue,
  loadOfflinePacket,
  queueOfflineBinaryAttachment,
  queueOfflineMutation,
  registerOfflineBinaryServiceWorker,
  syncOfflineBinaryQueue,
  syncOfflineQueue,
  type OfflineBinaryQueueItem,
  type OfflineMutation,
} from "../../lib/offline-mobile";
import { useTenantSettings } from "../../lib/tenant-settings";
import { getTechnicianStages, mapStatusToStage } from "../../lib/workflow-config";
import { emptyPermissionSnapshot, hasWorkspacePermission, normalizePermissionSnapshot } from "../../lib/workspace-permissions";

type TechQueue = {
  summary: {
    assignedJobs: number;
    inProgress: number;
    dueTodayBookings: number;
    overdueAssignedJobs: number;
  };
  jobs: Array<{
    id: string;
    jobRef: string;
    customerName: string;
    status: string;
    serviceName?: string | null;
    scheduledAt?: string | null;
    urgency?: string;
    lastFieldEvent?: {
      eventType?: string | null;
      message?: string | null;
      createdAt?: string | null;
    } | null;
    recentFieldEvents?: Array<{
      eventType?: string | null;
      message?: string | null;
      createdAt?: string | null;
    }>;
    nextStep?: string;
    workflowChecklist?: string[];
    sequenceState?: string;
    executionRecord?: {
      id: string;
      status: string;
      summary?: string | null;
      submittedAt?: string | null;
      acknowledgedAt?: string | null;
      checklistJson?: Array<{ key?: string; label?: string; completed?: boolean; note?: string | null }> | null;
      notesJson?: { completionNotes?: string | null } | null;
      evidenceCount?: number;
    } | null;
  }>;
  bookings: Array<{
    id: string;
    customerName?: string | null;
    status: string;
    startsAt: string;
    endsAt: string;
  }>;
};

export default function TechnicianPage() {
  const { settings } = useTenantSettings();
  const terms = getBusinessTerms(settings);
  const technicianStages = getTechnicianStages(settings);
  const [data, setData] = useState<TechQueue | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [executionNoteDrafts, setExecutionNoteDrafts] = useState<Record<string, string>>({});
  const [executionSummaryDrafts, setExecutionSummaryDrafts] = useState<Record<string, string>>({});
  const [executionChecklistDrafts, setExecutionChecklistDrafts] = useState<Record<string, Array<{ key: string; label: string; completed: boolean; note?: string }>>>({});
  const [executionEvidenceDrafts, setExecutionEvidenceDrafts] = useState<Record<string, string>>({});
  const [meId, setMeId] = useState<string | null>(null);
  const [technicianFields, setTechnicianFields] = useState<CustomField[]>([]);
  const [technicianFieldValues, setTechnicianFieldValues] = useState<CustomFieldValue[]>([]);
  const [capacityStatus, setCapacityStatus] = useState<any>(null);
  const [offlinePacket, setOfflinePacket] = useState<any>(null);
  const [offlineQueue, setOfflineQueue] = useState<OfflineMutation[]>([]);
  const [offlineBinaryQueue, setOfflineBinaryQueue] = useState<OfflineBinaryQueueItem[]>([]);
  const [offlineWorkerReady, setOfflineWorkerReady] = useState(false);
  const [offlineBusy, setOfflineBusy] = useState(false);
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [permissionsReady, setPermissionsReady] = useState(false);
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();

  async function load() {
    try {
      const res = await apiFetch("/tech/queue");
      setData(res);
      if (notice?.kind === "error") clearNotice();
    } catch (err: any) {
      showError(err?.message || "Failed to load technician queue");
    }
  }

  useEffect(() => {
    let cancelled = false;
    const loadMe = async () => {
      try {
        const me = await apiFetch("/me");
        if (!cancelled) {
          setPermissions(normalizePermissionSnapshot(me?.permissions));
        }
      } catch {
        if (!cancelled) {
          setPermissions(emptyPermissionSnapshot());
        }
      } finally {
        if (!cancelled) {
          setPermissionsReady(true);
        }
      }
    };
    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!permissionsReady || !hasWorkspacePermission(permissions, "technician.execute")) return;
    void load();
    setOfflineQueue(getOfflineQueue());
    setOfflineBinaryQueue(getOfflineBinaryQueue());
  }, [permissions, permissionsReady]);

  useEffect(() => {
    if (!permissionsReady || !hasWorkspacePermission(permissions, "technician.execute")) return;
    let cancelled = false;
    void registerOfflineBinaryServiceWorker().then((result) => {
      if (!cancelled) setOfflineWorkerReady(Boolean(result.registered));
    });
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "MYTITAN_RUN_OFFLINE_BINARY_SYNC") {
        void syncOffline();
      }
    };
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener("message", onMessage);
    }
    return () => {
      cancelled = true;
      if (typeof navigator !== "undefined" && navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener("message", onMessage);
      }
    };
  }, [permissions, permissionsReady]);

  useEffect(() => {
    if (!permissionsReady || !hasWorkspacePermission(permissions, "technician.execute")) return;
    let cancelled = false;
    const loadPacket = async () => {
      try {
        const packet = await loadOfflinePacket();
        if (!cancelled) setOfflinePacket(packet);
      } catch {
        if (!cancelled) setOfflinePacket(null);
      }
    };
    void loadPacket();
    return () => {
      cancelled = true;
    };
  }, [permissions, permissionsReady]);

  useEffect(() => {
    if (!permissionsReady || !hasWorkspacePermission(permissions, "technician.execute")) return;
    async function loadTechnicianFieldData() {
      try {
        const [me, fieldRows] = await Promise.all([
          apiFetch("/me"),
          apiFetch("/custom-fields?entityType=technician&visible=true"),
        ]);
        const userId = String(me?.sub || "");
        setMeId(userId || null);
        setTechnicianFields(Array.isArray(fieldRows) ? fieldRows : []);
        if (!userId) return;
        const valueRows = await apiFetch(`/custom-fields/values?entityType=technician&entityId=${encodeURIComponent(userId)}`);
        setTechnicianFieldValues(Array.isArray(valueRows?.values) ? valueRows.values : []);
        const pressureRows = await apiFetch(`/schedule/pressure?date=${new Date().toISOString().slice(0, 10)}&technicianId=${encodeURIComponent(userId)}`);
        const firstPressure = Array.isArray(pressureRows?.technicians) ? pressureRows.technicians[0] : null;
        setCapacityStatus(firstPressure || null);
      } catch {
        setTechnicianFields([]);
        setTechnicianFieldValues([]);
        setCapacityStatus(null);
      }
    }
    void loadTechnicianFieldData();
  }, [permissions, permissionsReady]);

  async function run(jobId: string, action: "start" | "complete") {
    setBusyId(jobId);
    try {
      await apiFetch(`/tech/jobs/${jobId}/${action}`, {
        method: "POST",
        body: JSON.stringify({ note: action === "start" ? "Technician started assigned work" : "Technician completed assigned work" }),
      });
      showSuccess(action === "start" ? "Technician moved into active work" : "Job marked completed");
      await load();
    } catch (err: any) {
      showError(err?.message || `Failed to ${action} job`);
    } finally {
      setBusyId(null);
    }
  }

  async function arrive(jobId: string) {
    setBusyId(jobId);
    try {
      await apiFetch(`/tech/jobs/${jobId}/arrive`, {
        method: "POST",
        body: JSON.stringify({ note: "Team member arrived on site" }),
      });
      showSuccess("Arrival logged");
      await load();
    } catch (err: any) {
      showError(err?.message || "Failed to log arrival");
    } finally {
      setBusyId(null);
    }
  }

  async function saveNote(jobId: string) {
    const note = String(noteDrafts[jobId] || "").trim();
    if (!note) return;
    setBusyId(jobId);
    try {
      await apiFetch(`/tech/jobs/${jobId}/note`, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
      setNoteDrafts((prev) => ({ ...prev, [jobId]: "" }));
      showSuccess("Field note saved");
      await load();
    } catch (err: any) {
      showError(err?.message || "Failed to save note");
    } finally {
      setBusyId(null);
    }
  }

  function currentChecklist(job: TechQueue["jobs"][number]) {
    if (executionChecklistDrafts[job.id]) return executionChecklistDrafts[job.id];
    const seeded = Array.isArray(job.executionRecord?.checklistJson) && job.executionRecord?.checklistJson.length
      ? job.executionRecord.checklistJson
      : (job.workflowChecklist || []).map((label, index) => ({ key: `checklist_${index + 1}`, label, completed: false }));
    return seeded.map((item: any, index: number) => ({
      key: String(item?.key || `checklist_${index + 1}`),
      label: String(item?.label || `Checklist item ${index + 1}`),
      completed: Boolean(item?.completed),
      note: item?.note || "",
    }));
  }

  async function startExecution(job: TechQueue["jobs"][number]) {
    setBusyId(job.id);
    try {
      await apiFetch(`/jobs/${job.id}/execution/start`, {
        method: "POST",
        body: JSON.stringify({ summary: executionSummaryDrafts[job.id] || job.executionRecord?.summary || "" }),
      });
      showSuccess("Execution record ready");
      await load();
    } catch (err: any) {
      showError(err?.message || "Failed to start completed work record");
    } finally {
      setBusyId(null);
    }
  }

  async function saveExecution(job: TechQueue["jobs"][number], submit = false) {
    setBusyId(job.id);
    try {
      await apiFetch(submit ? `/jobs/${job.id}/execution/submit` : `/jobs/${job.id}/execution`, {
        method: submit ? "POST" : "PATCH",
        body: JSON.stringify({
          summary: executionSummaryDrafts[job.id] ?? job.executionRecord?.summary ?? "",
          checklist: currentChecklist(job),
          notesJson: {
            completionNotes: executionNoteDrafts[job.id] ?? job.executionRecord?.notesJson?.completionNotes ?? "",
          },
        }),
      });
      showSuccess(submit ? "Completion submitted" : "Execution record saved");
      await load();
    } catch (err: any) {
      showError(err?.message || `Failed to ${submit ? "submit" : "save"} completed work record`);
    } finally {
      setBusyId(null);
    }
  }

  async function addEvidence(jobId: string) {
    const label = String(executionEvidenceDrafts[jobId] || "").trim();
    if (!label) return;
    setBusyId(jobId);
    try {
      await apiFetch(`/jobs/${jobId}/execution/evidence`, {
        method: "POST",
        body: JSON.stringify({
          kind: "NOTE",
          label,
          payloadJson: { source: "technician_queue" },
        }),
      });
      setExecutionEvidenceDrafts((current) => ({ ...current, [jobId]: "" }));
      showSuccess("Evidence reference added");
      await load();
    } catch (err: any) {
      showError(err?.message || "Failed to add evidence");
    } finally {
      setBusyId(null);
    }
  }

  function queueOfflineAction(job: TechQueue["jobs"][number], type: OfflineMutation["type"], payload: Record<string, unknown>, successLabel: string) {
    const mutation = queueOfflineMutation({
      jobId: job.id,
      type,
      baseVersion: offlinePacket?.jobs?.find((item: any) => item.id === job.id)?.version || null,
      payload: { ...payload, source: "technician_mobile_queue", storesTokens: false, storesSecrets: false },
    });
    setOfflineQueue(getOfflineQueue());
    showSuccess(`${successLabel}: ${mutation.state}`);
  }

  function queueOfflineEvidence(job: TechQueue["jobs"][number]) {
    queueOfflineAction(job, "photo_metadata", { label: executionEvidenceDrafts[job.id] || "Photo/evidence metadata" }, "Offline evidence queued");
  }

  async function queueOfflineBinary(job: TechQueue["jobs"][number], file: File | undefined | null, kind: "before_photo" | "after_photo" | "supporting_document" | "payment_evidence" = "before_photo") {
    if (!file) return;
    try {
      const item = await queueOfflineBinaryAttachment({
        jobId: job.id,
        kind,
        file,
        baseVersion: offlinePacket?.jobs?.find((packetJob: any) => packetJob.id === job.id)?.version || null,
      });
      setOfflineBinaryQueue(getOfflineBinaryQueue());
      showSuccess(`Saved offline: ${item.filename}`);
    } catch (err: any) {
      showError(err?.message || "Failed to save file offline");
    }
  }

  async function syncOffline() {
    setOfflineBusy(true);
    try {
      const [result, binaryResult] = await Promise.all([syncOfflineQueue(), syncOfflineBinaryQueue()]);
      setOfflineQueue(getOfflineQueue());
      setOfflineBinaryQueue(getOfflineBinaryQueue());
      const conflicts = [
        ...(Array.isArray(result?.results) ? result.results : []),
        ...(Array.isArray(binaryResult?.results) ? binaryResult.results : []),
      ].filter((row: any) => row.state === "conflict").length;
      if (conflicts) showError(`${conflicts} offline update${conflicts === 1 ? "" : "s"} need conflict review`);
      else showSuccess("Offline queue synced");
      await load();
    } catch (err: any) {
      setOfflineQueue(getOfflineQueue());
      showError(err?.message || "Offline sync failed");
    } finally {
      setOfflineBusy(false);
    }
  }

  async function clearBinaryQueue() {
    const result = await clearOfflineBinaryQueue();
    setOfflineBinaryQueue(getOfflineBinaryQueue());
    showSuccess(`Cleared ${result.cleared} offline file${result.cleared === 1 ? "" : "s"}`);
  }

  function clearMetadataQueue() {
    const result = clearOfflineQueue();
    setOfflineQueue(getOfflineQueue());
    showSuccess(`Cleared ${result.cleared} offline update${result.cleared === 1 ? "" : "s"}`);
  }

  const stats = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Assigned jobs", value: String(data.summary.assignedJobs), hint: "What is on your list right now" },
      { label: "In progress", value: String(data.summary.inProgress), hint: "Work already underway" },
      { label: "Bookings today", value: String(data.summary.dueTodayBookings), hint: "Today’s planned visit windows" },
      { label: "Overdue", value: String(data.summary.overdueAssignedJobs), hint: "Jobs that need attention first" },
    ];
  }, [data]);

  const nextJob = data?.jobs?.[0] || null;
  const nextActionCards = useMemo(
    () => [
      {
        label: "What matters now",
        text: nextJob
          ? `${nextJob.jobRef} for ${nextJob.customerName} is next. ${nextJob.nextStep || "Open the job sheet and keep work moving."}`
          : "You’re clear for now. New work will appear here as soon as it is assigned.",
        href: nextJob ? `/dashboard/jobs/${nextJob.id}` : "/dashboard/calendar",
        action: nextJob ? "Open next job" : "Open schedule",
      },
      {
        label: "Do next",
        text: nextJob
          ? nextJob.status === "IN_PROGRESS"
            ? "Finish the work, capture proof, then submit or hand over for invoice."
            : "Start the job, add notes and proof, then finish it from the same place."
          : "Check today’s schedule or wait for the next assignment.",
        href: nextJob ? `/dashboard/jobs/${nextJob.id}` : "/dashboard/scheduling",
        action: nextJob ? "Open job sheet" : "Open schedule",
      },
      {
        label: "Can wait",
        text:
          Number(data?.summary.overdueAssignedJobs || 0) > 0
            ? `${data?.summary.overdueAssignedJobs} overdue job${Number(data?.summary.overdueAssignedJobs || 0) === 1 ? "" : "s"} should stay visible, but lower-priority items can wait.`
            : "Lower-priority updates can wait until today’s live work is done.",
        href: "/dashboard/jobs",
        action: "View all jobs",
      },
    ],
    [data?.summary.overdueAssignedJobs, nextJob],
  );

  if (permissionsReady && !hasWorkspacePermission(permissions, "technician.execute")) {
    return (
      <DashboardShell>
        <div className="operator-stack" data-testid="technician-governance-blocked">
          <OperatorPageHeader
            eyebrow="Field OS"
            title={`${terms.technicians} queue`}
            subtitle="Field-execution actions are restricted to technician-capable workspace roles."
            stats={[]}
          />
          <OperatorEmptyStateCard
            title="Technician access restricted"
            description="Your workspace role cannot use technician execution actions. Ask an owner, admin, technician, or legacy staff user for access."
          />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Field OS"
          title="Today’s work"
          subtitle="Open the next job, finish the work cleanly, add proof, and hand back a result the team can use straight away."
          actions={[
            { label: nextJob ? "Open next job" : "Open schedule", href: nextJob ? `/dashboard/jobs/${nextJob.id}` : "/dashboard/scheduling" },
            { label: "Offline queue", href: "/dashboard/technician/offline", variant: "secondary" },
            { label: "All jobs", href: "/dashboard/jobs", variant: "secondary" },
          ]}
          shortcuts={["Open job → do the work → add proof → hand it back cleanly", "Lower-priority updates can wait until the live job is under control"]}
          stats={stats}
        />

        <section className="card operator-section mt-focus-panel" data-testid="technician-my-day-strip">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">My Day</h2>
              <p className="operator-section__subtitle">Next job, directions, start work, upload evidence, complete job, and sync status stay one tap away.</p>
            </div>
            <span className="operator-tag">Sync {offlineQueue.length + offlineBinaryQueue.length ? "queued" : "clear"}</span>
          </div>
          <div className="mt-pulse-grid">
            <a className="mt-surface-note mt-linkCard" href={nextJob ? `/dashboard/jobs/${nextJob.id}` : "/dashboard/scheduling"} data-testid="technician-next-job-action">
              <strong>Next Job</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>{nextJob ? `${nextJob.jobRef || "Assigned job"} · ${nextJob.customerName || "Customer"}` : "No assigned job is waiting."}</p>
              <span className="mt-linkCard__action">{nextJob ? "Open job" : "Open schedule"}</span>
            </a>
            <a className="mt-surface-note mt-linkCard" href={nextJob ? `/dashboard/jobs/${nextJob.id}` : "/dashboard/technician"} data-testid="technician-start-work-action">
              <strong>Start Work</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>Use the job sheet as the authority for notes, evidence, materials, and completion.</p>
              <span className="mt-linkCard__action">Open job sheet</span>
            </a>
            <a className="mt-surface-note mt-linkCard" href="/dashboard/technician/offline" data-testid="technician-sync-status-action">
              <strong>Sync Status</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>{offlineQueue.length + offlineBinaryQueue.length} queued item{offlineQueue.length + offlineBinaryQueue.length === 1 ? "" : "s"} on this device.</p>
              <span className="mt-linkCard__action">Review offline queue</span>
            </a>
          </div>
        </section>

        <section className="card operator-section mt-focus-panel" data-testid="technician-route-flow">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Keep the next step obvious</h2>
              <p className="operator-section__subtitle">What matters now, what to do next, and what can wait.</p>
            </div>
          </div>
          <div className="mt-pulse-grid">
            {nextActionCards.map((item) => (
              <a key={item.label} className="mt-surface-note mt-linkCard" href={item.href}>
                <strong>{item.label}</strong>
                <p className="muted" style={{ margin: "6px 0 0" }}>{item.text}</p>
                <span className="mt-linkCard__action">{item.action}</span>
              </a>
            ))}
          </div>
        </section>

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        {capacityStatus ? (
          <section className="card operator-section mt-focus-panel--quiet">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Capacity status</h2>
                <p className="operator-section__subtitle">Today’s remaining capacity and overload signal for the current field user.</p>
              </div>
            </div>
            <div className="integration-card">
              <strong>{capacityStatus.unavailable ? "Unavailable" : capacityStatus.overloaded ? "Overloaded" : "Available"}</strong>
              <div className="muted" style={{ marginTop: 4 }}>
                Remaining {capacityStatus.remainingMinutes} min · Scheduled {capacityStatus.scheduledMinutes} min · Capacity {capacityStatus.availableMinutes} min
              </div>
              {Array.isArray(capacityStatus.capacityNotes) && capacityStatus.capacityNotes.length ? (
                <div className="muted" style={{ marginTop: 4 }}>{capacityStatus.capacityNotes.join(" • ")}</div>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="card operator-section mt-focus-panel--quiet" data-testid="offline-mobile-foundation">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Offline-ready packet</h2>
              <p className="operator-section__subtitle">Assigned job summaries plus an IndexedDB evidence queue. No tokens, secrets, portal links, or full app pages are cached.</p>
            </div>
            <button className="button secondary" type="button" onClick={() => void syncOffline()} disabled={offlineBusy || (offlineQueue.length + offlineBinaryQueue.length) === 0}>
              {offlineBusy ? "Syncing..." : `Sync queue (${offlineQueue.length + offlineBinaryQueue.length})`}
            </button>
          </div>
          <div className="mt-pulse-grid">
            <div className="integration-card">
              <strong>{offlinePacket?.jobs?.length ?? data?.jobs?.length ?? 0} assigned jobs scoped</strong>
              <div className="muted" style={{ marginTop: 4 }}>Packet state: {offlinePacket ? "ready" : "online refresh needed"}</div>
              <div className="muted" style={{ marginTop: 4 }}>Field workflow: {offlinePacket?.fieldOperation?.usableOffline ? "usable offline" : "refresh online"} · server remains source of truth</div>
            </div>
            <div className="integration-card">
              <strong>{offlineQueue.filter((item) => item.state === "conflict").length} conflicts</strong>
              <div className="muted" style={{ marginTop: 4 }} data-testid="offline-conflict-warning">Queued · syncing · conflict · synced states are preserved locally.</div>
            </div>
            <div className="integration-card">
              <strong>{offlineBinaryQueue.length} offline files</strong>
              <div className="muted" style={{ marginTop: 4 }}>{offlineWorkerReady ? "Service worker ready" : "IndexedDB queue ready"} · saved offline · syncing · conflict · uploaded.</div>
            </div>
          </div>
          {offlineBinaryQueue.length ? (
            <div className="operator-chipRow" style={{ marginTop: 12 }} data-testid="offline-binary-queue-state">
              {offlineBinaryQueue.slice(0, 6).map((item) => (
                <span key={item.clientMutationId} className="operator-tag">
                  {item.kind.replaceAll("_", " ")} · {item.state}
                </span>
              ))}
              <button className="button secondary" type="button" onClick={() => void clearBinaryQueue()} disabled={offlineBusy}>
                Clear offline files
              </button>
            </div>
          ) : null}
          {Array.isArray(offlinePacket?.conflictResolution) && offlinePacket.conflictResolution.length ? (
            <details style={{ marginTop: 12 }} data-testid="offline-conflict-resolution-options">
              <summary>Conflict options</summary>
              <div className="operator-chipRow" style={{ marginTop: 10 }}>
                {offlinePacket.conflictResolution.slice(0, 7).map((item: any) => (
                  <span className="operator-tag" key={item.key}>
                    {String(item.key || "").replaceAll("_", " ")} · no blind overwrite
                  </span>
                ))}
              </div>
            </details>
          ) : null}
          {offlineQueue.length ? (
            <div className="operator-chipRow" style={{ marginTop: 12 }} data-testid="offline-metadata-queue-state">
              {offlineQueue.slice(0, 8).map((item) => (
                <span key={item.clientMutationId} className="operator-tag">
                  {item.type.replaceAll("_", " ")} · {item.state}
                </span>
              ))}
              <button className="button secondary" type="button" data-testid="offline-clear-metadata-queue" onClick={() => clearMetadataQueue()} disabled={offlineBusy}>
                Clear offline updates
              </button>
            </div>
          ) : null}
        </section>

        <section className="card operator-section mt-focus-panel">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Assigned {terms.jobs.toLowerCase()}</h2>
              <p className="operator-section__subtitle">Open the job sheet, capture proof, and keep live work moving without extra admin clutter.</p>
            </div>
          </div>
          {data?.jobs?.length ? (
            <OperatorDataTable columns="minmax(220px, 1.4fr) minmax(150px, 0.9fr) minmax(170px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">{terms.jobs.slice(0, -1) || "Job"}</div>
                <div className="operator-table__cell">Timing</div>
                <div className="operator-table__cell">Actions</div>
              </OperatorDataTableHeader>
              {data.jobs.map((job) => (
                <OperatorDataTableRow key={job.id}>
                  {(() => {
                    const stage = mapStatusToStage(job.status, technicianStages);
                    const missingStageFields = meId ? getMissingRequiredCustomFieldKeys(stage?.requiredCustomFieldKeys, technicianFields, technicianFieldValues, "technician", meId) : [];
                    return (
                      <>
                  <div className="operator-table__cell">
                    <div className="operator-cellTitle">{job.jobRef}</div>
                    <div className="operator-cellSubtle">{job.customerName} · {job.serviceName || "Service not set"} · <span data-testid="workflow-stage-label">{stage?.label || job.status}</span> · {job.status}{job.urgency ? ` · ${job.urgency.replace("_", " ")}` : ""}{missingStageFields.length ? ' · ' : ''}{missingStageFields.length ? <span data-testid="custom-field-stage-warning">{missingStageFields.join(", ")} required</span> : null}</div>
                  </div>
                  <div className="operator-table__cell">
                    <div className="operator-cellMeta">
                      <span><strong>{job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : "Not scheduled"}</strong></span>
                      {job.sequenceState ? <span>Workflow {job.sequenceState.replaceAll("_", " ")}</span> : null}
                      <span>
                        {job.urgency === "overdue"
                          ? "Late for arrival"
                          : job.urgency === "due_soon"
                          ? "Due soon"
                          : job.status === "IN_PROGRESS"
                          ? "Active field work"
                          : "Ready to start"}
                      </span>
                      {job.lastFieldEvent?.createdAt ? (
                        <span>{job.lastFieldEvent.message || job.lastFieldEvent.eventType} · {new Date(job.lastFieldEvent.createdAt).toLocaleString()}</span>
                      ) : null}
                      {job.nextStep ? <span>{job.nextStep}</span> : null}
                      {job.workflowChecklist?.slice(0, 2).map((item, index) => (
                        <span key={`${job.id}-check-${index}`}>Next: {item}</span>
                      ))}
                      {job.recentFieldEvents?.slice(0, 2).map((event, index) => (
                        <span key={`${job.id}-${event.createdAt || index}`}>{event.message || event.eventType} · {event.createdAt ? new Date(event.createdAt).toLocaleString() : "Recent"}</span>
                      ))}
                    </div>
                  </div>
                  <div className="operator-table__cell operator-table__cell--actions">
                    <OperatorRowActions
                      primaryAction={job.status === "IN_PROGRESS"
                        ? { label: busyId === job.id ? "Completing..." : "Complete job", onClick: () => void run(job.id, "complete"), disabled: busyId === job.id, testId: `technician-complete-${job.id}` }
                        : { label: busyId === job.id ? "Starting..." : "Start job", onClick: () => void run(job.id, "start"), disabled: busyId === job.id, testId: `technician-start-${job.id}` }}
                      actions={[
                        { label: busyId === job.id ? "Arriving..." : "Log arrival", onClick: () => void arrive(job.id), group: "Field actions", description: "Record that the team has arrived on site", disabled: busyId === job.id || job.status === "COMPLETED" || job.status === "CANCELLED", testId: `technician-arrive-${job.id}` },
                        { label: "Open job sheet", href: `/dashboard/jobs/${job.id}`, group: "Internal", description: "Open the full internal job record" },
                      ]}
                    />
                    <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                      <input
                        aria-label={`Add field note for ${job.jobRef}`}
                        className="input"
                        data-testid={`technician-note-input-${job.id}`}
                        value={noteDrafts[job.id] || ""}
                        onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [job.id]: e.target.value }))}
                        placeholder="Add technician note"
                        disabled={busyId === job.id}
                      />
                      <button aria-label={`Save field note for ${job.jobRef}`} className="button secondary" data-testid={`technician-note-save-${job.id}`} type="button" onClick={() => void saveNote(job.id)} disabled={busyId === job.id || !String(noteDrafts[job.id] || "").trim()}>
                        {busyId === job.id ? "Saving..." : "Save note"}
                      </button>
                    </div>
                    <section className="card mt-focus-panel--quiet" style={{ marginTop: 10, padding: 14 }} data-testid="execution-record-card">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <div>
                          <strong>Completed work record</strong>
                          <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                            {job.executionRecord?.status || "Not started"}
                            {job.executionRecord?.submittedAt ? ` • Submitted ${new Date(job.executionRecord.submittedAt).toLocaleString()}` : ""}
                            {job.executionRecord?.acknowledgedAt ? ` • Acknowledged ${new Date(job.executionRecord.acknowledgedAt).toLocaleString()}` : ""}
                          </div>
                        </div>
                        <button className="button secondary" type="button" onClick={() => void startExecution(job)} disabled={busyId === job.id}>
                          {job.executionRecord ? "Open draft" : "Start record"}
                        </button>
                      </div>
                      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                        <input
                          className="input"
                          value={executionSummaryDrafts[job.id] ?? job.executionRecord?.summary ?? ""}
                          onChange={(event) => setExecutionSummaryDrafts((current) => ({ ...current, [job.id]: event.target.value }))}
                          placeholder="Completed work summary"
                        />
                        <textarea
                          className="textarea"
                          value={executionNoteDrafts[job.id] ?? job.executionRecord?.notesJson?.completionNotes ?? ""}
                          onChange={(event) => setExecutionNoteDrafts((prev) => ({ ...prev, [job.id]: event.target.value }))}
                          placeholder="Completed work notes"
                          data-testid="execution-notes-input"
                        />
                        <div data-testid="execution-checklist" style={{ display: "grid", gap: 6 }}>
                          {currentChecklist(job).map((item, index) => (
                            <label key={item.key} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <input
                                type="checkbox"
                                checked={item.completed}
                                onChange={(event) =>
                                  setExecutionChecklistDrafts((current) => {
                                    const next = [...currentChecklist(job)];
                                    next[index] = { ...next[index], completed: event.target.checked };
                                    return { ...current, [job.id]: next };
                                  })
                                }
                              />
                              <span>{item.label}</span>
                            </label>
                          ))}
                        </div>
                        <div data-testid="execution-evidence-list" style={{ display: "grid", gap: 6 }}>
                          <div className="muted" style={{ fontSize: 13 }}>Evidence references: {Number(job.executionRecord?.evidenceCount || 0)}</div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              className="input"
                              value={executionEvidenceDrafts[job.id] || ""}
                              onChange={(event) => setExecutionEvidenceDrafts((current) => ({ ...current, [job.id]: event.target.value }))}
                              placeholder="Evidence reference"
                            />
                            <button className="button secondary" type="button" onClick={() => void addEvidence(job.id)} disabled={busyId === job.id}>
                              Add
                            </button>
                            <button className="button secondary" type="button" onClick={() => queueOfflineEvidence(job)} disabled={busyId === job.id} data-testid={`offline-queue-photo-metadata-${job.id}`}>
                              Queue offline
                            </button>
                          </div>
                          <div className="mt-inline-form" style={{ alignItems: "center" }} data-testid="offline-technician-workflow">
                            <label className="button secondary" style={{ cursor: "pointer" }}>
                              Queue before photo
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
                                data-testid={`offline-before-photo-input-${job.id}`}
                                style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
                                onChange={(event) => {
                                  const file = event.currentTarget.files?.[0];
                                  void queueOfflineBinary(job, file, "before_photo");
                                  event.currentTarget.value = "";
                                }}
                              />
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
                                data-testid={`offline-binary-input-${job.id}`}
                                style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
                                onChange={(event) => {
                                  const file = event.currentTarget.files?.[0];
                                  void queueOfflineBinary(job, file, "before_photo");
                                  event.currentTarget.value = "";
                                }}
                              />
                            </label>
                            <label className="button secondary" style={{ cursor: "pointer" }}>
                              Queue after photo
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
                                data-testid={`offline-after-photo-input-${job.id}`}
                                style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
                                onChange={(event) => {
                                  const file = event.currentTarget.files?.[0];
                                  void queueOfflineBinary(job, file, "after_photo");
                                  event.currentTarget.value = "";
                                }}
                              />
                            </label>
                            <span className="muted" style={{ fontSize: 13 }}>
                              Saved offline first, then synced with conflict review.
                            </span>
                          </div>
                          <div className="mt-inline-form" style={{ alignItems: "center" }}>
                            <button className="button secondary" type="button" data-testid={`offline-queue-signature-${job.id}`} onClick={() => queueOfflineAction(job, "signature_metadata", { signerRole: "customer", capturedAt: new Date().toISOString() }, "Signature metadata queued")}>
                              Queue signature
                            </button>
                            <button className="button secondary" type="button" data-testid={`offline-queue-completion-notes-${job.id}`} onClick={() => queueOfflineAction(job, "completion_notes", { notes: executionNoteDrafts[job.id] ?? job.executionRecord?.notesJson?.completionNotes ?? "" }, "Completion notes queued")}>
                              Queue notes
                            </button>
                            <button className="button secondary" type="button" data-testid={`offline-queue-material-${job.id}`} onClick={() => queueOfflineAction(job, "material_usage", { item: "field_material", quantity: 1 }, "Material usage queued")}>
                              Queue material
                            </button>
                            <button className="button secondary" type="button" data-testid={`offline-queue-payment-${job.id}`} onClick={() => queueOfflineAction(job, "payment_note", { method: "offline_record", amountCents: 0 }, "Payment note queued")}>
                              Queue payment note
                            </button>
                            <button className="button" type="button" data-testid={`offline-queue-complete-${job.id}`} onClick={() => queueOfflineAction(job, "status_change", { status: "COMPLETED", pendingSync: true }, "Completion queued pending sync")}>
                              Queue complete
                            </button>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button className="button secondary" type="button" onClick={() => void saveExecution(job)} disabled={busyId === job.id}>
                            {busyId === job.id ? "Saving..." : "Save draft"}
                          </button>
                          <button className="button" type="button" onClick={() => void saveExecution(job, true)} disabled={busyId === job.id} data-testid="execution-submit">
                            {busyId === job.id ? "Submitting..." : "Submit completion"}
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>
                      </>
                    );
                  })()}
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title={`No assigned ${terms.jobs.toLowerCase()}`}
              description={`You’re clear for now. New assigned work will appear here as soon as it is handed over to this ${terms.technicians.slice(0, -1).toLowerCase() || "technician"}.`}
              actions={[{ label: "Open schedule", href: "/dashboard/scheduling", variant: "secondary" }]}
            />
          )}
        </section>

        {meId ? (
          <EntityCustomFieldsCard
            title={`${terms.technicians.slice(0, -1) || "Technician"} details`}
            entityType="technician"
            entityId={meId}
            onSaved={() => undefined}
          />
        ) : null}

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Today’s bookings</h2>
              <p className="operator-section__subtitle">Upcoming assigned bookings for the current day.</p>
            </div>
          </div>
          {data?.bookings?.length ? (
            <OperatorDataTable columns="minmax(220px, 1.3fr) minmax(160px, 1fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Booking</div>
                <div className="operator-table__cell">Window</div>
              </OperatorDataTableHeader>
              {data.bookings.map((booking) => (
                <OperatorDataTableRow key={booking.id}>
                  <div className="operator-table__cell">
                    <div className="operator-cellTitle">{booking.customerName || booking.id}</div>
                    <div className="operator-cellSubtle">{booking.status}</div>
                  </div>
                  <div className="operator-table__cell">
                    {new Date(booking.startsAt).toLocaleString()} - {new Date(booking.endsAt).toLocaleTimeString()}
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="No bookings due today"
              description="New visit windows will appear here if the day changes."
            />
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
