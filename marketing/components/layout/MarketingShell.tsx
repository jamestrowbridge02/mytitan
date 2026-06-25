import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useRef, useState } from "react";

import { AppDownloadPrompt } from "../marketing/AppDownloadPrompt";
import { BESPOKE_ACCOUNT_URL, CONTACT_URL, ENTERPRISE_ACCOUNT_URL, SALES_EMAIL, SIGN_IN_URL, SIGN_UP_URL } from "../../lib/site-content";

const NAV_ITEMS = [
  { href: "/platform", label: "Platform", detail: "The connected operating workflow" },
  { href: "/solutions", label: "Solutions", detail: "Fit for office, field, and finance teams" },
  { href: "/#features", label: "Features", detail: "Booking, jobs, portal, stock, and reporting" },
  { href: "/pricing", label: "Pricing", detail: "Clear completed-job allowances" },
  { href: "/#integrations", label: "Integrations", detail: "Connected and readiness-gated providers" },
  { href: "/security", label: "Resources", detail: "Security, controls, and governance" },
  { href: "/contact", label: "Contact", detail: "Real support and commercial routes" },
];

function flagOn(name: string) {
  const value = (process.env[name] || "").trim().toLowerCase();
  return value === "on" || value === "true" || value === "1";
}

export default function MarketingShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const attrs = {
    "data-mkt-luxury": String(process.env.NEXT_PUBLIC_MYTITAN_MARKETING_LUXURY_V1 || "").toLowerCase(),
    "data-mkt-motion": String(process.env.NEXT_PUBLIC_MYTITAN_MARKETING_MOTION_V1 || "").toLowerCase(),
    "data-mkt-coherence": String(process.env.NEXT_PUBLIC_MYTITAN_MARKETING_COHERENCE_V1 || "").toLowerCase(),
    "data-mkt-perf": String(process.env.NEXT_PUBLIC_MYTITAN_MARKETING_PERF_V1 || "").toLowerCase(),
    "data-mkt-sidenav": flagOn("NEXT_PUBLIC_MYTITAN_MARKETING_SIDENAV_V1") ? "on" : "off",
  };

  useEffect(() => setMenuOpen(false), [router.asPath]);

  useEffect(() => {
    if (!menuOpen) return;
    const drawer = drawerRef.current;
    const focusable = Array.from(drawer?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') || []);
    focusable[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  return (
    <div {...attrs} className="mkt-shell">
      <header className="mkt-commandHeader">
        <div className="mkt-commandHeader__inner">
          <button
            ref={triggerRef}
            className="mkt-menuButton"
            type="button"
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
            aria-controls="mkt-navigation-drawer"
            onClick={() => setMenuOpen(true)}
          >
            <span aria-hidden="true" className="mkt-menuButton__icon"><i /><i /></span>
            <span>Menu</span>
          </button>

          <Link href="/" className="mkt-commandHeader__brand" aria-label="MyTitan home">
            <img src="/brand/mytitan-logo-light.svg" alt="MyTitan" />
          </Link>

          <div className="mkt-commandHeader__actions" aria-label="Commercial actions">
            <Link className="mkt-headerAction mkt-headerAction--quiet" href={CONTACT_URL}>Contact Us</Link>
            <Link className="mkt-headerAction mkt-headerAction--quiet mkt-headerAction--bespoke" href={BESPOKE_ACCOUNT_URL}>Discuss Bespoke Account</Link>
            <a className="mkt-headerAction mkt-headerAction--primary" href={SIGN_IN_URL}>Start Setup / Sign In</a>
          </div>
        </div>
      </header>

      {menuOpen ? (
        <div className="mkt-drawerLayer" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setMenuOpen(false);
            triggerRef.current?.focus();
          }
        }}>
          <div
            ref={drawerRef}
            id="mkt-navigation-drawer"
            className="mkt-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
          >
            <div className="mkt-drawer__header">
              <img src="/brand/mytitan-logo-light.svg" alt="MyTitan" />
              <button type="button" className="mkt-drawer__close" aria-label="Close navigation menu" onClick={() => {
                setMenuOpen(false);
                triggerRef.current?.focus();
              }}>Close</button>
            </div>
            <nav className="mkt-drawer__nav" aria-label="Primary navigation">
              {NAV_ITEMS.map((item) => (
                <Link key={item.label} href={item.href} className="mkt-drawer__link">
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </Link>
              ))}
            </nav>
            <div className="mkt-drawer__footer">
              <AppDownloadPrompt compact />
              <a href={SIGN_IN_URL}>Sign in</a>
              <a href={SIGN_UP_URL}>Create your workspace</a>
              <Link href={ENTERPRISE_ACCOUNT_URL}>Request enterprise account</Link>
            </div>
          </div>
        </div>
      ) : null}

      <main className="mkt-page">{children}</main>

      <footer className="mkt-siteFooter">
        <div className="mkt-siteFooter__inner">
          <div className="mkt-siteFooter__brand">
            <img src="/brand/mytitan-logo-light.svg" alt="MyTitan" className="mkt-siteFooter__logo" />
            <p>One clear system for field-service operations.</p>
          </div>
          <div className="mkt-siteFooter__links">
            <div className="mkt-siteFooter__column">
              <h3>Product</h3>
              <Link href="/#features">Features</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/#integrations">Integrations</Link>
            </div>
            <div className="mkt-siteFooter__column">
              <h3>Company</h3>
              <Link href={CONTACT_URL}>Contact Us</Link>
              <Link href="/solutions">Solutions</Link>
            </div>
            <div className="mkt-siteFooter__column">
              <h3>Legal</h3>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/cookies">Cookies</Link>
              <Link href="/data-retention">Data retention</Link>
            </div>
            <div className="mkt-siteFooter__column mkt-siteFooter__column--contact">
              <h3>Contact</h3>
              <a className="mkt-siteFooter__mail" href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>
            </div>
            <div className="mkt-siteFooter__column">
              <h3>Account</h3>
              <a href={SIGN_UP_URL}>Create workspace</a>
              <a href={SIGN_IN_URL}>Sign in</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
