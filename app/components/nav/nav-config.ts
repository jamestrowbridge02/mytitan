export type NavItem = {
  title: string;
  sidebarTitle?: string;
  description?: string;
  href?: string;
  children?: NavItem[];
  devOnly?: boolean;
  featureFlag?: string;
  icon?: string;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Complete Work",
    items: [
      { title: "Dashboard", description: "Business pulse and the next decision", href: "/dashboard", icon: "dashboard" },
      { title: "Complete Work", sidebarTitle: "Work", description: "Open the main job sheet path", href: "/dashboard/work", icon: "work" },
      { title: "Assigned work", sidebarTitle: "Assigned", description: "Assigned jobs, ETA, evidence, and field actions", href: "/dashboard/technician", icon: "technician" },
      { title: "Live Work", description: "Run the active day from one command view", href: "/dashboard/command-centre-v2", icon: "command" },
      { title: "Jobs", description: "Authoritative work records and follow-through", href: "/dashboard/jobs", icon: "jobs" },
      { title: "Calendar", description: "Book work by shaping capacity, timing, and assignment flow", href: "/dashboard/calendar", icon: "calendar" },
      { title: "Bookings", description: "Turn new demand into scheduled work", href: "/dashboard/bookings", icon: "bookings" },
      { title: "Grow Business", sidebarTitle: "Reports", description: "See workload, revenue, and benchmark movement", href: "/dashboard/analytics", icon: "analytics" },
      { title: "Compliance", description: "Find what needs attention before it becomes drag", href: "/dashboard/compliance", icon: "shield" },
      { title: "Assets & Tools", sidebarTitle: "Assets", description: "Equipment checkout, maintenance, and availability", href: "/dashboard/assets", icon: "assets" },
    ],
  },
  {
    title: "Get Customers",
    items: [
      { title: "Get Customers", sidebarTitle: "Customers", description: "Relationship history, context, and follow-up in one place", href: "/dashboard/customers", icon: "customers" },
      { title: "Communications", sidebarTitle: "Comms", description: "Customer messages, portal updates, and delivery status", href: "/dashboard/communications", icon: "mail" },
      { title: "Portal", sidebarTitle: "Customer page", description: "Customer-safe updates, documents, and self-service access", href: "/dashboard/portal", icon: "portal" },
      { title: "Service Plans", sidebarTitle: "Plans", description: "Keep repeat work dependable and visible", href: "/dashboard/service-plans", icon: "plans" },
    ],
  },
  {
    title: "Get Paid",
    items: [
      { title: "Get Paid", sidebarTitle: "Payments", description: "Money owed, overdue balances, and finance control", href: "/dashboard/finance", icon: "revenue" },
      { title: "Payment Setup", description: "Manage how this workspace takes customer payments", href: "/dashboard/settings/payments", icon: "billing" },
      { title: "Quotes", description: "Send prices with a cleaner approval path", href: "/dashboard/quotes", icon: "quotes" },
      { title: "Revenue", description: "Track invoices, cash collection, and follow-up", href: "/dashboard/revenue", icon: "revenue" },
      { title: "Billing", description: "Workspace commercial state, plan continuity, and pack readiness", href: "/dashboard/billing", icon: "billing" },
    ],
  },
  {
    title: "Grow Business",
    items: [
      { title: "Company Profile", sidebarTitle: "Profile", description: "Business details, brand, hours, services, booking, portals, and communications", href: "/dashboard/settings?tab=general&section=company-profile-hub", icon: "settings" },
      { title: "Settings", description: "Workspace controls and workflow preferences", href: "/dashboard/settings", icon: "settings" },
      { title: "Team", description: "Invite members and keep access deliberate", href: "/dashboard/users", icon: "team" },
      { title: "Integrations", sidebarTitle: "Tools", description: "Connected tools and account health", href: "/dashboard/integrations", icon: "integrations" },
      { title: "Enterprise", description: "Readiness for integrations, offline, reports, growth, and trust", href: "/dashboard/enterprise", icon: "enterprise" },
    ],
  },
  {
    title: "Admin",
    items: [
      { title: "Developer Admin", description: "Internal tools", href: "/dev-admin", devOnly: true, icon: "settings" },
    ],
  },
];
