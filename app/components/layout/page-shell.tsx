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
          <div className="mx-auto w-full max-w-[1400px] px-6 py-6">
            {showHeader ? (
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  {props.title ? <h1 className="text-xl font-semibold tracking-tight">{props.title}</h1> : null}
                  {props.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{props.subtitle}</p> : null}
                </div>
                {props.actions ? <div className="flex items-center gap-2">{props.actions}</div> : null}
              </div>
            ) : null}

            <div className="rounded-2xl border border-border/60 bg-[color:var(--surface-1)] p-5 shadow-sm">
              {props.children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
