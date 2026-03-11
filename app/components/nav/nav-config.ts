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
      { title: "Technician queue", href: "/dashboard/technician" },
      { title: "Inventory", href: "/dashboard/inventory" },
      { title: "Locations", href: "/dashboard/locations" },
    ],
  },
  {
    title: "Money",
    items: [
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
