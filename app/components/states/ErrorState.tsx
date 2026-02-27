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
    <div className="card" role="alert">
      {icon ? <div style={{ marginBottom: 10 }}>{icon}</div> : null}
      <h3 style={{ marginTop: 0, color: '#ff8a8a' }}>{title}</h3>
      <p className="muted">{description}</p>
      {requestId ? (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Support code: <code>{requestId}</code>
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {primaryAction ? <ActionButton action={primaryAction} primary /> : null}
        {secondaryAction ? <ActionButton action={secondaryAction} primary={false} /> : null}
      </div>
    </div>
  );
}
