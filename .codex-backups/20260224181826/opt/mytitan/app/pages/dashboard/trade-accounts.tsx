import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { DashboardShell } from '../../components/dashboard-shell';

export default function TradeAccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [creditLimit, setCreditLimit] = useState('0');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    apiFetch('/trade-accounts')
      .then((data) => setAccounts(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || 'Failed to load trade accounts'));
  };

  useEffect(() => {
    load();
  }, []);

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
        }),
      });
      setName('');
      setCreditLimit('0');
      setContactName('');
      setContactEmail('');
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to save trade account');
    }
  }

  return (
    <DashboardShell>
      <div className="card">
        <h1>Trade Accounts</h1>
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}

        <form onSubmit={onSubmit}>
          <label>Account name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />

          <label>Credit limit</label>
          <input className="input" type="number" min={0} value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} required />

          <label>Contact name</label>
          <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} />

          <label>Contact email</label>
          <input className="input" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />

          <button className="button" type="submit">Save Trade Account</button>
        </form>

        <div className="list" style={{ marginTop: 20 }}>
          {accounts.map((account) => (
            <div key={account.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong>{account.name}</strong>
                <span className="badge">{account.status}</span>
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                Outstanding: {String(account.outstandingBalance)} / Limit: {String(account.creditLimit)}
              </p>
            </div>
          ))}
          {accounts.length === 0 && !error && <p>No trade accounts yet.</p>}
        </div>
      </div>
    </DashboardShell>
  );
}
