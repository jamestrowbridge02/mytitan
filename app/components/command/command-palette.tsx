import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";
import { apiFetch } from "../../lib/api";
import { getBusinessTerms, getCommandCentreHref, getOptionalModuleVisibility } from "../../lib/business-config";
import {
  canAccessDashboardHref,
  getOperatorQuickActions,
  getOperatorRouteMeta,
  readOperatorRecentDestinations,
  rememberOperatorRecentDestination,
  type OperatorRecentDestination,
} from "../../lib/operator-recents";
import { useTenantSettings } from "../../lib/tenant-settings";
import { emptyPermissionSnapshot, normalizePermissionSnapshot } from "../../lib/workspace-permissions";

type PaletteItem = {
  id: string;
  label: string;
  href: string;
  description: string;
  section: string;
  keywords: string[];
  status?: string;
};

type CommandPaletteOpenDetail = {
  routesOnly?: boolean;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function roleAllowsRoute(role: string | null, href: string) {
  const normalizedRole = String(role || "").trim().toUpperCase();
  if (!normalizedRole || normalizedRole === "OWNER" || normalizedRole === "ADMIN" || normalizedRole === "DISPATCHER" || normalizedRole === "STAFF") {
    return true;
  }
  const path = href.split(/[?#]/, 1)[0];
  if (normalizedRole === "TECHNICIAN" || normalizedRole === "EXTERNAL_OPERATOR") {
    if (path.startsWith("/dashboard/jobs/")) return true;
    return new Set([
      "/dashboard",
      "/dashboard/work",
      "/dashboard/technician",
      "/dashboard/jobs",
      "/dashboard/scheduling",
      "/dashboard/customers",
      "/dashboard/notifications",
    ]).has(path);
  }
  if (normalizedRole === "FINANCE") {
    return new Set([
      "/dashboard",
      "/dashboard/customers",
      "/dashboard/finance",
      "/dashboard/revenue",
      "/dashboard/quotes",
      "/dashboard/billing",
      "/dashboard/billing/readiness",
      "/dashboard/analytics",
      "/dashboard/integrations",
      "/dashboard/notifications",
    ]).has(path);
  }
  return ![
    "/dashboard/settings",
    "/dashboard/settings/launch-control",
    "/dashboard/settings/operations",
    "/dashboard/settings/payments",
    "/dashboard/users",
    "/dashboard/inventory",
    "/dashboard/purchase-orders",
    "/dashboard/locations",
    "/dashboard/assets",
    "/dashboard/enterprise",
  ].some((restricted) => path === restricted || path.startsWith(`${restricted}/`));
}

export default function CommandPalette() {
  const router = useRouter();
  const { settings } = useTenantSettings();
  const terms = getBusinessTerms(settings);
  const commandCentreHref = getCommandCentreHref(settings);
  const moduleVisibility = getOptionalModuleVisibility(settings);
  const [open, setOpen] = React.useState(false);
  const [routesOnly, setRoutesOnly] = React.useState(false);
  const [platformAdmin, setPlatformAdmin] = React.useState(false);
  const [developerMode, setDeveloperMode] = React.useState(false);
  const [workspaceRole, setWorkspaceRole] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [recentDestinations, setRecentDestinations] = React.useState<OperatorRecentDestination[]>([]);
  const [permissions, setPermissions] = React.useState(() => emptyPermissionSnapshot());
  const [customers, setCustomers] = React.useState<any[]>([]);
  const [jobs, setJobs] = React.useState<any[]>([]);
  const [bookings, setBookings] = React.useState<any[]>([]);
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [integrationAttention, setIntegrationAttention] = React.useState<any[]>([]);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const currentMeta = React.useMemo(() => getOperatorRouteMeta(router.pathname, router.asPath), [router.asPath, router.pathname]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function loadAuthorization() {
      const me = await apiFetch("/me").catch(() => null);
      if (cancelled) return;
      setPermissions(normalizePermissionSnapshot(me?.permissions));
      setPlatformAdmin(Boolean(me?.platformAdmin));
      setWorkspaceRole(typeof me?.role === "string" ? me.role : null);
      const raw = String(process.env.NEXT_PUBLIC_DEV_ADMIN || "").trim().toLowerCase();
      setDeveloperMode(
        typeof window !== "undefined" &&
          (window.localStorage.getItem("MYTITAN_DEV") === "1" || raw === "on" || raw === "true" || raw === "1"),
      );
    }
    void loadAuthorization();
    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open || routesOnly) return;
    let cancelled = false;
    async function loadOperationalCommands() {
      const [customerRows, jobRows, bookingRows, notificationRows, integrationRows] = await Promise.all([
        apiFetch("/customers?limit=100").catch(() => []),
        apiFetch("/jobs?includeArchived=true").catch(() => []),
        apiFetch("/bookings").catch(() => []),
        apiFetch("/notifications").catch(() => []),
        apiFetch("/integrations/health").catch(() => []),
      ]);
      if (cancelled) return;
      setCustomers(Array.isArray(customerRows) ? customerRows.slice(0, 100) : []);
      setJobs(Array.isArray(jobRows) ? jobRows.slice(0, 150) : []);
      setBookings(Array.isArray(bookingRows) ? bookingRows.slice(0, 12) : []);
      setNotifications(Array.isArray(notificationRows) ? notificationRows.slice(0, 12) : []);
      setIntegrationAttention(Array.isArray(integrationRows) ? integrationRows.filter((row) => {
        const state = String(row?.status || row?.health || row?.state || "").toLowerCase();
        return state.includes("attention") || state.includes("error") || state.includes("failed") || state.includes("disconnected");
      }).slice(0, 5) : []);
    }
    void loadOperationalCommands();
    return () => {
      cancelled = true;
    };
  }, [open, routesOnly]);

  const baseItems: PaletteItem[] = React.useMemo(
    () =>
      [
        {
          id: "dashboard",
          label: "Dashboard",
          href: "/dashboard",
          description: "One workflow board for get customers, book work, complete work, get paid, and grow business.",
          section: "Work",
          keywords: ["dashboard", "home", "pulse", "workflow"],
        },
        {
          id: "command-centre",
          label: "Live work",
          href: commandCentreHref,
          description: "Run the active queue from the command surface.",
          section: "Complete Work",
          keywords: ["command centre", "command center", "live work", "queue", "board", "complete work"],
        },
        {
          id: "jobs",
          label: "Jobs",
          href: "/dashboard/jobs",
          description: "Authoritative work records and follow-through.",
          section: "Complete Work",
          keywords: ["jobs", "work orders", "queue", "complete work"],
        },
        {
          id: "new-job",
          label: `New ${terms.jobs.slice(0, -1) || "Job"}`,
          href: "/dashboard/jobs/new?guided=1&entry=work",
          description: "Open the next job without browsing through setup.",
          section: "Complete Work",
          keywords: ["new job", "guided form", "create job", "complete work"],
        },
        {
          id: "assign-technician",
          label: "Assign technician",
          href: "/dashboard/scheduling?focus=unassigned",
          description: "Open unassigned work and assignment recommendations.",
          section: "Book Work",
          keywords: ["assign technician", "assignment", "unassigned", "schedule", "book work"],
        },
        {
          id: "unpaid-invoices",
          label: "Unpaid invoices",
          href: "/dashboard/jobs?filter=unpaid",
          description: "Jump to jobs needing invoice or payment follow-up.",
          section: "Get Paid",
          keywords: ["unpaid", "invoice", "payment", "follow up", "get paid"],
        },
        {
          id: "bookings",
          label: "Bookings",
          href: "/dashboard/bookings",
          description: "Turn new demand into scheduled work.",
          section: "Book Work",
          keywords: ["bookings", "requests", "schedule", "book work"],
        },
        {
          id: "customers",
          label: "Customers",
          href: "/dashboard/customers",
          description: "Keep contact, history, and next work step connected.",
          section: "Get Customers",
          keywords: ["customers", "crm", "contacts", "get customers"],
        },
        {
          id: "calendar",
          label: "Calendar",
          href: "/dashboard/scheduling",
          description: "Plan capacity, timing, locations, and optional assignments.",
          section: "Book Work",
          keywords: ["calendar", "schedule", "capacity", "dispatch"],
        },
        {
          id: "payments-invoices",
          label: "Payments & Invoices",
          href: "/dashboard/finance",
          description: "Set up customer payments and invoices.",
          section: "Get Paid",
          keywords: ["payments", "invoices", "finance", "money owed"],
        },
        {
          id: "mytitan-account",
          label: "MyTitan Account",
          href: "/dashboard/billing",
          description: "Manage your MyTitan plan, usage, and account continuity.",
          section: "Account",
          keywords: ["account", "billing", "plan", "subscription"],
        },
        {
          id: "inventory",
          label: "Inventory",
          href: "/dashboard/inventory",
          description: "Track parts, stock levels, reservations, and transfers.",
          section: "Operations",
          keywords: ["inventory", "stock", "parts", "materials"],
        },
        {
          id: "suppliers",
          label: "Suppliers",
          href: "/dashboard/purchase-orders",
          description: "Manage supplier purchasing and incoming stock.",
          section: "Operations",
          keywords: ["suppliers", "purchase orders", "purchasing", "stock"],
        },
        {
          id: "assets",
          label: "Assets",
          href: "/dashboard/assets",
          description: "Manage equipment checkout, condition, and availability.",
          section: "Operations",
          keywords: ["assets", "tools", "equipment"],
        },
        {
          id: "locations",
          label: "Locations",
          href: "/dashboard/locations",
          description: "Manage branches, depots, vans, and opening hours.",
          section: "Operations",
          keywords: ["locations", "branches", "depots", "vans", "opening hours"],
        },
        {
          id: "job-sheet-templates",
          label: "Job Sheet Templates",
          href: "/dashboard/settings?tab=jobs&section=templates",
          description: "Choose approved job sheet templates.",
          section: "Settings",
          keywords: ["job sheet templates", "templates", "approved templates", "forms"],
        },
        {
          id: "team",
          label: "Team",
          href: "/dashboard/users",
          description: "Invite team members and manage workspace access.",
          section: "Settings",
          keywords: ["team", "users", "roles", "invite"],
        },
        {
          id: "notifications",
          label: "Notifications",
          href: "/dashboard/notifications",
          description: "Review operational updates without relying on email delivery.",
          section: "Complete Work",
          keywords: ["notifications", "inbox", "updates"],
        },
        {
          id: "communications",
          label: "Communications",
          href: "/dashboard/communications",
          description: "Review customer messages, portal updates, and delivery status.",
          section: "Get Customers",
          keywords: ["communications", "messages", "email", "sms", "whatsapp", "portal"],
        },
        {
          id: "billing-readiness",
          label: "Billing readiness",
          href: "/dashboard/billing/readiness",
          description: "Resolve lifecycle and invoice follow-through safely.",
          section: "Get Paid",
          keywords: ["billing", "invoices", "readiness", "payments"],
        },
        {
          id: "finance",
          label: "Get Paid overview",
          href: "/dashboard/finance",
          description: "Review payment follow-up and balance pressure.",
          section: "Get Paid",
          keywords: ["finance", "collection", "revenue"],
        },
        moduleVisibility.showIntelligence
          ? {
              id: "analytics",
              label: "Reports",
              href: "/dashboard/analytics",
              description: "Track workload, revenue, and operational movement.",
              section: "Grow Business",
              keywords: ["analytics", "reports", "insights", "grow business"],
            }
          : null,
        moduleVisibility.showIntelligence
          ? {
              id: "compliance",
              label: "Compliance",
              href: "/dashboard/compliance",
              description: "Review breached checks and overdue operational pressure.",
              section: "Insights",
              keywords: ["compliance", "sla", "exceptions"],
            }
          : null,
        {
          id: "integrations",
          label: "Connected Tools",
          href: "/dashboard/integrations",
          description: "Connect accounting, payments, calendar, and messaging.",
          section: "Operations",
          keywords: ["integrations", "tools", "providers"],
        },
        {
          id: "launch-control",
          label: "Launch Readiness",
          href: "/dashboard/settings/launch-control",
          description: "See what is live, blocked, or still needs setup.",
          section: "Operations",
          keywords: ["launch control", "operations", "readiness"],
        },
        {
          id: "settings",
          label: "Settings",
          href: "/dashboard/settings",
          description: "Workspace control without hunting through the sidebar.",
          section: "Operations",
          keywords: ["settings", "workspace"],
        },
        {
          id: "help",
          label: "Help",
          href: "/dashboard/help",
          description: "Support, bugs, and feedback.",
          section: "Operations",
          keywords: ["help", "support", "feedback"],
        },
        ["OWNER", "ADMIN"].includes(String(workspaceRole || ""))
          ? {
              id: "developer-tools",
              label: "Developer Tools",
              href: "/dashboard/settings/developer-tools",
              description: "Manage API tokens and webhooks for this workspace.",
              section: "Settings",
              keywords: ["developer", "api", "tokens", "webhooks"],
            }
          : null,
        developerMode
          ? {
              id: "developer-admin",
              label: "Internal Developer Admin",
              href: "/dev-admin",
              description: "Internal platform tooling.",
              section: "Platform",
              keywords: ["developer", "admin", "internal"],
            }
          : null,
        platformAdmin
          ? {
              id: "platform-admin",
              label: "Platform Admin",
              href: "/platform",
              description: "Open the separate MyTitan platform administration surface.",
              section: "Platform",
              keywords: ["platform", "admin", "internal"],
            }
          : null,
      ].filter((item): item is PaletteItem => Boolean(item)),
    [commandCentreHref, developerMode, moduleVisibility.showIntelligence, platformAdmin, terms.bookings, terms.customers, terms.jobs, workspaceRole],
  );

  const operationalItems = React.useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const matchesQuery = (values: unknown[]) => {
      if (!q) return false;
      return values.some((value) => String(value || "").toLowerCase().includes(q));
    };
    const unread = notifications.filter((item) => !item?.isRead);
    const waitingBooking = bookings.find((booking) => {
      const status = String(booking?.status || booking?.lifecycleStatus || "").toLowerCase();
      return status.includes("request") || status.includes("pending") || status.includes("confirm");
    });
    const sortedJobs = jobs
      .filter((job) => !job?.archivedAt)
      .sort((left, right) => new Date(right?.updatedAt || right?.createdAt || 0).getTime() - new Date(left?.updatedAt || left?.createdAt || 0).getTime());
    const matchedCustomers = customers.filter((customer) =>
      matchesQuery([customer.name, customer.companyName, customer.email, customer.phone, customer.mobile]),
    );
    const matchedJobs = sortedJobs.filter((job) =>
      matchesQuery([job.jobRef, job.title, job.customerName, job.customer?.name, job.status, job.id]),
    );
    const visibleCustomers = (q ? matchedCustomers : customers).slice(0, 8);
    const visibleJobs = (q ? matchedJobs : sortedJobs).slice(0, 12);
    const customerItems = visibleCustomers.map((customer) => ({
      id: `customer-${customer.id}`,
      label: customer.name || customer.companyName || "Customer",
      href: `/dashboard/customers/${customer.id}`,
      description: [customer.email, customer.phone, customer.mobile].filter(Boolean).join(" · ") || "Open customer history and next work.",
      section: "Customers",
      keywords: ["customer", "open customer", customer.name, customer.email, customer.phone].filter(Boolean),
      status: "Open customer",
    }));
    const jobItems = visibleJobs.map((job) => ({
      id: `job-${job.id}`,
      label: job.jobRef || job.title || job.id,
      href: `/dashboard/jobs/${job.id}`,
      description: [job.customerName || job.customer?.name || "Customer", job.status || "Open work"].filter(Boolean).join(" · "),
      section: "Jobs",
      keywords: ["job", "open job", job.jobRef, job.customerName, job.status].filter(Boolean),
      status: job.status || "Work",
    }));
    const items: Array<PaletteItem | null> = [
      ...customerItems,
      ...jobItems,
      unread[0]
        ? {
            id: "unread-notifications",
            label: `Open unread notifications (${unread.length})`,
            href: "/dashboard/notifications?filter=unread",
            description: unread[0]?.title || "Review the next unread operational update.",
            section: "Attention",
            keywords: ["unread", "notification", "inbox", unread[0]?.title].filter(Boolean),
            status: "Unread",
          }
        : null,
      integrationAttention[0]
        ? {
            id: "integration-attention",
            label: "Integration needing attention",
            href: "/dashboard/integrations?focus=attention",
            description: integrationAttention[0]?.name || integrationAttention[0]?.provider || "Open connected tool health.",
            section: "Attention",
            keywords: ["integration", "attention", "reconnect", "provider"],
            status: "Attention",
          }
        : null,
      waitingBooking
        ? {
            id: "booking-confirmation",
            label: "Booking requiring confirmation",
            href: `/dashboard/bookings?search=${encodeURIComponent(waitingBooking.id || waitingBooking.customerName || "")}`,
            description: waitingBooking.customerName || waitingBooking.serviceName || "Open booking follow-up.",
            section: "Attention",
            keywords: ["booking", "confirm", "requested", waitingBooking.customerName].filter(Boolean),
            status: "Booking",
          }
        : null,
    ];
    return items.filter((item): item is PaletteItem => Boolean(item));
  }, [bookings, customers, integrationAttention, jobs, notifications, query]);

  const contextualItems = React.useMemo<PaletteItem[]>(
    () => {
      const quickActions = getOperatorQuickActions(router.pathname).map((item, index) => ({
        id: `context-${index}-${item.href}`,
        label: item.label,
        href: item.href,
        description: item.description,
        section: "Next actions",
        keywords: [...(item.keywords || []), item.label, item.description],
      }));
      const currentJobEstimate = router.pathname === "/dashboard/jobs/[id]"
        ? [{
            id: "current-job-estimate",
            label: "Create estimate",
            href: `${router.asPath.split("#")[0]}#job-estimates`,
            description: "Draft pricing on the current job sheet.",
            section: "Next actions",
            keywords: ["estimate", "quote", "pricing", "job sheet"],
          }]
        : [];
      return [...currentJobEstimate, ...quickActions];
    },
    [router.asPath, router.pathname],
  );

  const recentItems = React.useMemo<PaletteItem[]>(
    () =>
      recentDestinations.map((item, index) => ({
        id: `recent-${index}-${item.href}`,
        label: item.label,
        href: item.href,
        description: item.description || "Recent workspace destination.",
        section: "Recent",
        keywords: [item.label, item.description || "", "recent"],
      })),
    [recentDestinations],
  );

  const items = React.useMemo(() => {
    const dynamicItems = routesOnly ? [] : [...operationalItems, ...contextualItems, ...recentItems];
    const merged = [...dynamicItems, ...baseItems].filter((item) => {
      if (item.href === "/platform") return platformAdmin;
      if (item.href === "/dev-admin") return developerMode;
      return roleAllowsRoute(workspaceRole, item.href) && canAccessDashboardHref(item.href, permissions);
    });
    const seen = new Set<string>();
    return merged.filter((item) => {
      const key = `${item.label}:${item.href}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [baseItems, contextualItems, developerMode, operationalItems, permissions, platformAdmin, recentItems, routesOnly, workspaceRole]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const haystack = [item.label, item.description, item.section, ...item.keywords].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setRecentDestinations(readOperatorRecentDestinations());
  }, [router.asPath, open]);

  React.useEffect(() => {
    const commandWindow = window as typeof window & {
      __MYTITAN_COMMAND_PALETTE_PENDING__?: boolean;
      __MYTITAN_COMMAND_PALETTE_READY__?: boolean;
    };
    commandWindow.__MYTITAN_COMMAND_PALETTE_READY__ = true;
    if (commandWindow.__MYTITAN_COMMAND_PALETTE_PENDING__) {
      commandWindow.__MYTITAN_COMMAND_PALETTE_PENDING__ = false;
      setRoutesOnly(false);
      setQuery("");
      setOpen(true);
    }
    const openPalette = (event: Event) => {
      const detail = (event as CustomEvent<CommandPaletteOpenDetail>).detail;
      setRoutesOnly(Boolean(detail?.routesOnly));
      setQuery("");
      setOpen(true);
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setRoutesOnly(false);
        setQuery("");
        setOpen((value) => !value);
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("mytitan:open-command-palette", openPalette);
    window.addEventListener("keydown", onKey);
    return () => {
      commandWindow.__MYTITAN_COMMAND_PALETTE_READY__ = false;
      window.removeEventListener("mytitan:open-command-palette", openPalette);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (filtered.length ? (current + 1) % filtered.length : 0));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => (filtered.length ? (current - 1 + filtered.length) % filtered.length : 0));
      }
      if (event.key === "Enter" && filtered[activeIndex]) {
        event.preventDefault();
        const item = filtered[activeIndex];
        rememberOperatorRecentDestination({
          href: item.href,
          label: item.label,
          description: item.description,
        });
        setOpen(false);
        void router.push(item.href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, filtered, open, router]);

  const groupedSections = React.useMemo(() => {
    const sections = new Map<string, PaletteItem[]>();
    for (const item of filtered) {
      const existing = sections.get(item.section) || [];
      existing.push(item);
      sections.set(item.section, existing);
    }
    return Array.from(sections.entries());
  }, [filtered]);

  if (!open) return null;

  return (
    <div
      aria-modal="true"
      className="operator-commandPalette"
      data-testid="command-palette"
      role="dialog"
      onClick={() => setOpen(false)}
    >
      <div className="operator-commandPalette__panel" onClick={(event) => event.stopPropagation()}>
        <div className="operator-commandPalette__header">
          <div>
            <div className="operator-commandPalette__eyebrow">Command</div>
            <h2 className="operator-commandPalette__title">Move through work without the sidebar</h2>
            <p className="operator-commandPalette__subtitle">
              {currentMeta.label}: {currentMeta.description}
            </p>
          </div>
          <div className="operator-commandPalette__hint">Ctrl/Cmd + K</div>
        </div>

        <label className="operator-commandPalette__searchWrap">
          <span className="sr-only">Search workspace commands</span>
          <input
            ref={inputRef}
            autoFocus
            className="input operator-commandPalette__search"
            data-testid="command-palette-search"
            placeholder="Search customers, jobs, invoices, bookings, notifications"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="operator-commandPalette__summary">
          <span>{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
          <span>Enter opens the highlighted action</span>
        </div>

        <div className="operator-commandPalette__results">
          {groupedSections.map(([section, sectionItems]) => (
            <section key={section} className="operator-commandPalette__section">
              <div className="operator-commandPalette__sectionLabel">{section}</div>
              <div className="operator-commandPalette__list">
                {sectionItems.map((item) => {
                  const itemIndex = filtered.findIndex((candidate) => candidate.id === item.id);
                  const active = itemIndex === activeIndex;
                  return (
                    <Link
                      key={item.id}
                      className={cx("operator-commandPalette__item", active && "is-active")}
                      data-testid={`command-palette-item-${item.id}`}
                      href={item.href}
                      onClick={() => {
                        rememberOperatorRecentDestination({
                          href: item.href,
                          label: item.label,
                          description: item.description,
                        });
                        setOpen(false);
                      }}
                      onMouseEnter={() => setActiveIndex(itemIndex)}
                    >
                      <div className="operator-commandPalette__itemCopy">
                        <strong>{item.label}</strong>
                        <p>{item.description}</p>
                      </div>
                      {item.status ? <span className="operator-commandPalette__status">{item.status}</span> : null}
                      <span className="operator-commandPalette__itemArrow" aria-hidden="true">
                        →
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}

          {filtered.length === 0 ? (
            <div className="operator-commandPalette__empty">
              <strong>No matching action</strong>
              <p>Try “billing”, “customers”, “live work”, or “launch control”.</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
