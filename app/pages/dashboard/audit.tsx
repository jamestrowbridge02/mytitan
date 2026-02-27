import { useEffect, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';

export default function AuditPage() {
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);

  const load = async () => {
    setError('');
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '20',
    });
    if (userId) params.append('userId', userId);
    if (type) params.append('type', type);
    if (from) params.append('from', from);
    if (to) params.append('to', to);

    try {
      const res = await apiFetch(`/audit?${params.toString()}`);
      setItems(res?.items || []);
      setTotal(res?.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit log');
    }
  };

  useEffect(() => {
    load();
  }, [page]);

  return (
    <DashboardShell>
      <div className="card">
        <h1>Audit Log</h1>
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}

        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <label>User ID</label>
          <input className="input" value={userId} onChange={(e) => setUserId(e.target.value)} />
          <label>Type</label>
          <input className="input" value={type} onChange={(e) => setType(e.target.value)} />
          <label>From (ISO date)</label>
          <input className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label>To (ISO date)</label>
          <input className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="button" type="button" onClick={() => { setPage(1); load(); }}>
            Apply Filters
          </button>
        </div>

        <div className="list">
          {items.map((event) => (
            <div key={event.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong>{event.type}</strong>
                <span className="badge">{new Date(event.createdAt).toLocaleString()}</span>
              </div>
              <p className="muted">{event.message}</p>
              {event.userId && <p className="muted">User: {event.userId}</p>}
            </div>
          ))}
          {items.length === 0 && !error && <p>No audit events found.</p>}
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="button" type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Prev
          </button>
          <span className="muted">Page {page}</span>
          <button className="button" type="button" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      </div>
    </DashboardShell>
  );
}
