import Link from "next/link";
import React from "react";

function flagOn(name: string) {
  const value = (process.env[name] || "").trim().toLowerCase();
  return value === "on" || value === "true" || value === "1";
}

export default function MarketingShell(props: { children: React.ReactNode }) {
  const sideNav = flagOn("NEXT_PUBLIC_MYTITAN_MARKETING_SIDENAV_V1");

  const attrs = {
    "data-mkt-luxury": String(process.env.NEXT_PUBLIC_MYTITAN_MARKETING_LUXURY_V1 || "").toLowerCase(),
    "data-mkt-motion": String(process.env.NEXT_PUBLIC_MYTITAN_MARKETING_MOTION_V1 || "").toLowerCase(),
    "data-mkt-coherence": String(process.env.NEXT_PUBLIC_MYTITAN_MARKETING_COHERENCE_V1 || "").toLowerCase(),
    "data-mkt-perf": String(process.env.NEXT_PUBLIC_MYTITAN_MARKETING_PERF_V1 || "").toLowerCase(),
    "data-mkt-sidenav": sideNav ? "on" : "off",
  };

  return (
    <div {...attrs} className="mkt-shell">
      <header className="mkt-topbar">
        <div className="mkt-topbar__inner">
          <Link href="/" className="mkt-brand">
            <span className="mkt-brand__logoWrap">
              <img src="/brand/mytitan-logo-light.svg" alt="MyTitan" className="mkt-brand__logo" />
            </span>
          </Link>

          <nav className="mkt-topbar__nav" aria-label="Primary">
            <a href="#platform">Platform</a>
            <a href="#operations">Operations</a>
            <a href="#governance">Governance</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>

          <div className="mkt-actions">
            <a className="mkt-btn" href="https://app.mytitan.co.uk/login">
              Sign in
            </a>
            <a className="mkt-btn mkt-btn--primary" href="https://app.mytitan.co.uk/signup">
              Start workspace
            </a>
          </div>
        </div>
      </header>

      <main className="mkt-page">{props.children}</main>
    </div>
  );
}
