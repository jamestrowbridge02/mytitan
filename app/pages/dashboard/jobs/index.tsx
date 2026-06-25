import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { EntityCustomFieldsCard } from "../../../components/custom-fields/EntityCustomFieldsCard";
import { DashboardShell } from "../../../components/dashboard-shell";
import {
  OperatorActiveFilters,
  OperatorBulkBar,
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorFilterBar,
  OperatorFilterField,
  OperatorGuidance,
  OperatorPageHeader,
  OperatorRowActions,
  OperatorSavedViews,
} from "../../../components/ui/operator-page";
import OpsSignalsBar from "../../../components/entity/OpsSignalsBar";
import { getBusinessTerms, getCommandCentreHref } from "../../../lib/business-config";
import { getMissingRequiredCustomFieldKeys, type CustomField, type CustomFieldValue } from "../../../lib/custom-fields";
import { readActiveLocationId, subscribeActiveLocationId } from "../../../lib/location-context";
import { useStickyOperatorView } from "../../../lib/operator-view-state";
import { useOperationalRefresh } from "../../../lib/operational-refresh";
import { apiFetch } from "../../../lib/api";
import { getJobSignals } from "../../../lib/ops-signals";
import { useTenantSettings } from "../../../lib/tenant-settings";
import { getJobStages, mapStatusToStage } from "../../../lib/workflow-config";

type JobStatus = "OPEN" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "INVOICED" | "CANCELLED";
type DateBucket = "all" | "upcoming" | "overdue" | "completed";
type JobSavedView = "all" | "unassigned" | "needs-scheduling" | "in-progress" | "completed";
type LifecycleView = "active" | "completed" | "cancelled" | "archived" | "all";

