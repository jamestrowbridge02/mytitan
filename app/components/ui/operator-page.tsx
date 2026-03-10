import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

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

type OperatorFilterAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
};

function OperatorActionButton({ action }: { action: OperatorAction | OperatorFilterAction }) {
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

export function OperatorFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search",
  children,
  actions,
  resultsLabel,
}: {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  children?: ReactNode;
  actions?: OperatorFilterAction[];
  resultsLabel?: ReactNode;
}) {
  return (
    <div className="operator-filterbar">
      <div className="operator-filterbar__main">
        {typeof searchValue === "string" && onSearchChange ? (
          <label className="operator-filterbar__search">
            <span className="operator-filterbar__label">Search</span>
            <input
              className="input operator-filterbar__input"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
            />
          </label>
        ) : null}

        {children ? <div className="operator-filterbar__filters">{children}</div> : null}
      </div>

      <div className="operator-filterbar__aside">
        {resultsLabel ? <div className="operator-filterbar__results">{resultsLabel}</div> : null}
        {actions?.length ? (
          <div className="operator-filterbar__actions">
            {actions.map((action) => (
              <OperatorActionButton key={`${action.label}-${action.href || "action"}`} action={action} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function OperatorBulkBar({
  count,
  hint,
  children,
}: {
  count: number;
  hint?: ReactNode;
  children: ReactNode;
}) {
  if (!count) return null;

  return (
    <div className="operator-bulkbar">
      <div className="operator-bulkbar__summary">
        <span className="operator-bulkbar__count">{count} selected</span>
        {hint ? <span className="operator-bulkbar__hint">{hint}</span> : null}
      </div>
      <div className="operator-bulkbar__actions">{children}</div>
    </div>
  );
}

export function OperatorDataTable({
  columns,
  children,
}: {
  columns: string;
  children: ReactNode;
}) {
  return (
    <div
      className="operator-table"
      style={{ "--operator-table-columns": columns } as CSSProperties}
    >
      {children}
    </div>
  );
}

export function OperatorDataTableHeader({ children }: { children: ReactNode }) {
  return <div className="operator-table__header">{children}</div>;
}

export function OperatorDataTableRow({
  children,
  selected,
}: {
  children: ReactNode;
  selected?: boolean;
}) {
  return <div className={`operator-table__row${selected ? " is-selected" : ""}`}>{children}</div>;
}

export function OperatorFilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="operator-filterbar__field">
      <span className="operator-filterbar__label">{label}</span>
      {children}
    </label>
  );
}

export function OperatorEmptyStateCard({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: OperatorAction[];
}) {
  return (
    <div className="operator-empty">
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      {actions?.length ? (
        <div className="operator-empty__actions">
          {actions.map((action) => (
            <OperatorActionButton key={`${action.label}-${action.href || "action"}`} action={action} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
