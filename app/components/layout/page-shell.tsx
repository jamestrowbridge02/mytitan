import React from "react";
import { Sidebar } from '../nav/sidebar';
import CommandPalette from "../command/command-palette";

export function PageShell(props: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div data-shell="app" className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 min-w-0">
          <div className="px-6 py-5 border-b border-white/10">
            {/* Page header slot: title/actions handled per-page */}
          </div>
          <div className="px-6 py-6">
<div className="min-h-screen bg-[color:var(--surface-0)]">
      <CommandPalette />
      <div className="mx-auto w-full max-w-[1400px] px-6 py-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{props.title}</h1>
            {props.subtitle ? (
              <p className="mt-1 text-sm text-muted-foreground">{props.subtitle}</p>
            ) : null}
          </div>
          {props.actions ? <div className="flex items-center gap-2">{props.actions}</div> : null}
        </div>

        <div className="rounded-2xl border border-border/60 bg-[color:var(--surface-1)] p-5 shadow-sm">
          {props.children}
        </div>
      </div>
    </div>
          </div>
        </div>
      </div>
    </div>
  );

}
