export type OperatorRecentDestination = {
  href: string;
  label: string;
  description?: string;
  timestamp: number;
};

export type OperatorQuickAction = {
  label: string;
  href: string;
  description: string;
  keywords?: string[];
};

export function canAccessDashboardHref(href: string, permissions: Record<string, boolean> | null | undefined) {
  const target = normalizePath(href);
  if (target === "/dev-admin" || target === "/platform") return false;
  if (!target.startsWith("/dashboard")) return false;
  if (target.startsWith("/dashboard/billing")) return Boolean(permissions?.["billing.manage"]);
  if (target.startsWith("/dashboard/finance")) return Boolean(permissions?.["billing.manage"]);
  if (target.startsWith("/dashboard/revenue")) return Boolean(permissions?.["billing.manage"]);
  if (target.startsWith("/dashboard/quotes")) return Boolean(permissions?.["billing.manage"]);
  if (target.startsWith("/dashboard/users")) return Boolean(permissions?.["users.invite"] || permissions?.["users.role_assign"]);
  if (target.startsWith("/dashboard/portal")) return Boolean(permissions?.["portal.manage"]);
  if (target.startsWith("/dashboard/technician")) return Boolean(permissions?.["technician.execute"]);
  if (target.startsWith("/dashboard/analytics")) return Boolean(permissions?.["dashboard.view_intelligence"]);
  if (target.startsWith("/dashboard/compliance")) return Boolean(permissions?.["dashboard.view_intelligence"]);
  if (target.startsWith("/dashboard/intelligence")) return Boolean(permissions?.["dashboard.view_intelligence"]);
  if (target.startsWith("/dashboard/settings")) return Boolean(permissions?.["settings.manage"]);
  if (target.startsWith("/dashboard/scheduling")) {
    return Boolean(permissions?.["jobs.transition"] || permissions?.["dashboard.view_intelligence"] || permissions?.["technician.execute"]);
  }
  return true;
}

export const OPERATOR_RECENTS_STORAGE_KEY = "mytitan_operator_recent_destinations_v1";

const MAX_RECENTS = 6;

