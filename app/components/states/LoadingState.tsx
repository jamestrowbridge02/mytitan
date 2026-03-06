import React from "react";

export function LoadingState(props: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="card loading-state-premium" role="status" aria-live="polite">
      <div className="loading-state-premium__top">
        <div className="loading-state-premium__eyebrow">Workspace</div>
        <h2 className="loading-state-premium__title">
          {props.title || "Loading"}
        </h2>
        {props.description ? (
          <p className="loading-state-premium__description">{props.description}</p>
        ) : null}
      </div>

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
