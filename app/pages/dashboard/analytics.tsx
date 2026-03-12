import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorNotice } from "../../components/feedback/OperatorNotice";
import { useOperatorNotice } from "../../components/feedback/useOperatorNotice";
import {
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorGuidance,
  OperatorPageHeader,
} from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import { isAnalyticsV1Enabled } from "../../lib/feature-flags";
import { emptyPermissionSnapshot, hasWorkspacePermission, normalizePermissionSnapshot } from "../../lib/workspace-permissions";

type ExecutiveResponse = {
  summaryCards: Array<{ key: string; label: string; value: number | null; suffix?: string; detail: string }>;
  pressureAreas: Array<{ key: string; label: string; value: number; detail: string; href?: string }>;
  trendDeltas: Array<{ key: string; label: string; basis: string; current: number; previous: number; delta: number; deltaPct: number | null }>;
  focusSignals: Array<{ label: string; value: number; context: string }>;
};

type OperationsResponse = {
  jobs: {
    createdSeries: Array<{ day: string; value: number }>;
    completedSeries: Array<{ day: string; value: number }>;
  };
  conversions: {
    bookingsToJobsRate: number | null;
    bookingsCreated: number;
    bookingsConverted: number;
    quoteSentToApprovedRate: number | null;
    quoteApprovedToConvertedRate: number | null;
  };
  servicePlans: {
    executionRate: number | null;
    overdueRuns: number;
  };
  approvals: {
    turnaroundMedianHours: number | null;
  };
  openRevenueTasksByType: Array<{ type: string; count: number }>;
  pressure: {
    unassignedDueWork: number;
    overdueRecurringRuns: number;
    dueRecurringPlanCount: number;
  };
  adoption: {
    activePortalAccounts: number;
    activePortalTokens: number;
    documentArtifacts: number;
  };
};

type RevenueResponse = {
  funnel: {
    sentToApprovedRate: number | null;
    approvedToConvertedRate: number | null;
    invoiceIssuedToPaidRate: number | null;
  };
  overdueInvoices: {
    count: number;
    amountCents: number;
    agingBuckets: Array<{ key: string; label: string; count: number; amountCents: number }>;
  };
  openTasksByType: Array<{ type: string; count: number }>;
};

type CustomersResponse = {
  summary: {
    activeCustomers: number;
    customersWithActiveServicePlans: number;
    customersWithOverdueBalances: number;
  };
  topQuoteVolume: Array<{ customerId: string; customerName: string; quoteCount: number }>;
  approvalResponsiveness: Array<{ customerId: string; customerName: string; respondedApprovals: number; medianResponseHours: number | null }>;
};

type CapacityResponse = {
  summary: {
    technicians: number;
    overloadedDays: number;
    unassignedDueWork: number;
    dueRecurringPlanCount: number;
  };
  technicians: Array<{
    technicianId: string;
    technicianName: string;
    role: string;
    availableMinutes: number;
    scheduledMinutes: number;
    utilizationPct: number | null;
    overloadedDays: number;
  }>;
};

type BenchmarksResponse = {
  widgetLayout: {
    widgetOrder: string[];
    hiddenWidgets: string[];
    defaultWindowDays: number;
  };
  metrics: Array<{ key: string; label: string; basis: string; current: number; previous: number; delta: number; deltaPct: number | null }>;
  topPressureChanges: Array<{ key: string; label: string; basis: string; current: number; previous: number; delta: number; deltaPct: number | null }>;
};

const DEFAULT_WIDGET_ORDER = ["executive-summary", "pressure-panel", "revenue-panel", "capacity-panel", "benchmark-delta"];

function formatMetricValue(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined) return "-";
  return `${value}${suffix}`;
}

