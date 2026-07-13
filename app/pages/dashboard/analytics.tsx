import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorNotice } from "../../components/feedback/OperatorNotice";
import { useOperatorNotice } from "../../components/feedback/useOperatorNotice";
import { LoadingState } from "../../components/states/LoadingState";
import { OperatorChartCard } from "../../components/ui/operator-insights";
import {
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorFilterField,
  OperatorPageHeader,
  OperatorSavedViews,
} from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import { ANALYTICS_WIDGET_KEYS, getAnalyticsWorkspaceLayout, type AnalyticsWidgetKey } from "../../lib/business-config";
import { isAnalyticsV1Enabled } from "../../lib/feature-flags";
import { readActiveLocationId, subscribeActiveLocationId } from "../../lib/location-context";
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

type BillingAnalyticsResponse = {
  jobCompletionAllowance?: {
    monthlyIncludedAllowance?: number;
    monthlyIncludedUsed?: number;
    monthlyIncludedRemaining?: number;
    purchasedCreditsTotal?: number;
    purchasedCreditsUsed?: number;
    purchasedCreditsRemaining?: number;
  } | null;
};

type TrafficSummaryResponse = {
  visitsToday: number;
  visitsLast7Days: number;
  uniqueAnonymousSessions: number;
  surfaces: {
    marketing?: number;
    app?: number;
    login?: number;
    publicBooking?: number;
    publicStatus?: number;
    customerWorkspace?: number;
  };
};

type Phase1KWidgetsResponse = {
  selectedWidgets: string[];
  widgets: Array<{ key: string; label: string; value: string | number; source: string }>;
};

const DEFAULT_WIDGET_ORDER = [...ANALYTICS_WIDGET_KEYS];
const WIDGET_META: Record<AnalyticsWidgetKey, { title: string; description: string }> = {
  "executive-summary": {
    title: "Executive summary",
    description: "Headline operating posture and recommended focus.",
  },
  "pressure-panel": {
    title: "Pressure areas",
    description: "Queues and customer friction that need attention.",
  },
  "revenue-panel": {
    title: "Revenue and collections",
    description: "Quote conversion, collections, and open revenue follow-up.",
  },
  "capacity-panel": {
    title: "Capacity and recurring execution",
    description: "Technician load and recurring work pressure.",
  },
  "benchmark-delta": {
    title: "Benchmarks and trend deltas",
    description: "Current period versus your own recent history.",
  },
  "customer-commercial-signals": {
    title: "Customer commercial signals",
    description: "Which customers drive work and respond fastest.",
  },
};

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatMetricValue(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined) return "Not enough data";
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

