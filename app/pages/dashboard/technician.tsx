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
  const [meId, setMeId] = useState<string | null>(null);
  const [technicianFields, setTechnicianFields] = useState<CustomField[]>([]);
  const [technicianFieldValues, setTechnicianFieldValues] = useState<CustomFieldValue[]>([]);
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
    void load();
  }, []);

  useEffect(() => {
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
      } catch {
        setTechnicianFields([]);
        setTechnicianFieldValues([]);
      }
    }
    void loadTechnicianFieldData();
  }, []);

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

  const stats = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Assigned jobs", value: String(data.summary.assignedJobs), hint: "Current active workload" },
      { label: "In progress", value: String(data.summary.inProgress), hint: "Work already underway" },
      { label: "Bookings today", value: String(data.summary.dueTodayBookings), hint: "Today’s assigned booking windows" },
      { label: "Overdue", value: String(data.summary.overdueAssignedJobs), hint: "Assigned jobs now behind schedule" },
    ];
  }, [data]);

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