const BULK_STATUSES: JobStatus[] = ["OPEN", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "INVOICED", "CANCELLED"];

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "GBP",
  }).format((cents || 0) / 100);
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isInvoiceOverdue(job: any) {
  if (!job?.invoiceDueAt || job?.invoicePaidAt) return false;
  const date = new Date(job.invoiceDueAt);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function resolveAssignment(job: any) {
  return job.technicianName || job.assignedTechnicianName || "Unassigned";
}

function resolveNextStatus(job: any): JobStatus | null {
  const status = String(job?.status || "OPEN").toUpperCase();
  if (status === "OPEN" || status === "SCHEDULED") return "IN_PROGRESS";
  if (status === "IN_PROGRESS") return "COMPLETED";
  return null;
}

function isArchived(job: any) {
  return Boolean(job?.archivedAt);
}

function isFinishedStatus(status: string) {
  return ["COMPLETED", "INVOICED", "CANCELLED"].includes(status);
}

function describeJobOperatorState(job: any, options?: { missingFields?: string[] }) {
  const status = String(job?.status || "OPEN").toUpperCase();
  const assignment = resolveAssignment(job);
  const missingFields = options?.missingFields || [];

  if (missingFields.length) {
    return {
      label: "Blocked",
      summary: `${missingFields.join(", ")} still need values before this stage is complete.`,
      actionLabel: "Clear blockers",
    };
  }

  if (isInvoiceOverdue(job)) {
    return {
      label: "Needs payment follow-up",
      summary: "Invoice is overdue. Review the job handoff and chase payment next.",
      actionLabel: "Get paid",
    };
  }

  if (status === "INVOICED" && job?.invoicePaidAt) {
    return {
      label: "Ready to archive",
      summary: "Payment is in. Archive this job when you want it out of the daily queue.",
      actionLabel: "Review job",
    };
  }

  if (status === "COMPLETED" || status === "INVOICED") {
    return {
      label: "Ready to share",
      summary: "Work is complete. Review proof, share the result, and move into payment follow-up.",
      actionLabel: "Finish and send",
    };
  }

  if (status === "IN_PROGRESS") {
    return {
      label: "In progress",
      summary: "Work is live. Capture proof and finish cleanly from the job detail.",
      actionLabel: "Resume live job",
    };
  }

  if (!job?.scheduledAt && status !== "CANCELLED") {
    return {
      label: "Needs scheduling",
      summary: "Set the visit time so the next operator step is obvious.",
      actionLabel: "Schedule work",
    };
  }

  if (assignment === "Unassigned" && status !== "CANCELLED") {
    return {
      label: "Needs owner",
      summary: "Assign someone so the work can move without extra handoff.",
      actionLabel: "Assign owner",
    };
  }

  if (status === "CANCELLED") {
    return {
      label: "Cancelled",
      summary: "This job is cancelled and no longer needs daily attention.",
      actionLabel: "Review job",
    };
  }

  return {
    label: "Needs work",
    summary: "The job is ready to move into active work.",
    actionLabel: "Start job",
  };
}

export default function Jobs() {
  const router = useRouter();
  const { settings } = useTenantSettings();
  const terms = getBusinessTerms(settings);
  const commandCentreHref = getCommandCentreHref(settings);
  const jobStages = getJobStages(settings);
  const [jobs, setJobs] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [dateBucket, setDateBucket] = useState<DateBucket>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<JobStatus>("IN_PROGRESS");
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [savedView, setSavedView] = useStickyOperatorView<JobSavedView>("mytitan_jobs_saved_view_v1", "all");
  const [lifecycleView, setLifecycleView] = useState<LifecycleView>("active");
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<CustomFieldValue[]>([]);
  const [customFieldJobId, setCustomFieldJobId] = useState<string | null>(null);
  const [activeLocationId, setActiveLocationId] = useState("all");
  const [archivePeriods, setArchivePeriods] = useState<any[]>([]);
  const [archivePeriodId, setArchivePeriodId] = useState("");
  const [archiveName, setArchiveName] = useState("");
  const [archiveFrom, setArchiveFrom] = useState("");
  const [archiveTo, setArchiveTo] = useState("");

  const load = async () => {
    try {
      const [data, periods] = await Promise.all([
        apiFetch(`/jobs?locationId=${encodeURIComponent(activeLocationId)}&includeArchived=true`),
        apiFetch("/jobs/archive-periods"),
      ]);
      setJobs(Array.isArray(data) ? data : []);
      const rows = Array.isArray(periods) ? periods : [];
      setArchivePeriods(rows);
      if (!archivePeriodId) setArchivePeriodId(rows.find((row: any) => row.status === "OPEN")?.id || "");
      setError("");
    } catch (err: any) {
      setError("We couldn't load jobs right now. Try again in a moment.");
    }
  };
  const { refreshNow, lastUpdatedAt, isRefreshing } = useOperationalRefresh(load);

  useEffect(() => {
    setActiveLocationId(readActiveLocationId());
    return subscribeActiveLocationId(setActiveLocationId);
  }, []);

  useEffect(() => {
    void load();
  }, [activeLocationId]);

  useEffect(() => {
    async function loadCustomFieldData() {
      if (!jobs.length) {
        setCustomFieldValues([]);
        return;
      }
      try {
        const [fieldRows, valueRows] = await Promise.all([
          apiFetch("/custom-fields?entityType=job&visible=true"),
          apiFetch(`/custom-fields/values?entityType=job&entityIds=${encodeURIComponent(jobs.map((job) => job.id).join(","))}`),
        ]);
        setCustomFields(Array.isArray(fieldRows) ? fieldRows : []);
        setCustomFieldValues(Array.isArray(valueRows?.values) ? valueRows.values : []);
      } catch {
        setCustomFields([]);
        setCustomFieldValues([]);
      }
    }
    void loadCustomFieldData();
  }, [jobs]);

  useEffect(() => {
    if (!router.isReady) return;
    const searchParam = typeof router.query.search === "string" ? router.query.search : "";
    const filterParam = typeof router.query.filter === "string" ? router.query.filter : "";
    if (searchParam) setSearch(searchParam);
    if (filterParam === "unassigned") {
      setSavedView("unassigned");
      setAssignmentFilter("unassigned");
    } else if (filterParam === "overdue" || filterParam === "unpaid") {
      setDateBucket("overdue");
    }
  }, [router.isReady, router.query.filter, router.query.search, setSavedView]);

  function pushNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      pushNotice(`${label} copied`);
    } catch {
      pushNotice(`Could not copy ${label.toLowerCase()}`);
    }
  }

  async function updateSingleStatus(jobId: string, status: JobStatus) {
    setSavingIds((prev) => [...prev, jobId]);
    try {
      await apiFetch(`/jobs/${jobId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      pushNotice(`Status updated to ${status}`);
      await refreshNow();
    } catch (err: any) {
      pushNotice(err?.message || "Could not update status");
    } finally {
      setSavingIds((prev) => prev.filter((id) => id !== jobId));
    }
  }

  async function runBulk(operation: "setStatus" | "markComplete", status?: JobStatus) {
    if (!selectedIds.length) return;
    try {
      await apiFetch("/jobs/bulk-v2", {
        method: "POST",
        body: JSON.stringify({
          jobIds: selectedIds,
          operation,
          ...(status ? { status } : {}),
        }),
      });
      pushNotice(operation === "markComplete" ? "Selected jobs marked complete" : `Selected jobs set to ${status}`);
      setSelectedIds([]);
      await refreshNow();
    } catch (err: any) {
      pushNotice(err?.message || "Bulk update failed");
    }
  }

  const stats = useMemo(() => {
    const active = jobs.filter((job) => !isArchived(job) && !isFinishedStatus(String(job.status || "").toUpperCase())).length;
    const completed = jobs.filter((job) => !isArchived(job) && ["COMPLETED", "INVOICED"].includes(String(job.status || "").toUpperCase())).length;
    const archivedCount = jobs.filter((job) => isArchived(job)).length;
    return [
      { label: "Active", value: String(active), hint: "Daily work stays focused here" },
      { label: "Completed", value: String(completed), hint: "Archive finished work when the handoff is done" },
      { label: "Archived", value: String(archivedCount), hint: archivedCount ? "Revisit old work without cluttering the queue" : "Nothing archived yet" },
    ];
  }, [jobs]);

  const assignmentOptions = useMemo(() => {
    return Array.from(new Set(jobs.map((job) => resolveAssignment(job)))).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const status = String(job.status || "OPEN").toUpperCase();
      const archived = isArchived(job);
      const assignment = resolveAssignment(job);
      const hasSchedule = Boolean(job.scheduledAt);
      const searchable = [job.jobRef, job.customerName, job.vehicleReg, job.serviceName, assignment, status].filter(Boolean).join(" ").toLowerCase();

      if (normalizedSearch && !searchable.includes(normalizedSearch)) return false;
      if (lifecycleView === "active" && (archived || isFinishedStatus(status))) return false;
      if (lifecycleView === "completed" && (archived || !["COMPLETED", "INVOICED"].includes(status))) return false;
      if (lifecycleView === "cancelled" && (archived || status !== "CANCELLED")) return false;
      if (lifecycleView === "archived" && !archived) return false;
      if (savedView === "unassigned" && assignment !== "Unassigned") return false;
      if (savedView === "needs-scheduling" && (hasSchedule || archived || ["COMPLETED", "INVOICED", "CANCELLED"].includes(status))) return false;
      if (savedView === "in-progress" && status !== "IN_PROGRESS") return false;
      if (savedView === "completed" && !["COMPLETED", "INVOICED"].includes(status)) return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (assignmentFilter === "unassigned" && assignment !== "Unassigned") return false;
      if (assignmentFilter !== "all" && assignmentFilter !== "unassigned" && assignment !== assignmentFilter) return false;
      if (dateBucket === "overdue" && !isInvoiceOverdue(job)) return false;
      if (dateBucket === "upcoming") {
        const scheduled = job?.scheduledAt ? new Date(job.scheduledAt) : null;
        if (!scheduled || Number.isNaN(scheduled.getTime()) || scheduled.getTime() < Date.now()) return false;
      }
      if (dateBucket === "completed" && !["COMPLETED", "INVOICED"].includes(status)) return false;
      return true;
    });
  }, [assignmentFilter, dateBucket, jobs, lifecycleView, savedView, search, statusFilter]);

  const lifecycleCounts = useMemo(
    () => ({
      active: jobs.filter((job) => !isArchived(job) && !isFinishedStatus(String(job.status || "").toUpperCase())).length,
      completed: jobs.filter((job) => !isArchived(job) && ["COMPLETED", "INVOICED"].includes(String(job.status || "").toUpperCase())).length,
      cancelled: jobs.filter((job) => !isArchived(job) && String(job.status || "").toUpperCase() === "CANCELLED").length,
      archived: jobs.filter((job) => isArchived(job)).length,
      all: jobs.length,
    }),
    [jobs],
  );

  const savedViewCounts = useMemo(() => {
    const counts: Record<JobSavedView, number> = {
      all: jobs.length,
      unassigned: 0,
      "needs-scheduling": 0,
      "in-progress": 0,
      completed: 0,
    };
    for (const job of jobs) {
      const status = String(job.status || "OPEN").toUpperCase();
      const assignment = resolveAssignment(job);
      if (assignment === "Unassigned") counts.unassigned += 1;
      if (!job.scheduledAt && !isArchived(job) && !["COMPLETED", "INVOICED", "CANCELLED"].includes(status)) counts["needs-scheduling"] += 1;
      if (status === "IN_PROGRESS") counts["in-progress"] += 1;
      if (["COMPLETED", "INVOICED"].includes(status)) counts.completed += 1;
    }
    return counts;
  }, [jobs]);

  const clearFilters = () => {
    setSavedView("all");
    setLifecycleView("active");
    setSearch("");
    setStatusFilter("all");
    setAssignmentFilter("all");
    setDateBucket("all");
  };

  const activeFilters = [
    savedView !== "all" ? { id: "view", label: `View: ${savedView.replace("-", " ")}`, onClear: () => setSavedView("all") } : null,
    lifecycleView !== "active" ? { id: "lifecycle", label: `Lifecycle: ${lifecycleView}`, onClear: () => setLifecycleView("active") } : null,
    search ? { id: "search", label: `Search: ${search}`, onClear: () => setSearch("") } : null,
    statusFilter !== "all" ? { id: "status", label: `Status: ${statusFilter}`, onClear: () => setStatusFilter("all") } : null,
    assignmentFilter !== "all" ? { id: "assignment", label: `Owner: ${assignmentFilter}`, onClear: () => setAssignmentFilter("all") } : null,
    dateBucket !== "all" ? { id: "dateBucket", label: `Timing: ${dateBucket}`, onClear: () => setDateBucket("all") } : null,
  ].filter((chip): chip is { id: string; label: string; onClear: () => void } => Boolean(chip));

  const selectedVisibleCount = useMemo(
    () => filteredJobs.filter((job) => selectedIds.includes(job.id)).length,
    [filteredJobs, selectedIds],
  );

  const allVisibleSelected = filteredJobs.length > 0 && selectedVisibleCount === filteredJobs.length;

  async function createArchivePeriod() {
    if (!archiveName.trim() || !archiveFrom || !archiveTo) {
      setError("Add an archive name and date range.");
      return;
    }
    try {
      const created = await apiFetch("/jobs/archive-periods", {
        method: "POST",
        body: JSON.stringify({ name: archiveName, fromDate: archiveFrom, toDate: archiveTo, scope: "JOBS_AND_INVOICES" }),
      });
      setArchiveName("");
      setArchiveFrom("");
      setArchiveTo("");
      setArchivePeriodId(created?.id || "");
      setNotice(`Archive period ${created?.name || ""} opened.`);
      await refreshNow();
    } catch (nextError: any) {
      setError(nextError?.message || "Archive period could not be created.");
    }
  }

  async function archiveSelected() {
    if (!archivePeriodId || !selectedIds.length) return;
    if (!window.confirm(`Archive ${selectedIds.length} selected record(s) into this period?`)) return;
    try {
      const result = await apiFetch("/jobs/archive-periods/archive-selected", {
        method: "POST",
        body: JSON.stringify({ archivePeriodId, jobIds: selectedIds }),
      });
      setSelectedIds([]);
      setNotice(`${result?.archived || 0} record(s) archived.`);
      await refreshNow();
    } catch (nextError: any) {
      setError(nextError?.message || "Selected records could not be archived.");
    }
  }

  async function archiveDateRange() {
    if (!archivePeriodId) return;
    if (!window.confirm("Archive eligible completed jobs and issued invoices in this period's date range?")) return;
    try {
      const result = await apiFetch("/jobs/archive-periods/archive-by-date", {
        method: "POST",
        body: JSON.stringify({ archivePeriodId }),
      });
      setNotice(`${result?.archived || 0} eligible record(s) archived by date range.`);
      await refreshNow();
    } catch (nextError: any) {
      setError(nextError?.message || "Date-range archive could not be completed.");
    }
  }

  async function closeArchivePeriod() {
    if (!archivePeriodId) return;
    if (!window.confirm("Close this archive period? Archived records remain searchable and restorable.")) return;
    try {
      await apiFetch(`/jobs/archive-periods/${archivePeriodId}/close`, { method: "POST", body: JSON.stringify({}) });
      setArchivePeriodId("");
      setNotice("Archive period closed. Open a new named period for new archive activity.");
      await refreshNow();
    } catch (nextError: any) {
      setError(nextError?.message || "Archive period could not be closed.");
    }
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Jobs"
          title={terms.jobs}
          subtitle={`Keep daily work focused, move finished jobs into archive, and revisit older jobs when you need the proof again.`}
          actions={[
            { label: "Start work", href: "/dashboard/work" },
            { label: "See live work", href: commandCentreHref, variant: "secondary" },
            { label: `Create ${terms.jobs.slice(0, -1) || "Job"}`, href: "/dashboard/jobs/new?guided=1&entry=work", variant: "secondary" },
          ]}
          shortcuts={["Search by job, customer, reg, or owner", "Start with work that is unassigned, overdue, or ready to move"]}
          stats={stats}
        />

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Job queue</h2>
              <p className="operator-section__subtitle">Use Active for live work. Completed, cancelled, and archived jobs stay close without crowding the main queue.</p>
            </div>
            <div className="operator-inline-actions">
              <span className="muted">{isRefreshing ? "Refreshing..." : lastUpdatedAt ? "Updated just now" : "Live queue"}</span>
              <button className="button secondary operator-compact-button" type="button" disabled={isRefreshing} onClick={() => void refreshNow()}>
                Refresh
              </button>
            </div>
          </div>

          <details className="stripe-readiness-details" data-testid="archive-period-management">
            <summary>Archive periods</summary>
            <div className="operator-stack" style={{ marginTop: 12 }}>
              <div className="operator-formGrid">
                <label>Period name<input className="input" placeholder="2026 Q2" value={archiveName} onChange={(event) => setArchiveName(event.target.value)} /></label>
                <label>From<input className="input" type="date" value={archiveFrom} onChange={(event) => setArchiveFrom(event.target.value)} /></label>
                <label>To<input className="input" type="date" value={archiveTo} onChange={(event) => setArchiveTo(event.target.value)} /></label>
                <button className="button secondary" type="button" onClick={() => void createArchivePeriod()}>Open new archive period</button>
              </div>
              <div className="operator-inline-actions">
                <select className="input" value={archivePeriodId} onChange={(event) => setArchivePeriodId(event.target.value)}>
                  <option value="">Choose open archive period</option>
                  {archivePeriods.filter((period) => period.status === "OPEN").map((period) => (
                    <option key={period.id} value={period.id}>{period.name} ({period._count?.jobs || 0})</option>
                  ))}
                </select>
                <button className="button secondary" type="button" disabled={!archivePeriodId || !selectedIds.length} onClick={() => void archiveSelected()}>
                  Archive selected
                </button>
                <button className="button secondary" type="button" disabled={!archivePeriodId} onClick={() => void archiveDateRange()}>
                  Archive period date range
                </button>
                <button className="button secondary" type="button" disabled={!archivePeriodId} onClick={() => void closeArchivePeriod()}>
                  Close archive period
                </button>
              </div>
            </div>
          </details>

          <OperatorSavedViews
            views={[
              { id: "active", label: "Active", count: lifecycleCounts.active },
              { id: "completed", label: "Completed", count: lifecycleCounts.completed },
              { id: "cancelled", label: "Cancelled", count: lifecycleCounts.cancelled },
              { id: "archived", label: "Archived", count: lifecycleCounts.archived },
              { id: "all", label: "All", count: lifecycleCounts.all },
            ]}
            activeView={lifecycleView}
            onChange={(view) => setLifecycleView(view as LifecycleView)}
          />

          <OperatorSavedViews
            views={[
              { id: "all", label: "All", count: savedViewCounts.all },
              { id: "unassigned", label: "Unassigned", count: savedViewCounts.unassigned },
              { id: "needs-scheduling", label: "Needs scheduling", count: savedViewCounts["needs-scheduling"] },
              { id: "in-progress", label: "In progress", count: savedViewCounts["in-progress"] },
              { id: "completed", label: "Completed", count: savedViewCounts.completed },
            ]}
            activeView={savedView}
            onChange={(view) => setSavedView(view as JobSavedView)}
          />

          <OperatorFilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search job ref, customer, reg, service, or owner"
            resultsLabel={`${filteredJobs.length} shown of ${jobs.length} ${terms.jobs.toLowerCase()}`}
            actions={[
              { label: "Reset filters", variant: "secondary", onClick: clearFilters },
            ]}
          >
            <OperatorFilterField label="Status">
              <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {BULK_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </OperatorFilterField>
            <OperatorFilterField label="Assignment">
              <select className="input" value={assignmentFilter} onChange={(event) => setAssignmentFilter(event.target.value)}>
                <option value="all">All owners</option>
                <option value="unassigned">Unassigned</option>
                {assignmentOptions.map((assignment) => (
                  <option key={assignment} value={assignment}>{assignment}</option>
                ))}
              </select>
            </OperatorFilterField>
            <OperatorFilterField label="When">
              <select className="input" value={dateBucket} onChange={(event) => setDateBucket(event.target.value as DateBucket)}>
                <option value="all">All timing</option>
                <option value="upcoming">Upcoming</option>
                <option value="overdue">Invoice overdue</option>
                <option value="completed">Completed</option>
              </select>
            </OperatorFilterField>
          </OperatorFilterBar>

          <OperatorActiveFilters chips={activeFilters} onClearAll={activeFilters.length ? clearFilters : undefined} />

          <OperatorGuidance
            title="Keep work flowing"
            items={[
              "Use Active for today's work and Archive when the job is done and paid.",
              "Use Unassigned to find work that still needs an owner.",
              "Delete is only for jobs with no proof, booking, or billing history attached yet.",
            ]}
          />

          {selectedIds.length ? (
            <OperatorBulkBar count={selectedIds.length} hint={`${selectedVisibleCount} of ${filteredJobs.length} visible rows selected`}>
              <button className="button secondary operator-compact-button" type="button" onClick={() => setSelectedIds([])}>
                Clear
              </button>
              <button
                className="button secondary operator-compact-button"
                type="button"
                onClick={() => void copyText(jobs.filter((job) => selectedIds.includes(job.id)).map((job) => job.jobRef || job.id).join(", "), "Job refs")}
              >
                Copy refs
              </button>
              <select className="input operator-compact-button" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as JobStatus)}>
                {BULK_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <button className="button secondary operator-compact-button" type="button" onClick={() => void runBulk("setStatus", bulkStatus)}>
                Set status
              </button>
              <button className="button operator-compact-button" type="button" onClick={() => void runBulk("markComplete")}>
                Mark complete
              </button>
              <button className="button secondary operator-compact-button" type="button" disabled={!archivePeriodId} onClick={() => void archiveSelected()}>
                Archive to period
              </button>
            </OperatorBulkBar>
          ) : null}

          {error ? <p role="alert" style={{ color: "#ff8a8a", marginTop: 0 }}>{error}</p> : null}
          {notice ? <div aria-live="polite" className="ccv2-toast ccv2-toast--info" role="status">{notice}</div> : null}

          {filteredJobs.length ? (
            <OperatorDataTable columns="28px minmax(220px, 1.6fr) minmax(140px, 1fr) minmax(140px, 0.9fr) minmax(160px, 1fr) minmax(170px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">
                  <input
                    aria-label={allVisibleSelected ? "Clear visible job selection" : "Select all visible jobs"}
                    className="operator-checkbox"
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedIds(Array.from(new Set([...selectedIds, ...filteredJobs.map((job) => job.id)])));
                        return;
                      }
                      setSelectedIds((prev) => prev.filter((id) => !filteredJobs.some((job) => job.id === id)));
                    }}
                  />
                </div>
                <div className="operator-table__cell">Job</div>
                <div className="operator-table__cell">Customer</div>
                <div className="operator-table__cell">Owner</div>
                <div className="operator-table__cell">Timing</div>
                <div className="operator-table__cell">Actions</div>
              </OperatorDataTableHeader>

              {filteredJobs.map((job) => {
                const nextStatus = resolveNextStatus(job);
                const selected = selectedIds.includes(job.id);
                const status = String(job.status || "OPEN").toUpperCase();
                const stage = mapStatusToStage(status, jobStages);
                const missingStageFields = getMissingRequiredCustomFieldKeys(stage?.requiredCustomFieldKeys, customFields, customFieldValues, "job", job.id);
                const operatorState = describeJobOperatorState(job, { missingFields: missingStageFields });
                const visibleFieldSummaries = customFieldValues.filter((value) => value.entityId === job.id && value.field?.visible !== false).slice(0, 2);
                return (
                  <OperatorDataTableRow key={job.id} selected={selected} data-testid={`job-row-${job.id}`}>
                    <div className="operator-table__cell">
                      <input
                        aria-label={`Select job ${job.jobRef || job.id}`}
                        className="operator-checkbox"
                        type="checkbox"
                        checked={selected}
                        onChange={() => setSelectedIds((prev) => prev.includes(job.id) ? prev.filter((id) => id !== job.id) : [...prev, job.id])}
                      />
                    </div>
                    <div className="operator-table__cell">
                      <div className="operator-cellTitle">
                        <Link href={`/dashboard/jobs/${job.id}`}>{job.jobRef || job.id}</Link>
                        <span className="badge">{operatorState.label}</span>
                        <span className="badge" data-testid="workflow-stage-label">{stage?.label || status}</span>
                        {isArchived(job) ? <span className="badge">Archived</span> : null}
                        {job?.archivePeriod?.name ? <span className="badge">{job.archivePeriod.name}</span> : null}
                        {job?.invoicePaidAt ? <span className="badge">Paid</span> : null}
                        {isInvoiceOverdue(job) ? <span className="badge warn">Invoice overdue</span> : null}
                        {missingStageFields.length ? <span className="badge warn" data-testid="custom-field-stage-warning">{missingStageFields.join(", ")} required</span> : null}
                      </div>
                      <div className="operator-cellSubtle">
                        {[operatorState.summary, job.vehicleReg || null, job.serviceName || null].filter(Boolean).join(" | ") || "No vehicle or service metadata"}
                      </div>
                      {visibleFieldSummaries.length ? (
                        <div className="operator-cellSubtle" style={{ marginTop: 6 }}>
                          {visibleFieldSummaries.map((value) => `${value.field?.label}: ${String(value.valueJson)}`).join(" | ")}
                        </div>
                      ) : null}
                      <div style={{ marginTop: 8 }}>
                        <OpsSignalsBar {...getJobSignals(job)} compact />
                      </div>
                    </div>
                    <div className="operator-table__cell">
                      <div className="operator-cellMeta">
                        <span><strong>{job.customerName || "Unknown customer"}</strong></span>
                        <span>{formatMoney(job.totalCents || 0, job.currency || "GBP")}</span>
                      </div>
                    </div>
                    <div className="operator-table__cell">
                      <div className="operator-cellMeta">
                        <span><strong>{resolveAssignment(job)}</strong></span>
                        <span>{job.location?.name || "No location"}</span>
                      </div>
                    </div>
                    <div className="operator-table__cell">
                      <div className="operator-cellMeta">
                        <span><strong>{formatDateTime(job.scheduledAt)}</strong></span>
                        <span>{job.invoiceDueAt ? `Invoice due ${new Date(job.invoiceDueAt).toLocaleDateString()}` : "No invoice due date"}</span>
                      </div>
                    </div>
                    <div className="operator-table__cell operator-table__cell--actions">
                      <OperatorRowActions
                        primaryAction={{ label: operatorState.actionLabel, href: `/dashboard/jobs/${job.id}` }}
                        actions={[
                          {
                            label: "Copy ref",
                            description: "Copy the job reference to the clipboard",
                            shortcut: "Ref",
                            group: "Tools",
                            onClick: () => void copyText(job.jobRef || job.id, "Job ref"),
                            variant: "secondary",
                          },
                          {
                            label: "Custom fields",
                            description: "Review and edit workspace-specific job fields",
                            group: "Tools",
                            onClick: () => setCustomFieldJobId(job.id),
                            testId: `job-custom-fields-${job.id}`,
                          },
                          ...(nextStatus
                            ? [{
                                label: nextStatus === "IN_PROGRESS" ? "Start job" : "Complete job",
                                description: nextStatus === "IN_PROGRESS" ? "Advance this job into active work" : "Mark this job as done",
                                shortcut: nextStatus === "IN_PROGRESS" ? "Go" : "Done",
                                group: "Queue",
                                onClick: () => void updateSingleStatus(job.id, nextStatus),
                                disabled: savingIds.includes(job.id),
                              }]
                            : []),
                        ]}
                      />
                    </div>
                  </OperatorDataTableRow>
                );
              })}
            </OperatorDataTable>
          ) : !error ? (
            <OperatorEmptyStateCard
              title={`No ${terms.jobs.toLowerCase()} match this view`}
              description={`Reset the filters, start work, or create a ${terms.jobs.slice(0, -1).toLowerCase() || "job"} so the next operator step is clear again.`}
              actions={[
                { label: "Reset filters", variant: "secondary", onClick: clearFilters },
                { label: "Create job", href: "/dashboard/jobs/new?guided=1&entry=work" },
                { label: "See live work", href: commandCentreHref, variant: "secondary" },
              ]}
            />
          ) : null}
        </section>

        {customFieldJobId ? (
          <EntityCustomFieldsCard
            title="Job custom fields"
            entityType="job"
            entityId={customFieldJobId}
            onSaved={() => {
              void load();
            }}
          />
        ) : null}
      </div>
    </DashboardShell>
  );
}
