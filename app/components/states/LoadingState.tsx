import React from "react";

export function LoadingState(props: {
  title?: string;
  description?: string;
  metrics?: Array<{ label: string; value: string }>;
}) {
  const showDashboardMetrics =
    (props.title || "").toLowerCase().includes("command centre") ||
    (props.title || "").toLowerCase().includes("dashboard");

  const metrics = props.metrics || [
    { label: "Jobs today", value: "0" },
    { label: "Revenue today", value: "£0" },
    { label: "Technicians active", value: "0" },
    { label: "Pending approvals", value: "0" },
  ];

  return (
    <div className="card loading-state-premium app-state app-state--loading" role="status" aria-live="polite">
      <div className="loading-state-premium__top">
        <div className="loading-state-premium__eyebrow">Preparing your next view</div>
        <h2 className="loading-state-premium__title">
          {props.title || "Bringing everything into place"}
        </h2>
        {(props.description || true) ? (
          <p className="loading-state-premium__description">
            {props.description || "Pulling together the latest operational truth so the next decision stays clear."}
          </p>
        ) : null}
      </div>

      {showDashboardMetrics ? (
        <div className="dashboard-metrics-grid">
          {metrics.map((metric) => (
            <div key={metric.label} className="card dashboard-metric-card">
              <div className="dashboard-metric-label">{metric.label}</div>
              <div className="dashboard-metric-value">{metric.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="loading-state-premium__stats">
        <div className="loading-state-premium__stat" />
        <div className="loading-state-premium__stat" />
        <div className="loading-state-premium__stat" />
      </div>

      <div className="loading-state-premium__panel">
        <div className="loading-state-premium__line loading-state-premium__line--lg" />
        <div className="loading-state-premium__line loading-state-premium__line--md" />
        <div className="loading-state-premium__line loading-state-premium__line--sm" />
      </div>
    </div>
  );
}

export default LoadingState;
