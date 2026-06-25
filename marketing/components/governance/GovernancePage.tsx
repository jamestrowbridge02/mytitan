import MarketingShell from "../layout/MarketingShell";
import type { GovernancePageContent } from "../../lib/site-content";

export function GovernancePage({ content }: { content: GovernancePageContent }) {
  return (
    <MarketingShell>
      <section className="mkt-section">
        <div className="mkt-section__inner" style={{ maxWidth: 960 }}>
          <div className="mkt-hero" data-testid={`governance-page-${content.slug}`}>
            <div className="mkt-hero__copy">
              <span className="mkt-kicker">Governance</span>
              <h1>{content.title}</h1>
              <p>{content.summary}</p>
              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 18,
                  padding: "1rem 1.1rem",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.9)",
                }}
              >
                <strong>{content.statusLabel}</strong>
                <p style={{ marginBottom: 0 }}>{content.statusNote}</p>
              </div>
              <p style={{ color: "rgba(255,255,255,0.72)" }}>Last updated: {content.lastUpdated}</p>
            </div>
          </div>
          <div className="mkt-grid" style={{ gap: "1.5rem" }}>
            {content.sections.map((section) => (
              <article key={section.title} className="mkt-card">
                <h2>{section.title}</h2>
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </article>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
