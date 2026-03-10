import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { OperatorPageHeader } from "../../../components/ui/operator-page";
import OpsSignalsBar from "../../../components/entity/OpsSignalsBar";
import { apiFetch } from "../../../lib/api";
import { getJobSignals } from "../../../lib/ops-signals";

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
  }).format((cents || 0) / 100);
}

export default function Jobs() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/jobs")
      .then((data) => setJobs(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || "Failed to load jobs"));
  }, []);

  const stats = useMemo(() => {
    const open = jobs.filter((job) => !["COMPLETED", "CANCELLED"].includes(String(job.status || "").toUpperCase())).length;
    const assigned = jobs.filter((job) => Boolean(job.technicianName || job.assignedTechnicianName)).length;
    const totalValue = jobs.reduce((sum, job) => sum + Number(job.totalCents || 0), 0);
    return [
      { label: "Jobs", value: String(jobs.length), hint: `${open} still active` },
      { label: "Assigned", value: String(assigned), hint: `${Math.max(jobs.length - assigned, 0)} need an owner` },
      { label: "Pipeline", value: formatMoney(totalValue, jobs[0]?.currency || "USD"), hint: "Quoted and live job value" },
    ];
  }, [jobs]);

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Workflow"
          title="Jobs"
          subtitle="Review the live pipeline, spot unassigned work quickly, and jump straight into the next action."
          actions={[
            { label: "Open Command Centre", href: "/dashboard/command-centre-v2", variant: "secondary" },
            { label: "Create job", href: "/dashboard/jobs/new" },
          ]}
          shortcuts={["Ctrl K for route search", "Use Command Centre for bulk updates"]}
          stats={stats}
        />

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Active queue</h2>
              <p className="operator-section__subtitle">Dense list view for faster scanning across status, customer, and value.</p>
            </div>
            <div className="operator-inline-actions">
              <Link className="button secondary operator-compact-button" href="/dashboard/calendar">
                Calendar
              </Link>
              <Link className="button secondary operator-compact-button" href="/dashboard/bookings">
                Bookings
              </Link>
            </div>
          </div>

          {error ? <p style={{ color: "#ff8a8a", marginTop: 0 }}>{error}</p> : null}

          {jobs.length ? (
            <div className="operator-list">
              {jobs.map((job) => {
                const reference = job.jobRef || job.id;
                const customer = job.customerName || job.title || "Unlabelled job";
                const total = formatMoney(job.totalCents || 0, job.currency || "USD");
                const technician = job.technicianName || job.assignedTechnicianName || "Unassigned";
                return (
                  <article key={job.id} className="operator-row">
                    <div className="operator-row__main">
                      <div className="operator-row__title">
                        <Link href={`/dashboard/jobs/${job.id}`}>{reference}</Link>
                        <span className="badge">{job.status || "OPEN"}</span>
                      </div>
                      <div className="operator-row__subtitle">{customer}</div>
                      <div style={{ marginTop: 8 }}>
                        <OpsSignalsBar {...getJobSignals(job)} compact />
                      </div>
                    </div>

                    <div className="operator-row__meta">
                      <div className="operator-row__metaLine">
                        Technician: <strong>{technician}</strong>
                      </div>
                      <div className="operator-row__metaLine">
                        Value: <strong>{total}</strong>
                      </div>
                    </div>

                    <div className="operator-row__actions">
                      <Link className="button secondary operator-compact-button" href={`/dashboard/jobs/${job.id}`}>
                        Open
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : !error ? (
            <div className="operator-empty">
              <h3>No jobs in the queue</h3>
              <p className="muted">Create the first job or open Command Centre once new work starts landing.</p>
              <div className="operator-empty__actions">
                <Link className="button" href="/dashboard/jobs/new">
                  Create job
                </Link>
                <Link className="button secondary" href="/dashboard/command-centre-v2">
                  Open Command Centre
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </DashboardShell>
  );
}
