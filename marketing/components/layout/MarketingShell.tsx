import Link from "next/link";
import React from "react";

function flagOn(name: string) {
  const v = (process.env[name] || "").trim().toLowerCase();
  return v === "on" || v === "true" || v === "1";
}

export default function MarketingShell(props: { children: React.ReactNode }) {
  const sideNav = flagOn("NEXT_PUBLIC_MYTITAN_MARKETING_SIDENAV_V1");
  const [open, setOpen] = React.useState(false);

  // Default behavior: do not change current marketing unless flag is ON.
  if (!sideNav) {
    return (
      <div className="min-h-screen bg-[color:var(--surface-0)] text-foreground">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-[color:var(--surface-0)]/85 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-[color:var(--brand-600)] shadow-sm" />
              <div className="leading-tight">
                <div className="text-sm font-semibold">MyTitan</div>
                <div className="text-xs text-muted-foreground">Business OS</div>
              </div>
            </Link>

            <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
              <a href="#product" className="hover:text-foreground">Product</a>
              <a href="#pricing" className="hover:text-foreground">Pricing</a>
              <a href="#security" className="hover:text-foreground">Security</a>
              <a href="#faq" className="hover:text-foreground">FAQ</a>
            </nav>

            <div className="flex items-center gap-2">
              <Link
                href="https://app.mytitan.co.uk/login"
                className="rounded-xl border border-border/60 px-3 py-2 text-sm hover:bg-[color:var(--surface-1)]"
              >
                Sign in
              </Link>
              <Link
                href="https://app.mytitan.co.uk/signup"
                className="rounded-xl bg-[color:var(--brand-600)] px-3 py-2 text-sm text-white shadow-sm hover:opacity-95"
              >
                Get started
              </Link>
            </div>
          </div>
        </header>

        <main>{props.children}</main>
      </div>
    );
  }

  // Luxury side-nav mode (desktop), mobile drawer on small screens
  return (
    <div data-mkt-lux="1" className="min-h-screen">
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-40 mkt-lux-top">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <button
            type="button"
            className="mkt-lux-btn"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            Menu
          </button>

          <Link href="/" className="mkt-lux-brand">
            <span className="mkt-lux-mark" />
            <span>MyTitan</span>
          </Link>

          <div className="w-[64px]" />
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl md:grid-cols-[260px_1fr]">
        {/* Desktop side nav */}
        <aside className="hidden md:block mkt-lux-side">
          <div className="p-6">
            <Link href="/" className="mkt-lux-brand">
              <span className="mkt-lux-mark" />
              <span>MyTitan</span>
            </Link>

            <div className="mt-10 space-y-2 text-sm">
              <a className="mkt-lux-link" href="#product">Product</a>
              <a className="mkt-lux-link" href="#pricing">Pricing</a>
              <a className="mkt-lux-link" href="#security">Security</a>
              <a className="mkt-lux-link" href="#faq">FAQ</a>
            </div>

            <div className="mt-10 space-y-2">
              <a className="mkt-lux-btn w-full text-center" href="https://app.mytitan.co.uk/login">Sign in</a>
              <a className="mkt-lux-btn mkt-lux-btn-primary w-full text-center" href="https://app.mytitan.co.uk/signup">Get started</a>
            </div>

            <div className="mt-10 text-xs opacity-70">
              Built for operational clarity and speed.
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="mkt-lux-main px-4 py-10 md:px-10">
          {props.children}
          <footer className="mt-16 border-t pt-8 text-xs opacity-70">
            © {new Date().getFullYear()} MyTitan. All rights reserved.
          </footer>
        </main>
      </div>

      {/* Mobile drawer */}
      {open ? (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[86vw] max-w-[360px] mkt-lux-drawer">
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div className="mkt-lux-brand">
                  <span className="mkt-lux-mark" />
                  <span>MyTitan</span>
                </div>
                <button className="mkt-lux-btn" onClick={() => setOpen(false)}>Close</button>
              </div>

              <div className="mt-8 space-y-2 text-sm">
                <a className="mkt-lux-link" href="#product" onClick={() => setOpen(false)}>Product</a>
                <a className="mkt-lux-link" href="#pricing" onClick={() => setOpen(false)}>Pricing</a>
                <a className="mkt-lux-link" href="#security" onClick={() => setOpen(false)}>Security</a>
                <a className="mkt-lux-link" href="#faq" onClick={() => setOpen(false)}>FAQ</a>
              </div>

              <div className="mt-8 space-y-2">
                <a className="mkt-lux-btn w-full text-center" href="https://app.mytitan.co.uk/login" onClick={() => setOpen(false)}>Sign in</a>
                <a className="mkt-lux-btn mkt-lux-btn-primary w-full text-center" href="https://app.mytitan.co.uk/signup" onClick={() => setOpen(false)}>Get started</a>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
