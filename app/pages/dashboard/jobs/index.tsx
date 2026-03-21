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
import { apiFetch } from "../../../lib/api";
import { getJobSignals } from "../../../lib/ops-signals";
import { useTenantSettings } from "../../../lib/tenant-settings";
import { getJobStages, mapStatusToStage } from "../../../lib/workflow-config";

type JobStatus = "OPEN" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type DateBucket = "all" | "upcoming" | "overdue" | "completed";
type JobSavedView = "all" | "unassigned" | "needs-scheduling" | "in-progress" | "completed";

const BULK_STATUSES: JobStatus[] = ["OPEN", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
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
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<CustomFieldValue[]>([]);
  const [customFieldJobId, setCustomFieldJobId] = useState<string | null>(null);
  const [activeLocationId, setActiveLocationId] = useState("all");

  const load = async () => {
    try {
      const data = await apiFetch(`/jobs?locationId=${encodeURIComponent(activeLocationId)}`);
      setJobs(Array.isArray(data) ? data : []);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load jobs");
    }
  };

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
      await load();
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
      await load();
    } catch (err: any) {
      pushNotice(err?.message || "Bulk update failed");
    }
  }

  const stats = useMemo(() => {
    const active = jobs.filter((job) => !["COMPLETED", "CANCELLED"].includes(String(job.status || "").toUpperCase())).length;
    const assigned = jobs.filter((job) => resolveAssignment(job) !== "Unassigned").length;
    const overdue = jobs.filter((job) => isInvoiceOverdue(job)).length;
    return [
      { label: terms.jobs, value: String(jobs.length), hint: `${active} still active` },
      { label: "Assigned", value: String(assigned), hint: `${Math.max(jobs.length - assigned, 0)} without an owner` },
      { label: "Overdue", value: String(overdue), hint: overdue ? "Invoices need follow-up" : "No overdue invoices" },
    ];
  }, [jobs]);

  const assignmentOptions = useMemo(() => {
    return Array.from(new Set(jobs.map((job) => resolveAssignment(job)))).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const status = String(job.status || "OPEN").toUpperCase();
      const assignment = resolveAssignment(job);
      const hasSchedule = Boolean(job.scheduledAt);
      const searchable = [job.jobRef, job.customerName, job.vehicleReg, job.serviceName, assignment, status].filter(Boolean).join(" ").toLowerCase();

      if (normalizedSearch && !searchable.includes(normalizedSearch)) return false;
      if (savedView === "unassigned" && assignment !== "Unassigned") return false;
      if (savedView === "needs-scheduling" && (hasSchedule || ["COMPLETED", "CANCELLED"].includes(status))) return false;
      if (savedView === "in-progress" && status !== "IN_PROGRESS") return false;
      if (savedView === "completed" && status !== "COMPLETED") return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (assignmentFilter === "unassigned" && assignment !== "Unassigned") return false;
      if (assignmentFilter !== "all" && assignmentFilter !== "unassigned" && assignment !== assignmentFilter) return false;
      if (dateBucket === "overdue" && !isInvoiceOverdue(job)) return false;
      if (dateBucket === "upcoming") {
        const scheduled = job?.scheduledAt ? new Date(job.scheduledAt) : null;
        if (!scheduled || Number.isNaN(scheduled.getTime()) || scheduled.getTime() < Date.now()) return false;
      }
      if (dateBucket === "completed" && status !== "COMPLETED") return false;
      return true;
    });
  }, [assignmentFilter, dateBucket, jobs, savedView, search, statusFilter]);

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
      if (!job.scheduledAt && !["COMPLETED", "CANCELLED"].includes(status)) counts["needs-scheduling"] += 1;
      if (status === "IN_PROGRESS") counts["in-progress"] += 1;
      if (status === "COMPLETED") counts.completed += 1;
    }
    return counts;
  }, [jobs]);

  const clearFilters = () => {
    setSavedView("all");
    setSearch("");
    setStatusFilter("all");
    setAssignmentFilter("all");
    setDateBucket("all");
  };

  const activeFilters = [
    savedView !== "all" ? { id: "view", label: `View: ${savedView.replace("-", " ")}`, onClear: () => setSavedView("all") } : null,
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

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Workflow"
          title={terms.jobs}
          subtitle="See work quickly, filter fast, and update jobs safely."
          actions={[
            { label: "Open Command Centre", href: commandCentreHref, variant: "secondary" },
            { label: `Create ${terms.jobs.slice(0, -1) || "Job"}`, href: "/dashboard/jobs/new" },
          ]}
          shortcuts={["Ctrl K opens quick navigation", "Bulk updates use the same live job actions"]}
          stats={stats}
        />

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">{terms.jobs} queue</h2>
              <p className="operator-section__subtitle">Keep the queue tight so status, timing, and ownership are easy to scan.</p>
            </div>
          </div>

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
            <OperatorFilterField label="Date bucket">
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
            title="Queue shortcuts"
            items={[
              "Saved views stay sticky on this device so operators can reopen their working queue quickly.",
              "Use the row checkboxes to build a selection, then apply bulk status updates from the bulk bar.",
              "Open a row menu for copy and next-step actions without expanding the table width.",
            ]}
          />

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
          </OperatorBulkBar>

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
                const visibleFieldSummaries = customFieldValues.filter((value) => value.entityId === job.id && value.field?.visible !== false).slice(0, 2);
                return (
                  <OperatorDataTableRow key={job.id} selected={selected}>
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
                        <span className="badge" data-testid="workflow-stage-label">{stage?.label || status}</span>
                        {isInvoiceOverdue(job) ? <span className="badge warn">Invoice overdue</span> : null}
                        {missingStageFields.length ? <span className="badge warn" data-testid="custom-field-stage-warning">{missingStageFields.join(", ")} required</span> : null}
                      </div>
                      <div className="operator-cellSubtle">
                        {[status, job.vehicleReg || null, job.serviceName || null].filter(Boolean).join(" | ") || "No vehicle or service metadata"}
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
                        <span>{formatMoney(job.totalCents || 0, job.currency || "USD")}</span>
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
                        primaryAction={{ label: "Open", href: `/dashboard/jobs/${job.id}` }}
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
              title={`No ${terms.jobs.toLowerCase()} match these filters`}
              description="Try clearing the filters, open Command Centre for the live board, or create a new job."
              actions={[
                { label: "Reset filters", variant: "secondary", onClick: clearFilters },
                { label: "Create job", href: "/dashboard/jobs/new" },
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
