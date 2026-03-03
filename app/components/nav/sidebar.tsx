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
  const devFlag = (process.env.NEXT_PUBLIC_DEV_ADMIN || '').trim().toLowerCase();
  const devEnabled = typeof window !== 'undefined' && (devFlag === 'on' || devFlag === 'true' || devFlag === '1');

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
    <div className="flex h-full flex-col">
      <div className="px-4 py-4">
        <Link href="/dashboard" className="flex items-center gap-3" onClick={onNavigate}>
          <div className="h-9 w-9 rounded-xl bg-[color:var(--brand-600)] shadow-sm" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">MyTitan</div>
            <div className="text-xs text-muted-foreground">Business OS</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-6">
        {NAV_GROUPS.map((group) => {
          const key = group.title;
          const isCollapsed = Boolean(collapsed[key]);
          const visibleItems = group.items.filter(canShow);

          if (visibleItems.length === 0) return null;

          return (
            <div key={group.title} className="mb-5">
              <button
                type="button"
                onClick={() => setCollapsed((p) => ({ ...p, [key]: !isCollapsed }))}
                className="w-full px-3 pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground/80"
              >
                {group.title}
              </button>

              {!isCollapsed ? (
                <div className="space-y-1">
                  {visibleItems.map((item) => {
                    const active = isActive(router.pathname, item.href);
                    return (
                      <Link
                        key={item.title}
                        href={item.href || '#'}
                        onClick={onNavigate}
                        className={[ "text-foreground", 
                          'flex items-center justify-between rounded-xl px-3 py-2 text-sm border transition',
                          active
                            ? 'bg-[color:var(--surface-1)] text-foreground border-white/15 shadow-sm'
                            : 'text-foreground/80 border-transparent hover:bg-[color:var(--surface-1)] hover:text-foreground hover:border-white/10',
                        ].join(' ')}
                      >
                        <span className="truncate">{item.title}</span>
                        {active ? <span className="h-2 w-2 rounded-full bg-[color:var(--brand-600)]" /> : null}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
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
