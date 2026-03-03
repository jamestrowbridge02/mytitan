export type NavItem = {
  title: string;
  href?: string;
  children?: NavItem[];
  /** Hide unless developer/admin UI is enabled (client-visible flag only). */
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
    title: 'Dashboard',
    items: [{ title: 'Overview', href: '/dashboard' }],
  },
  {
    title: 'Jobs',
    items: [
      { title: 'Jobs', href: '/dashboard/jobs' },
      { title: 'Boards', href: '/dashboard/jobs/boards' },
      { title: 'Drafts', href: '/dashboard/jobs/drafts' },
      { title: 'Tags', href: '/dashboard/jobs/tags' },
    ],
  },
  {
    title: 'Scheduling',
    items: [
      { title: 'Calendar', href: '/dashboard/calendar' },
      { title: 'Bookings', href: '/dashboard/bookings' },
      { title: 'Technicians', href: '/dashboard/technicians' },
      { title: 'Time off', href: '/dashboard/time-off' },
    ],
  },
  {
    title: 'Customers',
    items: [
      { title: 'CRM', href: '/dashboard/customers' },
      { title: 'Segments', href: '/dashboard/customers/segments' },
      { title: 'Notes', href: '/dashboard/customers/notes' },
    ],
  },
  {
    title: 'Services',
    items: [
      { title: 'Catalog', href: '/dashboard/services' },
      { title: 'Pricing', href: '/dashboard/pricing' },
    ],
  },
  {
    title: 'Automations',
    items: [{ title: 'Automations', href: '/dashboard/automations' }],
  },
  {
    title: 'Billing',
    items: [
      { title: 'Billing', href: '/dashboard/billing' },
      { title: 'Invoices', href: '/dashboard/billing/invoices' },
      { title: 'Payments', href: '/dashboard/billing/payments' },
      { title: 'Plans', href: '/dashboard/billing/plans' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { title: 'Company', href: '/dashboard/settings/company' },
      { title: 'Team', href: '/dashboard/settings/team' },
      { title: 'Locations', href: '/dashboard/settings/locations' },
      { title: 'Services', href: '/dashboard/settings/services' },
      { title: 'Integrations', href: '/dashboard/settings/integrations' },
      { title: 'Notifications', href: '/dashboard/settings/notifications' },
    ],
  },
  {
    title: 'Admin',
    items: [{ title: 'Developer Admin', href: '/dev-admin', devOnly: true }],
  },
];
