import Link from "next/link";
import React from "react";

export default function MarketingShell(props: { children: React.ReactNode }) {
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
              href="https://app.mytitan.co.uk"
              className="rounded-xl border border-border/60 px-3 py-2 text-sm hover:bg-[color:var(--surface-1)]"
            >
              Sign in
            </Link>
            <Link
              href="https://app.mytitan.co.uk/signup"
              className="rounded-xl bg-[color:var(--brand-600)] px-3 py-2 text-sm text-white shadow-sm hover:opacity-95"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main>{props.children}</main>

      <footer className="border-t border-border/60 bg-[color:var(--surface-0)]">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <div className="text-sm font-semibold">MyTitan</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Scheduling, jobs, customers, billing — one system, built for scale.
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              <div className="font-semibold text-foreground">Product</div>
              <div className="mt-2 space-y-2">
                <a className="block hover:text-foreground" href="#product">Overview</a>
                <a className="block hover:text-foreground" href="#security">Security</a>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              <div className="font-semibold text-foreground">Company</div>
              <div className="mt-2 space-y-2">
                <a className="block hover:text-foreground" href="#faq">FAQ</a>
                <a className="block hover:text-foreground" href="#pricing">Pricing</a>
              </div>
            </div>
          </div>
          <div className="mt-10 text-xs text-muted-foreground">
            © {new Date().getFullYear()} MyTitan. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
