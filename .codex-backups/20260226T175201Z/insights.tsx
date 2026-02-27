import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "../../components/dashboard-shell";
import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { ApiError, apiFetch } from "../../lib/api";
import { isAnalyticsV1Enabled } from "../../lib/feature-flags";

type OpsInsights = {
  windowDays: number;
  cashAtRisk7d: number;
  revenueCollected7d: number;
  workloadToday: {
    jobs: number;
    unassigned: number;
    overdue: number;
  };
  funnel7d: {
    bookings: number;
    jobs: number;
    invoiced: number;
    paid: number;
  };
};

type UtilizationRow = {
  userId?: string;
  name: string;
  jobsAssigned: number;
  minutesScheduled: number;
  minutesFromBookings?: number;
  minutesFromJobs?: number;
  jobsWithoutEstimate?: number;
  bookings: number;
};

type CashflowBucket = {
  count: number;
  amountCents: number;
};

type CashflowForecast = {
  windowDays: number;
  dueDatesSupported: boolean;
  overdue: CashflowBucket | null;
  dueThisWindow: CashflowBucket | null;
  paidToday: CashflowBucket | null;
  paymentInference?: string;
};

type FunnelAnalytics = {
  windowDays: number;
  counts: {
    bookings: number;
    jobs: number;
    invoiced: number;
    paid: number;
  };
  mediansHours: {
    bookingToJob: number | null;
    jobToInvoiced: number | null;
    invoicedToPaid: number | null;
  };
  dropoffs: {
    bookingsNotConverted: {
      cancelled: number;
      pending: number;
      noShow: number;
      other: number;
    };
    invoicesUnpaid: {
      total: number;
      overdue: number;
      notOverdue: number;
    };
  };
};

function money(cents: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format((cents || 0) / 100);
}

