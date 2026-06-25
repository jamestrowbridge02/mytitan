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

type SidebarRoleMode = "owner" | "finance" | "technician" | "operator";

function normalizePath(path: string) {
  const clean = path.split(/[?#]/, 1)[0]?.trim() || "/";
  if (clean.length > 1 && clean.endsWith("/")) {
    return clean.replace(/\/+$/, "");
  }
  return clean || "/";
}

function normalizeSettingsTab(tab: string | null | undefined) {
  const raw = String(tab || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "workspace" || raw === "appearance" || raw === "business" || raw === "billing") return "general";
  if (raw === "customers") return "output";
  if (raw === "email") return "messages";
  if (raw === "workflow") return "jobs";
  if (raw === "pricing") return "services";
  if (raw === "custom_fields" || raw === "automation_rules" || raw === "ai" || raw === "features") return "advanced";
  return raw;
}

function isActive(pathname: string, href?: string) {
  if (!href) return false;
  const currentUrl = new URL(pathname, "http://mytitan.local");
  const targetUrl = new URL(href, "http://mytitan.local");
  const current = normalizePath(currentUrl.pathname);
  const target = normalizePath(targetUrl.pathname);

  if (target === "/") return current === "/";
  if (target === "/dashboard") return current === "/dashboard";
  if (target === "/dashboard/settings") {
    const targetTab = normalizeSettingsTab(targetUrl.searchParams.get("tab"));
    if (!targetTab) return current === target;
    return current === target && normalizeSettingsTab(currentUrl.searchParams.get("tab")) === targetTab;
  }

  return current === target || current.startsWith(target + "/");
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

function resolveSidebarRoleMode(permissions: Record<string, boolean>, role?: string | null): SidebarRoleMode {
  const normalizedRole = String(role || "").trim().toUpperCase();
  if (normalizedRole === "OWNER" || normalizedRole === "ADMIN" || normalizedRole === "DISPATCHER") return "owner";
  if (normalizedRole === "FINANCE") return "finance";
  if (normalizedRole === "TECHNICIAN" || normalizedRole === "EXTERNAL_OPERATOR") return "technician";

  const canManageSettings = Boolean(permissions["settings.manage"] || permissions["users.invite"] || permissions["users.role_assign"]);
  const canViewIntelligence = Boolean(permissions["dashboard.view_intelligence"]);
  const canManageBilling = Boolean(permissions["billing.manage"]);
  const canExecuteFieldWork = Boolean(permissions["technician.execute"]);

  if (canExecuteFieldWork && !canManageSettings && !canManageBilling) return "technician";
  if (canManageBilling && !canManageSettings) return "finance";
  if (canManageSettings || canViewIntelligence) return "owner";
  return "operator";
}

function shouldShowForRole(item: NavItem, roleMode: SidebarRoleMode) {
  const href = item.href || "";
  if (roleMode === "owner" || roleMode === "operator") return true;

  if (roleMode === "finance") {
    if (href === "/dashboard/work") return false;
    if (href === "/dashboard/command-centre-v2") return false;
    if (href === "/dashboard/jobs") return false;
    if (href === "/dashboard/scheduling" || href === "/dashboard/calendar") return false;
    if (href === "/dashboard/bookings") return false;
    if (href === "/dashboard/compliance") return false;
    if (href === "/dashboard/portal") return false;
    if (href === "/dashboard/service-plans") return false;
    if (href === "/dashboard/users") return false;
    return true;
  }

  if (roleMode === "technician") {
    const allowed = new Set([
      "/dashboard",
      "/dashboard/work",
      "/dashboard/technician",
      "/dashboard/jobs",
      "/dashboard/scheduling",
      "/dashboard/calendar",
      "/dashboard/customers",
      "/dashboard/notifications",
    ]);
    if (allowed.has(href)) return true;
    if (href.startsWith("/dashboard/jobs/")) return true;
    return false;
  }

  return true;
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
    case "work":
      return <svg {...common}><path d="M9 5h6" /><path d="M9 3h6v4H9z" /><rect x="5" y="5" width="14" height="16" rx="2" /><path d="m8 13 2.5 2.5L16 10" /></svg>;
    case "technician":
      return <svg {...common}><circle cx="12" cy="7" r="3" /><path d="M6 21v-3a6 6 0 0 1 12 0v3" /><path d="M9 13.8 12 17l3-3.2" /></svg>;
    case "assets":
      return <svg {...common}><path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.4 2.4-3-3 2.4-2.4Z" /></svg>;
    case "calendar":
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>;
    case "bookings":
      return <svg {...common}><path d="M6 4h10a2 2 0 0 1 2 2v14l-7-4-7 4V6a2 2 0 0 1 2-2z" /></svg>;
    case "customers":
      return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M20 8v6M23 11h-6" /></svg>;
    case "portal":
      return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="M8 14h3M8 17h7" /></svg>;
    case "mail":
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>;
    case "team":
      return <svg {...common}><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="10" cy="8" r="3.5" /><path d="M17 11a3 3 0 1 0 0-6" /><path d="M20 20v-1a3 3 0 0 0-2.2-2.9" /></svg>;
    case "plans":
      return <svg {...common}><path d="M4 6h16" /><path d="M4 12h10" /><path d="M4 18h7" /></svg>;
    case "quotes":
      return <svg {...common}><path d="M7 7h10" /><path d="M7 12h10" /><path d="M7 17h6" /><rect x="4" y="4" width="16" height="16" rx="2" /></svg>;
    case "revenue":
      return <svg {...common}><path d="M12 3v18" /><path d="M17 7c0-2-2.2-3-5-3s-5 1-5 3 2.2 3 5 3 5 1 5 3-2.2 3-5 3-5-1-5-3" /></svg>;
    case "billing":
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></svg>;
    case "integrations":
      return <svg {...common}><path d="M8 8l-4 4 4 4" /><path d="M16 8l4 4-4 4" /><path d="M10 19l4-14" /></svg>;
    case "enterprise":
      return <svg {...common}><path d="M4 21V7l8-4 8 4v14" /><path d="M9 21v-4h6v4M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01" /></svg>;
    case "automations":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.36 9c.17.53.69.9 1.24.91H21a2 2 0 1 1 0 4h-.09c-.55.01-1.07.38-1.24.91Z" /></svg>;
    case "settings":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21h-4v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.87.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.64 15a1.7 1.7 0 0 0-1.55-1H3v-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.64a1.7 1.7 0 0 0 1-1.55V3h4v.09A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.87-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.36 9c.17.53.69.9 1.24.91H21v4h-.09c-.55.01-1.07.38-1.24.91Z" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

export default function Sidebar({
  desktopWidth = 88,
  mode = "desktop",
  open = false,
  onClose,
}: {
  desktopWidth?: number;
  mode?: "desktop" | "mobile";
  open?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const { settings } = useTenantSettings();
  const logoutEnabled = isLogoutV1Enabled();
  const [permissions, setPermissions] = React.useState(() => emptyPermissionSnapshot());
  const [workspaceRole, setWorkspaceRole] = React.useState<string | null>(null);
  const terms = getBusinessTerms(settings);
  const commandCentreHref = getCommandCentreHref(settings);
  const moduleVisibility = getOptionalModuleVisibility(settings);
  const path = router.asPath || router.pathname || "";
  const roleMode = resolveSidebarRoleMode(permissions, workspaceRole);

  const showSidebar = path.startsWith("/dashboard") || path === "/dashboard";

  React.useEffect(() => {
    if (!showSidebar) {
      setPermissions(emptyPermissionSnapshot());
      setWorkspaceRole(null);
      return;
    }
    let cancelled = false;
    const loadMe = async () => {
      try {
        const me = await apiFetch("/me");
        if (!cancelled) {
          setPermissions(normalizePermissionSnapshot(me?.permissions));
          setWorkspaceRole(typeof me?.role === "string" ? me.role : null);
        }
      } catch {
        if (!cancelled) {
          setPermissions(emptyPermissionSnapshot());
          setWorkspaceRole(null);
        }
      }
    };
    void loadMe();
    return () => {
      cancelled = true;
    };
  }, [showSidebar]);

  if (!showSidebar) return null;
  if (mode === "mobile" && !open) return null;

  const isMobile = mode === "mobile";

  function openRouteSearch() {
    onClose?.();
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("mytitan:open-command-palette", { detail: { routesOnly: true } }));
    }, 0);
  }

  function canAccessHref(href?: string) {
    if (!href) return true;
    const parsed = new URL(href, "http://mytitan.local");
    if (parsed.pathname.startsWith("/dashboard/settings")) {
      const settingsTab = normalizeSettingsTab(parsed.searchParams.get("tab"));
      if (settingsTab === "jobs" || settingsTab === "services" || settingsTab === "team" || settingsTab === "bookings") {
        return permissions["workflow.manage"];
      }
      if (settingsTab === "advanced") {
        return permissions["settings.manage"] || permissions["custom_fields.manage"] || permissions["automations.manage"];
      }
      return permissions["settings.manage"];
    }
    if (href.startsWith("/dashboard/users")) return permissions["users.invite"] || permissions["users.role_assign"];
    if (href.startsWith("/dashboard/service-plans")) return permissions["settings.manage"];
    if (href.startsWith("/dashboard/quotes")) return permissions["billing.manage"];
    if (href.startsWith("/dashboard/revenue")) return permissions["billing.manage"];
    if (href.startsWith("/dashboard/scheduling")) return permissions["jobs.transition"] || permissions["dashboard.view_intelligence"] || permissions["technician.execute"];
    if (href.startsWith("/dashboard/calendar")) return permissions["jobs.transition"] || permissions["dashboard.view_intelligence"] || permissions["technician.execute"];
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
        if (!shouldShowForRole(item, roleMode)) return false;
        return true;
      })
      .map((item) => {
        if (item.title === "Live Work") return { ...item, href: commandCentreHref };
        if (item.title === "Jobs") return { ...item, title: terms.jobs };
        if (item.title === "Customers") return { ...item, title: terms.customers };
        if (item.title === "Bookings") return { ...item, title: "Bookings", sidebarTitle: "Bookings" };
        return item;
      });

    return { ...g, items: visibleItems };
  }).filter((group) => group.items.length > 0);

  return (
    <aside
      aria-label={isMobile ? "Mobile navigation" : undefined}
      className={cx(
        "mt-sidebar fixed inset-y-0 left-0 h-screen shrink-0",
        isMobile ? "mt-sidebar--mobileDrawer z-[70] md:hidden" : "mt-sidebar--desktopRail z-40 hidden md:block",
      )}
      id={isMobile ? "mt-mobile-nav" : undefined}
      style={
        {
          "--mt-sidebar-collapsed-width": `${desktopWidth}px`,
          "--mt-sidebar-expanded-width": "208px",
        } as React.CSSProperties
      }
    >
      <div className="mt-sidebar__frame flex h-full min-h-0 flex-col px-2 py-2.5">
        {isMobile ? (
          <div className="mt-sidebar__mobileHeader">
            <Link href="/dashboard" className="mt-sidebar__mobileBrand" aria-label="MyTitan dashboard home" onClick={() => onClose?.()}>
              <MyTitanLogo variant="wordmark" size="md" />
            </Link>
            <button type="button" className="mt-sidebar__mobileClose" onClick={onClose} aria-label="Close navigation">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 6l12 12" />
                <path d="M18 6 6 18" />
              </svg>
            </button>
          </div>
        ) : null}
        <div className="mt-sidebar__brand rounded-[24px] px-1.5 py-1.5" data-testid="sidebar-brand">
          <Link href="/dashboard" className="mt-sidebar__brandLink flex items-center justify-center" aria-label="MyTitan dashboard home" title="MyTitan dashboard home" onClick={() => onClose?.()}>
            <MyTitanLogo variant={isMobile ? "wordmark" : "mark"} size={isMobile ? "md" : "lg"} className="mt-sidebar__brandLogo" />
          </Link>
        </div>

        <button
          type="button"
          className="mt-sidebar__search"
          aria-label="Search workspace routes"
          data-testid="sidebar-global-search"
          onClick={openRouteSearch}
        >
          <span className="mt-sidebar__searchIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="6" />
              <path d="m16 16 4 4" />
            </svg>
          </span>
          <span className="mt-sidebar__searchText">Search...</span>
        </button>

        <div className="mt-sidebar__navWrap mt-3 min-h-0 flex-1" data-testid="sidebar-nav-wrap">
          <nav className="mt-sidebar__nav px-0" aria-label="Operator navigation" data-testid="sidebar-nav">
            {navGroups.map((group, groupIndex) => (
              <div key={group.title || `group-${groupIndex}`} className="mt-sidebar__group">
                {groupIndex > 0 ? <div className="mt-sidebar__groupDivider" aria-hidden="true" /> : null}
                <div className="mt-sidebar__iconList">
                  {group.items.map((it) => {
                    const href = it.href || "#";
                    const active = isActive(path, href);
                    const sidebarLabel = it.sidebarTitle ?? it.title;

                    return (
                      <Link
                        key={it.title}
                        href={href}
                        aria-current={active ? "page" : undefined}
                        aria-label={sidebarLabel}
                        title={sidebarLabel}
                        onClick={() => onClose?.()}
                        className={cx(
                          "mt-sidebar__item group relative",
                          active && "shadow-sm"
                        )}
                      >
                        <span className="mt-sidebar__icon" aria-hidden="true">
                          <SidebarIcon icon={it.icon} />
                        </span>
                        <span className="mt-sidebar__label" aria-hidden="true">{sidebarLabel}</span>
                        <span className="mt-sidebar__dot h-1.5 w-1.5 rounded-full bg-[color:var(--brand-600)]" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-sidebar__footer px-0 pb-1 pt-2" data-testid="sidebar-footer">
          <button
            type="button"
            className="mt-sidebar__logout w-full"
            onClick={() => {
              onClose?.();
              void signOut();
            }}
            data-testid="sidebar-logout"
            aria-label="Sign out"
            title="Sign out"
          >
            <span className="mt-sidebar__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </span>
            <span className="mt-sidebar__label" aria-hidden="true">Sign out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
