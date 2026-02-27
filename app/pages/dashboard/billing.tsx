import { useEffect, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';
import { useBilling } from '../../lib/billing';
import { useTenantSettings } from '../../lib/tenant-settings';

const PLANS = [
  { code: 'SOLE_TRADER', label: 'Sole Trader' },
  { code: 'BUSINESS', label: 'Business' },
  { code: 'ENTERPRISE', label: 'Enterprise' },
];

export default function BillingPage() {
  const { plan, subscription, usage, features, interval: billingInterval, refresh } = useBilling();
  const { settings } = useTenantSettings();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState('');
  const [interval, setInterval] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');

  useEffect(() => {
    if (billingInterval) {
      setInterval(billingInterval);
    }
  }, [billingInterval]);

  const currentPlanCode = (plan?.code as string | undefined) || 'SOLE_TRADER';
  const status = subscription?.status || 'inactive';
  const planLimit = plan?.aiRequestsLimitMonthly;
  const planTokensLimit = plan?.aiTokensLimitMonthly;
  const usedRequests = usage?.aiRequestsUsed ?? 0;
  const usedTokens = usage?.aiTokensUsed ?? 0;
  const usedStorage = usage?.storageBytesUsed ?? 0;
  const usedJobs = usage?.jobsCreatedCount ?? 0;

  async function startCheckout(planCode: string) {
    setError('');
    setLoading(planCode);
    try {
      const res = await apiFetch('/billing/checkout-session', {
        method: 'POST',
        body: JSON.stringify({ planCode, interval }),
      });
      if (res?.url) {
        window.location.href = res.url;
      } else {
        setError('Checkout URL missing');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start checkout');
    } finally {
      setLoading('');
      await refresh();
    }
  }

  async function openPortal() {
    setError('');
    try {
      const res = await apiFetch('/billing/portal');
      if (res?.url) {
        window.location.href = res.url;
      } else {
        setError('Portal URL missing');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to open portal');
    }
  }

  return (
    <DashboardShell>
      <div className="card">
        <h1>Billing</h1>
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}

        <p className="muted">
          Current plan: <strong>{plan?.name || currentPlanCode}</strong> ({status})
        </p>
        {subscription?.currentPeriodEnd && (
          <p className="muted">
            Renews: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
          </p>
        )}
        {subscription?.cancelAtPeriodEnd && (
          <p className="muted">Cancellation scheduled at period end.</p>
        )}

        <div className="card" style={{ marginTop: 12, padding: 16 }}>
          <strong>AI Usage</strong>
          <p className="muted" style={{ marginBottom: 6 }}>
            Requests: {usedRequests} / {planLimit ?? '∞'}
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>
            Tokens: {usedTokens} / {planTokensLimit ?? '∞'}
          </p>
          {settings?.aiEnabled === false && (
            <p className="muted" style={{ marginTop: 8 }}>
              AI is disabled in tenant settings.
            </p>
          )}
        </div>

        <div className="card" style={{ marginTop: 12, padding: 16 }}>
          <strong>Monthly Usage</strong>
          <p className="muted">Storage: {formatBytes(usedStorage)} / {formatBytes(features?.storage_bytes_limit ?? 0, true)}</p>
          <p className="muted">Jobs: {usedJobs} / {features?.jobs_created_limit ?? '∞'}</p>
        </div>

        <div className="tab-row" style={{ marginTop: 16 }}>
          {(['MONTHLY', 'ANNUAL'] as const).map((mode) => (
            <button
              key={mode}
              className={`tab-button ${interval === mode ? 'active' : ''}`}
              type="button"
              onClick={() => setInterval(mode)}
            >
              {mode === 'MONTHLY' ? 'Monthly' : 'Annual'}
            </button>
          ))}
        </div>

        <div className="list" style={{ marginTop: 16 }}>
          {PLANS.map((p) => (
            <div key={p.code} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{p.label}</strong>
                {currentPlanCode === p.code ? <span className="badge">Current</span> : null}
              </div>
              <p className="muted">Stripe-managed pricing</p>
              <button
                className="button"
                type="button"
                disabled={loading === p.code}
                onClick={() => startCheckout(p.code)}
                style={{ marginRight: 10 }}
              >
                {loading === p.code ? 'Redirecting...' : currentPlanCode === p.code ? 'Manage Plan' : 'Choose Plan'}
              </button>
            </div>
          ))}
        </div>

        <button className="button" type="button" style={{ marginTop: 16 }} onClick={openPortal}>
          Manage billing in Stripe
        </button>
      </div>
    </DashboardShell>
  );
}

function formatBytes(value: number, infinityOk = false) {
  if (!value) return infinityOk ? '∞' : '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
