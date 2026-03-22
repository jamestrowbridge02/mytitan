import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { DashboardShell } from '../../components/dashboard-shell';
import { GuidedTourOverlay } from '../../components/guided-tour-overlay';
import { GuidedSetupProgress } from '../../components/guided-setup-progress';
import { EmptyState } from '../../components/states/EmptyState';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';
import { ApiError, apiFetch, setToken } from '../../lib/api';
import {
  isCommandCentreEnabled,
  isCommandCentreV1Enabled,
  isDemoTourV1Enabled,
  isGuidedEverywhereV1Enabled,
  isGuidedSetupV2Enabled,
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

export default function Dashboard() {
  const router = useRouter();
  const { settings } = useTenantSettings();
  const commandCentreHref = getCommandCentreHref(settings);
  const [summary, setSummary] = useState<Summary | null>(null);
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
      const [s, m] = await Promise.all([
        apiFetch('/command-centre/summary'),
        apiFetch('/me').catch(() => null),
      ]);
      setSummary(s as Summary);
      setMe(m);
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
      ...jobs.map((d) => ({ ...d, kind: 'Job draft', href: `/dashboard/jobs/new?guided=1&resumeTrade=${encodeURIComponent(d.trade || 'WHEELS')}` })),
      ...crm.map((d) => ({ ...d, kind: 'CRM draft', href: d.tradeAccountId ? `/dashboard/trade-accounts/${d.tradeAccountId}` : '/dashboard/trade-accounts' })),
    ];
  }, [summary]);

  const canManageBilling = Boolean(me?.permissions?.["billing.manage"]);

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
    },
  ];

  if (!commandCentreEnabled) {
  return (
      <DashboardShell>
  <div className="dashboard-home-premium">
<div className="dashboard-premium-shell">
        <EmptyState title="Overview unavailable" description="This workspace does not use the dashboard overview right now." />
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
              {dashboardMetrics.map((metric) => (
                <div key={metric.label} className="card dashboard-metric-card">
                  <div className="dashboard-metric-label">{metric.label}</div>
                  <div className="dashboard-metric-value">{metric.value}</div>
                </div>
              ))}
            </div>

            <div className="dashboard-home-loading">
              <LoadingState title="Loading your overview" description="Bringing in today&apos;s work, priorities, and quick actions." />
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
          title="We couldn't open your overview"
          description={error}
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
      <div className="card dashboard-home-hero">
        <p className="operator-kicker" style={{ margin: 0 }}>Today&apos;s overview</p>
        <h1 className="dashboard-home-title" style={{ marginTop: 10 }}>Dashboard</h1>
        <p className="dashboard-home-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
          Start here for today&apos;s priorities, quick actions, and anything that needs attention before it slips.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
          <Link className="button" href={commandCentreHref}>Open live board</Link>
          <Link className="button secondary" href="/dashboard/jobs">See jobs</Link>
          <Link className="button secondary" href="/dashboard/customers">See customers</Link>
        </div>
      </div>
      <GuidedSetupProgress enabled={guidedSetupEnabled} incomplete={!settings?.guidedSetupCompletedAt} />

      <div className="dashboard-metrics-grid">
        {dashboardMetrics.map((metric) => (
          <div key={metric.label} className="card dashboard-metric-card">
            <div className="dashboard-metric-label">{metric.label}</div>
            <div className="dashboard-metric-value">{metric.value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Needs attention today</h2>
        <p className="muted">Start with the work, bookings, and payments that need a decision today.</p>
        {error ? (
          <ErrorState
            title="Some data may be out of date"
            description={error}
            requestId={requestId}
            primaryAction={{ label: 'Refresh', onClick: load }}
          />
        ) : null}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Start something</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {(summary?.quickActions || [
            { key: 'new_job', label: 'New job', href: '/dashboard/jobs/new' },
            { key: 'new_booking', label: 'New booking', href: '/dashboard/bookings' },
            { key: 'new_customer', label: 'New customer', href: '/dashboard/trade-accounts' },
          ]).map((action) => (
            <Link key={action.key} className="button" href={action.href} style={{ textAlign: 'center' }}>{action.label}</Link>
          ))}
        </div>
      </div>

      {guidedEverywhereEnabled ? (
        <div className="card" style={{ marginBottom: 16 }}>
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

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="two-col">
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>Cash to follow up</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              See unpaid work that needs a call, reminder, or invoice follow-up.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link className="button secondary" href={commandCentreHref}>Open live board</Link>
              <Link className="button secondary" href="/dashboard/jobs">View Jobs</Link>
            </div>
          </div>
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>Work that needs help</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Spot blocked or slowing work before it slips further behind.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link className="button secondary" href={commandCentreHref}>Open live board</Link>
              <Link className="button secondary" href="/dashboard/jobs">View Jobs</Link>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Today&apos;s schedule</h2>
        <p className="muted">Bookings and due work for today.</p>
        <div className="list">
          {(summary?.todayBookings || []).slice(0, 5).map((b) => (
            <div key={b.id} className="integration-card">
              <div><strong className="dashboard-premium-title">{b.customerName || 'Customer'}</strong><p className="muted">{new Date(b.startsAt).toLocaleTimeString()}</p></div>
              <Link className="button secondary" href="/dashboard/bookings">Open</Link>
            </div>
          ))}
          {(!summary?.todayBookings || summary.todayBookings.length === 0) ? <p className="muted">No bookings for today.</p> : null}
        </div>

        <p className="muted" style={{ marginTop: 14 }}>Jobs due or overdue</p>
        <div className="list">
          {(summary?.dueAndOverdueJobs || []).slice(0, 5).map((j) => (
            <div key={j.id} className="integration-card">
              <div><strong>{j.jobRef}</strong><p className="muted">{j.customerName || 'Customer'} • {j.status}</p></div>
              <Link className="button secondary" href="/dashboard/jobs">Open</Link>
            </div>
          ))}
          {(!summary?.dueAndOverdueJobs || summary.dueAndOverdueJobs.length === 0) ? <p className="muted">No due jobs.</p> : null}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Billing snapshot</h2>
        <p className="muted">Unpaid: {summary?.money?.unpaidCount || 0} • {money(summary?.money?.unpaidTotalCents || 0)}</p>
        <p className="muted">Plan: {summary?.money?.subscriptionStatus || 'none'}</p>
        {canManageBilling ? <Link className="button secondary" href="/dashboard/billing">Open billing</Link> : null}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Unfinished work</h2>
        {drafts.length === 0 ? (
          <EmptyState
            title="Nothing to resume"
            description="Anything you start and leave unfinished will appear here so you can pick it up later."
            primaryAction={{ label: 'Create new job', href: '/dashboard/jobs/new?guided=1' }}
          />
        ) : (
          <div className="list">
            {drafts.slice(0, 8).map((d: any) => (
              <div className="integration-card" key={d.id}>
                <div>
                  <strong>{d.kind}</strong>
                  <p className="muted">Updated {new Date(d.updatedAt).toLocaleString()}</p>
                </div>
                <Link className="button secondary" href={d.href}>Resume</Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Setup progress</h2>
        <p className="muted">Finish the remaining setup when you are ready.</p>
        <Link className="button secondary" href="/dashboard/setup">Open setup</Link>
      </div>
      </div>
    </DashboardShell>
  );
}
