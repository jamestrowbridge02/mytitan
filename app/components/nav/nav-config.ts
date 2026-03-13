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
    title: "",
    items: [
      { title: "Dashboard", href: "/dashboard" },
      { title: "Command Centre", href: "/dashboard/command-centre-v2" },
      { title: "Analytics", href: "/dashboard/analytics" },
      { title: "Compliance", href: "/dashboard/compliance" },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Jobs", href: "/dashboard/jobs" },
      { title: "Scheduling", href: "/dashboard/scheduling" },
      { title: "Bookings", href: "/dashboard/bookings" },
      { title: "Customers", href: "/dashboard/customers" },
      { title: "Service Plans", href: "/dashboard/service-plans" },
    ],
  },
  {
    title: "Commercial",
    items: [
      { title: "Quotes", href: "/dashboard/quotes" },
      { title: "Revenue", href: "/dashboard/revenue" },
    ],
  },
  {
    title: "Platform",
    items: [
      { title: "Integrations", href: "/dashboard/integrations" },
      { title: "Automations", href: "/dashboard/settings/automations" },
      { title: "Settings", href: "/dashboard/settings" },
    ],
  },
  {
    title: "Admin",
    items: [
      { title: "Developer Admin", href: "/dev-admin", devOnly: true },
    ],
  },
];
