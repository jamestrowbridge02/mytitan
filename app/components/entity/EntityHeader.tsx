import type { ReactNode } from "react";
import Link from "next/link";

export type EntityAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  target?: string;
  rel?: string;
  disabled?: boolean;
};

type EntityHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  primaryAction?: EntityAction;
  primaryActionHint?: string;
  secondaryActions?: EntityAction[];
};

function isExternalLink(href: string) {
  return href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:");
}

function ActionButton({ action, primary }: { action: EntityAction; primary: boolean }) {
  const className = primary ? "button" : "button secondary";

  if (action.href) {
    if (isExternalLink(action.href)) {
      return (
        <a className={className} href={action.href} target={action.target} rel={action.rel} onClick={action.onClick}>
          {action.label}
        </a>
      );
    }

    return (
      <Link className={className} href={action.href} onClick={action.onClick}>
        {action.label}
      </Link>
    );
  }

  return (
    <button className={className} type="button" onClick={action.onClick} disabled={action.disabled}>
      {action.label}
    </button>
  );
}

export default function EntityHeader({
  title,
  subtitle,
  badges,
  primaryAction,
  primaryActionHint,
  secondaryActions = [],
}: EntityHeaderProps) {
  const hasActions = Boolean(primaryAction || secondaryActions.length);

  return (
    <div className="card entity-header" style={{ marginBottom: 16 }}>
      <div className="entity-header__layout">
        <div className="entity-header__main">
          <h1 className="entity-header__title">{title}</h1>
          {subtitle ? (
            <p className="muted entity-header__subtitle">
              {subtitle}
            </p>
          ) : null}
          {badges ? (
            <div className="pill-row" style={{ marginTop: 10, marginBottom: 0 }}>
              {badges}
            </div>
          ) : null}
        </div>
        {hasActions ? (
          <div className="entity-header__actions">
            <div className="entity-header__actionRow">
              {primaryAction ? <ActionButton action={primaryAction} primary /> : null}
              {secondaryActions.map((action) => (
                <ActionButton key={`${action.label}-${action.href || "button"}`} action={action} primary={false} />
              ))}
            </div>
            {primaryAction && primaryActionHint ? (
              <p className="muted entity-header__hint">
                {primaryActionHint}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
