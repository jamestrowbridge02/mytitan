import type { ReactNode } from "react";

type EntitySectionProps = {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export default function EntitySection({ title, subtitle, actions, children }: EntitySectionProps) {
  return (
    <section className="card" style={{ marginBottom: 16 }} aria-label={title}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>{title}</h2>
          {subtitle ? (
            <p className="muted" style={{ marginTop: 0 }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
