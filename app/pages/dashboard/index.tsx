import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { DashboardShell } from '../../components/dashboard-shell';
import { DemoTourOverlay } from '../../components/demo-tour-overlay';
import { GuidedSetupProgress } from '../../components/guided-setup-progress';
import { EmptyState } from '../../components/states/EmptyState';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';
import { ApiError, apiFetch, setToken } from '../../lib/api';
import {
  isCommandCentreEnabled,
  isCommandCentreV1Enabled,
  isCommandCentreV2Enabled,
  isDemoTourV1Enabled,
  isGuidedEverywhereV1Enabled,
  isGuidedSetupV2Enabled,
} from '../../lib/feature-flags';
import { useTenantSettings } from '../../lib/tenant-settings';

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

export default function Dashboard() {
  const router = useRouter();
  const { settings } = useTenantSettings();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const commandCentreEnabled = isCommandCentreEnabled() || isCommandCentreV1Enabled();
  const commandCentreV1Enabled = isCommandCentreV1Enabled();
  const commandCentreV2Enabled = isCommandCentreV2Enabled();
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
      setError(err?.message || 'Failed to load command centre');
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    if (commandCentreV2Enabled) {
      router.replace('/dashboard/command-centre-v2');
      return;
    }
    if (!commandCentreV1Enabled) return;
    if (!settings?.guidedSetupCompletedAt) return;
    router.replace('/dashboard/command-centre');
  }, [router, router.isReady, settings?.guidedSetupCompletedAt, commandCentreV1Enabled, commandCentreV2Enabled]);

  const drafts = useMemo(() => {
    const jobs = summary?.drafts?.jobs || [];
    const crm = summary?.drafts?.crm || [];
    return [
      ...jobs.map((d) => ({ ...d, kind: 'Job draft', href: `/dashboard/jobs/new?guided=1&resumeTrade=${encodeURIComponent(d.trade || 'WHEELS')}` })),
      ...crm.map((d) => ({ ...d, kind: 'CRM draft', href: d.tradeAccountId ? `/dashboard/trade-accounts/${d.tradeAccountId}` : '/dashboard/trade-accounts' })),
    ];
  }, [summary]);

  if (!commandCentreEnabled) {
    return (
      <DashboardShell>
        <EmptyState title="Dashboard" description="Command Centre feature is disabled." />
      </DashboardShell>
    );
  }

  if (loading && !summary) {
    return (
      <DashboardShell>
        <LoadingState title="Loading command centre" description="Fetching today's activity and quick actions." />
      </DashboardShell>
    );
  }

  if (error && !summary) {
    return (
      <DashboardShell>
        <ErrorState
          title="Could not load dashboard"
          description={error}
          requestId={requestId}
          primaryAction={{ label: 'Try again', onClick: load }}
          secondaryAction={{ label: 'Go to jobs', href: '/dashboard/jobs' }}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <DemoTourOverlay enabled={demoTourEnabled} isDemoUser={Boolean(me?.demoUser || me?.email === 'demo@mytitan.co.uk')} />
      <GuidedSetupProgress enabled={guidedSetupEnabled} incomplete={!settings?.guidedSetupCompletedAt} />

      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>Command Centre</h1>
        <p className="muted">Simple daily control for jobs, bookings, CRM, and billing.</p>
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
        <h2 style={{ marginTop: 0 }}>Quick Actions</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {(summary?.quickActions || [
            { key: 'new_job', label: 'New Job', href: '/dashboard/jobs/new' },
            { key: 'new_booking', label: 'New Booking', href: '/dashboard/bookings' },
            { key: 'new_customer', label: 'New Customer / Trade Account', href: '/dashboard/trade-accounts' },
          ]).map((action) => (
            <Link key={action.key} className="button" href={action.href} style={{ textAlign: 'center' }}>{action.label}</Link>
          ))}
        </div>
      </div>

      {guidedEverywhereEnabled ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>What do you want to do?</h2>
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
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>Cash at Risk</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Review unpaid jobs ready for collection.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link className="button secondary" href="/dashboard/command-centre">Open Command Centre</Link>
              <Link className="button secondary" href="/dashboard/jobs">View Jobs</Link>
            </div>
          </div>
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>Stuck Jobs</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              See blocked and at-risk work in one place.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link className="button secondary" href="/dashboard/command-centre">Open Command Centre</Link>
              <Link className="button secondary" href="/dashboard/jobs">View Jobs</Link>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Today</h2>
        <p className="muted">Bookings scheduled today</p>
        <div className="list">
          {(summary?.todayBookings || []).slice(0, 5).map((b) => (
            <div key={b.id} className="integration-card">
              <div><strong>{b.customerName || 'Customer'}</strong><p className="muted">{new Date(b.startsAt).toLocaleTimeString()}</p></div>
              <Link className="button secondary" href="/dashboard/bookings">Open</Link>
            </div>
          ))}
          {(!summary?.todayBookings || summary.todayBookings.length === 0) ? <p className="muted">No bookings for today.</p> : null}
        </div>

        <p className="muted" style={{ marginTop: 14 }}>Jobs due / overdue</p>
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
        <h2 style={{ marginTop: 0 }}>Money</h2>
        <p className="muted">Unpaid: {summary?.money?.unpaidCount || 0} • {money(summary?.money?.unpaidTotalCents || 0)}</p>
        <p className="muted">Subscription: {summary?.money?.subscriptionStatus || 'none'}</p>
        <Link className="button secondary" href="/dashboard/billing">Open Billing</Link>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Drafts</h2>
        {drafts.length === 0 ? (
          <EmptyState
            title="No drafts yet"
            description="Drafts will appear here when you start a job or CRM note and leave before finishing."
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
        <h2 style={{ marginTop: 0 }}>Setup Progress</h2>
        <p className="muted">Setup is non-blocking. Continue when ready.</p>
        <Link className="button secondary" href="/dashboard/setup">Open Setup</Link>
      </div>
    </DashboardShell>
  );
}
