import React from "react";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <div className="mt-container" style={{ padding: "18px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 12,
              background: "linear-gradient(135deg, rgba(110,231,255,.20), rgba(167,139,250,.18))",
              border: "1px solid rgba(255,255,255,.10)",
              boxShadow: "var(--sh-sm)"
            }} />
            <div style={{ fontWeight: 700, letterSpacing: ".2px" }}>MyTitan</div>
          </div>
          <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <a href="/" style={{ color: "var(--muted-fg)" }}>Home</a>
            <a href="/dashboard" style={{ color: "var(--muted-fg)" }}>Dashboard</a>
            <a href="/settings" style={{ color: "var(--muted-fg)" }}>Settings</a>
          </nav>
        </div>
      </header>

      <main>
        <div className="mt-container" style={{ padding: "28px 0" }}>
          {children}
        </div>
      </main>

      <footer style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
        <div className="mt-container" style={{ padding: "18px 0", color: "var(--muted-fg)", fontSize: "var(--text-sm)" }}>
          © {new Date().getFullYear()} MyTitan. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
