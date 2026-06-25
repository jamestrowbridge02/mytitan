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
  technicianThroughput: Array<{ technicianId: string; technicianName: string; completedJobs: number }>;
  summary: {
    upcomingBookingsNext7Days: number;
    publicBookingsAwaitingConversion: number;
    communicationsLast7Days: number;
    activityEventsLast7Days: number;
    customersNeedingFollowUp: number;
    billingReadyJobs: number;
    portalReadyJobs: number;
    issuedAwaitingPayment: number;
    bookingsConvertedLast7Days: number;
    agedUnlinkedBookings: number;
    technicianCompletionQueue: number;
    portalLinksExpiringSoon: number;
    overdueDispatchFollowUps: number;
    expiredPortalLinks: number;
    overdueInvoices: number;
    dueServicePlans: number;
    overduePlanRuns: number;
    quotesAwaitingApproval: number;
    approvedQuotesAwaitingConversion: number;
    overloadedTechnicianDays: number;
    unassignedDueWorkPressure: number;
    lowStockRows: number;
    shortageRows: number;
    purchaseOrdersOpen: number;
    jobPartsAwaitingStock: number;
    openComplianceExceptions: number;
    breachedSlaEvents: number;
  };
  attentionQueue: Array<{ key: string; label: string; count: number; href: string; hint: string }>;
  alerts: Array<{ key: string; severity: string; label: string; count: number; href: string }>;
  operationalIssues?: Array<{ key: string; severity: string; count: number; issue: string; happened: string; impact: string; suggestedAction: string; href: string }>;
  trends: {
    completedLast7Days: number;
    completedPrevious7Days: number;
    completionDelta: number;
    communicationByDay: Array<{ day: string; count: number }>;
  };
};

type BusinessHealthData = {
  platformDiagnosticsVisible: boolean;
  source: string;
  summary: {
    bookingsTrend: { current: number; previous: number; delta: number };
    invoiceAgeing: Array<{ key: string; label: string; count: number; amountCents: number }>;
    unpaidValueCents: number;
    jobCompletionVelocity: { current: number; previous: number; delta: number };
    locationUtilisation: number | null;
    technicianUtilisation: number | null;
    customerRepeatRatePct: number | null;
    reviewGenerationStatus: { generated: number; eligibleCompletedJobs: number };
    stockPressure: { lowStockRows: number; shortageRows: number };
    revenueCollectionPressure: { overdueInvoices: number; unpaidInvoices: number; unpaidValueCents: number };
    revenueTrend?: { currentCents: number; previousCents: number; delta: number };
    marginTrend?: { available: boolean; reason?: string; currentMarginCents?: number | null; previousMarginCents?: number | null; delta?: number | null };
    utilisation?: { locationPct: number | null; technicianActiveAssignments: number };
    technicianProductivity?: { completedExecutionRecords: number; basis: string };
    locationProductivity?: { completedCurrent30Days: number; completedPrevious30Days: number; delta: number };
    bookingConversion?: { bookings: number; convertedJobs: number; conversionPct: number | null };
    reviewPerformance?: { generated: number; eligibleCompletedJobs: number; coveragePct: number | null };
    customerRetention?: { repeatCustomers: number; activeCustomers: number; repeatRatePct: number | null };
    collectionPerformance?: { paidInvoiceCount: number; paidValueCents: number; unpaidInvoiceCount: number; unpaidValueCents: number; collectionPct: number | null };
    sourceLinks?: Record<string, string>;
  };
  locations: Array<{ locationId: string; locationName: string; workload: number; bookings: number; revenueCents: number; invoiceAgeing: { overdueCount: number; amountCents: number }; completionVelocity: number; completionRatePct?: number | null; utilisationPct?: number | null; capacity?: { scheduledWorkload: number; activeStaffContext: number; basis: string }; staffingPressure: string }>;
  technicians: Array<{ technicianId: string; technicianName: string; activeAssignments: number; completedExecutionRecords: number; utilizationBasis: string }>;
  issues: Array<{ key: string; issue: string; impact: string; action: string; href: string }>;
};

