import Link from "next/link";
import React from "react";

type PaletteItem = {
  label: string;
  href: string;
};

const ITEMS: PaletteItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Command Centre", href: "/dashboard/command-centre-v2" },
  { label: "Jobs", href: "/dashboard/jobs" },
  { label: "New job", href: "/dashboard/jobs/new" },
  { label: "Bookings", href: "/dashboard/bookings" },
  { label: "Calendar", href: "/dashboard/calendar" },
  { label: "Customers", href: "/dashboard/customers" },
  { label: "Integrations", href: "/dashboard/integrations" },
  { label: "Settings", href: "/dashboard/settings" },
  { label: "Developer Admin", href: "/dev-admin" },
];

export default function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const list = q ? ITEMS.filter((item) => item.label.toLowerCase().includes(q)) : ITEMS;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.38)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "10vh 16px 16px",
      }}
      onClick={() => setOpen(false)}
    >
      <div
        className="card"
        style={{ width: "min(680px, 100%)", maxHeight: "70vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          className="input"
          autoFocus
          placeholder="Search routes and jump"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="operator-note" style={{ marginTop: 4 }}>
          Jump between core operator screens without using the sidebar.
        </div>
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {list.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="button secondary"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
