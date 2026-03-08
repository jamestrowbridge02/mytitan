import { useEffect, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';
import { isMarketplaceEnabled } from '../../lib/feature-flags';

type Integration = {
  key: string;
  name: string;
  description: string;
  configureUrl: string;
  enabled: boolean;
  allowed: boolean;
};

type ConnectionStatus = {
  provider: string;
  connected: boolean;
  connectedAt?: string | null;
  allowed: boolean;
  enabled: boolean;
};

const CONNECTIONS = [
  {
    key: 'xero',
    name: 'Xero',
    description: 'Sync invoices and payouts to your accounting ledger.',
    time: '5-10 min',
    benefits: 'Automatic bookkeeping handoff for your accountant.',
    statusEndpoint: '/integrations/xero/status',
    connectEndpoint: '/integrations/xero/connect',
    disconnectEndpoint: '/integrations/xero/disconnect',
  },
  {
    key: 'qbo',
    name: 'QuickBooks Online',
    description: 'Send invoices and payments straight into QBO.',
    time: '5-10 min',
    benefits: 'Keep finance reports up to date automatically.',
    statusEndpoint: '/integrations/qbo/status',
    connectEndpoint: '/integrations/qbo/connect',
    disconnectEndpoint: '/integrations/qbo/disconnect',
  },
  {
    key: 'google',
    name: 'Google Calendar',
    description: 'Mirror bookings to your team calendars.',
    time: '3-5 min',
    benefits: 'Avoid double-bookings and keep staff aligned.',
    statusEndpoint: '/integrations/google/status',
    connectEndpoint: '/integrations/google/connect',
    disconnectEndpoint: '/integrations/google/disconnect',
  },
];

export default function IntegrationsPage() {
  const [items, setItems] = useState<Integration[]>([]);
  const [connections, setConnections] = useState<Record<string, ConnectionStatus>>({});
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const marketplaceEnabled = isMarketplaceEnabled();

  const load = async () => {
    try {
      const data = await apiFetch('/integrations');
      setItems(Array.isArray(data) ? data : []);
      const statusEntries = await Promise.all(
        CONNECTIONS.map(async (conn) => {
          try {
            const status = await apiFetch(conn.statusEndpoint);
            return [conn.key, status];
          } catch {
            return [conn.key, { provider: conn.key, connected: false, allowed: false, enabled: false }];
          }
        }),
      );
      setConnections(Object.fromEntries(statusEntries));
    } catch (err: any) {
      setError(err.message || 'Failed to load integrations');
    }
  };

  useEffect(() => {
    if (!marketplaceEnabled) return;
    load();
  }, [marketplaceEnabled]);

  const toggle = async (item: Integration) => {
    if (!item.allowed) return;
    setSavingKey(item.key);
    try {
      await apiFetch('/integrations', {
        method: 'PATCH',
        body: JSON.stringify({ key: item.key, enabled: !item.enabled }),
      });
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to update integration');
    } finally {
      setSavingKey(null);
    }
  };

  const connect = async (connKey: string) => {
    const conn = CONNECTIONS.find((entry) => entry.key === connKey);
    if (!conn) return;
    setSavingKey(conn.key);
    try {
      const res = await apiFetch(conn.connectEndpoint, { method: 'POST' });
      if (res?.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect');
    } finally {
      setSavingKey(null);
    }
  };

  const disconnect = async (connKey: string) => {
    const conn = CONNECTIONS.find((entry) => entry.key === connKey);
    if (!conn) return;
    setSavingKey(conn.key);
    try {
      await apiFetch(conn.disconnectEndpoint, { method: 'POST' });
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect');
    } finally {
      setSavingKey(null);
    }
  };

  if (!marketplaceEnabled) {
    return (
      <DashboardShell>
        <div className="card">
          <h1>Integrations marketplace</h1>
          <p className="muted">The marketplace is currently disabled.</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="card">
        <h1>Integrations marketplace</h1>
        <p className="muted">Enable the tools you need now. You can upgrade later.</p>
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}

        <div className="list">
          {items.map((item) => (
            <div key={item.key} className="integration-card">
              <div>
                <strong>{item.name}</strong>
                <p className="muted">{item.description}</p>
                <p className="muted" style={{ marginTop: 6 }}>Setup time: 2-5 min</p>
              </div>
              <div className="integration-actions">
                {!item.allowed ? <span className="badge warn">Integrations workspace</span> : null}
                <a className="button secondary" href={item.configureUrl}>
                  Configure
                </a>
                <button
                  className={`toggle ${item.enabled ? 'on' : ''}`}
                  type="button"
                  onClick={() => toggle(item)}
                  disabled={!item.allowed || savingKey === item.key}
                >
                  {item.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <h2 style={{ marginTop: 24 }}>Accounting & calendars</h2>
        <div className="list">
          {CONNECTIONS.map((conn) => {
            const status = connections[conn.key];
            const canConnect = status?.allowed && status?.enabled;
            return (
              <div key={conn.key} className="integration-card">
                <div>
                  <strong>{conn.name}</strong>
                  <p className="muted">{conn.description}</p>
                  <p className="muted" style={{ marginTop: 6 }}>Setup time: {conn.time}</p>
                  <p className="muted">Benefit: {conn.benefits}</p>
                </div>
                <div className="integration-actions">
                  {!status?.allowed ? <span className="badge warn">Integrations workspace</span> : null}
                  {status?.connected ? <span className="badge">Connected</span> : <span className="badge warn">Not connected</span>}
                  {status?.connected ? (
                    <button className="button secondary" type="button" onClick={() => disconnect(conn.key)} disabled={savingKey === conn.key}>
                      Disconnect
                    </button>
                  ) : (
                    <button className="button" type="button" onClick={() => connect(conn.key)} disabled={!canConnect || savingKey === conn.key}>
                      Connect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardShell>
  );
}
