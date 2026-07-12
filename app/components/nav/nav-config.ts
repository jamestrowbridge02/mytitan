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
    title: "",
    items: [
      { title: "Dashboard", description: "Business pulse and the next decision", href: "/dashboard", icon: "dashboard" },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Work", description: "Assigned, live, draft, ready, completed, and payment follow-up views", href: "/dashboard/work", icon: "work" },
      { title: "Calendar", description: "Book work by shaping capacity, timing, and assignment flow", href: "/dashboard/calendar", icon: "calendar" },
      { title: "Bookings", description: "Turn new demand into scheduled work", href: "/dashboard/bookings", icon: "bookings" },
      { title: "Customers", description: "Relationship history, context, and follow-up in one place", href: "/dashboard/customers", icon: "customers" },
      { title: "Assets", description: "Equipment checkout, maintenance, and availability", href: "/dashboard/assets", icon: "assets" },
    ],
  },
  {
    title: "Sales",
    items: [
      { title: "Quotes", description: "Send prices with a cleaner approval path", href: "/dashboard/quotes", icon: "quotes" },
    ],
  },
  {
    title: "Finance",
    items: [
      { title: "Finance", description: "Invoices, payments, revenue, reconciliation, and payment setup shortcuts", href: "/dashboard/finance", icon: "revenue" },
    ],
  },
  {
    title: "Communications",
    items: [
      { title: "Communications", description: "Customer messages, email, SMS, delivery history, templates, and preferences", href: "/dashboard/communications", icon: "mail" },
      { title: "Customer Portal", description: "Customer-safe updates, documents, and self-service access", href: "/dashboard/portal", icon: "portal" },
    ],
  },
  {
    title: "Business",
    items: [
      { title: "Reports", description: "See workload, revenue, and benchmark movement", href: "/dashboard/analytics", icon: "analytics" },
      { title: "Compliance", description: "Find what needs attention before it becomes drag", href: "/dashboard/compliance", icon: "shield" },
      { title: "Team", description: "Invite members and keep access deliberate", href: "/dashboard/users", icon: "team" },
    ],
  },
  {
    title: "Settings",
    items: [
      { title: "Business Profile", description: "Business details, brand, hours, services, booking, portals, and communications", href: "/dashboard/settings?tab=general&section=company-profile-hub", icon: "settings" },
      { title: "Settings", description: "Workspace controls and workflow preferences", href: "/dashboard/settings", icon: "settings" },
      { title: "Tools", description: "Connected tools and account health", href: "/dashboard/integrations", icon: "integrations" },
    ],
  },
  {
    title: "Platform",
    items: [
      { title: "Platform Admin", sidebarTitle: "Enterprise", description: "MyTitan platform-only administration", href: "/platform", icon: "enterprise" },
    ],
  },
  {
    title: "Developer",
    items: [
      { title: "Developer Admin", description: "Internal tools", href: "/dev-admin", devOnly: true, icon: "settings" },
    ],
  },
];
