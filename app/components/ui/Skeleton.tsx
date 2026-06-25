import React from 'react';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl border border-slate-200/80 bg-slate-100/90 ${className}`} />;
}
