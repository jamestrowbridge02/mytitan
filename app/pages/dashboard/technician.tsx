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
  };
  jobs: Array<{
    id: string;
    jobRef: string;
    customerName: string;
    status: string;
    serviceName?: string | null;
    scheduledAt?: string | null;
    urgency?: string;
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

  async function run(jobId: string, action: "start" | "complete") {
    setBusyId(jobId);
    try {
      await apiFetch(`/tech/jobs/${jobId}/${action}`, {
        method: "POST",
        body: JSON.stringify({ note: action === "start" ? "Technician started assigned work" : "Technician completed assigned work" }),
      });
      await load();
    } catch (err: any) {
      setError(err?.message || `Failed to ${action} job`);
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
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to log arrival");
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
      await load();
    } catch (err: any) {
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
                      <span>
                        {job.urgency === "overdue"
                          ? "Late for arrival"
                          : job.urgency === "due_soon"
                          ? "Due soon"
                          : job.status === "IN_PROGRESS"
                          ? "Active field work"
                          : "Ready to start"}
                      </span>
                    </div>
                  </div>
                  <div className="operator-table__cell operator-table__cell--actions">
                    <OperatorRowActions
                      primaryAction={job.status === "IN_PROGRESS"
                        ? { label: busyId === job.id ? "Completing..." : "Complete", onClick: () => void run(job.id, "complete"), disabled: busyId === job.id }
                        : { label: busyId === job.id ? "Starting..." : "Start", onClick: () => void run(job.id, "start"), disabled: busyId === job.id }}
                      actions={[
                        { label: busyId === job.id ? "Arriving..." : "Log arrival", onClick: () => void arrive(job.id), group: "Field actions", description: "Record that the technician has arrived on site", disabled: busyId === job.id },
                        { label: "Open job", href: `/dashboard/jobs/${job.id}`, group: "Internal", description: "Open the full internal job record" },
                      ]}
                    />
                    <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                      <input
                        className="input"
                        value={noteDrafts[job.id] || ""}
                        onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [job.id]: e.target.value }))}
                        placeholder="Add technician note"
                      />
                      <button className="button secondary" type="button" onClick={() => void saveNote(job.id)} disabled={busyId === job.id || !String(noteDrafts[job.id] || "").trim()}>
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