const EMPTY: IntelligenceData = {
  jobsByStatus: [],
  technicianLoad: [],
  technicianThroughput: [],
  summary: {
    upcomingBookingsNext7Days: 0,
    publicBookingsAwaitingConversion: 0,
    communicationsLast7Days: 0,
    activityEventsLast7Days: 0,
    customersNeedingFollowUp: 0,
    billingReadyJobs: 0,
    portalReadyJobs: 0,
    issuedAwaitingPayment: 0,
    bookingsConvertedLast7Days: 0,
    agedUnlinkedBookings: 0,
    technicianCompletionQueue: 0,
    portalLinksExpiringSoon: 0,
    overdueDispatchFollowUps: 0,
    expiredPortalLinks: 0,
    overdueInvoices: 0,
    dueServicePlans: 0,
    overduePlanRuns: 0,
    quotesAwaitingApproval: 0,
    approvedQuotesAwaitingConversion: 0,
    overloadedTechnicianDays: 0,
    unassignedDueWorkPressure: 0,
    lowStockRows: 0,
    shortageRows: 0,
    purchaseOrdersOpen: 0,
    jobPartsAwaitingStock: 0,
    openComplianceExceptions: 0,
    breachedSlaEvents: 0,
  },
  attentionQueue: [],
  alerts: [],
  trends: {
    completedLast7Days: 0,
    completedPrevious7Days: 0,
    completionDelta: 0,
    communicationByDay: [],
  },
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format((Number(cents || 0)) / 100);
}

