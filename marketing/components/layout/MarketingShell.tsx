import React from 'react';

function flagOn(name: string) {
  const v = (process.env[name] || '').trim().toLowerCase();
  return v === 'on' || v === 'true' || v === '1';
}

export default function MarketingShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const polish = flagOn('MYTITAN_FEATURE_MARKETING_POLISH_V1');
  const [open, setOpen] = React.useState(false);

  if (!polish) {
    // Fallback: keep existing behavior minimal.
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <header className="mkt-nav sticky top-0 z-50">
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <a href="/" className="mkt-link" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 12, background: 'rgba(255,255,255,0.10)', display: 'inline-block' }} />
            <span style={{ fontWeight: 700, letterSpacing: 0.2, color: 'var(--mkt-fg)' }}>MyTitan</span>
          </a>

          <nav style={{ marginLeft: 12, display: 'none', gap: 16 }} className="md:flex">
            <a className="mkt-link" href="#product">Product</a>
            <a className="mkt-link" href="#pricing">Pricing</a>
            <a className="mkt-link" href="#security">Security</a>
          </nav>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
            <a className="mkt-link hidden md:inline" href="/login">Sign in</a>
            <a className="mkt-btn px-4 py-2 text-sm" href="/signup">Get started</a>
            <button
              type="button"
              aria-label="Open menu"
              className="mkt-btn px-3 py-2 text-sm md:hidden"
              onClick={() => setOpen(true)}
            >
              Menu
            </button>
          </div>
        </div>
      </header>

      {open ? (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-0 h-full"
            style={{
              width: 'min(86vw, 360px)',
              background: 'rgba(11,15,23,0.98)',
              borderLeft: '1px solid var(--mkt-border)',
              padding: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700 }}>Menu</div>
              <button className="mkt-btn px-3 py-2 text-sm" onClick={() => setOpen(false)}>Close</button>
            </div>

            <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              <a className="mkt-link" href="#product" onClick={() => setOpen(false)}>Product</a>
              <a className="mkt-link" href="#pricing" onClick={() => setOpen(false)}>Pricing</a>
              <a className="mkt-link" href="#security" onClick={() => setOpen(false)}>Security</a>
              <hr style={{ borderColor: 'var(--mkt-border)', margin: '10px 0' }} />
              <a className="mkt-link" href="/login" onClick={() => setOpen(false)}>Sign in</a>
              <a className="mkt-btn px-4 py-2 text-sm" href="/signup" onClick={() => setOpen(false)}>Get started</a>
            </div>
          </div>
        </div>
      ) : null}

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '34px 20px' }}>
        {children}
      </main>

      <footer style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px', opacity: 0.75, fontSize: 12 }}>
        © {new Date().getFullYear()} MyTitan
      </footer>
    </div>
  );
}
