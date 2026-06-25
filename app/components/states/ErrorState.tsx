import type { ReactNode } from 'react';

type Action = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type ErrorStateProps = {
  title?: string;
  description?: string;
  requestId?: string;
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

export function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again in a moment.',
  requestId,
  primaryAction,
  secondaryAction,
  icon,
}: ErrorStateProps) {
  return (
    <div className="card app-state app-state--error" role="alert">
      {icon ? <div className="app-state__icon">{icon}</div> : null}
      <div className="app-state__eyebrow">Attention needed</div>
      <h3 className="app-state__title">{title}</h3>
      <p className="muted app-state__description">{description}</p>
      {requestId ? (
        <p className="muted app-state__meta">
          Support code: <code>{requestId}</code>
        </p>
      ) : null}
      <div className="app-state__actions">
        {primaryAction ? <ActionButton action={primaryAction} primary /> : null}
        {secondaryAction ? <ActionButton action={secondaryAction} primary={false} /> : null}
      </div>
    </div>
  );
}
