import type { CSSProperties, ReactNode } from "react";

type InsightTone = "neutral" | "info" | "success" | "warning" | "critical";
type InsightIcon = "spark" | "flow" | "calendar" | "customers" | "billing" | "mail" | "settings" | "work";

type InsightChartRow = {
  label: string;
  value: number;
  tone?: InsightTone;
  detail?: string;
};

function clampPercentage(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 100) return 100;
  return value;
}

function buildPolyline(rows: InsightChartRow[], width: number, height: number) {
  const maxValue = Math.max(...rows.map((row) => row.value), 0);
  if (!rows.length || maxValue <= 0) return "";
  const step = rows.length > 1 ? width / (rows.length - 1) : width;
  return rows
    .map((row, index) => {
      const x = rows.length > 1 ? index * step : width / 2;
      const y = height - (row.value / maxValue) * height;
      return `${x.toFixed(1)},${Math.max(0, Math.min(height, y)).toFixed(1)}`;
    })
    .join(" ");
}

function toneClassName(tone?: InsightTone) {
  return tone ? ` operator-insight-icon--${tone}` : "";
}

function OperatorInsightGlyph({ icon }: { icon: InsightIcon }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (icon) {
    case "flow":
      return (
        <svg {...common}>
          <path d="M6 6h7a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h9" />
          <path d="m15 4 2 2-2 2" />
          <path d="m16 16 2 2-2 2" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M8 3v4M16 3v4M3 10h18" />
          <path d="M8 14h3M13 14h3M8 18h3" />
        </svg>
      );
    case "customers":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
          <path d="M16 11a3 3 0 1 0 0-6" />
          <path d="M18 19a4 4 0 0 0-2.7-3.8" />
        </svg>
      );
    case "billing":
      return (
        <svg {...common}>
          <path d="M12 3v18" />
          <path d="M17 7c0-2-2.2-3-5-3s-5 1-5 3 2.2 3 5 3 5 1 5 3-2.2 3-5 3-5-1-5-3" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="m5 8 7 5 7-5" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.36 9c.17.53.69.9 1.24.91H21a2 2 0 1 1 0 4h-.09c-.55.01-1.07.38-1.24.91Z" />
        </svg>
      );
    case "work":
      return (
        <svg {...common}>
          <path d="M5 19V9" />
          <path d="M12 19V5" />
          <path d="M19 19v-7" />
        </svg>
      );
    case "spark":
    default:
      return (
        <svg {...common}>
          <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />
        </svg>
      );
  }
}

export function OperatorInsightIcon({
  icon,
  tone = "info",
  label,
}: {
  icon: InsightIcon;
  tone?: InsightTone;
  label?: string;
}) {
  return (
    <span aria-label={label} className={`operator-insight-icon${toneClassName(tone)}`}>
      <OperatorInsightGlyph icon={icon} />
    </span>
  );
}

export function OperatorChartCard({
  title,
  description,
  annotation,
  icon,
  rows,
  emptyText = "No authoritative data is available yet.",
  testId,
}: {
  title: string;
  description: string;
  annotation?: string;
  icon?: InsightIcon;
  rows: InsightChartRow[];
  emptyText?: string;
  testId?: string;
}) {
  const maxValue = Math.max(...rows.map((row) => row.value), 0);
  const chartRows = rows.filter((row) => Number.isFinite(row.value));
  const hasUsefulChart = chartRows.some((row) => row.value > 0);
  const polyline = buildPolyline(chartRows, 240, 72);

  return (
    <section className="platform-admin-card-stack platform-admin-card-stack--chart operator-chart-card" data-testid={testId}>
      <div className="platform-admin-card-heading">
        <div className="billing-ops-heading">
          {icon ? <OperatorInsightIcon icon={icon} tone="info" /> : null}
          <div>
            <strong>{title}</strong>
            <p className="muted billing-page-panel__text billing-page-panel__text--last">{description}</p>
          </div>
        </div>
        {annotation ? <span className="platform-admin-chart-annotation">{annotation}</span> : null}
      </div>

      {rows.length ? (
        <>
          {hasUsefulChart ? (
            <div className="operator-chart-card__visual" role="img" aria-label={`${title} chart`}>
              <svg viewBox="0 0 260 92" focusable="false">
                <line x1="10" y1="82" x2="250" y2="82" />
                <line x1="10" y1="10" x2="10" y2="82" />
                {polyline ? <polyline points={polyline.split(" ").map((point) => {
                  const [x, y] = point.split(",").map(Number);
                  return `${x + 10},${y + 10}`;
                }).join(" ")} /> : null}
                {chartRows.map((row, index) => {
                  const x = chartRows.length > 1 ? 10 + (index * 240) / (chartRows.length - 1) : 130;
                  const y = maxValue > 0 ? 82 - (row.value / maxValue) * 72 : 82;
                  return <circle key={`${row.label}-point`} cx={x} cy={Math.max(10, Math.min(82, y))} r="3.5" />;
                })}
              </svg>
            </div>
          ) : (
            <p className="muted operator-chart-card__empty">No activity in this period.</p>
          )}
          <div className="billing-readiness-bars">
            {rows.map((row) => {
              const width = maxValue > 0 ? clampPercentage((row.value / maxValue) * 100) : 0;
              const tone = row.tone === "critical" ? "warn" : row.tone || "info";
              return (
                <div key={row.label} className="billing-readiness-bars__row">
                  <div className="billing-readiness-bars__meta">
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                  <div className="billing-readiness-bars__track" style={{ "--operator-chart-fill": `${width}%` } as CSSProperties}>
                    <span className={`billing-readiness-bars__fill billing-readiness-bars__fill--${tone}`} style={{ width: `${width}%` }} />
                  </div>
                  {row.detail ? <p className="operator-chart-card__detail muted">{row.detail}</p> : null}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="muted">{emptyText}</p>
      )}
    </section>
  );
}

export function OperatorActionTile({
  title,
  description,
  icon,
  tone = "neutral",
  badge,
  action,
}: {
  title: string;
  description: string;
  icon: InsightIcon;
  tone?: InsightTone;
  badge?: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="integration-card operator-actionTile">
      <div className="operator-actionTile__header">
        <OperatorInsightIcon icon={icon} tone={tone} />
        {badge ? <div className="operator-actionTile__badge">{badge}</div> : null}
      </div>
      <div className="operator-actionTile__body">
        <strong>{title}</strong>
        <p className="muted">{description}</p>
      </div>
      <div className="operator-actionTile__footer">{action}</div>
    </div>
  );
}
