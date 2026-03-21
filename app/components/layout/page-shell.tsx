import React from "react";
import { useRouter } from "next/router";
import CommandPalette from "../command/command-palette";
import Sidebar from "../nav/sidebar";
import { NAV_GROUPS } from "../nav/nav-config";

const DESKTOP_SIDEBAR_WIDTH = 96;

function resolveTitleFromNav(pathname: string): string | undefined {
  for (const group of NAV_GROUPS as any[]) {
    for (const item of (group.items || [])) {
      if (item?.href && (pathname === item.href || pathname.startsWith(item.href + "/"))) return item.title;
      for (const child of (item?.children || [])) {
        if (child?.href && (pathname === child.href || pathname.startsWith(child.href + "/"))) return child.title;
      }
    }
  }
  return undefined;
}

export function PageShell(props: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const isDashboardRoute = router.pathname === "/dashboard" || router.pathname.startsWith("/dashboard/");
  const navTitle = isDashboardRoute ? undefined : resolveTitleFromNav(router.pathname);
  const title = props.title ?? navTitle;
  const showHeader = Boolean(title || props.subtitle || props.actions);
  const showSidebar = router.pathname === "/dashboard" || router.pathname.startsWith("/dashboard");
  const [showDesktopSidebar, setShowDesktopSidebar] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const syncDesktopSidebar = () => setShowDesktopSidebar(showSidebar && mediaQuery.matches);

    syncDesktopSidebar();
    mediaQuery.addEventListener("change", syncDesktopSidebar);
    return () => mediaQuery.removeEventListener("change", syncDesktopSidebar);
  }, [showSidebar]);

  return (
    <div data-shell="app" className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <CommandPalette />
      <div className="min-h-screen">
        <Sidebar desktopWidth={DESKTOP_SIDEBAR_WIDTH} />
        <div
          className="relative z-10 min-w-0"
          style={showDesktopSidebar ? { marginLeft: DESKTOP_SIDEBAR_WIDTH, width: `calc(100% - ${DESKTOP_SIDEBAR_WIDTH}px)` } : undefined}
        >
          {showHeader ? (
            <div className="sticky top-0 z-20 hidden border-b border-border/60 bg-[color:var(--surface-0)]/90 backdrop-blur md:block">
              <div className="mx-auto w-full max-w-[1400px] px-6 py-2.5 md:px-8 lg:px-10">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {title ? <h1 className="text-xl font-semibold tracking-tight">{title}</h1> : null}
                    {props.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{props.subtitle}</p> : null}
                  </div>
                  {props.actions ? <div className="flex items-center gap-2">{props.actions}</div> : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mx-auto w-full max-w-[1400px] px-5 pt-3 md:hidden">
            {showHeader ? (
              <div className="mb-2 flex items-start justify-between gap-4">
                <div>
                  {title ? <h1 className="text-xl font-semibold tracking-tight">{title}</h1> : null}
                  {props.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{props.subtitle}</p> : null}
                </div>
                {props.actions ? <div className="flex items-center gap-2">{props.actions}</div> : null}
              </div>
            ) : null}
          </div>

          <div className="mx-auto w-full max-w-[1400px] px-5 pb-8 pt-0 md:px-7 md:pt-1 lg:px-9">{props.children}</div>
        </div>
      </div>
    </div>
  );
}
