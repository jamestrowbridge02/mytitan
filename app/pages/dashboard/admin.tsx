import { useEffect, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { OperatorActionTile, OperatorInsightIcon } from '../../components/ui/operator-insights';
import { OperatorStatusBadge } from '../../components/ui/operator-page';
import { apiFetch } from '../../lib/api';

const TILES = [
  { label: 'Company / Branding', href: '/dashboard/settings', icon: 'settings' as const, tone: 'neutral' as const },
  { label: 'Locations', href: '/dashboard/locations', icon: 'calendar' as const, tone: 'info' as const },
  { label: 'Users & Roles', href: '/dashboard/users', icon: 'customers' as const, tone: 'info' as const },
  { label: 'Service plans', href: '/dashboard/service-plans', icon: 'work' as const, tone: 'success' as const },
  { label: 'Scheduling', href: '/dashboard/scheduling', icon: 'calendar' as const, tone: 'warning' as const },
  { label: 'Integrations', href: '/dashboard/integrations', icon: 'spark' as const, tone: 'info' as const },
  { label: 'Billing', href: '/dashboard/billing', icon: 'billing' as const, tone: 'info' as const },
  { label: 'Inventory', href: '/dashboard/inventory', icon: 'work' as const, tone: 'neutral' as const },
  { label: 'Email templates', href: '/dashboard/email-templates', icon: 'mail' as const, tone: 'success' as const },
  { label: 'Security', href: '/verify-email', icon: 'settings' as const, tone: 'critical' as const },
];

export default function AdminHubPage() {
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    apiFetch('/me').then(setMe).catch(() => setMe(null));
  }, []);

  const allowed = me?.role === 'OWNER' || me?.role === 'ADMIN';

  return (
    <DashboardShell>
      <div className="card operator-page">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <OperatorInsightIcon icon="settings" tone="info" label="Admin hub" />
          <div>
            <div className="operator-page__eyebrow">Admin hub</div>
            <h1 style={{ margin: 0 }}>Configure the workspace without digging through menus</h1>
            <p className="muted" style={{ margin: '8px 0 0 0' }}>
              Start with the area you need to change: branding, people, scheduling, integrations, billing, or messaging.
            </p>
          </div>
        </div>
        {!allowed ? <p style={{ color: '#ffb84d', marginTop: 14 }}>Owner/Admin access required.</p> : <OperatorStatusBadge label="Owner or admin access" tone="success" style={{ marginTop: 14 }} />}
      </div>

      {allowed ? (
        <div className="metrics-grid" style={{ marginTop: 16 }}>
          {TILES.map((tile) => (
            <OperatorActionTile
              key={tile.href}
              title={tile.label}
              description="Open this area and change the relevant workspace settings."
              icon={tile.icon}
              tone={tile.tone}
              action={<a className="button secondary" href={tile.href}>Open</a>}
            />
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
