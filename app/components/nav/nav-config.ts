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

// IMPORTANT: these must match real pages under /dashboard/* in this repo
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard" },
      { title: "Command Centre", href: "/dashboard/command-centre" },
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
          { title: "Team", href: "/dashboard/users" },
        ],
      },
      {
        title: "Customers",
        children: [{ title: "CRM", href: "/dashboard/customers" }],
      },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Inventory", href: "/dashboard/inventory" },
      { title: "Locations", href: "/dashboard/locations" },
    ],
  },
  {
    title: "Money",
    items: [{ title: "Billing", href: "/dashboard/billing" }],
  },
  {
    title: "Settings",
    items: [
      { title: "Settings", href: "/dashboard/settings" },
      { title: "Integrations", href: "/dashboard/settings/integrations" },
    ],
  },
  {
    title: "Admin",
    items: [
      { title: "Developer Admin", href: "/dev-admin", devOnly: true },
    ],
  },
];