function normalizePath(value: string) {
  const clean = String(value || "").split(/[?#]/, 1)[0]?.trim() || "/";
  if (clean.length > 1 && clean.endsWith("/")) {
    return clean.replace(/\/+$/, "");
  }
  return clean || "/";
}

export function getOperatorRouteMeta(pathname: string, href?: string) {
  const path = normalizePath(pathname);

  if (path === "/dashboard") {
    return {
      label: "Dashboard",
      description: "Business pulse, launch pressure, and the strongest next move.",
    };
  }
  if (path === "/dashboard/work") {
    return {
      label: "Start Work",
      description: "Open the job sheet flow and keep the day moving.",
    };
  }
  if (path === "/dashboard/command-centre-v2") {
    return {
      label: "Live Work",
      description: "Run the active queue from one calmer command surface.",
    };
  }
  if (path === "/dashboard/jobs") {
    return {
      label: "Jobs",
      description: "Authoritative work records, transitions, and follow-through.",
    };
  }
  if (path.startsWith("/dashboard/jobs/")) {
    return {
      label: "Job Detail",
      description: "Open work detail, handoff, and completion follow-through.",
    };
  }
  if (path === "/dashboard/bookings") {
    return {
      label: "Bookings",
      description: "Turn demand into scheduled work without losing context.",
    };
  }
  if (path === "/dashboard/customers") {
    return {
      label: "Customers",
      description: "Keep contact, work, and follow-up moving from one list.",
    };
  }
  if (path.startsWith("/dashboard/customers/")) {
    return {
      label: "Customer Flow",
      description: "Customer history, communication, and next work in one rhythm.",
    };
  }
  if (path === "/dashboard/notifications") {
    return {
      label: "Notifications",
      description: "Review operational updates and clear the queue quickly.",
    };
  }
  if (path.startsWith("/dashboard/billing")) {
    return {
      label: "Billing",
      description: "Protect billing boundaries and resolve readiness issues fast.",
    };
  }
  if (path === "/dashboard/finance") {
    return {
      label: "Finance",
      description: "Handle payment follow-up and balance pressure.",
    };
  }
  if (path.startsWith("/dashboard/settings")) {
    return {
      label: "Settings",
      description: "Workspace control, launch state, and operating rules.",
    };
  }
  if (path === "/dashboard/integrations") {
    return {
      label: "Connected Tools",
      description: "Reconnect providers and keep operational dependencies healthy.",
    };
  }
  if (path === "/dashboard/help") {
    return {
      label: "Help",
      description: "Support, bug reporting, and product feedback.",
    };
  }

  const fallbackPath = href ? normalizePath(href) : path;
  return {
    label: fallbackPath === "/" ? "Workspace" : fallbackPath.split("/").filter(Boolean).slice(-1)[0]?.replace(/[-_]/g, " ") || "Workspace",
    description: "Recent workspace destination.",
  };
}

export function rememberOperatorRecentDestination(destination: {
  href: string;
  label?: string;
  description?: string;
}) {
  if (typeof window === "undefined") return;
  const href = String(destination.href || "").trim();
  if (!href.startsWith("/dashboard")) return;

  const meta = getOperatorRouteMeta(href, href);
  const entry: OperatorRecentDestination = {
    href,
    label: String(destination.label || meta.label || "Workspace"),
    description: String(destination.description || meta.description || "").trim() || undefined,
    timestamp: Date.now(),
  };

  try {
    const current = readOperatorRecentDestinations();
    const deduped = current.filter((item) => normalizePath(item.href) !== normalizePath(entry.href));
    window.localStorage.setItem(
      OPERATOR_RECENTS_STORAGE_KEY,
      JSON.stringify([entry, ...deduped].slice(0, MAX_RECENTS)),
    );
  } catch {
    // ignore storage failures
  }
}

export function readOperatorRecentDestinations(): OperatorRecentDestination[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(OPERATOR_RECENTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        href: String(item?.href || "").trim(),
        label: String(item?.label || "").trim(),
        description: String(item?.description || "").trim() || undefined,
        timestamp: Number(item?.timestamp || 0),
      }))
      .filter((item) => item.href.startsWith("/dashboard") && item.label);
  } catch {
    return [];
  }
}

