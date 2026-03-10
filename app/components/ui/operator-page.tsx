import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

type OperatorAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  description?: string;
  shortcut?: string;
  group?: string;
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
    if (action.disabled) {
      return (
        <button className={className} type="button" disabled>
          {action.label}
        </button>
      );
    }

    return (
      <Link className={className} href={action.href}>
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
              aria-label={searchPlaceholder}
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
    <div aria-label={label} className="operator-viewTabs" role="group">
      {views.map((view) => (
        <button
          key={view.id}
          className={`operator-viewTabs__item${view.id === activeView ? " is-active" : ""}`}
          type="button"
          aria-pressed={view.id === activeView}
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
          aria-label={`Clear ${chip.label}`}
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

export function OperatorGuidance({
  title = "Operator tips",
  items,
  defaultOpen = false,
}: {
  title?: string;
  items: string[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!items.length) return null;

  return (
    <section className={`operator-guidance${open ? " is-open" : ""}`}>
      <button
        aria-expanded={open}
        className="operator-guidance__toggle"
        type="button"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{title}</span>
        <span className="operator-guidance__toggleMeta">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="operator-guidance__panel">
          {items.map((item) => (
            <div key={item} className="operator-guidance__item">
              {item}
            </div>
          ))}
        </div>
      ) : null}
    </section>
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
  return <div aria-selected={selected ? true : undefined} className={`operator-table__row${selected ? " is-selected" : ""}`}>{children}</div>;
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
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | HTMLButtonElement | null>>([]);

  const actionGroups = useMemo(() => {
    const groups: Array<{ key: string; label?: string; items: Array<OperatorAction & { itemIndex: number }> }> = [];
    actions?.forEach((action, itemIndex) => {
      const groupKey = action.group || "__default__";
      const last = groups[groups.length - 1];
      if (!last || last.key !== groupKey) {
        groups.push({
          key: groupKey,
          label: action.group,
          items: [{ ...action, itemIndex }],
        });
        return;
      }
      last.items.push({ ...action, itemIndex });
    });
    return groups;
  }, [actions]);

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
        window.setTimeout(() => toggleRef.current?.focus(), 0);
      }
    }

    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const firstEnabled = itemRefs.current.find((item) => item && !item.hasAttribute("disabled") && item.getAttribute("aria-disabled") !== "true");
    firstEnabled?.focus();
  }, [open]);

  function focusItem(index: number) {
    const items = itemRefs.current.filter(Boolean).filter((item) => !item?.hasAttribute("disabled") && item?.getAttribute("aria-disabled") !== "true");
    if (!items.length) return;
    const normalized = ((index % items.length) + items.length) % items.length;
    items[normalized]?.focus();
  }

  function handleToggleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!actions?.length) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
      window.setTimeout(() => focusItem(0), 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      window.setTimeout(() => focusItem(-1), 0);
    }
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = itemRefs.current.filter(Boolean).filter((item) => !item?.hasAttribute("disabled") && item?.getAttribute("aria-disabled") !== "true");
    const currentIndex = items.findIndex((item) => item === document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(currentIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(currentIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(items.length - 1);
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      toggleRef.current?.focus();
    }
  }

  return (
    <div className="operator-rowActions" ref={ref}>
      {primaryAction ? <OperatorActionButton action={primaryAction} /> : null}
      {actions?.length ? (
        <div className={`operator-rowActions__menu${open ? " is-open" : ""}`}>
          <button
            aria-controls={menuId}
            aria-expanded={open}
            aria-label="More actions"
            aria-haspopup="menu"
            className="button secondary operator-rowActions__toggle"
            ref={toggleRef}
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            onKeyDown={handleToggleKeyDown}
          >
            More
          </button>
          {open ? (
            <div aria-label="Row actions" className="operator-rowActions__panel" id={menuId} role="menu" onKeyDown={handleMenuKeyDown}>
              {actionGroups.map((group, groupIndex) => (
                <div key={group.key} className="operator-rowActions__group">
                  {group.label ? <div className="operator-rowActions__groupLabel">{group.label}</div> : null}
                  {group.items.map((action) =>
                    action.href ? (
                      <Link
                        key={`${action.label}-${action.href}`}
                        aria-disabled={action.disabled ? true : undefined}
                        className={`operator-rowActions__item${action.disabled ? " is-disabled" : ""}`}
                        href={action.disabled ? "#" : action.href}
                        onClick={(event) => {
                          if (action.disabled) {
                            event.preventDefault();
                            return;
                          }
                          setOpen(false);
                        }}
                        ref={(node) => {
                          itemRefs.current[action.itemIndex] = node;
                        }}
                        role="menuitem"
                        tabIndex={0}
                      >
                        <span className="operator-rowActions__itemBody">
                          <span className="operator-rowActions__label">{action.label}</span>
                          {action.description ? <span className="operator-rowActions__description">{action.description}</span> : null}
                        </span>
                        {action.shortcut ? <span className="operator-rowActions__shortcut">{action.shortcut}</span> : null}
                      </Link>
                    ) : (
                      <button
                        key={`${action.label}-button`}
                        className="operator-rowActions__item"
                        disabled={action.disabled}
                        ref={(node) => {
                          itemRefs.current[action.itemIndex] = node;
                        }}
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          action.onClick?.();
                          setOpen(false);
                        }}
                      >
                        <span className="operator-rowActions__itemBody">
                          <span className="operator-rowActions__label">{action.label}</span>
                          {action.description ? <span className="operator-rowActions__description">{action.description}</span> : null}
                        </span>
                        {action.shortcut ? <span className="operator-rowActions__shortcut">{action.shortcut}</span> : null}
                      </button>
                    ),
                  )}
                  {groupIndex < actionGroups.length - 1 ? <div className="operator-rowActions__divider" /> : null}
                </div>
              ))}
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
