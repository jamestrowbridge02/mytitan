import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DashboardShell } from '../../components/dashboard-shell';
import { GuidedSetupProgress } from '../../components/guided-setup-progress';
import { apiFetch } from '../../lib/api';
import { isGuidedSetupV2Enabled, isMarketplaceEnabled, isTradePacksEnabled } from '../../lib/feature-flags';
import { useTenantSettings } from '../../lib/tenant-settings';

type ChecklistItem = {
  key: string;
  title: string;
  description: string;
  completed: boolean;
  href: string;
};

export default function SetupChecklist() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [installedPackCount, setInstalledPackCount] = useState(0);
  const [error, setError] = useState('');
  const marketplaceEnabled = isMarketplaceEnabled();
  const tradePacksEnabled = isTradePacksEnabled();
  const guidedSetupEnabled = isGuidedSetupV2Enabled();
  const { settings } = useTenantSettings();

  useEffect(() => {
    if (!marketplaceEnabled) return;
    const load = async () => {
      try {
        const [checklist, installed] = await Promise.all([
          apiFetch('/setup/checklist'),
          tradePacksEnabled ? apiFetch('/trade-packs/installed') : Promise.resolve({ count: 0 }),
        ]);
        setItems(checklist.items || []);
        setCompletedCount(checklist.completedCount || 0);
        setTotal(checklist.total || 0);
        setInstalledPackCount(Number(installed?.count || 0));
      } catch (err: any) {
        setError(err.message || 'Failed to load checklist');
      }
    };
    load();
  }, [marketplaceEnabled, tradePacksEnabled]);

  const recommendation = useMemo(() => {
    if (tradePacksEnabled && installedPackCount === 0) {
      return {
        title: 'Install a trade pack first',
        description: 'This gives you ready-made services, pricing presets, and customer messaging in one click.',
        href: '/dashboard/trade-packs',
      };
    }

    const next = [
      { key: 'logo', title: 'Add your branding', href: '/dashboard/settings', description: 'Customers trust a branded quote and invoice.' },
      { key: 'support_email', title: 'Confirm support email', href: '/dashboard/settings', description: 'Replies from customers go to the right inbox.' },
      { key: 'catalog', title: 'Set your pricing', href: '/dashboard/catalog', description: 'Clear prices speed up quoting and approvals.' },
      { key: 'bookings', title: 'Set booking hours', href: '/dashboard/bookings', description: 'Customers can only book times you actually work.' },
      { key: 'invite', title: 'Invite your first teammate', href: '/dashboard/users', description: 'Share the workload with your staff.' },
    ];

    for (const candidate of next) {
      const item = items.find((entry) => entry.key === candidate.key);
      if (item && !item.completed) {
        return { title: candidate.title, description: candidate.description, href: candidate.href };
      }
    }

    return {
      title: 'Create your first job',
      description: 'You are setup-ready. Create your first live customer job now.',
      href: '/dashboard/jobs/new',
    };
  }, [items, installedPackCount, tradePacksEnabled]);

  if (!marketplaceEnabled) {
    return (
      <DashboardShell>
        <div className="card">
          <h1>Setup checklist</h1>
          <p className="muted">The guided checklist is currently disabled.</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <GuidedSetupProgress enabled={guidedSetupEnabled} incomplete={!settings?.guidedSetupCompletedAt} />
      <div className="card" style={{ marginBottom: 16 }}>
        <h1>Setup checklist</h1>
        <p className="muted">
          {completedCount}/{total} complete. Follow the quick actions to finish your setup.
        </p>
        <div className="integration-card" style={{ marginTop: 12 }}>
          <div>
            <strong>Recommended next action</strong>
            <p className="muted" style={{ marginTop: 6 }}>{recommendation.description}</p>
          </div>
          <div className="integration-actions">
            <Link className="button" href={recommendation.href}>{recommendation.title}</Link>
            {guidedSetupEnabled ? (
              <Link className="button secondary" href="/dashboard/setup-wizard">Open guided setup</Link>
            ) : null}
          </div>
        </div>
        {error && <p style={{ color: '#ff8a8a', marginTop: 12 }}>{error}</p>}
      </div>

      <div className="card">
        <div className="list">
          {items.map((item) => (
            <div key={item.key} className="integration-card">
              <div>
                <strong>{item.title}</strong>
                <p className="muted">{item.description}</p>
                <p className="muted" style={{ marginTop: 6 }}>Why it matters: your customers will see this first.</p>
              </div>
              <div className="integration-actions">
                {item.completed ? <span className="badge">Done</span> : <span className="badge warn">Pending</span>}
                <Link className="button secondary" href={item.href}>
                  Open
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
