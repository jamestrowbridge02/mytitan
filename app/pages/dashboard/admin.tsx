import { useEffect, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';

const TILES = [
  { label: 'Company / Branding', href: '/dashboard/settings' },
  { label: 'Locations', href: '/dashboard/locations' },
  { label: 'Users & Roles', href: '/dashboard/users' },
  { label: 'Service plans', href: '/dashboard/service-plans' },
  { label: 'Integrations', href: '/dashboard/integrations' },
  { label: 'Billing', href: '/dashboard/billing' },
  { label: 'Inventory', href: '/dashboard/inventory' },
  { label: 'Email templates', href: '/dashboard/email-templates' },
  { label: 'Security', href: '/verify-email' },
];

export default function AdminHubPage() {
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    apiFetch('/me').then(setMe).catch(() => setMe(null));
  }, []);

  const allowed = me?.role === 'OWNER' || me?.role === 'ADMIN';

  return (
    <DashboardShell>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Admin Hub</h1>
        <p className="muted">Configure your tenant without digging through menus.</p>
        {!allowed ? <p style={{ color: '#ffb84d' }}>Owner/Admin access required.</p> : null}
      </div>

      {allowed ? (
        <div className="metrics-grid" style={{ marginTop: 16 }}>
          {TILES.map((tile) => (
            <a className="card" key={tile.href} href={tile.href} style={{ display: 'block' }}>
              <strong>{tile.label}</strong>
              <p className="muted" style={{ marginBottom: 0 }}>Open</p>
            </a>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
