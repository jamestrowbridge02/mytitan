import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

type OperatorAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
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
  disabled?: boolean;
};

type OperatorSavedView = {
  id: string;
  label: string;
  count?: number;
};

type OperatorChip = {
  id: string;
  label: string;
  onClear?: () => void;
};

function OperatorActionButton({ action }: { action: OperatorAction | OperatorFilterAction }) {
  const className = action.variant === "secondary" ? "button secondary operator-page__button" : "button operator-page__button";

  if (action.href) {
    return (
      <Link aria-disabled={action.disabled ? true : undefined} className={className} href={action.disabled ? "#" : action.href}>
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

export function OperatorSavedViews({
  label = "Views",
  views,
  activeView,
  onChange,
}: {
  label?: string;
  views: OperatorSavedView[];
  activeView: string;
  onChange: (view: string) => void;
}) {
  return (
    <div className="operator-viewTabs" aria-label={label} role="tablist">
      {views.map((view) => (
        <button
          key={view.id}
          className={`operator-viewTabs__item${view.id === activeView ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={view.id === activeView}
          onClick={() => onChange(view.id)}
        >
          <span>{view.label}</span>
          {typeof view.count === "number" ? <span className="operator-viewTabs__count">{view.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function OperatorActiveFilters({
  chips,
  clearLabel = "Reset all",
  onClearAll,
}: {
  chips: OperatorChip[];
  clearLabel?: string;
  onClearAll?: () => void;
}) {
  if (!chips.length && !onClearAll) return null;

  return (
    <div className="operator-filterChips">
      {chips.map((chip) => (
        <button
          key={chip.id}
          className="operator-filterChips__item"
          type="button"
          onClick={chip.onClear}
          disabled={!chip.onClear}
        >
          {chip.label}
        </button>
      ))}
      {onClearAll ? (
        <button className="operator-filterChips__clear" type="button" onClick={onClearAll}>
          {clearLabel}
        </button>
      ) : null}
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

export function OperatorRowActions({
  primaryAction,
  actions,
}: {
  primaryAction?: OperatorAction;
  actions?: OperatorAction[];
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointer(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="operator-rowActions" ref={ref}>
      {primaryAction ? <OperatorActionButton action={primaryAction} /> : null}
      {actions?.length ? (
        <div className={`operator-rowActions__menu${open ? " is-open" : ""}`}>
          <button
            aria-controls={menuId}
            aria-expanded={open}
            aria-label="More actions"
            className="button secondary operator-rowActions__toggle"
            type="button"
            onClick={() => setOpen((prev) => !prev)}
          >
            •••
          </button>
          {open ? (
            <div className="operator-rowActions__panel" id={menuId} role="menu">
              {actions.map((action) =>
                action.href ? (
                  <Link
                    key={`${action.label}-${action.href}`}
                    className={`operator-rowActions__item${action.disabled ? " is-disabled" : ""}`}
                    href={action.disabled ? "#" : action.href}
                    onClick={() => setOpen(false)}
                    role="menuitem"
                  >
                    {action.label}
                  </Link>
                ) : (
                  <button
                    key={`${action.label}-button`}
                    className="operator-rowActions__item"
                    disabled={action.disabled}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      action.onClick?.();
                      setOpen(false);
                    }}
                  >
                    {action.label}
                  </button>
                ),
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
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
