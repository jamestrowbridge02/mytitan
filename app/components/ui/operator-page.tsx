import Link from "next/link";
import type { ReactNode } from "react";

type OperatorAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
};

type OperatorStat = {
  label: string;
  value: ReactNode;
  hint?: string;
};

function OperatorActionButton({ action }: { action: OperatorAction }) {
  const className = action.variant === "secondary" ? "button secondary operator-page__button" : "button operator-page__button";

  if (action.href) {
    return (
      <Link className={className} href={action.href}>
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

export function OperatorPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  stats,
  shortcuts,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  actions?: OperatorAction[];
  stats?: OperatorStat[];
  shortcuts?: string[];
}) {
  return (
    <section className="card operator-page">
      <div className="operator-page__hero">
        <div className="operator-page__copy">
          {eyebrow ? <div className="operator-page__eyebrow">{eyebrow}</div> : null}
          <h1 className="operator-page__title">{title}</h1>
          <p className="muted operator-page__subtitle">{subtitle}</p>
          {shortcuts?.length ? (
            <div className="operator-page__shortcuts">
              {shortcuts.map((item) => (
                <span key={item} className="operator-page__shortcut">
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {actions?.length ? (
          <div className="operator-page__actions">
            {actions.map((action) => (
              <OperatorActionButton key={`${action.label}-${action.href || "action"}`} action={action} />
            ))}
          </div>
        ) : null}
      </div>

      {stats?.length ? (
        <div className="operator-page__stats">
          {stats.map((stat) => (
            <div key={stat.label} className="operator-page__stat">
              <div className="operator-page__statLabel">{stat.label}</div>
              <div className="operator-page__statValue">{stat.value}</div>
              {stat.hint ? <div className="operator-page__statHint">{stat.hint}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