function formatHours(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${value}h`;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format((cents || 0) / 100);
}

function moveItem(items: string[], key: string, direction: "up" | "down") {
  const index = items.indexOf(key);
  if (index === -1) return items;
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

export default function AnalyticsPage() {
  const enabled = isAnalyticsV1Enabled();
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [executive, setExecutive] = useState<ExecutiveResponse | null>(null);
  const [operations, setOperations] = useState<OperationsResponse | null>(null);
  const [revenue, setRevenue] = useState<RevenueResponse | null>(null);
  const [customers, setCustomers] = useState<CustomersResponse | null>(null);
  const [capacity, setCapacity] = useState<CapacityResponse | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarksResponse | null>(null);
  const [windowDays, setWindowDays] = useState(30);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(DEFAULT_WIDGET_ORDER);
  const [hiddenWidgets, setHiddenWidgets] = useState<string[]>([]);
  const [activeLocationId, setActiveLocationId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [savingLayout, setSavingLayout] = useState(false);
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();

  const canView = hasWorkspacePermission(permissions, "dashboard.view_intelligence");
  const canManageRevenue = hasWorkspacePermission(permissions, "billing.manage");
  const canManageLayout = hasWorkspacePermission(permissions, "settings.manage");

  async function load(activeWindowDays?: number) {
    const selectedWindowDays = activeWindowDays || windowDays;
    setLoading(true);
    try {
      const me = await apiFetch("/me");
      const locationCtx = await apiFetch("/me/location").catch(() => ({ activeLocationId: 'all' }));
      const normalizedPermissions = normalizePermissionSnapshot(me?.permissions);
      setPermissions(normalizedPermissions);
      setPermissionsReady(true);
      setActiveLocationId(locationCtx?.activeLocationId || 'all');
      if (!normalizedPermissions["dashboard.view_intelligence"]) {
        setLoading(false);
        return;
      }

      const locationSuffix = `&locationId=${encodeURIComponent(locationCtx?.activeLocationId || 'all')}`;

      const requests = [
        apiFetch(`/analytics/executive?windowDays=${selectedWindowDays}${locationSuffix}`),
        apiFetch(`/analytics/operations?windowDays=${selectedWindowDays}${locationSuffix}`),
        apiFetch(`/analytics/customers?windowDays=${selectedWindowDays}${locationSuffix}`),
        apiFetch(`/analytics/capacity?windowDays=7${locationSuffix}`),
        apiFetch(`/analytics/benchmarks?windowDays=${selectedWindowDays}${locationSuffix}`),
      ];
      if (normalizedPermissions["billing.manage"]) {
        requests.push(apiFetch(`/analytics/revenue?windowDays=${selectedWindowDays}${locationSuffix}`));
      }

      const results = await Promise.all(requests);
      setExecutive((results[0] || null) as ExecutiveResponse | null);
      setOperations((results[1] || null) as OperationsResponse | null);
      setCustomers((results[2] || null) as CustomersResponse | null);
      setCapacity((results[3] || null) as CapacityResponse | null);
      const benchmarksResponse = (results[4] || null) as BenchmarksResponse | null;
      setBenchmarks(benchmarksResponse);
      if (benchmarksResponse?.widgetLayout) {
        setWidgetOrder(benchmarksResponse.widgetLayout.widgetOrder || DEFAULT_WIDGET_ORDER);
        setHiddenWidgets(benchmarksResponse.widgetLayout.hiddenWidgets || []);
        if (!activeWindowDays) {
          setWindowDays(benchmarksResponse.widgetLayout.defaultWindowDays || selectedWindowDays);
        }
      }
      setRevenue(normalizedPermissions["billing.manage"] ? ((results[5] || null) as RevenueResponse | null) : null);
    } catch (error: any) {
      showError(error?.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void load();
  }, [enabled]);

  async function saveLayout(nextOrder = widgetOrder, nextHidden = hiddenWidgets, nextWindowDays = windowDays) {
    if (!canManageLayout) return;
    setSavingLayout(true);
    try {
      const settings = await apiFetch("/tenant/settings");
      const currentBusinessConfig = settings?.businessConfigJson && typeof settings.businessConfigJson === "object"
        ? settings.businessConfigJson
        : {};
      const currentAnalytics = currentBusinessConfig.analytics && typeof currentBusinessConfig.analytics === "object"
        ? currentBusinessConfig.analytics
        : {};
      await apiFetch("/tenant/settings", {
        method: "PATCH",
        body: JSON.stringify({
          businessConfigJson: {
            ...currentBusinessConfig,
            analytics: {
              ...currentAnalytics,
              widgetOrder: nextOrder,
              hiddenWidgets: nextHidden,
              defaultWindowDays: nextWindowDays,
            },
          },
        }),
      });
      showSuccess("Analytics layout saved");
    } catch (error: any) {
      showError(error?.message || "Failed to save analytics layout");
    } finally {
      setSavingLayout(false);
    }
  }

  const orderedWidgets = useMemo(() => {
    return Array.from(new Set([...widgetOrder, ...DEFAULT_WIDGET_ORDER]));
  }, [widgetOrder]);

  const visibleWidgets = orderedWidgets.filter((widgetKey) => !hiddenWidgets.includes(widgetKey));
  const stats = useMemo(() => {
    if (!executive) return [];
    return executive.summaryCards.map((card) => ({
      label: card.label,
      value: formatMetricValue(card.value, card.suffix || ""),
      hint: card.detail,
    }));
  }, [executive]);

  if (!enabled) {
    return (
      <DashboardShell>
        <div className="operator-stack">
          <OperatorPageHeader
            eyebrow="Decision support"
            title="Analytics"
            subtitle="Enable Analytics V1 to open executive and operational benchmarking."
            stats={[]}
          />
          <OperatorEmptyStateCard
            title="Analytics are not enabled"
            description="The analytics layer is feature-flagged and currently unavailable in this environment."
          />
        </div>
      </DashboardShell>
    );
  }

  if (permissionsReady && !canView) {
    return (
      <DashboardShell>
        <div className="operator-stack">
          <OperatorPageHeader
            eyebrow="Decision support"
            title="Analytics"
            subtitle="Executive analytics is limited to roles with intelligence access."
            stats={[]}
          />
          <OperatorEmptyStateCard
            title="Analytics access restricted"
            description="Your role can’t access executive benchmarking, operational deltas, or capacity analytics."
          />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Decision support"
          title="Analytics"
          subtitle="Executive-grade operating metrics built from live tenant jobs, quotes, invoices, approvals, service plans, and technician capacity."
          actions={[
            { label: "Intelligence", href: "/dashboard/intelligence", variant: "secondary" },
            { label: "Revenue", href: "/dashboard/revenue", variant: "secondary" },
            { label: "Scheduling", href: "/dashboard/scheduling" },
          ]}
          shortcuts={[
            "Benchmarks compare this tenant against its own previous periods",
            "No forecasting or external benchmark claims are used",
          ]}
          stats={stats}
        />

        {activeLocationId !== "all" ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <p className="muted" style={{ margin: 0 }}>Analytics scope is filtered to the active business location selection.</p>
          </div>
        ) : null}

        <OperatorGuidance
          title="How to read this surface"
          items={[
            "Executive summary cards show current operating posture without hiding the underlying basis.",
            "Pressure panels prioritize cash, dispatch, and recurring-work debt before it turns into missed revenue.",
            "Benchmarks compare live tenant performance against the previous 7 and 30 day periods only.",
          ]}
        />

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Analytics controls</h2>
              <p className="operator-section__subtitle">Change the default time range and widget layout only if you manage workspace settings.</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label className="muted" htmlFor="analytics-window-range">Window</label>
              <select
                id="analytics-window-range"
                className="input"
                value={windowDays}
                onChange={(event) => {
                  const nextWindowDays = Number(event.target.value);
                  setWindowDays(nextWindowDays);
                  void load(nextWindowDays);
                }}
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
              {canManageLayout ? (
                <button className="button secondary" type="button" disabled={savingLayout} onClick={() => void saveLayout()}>
                  {savingLayout ? "Saving..." : "Save layout"}
                </button>
              ) : null}
            </div>
          </div>
          {canManageLayout ? (
            <div style={{ display: "grid", gap: 10 }}>
              {orderedWidgets.map((widgetKey) => {
                const hidden = hiddenWidgets.includes(widgetKey);
                return (
                  <div key={widgetKey} className="integration-card" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div>
                      <strong>{widgetKey}</strong>
                      <p className="muted" style={{ margin: "4px 0 0 0" }}>{hidden ? "Hidden from default layout" : "Visible in default layout"}</p>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="button secondary" type="button" onClick={() => setWidgetOrder((current) => moveItem(current, widgetKey, "up"))}>
                        Move up
                      </button>
                      <button className="button secondary" type="button" onClick={() => setWidgetOrder((current) => moveItem(current, widgetKey, "down"))}>
                        Move down
                      </button>
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => {
                          setHiddenWidgets((current) => current.includes(widgetKey)
                            ? current.filter((item) => item !== widgetKey)
                            : [...current, widgetKey]);
                        }}
                      >
                        {hidden ? "Show widget" : "Hide widget"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Your role can view analytics but cannot change the saved layout.</p>
          )}
        </section>

        {loading ? <div className="operator-note" role="status">Loading analytics...</div> : null}

        {!loading && visibleWidgets.includes("executive-summary") && executive ? (
          <section className="card operator-section" data-testid="analytics-executive-summary">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Executive summary</h2>
                <p className="operator-section__subtitle">Current operating posture plus the next focus signals most likely to move the business.</p>
              </div>
            </div>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {executive.summaryCards.map((card) => (
                <div key={card.key} className="integration-card">
                  <div className="operator-page__statLabel">{card.label}</div>
                  <div className="operator-page__statValue">{formatMetricValue(card.value, card.suffix || "")}</div>
                  <div className="operator-page__statHint">{card.detail}</div>
                </div>
              ))}
            </div>
            <OperatorDataTable columns="minmax(220px, 1fr) minmax(100px, 0.5fr) minmax(260px, 1.2fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Recommended focus</div>
                <div className="operator-table__cell">Count</div>
                <div className="operator-table__cell">Reason</div>
              </OperatorDataTableHeader>
              {executive.focusSignals.map((signal) => (
                <OperatorDataTableRow key={signal.label}>
                  <div className="operator-table__cell"><strong>{signal.label}</strong></div>
                  <div className="operator-table__cell">{signal.value}</div>
                  <div className="operator-table__cell">{signal.context}</div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          </section>
        ) : null}

        {!loading && visibleWidgets.includes("pressure-panel") && executive && operations && customers ? (
          <section className="card operator-section" data-testid="analytics-pressure-panel">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Pressure areas</h2>
                <p className="operator-section__subtitle">The highest-load queues and customer friction signals visible in live tenant data.</p>
              </div>
            </div>
            <OperatorDataTable columns="minmax(220px, 1fr) minmax(100px, 0.5fr) minmax(260px, 1.1fr) minmax(140px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Pressure</div>
                <div className="operator-table__cell">Count</div>
                <div className="operator-table__cell">Why it matters</div>
                <div className="operator-table__cell">Action</div>
              </OperatorDataTableHeader>
              {executive.pressureAreas.map((item) => (
                <OperatorDataTableRow key={item.key}>
                  <div className="operator-table__cell"><strong>{item.label}</strong></div>
                  <div className="operator-table__cell">{item.value}</div>
                  <div className="operator-table__cell">{item.detail}</div>
                  <div className="operator-table__cell">{item.href ? <a href={item.href}>Open</a> : <span className="muted">Review</span>}</div>
                </OperatorDataTableRow>
              ))}
              <OperatorDataTableRow key="customer-overdue-balances">
                <div className="operator-table__cell"><strong>Customers with overdue balances</strong></div>
                <div className="operator-table__cell">{customers.summary.customersWithOverdueBalances}</div>
                <div className="operator-table__cell">This exposes customer-level collections risk instead of only invoice counts.</div>
                <div className="operator-table__cell"><a href="/dashboard/customers">Open CRM</a></div>
              </OperatorDataTableRow>
              <OperatorDataTableRow key="portal-adoption">
                <div className="operator-table__cell"><strong>Portal adoption</strong></div>
                <div className="operator-table__cell">{operations.adoption.activePortalAccounts}</div>
                <div className="operator-table__cell">Active customer accounts show whether self-service is actually being used.</div>
                <div className="operator-table__cell"><a href="/dashboard/portal">Open portal ops</a></div>
              </OperatorDataTableRow>
            </OperatorDataTable>
          </section>
        ) : null}

        {!loading && visibleWidgets.includes("revenue-panel") ? (
          <section className="card operator-section" data-testid="analytics-revenue-panel">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Revenue and collections</h2>
                <p className="operator-section__subtitle">Quote conversion, invoice collection performance, and open revenue follow-through work.</p>
              </div>
            </div>
            {canManageRevenue && revenue ? (
              <>
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  <div className="integration-card">
                    <div className="operator-page__statLabel">Quote sent to approved</div>
                    <div className="operator-page__statValue">{formatMetricValue(revenue.funnel.sentToApprovedRate, "%")}</div>
                    <div className="operator-page__statHint">How many sent quotes reach approval or conversion.</div>
                  </div>
                  <div className="integration-card">
                    <div className="operator-page__statLabel">Quote approved to converted</div>
                    <div className="operator-page__statValue">{formatMetricValue(revenue.funnel.approvedToConvertedRate, "%")}</div>
                    <div className="operator-page__statHint">Approved quotes that actually become jobs.</div>
                  </div>
                  <div className="integration-card">
                    <div className="operator-page__statLabel">Invoice issued to paid</div>
                    <div className="operator-page__statValue">{formatMetricValue(revenue.funnel.invoiceIssuedToPaidRate, "%")}</div>
                    <div className="operator-page__statHint">Invoices issued in-window that already collected cash.</div>
                  </div>
                  <div className="integration-card">
                    <div className="operator-page__statLabel">Overdue invoice value</div>
                    <div className="operator-page__statValue">{formatMoney(revenue.overdueInvoices.amountCents)}</div>
                    <div className="operator-page__statHint">{revenue.overdueInvoices.count} invoices are already overdue.</div>
                  </div>
                </div>
                <OperatorDataTable columns="minmax(220px, 1fr) minmax(120px, 0.6fr) minmax(140px, 0.7fr)">
                  <OperatorDataTableHeader>
                    <div className="operator-table__cell">Aging bucket</div>
                    <div className="operator-table__cell">Count</div>
                    <div className="operator-table__cell">Amount</div>
                  </OperatorDataTableHeader>
                  {revenue.overdueInvoices.agingBuckets.map((bucket) => (
                    <OperatorDataTableRow key={bucket.key}>
                      <div className="operator-table__cell"><strong>{bucket.label}</strong></div>
                      <div className="operator-table__cell">{bucket.count}</div>
                      <div className="operator-table__cell">{formatMoney(bucket.amountCents)}</div>
                    </OperatorDataTableRow>
                  ))}
                </OperatorDataTable>
              </>
            ) : (
              <OperatorEmptyStateCard
                title="Revenue analytics restricted"
                description="This panel is limited to roles trusted with billing and collections operations."
              />
            )}
          </section>
        ) : null}

        {!loading && visibleWidgets.includes("capacity-panel") && capacity && operations ? (
          <section className="card operator-section" data-testid="analytics-capacity-panel">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Capacity and recurring execution</h2>
                <p className="operator-section__subtitle">Technician utilization plus recurring-work pressure already landing on the schedule.</p>
              </div>
            </div>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <div className="integration-card">
                <div className="operator-page__statLabel">Technicians in view</div>
                <div className="operator-page__statValue">{capacity.summary.technicians}</div>
                <div className="operator-page__statHint">Technicians with planned capacity or load in the window.</div>
              </div>
              <div className="integration-card">
                <div className="operator-page__statLabel">Overloaded days</div>
                <div className="operator-page__statValue">{capacity.summary.overloadedDays}</div>
                <div className="operator-page__statHint">Daily technician schedules already beyond available minutes.</div>
              </div>
              <div className="integration-card">
                <div className="operator-page__statLabel">Unassigned due work</div>
                <div className="operator-page__statValue">{capacity.summary.unassignedDueWork}</div>
                <div className="operator-page__statHint">Upcoming work still has no technician owner.</div>
              </div>
              <div className="integration-card">
                <div className="operator-page__statLabel">Recurring execution rate</div>
                <div className="operator-page__statValue">{formatMetricValue(operations.servicePlans.executionRate, "%")}</div>
                <div className="operator-page__statHint">{operations.servicePlans.overdueRuns} recurring runs are overdue.</div>
              </div>
            </div>
            <OperatorDataTable columns="minmax(220px, 1fr) minmax(120px, 0.6fr) minmax(120px, 0.6fr) minmax(120px, 0.6fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Technician</div>
                <div className="operator-table__cell">Utilization</div>
                <div className="operator-table__cell">Scheduled</div>
                <div className="operator-table__cell">Overloaded days</div>
              </OperatorDataTableHeader>
              {capacity.technicians.map((row) => (
                <OperatorDataTableRow key={row.technicianId}>
                  <div className="operator-table__cell"><strong>{row.technicianName}</strong></div>
                  <div className="operator-table__cell">{formatMetricValue(row.utilizationPct, "%")}</div>
                  <div className="operator-table__cell">{Math.round(row.scheduledMinutes / 60)}h</div>
                  <div className="operator-table__cell">{row.overloadedDays}</div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          </section>
        ) : null}

        {!loading && visibleWidgets.includes("benchmark-delta") && benchmarks && operations && customers ? (
          <section className="card operator-section" data-testid="analytics-benchmark-delta">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Benchmarks and trend deltas</h2>
                <p className="operator-section__subtitle">Comparisons against the tenant’s previous periods, not external peer sets.</p>
              </div>
            </div>
            <OperatorDataTable columns="minmax(220px, 1fr) minmax(140px, 0.7fr) minmax(140px, 0.7fr) minmax(160px, 0.8fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Metric</div>
                <div className="operator-table__cell">Current</div>
                <div className="operator-table__cell">Previous</div>
                <div className="operator-table__cell">Delta</div>
              </OperatorDataTableHeader>
              {benchmarks.metrics.map((metric) => (
                <OperatorDataTableRow key={metric.key}>
                  <div className="operator-table__cell">
                    <strong>{metric.label}</strong>
                    <div className="operator-cellSubtle">{metric.basis}</div>
                  </div>
                  <div className="operator-table__cell">{metric.current}</div>
                  <div className="operator-table__cell">{metric.previous}</div>
                  <div className="operator-table__cell">
                    {metric.delta >= 0 ? "+" : ""}{metric.delta}
                    {metric.deltaPct !== null ? ` (${metric.deltaPct >= 0 ? "+" : ""}${metric.deltaPct}%)` : ""}
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <div className="integration-card">
                <div className="operator-page__statLabel">Top pressure change</div>
                <div className="operator-page__statValue">{benchmarks.topPressureChanges[0]?.label || "-"}</div>
                <div className="operator-page__statHint">{benchmarks.topPressureChanges[0]?.basis || "No delta available"}</div>
              </div>
              <div className="integration-card">
                <div className="operator-page__statLabel">Approval turnaround</div>
                <div className="operator-page__statValue">{formatHours(operations.approvals.turnaroundMedianHours)}</div>
                <div className="operator-page__statHint">Median customer response time this period.</div>
              </div>
              <div className="integration-card">
                <div className="operator-page__statLabel">Customers on plans</div>
                <div className="operator-page__statValue">{customers.summary.customersWithActiveServicePlans}</div>
                <div className="operator-page__statHint">Customers protected by active recurring agreements.</div>
              </div>
            </div>
          </section>
        ) : null}

        {!loading && customers ? (
          <section className="card operator-section">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Customer commercial signals</h2>
                <p className="operator-section__subtitle">Which customers drive quote volume and which approvals are moving fastest.</p>
              </div>
            </div>
            <OperatorDataTable columns="minmax(220px, 1fr) minmax(120px, 0.6fr) minmax(180px, 0.8fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Customer</div>
                <div className="operator-table__cell">Quote volume</div>
                <div className="operator-table__cell">Approval response</div>
              </OperatorDataTableHeader>
              {customers.topQuoteVolume.map((customerRow) => {
                const responsiveness = customers.approvalResponsiveness.find((item) => item.customerId === customerRow.customerId);
                return (
                  <OperatorDataTableRow key={customerRow.customerId}>
                    <div className="operator-table__cell"><strong>{customerRow.customerName}</strong></div>
                    <div className="operator-table__cell">{customerRow.quoteCount}</div>
                    <div className="operator-table__cell">{responsiveness ? formatHours(responsiveness.medianResponseHours) : "-"}</div>
                  </OperatorDataTableRow>
                );
              })}
            </OperatorDataTable>
          </section>
        ) : null}
      </div>
    </DashboardShell>
  );
}
