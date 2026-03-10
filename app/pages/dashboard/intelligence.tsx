import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import {
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorGuidance,
  OperatorPageHeader,
} from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";

type IntelligenceData = {
  jobsByStatus: Array<{ status: string; count: number }>;
  technicianLoad: Array<{ technicianId: string; technicianName: string; assignedJobs: number }>;
  summary: {
    upcomingBookingsNext7Days: number;
    publicBookingsAwaitingConversion: number;
    communicationsLast7Days: number;
    activityEventsLast7Days: number;
    customersNeedingFollowUp: number;
    billingReadyJobs: number;
    portalReadyJobs: number;
  };
};

const EMPTY: IntelligenceData = {
  jobsByStatus: [],
  technicianLoad: [],
  summary: {
    upcomingBookingsNext7Days: 0,
    publicBookingsAwaitingConversion: 0,
    communicationsLast7Days: 0,
    activityEventsLast7Days: 0,
    customersNeedingFollowUp: 0,
    billingReadyJobs: 0,
    portalReadyJobs: 0,
  },
};

export default function IntelligencePage() {
  const [data, setData] = useState<IntelligenceData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch("/metrics/intelligence");
        setData({ ...EMPTY, ...(res || {}) });
        setError("");
      } catch (err: any) {
        setError(err?.message || "Failed to load intelligence");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const stats = useMemo(
    () => [
      { label: "Upcoming bookings", value: String(data.summary.upcomingBookingsNext7Days), hint: "Next 7 days of schedule load" },
      { label: "Follow-up load", value: String(data.summary.customersNeedingFollowUp), hint: "Customers without recent activity" },
      { label: "Billing ready", value: String(data.summary.billingReadyJobs), hint: "Completed work not yet invoiced" },
      { label: "Portal ready", value: String(data.summary.portalReadyJobs), hint: "Jobs with active customer access" },
    ],
    [data],
  );

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Business OS"
          title="Intelligence"
          subtitle="DB-backed operational intelligence built from real jobs, bookings, customer activity, billing readiness, and technician assignment data."
          actions={[
            { label: "Portal Ops", href: "/dashboard/portal", variant: "secondary" },
            { label: "Billing readiness", href: "/dashboard/billing/readiness" },
          ]}
          shortcuts={["This view is DB-backed", "Use it to spot load, follow-up debt, and conversion bottlenecks"]}
          stats={stats}
        />

        <OperatorGuidance
          title="How to use this view"
          items={[
            "Upcoming bookings and public booking conversion show dispatch pressure before it becomes operational debt.",
            "Billing-ready and portal-ready counts expose which completed jobs can move into revenue or customer self-service next.",
            "Technician load reveals assignment imbalance using current active job ownership only.",
          ]}
        />

        {error ? <p role="alert" style={{ color: "#ff8a8a", marginTop: 0 }}>{error}</p> : null}
        {loading ? <div className="operator-note">Loading intelligence...</div> : null}

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Operational signals</h2>
              <p className="operator-section__subtitle">The first business-intelligence slice grounded in durable activity, customer, booking, and job data.</p>
            </div>
          </div>

          <OperatorDataTable columns="minmax(220px, 1.4fr) minmax(140px, 0.8fr) minmax(220px, 1fr)">
            <OperatorDataTableHeader>
              <div className="operator-table__cell">Signal</div>
              <div className="operator-table__cell">Count</div>
              <div className="operator-table__cell">Meaning</div>
            </OperatorDataTableHeader>
            {[
              ["Upcoming bookings", data.summary.upcomingBookingsNext7Days, "Future schedule load already on the board"],
              ["Public bookings awaiting conversion", data.summary.publicBookingsAwaitingConversion, "Public demand not yet turned into jobs"],
              ["Communications in last 7 days", data.summary.communicationsLast7Days, "Recent outbound customer updates"],
              ["Activity velocity in last 7 days", data.summary.activityEventsLast7Days, "System-wide activity event throughput"],
              ["Customers needing follow-up", data.summary.customersNeedingFollowUp, "No activity or stale activity in the last 30 days"],
              ["Billing-ready jobs", data.summary.billingReadyJobs, "Completed work still waiting on invoice issuance"],
              ["Portal-ready jobs", data.summary.portalReadyJobs, "Jobs already exposed through an active customer portal link"],
            ].map(([label, value, meaning]) => (
              <OperatorDataTableRow key={String(label)}>
                <div className="operator-table__cell"><strong>{label}</strong></div>
                <div className="operator-table__cell">{String(value)}</div>
                <div className="operator-table__cell">{String(meaning)}</div>
              </OperatorDataTableRow>
            ))}
          </OperatorDataTable>
        </section>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Jobs by status</h2>
              <p className="operator-section__subtitle">Durable status counts from the current job system of record.</p>
            </div>
          </div>
          {data.jobsByStatus.length ? (
            <OperatorDataTable columns="minmax(180px, 1fr) minmax(120px, 0.6fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Status</div>
                <div className="operator-table__cell">Count</div>
              </OperatorDataTableHeader>
              {data.jobsByStatus.map((row) => (
                <OperatorDataTableRow key={row.status}>
                  <div className="operator-table__cell">{row.status}</div>
                  <div className="operator-table__cell">{row.count}</div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="No job intelligence yet"
              description="Status counts will appear once jobs exist for this workspace."
              actions={[{ label: "Open jobs", href: "/dashboard/jobs" }]}
            />
          )}
        </section>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Technician assignment load</h2>
              <p className="operator-section__subtitle">Current active assignment counts for dispatch balancing.</p>
            </div>
          </div>
          {data.technicianLoad.length ? (
            <OperatorDataTable columns="minmax(220px, 1fr) minmax(120px, 0.6fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Technician</div>
                <div className="operator-table__cell">Assigned jobs</div>
              </OperatorDataTableHeader>
              {data.technicianLoad.map((row) => (
                <OperatorDataTableRow key={row.technicianId}>
                  <div className="operator-table__cell">{row.technicianName}</div>
                  <div className="operator-table__cell">{row.assignedJobs}</div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="No active technician load"
              description="Assignment counts will appear when active jobs are owned by technicians."
              actions={[{ label: "Open calendar", href: "/dashboard/calendar", variant: "secondary" }]}
            />
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
