import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";

import { SALES_EMAIL, SIGN_IN_URL, SIGN_UP_URL } from "../../lib/site-content";

function flagOn(name: string) {
  const value = (process.env[name] || "").trim().toLowerCase();
  return value === "on" || value === "true" || value === "1";
}

export default function MarketingShell(props: { children: React.ReactNode }) {
  const sideNav = flagOn("NEXT_PUBLIC_MYTITAN_MARKETING_SIDENAV_V1");
  const router = useRouter();

  const navItems = [
    { href: "/platform", label: "Platform" },
    { href: "/solutions", label: "Solutions" },
    { href: "/industries", label: "Industries" },
    { href: "/security", label: "Security" },
    { href: "/pricing", label: "Pricing" },
    { href: "/demo", label: "Demo" },
  ];

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
            <a className="mkt-navLink mkt-navLink--utility" href={SIGN_IN_URL}>
              Sign in
            </a>
            {navItems.map((item) => {
              const active = router.pathname === item.href;
              return (
                <Link key={item.href} href={item.href} className={active ? "mkt-navLink mkt-navLink--active" : "mkt-navLink"}>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mkt-actions mkt-actions--header">
            <Link className="mkt-btn mkt-btn--primary" href="/demo">
              Request demo
            </Link>
            <Link className="mkt-btn" href="/platform">
              See platform
            </Link>
            <a className="mkt-btn mkt-btn--ghost" href={SIGN_UP_URL}>
              Get started
            </a>
          </div>
        </div>
      </header>

      <main className="mkt-page">{props.children}</main>

      <footer className="mkt-siteFooter">
        <div className="mkt-siteFooter__inner">
          <div className="mkt-siteFooter__brand">
            <img src="/brand/mytitan-logo-light.svg" alt="MyTitan" className="mkt-siteFooter__logo" />
            <p>
              MyTitan is the operating system for service businesses that need one controlled model for operations,
              revenue, customer experience, and governance.
            </p>
          </div>
          <div className="mkt-siteFooter__links">
            <div>
              <h3>Explore</h3>
              <Link href="/platform">Platform</Link>
              <Link href="/solutions">Solutions</Link>
              <Link href="/security">Security</Link>
            </div>
            <div>
              <h3>Evaluate</h3>
              <Link href="/demo">Request demo</Link>
              <Link href="/pricing">Pricing</Link>
              <a href={SIGN_IN_URL}>Sign in</a>
            </div>
            <div>
              <h3>Contact</h3>
              <p>Review the platform in context, then open the workspace when the fit is clear.</p>
              <a className="mkt-siteFooter__mail" href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>
              <div className="mkt-actions" style={{ justifyContent: "flex-start" }}>
                <a className="mkt-btn mkt-btn--primary" href={SIGN_UP_URL}>
                  Get started
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