export function getOperatorQuickActions(pathname: string): OperatorQuickAction[] {
  const path = normalizePath(pathname);

  if (path === "/dashboard") {
    return [
      { label: "Open live work", href: "/dashboard/command-centre-v2", description: "Run the active queue from the command surface.", keywords: ["queue", "command", "board"] },
      { label: "Start new job", href: "/dashboard/jobs/new?guided=1&entry=work", description: "Open the next job without navigating through setup.", keywords: ["job", "new", "work"] },
      { label: "Review bookings", href: "/dashboard/bookings", description: "Catch demand that still needs conversion or scheduling.", keywords: ["booking", "requests", "schedule"] },
      { label: "Open customers", href: "/dashboard/customers", description: "Move from contact into work and follow-up.", keywords: ["crm", "contact", "customer"] },
    ];
  }

  if (path === "/dashboard/work") {
    return [
      { label: "Open full job sheet", href: "/dashboard/jobs/new?entry=work", description: "Start the authoritative work record first.", keywords: ["job", "sheet", "work"] },
      { label: "Use guided job form", href: "/dashboard/jobs/new?guided=1&entry=work", description: "Use the lighter workflow when someone needs more structure.", keywords: ["guided", "form"] },
      { label: "Open live work", href: "/dashboard/command-centre-v2", description: "Switch into the live queue without losing the work rhythm.", keywords: ["queue", "live"] },
    ];
  }

  if (path === "/dashboard/command-centre-v2") {
    return [
      { label: "Open all jobs", href: "/dashboard/jobs", description: "Drop into the full job list when you need deeper record review.", keywords: ["jobs", "list"] },
      { label: "Review scheduling", href: "/dashboard/scheduling", description: "Check calendar pressure and assignment flow.", keywords: ["schedule", "calendar"] },
      { label: "Open compliance", href: "/dashboard/compliance", description: "Resolve overdue or breached work before it drags the day.", keywords: ["sla", "exceptions", "breach"] },
    ];
  }

  if (path === "/dashboard/customers") {
    return [
      { label: "Add contact", href: "/dashboard/customers?compose=add-contact", description: "Create a customer without leaving the workflow list.", keywords: ["contact", "new", "customer"] },
      { label: "Create job", href: "/dashboard/jobs/new?guided=1&entry=work", description: "Start work from customer intake without extra setup steps.", keywords: ["job", "new", "work"] },
      { label: "Review bookings", href: "/dashboard/bookings", description: "Check new demand before dispatching work.", keywords: ["booking", "requests"] },
    ];
  }

  if (path.startsWith("/dashboard/customers/")) {
    return [
      { label: "Create linked job", href: `${path}?focus=create-job`, description: "Move directly from customer context into the next job.", keywords: ["job", "linked"] },
      { label: "Open communications", href: `${path}?focus=communications`, description: "Jump to the send-update panel without extra scanning.", keywords: ["sms", "email", "update"] },
      { label: "Review quotes", href: "/dashboard/quotes", description: "Check open commercial work tied to this customer.", keywords: ["quote", "pricing"] },
    ];
  }

  if (path === "/dashboard/notifications") {
    return [
      { label: "Return to dashboard", href: "/dashboard", description: "Go back to the workspace pulse after clearing updates.", keywords: ["home", "pulse"] },
      { label: "Open live work", href: "/dashboard/command-centre-v2", description: "Act on queue pressure surfaced by notifications.", keywords: ["live", "queue"] },
      { label: "Open billing readiness", href: "/dashboard/billing/readiness", description: "Resolve billing follow-up when finance notifications stack up.", keywords: ["billing", "invoice"] },
    ];
  }

  if (path.startsWith("/dashboard/billing") || path === "/dashboard/finance") {
    return [
      { label: "Open billing readiness", href: "/dashboard/billing/readiness", description: "Focus on lifecycle controls and follow-through first.", keywords: ["billing", "readiness"] },
      { label: "Open finance", href: "/dashboard/finance", description: "Review payment follow-up and balances.", keywords: ["payments", "finance"] },
      { label: "Open launch control", href: "/dashboard/settings/launch-control", description: "Check operational boundaries without drifting into setup sprawl.", keywords: ["launch", "operations"] },
    ];
  }

  if (path.startsWith("/dashboard/settings") || path === "/dashboard/integrations") {
    return [
      { label: "Open launch control", href: "/dashboard/settings/launch-control", description: "Stay anchored on what is live, blocked, or needs attention.", keywords: ["launch", "control"] },
      { label: "Open operations", href: "/dashboard/settings/operations", description: "Review operational defaults without browsing every setting tab.", keywords: ["operations", "settings"] },
      { label: "Open connected tools", href: "/dashboard/integrations", description: "Check provider health and reconnect issues directly.", keywords: ["integrations", "tools", "providers"] },
    ];
  }

  return [
    { label: "Open dashboard", href: "/dashboard", description: "Return to the workspace pulse and next action.", keywords: ["home", "dashboard"] },
    { label: "Open live work", href: "/dashboard/command-centre-v2", description: "Move into the live queue when work needs to move now.", keywords: ["live", "queue"] },
    { label: "Open customers", href: "/dashboard/customers", description: "Keep customer context and follow-up connected to the work.", keywords: ["customers", "crm"] },
  ];
}
