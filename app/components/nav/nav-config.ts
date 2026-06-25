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
      { title: "Command Centre", description: "Move live work, assign owners, and clear blockers", href: "/dashboard/command-centre-v2", icon: "command" },
      { title: "Analytics", description: "Performance and trends", href: "/dashboard/analytics", icon: "analytics" },
      { title: "Compliance", description: "Checks and controls", href: "/dashboard/compliance", icon: "shield" },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Jobs", description: "All live, upcoming, and finished jobs", href: "/dashboard/jobs", icon: "jobs" },
      { title: "Scheduling", description: "Who is free, busy, or overloaded", href: "/dashboard/scheduling", icon: "calendar" },
      { title: "Bookings", description: "New requests and appointments", href: "/dashboard/bookings", icon: "bookings" },
      { title: "Customers", description: "Contact details, updates, and job history", href: "/dashboard/customers", icon: "customers" },
      { title: "Communications", sidebarTitle: "Comms", description: "Customer messages, portal updates, and delivery status", href: "/dashboard/communications", icon: "mail" },
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
      { title: "Integrations", description: "Connect the tools you already use", href: "/dashboard/integrations", icon: "integrations" },
      { title: "Automations", description: "Set follow-up rules that run for you", href: "/dashboard/settings/automations", icon: "automations" },
      { title: "Settings", description: "Branding, defaults, and team setup", href: "/dashboard/settings", icon: "settings" },
    ],
  },
  {
    title: "Admin",
    items: [
      { title: "Developer Admin", description: "Internal tools", href: "/dev-admin", devOnly: true, icon: "settings" },
    ],
  },
];
