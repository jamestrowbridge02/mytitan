import React from "react";
import { useRouter } from "next/router";
import CommandPalette from "../command/command-palette";
import Sidebar from "../nav/sidebar";
import { NAV_GROUPS } from "../nav/nav-config";

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
  const navTitle = resolveTitleFromNav(router.pathname);
  const title = props.title ?? navTitle;
  const showHeader = Boolean(title || props.subtitle || props.actions);

  return (
    <div data-shell="app" className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <CommandPalette />
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-20 hidden border-b border-border/60 bg-[color:var(--surface-0)]/90 backdrop-blur md:block">
            <div className="mx-auto w-full max-w-[1400px] px-6 py-5">
              {showHeader ? (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {title ? <h1 className="text-xl font-semibold tracking-tight">{title}</h1> : null}
                    {props.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{props.subtitle}</p> : null}
                  </div>
                  {props.actions ? <div className="flex items-center gap-2">{props.actions}</div> : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mx-auto w-full max-w-[1400px] px-6 pt-6 md:hidden">
            {showHeader ? (
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  {title ? <h1 className="text-xl font-semibold tracking-tight">{title}</h1> : null}
                  {props.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{props.subtitle}</p> : null}
                </div>
                {props.actions ? <div className="flex items-center gap-2">{props.actions}</div> : null}
              </div>
            ) : null}
          </div>

          {!showHeader ? <div className="h-4" /> : null}
          <div className="mx-auto w-full max-w-[1400px] px-6 pb-10 pt-2">{props.children}</div>
        </div>
      </div>
    </div>
  );
}
