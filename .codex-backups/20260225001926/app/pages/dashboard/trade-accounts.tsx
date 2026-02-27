import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiFetch } from '../../lib/api';
import { DashboardShell } from '../../components/dashboard-shell';
import { isCrmProV1Enabled, isCrmV1Enabled } from '../../lib/feature-flags';

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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const crmEnabled = isCrmV1Enabled();
  const crmProEnabled = isCrmProV1Enabled();
  const segmentView = router.query.view === 'segments';

  const load = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('q', search.trim());
      if (statusFilter) query.set('status', statusFilter);
      if (segmentId) query.set('segmentId', segmentId);
      const suffix = query.toString() ? `?${query.toString()}` : '';
      const data = crmProEnabled ? await apiFetch(`/crm/accounts/search${suffix}`) : await apiFetch(`/trade-accounts${suffix}`);
      setAccounts(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load trade accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [search, statusFilter, segmentId, crmProEnabled]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
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
    }
  }

  return (
    <DashboardShell>
      <div className="card">
        <h1>Trade Accounts CRM</h1>
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
        {!crmEnabled ? <p className="muted">CRM feature flag is off. Showing basic list only.</p> : null}
        {crmProEnabled && segmentView ? (
          <p className="muted">Segments view is enabled. Choose a segment filter below.</p>
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
              <option value="PAUSED">PAUSED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>
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
                <a className="button secondary" href={`/dashboard/trade-accounts/${account.id}`}>Open CRM</a>
              </div>
            </div>
          ))}
          {accounts.length === 0 && !loading && !error ? <p>No trade accounts yet.</p> : null}
        </div>
      </div>
    </DashboardShell>
  );
}
