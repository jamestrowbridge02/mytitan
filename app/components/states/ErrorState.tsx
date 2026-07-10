import type { ReactNode } from 'react';

type Action = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type ErrorStateProps = {
  title?: string;
  description?: string;
  why?: string;
  changed?: string;
  nextAction?: string;
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
  why,
  changed,
  nextAction,
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
      <p className="muted app-state__description">
        <strong>What failed:</strong> {description}
      </p>
      <div className="app-state__description" style={{ display: 'grid', gap: 6 }}>
        <p className="muted" style={{ margin: 0 }}>
          <strong>Why it failed:</strong> {why || 'The request could not be completed from this screen.'}
        </p>
        <p className="muted" style={{ margin: 0 }}>
          <strong>What changed:</strong> {changed || 'No saved data was changed.'}
        </p>
        <p className="muted" style={{ margin: 0 }}>
          <strong>Safe next action:</strong> {nextAction || 'Try again, or open the linked workspace area to continue safely.'}
        </p>
      </div>
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
