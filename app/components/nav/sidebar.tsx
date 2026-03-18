import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";
import { NAV_GROUPS, NavItem } from "./nav-config";
import { apiFetch } from "../../lib/api";
import { getBusinessTerms, getCommandCentreHref, getOptionalModuleVisibility } from "../../lib/business-config";
import { useTenantSettings } from "../../lib/tenant-settings";
import { emptyPermissionSnapshot, normalizePermissionSnapshot } from "../../lib/workspace-permissions";
import MyTitanLogo from "../brand/mytitan-logo";

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

export default function Sidebar({ desktopWidth = 292 }: { desktopWidth?: number }) {
  const router = useRouter();
  const { settings } = useTenantSettings();
  const [permissions, setPermissions] = React.useState(() => emptyPermissionSnapshot());
  const terms = getBusinessTerms(settings);
  const commandCentreHref = getCommandCentreHref(settings);
  const moduleVisibility = getOptionalModuleVisibility(settings);
  const path = router.asPath || router.pathname || "";

  const showSidebar = path.startsWith("/dashboard") || path === "/dashboard";
  if (!showSidebar) return null;

  React.useEffect(() => {
    let cancelled = false;
    const loadMe = async () => {
      try {
        const me = await apiFetch("/me");
        if (!cancelled) {
          setPermissions(normalizePermissionSnapshot(me?.permissions));
        }
      } catch {
        if (!cancelled) {
          setPermissions(emptyPermissionSnapshot());
        }
      }
    };
    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  function canAccessHref(href?: string) {
    if (!href) return true;
    if (href.startsWith("/dashboard/settings")) return permissions["settings.manage"];
    if (href.startsWith("/dashboard/service-plans")) return permissions["settings.manage"];
    if (href.startsWith("/dashboard/quotes")) return permissions["billing.manage"];
    if (href.startsWith("/dashboard/revenue")) return permissions["billing.manage"];
    if (href.startsWith("/dashboard/scheduling")) return permissions["jobs.transition"] || permissions["dashboard.view_intelligence"] || permissions["technician.execute"];
    if (href.startsWith("/dashboard/billing")) return permissions["billing.manage"];
    if (href.startsWith("/dashboard/portal")) return permissions["portal.manage"];
    if (href.startsWith("/dashboard/technician")) return permissions["technician.execute"];
    if (href.startsWith("/dashboard/analytics")) return permissions["dashboard.view_intelligence"];
    if (href.startsWith("/dashboard/compliance")) return permissions["dashboard.view_intelligence"];
    if (href.startsWith("/dashboard/executive")) return permissions["dashboard.view_intelligence"];
    if (href.startsWith("/dashboard/intelligence")) return permissions["dashboard.view_intelligence"];
    return true;
  }

  return (
    <aside
      className="mt-sidebar fixed inset-y-0 left-0 z-20 hidden h-screen shrink-0 md:block"
      style={{ width: desktopWidth, flex: `0 0 ${desktopWidth}px` }}
    >
      <div className="flex h-full flex-col px-3 py-3">
        <div className="mt-sidebar__brand rounded-2xl px-3 py-3">
          <Link href="/dashboard" className="mt-sidebar__brandLink flex items-center justify-between gap-3">
            <div>
              <MyTitanLogo size="sm" className="mt-sidebar__brandLogo" />
              <div className="mt-sidebar__kicker mt-2 text-[11px]">Business OS</div>
            </div>
            <span className="mt-sidebar__brandBadge">Operator</span>
          </Link>
        </div>

        <nav className="mt-3 flex-1 overflow-y-auto px-1 pb-2">
          {NAV_GROUPS.map((g) => {
            const visibleItems = g.items
              .filter(canShow)
              .filter((item) => {
                if (!canAccessHref(item.href)) return false;
                if (item.href === "/dashboard/intelligence") return moduleVisibility.showIntelligence;
                if (item.href === "/dashboard/compliance") return moduleVisibility.showIntelligence;
                if (item.href === "/dashboard/executive") return moduleVisibility.showIntelligence;
                if (item.href === "/dashboard/portal") return moduleVisibility.showPortalOps;
                if (item.href === "/dashboard/technician") return moduleVisibility.showTechnicianQueue;
                return true;
              })
              .map((item) => {
                if (item.title === "Command Centre") return { ...item, href: commandCentreHref };
                if (item.title === "Jobs") return { ...item, title: terms.jobs };
                if (item.title === "Customers") return { ...item, title: terms.customers };
                if (item.title === "Bookings") return { ...item, title: terms.bookings };
                return item;
              });
            if (!visibleItems.length) return null;

            return (
              <div key={g.title} className="mb-4">
                {g.title ? (
                  <div className="mt-sidebar__groupTitle w-full px-2 pb-2 text-left text-[11px] font-semibold uppercase">
                    {g.title}
                  </div>
                ) : null}

                <div className="space-y-1">
                  {visibleItems.map((it) => {
                    const href = it.href || "#";
                    const active = isActive(path, href);

                    return (
                      <Link
                        key={it.title}
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cx(
                          "mt-sidebar__item flex items-center justify-between rounded-xl px-3 py-2 text-[13px]",
                          active && "shadow-sm"
                        )}
                      >
                        <span className="truncate">{it.title}</span>
                        <span className="mt-sidebar__dot h-2 w-2 rounded-full bg-[color:var(--brand-600)]" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
