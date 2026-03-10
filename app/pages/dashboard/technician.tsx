import { useEffect, useMemo, useState } from "react";
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
  const [data, setData] = useState<TechQueue | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  async function load() {
    try {
      const res = await apiFetch("/tech/queue");
      setData(res);
      setError("");
    } catch (err: any) {
      setError(err?.message || "Failed to load technician queue");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function run(jobId: string, action: "start" | "complete") {
    setBusyId(jobId);
    setError("");
    try {
      await apiFetch(`/tech/jobs/${jobId}/${action}`, {
        method: "POST",
        body: JSON.stringify({ note: action === "start" ? "Technician started assigned work" : "Technician completed assigned work" }),
      });
      setNotice(action === "start" ? "Technician moved into active work" : "Job marked completed");
      await load();
    } catch (err: any) {
      setNotice("");
      setError(err?.message || `Failed to ${action} job`);
    } finally {
      setBusyId(null);
    }
  }

  async function arrive(jobId: string) {
    setBusyId(jobId);
    setError("");
    try {
      await apiFetch(`/tech/jobs/${jobId}/arrive`, {
        method: "POST",
        body: JSON.stringify({ note: "Technician arrived on site" }),
      });
      setNotice("Arrival logged");
      await load();
    } catch (err: any) {
      setNotice("");
      setError(err?.message || "Failed to log arrival");
    } finally {
      setBusyId(null);
    }
  }

  async function saveNote(jobId: string) {
    const note = String(noteDrafts[jobId] || "").trim();
    if (!note) return;
    setBusyId(jobId);
    setError("");
    try {
      await apiFetch(`/tech/jobs/${jobId}/note`, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
      setNoteDrafts((prev) => ({ ...prev, [jobId]: "" }));
      setNotice("Field note saved");
      await load();
    } catch (err: any) {
      setNotice("");
      setError(err?.message || "Failed to save note");
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
          title="Technician queue"
          subtitle="A first technician-facing surface for assigned work, mobile-friendly triage, and simple status handoff from dispatch."
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
            "This route is intentionally simplified for technician use and mobile scanning.",
            "Status actions here reuse the existing job lifecycle so audit, activity, and automation hooks stay intact.",
            "Dispatch remains in Command Centre and Calendar; this page is for technician handoff and execution.",
          ]}
        />

        {error ? <p role="alert" style={{ color: "#ff8a8a", marginTop: 0 }}>{error}</p> : null}
        {notice ? <div aria-live="polite" className="ccv2-toast ccv2-toast--info" role="status">{notice}</div> : null}

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Assigned jobs</h2>
              <p className="operator-section__subtitle">A simplified queue of active work owned by the current technician.</p>
            </div>
          </div>
          {data?.jobs?.length ? (
            <OperatorDataTable columns="minmax(220px, 1.4fr) minmax(150px, 0.9fr) minmax(170px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Job</div>
                <div className="operator-table__cell">Timing</div>
                <div className="operator-table__cell">Actions</div>
              </OperatorDataTableHeader>
              {data.jobs.map((job) => (
                <OperatorDataTableRow key={job.id}>
                  <div className="operator-table__cell">
                    <div className="operator-cellTitle">{job.jobRef}</div>
                    <div className="operator-cellSubtle">{job.customerName} · {job.serviceName || "Service not set"} · {job.status}{job.urgency ? ` · ${job.urgency.replace("_", " ")}` : ""}</div>
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
                        ? { label: busyId === job.id ? "Completing..." : "Complete", onClick: () => void run(job.id, "complete"), disabled: busyId === job.id }
                        : { label: busyId === job.id ? "Starting..." : "Start", onClick: () => void run(job.id, "start"), disabled: busyId === job.id }}
                      actions={[
                        { label: busyId === job.id ? "Arriving..." : "Log arrival", onClick: () => void arrive(job.id), group: "Field actions", description: "Record that the technician has arrived on site", disabled: busyId === job.id || job.status === "COMPLETED" || job.status === "CANCELLED" },
                        { label: "Open job", href: `/dashboard/jobs/${job.id}`, group: "Internal", description: "Open the full internal job record" },
                      ]}
                    />
                    <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                      <input
                        aria-label={`Add field note for ${job.jobRef}`}
                        className="input"
                        value={noteDrafts[job.id] || ""}
                        onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [job.id]: e.target.value }))}
                        placeholder="Add technician note"
                        disabled={busyId === job.id}
                      />
                      <button aria-label={`Save field note for ${job.jobRef}`} className="button secondary" type="button" onClick={() => void saveNote(job.id)} disabled={busyId === job.id || !String(noteDrafts[job.id] || "").trim()}>
                        {busyId === job.id ? "Saving..." : "Save note"}
                      </button>
                    </div>
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="No assigned jobs"
              description="Assigned field work will appear here once dispatch hands jobs over to this technician."
              actions={[{ label: "Open calendar", href: "/dashboard/calendar", variant: "secondary" }]}
            />
          )}
        </section>

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
