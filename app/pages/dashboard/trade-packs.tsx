import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';
import { isTradePacksEnabled } from '../../lib/feature-flags';

type TradePack = {
  code: string;
  name: string;
  description: string;
  tags: string[];
  includes: string[];
  installed: boolean;
  planCode: string;
  planLimit: number | null;
};

type InstalledResponse = {
  items: Array<{ packCode: string; installedAt?: string }>;
  count: number;
};

export default function TradePacksPage() {
  const enabled = isTradePacksEnabled();
  const [packs, setPacks] = useState<TradePack[]>([]);
  const [installedCount, setInstalledCount] = useState(0);
  const [error, setError] = useState('');
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [available, installed] = await Promise.all([
        apiFetch('/trade-packs'),
        apiFetch('/trade-packs/installed'),
      ]);
      setPacks(Array.isArray(available) ? available : []);
      const installedData = (installed || { items: [], count: 0 }) as InstalledResponse;
      setInstalledCount(Number(installedData.count || 0));
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load trade packs');
    }
  };

  useEffect(() => {
    if (!enabled) return;
    refresh();
  }, [enabled]);

  const planMeta = useMemo(() => {
    const first = packs[0];
    return {
      planCode: first?.planCode || 'SOLE_TRADER',
      planLimit: typeof first?.planLimit === 'number' ? first.planLimit : null,
    };
  }, [packs]);

  const install = async (packCode: string) => {
    setBusyCode(packCode);
    try {
      await apiFetch('/trade-packs/install', {
        method: 'POST',
        body: JSON.stringify({ packCode }),
      });
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to install pack');
    } finally {
      setBusyCode(null);
    }
  };

  const uninstall = async (packCode: string) => {
    setBusyCode(packCode);
    try {
      await apiFetch('/trade-packs/uninstall', {
        method: 'POST',
        body: JSON.stringify({ packCode }),
      });
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to uninstall pack');
    } finally {
      setBusyCode(null);
    }
  };

  if (!enabled) {
    return (
      <DashboardShell>
        <div className="card">
          <h1>Trade Packs</h1>
          <p className="muted">Trade Packs are currently disabled.</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="card">
        <h1>Trade Packs</h1>
        <p className="muted">Start faster with ready-made industry presets for services, pricing, and customer messaging.</p>
        <p className="muted">
          Plan: {planMeta.planCode.replace('_', ' ')} | Installed: {installedCount}
          {planMeta.planLimit !== null ? ` / ${planMeta.planLimit}` : ''}
        </p>
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}

        {planMeta.planLimit !== null && installedCount >= planMeta.planLimit ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <strong>Pack limit reached</strong>
            <p className="muted">Upgrade your plan to install more trade packs.</p>
            <Link className="button" href="/dashboard/billing">View upgrade options</Link>
          </div>
        ) : null}

        <div className="list">
          {packs.map((pack) => (
            <div key={pack.code} className="integration-card">
              <div>
                <strong>{pack.name}</strong>
                <p className="muted">{pack.description}</p>
                <div className="pill-row" style={{ marginTop: 8 }}>
                  {pack.tags.map((tag) => (
                    <span className="pill" key={`${pack.code}-${tag}`}>#{tag}</span>
                  ))}
                </div>
                <ul className="muted" style={{ marginTop: 10 }}>
                  {pack.includes.map((entry) => (
                    <li key={`${pack.code}-${entry}`}>{entry}</li>
                  ))}
                </ul>
              </div>
              <div className="integration-actions">
                {pack.installed ? <span className="badge">Installed</span> : <span className="badge warn">Not installed</span>}
                {pack.installed ? (
                  <button className="button secondary" onClick={() => uninstall(pack.code)} disabled={busyCode === pack.code}>
                    Remove
                  </button>
                ) : (
                  <button className="button" onClick={() => install(pack.code)} disabled={busyCode === pack.code}>
                    Install
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
