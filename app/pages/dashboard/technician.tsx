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
  OperatorGuidance,
  OperatorPageHeader,
  OperatorRowActions,
} from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import { getBusinessTerms } from "../../lib/business-config";
import { getMissingRequiredCustomFieldKeys, type CustomField, type CustomFieldValue } from "../../lib/custom-fields";
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
        body: JSON.stringify({ note: "Technician arrived on site" }),
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
      showError(err?.message || "Failed to start execution record");
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
      showError(err?.message || `Failed to ${submit ? "submit" : "save"} execution record`);
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

  const stats = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Assigned jobs", value: String(data.summary.assignedJobs), hint: "Current active workload" },
      { label: "In progress", value: String(data.summary.inProgress), hint: "Work already underway" },
      { label: "Bookings today", value: String(data.summary.dueTodayBookings), hint: "Today’s assigned booking windows" },
      { label: "Overdue", value: String(data.summary.overdueAssignedJobs), hint: "Assigned jobs now behind schedule" },
    ];
  }, [data]);

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
          title={`${terms.technicians} queue`}
          subtitle={`A first ${terms.technicians.toLowerCase()}-facing surface for assigned work, mobile-friendly triage, and simple status handoff from dispatch.`}
          actions={[
            { label: "Calendar", href: "/dashboard/calendar", variant: "secondary" },
            { label: "Jobs", href: "/dashboard/jobs" },
          ]}
          shortcuts={["Start and complete only assigned jobs here", "This route is a simplified field workflow, not a replacement for dispatch"]}
          stats={stats}
        />

        <OperatorGuidance
          title="Field workflow guidance"
          items={[
            `This route is intentionally simplified for ${terms.technicians.toLowerCase()} use and mobile scanning.`,
            "Status actions here reuse the existing job lifecycle so audit, activity, and automation hooks stay intact.",
            "Dispatch remains in Command Centre and Calendar; this page is for technician handoff and execution.",
          ]}
        />

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        {meId ? (
          <EntityCustomFieldsCard
            title={`${terms.technicians.slice(0, -1) || "Technician"} details`}
            entityType="technician"
            entityId={meId}
          />
        ) : null}

        {capacityStatus ? (
          <section className="card operator-section">
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

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Assigned {terms.jobs.toLowerCase()}</h2>
              <p className="operator-section__subtitle">A simplified queue of active work owned by the current {terms.technicians.slice(0, -1).toLowerCase() || "technician"}.</p>
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
                        ? { label: busyId === job.id ? "Completing..." : "Complete", onClick: () => void run(job.id, "complete"), disabled: busyId === job.id, testId: `technician-complete-${job.id}` }
                        : { label: busyId === job.id ? "Starting..." : "Start", onClick: () => void run(job.id, "start"), disabled: busyId === job.id, testId: `technician-start-${job.id}` }}
                      actions={[
                        { label: busyId === job.id ? "Arriving..." : "Log arrival", onClick: () => void arrive(job.id), group: "Field actions", description: "Record that the technician has arrived on site", disabled: busyId === job.id || job.status === "COMPLETED" || job.status === "CANCELLED", testId: `technician-arrive-${job.id}` },
                        { label: "Open job", href: `/dashboard/jobs/${job.id}`, group: "Internal", description: "Open the full internal job record" },
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
                    <section className="card" style={{ marginTop: 10, padding: 14 }} data-testid="execution-record-card">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <div>
                          <strong>Completion record</strong>
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
                          placeholder="Execution summary"
                        />
                        <textarea
                          className="textarea"
                          value={executionNoteDrafts[job.id] ?? job.executionRecord?.notesJson?.completionNotes ?? ""}
                          onChange={(event) => setExecutionNoteDrafts((prev) => ({ ...prev, [job.id]: event.target.value }))}
                          placeholder="Completion notes"
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
              description={`Assigned field work will appear here once dispatch hands ${terms.jobs.toLowerCase()} over to this ${terms.technicians.slice(0, -1).toLowerCase() || "technician"}.`}
              actions={[{ label: "Open calendar", href: "/dashboard/calendar", variant: "secondary" }]}
            />
          )}
        </section>

        {meId ? (
          <EntityCustomFieldsCard
            title={`${terms.technicians.slice(0, -1) || "Technician"} profile fields`}
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
              description="Assigned booking windows will appear here as dispatch schedules work for this technician."
            />
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
