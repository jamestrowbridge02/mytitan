import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { DashboardShell } from '../../components/dashboard-shell';
import { GuidedTourOverlay } from '../../components/guided-tour-overlay';
import { GuidedSetupProgress } from '../../components/guided-setup-progress';
import { EmptyState } from '../../components/states/EmptyState';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';
import { OperatorActionTile, OperatorChartCard, OperatorInsightIcon } from '../../components/ui/operator-insights';
import { OperatorStatusBadge } from '../../components/ui/operator-page';
import { ApiError, apiFetch, setToken } from '../../lib/api';
import {
  isCommandCentreEnabled,
  isCommandCentreV1Enabled,
  isDemoTourV1Enabled,
  isGuidedEverywhereV1Enabled,
  isGuidedSetupV2Enabled,
  isPublicDemoEnabled,
} from '../../lib/feature-flags';
import { getCommandCentreHref } from '../../lib/business-config';
import { useTenantSettings } from '../../lib/tenant-settings';
import { Skeleton } from '../../components/ui/Skeleton';

const coherenceOn =
  String(process.env.NEXT_PUBLIC_MYTITAN_UI_COHERENCE_V1 || "").trim().toLowerCase() === "on" ||
  String(process.env.NEXT_PUBLIC_MYTITAN_UI_COHERENCE_V1 || "").trim().toLowerCase() === "true" ||
  String(process.env.NEXT_PUBLIC_MYTITAN_UI_COHERENCE_V1 || "").trim().toLowerCase() === "1";

type Summary = {
  quickActions: Array<{ key: string; label: string; href: string }>;
  todayBookings: any[];
  dueAndOverdueJobs: any[];
  unpaidJobs: any[];
  drafts: { jobs: any[]; crm: any[] };
  money: { unpaidCount: number; unpaidTotalCents: number; subscriptionStatus: string };
  setup: { guidedSetupCompletedAt?: string | null; onboardingCompleted?: boolean; onboardingStep?: number };
};

type JourneyItem = {
  key: string;
  title: string;
  description: string;
  completed: boolean;
  href: string;
};

type WorkspaceArea = {
  key: string;
  title: string;
  description: string;
  href: string;
};

type ChecklistSummary = {
  completedCount: number;
  total: number;
  firstValueJourney: JourneyItem[];
  workspaceAreas: WorkspaceArea[];
  recommendedNextAction?: {
    title: string;
    description: string;
    href: string;
  } | null;
  counts?: {
    jobsCreated?: number;
    jobsCompleted?: number;
    serviceRecords?: number;
  } | null;
};

function canAccessDashboardHref(
  href: string | undefined,
  permissions: Record<string, boolean> | null | undefined,
) {
  if (!href) return true;
  const parsed = new URL(href, 'http://mytitan.local');
  const pathname = parsed.pathname;
  if (pathname.startsWith('/dashboard/billing')) return Boolean(permissions?.['billing.manage']);
  if (pathname.startsWith('/dashboard/finance')) return Boolean(permissions?.['billing.manage']);
  if (pathname.startsWith('/dashboard/revenue')) return Boolean(permissions?.['billing.manage']);
  if (pathname.startsWith('/dashboard/quotes')) return Boolean(permissions?.['billing.manage']);
  if (pathname.startsWith('/dashboard/users')) return Boolean(permissions?.['users.invite'] || permissions?.['users.role_assign']);
  if (pathname.startsWith('/dashboard/portal')) return Boolean(permissions?.['portal.manage']);
  if (pathname.startsWith('/dashboard/technician')) return Boolean(permissions?.['technician.execute']);
  if (pathname.startsWith('/dashboard/analytics')) return Boolean(permissions?.['dashboard.view_intelligence']);
  if (pathname.startsWith('/dashboard/compliance')) return Boolean(permissions?.['dashboard.view_intelligence']);
  if (pathname.startsWith('/dashboard/intelligence')) return Boolean(permissions?.['dashboard.view_intelligence']);
  if (pathname.startsWith('/dashboard/settings')) return Boolean(permissions?.['settings.manage']);
  return true;
}

