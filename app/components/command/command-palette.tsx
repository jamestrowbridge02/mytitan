import Link from "next/link";
import React from "react";
import { getBusinessTerms, getCommandCentreHref, getOptionalModuleVisibility } from "../../lib/business-config";
import { useTenantSettings } from "../../lib/tenant-settings";

type PaletteItem = {
  label: string;
  href: string;
};

export default function CommandPalette() {
  const { settings } = useTenantSettings();
  const terms = getBusinessTerms(settings);
  const commandCentreHref = getCommandCentreHref(settings);
  const moduleVisibility = getOptionalModuleVisibility(settings);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const items: PaletteItem[] = React.useMemo(
    () =>
      [
        { label: "Dashboard", href: "/dashboard" },
        { label: "Command Centre", href: commandCentreHref },
        { label: terms.jobs, href: "/dashboard/jobs" },
        { label: `New ${terms.jobs.slice(0, -1) || "Job"}`, href: "/dashboard/jobs/new" },
        { label: terms.bookings, href: "/dashboard/bookings" },
        { label: "Calendar", href: "/dashboard/calendar" },
        { label: terms.customers, href: "/dashboard/customers" },
        moduleVisibility.showIntelligence ? { label: "Intelligence", href: "/dashboard/intelligence" } : null,
        { label: "Billing readiness", href: "/dashboard/billing/readiness" },
        moduleVisibility.showPortalOps ? { label: "Portal Ops", href: "/dashboard/portal" } : null,
        moduleVisibility.showTechnicianQueue ? { label: `${terms.technicians} queue`, href: "/dashboard/technician" } : null,
        { label: "Integrations", href: "/dashboard/integrations" },
        { label: "Automations", href: "/dashboard/settings/automations" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Developer Admin", href: "/dev-admin" },
      ].filter((item): item is PaletteItem => Boolean(item)),
    [commandCentreHref, moduleVisibility.showIntelligence, moduleVisibility.showPortalOps, moduleVisibility.showTechnicianQueue, terms.bookings, terms.customers, terms.jobs, terms.technicians],
  );

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
  const list = q ? items.filter((item) => item.label.toLowerCase().includes(q)) : items;

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
