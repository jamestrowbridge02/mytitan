import React from "react";
import { useRouter } from "next/router";
import MyTitanLogo from "../brand/mytitan-logo";
import CommandPalette from "../command/command-palette";
import Sidebar from "../nav/sidebar";
import { NAV_GROUPS } from "../nav/nav-config";
import { useMediaQuery } from "../../lib/use-media-query";
import { getOperatorRouteMeta, rememberOperatorRecentDestination } from "../../lib/operator-recents";

const DESKTOP_SIDEBAR_WIDTH = 74;

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
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const mobileNavButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const hadMobileNavOpenRef = React.useRef(false);
  const bodyOverflowRef = React.useRef<string | null>(null);
  const bodyTouchActionRef = React.useRef<string | null>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const showDesktopSidebar = showSidebar && isDesktop;
  const showMobileSidebar = showSidebar && !isDesktop;
  const desktopShellStyle = showDesktopSidebar ? { height: "100vh", overflow: "hidden" as const } : undefined;
  const desktopMainStyle = showDesktopSidebar
    ? {
        marginLeft: DESKTOP_SIDEBAR_WIDTH,
        width: `calc(100% - ${DESKTOP_SIDEBAR_WIDTH}px)`,
        height: "100vh",
        overflowY: "auto" as const,
        overscrollBehavior: "contain" as const,
      }
    : undefined;

  React.useEffect(() => {
    if (isDesktop) {
      setMobileNavOpen(false);
    }
  }, [isDesktop]);

  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [router.asPath]);

  React.useEffect(() => {
    if (!router.isReady) return;
    const meta = getOperatorRouteMeta(router.pathname, router.asPath);
    rememberOperatorRecentDestination({
      href: router.asPath,
      label: meta.label,
      description: meta.description,
    });
  }, [router.asPath, router.isReady, router.pathname]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const { body } = document;

    if (!mobileNavOpen) {
      body.classList.remove("mt-mobile-nav-open");
      if (bodyOverflowRef.current !== null) {
        body.style.overflow = bodyOverflowRef.current;
        bodyOverflowRef.current = null;
      }
      if (bodyTouchActionRef.current !== null) {
        body.style.touchAction = bodyTouchActionRef.current;
        bodyTouchActionRef.current = null;
      }
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    };

    bodyOverflowRef.current = body.style.overflow;
    bodyTouchActionRef.current = body.style.touchAction;
    body.classList.add("mt-mobile-nav-open");
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      body.classList.remove("mt-mobile-nav-open");
      if (bodyOverflowRef.current !== null) {
        body.style.overflow = bodyOverflowRef.current;
        bodyOverflowRef.current = null;
      }
      if (bodyTouchActionRef.current !== null) {
        body.style.touchAction = bodyTouchActionRef.current;
        bodyTouchActionRef.current = null;
      }
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileNavOpen]);

  React.useEffect(() => {
    if (hadMobileNavOpenRef.current && !mobileNavOpen) {
      mobileNavButtonRef.current?.focus();
    }
    hadMobileNavOpenRef.current = mobileNavOpen;
  }, [mobileNavOpen]);

  return (
    <div data-shell="app" className="min-h-screen overflow-x-hidden bg-[var(--bg)] text-[var(--fg)]">
      <CommandPalette />
      <div className="min-h-screen overflow-x-hidden md:h-screen md:overflow-hidden" style={desktopShellStyle}>
        {showDesktopSidebar ? <Sidebar desktopWidth={DESKTOP_SIDEBAR_WIDTH} /> : null}
        {showMobileSidebar && mobileNavOpen ? (
          <>
            <button
              aria-label="Close navigation"
              className="mt-mobileNavBackdrop md:hidden"
              data-testid="mobile-nav-backdrop"
              type="button"
              onClick={() => setMobileNavOpen(false)}
            />
            <Sidebar mode="mobile" open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
          </>
        ) : null}
        <div
          className="mt-shell__main relative z-10 min-w-0 max-w-full md:h-screen md:overflow-y-auto md:overscroll-contain"
          style={desktopMainStyle}
        >
          {showMobileSidebar ? (
            <div className="mt-mobileTopbar md:hidden">
              <button
                ref={mobileNavButtonRef}
                aria-controls="mt-mobile-nav"
                aria-expanded={mobileNavOpen}
                aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
                className="mt-mobileTopbar__menuButton"
                data-testid="mobile-nav-toggle"
                type="button"
                onClick={() => setMobileNavOpen((current) => !current)}
              >
                <span className="mt-mobileTopbar__menuLine" />
                <span className="mt-mobileTopbar__menuLine" />
                <span className="mt-mobileTopbar__menuLine" />
              </button>
              <div className="mt-mobileTopbar__brand">
                <MyTitanLogo variant="wordmark" size="sm" />
              </div>
              <div className="mt-mobileTopbar__title">
                {title ? <strong>{title}</strong> : <span>Workspace</span>}
              </div>
            </div>
          ) : null}

          {showHeader ? (
            <div className="mt-pageShellHeader sticky top-0 z-20 hidden md:block">
              <div className="mx-auto w-full max-w-[1380px] px-5 py-0 md:px-7 lg:px-8">
                <div className="mt-pageShellHeader__inner flex items-start justify-between gap-4">
                  <div className="mt-pageShellHeader__copy">
                    {title ? <h1 className="mt-pageShellHeader__title text-xl font-semibold tracking-tight">{title}</h1> : null}
                    {props.subtitle ? <p className="mt-pageShellHeader__subtitle mt-1 text-sm text-muted-foreground">{props.subtitle}</p> : null}
                  </div>
                  {props.actions ? <div className="mt-pageShellHeader__actions flex items-center gap-2">{props.actions}</div> : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mx-auto w-full max-w-[1380px] px-4 pt-2 md:hidden">
            {showHeader ? (
              <div className="mt-pageShellHeader mt-pageShellHeader--mobile mb-0.5 flex items-start justify-between gap-4">
                <div className="mt-pageShellHeader__copy">
                  {title ? <h1 className="mt-pageShellHeader__title text-xl font-semibold tracking-tight">{title}</h1> : null}
                  {props.subtitle ? <p className="mt-pageShellHeader__subtitle mt-1 text-sm text-muted-foreground">{props.subtitle}</p> : null}
                </div>
                {props.actions ? <div className="mt-pageShellHeader__actions flex items-center gap-2">{props.actions}</div> : null}
              </div>
            ) : null}
          </div>

          <div className="mx-auto w-full max-w-[1380px] min-w-0 px-4 pb-5 pt-0 md:px-6 md:pb-5 md:pt-0 lg:px-8">{props.children}</div>
        </div>
      </div>
    </div>
  );
}
