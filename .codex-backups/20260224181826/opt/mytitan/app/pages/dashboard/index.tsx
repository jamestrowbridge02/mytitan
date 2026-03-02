import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardShell } from '../../components/dashboard-shell';
import { DemoTourOverlay } from '../../components/-tour-overlay';
import { GuidedSetupProgress } from '../../components/guided-setup-progress';
import { apiFetch, setToken } from '../../lib/api';
import { isCommandCentreEnabled, isDemoTourV1Enabled, isGuidedSetupV2Enabled } from '../../lib/feature-flags';
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
  const commandCentreEnabled = isCommandCentreEnabled();
  const guidedSetupEnabled = isGuidedSetupV2Enabled();
  const demoTourEnabled = isDemoTourV1Enabled();

  useEffect(() => {
    if (!router.isReady) return;
    const token = router.query.demo_token;
    if (typeof token === 'string' && token.trim()) {
      setToken(token.trim());
      window.location.replace('/dashboard');
    }
  }, [router.isReady, router.query.demo_token]);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, m] = await Promise.all([
          apiFetch('/command-centre/summary'),
          apiFetch('/me').catch(() => null),
        ]);
        setSummary(s as Summary);
        setMe(m);
      } catch (err: any) {
        setError(err?.message || 'Failed to load command centre');
      }
    };
    load();
  }, []);

  const drafts = useMemo(() => {
    const jobs = summary?.drafts?.jobs || [];
    const crm = summary?.drafts?.crm || [];
    return [...jobs.map((d) => ({ ...d, kind: 'Job draft', href: '/dashboard/jobs/new?guided=1' })), ...crm.map((d) => ({ ...d, kind: 'CRM draft', href: '/dashboard/trade-accounts' }))];
  }, [summary]);

  if (!commandCentreEnabled) {
    return (
      <DashboardShell>
        <div className="card"><h1>Dashboard</h1><p className="muted">Command Centre feature is disabled.</p></div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <DemoTourOverlay enabled={demoTourEnabled} isDemoUser={Boolean(me?.demoUser || me?.email === '@mytitan.co.uk')} />
      <GuidedSetupProgress enabled={guidedSetupEnabled} incomplete={!settings?.guidedSetupCompletedAt} />

      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>Command Centre</h1>
        <p className="muted">Simple daily control for jobs, bookings, CRM, and billing.</p>
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Quick Actions</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {(summary?.quickActions || [
            { key: 'new_job', label: 'New Job', href: '/dashboard/jobs/new' },
            { key: 'new_booking', label: 'New Booking', href: '/dashboard/bookings' },
            { key: 'new_customer', label: 'New Customer / Trade Account', href: '/dashboard/trade-accounts' },
          ]).map((action) => (
            <a key={action.key} className="button" href={action.href} style={{ textAlign: 'center' }}>{action.label}</a>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Today</h2>
        <p className="muted">Bookings scheduled today</p>
        <div className="list">
          {(summary?.todayBookings || []).slice(0, 5).map((b) => (
            <div key={b.id} className="integration-card">
              <div><strong>{b.customerName || 'Customer'}</strong><p className="muted">{new Date(b.startsAt).toLocaleTimeString()}</p></div>
              <a className="button secondary" href="/dashboard/bookings">Open</a>
            </div>
          ))}
          {(!summary?.todayBookings || summary.todayBookings.length === 0) ? <p className="muted">No bookings for today.</p> : null}
        </div>

        <p className="muted" style={{ marginTop: 14 }}>Jobs due / overdue</p>
        <div className="list">
          {(summary?.dueAndOverdueJobs || []).slice(0, 5).map((j) => (
            <div key={j.id} className="integration-card">
              <div><strong>{j.jobRef}</strong><p className="muted">{j.customerName || 'Customer'} • {j.status}</p></div>
              <a className="button secondary" href="/dashboard/jobs">Open</a>
            </div>
          ))}
          {(!summary?.dueAndOverdueJobs || summary.dueAndOverdueJobs.length === 0) ? <p className="muted">No due jobs.</p> : null}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Money</h2>
        <p className="muted">Unpaid: {summary?.money?.unpaidCount || 0} • {money(summary?.money?.unpaidTotalCents || 0)}</p>
        <p className="muted">Subscription: {summary?.money?.subscriptionStatus || 'none'}</p>
        <a className="button secondary" href="/dashboard/billing">Open Billing</a>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Drafts</h2>
        <div className="list">
          {drafts.slice(0, 8).map((d: any) => (
            <div className="integration-card" key={d.id}>
              <div>
                <strong>{d.kind}</strong>
                <p className="muted">Updated {new Date(d.updatedAt).toLocaleString()}</p>
              </div>
              <a className="button secondary" href={d.href}>Resume</a>
            </div>
          ))}
          {drafts.length === 0 ? <p className="muted">No drafts yet.</p> : null}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Setup Progress</h2>
        <p className="muted">Setup is non-blocking. Continue when ready.</p>
        <a className="button secondary" href="/dashboard/setup">Open Setup</a>
      </div>
    </DashboardShell>
  );
}
