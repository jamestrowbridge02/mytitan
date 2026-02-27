import { useEffect, useState } from 'react';
import { DashboardShell } from '../components/dashboard-shell';
import { apiFetch, getToken } from '../lib/api';
import { isStartHereEnabled } from '../lib/feature-flags';

type ChecklistSummary = {
  completedCount: number;
  total: number;
};

export default function StartHerePage() {
  const [summary, setSummary] = useState<ChecklistSummary | null>(null);
  const [error, setError] = useState('');
  const enabled = isStartHereEnabled();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!getToken()) {
      window.location.href = '/login';
      return;
    }
    if (!enabled) {
      window.location.href = '/dashboard';
      return;
    }

    const load = async () => {
      try {
        const status = await apiFetch('/onboarding/status');
        if (status?.onboardingCompleted === false) {
          window.location.href = '/onboarding';
          return;
        }
        const checklist = await apiFetch('/setup/checklist');
        setSummary({
          completedCount: Number(checklist?.completedCount || 0),
          total: Number(checklist?.total || 0),
        });
      } catch (err: any) {
        setError(err.message || 'Failed to load Start Here data');
      }
    };

    load();
  }, [enabled]);

  return (
    <DashboardShell>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1>Start Here</h1>
        <p className="muted">Use these simple actions to get moving quickly.</p>
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
      </div>

      <div className="list" style={{ marginBottom: 16 }}>
        <div className="integration-card">
          <div>
            <strong>Create a Job</strong>
            <p className="muted">Start a new customer job with your default setup.</p>
          </div>
          <div className="integration-actions">
            <a className="button" href="/dashboard/jobs/new">Create Job</a>
          </div>
        </div>

        <div className="integration-card">
          <div>
            <strong>Create a Booking Link</strong>
            <p className="muted">Turn on booking links and share with customers.</p>
          </div>
          <div className="integration-actions">
            <a className="button" href="/dashboard/bookings">Open Bookings</a>
          </div>
        </div>

        <div className="integration-card">
          <div>
            <strong>Customer Portal</strong>
            <p className="muted">Let customers review, approve, sign, and pay for jobs.</p>
          </div>
          <div className="integration-actions">
            <a className="button" href="/dashboard/jobs">Manage Portal Jobs</a>
          </div>
        </div>

        <div className="integration-card">
          <div>
            <strong>Integrations Marketplace</strong>
            <p className="muted">Connect accounting, calendar, and other tools when ready.</p>
          </div>
          <div className="integration-actions">
            <a className="button" href="/dashboard/integrations">Open Integrations</a>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Setup Checklist</h2>
        <p className="muted">
          {summary ? `${summary.completedCount}/${summary.total} complete.` : 'Track your setup progress.'}
        </p>
        <a className="button secondary" href="/dashboard/setup">Open Checklist</a>
      </div>
    </DashboardShell>
  );
}
