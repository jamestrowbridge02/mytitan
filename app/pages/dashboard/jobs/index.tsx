import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api';
import { DashboardShell } from '../../../components/dashboard-shell';
import OpsSignalsBar from '../../../components/entity/OpsSignalsBar';
import { getJobSignals } from '../../../lib/ops-signals';

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'USD',
  }).format((cents || 0) / 100);
}

export default function Jobs() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/jobs')
      .then((data) => setJobs(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || 'Failed to load jobs'));
  }, []);

  return (
    <DashboardShell>
<div className="jobs-premium-shell">
      <div className="card jobs-premium-card">
        <h1 className="jobs-premium-title">Jobs</h1>
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}
        <div className="list">
          {jobs.map((job) => (
            <div key={job.id} className="card jobs-premium-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong>
                  <Link href={`/dashboard/jobs/${job.id}`}>{job.jobRef || job.id}</Link>
                </strong>
                <span className="badge">{job.status}</span>
              </div>
              <OpsSignalsBar
                {...getJobSignals(job)}
                compact
              />
              <p style={{ marginBottom: 8 }}>{job.customerName || job.title}</p>
              <p className="muted" style={{ margin: 0 }}>
                Total: {formatMoney(job.totalCents || 0, job.currency || 'USD')}
              </p>
            </div>
          ))}
          {jobs.length === 0 && !error && <p>No jobs yet.</p>}
        </div>
      </div>
    </div>
</DashboardShell>
  );
}
