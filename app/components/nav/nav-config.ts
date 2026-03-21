export type NavItem = {
  title: string;
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
      { title: "Dashboard", description: "Today at a glance", href: "/dashboard", icon: "dashboard" },
      { title: "Command Centre", description: "Live work control", href: "/dashboard/command-centre-v2", icon: "command" },
      { title: "Analytics", description: "Performance and trends", href: "/dashboard/analytics", icon: "analytics" },
      { title: "Compliance", description: "Checks and controls", href: "/dashboard/compliance", icon: "shield" },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Jobs", description: "Job list and updates", href: "/dashboard/jobs", icon: "jobs" },
      { title: "Scheduling", description: "Team time and capacity", href: "/dashboard/scheduling", icon: "calendar" },
      { title: "Bookings", description: "Requests and appointments", href: "/dashboard/bookings", icon: "bookings" },
      { title: "Customers", description: "People, contact, and history", href: "/dashboard/customers", icon: "customers" },
      { title: "Service Plans", description: "Recurring service plans", href: "/dashboard/service-plans", icon: "plans" },
    ],
  },
  {
    title: "Commercial",
    items: [
      { title: "Quotes", description: "Pricing to send and approve", href: "/dashboard/quotes", icon: "quotes" },
      { title: "Revenue", description: "Sales and cash", href: "/dashboard/revenue", icon: "revenue" },
    ],
  },
  {
    title: "Platform",
    items: [
      { title: "Integrations", description: "Connected tools", href: "/dashboard/integrations", icon: "integrations" },
      { title: "Automations", description: "Rules and reminders", href: "/dashboard/settings/automations", icon: "automations" },
      { title: "Settings", description: "Brand, defaults, and tools", href: "/dashboard/settings", icon: "settings" },
    ],
  },
  {
    title: "Admin",
    items: [
      { title: "Developer Admin", description: "Internal tools", href: "/dev-admin", devOnly: true, icon: "settings" },
    ],
  },
];
