import Link from 'next/link';
import { useRouter } from 'next/router';
import { clearToken } from '../lib/api';

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const navigation = [
    { label: 'Overview', icon: '◫', href: '/platform' },
    { label: 'Tenants', icon: '⌂', href: '/platform#memberships' },
    { label: 'Tenant 360', icon: '◎', href: '/platform#lookup' },
    { label: 'Commercial', icon: '£', href: '/platform#lookup' },
    { label: 'Revenue', icon: '↗', href: '/platform#revenue' },
    { label: 'Health', icon: '◇', href: '/platform#support' },
    { label: 'Payments', icon: '◈', href: '/platform/configuration' },
    { label: 'Integrations', icon: '⛓', href: '/platform/autopilot' },
    { label: 'Autopilot', icon: '⚡', href: '/platform/autopilot' },
    { label: 'Support Mode', icon: '◉', href: '/platform#lookup' },
    { label: 'Audit', icon: '≣', href: '/platform#lookup' },
    { label: 'Configuration', icon: '⚙', href: '/platform/configuration' },
  ];

  function signOut() {
    clearToken();
    void router.replace('/login');
  }

  return (
    <div className="platform-shell">
      <header className="platform-shell__header">
        <div className="platform-shell__header-inner">
        <div className="platform-shell__brand">
            <div className="platform-shell__eyebrow">Internal only</div>
            <h1>MyTitan Platform Admin</h1>
            <p className="platform-shell__summary">Support, commercial oversight, and workflow monitoring in one protected surface.</p>
            <div className="platform-shell__meta">
              <span className="platform-shell__meta-chip">Authoritative metrics</span>
              <span className="platform-shell__meta-chip">Platform admin only</span>
              <span className="platform-shell__meta-chip">Safe billing truth</span>
            </div>
          </div>
          <nav className="platform-shell__nav" aria-label="Platform operations">
            {navigation.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="button secondary"
                aria-current={router.asPath === item.href ? 'page' : undefined}
              >
                <span aria-hidden="true">{item.icon}</span> {item.label}
              </Link>
            ))}
            <button className="button" type="button" onClick={signOut}>Sign out</button>
          </nav>
        </div>
      </header>
      <main className="platform-shell__main">{children}</main>
    </div>
  );
}
