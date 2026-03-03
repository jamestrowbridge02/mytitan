import Link from "next/link";
import React from "react";

function flagOn(name: string) {
  const v = (process.env[name] || "").trim().toLowerCase();
  return v === "on" || v === "true" || v === "1";
}

type NavSection = { id: string; label: string };

export default function MarketingShell(props: { children: React.ReactNode }) {
  const sideNav = flagOn("NEXT_PUBLIC_MYTITAN_MARKETING_SIDENAV_V1");
  const [open, setOpen] = React.useState(false);

  // Default behavior: unchanged if flag off.
  if (!sideNav) return <>{props.children}</>;

  const sections: NavSection[] = [
    { id: "product", label: "Product" },
    { id: "pricing", label: "Pricing" },
    { id: "security", label: "Security" },
    { id: "faq", label: "FAQ" },
  ];

  const [active, setActive] = React.useState<string>("product");

  React.useEffect(() => {
    const ids = sections.map((s) => s.id);
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        // choose the most visible intersecting section
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0))[0];
        if (visible?.target?.id) setActive(visible.target.id);
      },
      { root: null, threshold: [0.15, 0.25, 0.35, 0.5], rootMargin: "-20% 0px -60% 0px" },
    );

    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div data-mkt-lux="1" className="min-h-screen">
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-40 mkt-lux-top">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <button type="button" className="mkt-lux-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            Menu
          </button>

          <Link href="/" className="mkt-lux-brand">
            <span className="mkt-lux-mark" />
            <span>MyTitan</span>
          </Link>

          <div className="w-[64px]" />
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl md:grid-cols-[280px_1fr]">
        {/* Desktop side nav */}
        <aside className="hidden md:block mkt-lux-side">
          <div className="p-7">
            <Link href="/" className="mkt-lux-brand">
              <span className="mkt-lux-mark" />
              <span>MyTitan</span>
            </Link>

            <div className="mt-10 space-y-2 text-sm">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollTo(s.id)}
                  className={"mkt-lux-link mkt-lux-link-btn " + (active === s.id ? "is-active" : "")}
                >
                  <span className="mkt-lux-dot" />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-10 space-y-2">
              <a className="mkt-lux-btn w-full text-center" href="https://app.mytitan.co.uk/login">
                Sign in
              </a>
              <a className="mkt-lux-btn mkt-lux-btn-primary w-full text-center" href="https://app.mytitan.co.uk/signup">
                Get started
              </a>
            </div>

            <div className="mt-10 mkt-lux-mini">
              <div className="font-semibold">Designed for operators</div>
              <div className="mt-1 opacity-80">
                Scheduling → jobs → CRM → invoices → payments → portal.
              </div>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="mkt-lux-main px-4 py-10 md:px-12">
          {props.children}
          <footer className="mt-16 border-t pt-8 text-xs opacity-70">© {new Date().getFullYear()} MyTitan.</footer>
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
                <button className="mkt-lux-btn" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>

              <div className="mt-8 space-y-2 text-sm">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    className={"mkt-lux-link mkt-lux-link-btn " + (active === s.id ? "is-active" : "")}
                    onClick={() => {
                      setOpen(false);
                      setTimeout(() => scrollTo(s.id), 50);
                    }}
                    type="button"
                  >
                    <span className="mkt-lux-dot" />
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>

              <div className="mt-8 space-y-2">
                <a className="mkt-lux-btn w-full text-center" href="https://app.mytitan.co.uk/login">
                  Sign in
                </a>
                <a className="mkt-lux-btn mkt-lux-btn-primary w-full text-center" href="https://app.mytitan.co.uk/signup">
                  Get started
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
