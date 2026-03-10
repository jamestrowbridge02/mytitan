import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";
import { NAV_GROUPS, NavItem } from "./nav-config";

function isActive(pathname: string, href?: string) {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function canShow(item: NavItem) {
  const raw = (process.env.NEXT_PUBLIC_DEV_ADMIN || "").trim().toLowerCase();
  const isDev =
    typeof window !== "undefined" &&
    (window.localStorage.getItem("MYTITAN_DEV") === "1" ||
      raw === "on" ||
      raw === "true" ||
      raw === "1");

  if (item.devOnly && !isDev) return false;

  if (item.featureFlag) {
    const v = String((process.env as any)[item.featureFlag] ?? "").trim().toLowerCase();
    if (v === "off" || v === "false" || v === "") return false;
  }

  return true;
}

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function Sidebar() {
  const router = useRouter();
  const path = router.asPath || router.pathname || "";

  const showSidebar = path.startsWith("/dashboard") || path === "/dashboard";
  if (!showSidebar) return null;

  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({
    Operations: true,
    Money: true,
    Settings: false,
    Admin: true,
  });

  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    for (const g of NAV_GROUPS) {
      for (const it of g.items) {
        if (it.children?.some((c) => isActive(path, c.href))) {
          setCollapsed((prev) => ({ ...prev, [g.title]: false }));
        }
      }
    }
  }, [path]);

  const normalized = q.trim().toLowerCase();
  const isSearching = normalized.length >= 2;

  const searchHits = React.useMemo(() => {
    if (!isSearching) return [];
    const rows: Array<{ group: string; parent?: string; item: NavItem }> = [];
    for (const g of NAV_GROUPS) {
      for (const it of g.items.filter(canShow)) {
        if (it.children?.length) {
          for (const c of it.children.filter(canShow)) {
            rows.push({ group: g.title, parent: it.title, item: c });
          }
        } else {
          rows.push({ group: g.title, item: it });
        }
      }
    }
    return rows
      .filter(({ group, parent, item }) =>
        `${group} ${parent ?? ""} ${item.title} ${item.href ?? ""}`.toLowerCase().includes(normalized)
      )
      .slice(0, 8);
  }, [isSearching, normalized]);

  const primaryQuickLinks = [
    { title: "Dashboard", href: "/dashboard" },
    { title: "Command Centre", href: "/dashboard/command-centre-v2" },
    { title: "Jobs", href: "/dashboard/jobs" },
    { title: "Customers", href: "/dashboard/customers" },
    { title: "Calendar", href: "/dashboard/calendar" },
    { title: "Bookings", href: "/dashboard/bookings" },
    { title: "New job", href: "/dashboard/jobs/new" },
    { title: "Integrations", href: "/dashboard/integrations" },
  ];

  return (
    <aside className="mt-sidebar hidden md:block h-screen w-[292px] shrink-0">
      <div className="flex h-full flex-col px-3 py-3">
        <div className="mt-sidebar__brand rounded-2xl px-3 py-3">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[color:var(--brand-600)] shadow-sm" />
            <div className="leading-tight">
              <div className="text-[13px] font-semibold tracking-[0.2px] text-foreground">
                MyTitan
              </div>
              <div className="mt-sidebar__kicker text-[11px]">Business OS</div>
            </div>
          </Link>

          <div className="mt-3">
            <input
              className="mt-sidebar__search w-full rounded-xl px-3 py-2 text-[13px]"
              placeholder="Search routes"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search navigation"
            />
          </div>

          <div className="mt-2 text-[11px] text-white/45">Ctrl K opens global command search.</div>

          <div className="mt-sidebar__quick mt-3">
            {primaryQuickLinks.map((item) => {
              const active = isActive(path, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "mt-sidebar__quickItem",
                    active && "is-active"
                  )}
                >
                  {item.title}
                </Link>
              );
            })}
          </div>

          {isSearching ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/3 p-1">
              {searchHits.length ? (
                searchHits.map((h, idx) => {
                  const href = h.item.href || "#";
                  const active = isActive(path, href);
                  return (
                    <Link
                      key={`${href}-${idx}`}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "mt-sidebar__item flex items-center justify-between rounded-xl px-3 py-2 text-[13px]",
                        active && "shadow-sm"
                      )}
                    >
                      <span className="truncate">
                        {h.parent ? `${h.parent} · ${h.item.title}` : h.item.title}
                      </span>
                      <span className="mt-sidebar__dot h-2 w-2 rounded-full bg-[color:var(--brand-600)]" />
                    </Link>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-[12px] text-white/55">No matches.</div>
              )}
            </div>
          ) : null}
        </div>

        <nav className="mt-3 flex-1 overflow-y-auto px-1 pb-2">
          {NAV_GROUPS.map((g) => {
            const visibleItems = g.items.filter(canShow);
            if (!visibleItems.length) return null;

            const isCollapsed = Boolean(collapsed[g.title]);
            return (
              <div key={g.title} className="mb-4">
                <button
                  type="button"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [g.title]: !prev[g.title] }))}
                  className="mt-sidebar__groupTitle w-full px-2 pb-2 text-left text-[11px] font-semibold uppercase"
                >
                  <span className="flex items-center justify-between">
                    <span>{g.title}</span>
                    <span className="text-[12px] opacity-70">{isCollapsed ? "+" : "–"}</span>
                  </span>
                </button>

                {isCollapsed ? null : (
                  <div className="space-y-1">
                    {visibleItems.map((it) => {
                      if (it.children?.length) {
                        return (
                          <div key={it.title} className="rounded-xl">
                            <div className="mt-sidebar__subhead px-2 py-1 text-[11px]">
                              {it.title}
                            </div>
                            <div className="space-y-1">
                              {it.children.filter(canShow).map((c) => {
                                const href = c.href || "#";
                                const active = isActive(path, href);
                                return (
                                  <Link
                                    key={c.title}
                                    href={href}
                                    aria-current={active ? "page" : undefined}
                                    className={cx(
                                      "mt-sidebar__item flex items-center justify-between rounded-xl px-3 py-2 text-[13px]",
                                      active && "shadow-sm"
                                    )}
                                  >
                                    <span className="truncate">{c.title}</span>
                                    <span className="mt-sidebar__dot h-2 w-2 rounded-full bg-[color:var(--brand-600)]" />
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      const href = it.href || "#";
                      const active = isActive(path, href);

                      return (
                        <Link
                          key={it.title}
                          href={href}
                          aria-current={active ? "page" : undefined}
                          className="mt-sidebar__item flex items-center justify-between rounded-xl px-3 py-2 text-[13px]"
                        >
                          <span className="truncate">{it.title}</span>
                          <span className="mt-sidebar__dot h-2 w-2 rounded-full bg-[color:var(--brand-600)]" />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
