import type { ReactNode } from 'react';

type Action = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type EmptyStateProps = {
  title?: string;
  description?: string;
  primaryAction?: Action;
  secondaryAction?: Action;
  icon?: ReactNode;
};

function ActionButton({ action, primary }: { action: Action; primary: boolean }) {
  if (action.href) {
    return (
      <a className={primary ? 'button' : 'button secondary'} href={action.href}>
        {action.label}
      </a>
    );
  }

  return (
    <button className={primary ? 'button' : 'button secondary'} type="button" onClick={action.onClick}>
      {action.label}
    </button>
  );
}

export function EmptyState({
  title = 'Nothing here yet',
  description = 'There is no data to show for this view.',
  primaryAction,
  secondaryAction,
  icon,
}: EmptyStateProps) {
  return (
    <div className="card">
      {icon ? <div style={{ marginBottom: 10 }}>{icon}</div> : null}
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p className="muted">{description}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {primaryAction ? <ActionButton action={primaryAction} primary /> : null}
        {secondaryAction ? <ActionButton action={secondaryAction} primary={false} /> : null}
      </div>
    </div>
  );
}
