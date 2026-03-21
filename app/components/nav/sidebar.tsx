import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";
import { NAV_GROUPS, NavItem } from "./nav-config";
import { apiFetch, clearToken } from "../../lib/api";
import { getBusinessTerms, getCommandCentreHref, getOptionalModuleVisibility } from "../../lib/business-config";
import { isLogoutV1Enabled } from "../../lib/feature-flags";
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

function SidebarIcon({ icon }: { icon?: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (icon) {
    case "dashboard":
      return <svg {...common}><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10.5V20h14v-9.5" /><path d="M10 20v-5h4v5" /></svg>;
    case "command":
      return <svg {...common}><path d="M8 8h8v8H8z" /><path d="M4 12h4M16 12h4M12 4v4M12 16v4" /></svg>;
    case "analytics":
      return <svg {...common}><path d="M5 19V9" /><path d="M12 19V5" /><path d="M19 19v-7" /></svg>;
    case "shield":
      return <svg {...common}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /></svg>;
    case "jobs":
      return <svg {...common}><path d="M8 7h8" /><path d="M8 12h8" /><path d="M8 17h5" /><path d="M5 7h.01M5 12h.01M5 17h.01" /></svg>;
    case "calendar":
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>;
    case "bookings":
      return <svg {...common}><path d="M6 4h10a2 2 0 0 1 2 2v14l-7-4-7 4V6a2 2 0 0 1 2-2z" /></svg>;
    case "customers":
      return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M20 8v6M23 11h-6" /></svg>;
    case "plans":
      return <svg {...common}><path d="M4 6h16" /><path d="M4 12h10" /><path d="M4 18h7" /></svg>;
    case "quotes":
      return <svg {...common}><path d="M7 7h10" /><path d="M7 12h10" /><path d="M7 17h6" /><rect x="4" y="4" width="16" height="16" rx="2" /></svg>;
    case "revenue":
      return <svg {...common}><path d="M12 3v18" /><path d="M17 7c0-2-2.2-3-5-3s-5 1-5 3 2.2 3 5 3 5 1 5 3-2.2 3-5 3-5-1-5-3" /></svg>;
    case "integrations":
      return <svg {...common}><path d="M8 8l-4 4 4 4" /><path d="M16 8l4 4-4 4" /><path d="M10 19l4-14" /></svg>;
    case "automations":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.36 9c.17.53.69.9 1.24.91H21a2 2 0 1 1 0 4h-.09c-.55.01-1.07.38-1.24.91Z" /></svg>;
    case "settings":
      return <svg {...common}><path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" /><path d="M3 12h2M19 12h2M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

export default function Sidebar({ desktopWidth = 96 }: { desktopWidth?: number }) {
  const router = useRouter();
  const { settings } = useTenantSettings();
  const logoutEnabled = isLogoutV1Enabled();
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

  async function signOut() {
    try {
      if (logoutEnabled) {
        await apiFetch("/auth/logout", { method: "POST" });
      }
    } catch {
      // fall back to local sign-out
    }
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("mytitan_token");
      window.localStorage.removeItem("mytitan_wheels_draft_v1");
      window.localStorage.removeItem("mytitan_demo_tour_seen_v1");
      window.localStorage.removeItem("mytitan_theme_mode");
    }
    clearToken();
    void router.replace("/login");
  }

  const navGroups = NAV_GROUPS.map((g) => {
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

    return { ...g, items: visibleItems };
  }).filter((group) => group.items.length > 0);

  return (
    <aside
      className="mt-sidebar fixed inset-y-0 left-0 z-20 hidden h-screen shrink-0 md:block"
      style={{ width: desktopWidth, flex: `0 0 ${desktopWidth}px` }}
    >
      <div className="flex h-full flex-col px-3 py-3">
        <div className="mt-sidebar__brand rounded-[24px] px-2 py-2">
          <Link href="/dashboard" className="mt-sidebar__brandLink flex items-center justify-center" aria-label="Dashboard home" title="Dashboard home">
            <MyTitanLogo size="sm" className="mt-sidebar__brandLogo" />
          </Link>
        </div>

        <nav className="mt-3 flex-1 overflow-y-auto px-0 pb-2" aria-label="Operator navigation">
          {navGroups.map((group, groupIndex) => (
            <div key={group.title || `group-${groupIndex}`} className="mt-sidebar__group">
              {groupIndex > 0 ? <div className="mt-sidebar__groupDivider" aria-hidden="true" /> : null}
              <div className="mt-sidebar__iconList">
                {group.items.map((it) => {
                  const href = it.href || "#";
                  const active = isActive(path, href);
                  const tooltip = it.description ? `${it.title}: ${it.description}` : it.title;

                  return (
                    <Link
                      key={it.title}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      aria-label={it.title}
                      title={tooltip}
                      className={cx(
                        "mt-sidebar__item group relative flex items-center justify-center rounded-2xl",
                        active && "shadow-sm"
                      )}
                    >
                      <span className="mt-sidebar__icon" aria-hidden="true">
                        <SidebarIcon icon={it.icon} />
                      </span>
                      <span className="mt-sidebar__tooltip" role="tooltip">
                        <span className="mt-sidebar__tooltipTitle">{it.title}</span>
                        {it.description ? <span className="mt-sidebar__tooltipMeta">{it.description}</span> : null}
                      </span>
                      <span className="mt-sidebar__dot h-1.5 w-1.5 rounded-full bg-[color:var(--brand-600)]" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="px-0 pb-1 pt-2">
          <button type="button" className="mt-sidebar__logout w-full" onClick={signOut} data-testid="sidebar-logout" aria-label="Sign out" title="Sign out">
            <span className="mt-sidebar__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </span>
            <span className="mt-sidebar__tooltip" role="tooltip">
              <span className="mt-sidebar__tooltipTitle">Sign out</span>
              <span className="mt-sidebar__tooltipMeta">Leave this workspace</span>
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
