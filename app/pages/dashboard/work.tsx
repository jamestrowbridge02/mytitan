import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import {
  OperatorPageHeader,
} from "../../components/ui/operator-page";
import { ApiError, apiFetch } from "../../lib/api";
import { readActiveLocationId, subscribeActiveLocationId } from "../../lib/location-context";
import { useOperationalRefresh } from "../../lib/operational-refresh";

type Summary = {
  drafts?: { jobs?: any[]; crm?: any[] };
  todayBookings?: any[];
  dueAndOverdueJobs?: any[];
  unpaidJobs?: any[];
  money?: { unpaidCount?: number; unpaidTotalCents?: number };
};

type LiveWorkQueueItem = {
  id: string;
  title: string;
  status: string;
  location: string;
  assigned: string;
  updatedAt?: string | null;
  href: string;
  action: string;
  draft?: any;
};

function formatDateTime(value?: string | null) {
  if (!value) return "No recent update";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No recent update";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatMoney(cents: number, currency = "GBP") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format((cents || 0) / 100);
}

function normalizeStatus(job: any) {
  return String(job?.status || "OPEN").toUpperCase();
}

function latestByUpdatedAt(rows: any[]) {
  return [...rows].sort((a, b) => {
    const aTime = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const bTime = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function buildDraftHref(draft?: any) {
  const trade = String(draft?.trade || "WHEELS").toUpperCase();
  return `/dashboard/jobs/new?guided=1&resumeTrade=${encodeURIComponent(trade)}&entry=work`;
}

function buildStandardJobHref() {
  return "/dashboard/jobs/new?entry=work";
}

function describeWorkQueueState(jobDrafts: any[], activeJobs: any[], completedJobs: any[], unpaidJobs: any[], unpaidTotalCents: number) {
  return [
    {
      label: "Needs work",
      value: String(jobDrafts.length),
      hint: jobDrafts.length ? "Resume saved work first" : "No saved work waiting",
    },
    {
      label: "In progress",
      value: String(activeJobs.length),
      hint: activeJobs.length ? "Live work is ready to resume" : "No jobs in progress",
    },
    {
      label: "Ready to share",
      value: String(completedJobs.length),
      hint: completedJobs.length ? "Finish the customer handoff next" : "Nothing ready to share yet",
    },
    {
      label: "Needs payment follow-up",
      value: String(Number(unpaidJobs.length || 0)),
      hint: unpaidJobs.length ? formatMoney(unpaidTotalCents) : "No payment follow-up waiting",
    },
  ];
}

export default function StartWorkPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [integrationAttention, setIntegrationAttention] = useState<any[]>([]);
  const [workspaceSetup, setWorkspaceSetup] = useState<{ activeJobSheetTemplateId?: string | null; bookingPublicEnabled?: boolean | null } | null>(null);
  const [activeLocationId, setActiveLocationId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [activeFilter, setActiveFilter] = useState<"drafts" | "progress" | "ready" | "payment">("drafts");
  const [confirmDraft, setConfirmDraft] = useState<any | null>(null);
  const [deletingDraft, setDeletingDraft] = useState(false);
  useOperationalRefresh(() => setRefreshVersion((current) => current + 1));

  useEffect(() => {
    setActiveLocationId(readActiveLocationId());
    return subscribeActiveLocationId(setActiveLocationId);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      setRequestId(undefined);
      try {
        const [summaryPayload, jobsPayload, workspaceSetupPayload, integrationPayload] = await Promise.all([
          apiFetch("/command-centre/summary"),
          apiFetch(`/jobs?locationId=${encodeURIComponent(activeLocationId)}`).catch(() => []),
          apiFetch("/tenant/settings").catch(() => null),
          apiFetch("/integrations/health").catch(() => []),
        ]);
        setSummary(summaryPayload as Summary);
        setJobs(Array.isArray(jobsPayload) ? jobsPayload : []);
        setWorkspaceSetup(workspaceSetupPayload || null);
        setIntegrationAttention(Array.isArray(integrationPayload) ? integrationPayload.filter((row) => {
          const state = String(row?.status || row?.health || row?.state || "").toLowerCase();
          return state.includes("attention") || state.includes("error") || state.includes("failed") || state.includes("disconnected");
        }) : []);
      } catch (err: any) {
        setError(err?.message || "Failed to load work flow");
        setRequestId(err instanceof ApiError ? err.requestId : undefined);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [activeLocationId, refreshVersion]);

  const jobDrafts = summary?.drafts?.jobs || [];
  const activeJobs = useMemo(
    () => latestByUpdatedAt(jobs.filter((job) => ["OPEN", "SCHEDULED", "IN_PROGRESS"].includes(normalizeStatus(job)))),
    [jobs],
  );
  const completedJobs = useMemo(
    () =>
      latestByUpdatedAt(
        jobs.filter((job) => ["COMPLETED", "INVOICED"].includes(normalizeStatus(job)) && !job?.invoicePaidAt && !job?.archivedAt),
      ),
    [jobs],
  );
  const inProgressJob = activeJobs.find((job) => normalizeStatus(job) === "IN_PROGRESS") || activeJobs[0] || null;
  const latestCompletedJob = completedJobs[0] || null;
  const latestDraft = jobDrafts[0] || null;
  const unpaidJobs = summary?.unpaidJobs || [];
  const getPaidJob = unpaidJobs[0] || null;
  const primaryAction = latestDraft
    ? { label: "Continue draft", href: buildDraftHref(latestDraft), testId: "start-work-primary" }
    : inProgressJob
    ? { label: "Resume live job", href: `/dashboard/jobs/${inProgressJob.id}`, testId: "start-work-primary" }
    : { label: "Open job sheet", href: buildStandardJobHref(), testId: "start-work-primary" };

  const stats = describeWorkQueueState(
    jobDrafts,
    activeJobs,
    completedJobs,
    unpaidJobs,
    Number(summary?.money?.unpaidTotalCents || 0),
  );
  const queueTabs = [
    { key: "drafts" as const, label: "Drafts", count: jobDrafts.length },
    { key: "progress" as const, label: "In progress", count: activeJobs.length },
    { key: "ready" as const, label: "Ready to send", count: completedJobs.length },
    { key: "payment" as const, label: "Payment follow-up", count: unpaidJobs.length },
  ];

  const queueItems = useMemo<LiveWorkQueueItem[]>(() => {
    if (activeFilter === "drafts") {
      return jobDrafts.map((draft) => ({
        id: `draft-${draft.trade || draft.updatedAt}`,
        title: `${String(draft.trade || "WHEELS").toUpperCase()} draft`,
        status: "Draft",
        location: draft?.payload?.formData?.siteLocation || draft?.payload?.formData?.location || "No location",
        assigned: "Unassigned",
        updatedAt: draft.updatedAt,
        href: buildDraftHref(draft),
        action: "Continue",
        draft,
      }));
    }
    if (activeFilter === "progress") {
      return activeJobs.map((job) => ({
        id: job.id,
        title: job.jobRef || job.serviceName || "Job",
        status: normalizeStatus(job),
        location: job.locationName || job.location?.name || "No location",
        assigned: job.assignedUser?.email || job.technicianName || "Unassigned",
        updatedAt: job.updatedAt,
        href: `/dashboard/jobs/${job.id}`,
        action: "Open",
      }));
    }
    if (activeFilter === "ready") {
      return completedJobs.map((job) => ({
        id: job.id,
        title: job.jobRef || job.serviceName || "Completed job",
        status: normalizeStatus(job),
        location: job.locationName || job.location?.name || "No location",
        assigned: job.assignedUser?.email || job.technicianName || "Unassigned",
        updatedAt: job.updatedAt,
        href: `/dashboard/jobs/${job.id}`,
        action: "Send",
      }));
    }
    return unpaidJobs.map((job) => ({
      id: job.id,
      title: job.jobRef || job.serviceName || "Payment follow-up",
      status: "Payment",
      location: job.locationName || job.location?.name || "No location",
      assigned: job.assignedUser?.email || job.technicianName || "Unassigned",
      updatedAt: job.updatedAt,
      href: `/dashboard/jobs/${job.id}`,
      action: "Review",
    }));
  }, [activeFilter, activeJobs, completedJobs, jobDrafts, unpaidJobs]);

  const emptyCopy = {
    drafts: "No drafts.",
    progress: "No jobs in progress.",
    ready: "No jobs ready to send.",
    payment: "No payment follow-up.",
  }[activeFilter];

  async function deleteDraft() {
    if (!confirmDraft) return;
    setDeletingDraft(true);
    setError("");
    try {
      await apiFetch(`/drafts/${encodeURIComponent(`job:${String(confirmDraft.trade || "WHEELS").toUpperCase()}`)}`, { method: "DELETE" });
      setConfirmDraft(null);
      setRefreshVersion((current) => current + 1);
    } catch (err: any) {
      setError(err?.message || "Draft could not be deleted.");
    } finally {
      setDeletingDraft(false);
    }
  }

  if (loading && !summary) {
    return (
      <DashboardShell>
        <LoadingState title="Loading start work" description="Pulling together drafts, live jobs, and payment follow-up." />
      </DashboardShell>
    );
  }

  if (error && !summary) {
    return (
      <DashboardShell>
        <ErrorState
          title="Could not open start work"
          description={error}
          requestId={requestId}
          primaryAction={{ label: "Try again", href: "/dashboard/work" }}
          secondaryAction={{ label: "Open jobs", href: "/dashboard/jobs" }}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Live Work"
          title="Live Work"
          info="Use Live Work to resume drafts, move active jobs forward, send completed work, and follow up payment."
          actions={[
            primaryAction,
            { label: "Start work", href: buildStandardJobHref(), variant: "secondary", testId: "start-work-create" },
          ]}
          stats={stats}
        />

        {integrationAttention[0] ? (
          <section className="card operator-section operator-workFocus operator-workFocus--warning" data-testid="live-work-operating-focus">
            <div className="operator-workFocus__copy">
              <span className="operator-workFocus__eyebrow">Attention</span>
              <h2>Connected tool needs attention</h2>
              <p>{integrationAttention[0]?.name || integrationAttention[0]?.provider || "Open integration health."}</p>
            </div>
            <Link className="button" href="/dashboard/integrations?focus=attention" data-testid="live-work-next-action">
              Open integration
            </Link>
          </section>
        ) : null}

        {!workspaceSetup?.activeJobSheetTemplateId ? (
          <section className="card operator-section" data-testid="start-work-inline-template-setup">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Job sheet template</h2>
              </div>
              <Link className="button secondary" href="/dashboard/settings?section=job-sheet">
                Choose template
              </Link>
            </div>
          </section>
        ) : null}

        <section className="card operator-section" data-testid="start-work-flow">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">
                {activeFilter === "drafts"
                  ? "Drafts"
                  : activeFilter === "progress"
                    ? "In progress"
                    : activeFilter === "ready"
                      ? "Ready to send"
                      : "Payment follow-up"}
              </h2>
            </div>
          </div>

          <div className="live-work-tabs" role="tablist" aria-label="Live Work queue filters" data-testid="live-work-tabs">
            {queueTabs.map((tab) => (
              <button
                key={tab.key}
                className={`live-work-filter ${activeFilter === tab.key ? "active" : ""}`}
                type="button"
                role="tab"
                aria-selected={activeFilter === tab.key}
                onClick={() => setActiveFilter(tab.key)}
                data-testid={`live-work-filter-${tab.key}`}
              >
                {tab.label} {tab.count}
              </button>
            ))}
          </div>

          <div className="live-work-queue" style={{ marginTop: 16 }} data-testid="live-work-queue">
            {queueItems.map((item) => (
              <article className="integration-card live-work-card" key={item.id} data-testid={item.draft ? "start-work-draft-card" : `live-work-card-${item.id}`}>
                <div>
                  <strong>{item.title}</strong>
                  <div className="live-work-card__meta">
                    <span>{item.location}</span>
                    <span>{item.assigned}</span>
                    <span>{item.status}</span>
                    <span>Updated {formatDateTime(item.updatedAt)}</span>
                  </div>
                </div>
                <div className="live-work-card__actions">
                  <Link className="button" href={item.href}>
                    {item.action}
                  </Link>
                  {item.draft ? (
                    <button
                      className="button secondary destructive"
                      type="button"
                      onClick={() => setConfirmDraft(item.draft)}
                      data-testid="draft-delete-open"
                    >
                      Delete draft
                    </button>
                  ) : null}
                  <button className="live-work-overflow" type="button" aria-label={`More actions for ${item.title}`}>
                    ...
                  </button>
                </div>
              </article>
            ))}
            {!queueItems.length ? (
              <EmptyState
                title={emptyCopy}
                description=""
                primaryAction={activeFilter === "drafts" ? { label: "Start work", href: buildStandardJobHref() } : undefined}
              />
            ) : null}
          </div>
        </section>

        {confirmDraft ? (
          <div className="modal-backdrop" role="presentation">
            <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="delete-draft-title" data-testid="draft-delete-confirmation">
              <h2 id="delete-draft-title" style={{ marginTop: 0 }}>Delete draft?</h2>
              <p>
                <strong>{String(confirmDraft.trade || "WHEELS").toUpperCase()} draft</strong>
              </p>
              <p className="muted">
                Last updated {formatDateTime(confirmDraft.updatedAt)}. This removes only your unsubmitted draft and temporary autosave data. Submitted jobs, bookings, invoices, and completed records are not affected.
              </p>
              {error ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button className="button secondary" type="button" onClick={() => setConfirmDraft(null)} disabled={deletingDraft} data-testid="draft-delete-cancel">
                  Cancel
                </button>
                <button className="button destructive" type="button" onClick={() => void deleteDraft()} disabled={deletingDraft} data-testid="draft-delete-confirm">
                  {deletingDraft ? "Deleting..." : "Delete draft"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}
