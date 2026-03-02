export type NavItem = {
  title: string;
  href?: string;
  icon?: string;
  children?: NavItem[];
  /** Hide unless user is developer/admin */
  devOnly?: boolean;
  /** Feature gate via env (NEXT_PUBLIC_FEATURE_...) */
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
      { title: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
      { title: "Inbox", href: "/inbox", icon: "Inbox" },
    ],
  },
  {
    title: "Work",
    items: [
      {
        title: "Jobs",
        icon: "Briefcase",
        children: [
          { title: "All jobs", href: "/jobs" },
          { title: "Boards", href: "/jobs/boards" },
          { title: "Drafts", href: "/jobs/drafts" },
          { title: "Tags", href: "/jobs/tags" },
        ],
      },
      {
        title: "Calendar",
        icon: "Calendar",
        children: [
          { title: "Schedule", href: "/calendar" },
          { title: "Bookings", href: "/bookings" },
          { title: "Team availability", href: "/calendar/team" },
          { title: "Settings", href: "/calendar/settings" },
        ],
      },
      {
        title: "Customers",
        icon: "Users",
        children: [
          { title: "Customers", href: "/customers" },
          { title: "Segments", href: "/customers/segments" },
          { title: "Notes", href: "/customers/notes" },
        ],
      },
    ],
  },
  {
    title: "Money",
    items: [
      {
        title: "Billing",
        icon: "CreditCard",
        children: [
          { title: "Invoices", href: "/billing/invoices" },
          { title: "Payments", href: "/billing/payments" },
          { title: "Plans", href: "/billing/plans" },
        ],
      },
      {
        title: "Reports",
        icon: "BarChart3",
        children: [
          { title: "Revenue", href: "/reports/revenue" },
          { title: "Utilization", href: "/reports/utilization" },
          { title: "Customer growth", href: "/reports/customers" },
        ],
      },
    ],
  },
  {
    title: "Setup",
    items: [
      {
        title: "Settings",
        icon: "Settings",
        children: [
          { title: "Company", href: "/settings/company" },
          { title: "Team", href: "/settings/team" },
          { title: "Locations", href: "/settings/locations" },
          { title: "Services", href: "/settings/services" },
          { title: "Integrations", href: "/settings/integrations" },
          { title: "Notifications", href: "/settings/notifications" },
        ],
      },
      {
        title: "Developer Admin",
        icon: "Shield",
        href: "/dev-admin",
        devOnly: true,
      },
    ],
  },
];