export function AnalyticsPage({ forceExecutiveSummary = false }: { forceExecutiveSummary?: boolean }) {
  const enabled = isAnalyticsV1Enabled();
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [executive, setExecutive] = useState<ExecutiveResponse | null>(null);
  const [operations, setOperations] = useState<OperationsResponse | null>(null);
  const [revenue, setRevenue] = useState<RevenueResponse | null>(null);
  const [customers, setCustomers] = useState<CustomersResponse | null>(null);
  const [capacity, setCapacity] = useState<CapacityResponse | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarksResponse | null>(null);
  const [billing, setBilling] = useState<BillingAnalyticsResponse | null>(null);
  const [traffic, setTraffic] = useState<TrafficSummaryResponse | null>(null);
  const [phaseWidgets, setPhaseWidgets] = useState<Phase1KWidgetsResponse | null>(null);
  const [windowDays, setWindowDays] = useState(30);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(DEFAULT_WIDGET_ORDER);
  const [hiddenWidgets, setHiddenWidgets] = useState<string[]>([]);
  const widgetOrderRef = useRef<string[]>(DEFAULT_WIDGET_ORDER);
  const hiddenWidgetsRef = useRef<string[]>([]);
  const windowDaysRef = useRef(30);
  const layoutEditVersionRef = useRef(0);
  const loadVersionRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const [activeLocationId, setActiveLocationId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [savingLayout, setSavingLayout] = useState(false);
  const [activeReportTab, setActiveReportTab] = useState("overview");
  const [forecastEvidence, setForecastEvidence] = useState<any | null>(null);
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();

  const canView = hasWorkspacePermission(permissions, "dashboard.view_intelligence");
  const canManageRevenue = hasWorkspacePermission(permissions, "billing.manage");
  const canManageLayout = hasWorkspacePermission(permissions, "settings.manage");
  const initialLayoutRef = useRef(getAnalyticsWorkspaceLayout(null));

  function updateWidgetOrder(next: string[] | ((current: string[]) => string[]), source: "user" | "server" = "user") {
    if (source === "user") {
      layoutEditVersionRef.current += 1;
    }
    const resolved = typeof next === "function" ? next(widgetOrderRef.current) : next;
    widgetOrderRef.current = resolved;
    setWidgetOrder(resolved);
  }

  function updateHiddenWidgets(next: string[] | ((current: string[]) => string[]), source: "user" | "server" = "user") {
    if (source === "user") {
      layoutEditVersionRef.current += 1;
    }
    const resolved = typeof next === "function" ? next(hiddenWidgetsRef.current) : next;
    hiddenWidgetsRef.current = resolved;
    setHiddenWidgets(resolved);
  }

  function updateWindowDays(next: number, source: "user" | "server" = "user") {
    if (source === "user") {
      layoutEditVersionRef.current += 1;
    }
    windowDaysRef.current = next;
    setWindowDays(next);
  }

  async function load(activeWindowDays?: number) {
    const loadVersion = loadVersionRef.current + 1;
    loadVersionRef.current = loadVersion;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const request = (path: string) => apiFetch(path, { signal: controller.signal });
    const isCurrentLoad = () => loadVersionRef.current === loadVersion && !controller.signal.aborted;
    const layoutEditVersionAtLoadStart = layoutEditVersionRef.current;
    const selectedWindowDays = activeWindowDays || windowDays;
    setLoading(true);
    try {
      const me = await request("/me");
      if (!isCurrentLoad()) return;
      const normalizedPermissions = normalizePermissionSnapshot(me?.permissions);
      setPermissions(normalizedPermissions);
      setPermissionsReady(true);
      if (!normalizedPermissions["dashboard.view_intelligence"]) {
        setLoading(false);
        return;
      }

      const scopedLocationId = activeLocationId || "all";
      const locationSuffix = `&locationId=${encodeURIComponent(scopedLocationId)}`;

      const settle = <T,>(promise: Promise<unknown>, setter: (value: T | null) => void) => {
        void promise.then(
          (value) => {
            if (isCurrentLoad()) setter((value || null) as T | null);
          },
          () => {
            if (isCurrentLoad()) setter(null);
          },
        );
      };
      settle<CustomersResponse>(
        request(`/analytics/customers?windowDays=${selectedWindowDays}${locationSuffix}`),
        setCustomers,
      );
      settle<CapacityResponse>(
        request(`/analytics/capacity?windowDays=7${locationSuffix}`),
        setCapacity,
      );
      settle<BillingAnalyticsResponse>(request("/billing/me"), setBilling);
      settle<TrafficSummaryResponse>(request("/analytics/traffic/summary"), setTraffic);
      settle<Phase1KWidgetsResponse>(request("/enterprise/phase-1k/reports/widgets"), setPhaseWidgets);
      if (normalizedPermissions["billing.manage"]) {
        settle<RevenueResponse>(
          request(`/analytics/revenue?windowDays=${selectedWindowDays}${locationSuffix}`),
          setRevenue,
        );
      } else {
        setRevenue(null);
      }

      const [executiveResponse, operationsResponse, benchmarksResponse] = await Promise.all([
        request(`/analytics/executive?windowDays=${selectedWindowDays}${locationSuffix}`),
        request(`/analytics/operations?windowDays=${selectedWindowDays}${locationSuffix}`),
        request(`/analytics/benchmarks?windowDays=${selectedWindowDays}${locationSuffix}`),
      ]);
      if (!isCurrentLoad()) return;
      setExecutive((executiveResponse || null) as ExecutiveResponse | null);
      setOperations((operationsResponse || null) as OperationsResponse | null);
      const normalizedBenchmarks = (benchmarksResponse || null) as BenchmarksResponse | null;
      const benchmarkLayout = {
        widgetOrder: Array.isArray(normalizedBenchmarks?.widgetLayout?.widgetOrder)
          ? normalizedBenchmarks?.widgetLayout?.widgetOrder
          : DEFAULT_WIDGET_ORDER,
        hiddenWidgets: Array.isArray(normalizedBenchmarks?.widgetLayout?.hiddenWidgets)
          ? normalizedBenchmarks?.widgetLayout?.hiddenWidgets
          : [],
        defaultWindowDays: Math.max(7, Math.min(90, Number(normalizedBenchmarks?.widgetLayout?.defaultWindowDays || 30))),
      };
      setBenchmarks(normalizedBenchmarks);
      if (normalizedBenchmarks?.widgetLayout && layoutEditVersionRef.current === layoutEditVersionAtLoadStart) {
        updateWidgetOrder(benchmarkLayout.widgetOrder || DEFAULT_WIDGET_ORDER, "server");
        updateHiddenWidgets(benchmarkLayout.hiddenWidgets || [], "server");
        if (!activeWindowDays) {
          updateWindowDays(benchmarkLayout.defaultWindowDays || selectedWindowDays, "server");
        }
        initialLayoutRef.current = {
          widgetOrder: [...(benchmarkLayout.widgetOrder || DEFAULT_WIDGET_ORDER)] as AnalyticsWidgetKey[],
          hiddenWidgets: [...(benchmarkLayout.hiddenWidgets || [])] as AnalyticsWidgetKey[],
          defaultWindowDays: benchmarkLayout.defaultWindowDays || selectedWindowDays,
        };
      }

      setLoading(false);
    } catch (error: any) {
      if (controller.signal.aborted) return;
      showError(error?.message || "Failed to load analytics");
    } finally {
      if (isCurrentLoad()) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    setActiveLocationId(readActiveLocationId());
    return subscribeActiveLocationId(setActiveLocationId);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void load();
    return () => {
      loadAbortRef.current?.abort();
    };
  }, [activeLocationId, enabled]);

  async function saveLayout(
    nextOrder = widgetOrderRef.current,
    nextHidden = hiddenWidgetsRef.current,
    nextWindowDays = windowDaysRef.current,
  ) {
    if (!canManageLayout) return;
    clearNotice();
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
      const scopedLocationId = activeLocationId || "all";
      const benchmarkPath = `/analytics/benchmarks?windowDays=${nextWindowDays}&locationId=${encodeURIComponent(scopedLocationId)}`;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const [refreshedSettings, refreshedBenchmarks] = await Promise.all([
          apiFetch("/tenant/settings"),
          apiFetch(benchmarkPath),
        ]);
        const refreshedLayout = getAnalyticsWorkspaceLayout(refreshedSettings as any);
        const refreshedBenchmarkLayout = {
          widgetOrder: Array.isArray(refreshedBenchmarks?.widgetLayout?.widgetOrder)
            ? refreshedBenchmarks.widgetLayout.widgetOrder
            : DEFAULT_WIDGET_ORDER,
          hiddenWidgets: Array.isArray(refreshedBenchmarks?.widgetLayout?.hiddenWidgets)
            ? refreshedBenchmarks.widgetLayout.hiddenWidgets
            : [],
          defaultWindowDays: Math.max(7, Math.min(90, Number(refreshedBenchmarks?.widgetLayout?.defaultWindowDays || 30))),
        };
        if (
          arraysEqual(refreshedLayout.widgetOrder, nextOrder) &&
          arraysEqual(refreshedLayout.hiddenWidgets, nextHidden) &&
          refreshedLayout.defaultWindowDays === nextWindowDays &&
          arraysEqual(refreshedBenchmarkLayout.widgetOrder, nextOrder) &&
          arraysEqual(refreshedBenchmarkLayout.hiddenWidgets, nextHidden) &&
          refreshedBenchmarkLayout.defaultWindowDays === nextWindowDays
        ) {
          updateWidgetOrder(refreshedLayout.widgetOrder.length > 0 ? refreshedLayout.widgetOrder : DEFAULT_WIDGET_ORDER, "server");
          updateHiddenWidgets(refreshedLayout.hiddenWidgets, "server");
          updateWindowDays(refreshedLayout.defaultWindowDays, "server");
          initialLayoutRef.current = {
            widgetOrder: [...(refreshedLayout.widgetOrder.length > 0 ? refreshedLayout.widgetOrder : DEFAULT_WIDGET_ORDER)] as AnalyticsWidgetKey[],
            hiddenWidgets: [...refreshedLayout.hiddenWidgets] as AnalyticsWidgetKey[],
            defaultWindowDays: refreshedLayout.defaultWindowDays,
          };
          setBenchmarks((refreshedBenchmarks || null) as BenchmarksResponse | null);
          showSuccess("Analytics layout saved");
          return;
        }
        await wait(250);
      }
      showError("Analytics layout is still saving. Please try again.");
    } catch (error: any) {
      showError(error?.message || "Failed to save analytics layout");
    } finally {
      setSavingLayout(false);
    }
  }

  const orderedWidgets = useMemo(() => {
    return Array.from(new Set([...widgetOrder, ...DEFAULT_WIDGET_ORDER])) as AnalyticsWidgetKey[];
  }, [widgetOrder]);

  const visibleWidgets = orderedWidgets.filter((widgetKey) => {
    if (forceExecutiveSummary && widgetKey === "executive-summary") {
      return true;
    }
    return !hiddenWidgets.includes(widgetKey);
  });
  const layoutDirty =
    !arraysEqual(widgetOrder, initialLayoutRef.current.widgetOrder) ||
    !arraysEqual(hiddenWidgets, initialLayoutRef.current.hiddenWidgets) ||
    windowDays !== initialLayoutRef.current.defaultWindowDays;
  const layoutAtDefaults =
    arraysEqual(widgetOrder, DEFAULT_WIDGET_ORDER) &&
    hiddenWidgets.length === 0 &&
    windowDays === 30;
  const ownerSnapshot = useMemo(() => {
    if (!operations || !customers || !executive) return [];
    return [
      {
        label: "Booking to job conversion",
        value: formatMetricValue(operations.conversions.bookingsToJobsRate, "%"),
        hint: `${operations.conversions.bookingsConverted} of ${operations.conversions.bookingsCreated} bookings converted in the current window.`,
        href: "/dashboard/bookings",
      },
      {
        label: "Completed job trend",
        value: String(operations.jobs.completedSeries.at(-1)?.value ?? 0),
        hint: "Latest daily completion value from authoritative analytics series.",
        href: "/dashboard/jobs",
      },
      {
        label: "Customers with overdue balances",
        value: String(customers.summary.customersWithOverdueBalances),
        hint: "Commercial follow-up pressure visible at customer level instead of just invoice count.",
        href: "/dashboard/finance",
      },
      {
        label: "Operational pressure",
        value: String(executive.pressureAreas[0]?.value ?? 0),
        hint: executive.pressureAreas[0]?.label || "No dominant pressure signal right now.",
        href: executive.pressureAreas[0]?.href || "/dashboard/analytics",
      },
    ];
  }, [customers, executive, operations]);
  const pulseSummary = useMemo(() => {
    if (!operations || !revenue || !capacity || !customers || !benchmarks) return [];
    const conversionDelta = benchmarks.metrics.find((item) => item.key === "bookings_to_jobs_rate");
    const paidDelta = benchmarks.metrics.find((item) => item.key === "invoice_issued_to_paid_rate");
    const overloadedDelta = benchmarks.topPressureChanges.find((item) => item.key === "overloaded_days");
    return [
      {
        label: "Revenue",
        text:
          revenue.funnel.invoiceIssuedToPaidRate !== null
            ? paidDelta && paidDelta.delta !== 0
              ? paidDelta.delta > 0
                ? `Payments are arriving faster. ${formatMetricValue(revenue.funnel.invoiceIssuedToPaidRate, "%")} of issued invoices are paid in this window.`
                : `Collections slowed a little. ${formatMetricValue(revenue.funnel.invoiceIssuedToPaidRate, "%")} of issued invoices are paid in this window.`
              : `Cash collection is tracking at ${formatMetricValue(revenue.funnel.invoiceIssuedToPaidRate, "%")} in this window.`
            : "Cash collection does not have enough live data yet.",
        href: "/dashboard/finance",
      },
      {
        label: "Demand",
        text:
          operations.conversions.bookingsToJobsRate !== null
            ? conversionDelta && conversionDelta.delta !== 0
              ? conversionDelta.delta > 0
                ? `Customer requests are converting more often at ${formatMetricValue(operations.conversions.bookingsToJobsRate, "%")}.`
                : `Bookings slowed this week. Conversion is ${formatMetricValue(operations.conversions.bookingsToJobsRate, "%")} right now.`
              : `Most customer requests are converting at ${formatMetricValue(operations.conversions.bookingsToJobsRate, "%")}.`
            : "Customer request conversion does not have enough live data yet.",
        href: "/dashboard/bookings",
      },
      {
        label: "Workload",
        text:
          capacity.summary.overloadedDays > 0
            ? `${capacity.summary.overloadedDays} overloaded day${capacity.summary.overloadedDays === 1 ? "" : "s"} need attention.`
            : overloadedDelta && overloadedDelta.delta > 0
            ? "Workload is getting tighter. Keep an eye on the next few days."
            : "Workload looks steady right now.",
        href: "/dashboard/scheduling",
      },
      {
        label: "Payments",
        text:
          customers.summary.customersWithOverdueBalances > 0
            ? `${customers.summary.customersWithOverdueBalances} customer balance${customers.summary.customersWithOverdueBalances === 1 ? "" : "s"} need attention.`
            : "Payments are up to date right now.",
        href: "/dashboard/finance",
      },
    ];
  }, [benchmarks, capacity, customers, operations, revenue]);

  const phase6ForecastCards = useMemo(() => {
    if (!operations || !capacity || !customers) return [];
    const completedLast7 = (operations.jobs.completedSeries || []).slice(-7).reduce((sum, row) => sum + Number(row.value || 0), 0);
    const createdLast7 = (operations.jobs.createdSeries || []).slice(-7).reduce((sum, row) => sum + Number(row.value || 0), 0);
    const overdueValue = revenue?.overdueInvoices?.amountCents || 0;
    const overloadedDays = capacity.summary.overloadedDays;
    const lowConfidence = completedLast7 + createdLast7 < 5;
    return [
      {
        key: "revenue",
        title: "Revenue forecast",
        value: revenue ? formatMoney(overdueValue) : "Unavailable",
        source: revenue ? "Invoice aging and collection funnel" : "Finance permission required",
        assumption: "Uses issued invoice and overdue balance history only.",
        confidence: revenue ? (overdueValue > 0 ? "Medium" : "Low") : "Limited",
        limitation: "No generated revenue prediction is shown when source records are insufficient.",
        href: "/dashboard/finance",
      },
      {
        key: "workload",
        title: "Workload forecast",
        value: `${createdLast7} created / ${completedLast7} completed`,
        source: "Job creation and completion series",
        assumption: "Compares the last seven visible job events with current open pressure.",
        confidence: lowConfidence ? "Low" : "Medium",
        limitation: "No route optimisation or synthetic demand is inferred.",
        href: "/dashboard/jobs",
      },
      {
        key: "technician_capacity",
        title: "Technician capacity",
        value: `${capacity.summary.technicians} technicians`,
        source: "Scheduling capacity and technician utilisation",
        assumption: "Uses scheduled minutes, available minutes, and overloaded-day counts.",
        confidence: overloadedDays > 0 ? "Medium" : "Low",
        limitation: "Holiday and sickness only affect the signal when they exist in capacity records.",
        href: "/dashboard/scheduling",
      },
      {
        key: "location_capacity",
        title: "Location capacity",
        value: activeLocationId === "all" ? "All locations" : "Filtered location",
        source: "Active location filter and operational analytics",
        assumption: "Location scope comes from the current workspace location context.",
        confidence: activeLocationId === "all" ? "Medium" : "High",
        limitation: "Location profitability appears only where cost and revenue records exist.",
        href: "/dashboard/locations",
      },
      {
        key: "invoice_risk",
        title: "Unpaid invoice risk",
        value: revenue ? String(revenue.overdueInvoices.count) : "Hidden",
        source: "Overdue invoice aging buckets",
        assumption: "Risk increases when overdue count or overdue value rises.",
        confidence: revenue ? "Medium" : "Limited",
        limitation: "This is not a payment prediction and never marks invoices paid optimistically.",
        href: "/dashboard/finance",
      },
      {
        key: "stock_demand",
        title: "Stock demand trend",
        value: `${operations.pressure.unassignedDueWork} due work`,
        source: "Due work, recurring pressure, and inventory pressure panels",
        assumption: "Stock pressure is surfaced from actual due work and inventory records.",
        confidence: "Low",
        limitation: "Supplier demand is not forecast without material usage history.",
        href: "/dashboard/inventory",
      },
      {
        key: "absence_impact",
        title: "Holiday/sickness impact",
        value: `${capacity.summary.overloadedDays} overloaded day${capacity.summary.overloadedDays === 1 ? "" : "s"}`,
        source: "Capacity exceptions and scheduling pressure",
        assumption: "Absence impact is only visible when capacity exceptions exist.",
        confidence: capacity.summary.overloadedDays > 0 ? "Medium" : "Low",
        limitation: "No staff absence is invented.",
        href: "/dashboard/scheduling",
      },
      {
        key: "completion_velocity",
        title: "Completion velocity",
        value: `${completedLast7} completed`,
        source: "Authoritative completed job series",
        assumption: "Uses completed job records in the selected analytics window.",
        confidence: completedLast7 > 0 ? "Medium" : "Low",
        limitation: "Completion velocity does not use assigned technician as performer.",
        href: "/dashboard/jobs",
      },
    ];
  }, [activeLocationId, capacity, customers, operations, revenue]);

  const chartCards = useMemo(() => {
    if (!operations || !capacity) return [];
    const completedJobsRows = (operations.jobs.completedSeries || [])
      .slice(-7)
      .map((row) => ({ label: row.day.slice(5), value: row.value, tone: row.value > 0 ? "success" as const : "neutral" as const }));
    const bookingConversionRows = [
      { label: "Bookings created", value: operations.conversions.bookingsCreated, tone: "info" as const, detail: "Authoritative public and operator bookings in the selected window." },
      { label: "Converted to jobs", value: operations.conversions.bookingsConverted, tone: "success" as const, detail: `${formatMetricValue(operations.conversions.bookingsToJobsRate, "%")} conversion rate.` },
    ];
    const technicianWorkloadRows = capacity.technicians
      .slice(0, 5)
      .map((row) => ({
        label: row.technicianName,
        value: Math.round(row.utilizationPct || 0),
        tone: (row.utilizationPct || 0) >= 100 ? "critical" as const : (row.utilizationPct || 0) >= 80 ? "warning" as const : "info" as const,
        detail: `${Math.round(row.scheduledMinutes / 60)}h scheduled · ${row.overloadedDays} overloaded days`,
      }));
    const jobPackRows = billing?.jobCompletionAllowance
      ? [
          { label: "Included used", value: Number(billing.jobCompletionAllowance.monthlyIncludedUsed || 0), tone: "info" as const },
          { label: "Included remaining", value: Number(billing.jobCompletionAllowance.monthlyIncludedRemaining || 0), tone: "success" as const },
          { label: "Purchased used", value: Number(billing.jobCompletionAllowance.purchasedCreditsUsed || 0), tone: "warning" as const },
          { label: "Purchased remaining", value: Number(billing.jobCompletionAllowance.purchasedCreditsRemaining || 0), tone: "success" as const },
        ]
      : [];
    const revenueFunnelRows = revenue
      ? [
          { label: "Quote to approved", value: Math.round(revenue.funnel.sentToApprovedRate || 0), tone: "info" as const },
          { label: "Approved to job", value: Math.round(revenue.funnel.approvedToConvertedRate || 0), tone: "success" as const },
          { label: "Issued to paid", value: Math.round(revenue.funnel.invoiceIssuedToPaidRate || 0), tone: "warning" as const },
        ]
      : [];
    const overduePaymentRows = revenue
      ? revenue.overdueInvoices.agingBuckets.map((bucket) => ({
          label: bucket.label,
          value: bucket.count,
          tone: bucket.count > 0 ? "critical" as const : "neutral" as const,
          detail: formatMoney(bucket.amountCents),
        }))
      : [];
    return [
      {
        key: "completed-jobs",
        title: "Jobs completed",
        description: "Latest daily completion counts from the authoritative analytics series.",
        icon: "work" as const,
        rows: completedJobsRows,
        testId: "analytics-chart-completed-jobs",
      },
      {
        key: "revenue-funnel",
        title: "Revenue funnel",
        description: "Quote, conversion, and collection rates from live billing analytics.",
        icon: "billing" as const,
        rows: revenueFunnelRows,
        testId: "analytics-chart-revenue-funnel",
      },
      {
        key: "overdue-payments",
        title: "Overdue payments",
        description: "Invoice aging buckets by count, with authoritative overdue value in each bucket.",
        icon: "billing" as const,
        rows: overduePaymentRows,
        testId: "analytics-chart-overdue-payments",
      },
      {
        key: "booking-conversion",
        title: "Booking conversion",
        description: "Public and operator booking throughput against actual job conversion.",
        icon: "calendar" as const,
        rows: bookingConversionRows,
        testId: "analytics-chart-booking-conversion",
      },
      {
        key: "technician-workload",
        title: "Technician workload",
        description: "Utilization percentage by technician in the current capacity window.",
        icon: "customers" as const,
        rows: technicianWorkloadRows,
        testId: "analytics-chart-technician-workload",
      },
      {
        key: "job-pack-usage",
        title: "Job-pack usage",
        description: "Included and purchased completion allowance from the live billing ledger.",
        icon: "spark" as const,
        rows: jobPackRows,
        testId: "analytics-chart-job-pack-usage",
      },
    ];
  }, [billing?.jobCompletionAllowance, capacity, operations, revenue]);

  function resetLayout() {
    clearNotice();
    updateWidgetOrder(DEFAULT_WIDGET_ORDER);
    updateHiddenWidgets([]);
    updateWindowDays(30);
    void load(30);
  }

  function exportSummaryCsv() {
    const rows = [
      ["Metric", "Value"],
      ...stats.map((item) => [String(item.label), String(item.value)]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mytitan-reports-${windowDays}-days.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  const stats = useMemo(() => {
    return [
      {
        label: "Revenue",
        value: revenue ? formatMoney(revenue.overdueInvoices.amountCents) : "Not enough data",
        hint: "Outstanding overdue invoice value in this reporting window.",
      },
      {
        label: "Active customers",
        value: customers ? String(customers.summary.activeCustomers) : "Not enough data",
        hint: "Customers with active work, plans, or commercial activity.",
      },
      {
        label: "Booking conversion",
        value: operations ? formatMetricValue(operations.conversions.bookingsToJobsRate, "%") : "Not enough data",
        hint: "Bookings converted to jobs in this window.",
      },
      {
        label: "Scheduled utilisation",
        value: capacity?.technicians?.length
          ? formatMetricValue(Math.round(capacity.technicians.reduce((sum, row) => sum + Number(row.utilizationPct || 0), 0) / capacity.technicians.length), "%")
          : "Not enough data",
        hint: "Average utilisation from scheduled and available minutes.",
      },
    ];
  }, [capacity, customers, operations, revenue]);

  if (!enabled) {
    return (
      <DashboardShell>
        <div className="operator-stack">
          <OperatorPageHeader
            title="Reports"
            subtitle="Enable Analytics V1 to open the business pulse and trend view."
            stats={[]}
          />
          <OperatorEmptyStateCard
            title="Analytics are not enabled"
            description="This analytics layer is feature-flagged and currently unavailable in this environment."
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
            title="Reports"
            subtitle="Analytics is limited to roles with intelligence access."
            stats={[]}
          />
          <OperatorEmptyStateCard
            title="Analytics access restricted"
            description="Your role can’t open this view."
          />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          title="Reports"
          actions={[
            { label: "Export", onClick: exportSummaryCsv },
            ...(canManageLayout ? [{ label: "Customise", href: "/dashboard/settings?tab=general", variant: "secondary" as const }] : []),
          ]}
          stats={stats}
        />

        <OperatorNotice notice={savingLayout ? null : notice} onDismiss={clearNotice} />

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Controls</h2>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <OperatorFilterField label="Window">
                <select
                  id="analytics-window-range"
                  className="input"
                  data-testid="analytics-window-range"
                  value={windowDays}
                  onChange={(event) => {
                    const nextWindowDays = Number(event.target.value);
                    updateWindowDays(nextWindowDays);
                    void load(nextWindowDays);
                  }}
                >
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
              </OperatorFilterField>
              <OperatorFilterField label="Location">
                <span className="input" title="Filter this view by location.">
                  {activeLocationId === "all" ? "All locations" : "Filtered location"}
                </span>
              </OperatorFilterField>
            </div>
          </div>
          {activeLocationId !== "all" ? (
            <p className="operator-section__subtitle" style={{ margin: "10px 0 0 0" }}>
              This view is filtered to the active business location.
            </p>
          ) : null}
        </section>

        <OperatorSavedViews
          label="Report tabs"
          activeView={activeReportTab}
          onChange={setActiveReportTab}
          views={[
            { id: "overview", label: "Overview" },
            { id: "revenue", label: "Revenue" },
            { id: "work", label: "Work" },
            { id: "customers", label: "Customers" },
            { id: "capacity", label: "Capacity" },
            { id: "forecasts", label: "Forecasts" },
          ]}
        />

        {!loading && activeReportTab === "forecasts" && phase6ForecastCards.length ? (
          <section className="card operator-section" data-testid="phase6-forecasting-engine">
            <div className="operator-section__header">
              <div>
                <p className="operator-eyebrow">Forecasting</p>
                <h2 className="operator-section__title">Evidence-led forecast signals</h2>
                <p className="operator-section__subtitle">
                  Real source data only. Every signal shows assumptions, confidence, and limitations instead of fabricated predictions.
                </p>
              </div>
              <a className="button secondary" href="/dashboard/analytics">Open reports</a>
            </div>
            <OperatorDataTable columns="minmax(180px, 0.8fr) minmax(160px, 0.8fr) minmax(120px, 0.5fr) minmax(220px, 1fr) minmax(120px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Signal</div>
                <div className="operator-table__cell">Current indication</div>
                <div className="operator-table__cell">Confidence</div>
                <div className="operator-table__cell">Source</div>
                <div className="operator-table__cell">Action</div>
              </OperatorDataTableHeader>
              {phase6ForecastCards.map((card) => (
                <OperatorDataTableRow key={card.key} data-testid={`phase6-forecast-${card.key}`}>
                  <div className="operator-table__cell"><strong>{card.title}</strong></div>
                  <div className="operator-table__cell">{card.value}</div>
                  <div className="operator-table__cell"><span className="operator-tag">{card.confidence}</span></div>
                  <div className="operator-table__cell">{card.source}</div>
                  <div className="operator-table__cell"><button className="button secondary" type="button" onClick={() => setForecastEvidence(card)}>View evidence</button></div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          </section>
        ) : null}

        {loading ? <LoadingState title="Loading analytics" description="Bringing in live commercial, workload, and conversion signals." /> : null}

        {!loading && activeReportTab === "overview" && phaseWidgets?.widgets?.length ? (
          <section className="card operator-section" data-testid="phase1k-custom-kpi-widgets">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Custom KPI widgets</h2>
                <p className="operator-section__subtitle">Owner-selected operational signals using real workspace data only.</p>
              </div>
            </div>
            <div className="analytics-stat-grid">
              {phaseWidgets.widgets.map((widget) => (
                <article key={widget.key} className="integration-card">
                  <div className="operator-page__statLabel">{widget.label}</div>
                  <div className="operator-page__statValue">{widget.value}</div>
                  <div className="operator-page__statHint">{widget.source}</div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && visibleWidgets.length === 0 ? (
          <OperatorEmptyStateCard
            title="No analytics panels are showing"
            description="Reset the saved layout to bring the default analytics view back."
          />
        ) : null}

        {!loading && activeReportTab === "overview" && ownerSnapshot.length ? (
          <section className="card operator-section" data-testid="analytics-owner-snapshot">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Business pulse</h2>
                <p className="operator-section__subtitle">Start with the few signals that best describe demand, completed work, collections pressure, and operating load.</p>
              </div>
            </div>
            {pulseSummary.length ? (
              <div className="mt-pulse-grid" style={{ marginBottom: 16 }}>
                {pulseSummary.map((item) => (
                  <Link key={item.label} href={item.href} className="mt-surface-note mt-linkCard">
                    <strong>{item.label}</strong>
                    <p className="muted" style={{ margin: "6px 0 0 0" }}>{item.text}</p>
                    <span className="mt-linkCard__action">Open</span>
                  </Link>
                ))}
              </div>
            ) : null}
            <div className="analytics-stat-grid">
              {ownerSnapshot.map((item) => (
                <Link key={item.label} href={item.href} className="integration-card mt-linkCard" data-testid={`analytics-owner-snapshot-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                  <div className="operator-page__statLabel">{item.label}</div>
                  <div className="operator-page__statValue">{item.value}</div>
                  <div className="operator-page__statHint">{item.hint}</div>
                  <span className="mt-linkCard__action">Open</span>
                </Link>
              ))}
              <Link href="/dashboard/analytics" className="integration-card mt-linkCard" data-testid="analytics-owner-snapshot-booking-page-visits">
                <div className="operator-page__statLabel">Booking page visits</div>
                <div className="operator-page__statValue">{traffic?.surfaces?.publicBooking || 0}</div>
                <div className="operator-page__statHint">{traffic?.visitsLast7Days || 0} safe first-party visits recorded in 7 days.</div>
                <span className="mt-linkCard__action">Open</span>
              </Link>
              <Link href="/customer" className="integration-card mt-linkCard" data-testid="analytics-owner-snapshot-customer-workspace-visits">
                <div className="operator-page__statLabel">Customer workspace visits</div>
                <div className="operator-page__statValue">{traffic?.surfaces?.customerWorkspace || 0}</div>
                <div className="operator-page__statHint">Anonymous sessions only; no raw IPs or public tokens are exposed.</div>
                <span className="mt-linkCard__action">Open</span>
              </Link>
            </div>
          </section>
        ) : null}

        {!loading && (activeReportTab === "overview" || activeReportTab === "work") ? (
          <section className="card operator-section" data-testid="analytics-chart-suite">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Operational view</h2>
                <p className="operator-section__subtitle">A tighter chart set for completion, conversion, collections, workload, and job-pack use.</p>
              </div>
            </div>
            <div className="two-col">
              {chartCards.map((card) => (
                <OperatorChartCard
                  key={card.key}
                  title={card.title}
                  description={card.description}
                  icon={card.icon}
                  rows={card.rows}
                  testId={card.testId}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!loading && activeReportTab === "overview" && visibleWidgets.includes("executive-summary") && executive ? (
          <section className="card operator-section" data-testid="analytics-executive-summary">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Executive summary</h2>
                <p className="operator-section__subtitle">Current operating posture plus the next focus signals most likely to move the business.</p>
              </div>
            </div>
            <div className="analytics-stat-grid">
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

        {!loading && activeReportTab === "overview" && visibleWidgets.includes("pressure-panel") && executive && operations && customers ? (
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
                <div className="operator-table__cell"><strong>Customer page use</strong></div>
                <div className="operator-table__cell">{operations.adoption.activePortalAccounts}</div>
                <div className="operator-table__cell">Active customer accounts show whether self-service is actually being used.</div>
                <div className="operator-table__cell"><a href="/dashboard/portal">Open customer-page ops</a></div>
              </OperatorDataTableRow>
            </OperatorDataTable>
          </section>
        ) : null}

        {!loading && activeReportTab === "revenue" && visibleWidgets.includes("revenue-panel") ? (
          <section className="card operator-section" data-testid="analytics-revenue-panel">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Revenue and collections</h2>
                <p className="operator-section__subtitle">Quote conversion, collections performance, and the follow-through work that still needs attention.</p>
              </div>
            </div>
            {canManageRevenue && revenue ? (
              <>
                <div className="analytics-stat-grid">
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

        {!loading && activeReportTab === "capacity" && visibleWidgets.includes("capacity-panel") && capacity && operations ? (
          <section className="card operator-section" data-testid="analytics-capacity-panel">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Capacity and recurring execution</h2>
                <p className="operator-section__subtitle">Technician utilization plus recurring-work pressure already landing on the schedule.</p>
              </div>
            </div>
            <div className="analytics-stat-grid">
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

        {!loading && activeReportTab === "overview" && visibleWidgets.includes("benchmark-delta") && benchmarks && operations && customers ? (
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

            <div className="analytics-stat-grid analytics-stat-grid--compact">
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

        {!loading && activeReportTab === "customers" && visibleWidgets.includes("customer-commercial-signals") && customers ? (
          <section className="card operator-section" data-testid="analytics-customer-commercial-signals">
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

        {!loading && activeReportTab === "work" && operations ? (
          <section className="card operator-section" data-testid="analytics-work-panel">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Work</h2>
              </div>
              <Link className="button secondary" href="/dashboard/jobs">Open source records</Link>
            </div>
            <div className="analytics-stat-grid">
              <div className="integration-card">
                <div className="operator-page__statLabel">Bookings created</div>
                <div className="operator-page__statValue">{operations.conversions.bookingsCreated}</div>
              </div>
              <div className="integration-card">
                <div className="operator-page__statLabel">Converted to jobs</div>
                <div className="operator-page__statValue">{operations.conversions.bookingsConverted}</div>
              </div>
              <div className="integration-card">
                <div className="operator-page__statLabel">Recurring execution</div>
                <div className="operator-page__statValue">{formatMetricValue(operations.servicePlans.executionRate, "%")}</div>
              </div>
              <div className="integration-card">
                <div className="operator-page__statLabel">Unassigned due work</div>
                <div className="operator-page__statValue">{operations.pressure.unassignedDueWork}</div>
              </div>
            </div>
          </section>
        ) : null}

        {forecastEvidence ? (
          <div role="dialog" aria-modal="true" aria-label="Forecast evidence" className="operator-modalBackdrop">
            <section className="card operator-section operator-modalPanel">
              <div className="operator-section__header">
                <div>
                  <h2 id="forecast-evidence-title" className="operator-section__title">{forecastEvidence.title}</h2>
                </div>
                <button className="button secondary" type="button" onClick={() => setForecastEvidence(null)}>Close</button>
              </div>
              <p><strong>Source:</strong> {forecastEvidence.source}</p>
              <p><strong>Assumption:</strong> {forecastEvidence.assumption}</p>
              <p><strong>Limitation:</strong> {forecastEvidence.limitation}</p>
              <p><strong>Confidence:</strong> {forecastEvidence.confidence}</p>
              <Link className="button" href={forecastEvidence.href}>Open source records</Link>
            </section>
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}

export default function AnalyticsPageRoute() {
  return <AnalyticsPage />;
}
