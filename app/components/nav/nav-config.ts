export type NavItem = {
  title: string;
  href?: string;
  children?: NavItem[];
  devOnly?: boolean;
  featureFlag?: string;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard" },
      { title: "Command Centre", href: "/dashboard/command-centre-v2" },
      { title: "Analytics", href: "/dashboard/analytics" },
    ],
  },
  {
    title: "Work",
    items: [
      {
        title: "Jobs",
        children: [
          { title: "All jobs", href: "/dashboard/jobs" },
          { title: "New job", href: "/dashboard/jobs/new" },
        ],
      },
      {
        title: "Scheduling",
        children: [
          { title: "Calendar", href: "/dashboard/calendar" },
          { title: "Capacity planning", href: "/dashboard/scheduling" },
          { title: "Bookings", href: "/dashboard/bookings" },
        ],
      },
      {
        title: "Customers",
        children: [
          { title: "CRM", href: "/dashboard/customers" },
          { title: "Service plans", href: "/dashboard/service-plans" },
        ],
      },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Intelligence", href: "/dashboard/intelligence" },
      { title: "Compliance", href: "/dashboard/compliance" },
      { title: "Executive", href: "/dashboard/executive" },
      { title: "Technician queue", href: "/dashboard/technician" },
      { title: "Parts", href: "/dashboard/parts" },
      { title: "Inventory", href: "/dashboard/inventory" },
      { title: "Purchase orders", href: "/dashboard/purchase-orders" },
      { title: "Locations", href: "/dashboard/locations" },
    ],
  },
  {
    title: "Money",
    items: [
      { title: "Quotes", href: "/dashboard/quotes" },
      { title: "Revenue tasks", href: "/dashboard/revenue" },
      { title: "Billing", href: "/dashboard/billing" },
      { title: "Billing readiness", href: "/dashboard/billing/readiness" },
      { title: "Portal Ops", href: "/dashboard/portal" },
    ],
  },
  {
    title: "Settings",
    items: [
      { title: "Settings", href: "/dashboard/settings" },
      { title: "Automations", href: "/dashboard/settings/automations" },
      { title: "Integrations", href: "/dashboard/integrations" },
    ],
  },
  {
    title: "Admin",
    items: [
      { title: "Developer Admin", href: "/dev-admin", devOnly: true },
    ],
  },
];
