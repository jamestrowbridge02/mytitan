import type { ReactNode } from 'react';

type Action = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type EmptyStateProps = {
  eyebrow?: string;
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
  eyebrow = 'Quiet for now',
  title = 'Nothing needs attention here',
  description = 'Everything in this area is clear, so you can move on with confidence.',
  primaryAction,
  secondaryAction,
  icon,
}: EmptyStateProps) {
  return (
    <div className="card app-state app-state--empty">
      {icon ? <div className="app-state__icon">{icon}</div> : null}
      <div className="app-state__eyebrow">{eyebrow}</div>
      <h3 className="app-state__title">{title}</h3>
      <p className="muted app-state__description">{description}</p>
      {primaryAction || secondaryAction ? (
        <div className="app-state__actions">
          {primaryAction ? <ActionButton action={primaryAction} primary /> : null}
          {secondaryAction ? <ActionButton action={secondaryAction} primary={false} /> : null}
        </div>
      ) : null}
    </div>
  );
}
