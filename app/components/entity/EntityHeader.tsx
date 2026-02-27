import type { ReactNode } from "react";
import Link from "next/link";

export type EntityAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  target?: string;
  rel?: string;
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
    <button className={className} type="button" onClick={action.onClick}>
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
    <div className="card" style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <h1 style={{ marginTop: 0, marginBottom: 6 }}>{title}</h1>
          {subtitle ? (
            <p className="muted" style={{ margin: 0 }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {primaryAction ? <ActionButton action={primaryAction} primary /> : null}
              {secondaryActions.map((action) => (
                <ActionButton key={`${action.label}-${action.href || "button"}`} action={action} primary={false} />
              ))}
            </div>
            {primaryAction && primaryActionHint ? (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {primaryActionHint}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
