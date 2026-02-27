import { useEffect, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';
import { isNotificationsV1Enabled } from '../../lib/feature-flags';

export default function NotificationsPage() {
  const enabled = isNotificationsV1Enabled();
  const [items, setItems] = useState<any[]>([]);
  const [prefs, setPrefs] = useState<any>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function load() {
    if (!enabled) return;
    try {
      const [n, p] = await Promise.all([
        apiFetch('/notifications'),
        apiFetch('/notifications/preferences'),
      ]);
      setItems(Array.isArray(n) ? n : []);
      setPrefs(p || null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load notifications');
    }
  }

  useEffect(() => {
    load();
  }, [enabled]);

  async function savePref(key: string, value: boolean) {
    try {
      const updated = await apiFetch('/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value }),
      });
      setPrefs(updated);
      setStatus('Preferences saved');
    } catch (err: any) {
      setError(err?.message || 'Failed to update preferences');
    }
  }

  if (!enabled) {
    return (
      <DashboardShell>
        <div className="card">
          <h1>Notifications</h1>
          <p className="muted">Feature is disabled.</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>Notifications Centre</h1>
        {status ? <p style={{ color: '#7bdba5' }}>{status}</p> : null}
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Preferences</h2>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={Boolean(prefs?.jobComplete)}
            onChange={(e) => savePref('jobComplete', e.target.checked)}
            style={{ marginRight: 8 }}
          />
          Job complete notifications
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={Boolean(prefs?.paymentReceived)}
            onChange={(e) => savePref('paymentReceived', e.target.checked)}
            style={{ marginRight: 8 }}
          />
          Payment received notifications
        </label>
        <label style={{ display: 'block' }}>
          <input
            type="checkbox"
            checked={Boolean(prefs?.emailEnabled)}
            onChange={(e) => savePref('emailEnabled', e.target.checked)}
            style={{ marginRight: 8 }}
          />
          Email delivery when configured
        </label>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Latest 30</h2>
        <div className="list">
          {items.map((item) => (
            <div key={item.id} className="integration-card" style={{ alignItems: 'flex-start' }}>
              <div>
                <strong>{item.title}</strong>
                <p className="muted" style={{ margin: '4px 0 0 0' }}>{item.body || ''}</p>
                <p className="muted" style={{ margin: '4px 0 0 0' }}>{new Date(item.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
          {items.length === 0 ? <p className="muted">No notifications yet.</p> : null}
        </div>
      </div>
    </DashboardShell>
  );
}
