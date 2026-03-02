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
  // Dev-only gate: use a safe client-side signal.
  // You can replace this with real RBAC once user session info is available in the app shell.
  const isDev =
    typeof window !== "undefined" &&
    (localStorage.getItem("MYTITAN_DEV") === "1" ||
      (process.env.NEXT_PUBLIC_DEV_ADMIN === "on"));

  if (item.devOnly && !isDev) return false;

  if (item.featureFlag) {
    const v = (process.env as any)[item.featureFlag];
    if (v === "off" || v === "false" || v === "" || v == null) return false;
  }

  return true;
}

export default function Sidebar() {
  const router = useRouter();
  const [open, setOpen] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    // Expand groups containing the current route
    const next: Record<string, boolean> = {};
    for (const g of NAV_GROUPS) {
      for (const it of g.items) {
        if (it.children?.some((c) => isActive(router.pathname, c.href))) {
          next[it.title] = true;
        }
      }
    }
    setOpen((prev) => ({ ...prev, ...next }));
  }, [router.pathname]);

  return (
    <aside className="h-screen w-[280px] shrink-0 border-r border-border/60 bg-[color:var(--surface-0)]">
      <div className="flex h-full flex-col">
        <div className="px-4 py-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-[color:var(--brand-600)] shadow-sm" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">MyTitan</div>
              <div className="text-xs text-muted-foreground">Business OS</div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="mb-5">
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </div>

              <div className="space-y-1">
                {group.items.filter(canShow).map((item) => {
                  const active = isActive(router.pathname, item.href);
                  const hasChildren = !!item.children?.length;

                  if (!hasChildren) {
                    return (
                      <Link
                        key={item.title}
                        href={item.href || "#"}
                        className={[
                          "flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
                          active
                            ? "bg-[color:var(--surface-1)] text-foreground shadow-sm"
                            : "text-foreground/80 hover:bg-[color:var(--surface-1)] hover:text-foreground",
                        ].join(" ")}
                      >
                        <span className="h-2 w-2 rounded-full bg-[color:var(--brand-600)] opacity-70" />
                        <span className="truncate">{item.title}</span>
                      </Link>
                    );
                  }

                  const expanded = open[item.title] ?? false;

                  return (
                    <div key={item.title} className="rounded-xl">
                      <button
                        type="button"
                        onClick={() => setOpen((p) => ({ ...p, [item.title]: !expanded }))}
                        className={[
                          "flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm",
                          item.children?.some((c) => isActive(router.pathname, c.href))
                            ? "bg-[color:var(--surface-1)] text-foreground"
                            : "text-foreground/80 hover:bg-[color:var(--surface-1)] hover:text-foreground",
                        ].join(" ")}
                      >
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[color:var(--brand-600)] opacity-50" />
                          <span className="truncate">{item.title}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">{expanded ? "–" : "+"}</span>
                      </button>

                      {expanded && (
                        <div className="mt-1 space-y-1 pl-5">
                          {item.children!.filter(canShow).map((c) => {
                            const cActive = isActive(router.pathname, c.href);
                            return (
                              <Link
                                key={c.title}
                                href={c.href || "#"}
                                className={[
                                  "block rounded-lg px-3 py-2 text-sm",
                                  cActive
                                    ? "bg-[color:var(--surface-2)] text-foreground"
                                    : "text-muted-foreground hover:bg-[color:var(--surface-2)] hover:text-foreground",
                                ].join(" ")}
                              >
                                {c.title}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border/60 p-3 text-xs text-muted-foreground">
          Tip: set <code>localStorage.MYTITAN_DEV=1</code> to reveal dev admin.
        </div>
      </div>
    </aside>
  );
}
