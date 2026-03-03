import React from 'react';

export function SectionHeader({
  title,
  right,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[18px] font-semibold tracking-[0.2px] m-0">{title}</h1>
        {subtitle ? <div className="mt-1 text-[13px] opacity-70">{subtitle}</div> : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}
