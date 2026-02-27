import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { DashboardShell } from '../../components/dashboard-shell';
import { EmptyState } from '../../components/states/EmptyState';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';
import { ApiError, apiFetch } from '../../lib/api';
import { isCrmProV1Enabled, isCrmV1Enabled, isDemoPolishV1Enabled } from '../../lib/feature-flags';

function money(cents: number, currency = 'GBP') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format((cents || 0) / 100);
}

export default function TradeAccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [segments] = useState<any[]>([
    { id: 'recent', name: 'Recently Contacted' },
    { id: 'unpaid', name: 'Unpaid Accounts' },
  ]);
  const [segmentId, setSegmentId] = useState('');
  const [name, setName] = useState('');
  const [creditLimit, setCreditLimit] = useState('0');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);

  const crmEnabled = isCrmV1Enabled();
  const crmProEnabled = isCrmProV1Enabled();
  const demoPolishEnabled = isDemoPolishV1Enabled();
  const segmentView = router.query.view === 'segments';

  const load = async () => {
    setLoading(true);
    setError('');
    setRequestId(undefined);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('q', search.trim());
      if (statusFilter) query.set('status', statusFilter);
      if (demoPolishEnabled && tagFilter.trim()) query.set('tag', tagFilter.trim());
      if (segmentId) query.set('segmentId', segmentId);
      const suffix = query.toString() ? `?${query.toString()}` : '';
      const data = crmProEnabled ? await apiFetch(`/crm/accounts/search${suffix}`) : await apiFetch(`/trade-accounts${suffix}`);
      setAccounts(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load trade accounts');
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [search, statusFilter, tagFilter, segmentId, crmProEnabled, demoPolishEnabled]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setRequestId(undefined);
    try {
      await apiFetch('/trade-accounts', {
        method: 'POST',
        body: JSON.stringify({
          name,
          creditLimit: Number(creditLimit),
          contactName: contactName || undefined,
          contactEmail: contactEmail || undefined,
          contactPhone: contactPhone || undefined,
        }),
      });
      setName('');
      setCreditLimit('0');
      setContactName('');
      setContactEmail('');
      setContactPhone('');
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to save trade account');
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    }
  }

  const showMainErrorState = Boolean(error && !loading && accounts.length === 0);

  return (
    <DashboardShell>
      <div className="card">
        <h1>Trade Accounts CRM</h1>
        {!crmEnabled ? <p className="muted">CRM feature flag is off. Showing basic list only.</p> : null}
        {crmProEnabled && segmentView ? (
          <p className="muted">Segments view is enabled. Choose a segment filter below.</p>
        ) : null}

        {showMainErrorState ? (
          <ErrorState
            title="Unable to load trade accounts"
            description={error}
            requestId={requestId}
            primaryAction={{ label: 'Try again', onClick: load }}
            secondaryAction={{ label: 'Go to dashboard', href: '/dashboard' }}
          />
        ) : null}

        {!showMainErrorState && error ? (
          <ErrorState
            title="Action failed"
            description={error}
            requestId={requestId}
            primaryAction={{ label: 'Retry', onClick: load }}
          />
        ) : null}

        <form onSubmit={onSubmit}>
          <label>Account name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />

          <label>Credit limit</label>
          <input className="input" type="number" min={0} value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} required />

          <label>Contact name</label>
          <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} />

          <label>Contact email</label>
          <input className="input" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />

          <label>Contact phone</label>
          <input className="input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />

          <button className="button" type="submit">Save Trade Account</button>
        </form>

        <div className="two-col" style={{ marginTop: 16 }}>
          <div>
            <label>Search</label>
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Company, contact, email..." />
          </div>
          <div>
            <label>Status</label>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="ON_HOLD">ON_HOLD</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>
          {demoPolishEnabled ? (
            <div>
              <label>Tag</label>
              <input className="input" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder="vip, fleet..." />
            </div>
          ) : null}
          {crmProEnabled ? (
            <div>
              <label>Segment</label>
              <select className="input" value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
                <option value="">All</option>
                {segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}
              </select>
            </div>
          ) : null}
        </div>

        {loading && accounts.length === 0 ? (
          <LoadingState title="Loading trade accounts" description="Fetching your CRM list." />
        ) : null}

        {!loading && accounts.length === 0 && !error ? (
          <EmptyState
            title="No trade accounts yet"
            description="Create your first account to track notes, outstanding balances, and follow-ups."
            primaryAction={{ label: 'Create first account', onClick: () => document.querySelector<HTMLInputElement>('input.input')?.focus() }}
            secondaryAction={{ label: 'Back to dashboard', href: '/dashboard' }}
          />
        ) : null}

        {accounts.length > 0 ? (
          <div className="list" style={{ marginTop: 20 }}>
            {accounts.map((account) => (
              <div key={account.id} className="integration-card">
                <div>
                  <strong>{account.name}</strong>
                  <p className="muted" style={{ margin: '4px 0 0 0' }}>
                    {account.contactName || 'No contact'} • {account.contactEmail || 'No email'}
                  </p>
                  <p className="muted" style={{ margin: '4px 0 0 0' }}>
                    Outstanding {money(Number(account.computedOutstandingCents || 0))} / Limit {money(Math.round(Number(account.creditLimit || 0) * 100))}
                  </p>
                </div>
                <div className="integration-actions">
                  <span className="badge">{account.status}</span>
                  <Link className="button secondary" href={`/dashboard/trade-accounts/${account.id}`}>Open CRM</Link>
                  {demoPolishEnabled ? <button className="button secondary" type="button" onClick={() => setPreview(account)}>Preview</button> : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {preview && demoPolishEnabled ? (
        <div className="card" style={{ position: 'fixed', right: 16, top: 110, width: 'min(420px, calc(100vw - 32px))', zIndex: 20 }}>
          <h3 style={{ marginTop: 0 }}>Account Preview</h3>
          <p><strong>{preview.name}</strong></p>
          <p className="muted">{preview.contactName || 'No contact'} • {preview.contactEmail || 'No email'}</p>
          <p className="muted">{preview.contactPhone || 'No phone'} • Status {preview.status}</p>
          <p className="muted">Outstanding {money(Number(preview.computedOutstandingCents || 0))}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link className="button" href={`/dashboard/trade-accounts/${preview.id}`}>Open</Link>
            <button className="button secondary" type="button" onClick={() => setPreview(null)}>Close</button>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
