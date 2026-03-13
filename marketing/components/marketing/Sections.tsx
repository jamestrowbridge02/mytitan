import Link from "next/link";
import type { ReactNode } from "react";

export function MarketingPageHero({
  eyebrow,
  title,
  lead,
  actions,
  aside,
  brand = false,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  actions?: ReactNode;
  aside?: ReactNode;
  brand?: boolean;
}) {
  return (
    <section className="mkt-hero">
      <div className="mkt-hero__copy">
        {brand ? (
          <div className="mkt-hero__brand mkt-brand-glimmer">
            <img src="/brand/mytitan-logo-light.svg" alt="MyTitan" className="mkt-hero__brandLogo" />
          </div>
        ) : null}
        <div className="mkt-eyebrow">{eyebrow}</div>
        <h1 className="mkt-hero__title mkt-hero__title--wide">{title}</h1>
        <p className="mkt-hero__lead">{lead}</p>
        {actions ? <div className="mkt-actions mkt-actions--hero">{actions}</div> : null}
      </div>
      {aside ? <aside className="mkt-hero__aside">{aside}</aside> : null}
    </section>
  );
}

export function MarketingSectionHeading({
  eyebrow,
  title,
  lead,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="mkt-sectionHeading">
      {eyebrow ? <div className="mkt-eyebrow">{eyebrow}</div> : null}
      <h2 className="mkt-sectionTitle">{title}</h2>
      {lead ? <p className="mkt-sectionLead">{lead}</p> : null}
    </div>
  );
}

export function MarketingCapabilityCard({
  title,
  description,
  bullets,
}: {
  title: string;
  description: string;
  bullets?: string[];
}) {
  return (
    <article className="mkt-card">
      <h3>{title}</h3>
      <p>{description}</p>
      {bullets?.length ? (
        <ul>
          {bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function MarketingCtaBand({
  title,
  copy,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
}: {
  title: string;
  copy: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
}) {
  const secondaryIsInternal = secondaryHref.startsWith("/");
  return (
    <section className="mkt-section">
      <div className="mkt-final mkt-final--compact">
        <div className="mkt-eyebrow">Next step</div>
        <h2 className="mkt-sectionTitle" style={{ marginTop: 14 }}>{title}</h2>
        <p>{copy}</p>
        <div className="mkt-actions" style={{ marginTop: 18 }}>
          <a className="mkt-btn mkt-btn--primary" href={primaryHref}>{primaryLabel}</a>
          {secondaryIsInternal ? (
            <Link className="mkt-btn" href={secondaryHref}>{secondaryLabel}</Link>
          ) : (
            <a className="mkt-btn" href={secondaryHref}>{secondaryLabel}</a>
          )}
        </div>
      </div>
    </section>
  );
}