export default function IntelligencePage() {
  const [data, setData] = useState<IntelligenceData>(EMPTY);
  const [businessHealth, setBusinessHealth] = useState<BusinessHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      void apiFetch("/metrics/business-health")
        .then((health) => {
          if (health) setBusinessHealth(health as BusinessHealthData);
        })
        .catch(() => setBusinessHealth(null));
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
      { label: "Awaiting payment", value: String(data.summary.issuedAwaitingPayment), hint: "Issued invoices still waiting on payment" },
      { label: "Overdue invoices", value: String(data.summary.overdueInvoices), hint: "Issued invoices already past due" },
      { label: "Portal ready", value: String(data.summary.portalReadyJobs), hint: "Jobs with active customer access" },
      { label: "Plans due", value: String(data.summary.dueServicePlans), hint: "Recurring work ready to generate now" },
      { label: "Low stock", value: String(data.summary.lowStockRows), hint: "Inventory rows at or below reorder point" },
      { label: "Open POs", value: String(data.summary.purchaseOrdersOpen), hint: "Procurement rows still not fully received" },
      { label: "Compliance queue", value: String(data.summary.openComplianceExceptions), hint: "Open internal workflow and evidence exceptions" },
      { label: "SLA breached", value: String(data.summary.breachedSlaEvents), hint: "Workflow timers already beyond their due point" },
      { label: "Overloaded days", value: String(data.summary.overloadedTechnicianDays), hint: "Technician days already beyond capacity" },
      { label: "Portal expired", value: String(data.summary.expiredPortalLinks), hint: "Links that already need customer access recovery" },
      { label: "Converted", value: String(data.summary.bookingsConvertedLast7Days), hint: "Bookings turned into jobs in the last 7 days" },
      { label: "Completion delta", value: data.trends.completionDelta >= 0 ? `+${data.trends.completionDelta}` : String(data.trends.completionDelta), hint: "Last 7 days vs previous 7 days" },
    ],
    [data],
  );

  const employeeSignals = useMemo(() => {
    const rows = new Map<string, { employeeId: string; employeeName: string; assignedJobs: number; completedJobs: number }>();
    data.technicianLoad.forEach((row) => {
      rows.set(row.technicianId, {
        employeeId: row.technicianId,
        employeeName: row.technicianName || "Unknown employee",
        assignedJobs: row.assignedJobs,
        completedJobs: rows.get(row.technicianId)?.completedJobs || 0,
      });
    });
    data.technicianThroughput.forEach((row) => {
      const existing = rows.get(row.technicianId);
      rows.set(row.technicianId, {
        employeeId: row.technicianId,
        employeeName: row.technicianName || existing?.employeeName || "Unknown employee",
        assignedJobs: existing?.assignedJobs || 0,
        completedJobs: row.completedJobs,
      });
    });
    return Array.from(rows.values()).sort((left, right) => right.completedJobs - left.completedJobs || right.assignedJobs - left.assignedJobs);
  }, [data.technicianLoad, data.technicianThroughput]);

  const businessHealthStats = useMemo(() => {
    if (!businessHealth) return [];
    return [
      { key: "bookingsTrend", label: "Bookings trend", value: `${businessHealth.summary.bookingsTrend.current}`, hint: `Previous 30 days: ${businessHealth.summary.bookingsTrend.previous}` },
      { key: "invoiceAgeing", label: "Unpaid value", value: formatMoney(businessHealth.summary.unpaidValueCents), hint: `${businessHealth.summary.revenueCollectionPressure.unpaidInvoices} unpaid invoices` },
      { key: "locationProductivity", label: "Completion velocity", value: `${businessHealth.summary.jobCompletionVelocity.current}`, hint: `Previous 7 days: ${businessHealth.summary.jobCompletionVelocity.previous}` },
      { key: "bookingConversion", label: "Booking conversion", value: businessHealth.summary.bookingConversion?.conversionPct === null || businessHealth.summary.bookingConversion?.conversionPct === undefined ? "-" : `${businessHealth.summary.bookingConversion.conversionPct}%`, hint: `${businessHealth.summary.bookingConversion?.convertedJobs || 0} jobs from ${businessHealth.summary.bookingConversion?.bookings || 0} bookings` },
      { key: "collectionPerformance", label: "Collection performance", value: businessHealth.summary.collectionPerformance?.collectionPct === null || businessHealth.summary.collectionPerformance?.collectionPct === undefined ? "-" : `${businessHealth.summary.collectionPerformance.collectionPct}%`, hint: `${businessHealth.summary.revenueCollectionPressure.unpaidInvoices} unpaid invoices` },
      { key: "revenueTrend", label: "Revenue trend", value: formatMoney(businessHealth.summary.revenueTrend?.currentCents || 0), hint: `Previous 30 days: ${formatMoney(businessHealth.summary.revenueTrend?.previousCents || 0)}` },
      { key: "customerRetention", label: "Retention", value: businessHealth.summary.customerRetention?.repeatRatePct === null || businessHealth.summary.customerRetention?.repeatRatePct === undefined ? "-" : `${businessHealth.summary.customerRetention.repeatRatePct}%`, hint: "Repeat customers from real job history" },
      { key: "reviewPerformance", label: "Review performance", value: businessHealth.summary.reviewPerformance?.coveragePct === null || businessHealth.summary.reviewPerformance?.coveragePct === undefined ? "-" : `${businessHealth.summary.reviewPerformance.coveragePct}%`, hint: `${businessHealth.summary.reviewPerformance?.generated || 0} prompts from ${businessHealth.summary.reviewPerformance?.eligibleCompletedJobs || 0} eligible jobs` },
      { key: "technicianProductivity", label: "Technician productivity", value: `${businessHealth.summary.technicianProductivity?.completedExecutionRecords || 0}`, hint: businessHealth.summary.technicianProductivity?.basis || "Completed execution records" },
    ];
  }, [businessHealth]);

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Overview"
          title="Intelligence"
          subtitle="See what needs attention today across bookings, billing, dispatch, stock, and customer access."
          actions={[
            { label: "Analytics", href: "/dashboard/analytics", variant: "secondary" },
            { label: "Portal Ops", href: "/dashboard/portal", variant: "secondary" },
            { label: "Billing readiness", href: "/dashboard/billing/readiness" },
          ]}
          shortcuts={["Start with the attention queue", "Use this view to spot load, follow-up gaps, and slowdowns"]}
          stats={stats}
        />

        <OperatorGuidance
          title="How to use this view"
          items={[
            "Upcoming bookings and public booking conversion show dispatch pressure before it turns into delays.",
            "Billing-ready and portal-ready counts show which completed jobs can move forward next.",
            "Technician load shows where work is uneven across the team.",
          ]}
        />

        {error ? <p role="alert" style={{ color: "#ff8a8a", marginTop: 0 }}>{error}</p> : null}
        {loading ? <div aria-live="polite" className="operator-note" role="status">Loading attention view...</div> : null}

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Needs attention now</h2>
              <p className="operator-section__subtitle">The next queues most likely to slow down revenue, dispatch, or customer updates.</p>
            </div>
          </div>
          {data.attentionQueue.length ? (
            <OperatorDataTable columns="minmax(220px, 1fr) minmax(100px, 0.5fr) minmax(220px, 1fr) minmax(160px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Queue</div>
                <div className="operator-table__cell">Count</div>
                <div className="operator-table__cell">Why it matters</div>
                <div className="operator-table__cell">Action</div>
              </OperatorDataTableHeader>
              {data.attentionQueue.map((item) => (
                <OperatorDataTableRow key={item.key}>
                  <div className="operator-table__cell"><strong>{item.label}</strong></div>
                  <div className="operator-table__cell">{item.count}</div>
                  <div className="operator-table__cell">{item.hint}</div>
                  <div className="operator-table__cell"><a href={item.href}>Open queue</a></div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="Attention queues are calm right now"
              description="The live queue is currently clear. Open the broader work surface if you want to review active jobs and follow-through anyway."
              actions={[{ label: "Open queue", href: "/dashboard/work" }]}
            />
          )}
        </section>

        {data.alerts.length ? (
          <section className="card operator-section">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Operational alerts</h2>
                <p className="operator-section__subtitle">Live backlog signals that need attention now.</p>
              </div>
            </div>
            <OperatorDataTable columns="minmax(220px, 1fr) minmax(100px, 0.5fr) minmax(160px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Alert</div>
                <div className="operator-table__cell">Count</div>
                <div className="operator-table__cell">Action</div>
              </OperatorDataTableHeader>
              {data.alerts.map((alert) => (
                <OperatorDataTableRow key={alert.key}>
                  <div className="operator-table__cell"><strong>{alert.label}</strong></div>
                  <div className="operator-table__cell">{alert.count}</div>
                  <div className="operator-table__cell"><a href={alert.href}>Open queue</a></div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          </section>
        ) : null}

        <section className="card operator-section" data-testid="business-health-engine">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Business health</h2>
              <p className="operator-section__subtitle">Tenant business health from real bookings, jobs, invoices, locations, technicians, customers, reviews, and stock records.</p>
            </div>
          </div>
          {businessHealth ? (
            <>
              <div className="operator-grid operator-grid--three" data-testid="business-health-summary">
                {businessHealthStats.map((stat) => (
                  <a key={stat.label} className="jobs-lifecycleStep" href={businessHealth.summary.sourceLinks?.[stat.key] || "/dashboard/reports"} data-testid={`business-health-kpi-${stat.key}`}>
                    <span className="jobs-lifecycleLabel">{stat.label}</span>
                    <strong>{stat.value}</strong>
                    <p className="muted" style={{ margin: "6px 0 0 0" }}>{stat.hint}</p>
                  </a>
                ))}
              </div>
              {businessHealth.issues.length ? (
                <OperatorDataTable columns="minmax(220px, 1fr) minmax(240px, 1.2fr) minmax(160px, auto)">
                  <OperatorDataTableHeader>
                    <div className="operator-table__cell">Issue</div>
                    <div className="operator-table__cell">Impact</div>
                    <div className="operator-table__cell">Action</div>
                  </OperatorDataTableHeader>
                  {businessHealth.issues.map((issue) => (
                    <OperatorDataTableRow key={issue.key}>
                      <div className="operator-table__cell"><strong>{issue.issue}</strong></div>
                      <div className="operator-table__cell">{issue.impact}</div>
                      <div className="operator-table__cell"><a href={issue.href}>{issue.action}</a></div>
                    </OperatorDataTableRow>
                  ))}
                </OperatorDataTable>
              ) : null}
              <OperatorDataTable columns="minmax(180px, 1fr) minmax(90px, 0.5fr) minmax(90px, 0.5fr) minmax(120px, 0.7fr) minmax(120px, 0.7fr) minmax(140px, 0.8fr)">
                <OperatorDataTableHeader>
                  <div className="operator-table__cell">Location</div>
                  <div className="operator-table__cell">Jobs</div>
                  <div className="operator-table__cell">Bookings</div>
                  <div className="operator-table__cell">Revenue</div>
                  <div className="operator-table__cell">Completion</div>
                  <div className="operator-table__cell">Invoice pressure</div>
                </OperatorDataTableHeader>
                {businessHealth.locations.map((row) => (
                  <OperatorDataTableRow key={row.locationId}>
                    <div className="operator-table__cell"><strong>{row.locationName}</strong></div>
                    <div className="operator-table__cell">{row.workload}</div>
                    <div className="operator-table__cell">{row.bookings}</div>
                    <div className="operator-table__cell">{formatMoney(row.revenueCents)}</div>
                    <div className="operator-table__cell">{row.completionRatePct === null || row.completionRatePct === undefined ? "-" : `${row.completionRatePct}%`}</div>
                    <div className="operator-table__cell">{row.invoiceAgeing.overdueCount} overdue</div>
                  </OperatorDataTableRow>
                ))}
              </OperatorDataTable>
              <p className="muted" style={{ marginBottom: 0 }}>
                Platform diagnostics visible: {businessHealth.platformDiagnosticsVisible ? "yes" : "no"}. Source: {businessHealth.source.replaceAll("_", " ")}.
              </p>
            </>
          ) : (
            <OperatorEmptyStateCard title="Business health is unavailable" description="The tenant business-health endpoint did not return a payload for this workspace." />
          )}
        </section>

        {data.operationalIssues?.length ? (
          <section className="card operator-section" data-testid="operational-intelligence-engine">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Operational intelligence</h2>
                <p className="operator-section__subtitle">Real issue detection with impact and exact workflow links. No fabricated urgency or forecasts.</p>
              </div>
            </div>
            <OperatorDataTable columns="minmax(220px, 1fr) minmax(260px, 1.2fr) minmax(220px, 1fr) minmax(160px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Issue</div>
                <div className="operator-table__cell">What happened</div>
                <div className="operator-table__cell">Impact</div>
                <div className="operator-table__cell">Action</div>
              </OperatorDataTableHeader>
              {data.operationalIssues.map((issue) => (
                <OperatorDataTableRow key={issue.key}>
                  <div className="operator-table__cell"><strong>{issue.issue}</strong></div>
                  <div className="operator-table__cell">{issue.happened}</div>
                  <div className="operator-table__cell">{issue.impact}</div>
                  <div className="operator-table__cell"><a href={issue.href}>{issue.suggestedAction}</a></div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          </section>
        ) : null}

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
              ["Issued invoices awaiting payment", data.summary.issuedAwaitingPayment, "Collections is active but payment has not landed yet"],
              ["Portal-ready jobs", data.summary.portalReadyJobs, "Jobs already exposed through an active customer portal link"],
              ["Bookings converted last 7 days", data.summary.bookingsConvertedLast7Days, "Real booking-to-job throughput from the scheduling queue"],
              ["Aged unlinked bookings", data.summary.agedUnlinkedBookings, "Bookings that have been waiting for conversion for more than 48 hours"],
              ["Technician completion queue", data.summary.technicianCompletionQueue, "Assigned field jobs currently in progress"],
              ["Service plans due now", data.summary.dueServicePlans, "Recurring plans already ready for their next run"],
              ["Recurring runs needing review", data.summary.overduePlanRuns, "Pending or failed recurring runs that need operator action"],
              ["Quotes awaiting approval", data.summary.quotesAwaitingApproval, "Sent quotes still waiting on customer acceptance"],
              ["Approved quotes awaiting conversion", data.summary.approvedQuotesAwaitingConversion, "Approved pricing ready to become real work"],
              ["Low-stock parts", data.summary.lowStockRows, "Inventory rows already at or below their reorder threshold"],
              ["Inventory shortage pressure", data.summary.shortageRows, "Available stock is zero or negative after reservations"],
              ["Open purchase orders", data.summary.purchaseOrdersOpen, "Procurement rows still waiting on full receipt"],
              ["Job parts awaiting stock action", data.summary.jobPartsAwaitingStock, "Planned job parts still need reserve or use decisions"],
              ["Open compliance exceptions", data.summary.openComplianceExceptions, "Internal workflow, evidence, or approval issues still need operator action"],
              ["Breached SLA events", data.summary.breachedSlaEvents, "Configured workflow timers are already beyond their due time"],
              ["Unassigned due work", data.summary.unassignedDueWorkPressure, "Upcoming work and recurring pressure without technician ownership"],
              ["Technician days overloaded", data.summary.overloadedTechnicianDays, "Technician schedules already exceed daily capacity"],
              ["Portal links expiring soon", data.summary.portalLinksExpiringSoon, "Customer access links that need refresh before they go stale"],
              ["Portal links expired", data.summary.expiredPortalLinks, "Customer access links that have already lapsed and need regeneration"],
              ["Dispatch follow-ups overdue", data.summary.overdueDispatchFollowUps, "Converted work still waiting for dispatch follow-through"],
              ["Overdue invoices", data.summary.overdueInvoices, "Issued invoices already past their due date without payment"],
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
              <h2 className="operator-section__title">Velocity and trends</h2>
              <p className="operator-section__subtitle">Recent completion and communication movement from durable activity and job data.</p>
            </div>
          </div>
          <OperatorDataTable columns="minmax(220px, 1fr) minmax(120px, 0.6fr)">
            <OperatorDataTableHeader>
              <div className="operator-table__cell">Trend</div>
              <div className="operator-table__cell">Value</div>
            </OperatorDataTableHeader>
            <OperatorDataTableRow>
              <div className="operator-table__cell">Completed jobs last 7 days</div>
              <div className="operator-table__cell">{data.trends.completedLast7Days}</div>
            </OperatorDataTableRow>
            <OperatorDataTableRow>
              <div className="operator-table__cell">Completed jobs previous 7 days</div>
              <div className="operator-table__cell">{data.trends.completedPrevious7Days}</div>
            </OperatorDataTableRow>
            {data.trends.communicationByDay.map((row) => (
              <OperatorDataTableRow key={row.day}>
                <div className="operator-table__cell">Communications on {row.day}</div>
                <div className="operator-table__cell">{row.count}</div>
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

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Technician throughput</h2>
              <p className="operator-section__subtitle">Completed jobs in the last 7 days by technician ownership.</p>
            </div>
          </div>
          {data.technicianThroughput.length ? (
            <OperatorDataTable columns="minmax(220px, 1fr) minmax(120px, 0.6fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Technician</div>
                <div className="operator-table__cell">Completed jobs</div>
              </OperatorDataTableHeader>
              {data.technicianThroughput.map((row) => (
                <OperatorDataTableRow key={row.technicianId}>
                  <div className="operator-table__cell">{row.technicianName}</div>
                  <div className="operator-table__cell">{row.completedJobs}</div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="No technician throughput yet"
              description="Completed-work throughput appears once assigned technicians start closing jobs."
              actions={[{ label: "Open technician queue", href: "/dashboard/technician", variant: "secondary" }]}
            />
          )}
        </section>

        <section className="card operator-section" data-testid="employee-performance-signals">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Employee performance signals</h2>
              <p className="operator-section__subtitle">Owner-visible employee metrics drawn only from authoritative assignment and completion data.</p>
            </div>
          </div>
          <OperatorGuidance
            title="What is included"
            items={[
              "Jobs completed comes from technician-owned completions in the last 7 days.",
              "Current assigned jobs shows active load still sitting with that employee.",
              "Revenue handled, refunds, and productivity scoring are intentionally excluded here until the data is authoritative.",
            ]}
          />
          {employeeSignals.length ? (
            <OperatorDataTable columns="minmax(220px, 1fr) minmax(140px, 0.7fr) minmax(140px, 0.7fr) minmax(220px, 1fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Employee</div>
                <div className="operator-table__cell">Completed jobs</div>
                <div className="operator-table__cell">Current load</div>
                <div className="operator-table__cell">Operational reading</div>
              </OperatorDataTableHeader>
              {employeeSignals.map((row) => (
                <OperatorDataTableRow key={row.employeeId}>
                  <div className="operator-table__cell"><strong>{row.employeeName}</strong></div>
                  <div className="operator-table__cell">{row.completedJobs}</div>
                  <div className="operator-table__cell">{row.assignedJobs}</div>
                  <div className="operator-table__cell">
                    {row.completedJobs > 0
                      ? `Closed ${row.completedJobs} jobs recently and currently holds ${row.assignedJobs} active assignments.`
                      : `No recent completions yet and currently holds ${row.assignedJobs} active assignments.`}
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="No employee metrics yet"
              description="Employee signals appear when technician assignments and completions exist in this workspace."
              actions={[{ label: "Open jobs", href: "/dashboard/jobs", variant: "secondary" }]}
            />
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
