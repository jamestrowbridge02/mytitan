import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { DashboardShell } from '../components/dashboard-shell';
import { OperatorActionTile, OperatorInsightIcon } from '../components/ui/operator-insights';
import { OperatorStatusBadge } from '../components/ui/operator-page';
import { apiFetch, clearToken, getToken } from '../lib/api';
import { isStartHereEnabled } from '../lib/feature-flags';
import { handleExpiredSession, markStartHereSeen, resolvePostAuthDestination } from '../lib/post-auth';

type ChecklistItem = {
  key: string;
  title: string;
  description: string;
  completed: boolean;
  href: string;
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

type StartSummary = {
  completedCount: number;
  total: number;
  items: ChecklistItem[];
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
    bookings?: number;
  } | null;
};

export default function StartHerePage() {
  const router = useRouter();
  const [summary, setSummary] = useState<StartSummary | null>(null);
  const [error, setError] = useState('');
  const enabled = isStartHereEnabled();

  async function signOut() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // keep local sign-out deterministic
    }
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('mytitan_token');
      window.localStorage.removeItem('mytitan_wheels_draft_v1');
      window.localStorage.removeItem('mytitan_demo_tour_seen_v1');
      window.localStorage.removeItem('mytitan_theme_mode');
    }
    clearToken();
    await router.replace('/login');
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    if (!enabled) {
      router.replace('/dashboard');
      return;
    }

    const load = async () => {
      try {
        const nextPath = await resolvePostAuthDestination({ startHereEnabled: enabled });
        if (nextPath !== '/start') {
          router.replace(nextPath);
          return;
        }
        markStartHereSeen();
        const checklist = await apiFetch('/setup/checklist');
        setSummary({
          completedCount: Number(checklist?.completedCount || 0),
          total: Number(checklist?.total || 0),
          items: Array.isArray(checklist?.items) ? checklist.items : [],
          firstValueJourney: Array.isArray(checklist?.firstValueJourney) ? checklist.firstValueJourney : [],
          workspaceAreas: Array.isArray(checklist?.workspaceAreas) ? checklist.workspaceAreas : [],
          recommendedNextAction: checklist?.recommendedNextAction || null,
          counts: checklist?.counts || null,
        });
      } catch (err: any) {
        if (handleExpiredSession(err)) {
          router.replace('/login');
          return;
        }
        setError(err.message || 'Failed to load Start Here data');
      }
    };

    void load();
  }, [enabled, router]);

  const firstValueProgress = useMemo(() => {
    const journey = summary?.firstValueJourney || [];
    const completed = journey.filter((item) => item.completed).length;
    return {
      completed,
      total: journey.length,
      next: journey.find((item) => !item.completed) || null,
    };
  }, [summary]);

  const setupNext = useMemo(
    () => summary?.items?.find((item) => !item.completed) || summary?.recommendedNextAction || null,
    [summary],
  );
  const latestDraft = useMemo(() => {
    const nextJourney = (summary?.firstValueJourney || []).find((item) => !item.completed);
    if (nextJourney?.href?.includes("/dashboard/jobs/new")) {
      return "/dashboard/work";
    }
    return null;
  }, [summary]);

  return (
    <DashboardShell>
      <div className="card operator-page" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="operator-page__eyebrow">Start here</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
              <OperatorInsightIcon icon="flow" tone="info" label="Core workflow" />
              <div>
                <h1 style={{ margin: 0 }}>Start with the flow your team will use every day</h1>
                <p className="muted" style={{ margin: '8px 0 0 0', maxWidth: 720 }}>
                  Set up the workspace, create or receive a booking, complete the job, send the result, then follow through to payment.
                </p>
              </div>
            </div>
          </div>
          <button type="button" className="button secondary" onClick={() => void signOut()} data-testid="start-logout">
            Sign out
          </button>
        </div>
        <div className="operator-page__stats" style={{ marginTop: 18 }}>
          <div className="operator-page__stat">
            <div className="operator-page__statLabel">Core workflow</div>
            <div className="operator-page__statValue">{summary ? `${firstValueProgress.completed}/${firstValueProgress.total}` : '...'}</div>
            <div className="operator-page__statHint">
              {summary
                ? firstValueProgress.next
                  ? `Next: ${firstValueProgress.next.title}.`
                  : 'Your first end-to-end workflow is already in place.'
                : 'Load the fastest route into real work.'}
            </div>
          </div>
          <div className="operator-page__stat">
            <div className="operator-page__statLabel">Setup progress</div>
            <div className="operator-page__statValue">{summary ? `${summary.completedCount}/${summary.total}` : '...'}</div>
            <div className="operator-page__statHint">
              {summary ? 'Checklist items complete.' : 'Track setup progress.'}
            </div>
          </div>
          <div className="operator-page__stat">
            <div className="operator-page__statLabel">Daily destination</div>
            <div className="operator-page__statValue">Start Work</div>
            <div className="operator-page__statHint">Once the job is live, stay in one operator flow.</div>
          </div>
        </div>
        {error ? <p style={{ color: '#ff8a8a', marginTop: 12 }}>{error}</p> : null}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Start work first</h2>
        <p className="muted">This is the clearest daily entry. It keeps create, resume, complete, send, and payment follow-up in one operator flow.</p>
        <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
          <Link className="button" href="/dashboard/work" data-testid="start-page-start-work">Start Work</Link>
          {latestDraft ? <Link className="button secondary" href={latestDraft}>Continue saved work</Link> : null}
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {(summary?.firstValueJourney || []).map((item) => (
            <OperatorActionTile
              key={item.key}
              title={item.title}
              description={item.description}
              icon={
                item.key.includes('booking')
                  ? 'calendar'
                  : item.key.includes('payment')
                    ? 'billing'
                    : item.key.includes('setup') || item.key.includes('settings')
                      ? 'settings'
                      : 'work'
              }
              tone={item.completed ? 'success' : 'warning'}
              badge={<OperatorStatusBadge label={item.completed ? 'Done' : 'Next'} tone={item.completed ? 'success' : 'warning'} />}
              action={
                <Link className="button" href={item.href.includes("/dashboard/jobs/new") ? "/dashboard/work" : item.href}>
                  {item.completed ? 'Open' : item.title}
                </Link>
              }
            />
          ))}
        </div>
      </div>

      <div className="two-col" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Know the main areas</h2>
          <p className="muted">These are the core places most teams return to once the daily flow is in motion.</p>
          <div style={{ display: 'grid', gap: 12 }}>
            {(summary?.workspaceAreas || []).map((item) => (
              <OperatorActionTile
                key={item.key}
                title={item.title}
                description={item.description}
                icon={
                  item.key.includes('customer')
                    ? 'customers'
                    : item.key.includes('booking')
                      ? 'calendar'
                      : item.key.includes('billing')
                        ? 'billing'
                        : 'spark'
                }
                action={<Link className="button secondary" href={item.href}>Open</Link>}
              />
            ))}
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Finish setup in the right order</h2>
          <p className="muted">
            {setupNext
              ? `${setupNext.description}`
              : 'Your main setup items are in good shape. Use settings later for branding, messaging, and billing details.'}
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {setupNext ? <Link className="button" href={setupNext.href}>{setupNext.title}</Link> : null}
            <Link className="button secondary" href="/dashboard/setup">Open setup checklist</Link>
            <Link className="button secondary" href="/dashboard/settings">Open settings</Link>
          </div>
          {summary?.counts ? (
            <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
              Live progress: {Number(summary.counts.jobsCreated || 0)} jobs created, {Number(summary.counts.jobsCompleted || 0)} completed, {Number(summary.counts.serviceRecords || 0)} service records published.
            </p>
          ) : null}
        </div>
      </div>
    </DashboardShell>
  );
}
