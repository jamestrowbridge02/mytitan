import React from "react";
import CommandPalette from "../command/command-palette";
import Sidebar from "../nav/sidebar";

export function PageShell(props: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const showHeader = Boolean(props.title || props.subtitle || props.actions);

  return (
    <div data-shell="app" className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <CommandPalette />
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <div className="flex-1 min-w-0">
          <div className="hidden md:block sticky top-0 z-20 border-b border-border/60 bg-[color:var(--surface-0)]/90 backdrop-blur">
            <div className="mx-auto w-full max-w-[1400px] px-6 py-5">
              {showHeader ? (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {props.title ? <h1 className="text-xl font-semibold tracking-tight">{props.title}</h1> : null}
                    {props.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{props.subtitle}</p> : null}
                  </div>
                  {props.actions ? <div className="flex items-center gap-2">{props.actions}</div> : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="md:hidden mx-auto w-full max-w-[1400px] px-6 pt-6">
            {showHeader ? (
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  {props.title ? <h1 className="text-xl font-semibold tracking-tight">{props.title}</h1> : null}
                  {props.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{props.subtitle}</p> : null}
                </div>
                {props.actions ? <div className="flex items-center gap-2">{props.actions}</div> : null}
              </div>
            ) : null}
          </div>

          {showHeader ? null : <div className="h-4" />}
          <div className="mx-auto w-full max-w-[1400px] px-6 pt-2">
 (
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  {props.title ? <h1 className="text-xl font-semibold tracking-tight">{props.title}</h1> : null}
                  {props.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{props.subtitle}</p> : null}
                </div>
                {props.actions ? <div className="flex items-center gap-2">{props.actions}</div> : null}
              </div>
            ) : null}

            <div className="mx-auto w-full max-w-[1400px] px-6 pb-10">
              {props.children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
