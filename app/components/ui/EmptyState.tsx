import React from 'react';

export function EmptyState({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-[color:var(--surface-1)] p-6">
      <div className="text-sm font-semibold">{title}</div>
      {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
