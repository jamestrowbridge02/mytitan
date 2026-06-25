import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import {
  OperatorPageHeader,
  OperatorStatusBadge,
} from "../../components/ui/operator-page";
import { OperatorActionTile, OperatorChartCard } from "../../components/ui/operator-insights";
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

type NotificationItem = {
  id: string;
  title?: string | null;
  message?: string | null;
  priority?: string | null;
  actionUrl?: string | null;
  isRead?: boolean;
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
      hint: activeJobs.length ? "Live work is ready to resume" : "No live work right now",
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
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [integrationAttention, setIntegrationAttention] = useState<any[]>([]);
  const [workspaceSetup, setWorkspaceSetup] = useState<{ activeJobSheetTemplateId?: string | null; bookingPublicEnabled?: boolean | null } | null>(null);
  const [activeLocationId, setActiveLocationId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [refreshVersion, setRefreshVersion] = useState(0);
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
        const [summaryPayload, jobsPayload, workspaceSetupPayload, notificationPayload, integrationPayload] = await Promise.all([
          apiFetch("/command-centre/summary"),
          apiFetch(`/jobs?locationId=${encodeURIComponent(activeLocationId)}`).catch(() => []),
          apiFetch("/tenant/settings").catch(() => null),
          apiFetch("/notifications").catch(() => []),
          apiFetch("/integrations/health").catch(() => []),
        ]);
        setSummary(summaryPayload as Summary);
        setJobs(Array.isArray(jobsPayload) ? jobsPayload : []);
        setWorkspaceSetup(workspaceSetupPayload || null);
        setNotifications(Array.isArray(notificationPayload) ? notificationPayload : []);
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
  const todayBookings = summary?.todayBookings || [];
  const dueAndOverdueJobs = summary?.dueAndOverdueJobs || [];
  const unreadNotifications = notifications.filter((item) => !item.isRead);
  const unassignedJobs = useMemo(
    () => activeJobs.filter((job) => !job?.assignedUserId && !job?.technicianId),
    [activeJobs],
  );
  const overdueJobs = useMemo(
    () => latestByUpdatedAt([...dueAndOverdueJobs, ...jobs.filter((job) => {
      const due = job?.dueAt || job?.scheduledAt || job?.invoiceDueAt;
      if (!due) return false;
      const dueTime = new Date(due).getTime();
      return !Number.isNaN(dueTime) && dueTime < Date.now() && !job?.invoicePaidAt && !job?.archivedAt;
    })]),
    [dueAndOverdueJobs, jobs],
  );
  const recommendation =
    unreadNotifications[0]
      ? {
          title: unreadNotifications[0].title || "Unread operational update",
          detail: unreadNotifications[0].message || "Open the inbox and take the linked action.",
          href: unreadNotifications[0].actionUrl || "/dashboard/notifications?filter=unread",
          label: "Review update",
          tone: "warning" as const,
        }
      : getPaidJob
      ? {
          title: "Payment follow-up is waiting",
          detail: `${getPaidJob.jobRef || getPaidJob.id} is the next invoice or collection step.`,
          href: `/dashboard/jobs/${getPaidJob.id}`,
          label: "Open payment step",
          tone: "critical" as const,
        }
      : overdueJobs[0]
      ? {
          title: "Overdue work needs ownership",
          detail: `${overdueJobs[0].jobRef || overdueJobs[0].id} is the next overdue work item.`,
          href: `/dashboard/jobs/${overdueJobs[0].id}`,
          label: "Open overdue work",
          tone: "warning" as const,
        }
      : unassignedJobs[0]
      ? {
          title: "Unassigned live work is waiting",
          detail: `${unassignedJobs[0].jobRef || unassignedJobs[0].id} has no assigned team member yet.`,
          href: `/dashboard/scheduling?focus=unassigned`,
          label: "Assign team member",
          tone: "info" as const,
        }
      : todayBookings[0]
      ? {
          title: "Booking pressure is visible today",
          detail: `${todayBookings.length} booking${todayBookings.length === 1 ? "" : "s"} on today's operational path.`,
          href: "/dashboard/bookings",
          label: "Open bookings",
          tone: "info" as const,
        }
      : integrationAttention[0]
      ? {
          title: "Connected tool needs attention",
          detail: integrationAttention[0]?.name || integrationAttention[0]?.provider || "Open integration health.",
          href: "/dashboard/integrations?focus=attention",
          label: "Open integration",
          tone: "warning" as const,
        }
      : {
          title: "Start the next clean work item",
          detail: "No urgent attention is waiting, so open the next job sheet from here.",
          href: buildStandardJobHref(),
          label: "Open job sheet",
          tone: "success" as const,
        };

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
  const workflowRows = [
    {
      label: "Drafts to resume",
      value: jobDrafts.length,
      tone: "warning" as const,
      detail: jobDrafts.length ? "Saved work exists and should be resumed before creating duplicates." : "No draft jobs are waiting.",
    },
    {
      label: "Live jobs",
      value: activeJobs.length,
      tone: "info" as const,
      detail: activeJobs.length ? "These jobs are already in the live queue." : "No jobs are currently in progress.",
    },
    {
      label: "Ready to share",
      value: completedJobs.length,
      tone: "success" as const,
      detail: completedJobs.length ? "Completed jobs need customer handoff and service-record review next." : "No completed jobs are waiting to be shared.",
    },
    {
      label: "Payment follow-up",
      value: unpaidJobs.length,
      tone: unpaidJobs.length ? "critical" as const : "neutral" as const,
      detail: unpaidJobs.length
        ? `${formatMoney(Number(summary?.money?.unpaidTotalCents || 0))} is still awaiting payment follow-up.`
        : "No unpaid jobs are waiting.",
    },
  ];

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
          title="Daily operating home"
          subtitle="One surface for active work, booking pressure, assignment, notifications, and payment follow-up."
          actions={[
            primaryAction,
            { label: "Open guided form", href: "/dashboard/jobs/new?guided=1&entry=work", variant: "secondary" },
            { label: "Open bookings", href: "/dashboard/bookings", variant: "secondary" },
            { label: "Open all jobs", href: "/dashboard/jobs", variant: "secondary" },
          ]}
          stats={stats}
          shortcuts={["Start in the full job sheet first", "Use the guided form when someone needs extra structure"]}
        />

        <section className={`card operator-section operator-workFocus operator-workFocus--${recommendation.tone}`} data-testid="live-work-operating-focus">
          <div className="operator-workFocus__copy">
            <span className="operator-workFocus__eyebrow">Next best action</span>
            <h2>{recommendation.title}</h2>
            <p>{recommendation.detail}</p>
          </div>
          <Link className="button" href={recommendation.href} data-testid="live-work-next-action">
            {recommendation.label}
          </Link>
        </section>

        <section className="operator-quickRail" data-testid="live-work-priority-rail">
          <OperatorActionTile
            title="Unread attention"
            description={unreadNotifications.length ? `${unreadNotifications.length} unread operational update${unreadNotifications.length === 1 ? "" : "s"} waiting.` : "No unread operational updates."}
            icon="mail"
            tone={unreadNotifications.length ? "warning" : "success"}
            action={<Link className="button secondary" href="/dashboard/notifications?filter=unread">Open inbox</Link>}
          />
          <OperatorActionTile
            title="Assignments"
            description={unassignedJobs.length ? `${unassignedJobs.length} active job${unassignedJobs.length === 1 ? "" : "s"} have no assigned team member.` : "Active work has visible ownership."}
            icon="calendar"
            tone={unassignedJobs.length ? "warning" : "success"}
            action={<Link className="button secondary" href="/dashboard/scheduling?focus=unassigned">Review assignment</Link>}
          />
          <OperatorActionTile
            title="Payment follow-up"
            description={unpaidJobs.length ? `${formatMoney(Number(summary?.money?.unpaidTotalCents || 0))} still needs invoice or payment follow-up.` : "No unpaid work is waiting."}
            icon="billing"
            tone={unpaidJobs.length ? "critical" : "success"}
            action={<Link className="button secondary" href={getPaidJob ? `/dashboard/jobs/${getPaidJob.id}` : "/dashboard/finance"}>Open finance work</Link>}
          />
          <OperatorActionTile
            title="Booking pressure"
            description={todayBookings.length ? `${todayBookings.length} booking${todayBookings.length === 1 ? "" : "s"} connected to today's operating rhythm.` : "No booking pressure surfaced for today."}
            icon="flow"
            tone={todayBookings.length ? "info" : "success"}
            action={<Link className="button secondary" href="/dashboard/bookings">Open bookings</Link>}
          />
        </section>

        {!workspaceSetup?.activeJobSheetTemplateId ? (
          <section className="card operator-section" data-testid="start-work-inline-template-setup">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Job sheet setup still needs one decision</h2>
                <p className="operator-section__subtitle">Apply a real job-sheet template before the team relies on the live work flow.</p>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
              <p className="muted" style={{ margin: 0, maxWidth: 680 }}>
                The job sheet stays available, but the clean next move is to choose the template the team should standardize on.
              </p>
              <Link className="button secondary" href="/dashboard/settings?section=job-sheet">
                Choose job sheet template
              </Link>
            </div>
          </section>
        ) : null}

        <section className="card operator-section" data-testid="start-work-flow">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Recommended flow</h2>
              <p className="operator-section__subtitle">Keep the strongest next step visible from first open to payment.</p>
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <OperatorActionTile
              title="1. Open full job sheet"
              description="Start the real job first. Use the guided form only when someone needs step-by-step help."
              icon="work"
              tone="info"
              action={
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link className="button" href={buildStandardJobHref()} data-testid="start-work-create">Open full job sheet</Link>
                  <Link className="button secondary" href="/dashboard/jobs/new?guided=1&entry=work" data-testid="start-work-guided">Use guided form</Link>
                </div>
              }
            />

            <OperatorActionTile
              title="2. Open from bookings"
              description="Turn confirmed visits into linked jobs, then open the real work item without breaking the route."
              icon="calendar"
              tone="warning"
              action={<Link className="button secondary" href="/dashboard/bookings" data-testid="start-work-bookings">Review bookings</Link>}
            />

            <OperatorActionTile
              title="3. Complete work"
              description={
                inProgressJob
                  ? `${inProgressJob.jobRef || inProgressJob.id} is ready to resume inside the job sheet.`
                  : "Live jobs show up here as soon as work moves into the active queue."
              }
              icon="flow"
              tone="info"
              badge={inProgressJob ? <OperatorStatusBadge label="Live queue" tone="info" /> : undefined}
              action={
                <Link
                  className="button secondary"
                  href={inProgressJob ? `/dashboard/jobs/${inProgressJob.id}` : "/dashboard/jobs"}
                  data-testid="start-work-do-work"
                >
                  {inProgressJob ? "Resume full job sheet" : "See active jobs"}
                </Link>
              }
            />

            <OperatorActionTile
              title="4. Add photos and signatures"
              description={latestCompletedJob ? `${latestCompletedJob.jobRef || latestCompletedJob.id} is ready for sign-off and customer handoff review.` : "Finished jobs show up here once proof and sign-off are in."}
              icon="spark"
              tone="success"
              badge={latestCompletedJob ? <OperatorStatusBadge label="Ready to share" tone="success" /> : undefined}
              action={
                <Link
                  className="button secondary"
                  href={latestCompletedJob ? `/dashboard/jobs/${latestCompletedJob.id}` : "/dashboard/jobs"}
                  data-testid="start-work-proof"
                >
                  {latestCompletedJob ? "Review completion" : "Review proof and sign-off"}
                </Link>
              }
            />

            <OperatorActionTile
              title="5. Send to customer"
              description="Keep the customer page, summary, and send action tied to the submitted job."
              icon="mail"
              tone="success"
              action={
                <Link
                  className="button secondary"
                  href={latestCompletedJob ? `/dashboard/jobs/${latestCompletedJob.id}` : "/dashboard/jobs"}
                  data-testid="start-work-send"
                >
                  Finish and send
                </Link>
              }
            />

            <OperatorActionTile
              title="6. Create invoice or submit for approval"
              description={
                getPaidJob
                  ? `${getPaidJob.jobRef || getPaidJob.id} still needs invoice or payment follow-up.`
                  : "Completed work that needs money or approval will appear here."
              }
              icon="billing"
              tone={getPaidJob ? "critical" : "neutral"}
              badge={getPaidJob ? <OperatorStatusBadge label="Needs payment" tone="critical" /> : undefined}
              action={
                <Link
                  className="button secondary"
                  href={getPaidJob ? `/dashboard/jobs/${getPaidJob.id}` : "/dashboard/billing/readiness"}
                  data-testid="start-work-get-paid"
                >
                  {getPaidJob ? "Review invoice or payment next step" : "Review billing setup"}
                </Link>
              }
            />
          </div>
        </section>

        <OperatorChartCard
          title="Queue breakdown"
          description="Decide whether to resume saved work, push live jobs forward, complete customer handoff, or chase payment next."
          annotation="Authoritative counts"
          icon="work"
          rows={workflowRows}
          testId="start-work-queue-chart"
        />

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Pick up the work</h2>
              <p className="operator-section__subtitle">Resume the exact draft, live job, customer handoff, or payment follow-up that needs attention next.</p>
            </div>
          </div>

          <div className="list">
            {latestDraft ? (
              <div className="integration-card" data-testid="start-work-draft-card">
                <div>
                  <strong>Continue draft</strong>
                  <p className="muted" style={{ margin: "4px 0 0 0" }}>
                    Updated {formatDateTime(latestDraft.updatedAt)} {latestDraft.trade ? `• ${latestDraft.trade}` : ""}
                  </p>
                </div>
                <Link className="button" href={buildDraftHref(latestDraft)}>
                  Resume draft
                </Link>
              </div>
            ) : null}

            {inProgressJob ? (
              <div className="integration-card" data-testid="start-work-active-job-card">
                <div>
                  <strong>{inProgressJob.jobRef || inProgressJob.id}</strong>
                  <p className="muted" style={{ margin: "4px 0 0 0" }}>
                    {inProgressJob.customerName || "Customer"} • {normalizeStatus(inProgressJob)} • Updated {formatDateTime(inProgressJob.updatedAt)}
                  </p>
                </div>
                <Link className="button secondary" href={`/dashboard/jobs/${inProgressJob.id}`}>
                  Resume active job
                </Link>
              </div>
            ) : null}

            {latestCompletedJob ? (
              <div className="integration-card" data-testid="start-work-complete-card">
                <div>
                  <strong>{latestCompletedJob.jobRef || latestCompletedJob.id}</strong>
                  <p className="muted" style={{ margin: "4px 0 0 0" }}>
                    {latestCompletedJob.customerName || "Customer"} • Service record, send, and payment handoff are next
                  </p>
                </div>
                <Link className="button secondary" href={`/dashboard/jobs/${latestCompletedJob.id}`}>
                  Finish and send
                </Link>
              </div>
            ) : null}

            {getPaidJob ? (
              <div className="integration-card" data-testid="start-work-payment-card">
                <div>
                  <strong>{getPaidJob.jobRef || getPaidJob.id}</strong>
                  <p className="muted" style={{ margin: "4px 0 0 0" }}>
                    {getPaidJob.customerName || "Customer"} • Needs payment follow-up • {formatMoney(Number(getPaidJob.totalCents || 0), getPaidJob.currency || "GBP")}
                  </p>
                </div>
                <Link className="button secondary" href={`/dashboard/jobs/${getPaidJob.id}`}>
                  Get paid
                </Link>
              </div>
            ) : null}

            {!latestDraft && !inProgressJob && !latestCompletedJob && !getPaidJob ? (
              <EmptyState
                eyebrow="You’re clear for now"
                title="No work is waiting right now"
                description="Open the next job sheet when you are ready. This page becomes the calm return point for drafts, handoff, and payment follow-up."
                primaryAction={{ label: "Open full job sheet", href: buildStandardJobHref() }}
                secondaryAction={{ label: "Use guided form", href: "/dashboard/jobs/new?guided=1&entry=work" }}
              />
            ) : null}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
