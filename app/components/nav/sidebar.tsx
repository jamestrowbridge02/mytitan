import Link from 'next/link';
import { useRouter } from 'next/router';
import React from 'react';
import { NAV_GROUPS, NavItem } from './nav-config';

function isActive(pathname: string, href?: string) {
  if (!href) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

function canShow(item: NavItem) {
  // Client-visible gate only. Real auth is enforced server-side.
  const devEnabled =
    typeof window !== 'undefined' &&
    (process.env.NEXT_PUBLIC_DEV_ADMIN === 'on' || process.env.NEXT_PUBLIC_DEV_ADMIN === 'true');

  if (item.devOnly && !devEnabled) return false;

  if (item.featureFlag) {
    const v = (process.env as any)[item.featureFlag];
    if (v === 'off' || v === 'false' || v === '' || v == null) return false;
  }

  return true;
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();

  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem('mytitan_nav_collapsed');
      if (raw) setCollapsed(JSON.parse(raw));
    } catch {}
  }, []);
  React.useEffect(() => {
    try {
      window.localStorage.setItem('mytitan_nav_collapsed', JSON.stringify(collapsed));
    } catch {}
  }, [collapsed]);

  return (
    </div>
  );
}

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:block h-screen w-[280px] shrink-0 border-r border-border/60 bg-[color:var(--surface-0)]">
        <SidebarContent />
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="md:hidden sticky top-0 z-20 border-b border-border/60 bg-[color:var(--surface-0)]">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
            aria-label="Open navigation"
          >
            Menu
          </button>
          <Link href="/dashboard" className="text-sm font-semibold">
            MyTitan
          </Link>
          <div className="w-[54px]" />
        </div>
      </div>

      {mobileOpen ? (
        <div className="md:hidden fixed inset-0 z-30">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[85vw] max-w-[320px] border-r border-border/60 bg-[color:var(--surface-0)]">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
