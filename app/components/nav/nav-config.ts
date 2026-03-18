export type NavItem = {
  title: string;
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
      { title: "Dashboard", href: "/dashboard" },
      { title: "Command Centre", href: "/dashboard/command-centre-v2", icon: "command" },
      { title: "Analytics", href: "/dashboard/analytics", icon: "analytics" },
      { title: "Compliance", href: "/dashboard/compliance", icon: "shield" },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Jobs", href: "/dashboard/jobs", icon: "jobs" },
      { title: "Scheduling", href: "/dashboard/scheduling", icon: "calendar" },
      { title: "Bookings", href: "/dashboard/bookings", icon: "bookings" },
      { title: "Customers", href: "/dashboard/customers", icon: "customers" },
      { title: "Service Plans", href: "/dashboard/service-plans", icon: "plans" },
    ],
  },
  {
    title: "Commercial",
    items: [
      { title: "Quotes", href: "/dashboard/quotes", icon: "quotes" },
      { title: "Revenue", href: "/dashboard/revenue", icon: "revenue" },
    ],
  },
  {
    title: "Platform",
    items: [
      { title: "Integrations", href: "/dashboard/integrations", icon: "integrations" },
      { title: "Automations", href: "/dashboard/settings/automations", icon: "automations" },
      { title: "Settings", href: "/dashboard/settings", icon: "settings" },
    ],
  },
  {
    title: "Admin",
    items: [
      { title: "Developer Admin", href: "/dev-admin", devOnly: true },
    ],
  },
];
