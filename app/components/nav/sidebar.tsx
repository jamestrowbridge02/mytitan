import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";
import { NAV_GROUPS, NavItem, NavGroup } from "./nav-config";

function isTruthyEnv(v: any) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

function isActive(pathname: string, href?: string) {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function canShow(item: NavItem) {
  const devAllowed =
    typeof window !== "undefined" &&
    (isTruthyEnv(process.env.NEXT_PUBLIC_DEV_ADMIN) ||
      window.localStorage.getItem("MYTITAN_DEV") === "1");

  if (item.devOnly && !devAllowed) return false;

  if (item.featureFlag) {
    const v = (process.env as any)[item.featureFlag];
    if (!isTruthyEnv(v)) return false;
  }

  return true;
}

function useCollapsedGroups(key: string) {
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setCollapsed(JSON.parse(raw));
    } catch {}
  }, [key]);
  React.useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(collapsed));
    } catch {}
  }, [key, collapsed]);
  return { collapsed, setCollapsed };
}

function SidebarGroup({
  group,
  pathname,
}: {
  group: NavGroup;
  pathname: string;
}) {
  const { collapsed, setCollapsed } = useCollapsedGroups("mytitan_sidebar_groups");
  const label = group.title;
  const isCollapsed = Boolean(collapsed[label]);

  const toggle = () => setCollapsed((p) => ({ ...p, [label]: !p[label] }));

  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={toggle}
        className="w-full px-3 pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground/80"
      >
        {label}
      </button>

      {isCollapsed ? null : (
        <div className="space-y-1">
          {group.items.filter(canShow).map((item) => (
            <SidebarItem key={item.title} item={item} pathname={pathname} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarItem({
  item,
  pathname,
  depth,
}: {
  item: NavItem;
  pathname: string;
  depth: number;
}) {
  const [open, setOpen] = React.useState(false);
  const hasChildren = Boolean(item.children?.length);

  React.useEffect(() => {
    // auto-open if any child matches current route
    if (hasChildren && item.children!.some((c) => isActive(pathname, c.href))) {
      setOpen(true);
    }
  }, [pathname, hasChildren, item.children]);

  if (hasChildren) {
    const anyChildActive = item.children!.some((c) => isActive(pathname, c.href));
    return (
      <div className="rounded-xl">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={[
            "flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm border transition",
            depth > 0 ? "ml-3" : "",
            anyChildActive
              ? "bg-[color:var(--surface-1)] text-foreground border-white/15 shadow-sm"
              : "text-foreground/80 border-transparent hover:bg-[color:var(--surface-1)] hover:text-foreground hover:border-white/10",
          ].join(" ")}
        >
          <span className="truncate">{item.title}</span>
          <span className="text-xs text-muted-foreground">{open ? "–" : "+"}</span>
        </button>

        {open ? (
          <div className="mt-1 space-y-1 pl-4">
            {item.children!.filter(canShow).map((c) => (
              <SidebarLeaf key={c.title} item={c} pathname={pathname} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return <SidebarLeaf item={item} pathname={pathname} />;
}

function SidebarLeaf({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const href = item.href || "/dashboard"; // never '#'

  return (
    <Link
      href={href}
      className={[
        "flex items-center justify-between rounded-xl px-3 py-2 text-sm border transition",
        active
          ? "bg-[color:var(--surface-1)] text-foreground border-white/15 shadow-sm"
          : "text-foreground/80 border-transparent hover:bg-[color:var(--surface-1)] hover:text-foreground hover:border-white/10",
      ].join(" ")}
    >
      <span className="truncate">{item.title}</span>
      {active ? <span className="h-2 w-2 rounded-full bg-[color:var(--brand-600)]" /> : null}
    </Link>
  );
}

export default function Sidebar() {
  const router = useRouter();
  const pathname = router.pathname;

  return (
    <aside className="hidden md:block h-screen w-[280px] shrink-0 border-r border-border/60 bg-[color:var(--surface-0)]">
      <div className="flex h-full flex-col">
        <div className="px-4 py-4">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[color:var(--brand-600)] shadow-sm" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">MyTitan</div>
              <div className="text-xs text-muted-foreground">Business OS</div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-6">
          {NAV_GROUPS.map((g) => (
            <SidebarGroup key={g.title} group={g} pathname={pathname} />
          ))}
        </nav>
      </div>
    </aside>
  );
}
