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
      { title: "Dashboard", description: "Today, priorities, and quick starts", href: "/dashboard", icon: "dashboard" },
      { title: "Command Centre", description: "Move live work and clear blockers", href: "/dashboard/command-centre-v2", icon: "command" },
      { title: "Analytics", description: "Performance and trends", href: "/dashboard/analytics", icon: "analytics" },
      { title: "Compliance", description: "Checks and controls", href: "/dashboard/compliance", icon: "shield" },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Jobs", description: "Every live and upcoming job", href: "/dashboard/jobs", icon: "jobs" },
      { title: "Scheduling", description: "Team time, load, and gaps", href: "/dashboard/scheduling", icon: "calendar" },
      { title: "Bookings", description: "New requests and appointments", href: "/dashboard/bookings", icon: "bookings" },
      { title: "Customers", description: "Contacts, updates, and history", href: "/dashboard/customers", icon: "customers" },
      { title: "Service Plans", description: "Repeat work and renewals", href: "/dashboard/service-plans", icon: "plans" },
    ],
  },
  {
    title: "Commercial",
    items: [
      { title: "Quotes", description: "Pricing to send, track, and approve", href: "/dashboard/quotes", icon: "quotes" },
      { title: "Revenue", description: "Sales, cash, and follow-up", href: "/dashboard/revenue", icon: "revenue" },
    ],
  },
  {
    title: "Platform",
    items: [
      { title: "Integrations", description: "Connected tools", href: "/dashboard/integrations", icon: "integrations" },
      { title: "Automations", description: "Rules, nudges, and follow-up", href: "/dashboard/settings/automations", icon: "automations" },
      { title: "Settings", description: "Brand, defaults, and workspace tools", href: "/dashboard/settings", icon: "settings" },
    ],
  },
  {
    title: "Admin",
    items: [
      { title: "Developer Admin", description: "Internal tools", href: "/dev-admin", devOnly: true, icon: "settings" },
    ],
  },
];