function money(cents: number, currency = 'GBP') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format((cents || 0) / 100);
}

function formatMoneyGBP(value: number) {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      maximumFractionDigits: 0,
    }).format(value || 0);
  } catch {
    return `£${Math.round(value || 0)}`;
  }
}

function describeDashboardJobState(job: any) {
  const status = String(job?.status || '').toUpperCase();
  if (status === 'COMPLETED') return 'Ready to share next';
  if (status === 'IN_PROGRESS') return 'Live work in progress';
  if (job?.invoiceDueAt && !job?.invoicePaidAt) return 'Needs payment follow-up';
  return 'Needs attention next';
}

function describeDashboardBookingState(booking: any) {
  const startsAt = booking?.startsAt ? new Date(booking.startsAt) : null;
  const isToday =
    startsAt &&
    !Number.isNaN(startsAt.getTime()) &&
    startsAt.toDateString() === new Date().toDateString();
  if (booking?.jobId) return isToday ? 'Linked to today\'s work' : 'Linked to a job';
  return isToday ? 'Ready to convert today' : 'Waiting to be linked';
}

export default function Dashboard() {
  const router = useRouter();
  const { settings } = useTenantSettings();
  const commandCentreHref = getCommandCentreHref(settings);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [checklist, setChecklist] = useState<ChecklistSummary | null>(null);
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const commandCentreEnabled = isCommandCentreEnabled() || isCommandCentreV1Enabled();
  const guidedSetupEnabled = isGuidedSetupV2Enabled();
  const demoTourEnabled = isDemoTourV1Enabled();
  const guidedEverywhereEnabled = isGuidedEverywhereV1Enabled();

  useEffect(() => {
    if (!router.isReady) return;
    if (!isPublicDemoEnabled()) return;
    const token = router.query.demo_token;
    if (typeof token === 'string' && token.trim()) {
      setToken(token.trim());
      router.replace('/dashboard');
    }
  }, [router.isReady, router.query.demo_token]);

  const load = async () => {
    setLoading(true);
    setError('');
    setRequestId(undefined);
    try {
      const [s, m, c] = await Promise.all([
        apiFetch('/command-centre/summary'),
        apiFetch('/me').catch(() => null),
        apiFetch('/setup/checklist').catch(() => null),
      ]);
      setSummary(s as Summary);
      setMe(m);
      setChecklist(c as ChecklistSummary | null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard');
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const drafts = useMemo(() => {
    const jobs = summary?.drafts?.jobs || [];
    const crm = summary?.drafts?.crm || [];
    return [
      ...jobs.map((d) => ({ ...d, kind: 'Job draft', href: `/dashboard/jobs/new?guided=1&resumeTrade=${encodeURIComponent(d.trade || 'WHEELS')}&entry=work` })),
      ...crm.map((d) => ({ ...d, kind: 'CRM draft', href: d.tradeAccountId ? `/dashboard/trade-accounts/${d.tradeAccountId}` : '/dashboard/trade-accounts' })),
    ];
  }, [summary]);

  const continueDraft = drafts.find((item: any) => item.kind === "Job draft") || null;
  const finishAndSendJob = (summary?.dueAndOverdueJobs || []).find((job: any) => String(job?.status || "").toUpperCase() === "COMPLETED") || null;
  const getPaidJob = (summary?.unpaidJobs || [])[0] || null;
  const accessibleChecklist = useMemo(() => {
    if (!checklist) return null;
    const firstValueJourney = (checklist.firstValueJourney || []).filter((item) =>
      canAccessDashboardHref(item.href, me?.permissions),
    );
    const workspaceAreas = (checklist.workspaceAreas || []).filter((item) =>
      canAccessDashboardHref(item.href, me?.permissions),
    );
    const recommendedNextAction =
      checklist.recommendedNextAction && canAccessDashboardHref(checklist.recommendedNextAction.href, me?.permissions)
        ? checklist.recommendedNextAction
        : firstValueJourney.find((item) => !item.completed) ||
          workspaceAreas[0] || {
            title: 'Open dashboard',
            description: 'Your business is ready to keep work moving.',
            href: '/dashboard',
          };
    return {
      ...checklist,
      firstValueJourney,
      workspaceAreas,
      recommendedNextAction,
    };
  }, [checklist, me?.permissions]);

  const firstValueProgress = useMemo(() => {
    const journey = accessibleChecklist?.firstValueJourney || [];
    const completed = journey.filter((item) => item.completed).length;
    return {
      completed,
      total: journey.length,
      next: journey.find((item) => !item.completed) || null,
    };
  }, [accessibleChecklist]);

  const canManageBilling = Boolean(me?.permissions?.["billing.manage"]);
  const ownerSetupShortcuts = useMemo(
    () =>
      [
        {
          title: "Launch Control",
          description: "See what is live, what still needs setup, and what must stay blocked before launch.",
          href: "/dashboard/settings/launch-control",
        },
        {
          title: "Billing and job packs",
          description: "Review subscriptions, job-pack gating, and payment setup.",
          href: "/dashboard/billing?section=job-packs",
        },
        {
          title: "Booking settings",
          description: "Turn on public booking, confirm working hours, and keep spam protection in place.",
          href: "/dashboard/settings?tab=bookings&section=booking-setup",
        },
        {
          title: "Business settings",
          description: "Update sender details, customer feedback prompts, and team alerts.",
          href: "/dashboard/settings?section=guided-setup-hub",
        },
      ].filter((item) => canAccessDashboardHref(item.href, me?.permissions)),
    [me?.permissions],
  );
  const todayDecisionRows = useMemo(
    () => [
      {
        label: 'Bookings today',
        value: Array.isArray(summary?.todayBookings) ? summary.todayBookings.length : 0,
        tone: 'warning' as const,
        detail: 'Use this to decide whether the day starts from bookings or already-live jobs.',
      },
      {
        label: 'Jobs needing action',
        value: Array.isArray(summary?.dueAndOverdueJobs) ? summary.dueAndOverdueJobs.length : 0,
        tone: 'info' as const,
        detail: 'Due and overdue jobs are the current delivery pressure.',
      },
      {
        label: 'Unpaid jobs',
        value: Array.isArray(summary?.unpaidJobs) ? summary.unpaidJobs.length : 0,
        tone: (summary?.unpaidJobs || []).length ? 'critical' as const : 'neutral' as const,
        detail: 'Use this to decide whether customer follow-up should pivot to payment next.',
      },
      {
        label: 'Drafts to resume',
        value: drafts.length,
        tone: drafts.length ? 'warning' as const : 'neutral' as const,
        detail: 'Saved drafts show whether the team should resume work before creating more.',
      },
    ],
    [drafts.length, summary?.dueAndOverdueJobs, summary?.todayBookings, summary?.unpaidJobs],
  );

  const dashboardMetrics = [
    {
      label: 'Jobs today',
      value: String(
        Number(
          (summary as any)?.jobsToday ??
            (summary as any)?.todayJobs ??
            (summary as any)?.counts?.jobsToday ??
            0
        )
      ),
      href: '/dashboard/jobs',
      action: 'Open jobs',
    },
    {
      label: 'Revenue today',
      value: formatMoneyGBP(
        Number(
          (summary as any)?.revenueToday ??
            (summary as any)?.todayRevenue ??
            (summary as any)?.counts?.revenueToday ??
            0
        )
      ),
      href: '/dashboard/finance',
      action: 'Open finance',
    },
    {
      label: 'Technicians active',
      value: String(
        Number(
          (summary as any)?.techniciansActive ??
            (summary as any)?.activeTechnicians ??
            (summary as any)?.counts?.techniciansActive ??
            0
        )
      ),
      href: '/dashboard/technician',
      action: 'Open field team',
    },
    {
      label: 'Pending approvals',
      value: String(
        Number(
          (summary as any)?.pendingApprovals ??
            (summary as any)?.approvalsPending ??
            (summary as any)?.counts?.pendingApprovals ??
            0
        )
      ),
      href: '/dashboard/portal',
      action: 'Open approvals',
    },
  ];
  const accessibleDashboardMetrics = dashboardMetrics.filter((metric) =>
    canAccessDashboardHref(metric.href, me?.permissions),
  );

  const executiveMoments = useMemo(() => {
    const bookingsToday = Array.isArray(summary?.todayBookings) ? summary.todayBookings.length : 0;
    const jobsNeedingAction = Array.isArray(summary?.dueAndOverdueJobs) ? summary.dueAndOverdueJobs.length : 0;
    const unpaidJobs = Array.isArray(summary?.unpaidJobs) ? summary.unpaidJobs.length : 0;
    const items: Array<{ tone: "success" | "info" | "warning"; title: string; detail: string }> = [];

    if (bookingsToday === 0 && jobsNeedingAction === 0 && unpaidJobs === 0) {
      items.push({
        tone: "success",
        title: "Everything running normally",
        detail: "No work, payment, or customer follow-up is pressing right now.",
      });
    } else if (finishAndSendJob) {
      items.push({
        tone: "success",
        title: "Completed work is ready to send",
        detail: `${finishAndSendJob.jobRef || "A finished job"} can move straight into the customer handoff.`,
      });
    } else if (getPaidJob) {
      items.push({
        tone: "warning",
        title: "Payment follow-up is ready",
        detail: `${getPaidJob.jobRef || "An unpaid job"} is the clearest commercial next step.`,
      });
    } else if (bookingsToday > 0) {
      items.push({
        tone: "info",
        title: "Today starts from live bookings",
        detail: `${bookingsToday} booking${bookingsToday === 1 ? "" : "s"} can be turned into ready work from one calm view.`,
      });
    }

    if (firstValueProgress.next) {
      items.push({
        tone: "info",
        title: "Keep the main path moving",
        detail: `${firstValueProgress.completed}/${firstValueProgress.total} steps are complete. ${firstValueProgress.next.title} matters next.`,
      });
    }

    if (!drafts.length) {
      items.push({
        tone: "success",
        title: "No unfinished drafts are waiting",
        detail: "The workspace is clear of paused work right now.",
      });
    }

    return items.slice(0, 3);
  }, [drafts.length, finishAndSendJob, firstValueProgress.completed, firstValueProgress.next, firstValueProgress.total, getPaidJob, summary?.dueAndOverdueJobs, summary?.todayBookings, summary?.unpaidJobs]);

  if (!commandCentreEnabled) {
  return (
      <DashboardShell>
  <div className="dashboard-home-premium">
<div className="dashboard-premium-shell">
        <EmptyState title="Dashboard unavailable" description="This workspace is not using the dashboard right now." />
      </div>
  </div>
</DashboardShell>
    );
  }

  if (loading && !summary) {
    return (
      <DashboardShell>
          <div className="dashboard-home-premium">
        {coherenceOn ? (
          <div className="rounded-2xl border border-border/60 bg-[color:var(--surface-1)] p-5 shadow-sm dashboard-home-hero" role="status" aria-live="polite">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72" />
                </div>
              </div>
              <Skeleton className="h-24 w-full rounded-2xl" />
            </div>
          </div>
        ) : (
          <>
            <div className="dashboard-metrics-grid">
              {accessibleDashboardMetrics.map((metric) => (
                <Link key={metric.label} className="card dashboard-metric-card mt-linkCard" href={metric.href} data-testid={`dashboard-kpi-${metric.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                  <div className="dashboard-metric-label">{metric.label}</div>
                  <div className="dashboard-metric-value">{metric.value}</div>
                  <span className="mt-linkCard__action">{metric.action}</span>
                </Link>
              ))}
            </div>

            <div className="dashboard-home-loading">
              <LoadingState title="Loading your dashboard" description="Bringing in today&apos;s work and next steps." />
            </div>
          </>
        )}
          </div>
      </DashboardShell>
    );
  }

  if (error && !summary) {
    return (
      <DashboardShell>
          <div className="dashboard-home-premium">
            <ErrorState
          title="We couldn't open your dashboard"
          description="Try again, or open jobs if you need to keep moving."
          requestId={requestId}
          primaryAction={{ label: 'Try again', onClick: load }}
          secondaryAction={{ label: 'Go to jobs', href: '/dashboard/jobs' }}
        />
          </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="dashboard-home-premium">
      <GuidedTourOverlay enabled={demoTourEnabled} isDemoUser={Boolean(me?.demoUser || me?.email === '@mytitan.co.uk')} />
      <div className="card dashboard-home-hero dashboard-home-canvas operator-page">
        <div className="operator-page__hero">
          <div className="operator-page__copy">
            <div className="operator-page__eyebrow">Dashboard</div>
            <div className="dashboard-home-heroGrid">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                <OperatorInsightIcon icon="flow" tone="info" label="Daily workflow overview" />
                <div>
                  <h1 className="dashboard-home-title" style={{ marginTop: 0 }}>Keep work moving from the first job sheet to payment</h1>
                  <p className="dashboard-home-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
                    {firstValueProgress.next
                      ? `Your core workflow is ${firstValueProgress.completed}/${firstValueProgress.total} complete. Next: ${firstValueProgress.next.title}.`
                      : 'Open the job, finish the work, share the result, and keep payment follow-up moving from one calm view.'}
                  </p>
                </div>
              </div>
              <div className="dashboard-home-commandNote">
                <span className="dashboard-home-commandNote__label">Strongest next move</span>
                <strong className="dashboard-home-commandNote__title">
                  {accessibleChecklist?.recommendedNextAction?.title || 'Open the job sheet'}
                </strong>
                <p className="dashboard-home-commandNote__copy">
                  {accessibleChecklist?.recommendedNextAction?.description || 'Start with the canonical job path, then let the rest of the day follow from that record.'}
                </p>
                <Link className="button secondary" href={accessibleChecklist?.recommendedNextAction?.href || '/dashboard/work'}>
                  Open next move
                </Link>
              </div>
            </div>
          </div>
        </div>
        <p className="dashboard-home-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
          Start with the strongest move, keep the rest nearby, and only open extra detail when the day needs it.
        </p>
        {executiveMoments.length ? (
          <div className="dashboard-home-momentStrip" data-testid="dashboard-moment-strip">
            {executiveMoments.map((moment) => (
              <div key={moment.title} className={`dashboard-home-moment dashboard-home-moment--${moment.tone}`}>
                <strong>{moment.title}</strong>
                <p>{moment.detail}</p>
              </div>
            ))}
          </div>
        ) : null}
        <div className="dashboard-home-primaryActions" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
          <Link className="button" href="/dashboard/work" data-testid="dashboard-start-work">
            Open job sheet
          </Link>
          {continueDraft ? <Link className="button secondary" href={continueDraft.href}>Continue draft</Link> : null}
          {finishAndSendJob ? <Link className="button secondary" href={`/dashboard/jobs/${finishAndSendJob.id}`}>Finish and send</Link> : null}
          {getPaidJob ? <Link className="button secondary" href={`/dashboard/jobs/${getPaidJob.id}`}>Get paid</Link> : <Link className="button secondary" href={commandCentreHref}>See live work</Link>}
        </div>
      </div>
      <details className="dashboard-home-details dashboard-home-details--quiet" style={{ marginBottom: 16 }}>
        <summary>Open setup progress</summary>
        <div style={{ marginTop: 12 }}>
          <GuidedSetupProgress enabled={guidedSetupEnabled} incomplete={!settings?.guidedSetupCompletedAt} />
        </div>
      </details>

      <div className="dashboard-home-overviewGrid">
        <div className="dashboard-home-momentum dashboard-home-canvas">
          <div className="dashboard-home-sectionKick">Business momentum</div>
          <div className="dashboard-metrics-grid">
            {accessibleDashboardMetrics.map((metric) => (
              <Link key={metric.label} className="card dashboard-metric-card mt-linkCard" href={metric.href} data-testid={`dashboard-kpi-${metric.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                <div className="dashboard-metric-label">{metric.label}</div>
                <div className="dashboard-metric-value">{metric.value}</div>
                <span className="mt-linkCard__action">{metric.action}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="dashboard-home-picture dashboard-home-canvas">
          <OperatorChartCard
            title="Today&apos;s operating picture"
            description="Use this to decide whether the next move is booking conversion, live delivery, customer handoff, or payment follow-up."
            annotation="Live counts"
            icon="work"
            rows={todayDecisionRows}
            testId="dashboard-workload-chart"
          />
        </div>
      </div>

      <div className="dashboard-home-lowerGrid">
        <div className="card dashboard-home-focusPanel" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>What needs attention</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Keep the next move obvious. Start with the strongest action, then open the rest only if the day needs more context.
        </p>
        {(() => {
          const actions = [
            { key: 'start_work', label: 'Start Work', href: '/dashboard/work' },
            { key: 'open_bookings', label: 'Open bookings', href: '/dashboard/bookings' },
            ...(continueDraft ? [{ key: 'continue_draft', label: 'Continue draft', href: continueDraft.href }] : []),
            ...(finishAndSendJob ? [{ key: 'finish_send', label: 'Finish and send', href: `/dashboard/jobs/${finishAndSendJob.id}` }] : []),
            ...(getPaidJob ? [{ key: 'get_paid', label: 'Get paid', href: `/dashboard/jobs/${getPaidJob.id}` }] : []),
            ...((summary?.quickActions || [
              { key: 'new_booking', label: 'New booking', href: '/dashboard/bookings' },
              { key: 'new_customer', label: 'New customer', href: '/dashboard/trade-accounts' },
            ]).filter((action: any) => !['start_work', 'new_job', 'open_bookings'].includes(String(action?.key || '')))),
          ];
          const visibleActions = actions.slice(0, 3);
          const hiddenActions = actions.slice(3);
          return (
            <>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {visibleActions.map((action, index) => (
                  <Link key={action.key} className={index === 0 ? 'button' : 'button secondary'} href={action.href} style={{ textAlign: 'center' }}>{action.label}</Link>
                ))}
              </div>
              {hiddenActions.length ? (
                <details className="dashboard-home-details" style={{ marginTop: 14 }}>
                  <summary>Open more actions</summary>
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 12 }}>
                    {hiddenActions.map((action) => (
                      <Link key={action.key} className="button secondary" href={action.href} style={{ textAlign: 'center' }}>{action.label}</Link>
                    ))}
                  </div>
                </details>
              ) : null}
            </>
          );
        })()}
        {error ? (
          <ErrorState
            title="Some data may be out of date"
            description={error}
            requestId={requestId}
            primaryAction={{ label: 'Refresh', onClick: load }}
          />
        ) : null}
      </div>

      <details className="dashboard-home-details dashboard-home-details--rest dashboard-home-rest" style={{ marginBottom: 16 }} open>
        <summary>Open the rest of the workspace</summary>
        <div style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          {ownerSetupShortcuts.length ? (
            <div className="card dashboard-home-secondaryCanvas">
              <h2 style={{ marginTop: 0 }}>Owner setup</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                Keep owner-only setup nearby without turning the main dashboard into a running checklist.
              </p>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                {ownerSetupShortcuts.map((item) => (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="integration-card mt-linkCard"
                    data-testid={`dashboard-owner-shortcut-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  >
                    <strong>{item.title}</strong>
                    <p className="muted" style={{ margin: "8px 0 0 0" }}>{item.description}</p>
                    <span className="mt-linkCard__action">Open</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {accessibleChecklist?.recommendedNextAction ? (
            <div className="card dashboard-home-secondaryCanvas" data-testid="dashboard-setup-hub">
              <h2 style={{ marginTop: 0 }}>Setup journey</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                Start with one exact setup action, then resume from the next guided step instead of jumping between unrelated pages.
              </p>
              <div className="mt-guided-setup-grid">
                <Link href={accessibleChecklist.recommendedNextAction.href} className="mt-guided-setup-card mt-linkCard" data-testid="dashboard-setup-recommended">
                  <span className="mt-guided-setup-card__eyebrow">Recommended next action</span>
                  <strong>{accessibleChecklist.recommendedNextAction.title}</strong>
                  <p className="muted" style={{ margin: 0 }}>{accessibleChecklist.recommendedNextAction.description}</p>
                  <span className="mt-linkCard__action">Open next step</span>
                </Link>
                {(accessibleChecklist.firstValueJourney || []).slice(0, 3).map((item) => (
                  <Link key={item.key} href={item.href} className="mt-guided-setup-card mt-linkCard" data-testid={`dashboard-setup-step-${item.key}`}>
                    <span className="mt-guided-setup-card__eyebrow">{item.completed ? 'Completed' : 'Continue here'}</span>
                    <strong>{item.title}</strong>
                    <p className="muted" style={{ margin: 0 }}>{item.description}</p>
                    <span className="mt-linkCard__action">{item.completed ? 'Review step' : 'Open step'}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {accessibleChecklist?.firstValueJourney?.length ? (
            <div className="card dashboard-home-secondaryCanvas">
              <h2 style={{ marginTop: 0 }}>Full work path</h2>
              <p className="muted">
                Keep the route clear: create the job, do the work, share the result, then follow through to payment and repeat work.
              </p>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {accessibleChecklist.firstValueJourney.map((item) => (
                  <OperatorActionTile
                    key={item.key}
                    title={item.title}
                    description={item.description}
                    icon={
                      item.key.includes('booking')
                        ? 'calendar'
                        : item.key.includes('payment')
                          ? 'billing'
                          : item.key.includes('customer')
                            ? 'customers'
                            : 'work'
                    }
                    tone={item.completed ? 'success' : 'warning'}
                    badge={<OperatorStatusBadge label={item.completed ? 'Done' : 'Next'} tone={item.completed ? 'success' : 'warning'} />}
                    action={<Link className="button secondary" href={item.href}>{item.completed ? 'Review' : item.title}</Link>}
                  />
                ))}
              </div>
              {accessibleChecklist.counts ? (
                <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
                  Live progress: {Number(accessibleChecklist.counts.jobsCreated || 0)} jobs created, {Number(accessibleChecklist.counts.jobsCompleted || 0)} completed, {Number(accessibleChecklist.counts.serviceRecords || 0)} service records published.
                </p>
              ) : null}
            </div>
          ) : null}

          {accessibleChecklist?.workspaceAreas?.length ? (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Useful areas</h2>
              <div className="two-col">
                {accessibleChecklist.workspaceAreas.slice(0, 4).map((item) => (
                  <Link key={item.key} href={item.href} className="integration-card mt-linkCard">
                    <strong>{item.title}</strong>
                    <p className="muted" style={{ margin: "8px 0 0 0" }}>{item.description}</p>
                    <span className="mt-linkCard__action">Open</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {guidedEverywhereEnabled ? (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Guided actions</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
                <Link className="button secondary" href="/dashboard/guided?action=create_job">Create job</Link>
                <Link className="button secondary" href="/dashboard/guided?action=book_appointment">Book appointment</Link>
                <Link className="button secondary" href="/dashboard/guided?action=take_payment">Take payment</Link>
                <Link className="button secondary" href="/dashboard/guided?action=order_parts">Order parts</Link>
                <Link className="button secondary" href="/dashboard/guided?action=message_customer">Message customer</Link>
              </div>
            </div>
          ) : null}

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Today&apos;s schedule</h2>
            <p className="muted">See the next booking or job that should move today, without opening the full queue first.</p>
            <div className="list">
              {(summary?.todayBookings || []).slice(0, 5).map((b) => (
                <Link key={b.id} href="/dashboard/bookings" className="integration-card mt-linkCard" data-testid={`dashboard-booking-card-${b.id}`}>
                  <div><strong className="dashboard-premium-title">{b.customerName || 'Customer'}</strong><p className="muted">{new Date(b.startsAt).toLocaleTimeString()} • {describeDashboardBookingState(b)}</p></div>
                  <span className="mt-linkCard__action">Review booking</span>
                </Link>
              ))}
              {(!summary?.todayBookings || summary.todayBookings.length === 0) ? (
                <EmptyState
                  title="Nothing booked for today"
                  description="Create a booking or head to the live board if work is being added another way."
                  primaryAction={{ label: "Open bookings", href: "/dashboard/bookings" }}
                  secondaryAction={{ label: "See live work", href: commandCentreHref }}
                />
              ) : null}
            </div>

            <p className="muted" style={{ marginTop: 14 }}>Jobs due or overdue</p>
            <div className="list">
              {(summary?.dueAndOverdueJobs || []).slice(0, 5).map((j) => (
                <Link key={j.id} href="/dashboard/jobs" className="integration-card mt-linkCard" data-testid={`dashboard-job-card-${j.id}`}>
                  <div><strong>{j.jobRef}</strong><p className="muted">{j.customerName || 'Customer'} • {describeDashboardJobState(j)}</p></div>
                  <span className="mt-linkCard__action">Review job</span>
                </Link>
              ))}
              {(!summary?.dueAndOverdueJobs || summary.dueAndOverdueJobs.length === 0) ? (
                <EmptyState
                  title="No jobs need action yet"
                  description="Due and overdue jobs will show here as soon as they need attention."
                  primaryAction={{ label: "See jobs", href: "/dashboard/jobs" }}
                  secondaryAction={{ label: "Create job", href: "/dashboard/jobs/new" }}
                />
              ) : null}
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Commercial follow-up</h2>
            <p className="muted">Unpaid: {summary?.money?.unpaidCount || 0} • {money(summary?.money?.unpaidTotalCents || 0)}</p>
            <p className="muted">Plan: {summary?.money?.subscriptionStatus || 'none'}</p>
            {canManageBilling ? <Link className="button secondary" href="/dashboard/billing">Review billing</Link> : null}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Pick up where you left off</h2>
            {drafts.length === 0 ? (
              <EmptyState
                title="No saved work yet"
                description="If you leave something unfinished, it will show here so you can come back to it."
                primaryAction={{ label: 'Open your first job sheet', href: '/dashboard/jobs/new' }}
              />
            ) : (
              <div className="list">
                {drafts.slice(0, 8).map((d: any) => (
                  <Link className="integration-card mt-linkCard" key={d.id} href={d.href} data-testid={`dashboard-draft-card-${d.id}`}>
                    <div>
                      <strong>{d.kind}</strong>
                      <p className="muted">Updated {new Date(d.updatedAt).toLocaleString()}</p>
                    </div>
                    <span className="mt-linkCard__action">Continue</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Finish setup later</h2>
            <p className="muted">Keep work moving now, then come back for branding, messages, and deeper setup when you have space.</p>
            <Link className="button secondary" href="/dashboard/setup-wizard">Continue setup</Link>
          </div>
        </div>
      </details>
      </div>
      </div>
    </DashboardShell>
  );
}