function hours(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${value}h`;
}

export default function InsightsPage() {
  const enabled = isAnalyticsV1Enabled();
  const [data, setData] = useState<OpsInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [utilization, setUtilization] = useState<UtilizationRow[]>([]);
  const [utilLoading, setUtilLoading] = useState(false);
  const [utilError, setUtilError] = useState("");
  const [utilRequestId, setUtilRequestId] = useState<string | undefined>(undefined);
  const [cashflow, setCashflow] = useState<CashflowForecast | null>(null);
  const [cashflowLoading, setCashflowLoading] = useState(false);
  const [cashflowError, setCashflowError] = useState("");
  const [cashflowRequestId, setCashflowRequestId] = useState<string | undefined>(undefined);
  const [funnel, setFunnel] = useState<FunnelAnalytics | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [funnelError, setFunnelError] = useState("");
  const [funnelRequestId, setFunnelRequestId] = useState<string | undefined>(undefined);

  async function load() {
    if (!enabled) return;
    setLoading(true);
    setError("");
    setRequestId(undefined);
    try {
      const res = await apiFetch("/analytics/ops-insights?windowDays=7");
      setData(res || null);
    } catch (err: any) {
      setError(err?.message || "Failed to load insights");
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setLoading(false);
    }
  }

  async function loadUtilization() {
    if (!enabled) return;
    setUtilLoading(true);
    setUtilError("");
    setUtilRequestId(undefined);
    try {
      const res = await apiFetch("/analytics/utilization?windowDays=7");
      setUtilization(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setUtilError(err?.message || "Failed to load utilization");
      setUtilRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setUtilLoading(false);
    }
  }

  async function loadCashflow() {
    if (!enabled) return;
    setCashflowLoading(true);
    setCashflowError("");
    setCashflowRequestId(undefined);
    try {
      const res = await apiFetch("/analytics/cashflow?windowDays=7");
      setCashflow(res || null);
    } catch (err: any) {
      setCashflowError(err?.message || "Failed to load cashflow");
      setCashflowRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setCashflowLoading(false);
    }
  }

  async function loadFunnel() {
    if (!enabled) return;
    setFunnelLoading(true);
    setFunnelError("");
    setFunnelRequestId(undefined);
    try {
      const res = await apiFetch("/analytics/funnel?windowDays=7");
      setFunnel(res || null);
    } catch (err: any) {
      setFunnelError(err?.message || "Failed to load funnel analytics");
      setFunnelRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setFunnelLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadUtilization();
    loadCashflow();
    loadFunnel();
  }, [enabled]);

  if (!enabled) {
    return (
      <DashboardShell>
        <EmptyState
          title="Insights are not enabled"
          description="Enable Analytics V1 to view operational insights."
          primaryAction={{ label: "Back to dashboard", href: "/dashboard" }}
        />
      </DashboardShell>
    );
  }

  if (loading && !data) {
    return (
      <DashboardShell>
        <LoadingState title="Loading insights" description="Fetching operational metrics." />
      </DashboardShell>
    );
  }

  if (error && !data) {
    return (
      <DashboardShell>
        <ErrorState
          title="Could not load insights"
          description={error}
          requestId={requestId}
          primaryAction={{ label: "Try again", onClick: load }}
          secondaryAction={{ label: "Back to dashboard", href: "/dashboard" }}
        />
      </DashboardShell>
    );
  }

  const insights = data || {
    windowDays: 7,
    cashAtRisk7d: 0,
    revenueCollected7d: 0,
    workloadToday: { jobs: 0, unassigned: 0, overdue: 0 },
    funnel7d: { bookings: 0, jobs: 0, invoiced: 0, paid: 0 },
  };

  return (
    <DashboardShell>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>Ops Insights</h1>
        <p className="muted">Snapshot of the last {insights.windowDays} days and today.</p>
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Cash at Risk</h3>
          <p className="muted">Outstanding completed/invoiced work.</p>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{money(insights.cashAtRisk7d)}</div>
          <Link className="button secondary" href="/dashboard/jobs" style={{ marginTop: 12 }}>View unpaid jobs</Link>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Revenue Collected</h3>
          <p className="muted">Payments received in last 7 days.</p>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{money(insights.revenueCollected7d)}</div>
          <Link className="button secondary" href="/dashboard/billing" style={{ marginTop: 12 }}>View billing</Link>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Workload Today</h3>
          <p className="muted">Jobs created today, unassigned, overdue.</p>
          <div style={{ display: "grid", gap: 6 }}>
            <span>Jobs today: <strong>{insights.workloadToday.jobs}</strong></span>
            <span>Unassigned: <strong>{insights.workloadToday.unassigned}</strong></span>
            <span>Overdue: <strong>{insights.workloadToday.overdue}</strong></span>
          </div>
          <Link className="button secondary" href="/dashboard/command-centre" style={{ marginTop: 12 }}>Open Command Centre</Link>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>7-Day Funnel (headline)</h3>
          <p className="muted">Bookings &rarr; Jobs &rarr; Invoiced &rarr; Paid.</p>
          <div style={{ display: "grid", gap: 6 }}>
            <span>Bookings: <strong>{insights.funnel7d.bookings}</strong></span>
            <span>Jobs: <strong>{insights.funnel7d.jobs}</strong></span>
            <span>Invoiced: <strong>{insights.funnel7d.invoiced}</strong></span>
            <span>Paid: <strong>{insights.funnel7d.paid}</strong></span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <Link className="button secondary" href="/dashboard/bookings">Bookings</Link>
            <Link className="button secondary" href="/dashboard/jobs">Jobs</Link>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Cashflow Forecast (next 7 days)</h2>
        <p className="muted">Overdue balances, what is due soon, and today&apos;s captured payments.</p>
        {cashflowLoading ? <LoadingState title="Loading cashflow" description="Aggregating billing data." /> : null}
        {!cashflowLoading && cashflowError ? (
          <ErrorState
            title="Could not load cashflow"
            description={cashflowError}
            requestId={cashflowRequestId}
            primaryAction={{ label: "Try again", onClick: loadCashflow }}
          />
        ) : null}
        {!cashflowLoading && !cashflowError && cashflow ? (
          <>
            {!cashflow.dueDatesSupported ? (
              <p className="muted" style={{ marginTop: 0 }}>Due-date fields are not available in this tenant yet, so overdue and due-soon buckets are hidden.</p>
            ) : null}
            {cashflow.paymentInference ? (
              <p className="muted" style={{ marginTop: 0 }}>{cashflow.paymentInference}</p>
            ) : null}
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <div className="card" style={{ margin: 0 }}>
                <h3 style={{ marginTop: 0 }}>Overdue</h3>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{money(cashflow.overdue?.amountCents || 0)}</div>
                <p className="muted" style={{ marginBottom: 0 }}>{cashflow.overdue?.count || 0} jobs</p>
                <Link className="button secondary" href="/dashboard/jobs" style={{ marginTop: 12 }}>View overdue jobs</Link>
              </div>
              <div className="card" style={{ margin: 0 }}>
                <h3 style={{ marginTop: 0 }}>Due This Window</h3>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{money(cashflow.dueThisWindow?.amountCents || 0)}</div>
                <p className="muted" style={{ marginBottom: 0 }}>{cashflow.dueThisWindow?.count || 0} jobs</p>
                <Link className="button secondary" href="/dashboard/jobs" style={{ marginTop: 12 }}>View upcoming due</Link>
              </div>
              <div className="card" style={{ margin: 0 }}>
                <h3 style={{ marginTop: 0 }}>Paid Today</h3>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{money(cashflow.paidToday?.amountCents || 0)}</div>
                <p className="muted" style={{ marginBottom: 0 }}>{cashflow.paidToday?.count || 0} jobs</p>
                <Link className="button secondary" href="/dashboard/billing" style={{ marginTop: 12 }}>View billing</Link>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Funnel V1 (last 7 days)</h2>
        <p className="muted">Stage counts, median timings, and top dropoff reasons.</p>
        {funnelLoading ? <LoadingState title="Loading funnel" description="Aggregating conversion stages." /> : null}
        {!funnelLoading && funnelError ? (
          <ErrorState
            title="Could not load funnel analytics"
            description={funnelError}
            requestId={funnelRequestId}
            primaryAction={{ label: "Try again", onClick: loadFunnel }}
          />
        ) : null}
        {!funnelLoading && !funnelError && funnel ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span>Bookings: <strong>{funnel.counts.bookings}</strong></span>
              <span>Jobs: <strong>{funnel.counts.jobs}</strong></span>
              <span>Invoiced: <strong>{funnel.counts.invoiced}</strong></span>
              <span>Paid: <strong>{funnel.counts.paid}</strong></span>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <span>Median booking &rarr; job: <strong>{hours(funnel.mediansHours.bookingToJob)}</strong></span>
              <span>Median job &rarr; invoiced: <strong>{hours(funnel.mediansHours.jobToInvoiced)}</strong></span>
              <span>Median invoiced &rarr; paid: <strong>{hours(funnel.mediansHours.invoicedToPaid)}</strong></span>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <span>Bookings not converted: cancelled <strong>{funnel.dropoffs.bookingsNotConverted.cancelled}</strong>, pending/planned <strong>{funnel.dropoffs.bookingsNotConverted.pending}</strong>, other <strong>{funnel.dropoffs.bookingsNotConverted.other}</strong></span>
              <span>Invoices unpaid: total <strong>{funnel.dropoffs.invoicesUnpaid.total}</strong>, overdue <strong>{funnel.dropoffs.invoicesUnpaid.overdue}</strong>, not overdue <strong>{funnel.dropoffs.invoicesUnpaid.notOverdue}</strong></span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link className="button secondary" href="/dashboard/bookings">Review bookings</Link>
              <Link className="button secondary" href="/dashboard/jobs">Review jobs</Link>
              <Link className="button secondary" href="/dashboard/billing">Review billing</Link>
            </div>
          </div>
        ) : null}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Utilization (next 7 days)</h2>
        <p className="muted">Based on scheduled bookings for assigned technicians.</p>
        {utilLoading ? <LoadingState title="Loading utilization" description="Aggregating assignments." /> : null}
        {!utilLoading && utilError ? (
          <ErrorState
            title="Could not load utilization"
            description={utilError}
            requestId={utilRequestId}
            primaryAction={{ label: "Try again", onClick: loadUtilization }}
          />
        ) : null}
        {!utilLoading && !utilError && utilization.length === 0 ? (
          <EmptyState title="No scheduled work yet" description="Assigned bookings will appear here." />
        ) : null}
        {!utilLoading && !utilError && utilization.length > 0 ? (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {utilization.some((row) => (row.jobsWithoutEstimate || 0) > 0) ? (
              <p className="muted" style={{ margin: 0 }}>
                Some scheduled time is estimated where no duration is available.
              </p>
            ) : null}
            <div className="muted" style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              <div style={{ minWidth: 180 }}>Technician</div>
              <div style={{ minWidth: 120 }}>Jobs</div>
              <div style={{ minWidth: 140 }}>Scheduled</div>
              <div style={{ minWidth: 120 }}>Load</div>
            </div>
            {utilization.map((row) => {
              // Conservative thresholds: overload above 40h/week or >25 jobs; underutilized below 8h/week or <5 jobs.
              const hours = row.minutesScheduled > 0 ? row.minutesScheduled / 60 : 0;
              const overloaded = row.minutesScheduled > 2400 || row.jobsAssigned > 25;
              const underutilized = row.minutesScheduled > 0 ? row.minutesScheduled < 480 : row.jobsAssigned < 5;
              const loadLabel = overloaded ? "Overloaded" : underutilized ? "Underutilized" : "Balanced";
              return (
                <div key={row.userId || row.name} style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ minWidth: 180, fontWeight: 600 }}>{row.name}</div>
                  <div style={{ minWidth: 120 }}>{row.jobsAssigned}</div>
                  <div style={{ minWidth: 140 }}>
                    {row.minutesScheduled > 0 ? `${Math.round(hours)}h` : "-"}
                  </div>
                  <div style={{ minWidth: 120 }}>
                    <span className={`badge${overloaded ? " warn" : ""}`}>{loadLabel}</span>
                  </div>
                  <Link className="button secondary" href="/dashboard/command-centre">View</Link>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}
