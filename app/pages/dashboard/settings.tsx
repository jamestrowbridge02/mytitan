import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { CustomFieldManager } from '../../components/custom-fields/CustomFieldManager';
import { OperatorNotice } from '../../components/feedback/OperatorNotice';
import { useOperatorNotice } from '../../components/feedback/useOperatorNotice';
import { DashboardShell } from '../../components/dashboard-shell';
import { GuidedSetupProgress } from '../../components/guided-setup-progress';
import { OperatorPageHeader } from '../../components/ui/operator-page';
import { apiFetch } from '../../lib/api';
import { UPLOAD_LIMITS, validateUploadFile } from '../../lib/upload-policy';
import {
  ANALYTICS_WIDGET_KEYS,
  COMMAND_CENTRE_SECTION_KEYS,
  getBusinessConfig,
  getBusinessTerms,
  getCommandCentreWorkspaceLayout,
  getCustomerFeedbackSettings,
  getInternalNotificationSettings,
  getJobDeclarationText,
  getOperationalAlertSettings,
  getServiceRecordEmailSettings,
  getSummaryEmailSettings,
  INTERNAL_NOTIFICATION_CATEGORIES,
  OPERATIONAL_ALERT_CATEGORIES,
  SUMMARY_EMAIL_CADENCES,
  SUMMARY_EMAIL_SECTIONS,
  type CommandCentreSectionKey,
  getWorkspaceJobForms,
  SAFE_JOB_FORM_FIELD_TYPES,
  type AnalyticsWidgetKey,
  type SafeJobFormFieldType,
  type InternalNotificationCategory,
  type InternalNotificationRecipient,
  type OperationalAlertCategory,
  type SummaryEmailCadence,
  type SummaryEmailSection,
} from '../../lib/business-config';
import { useEntitlements } from '../../lib/entitlements';
import type { CustomField } from '../../lib/custom-fields';
import { isAutomationsV1Enabled, isGuidedSetupV2Enabled, isNotificationsV1Enabled } from '../../lib/feature-flags';
import {
  DEFAULT_WORKSPACE_CURRENCY,
  DEFAULT_WORKSPACE_LOCALE,
  DEFAULT_WORKSPACE_TIMEZONE,
  fetchGeoDefaults,
  findRegionOption,
  findRegionOptionByLocale,
  REGION_OPTIONS,
  type GeoDefaults,
} from '../../lib/geo-defaults';
import type { EmailReadiness, TenantSettings } from '../../lib/tenant-settings';
import { useTenantSettings } from '../../lib/tenant-settings';
import { getBookingStages, getJobStages, getTechnicianStages, type WorkflowStage } from '../../lib/workflow-config';
import { emptyPermissionSnapshot, hasWorkspacePermission, normalizePermissionSnapshot } from '../../lib/workspace-permissions';
import { useSectionTargeting } from '../../lib/section-targeting';

type TabKey =
  | 'general'
  | 'jobs'
  | 'services'
  | 'team'
  | 'output'
  | 'messages'
  | 'bookings'
  | 'advanced';

const TABS: Array<{ key: TabKey; label: string; description: string; group: 'Setup' | 'Settings' }> = [
  { key: 'jobs', label: 'Work & Job Sheet', description: 'Canonical job form, declaration, display defaults, and workflow steps', group: 'Setup' },
  { key: 'services', label: 'Services', description: 'Service catalogue and job defaults', group: 'Setup' },
  { key: 'team', label: 'Team & Access', description: 'Invite members, role visibility, and team workflow access', group: 'Setup' },
  { key: 'bookings', label: 'Booking & Customer Pages', description: 'Availability wording, stages, and customer-facing setup handoff', group: 'Setup' },
  { key: 'general', label: 'Business Profile', description: 'Business details, branding, and workspace defaults', group: 'Settings' },
  { key: 'output', label: 'Job Output', description: 'Own the service record and completion output chain', group: 'Settings' },
  { key: 'messages', label: 'Notifications & Email', description: 'Customer sender identity, routing, readiness, and reusable wording', group: 'Settings' },
  { key: 'advanced', label: 'Advanced', description: 'Automation, custom fields, and deeper controls', group: 'Settings' },
];

const SETTINGS_DIRECTORY = [
  {
    key: 'business-details',
    title: 'Business profile',
    description: 'Workspace identity, contact details, timezone, and regional defaults that shape every customer-facing surface.',
    actionLabel: 'Open business profile',
    href: '/dashboard/settings?tab=general&section=business-profile',
  },
  {
    key: 'email-notifications',
    title: 'Email & Notifications',
    description: 'Sender identity, fallback behaviour, operator alerts, and summary recipients.',
    actionLabel: 'Open email & notifications',
    href: '/dashboard/settings?tab=messages&section=notifications-email',
  },
  {
    key: 'booking',
    title: 'Booking & customer pages',
    description: 'Public booking link, services, hours, appearance, payment setup, and customer-facing trust surfaces.',
    actionLabel: 'Open booking & customer pages',
    href: '/dashboard/booking/settings',
  },
  {
    key: 'jobs-forms',
    title: 'Work & job sheet',
    description: 'Job sheet defaults, workflow stages, declarations, and guided form controls.',
    actionLabel: 'Open work & job sheet',
    href: '/dashboard/settings?tab=jobs&section=template-marketplace',
  },
  {
    key: 'payments-invoicing',
    title: 'Payments & Invoicing',
    description: 'Collection methods, payment setup, invoice flow, and clear payment authority boundaries.',
    actionLabel: 'Open payments & invoices',
    href: '/dashboard/settings/payments',
  },
  {
    key: 'documents-numbering',
    title: 'Documents & numbering',
    description: 'Continue job sheet, invoice, quote, and statement numbering from a previous system.',
    actionLabel: 'Open documents & numbering',
    href: '/dashboard/settings/documents-numbering',
  },
  {
    key: 'finance-tax',
    title: 'Finance / VAT / Tax',
    description: 'Finance reporting, debtor visibility, exports, and tax-oriented workspace defaults.',
    actionLabel: 'Open finance',
    href: '/dashboard/finance',
  },
  {
    key: 'integrations',
    title: 'Connect your business tools',
    description: 'Connect accounting, payments, and communication tools used by your team.',
    actionLabel: 'Open connections',
    href: '/dashboard/integrations?section=owner-command',
  },
  {
    key: 'developer-tools',
    title: 'Developer tools',
    description: 'Create reveal-once API tokens and manage audited webhook deliveries.',
    actionLabel: 'Open developer tools',
    href: '/dashboard/settings/developer-tools',
  },
  {
    key: 'security-compliance',
    title: 'Workflow controls',
    description: 'Set deadlines and resolve work that needs attention.',
    actionLabel: 'Open compliance',
    href: '/dashboard/compliance',
  },
  {
    key: 'appearance-customer-pages',
    title: 'Appearance / Customer Pages',
    description: 'Branding, customer-facing wording, and ownership of the public booking experience.',
    actionLabel: 'Open appearance controls',
    href: '/dashboard/settings?tab=general&section=workspace-layout',
  },
  {
    key: 'users-roles',
    title: 'Team & access',
    description: 'Invites, team member access, and permission-scoped administration.',
    actionLabel: 'Open users',
    href: '/dashboard/users',
  },
  {
    key: 'operations-monitoring',
    title: 'Business readiness',
    description: 'Finish the business setup needed for bookings, messages, and payments.',
    actionLabel: 'Open business readiness',
    href: '/dashboard/settings/operations',
  },
  {
    key: 'launch-control',
    title: 'Go-live checklist',
    description: 'Review the remaining business setup steps before inviting customers.',
    actionLabel: 'Open checklist',
    href: '/dashboard/settings/launch-control',
  },
  {
    key: 'workspace-review',
    title: 'Review submission',
    description: 'Submit a consented workspace testimonial for protected platform moderation.',
    actionLabel: 'Submit review',
    href: '/dashboard/reviews',
  },
] as const;

const TAB_ALIASES: Record<string, TabKey> = {
  workspace: 'general',
  branding: 'general',
  business: 'general',
  billing: 'general',
  email: 'messages',
  pricing: 'services',
  customers: 'output',
  features: 'advanced',
  workflow: 'jobs',
  custom_fields: 'advanced',
  automation_rules: 'advanced',
  ai: 'advanced',
};

const SECTION_TAB_MAP: Record<string, TabKey> = {
  'business-profile': 'general',
  'workspace-layout': 'general',
  'job-sheet': 'jobs',
  'template-marketplace': 'jobs',
  'template-builder': 'jobs',
  'job-sheet-preview': 'jobs',
  'team-access': 'team',
  'booking-setup': 'bookings',
  'notifications': 'messages',
  'notifications-email': 'messages',
  'advanced-controls': 'advanced',
};

const TENANT_SETTINGS_ALLOWED_KEYS = [
  'accountingEnabled',
  'aiEnabled',
  'aiRequestsLimit',
  'bookingsEnabled',
  'bookingPublicEnabled',
  'brandAccentColor',
  'brandDefaultMode',
  'brandPrimaryColor',
  'brandSecondaryColor',
  'companyName',
  'registeredBusinessName',
  'tradingName',
  'companyNumber',
  'taxRegistrationNumber',
  'businessAddressLine1',
  'businessAddressLine2',
  'businessCity',
  'businessPostcode',
  'businessCountry',
  'contactPhone',
  'contactEmail',
  'websiteUrl',
  'businessDisplayJson',
  'defaultCurrency',
  'defaultItems',
  'defaultLocale',
  'defaultServiceNamePresets',
  'defaultTimezone',
  'tenantCountry',
  'invoiceCurrency',
  'publicBookingLocale',
  'phoneCountryCode',
  'taxLabel',
  'invoiceLegalFooter',
  'defaultTorqueSetting',
  'defaultTyrePressure',
  'defaultWheelPricingMode',
  'emailNotificationRecipients',
  'emailReplyTo',
  'emailSenderName',
  'featureAI',
  'featureAccounting',
  'featureBookings',
  'featureCustomerPortal',
  'featurePayments',
  'featureSocial',
  'featureWhatsApp',
  'businessConfigJson',
  'logoUrl',
  'onboardingCompleted',
  'onboardingStep',
  'paymentsEnabled',
  'socialEnabled',
  'supportPhone',
  'themeMode',
  'vatEnabledDefault',
  'vatRateBpsDefault',
  'whatsappTemplateDefault',
  'primaryTrade',
] as const;

function pickSettingsPayload(input: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const key of TENANT_SETTINGS_ALLOWED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = input[key];
  }
  return out;
}

function normalizeOptionalString(value: unknown) {
  const next = String(value ?? '').trim();
  return next ? next : undefined;
}

function getJobFieldCategory(type: string) {
  switch (String(type || '').toLowerCase()) {
    case 'checkbox':
      return 'safety';
    case 'number':
      return 'measurements';
    case 'select':
      return 'inspection';
    case 'textarea':
      return 'sign-off';
    case 'photo':
    case 'image':
      return 'media/photos';
    default:
      return 'materials';
  }
}

const INTERNAL_NOTIFICATION_CATEGORY_LABELS: Record<InternalNotificationCategory, string> = {
  bookings: 'Bookings',
  payments: 'Payments',
  jobs: 'Jobs',
  customer_messages: 'Customer messages',
  workspace_alerts: 'Workspace alerts',
};

const SUMMARY_EMAIL_CADENCE_LABELS: Record<SummaryEmailCadence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

const SUMMARY_EMAIL_SECTION_LABELS: Record<SummaryEmailSection, string> = {
  bookings: 'Bookings',
  jobs: 'Completed jobs',
  payments: 'Money owed / paid',
  failed_sends: 'Failed sends',
  upcoming_work: 'Upcoming work',
  tax_reminders: 'VAT / tax reminders',
};

const OPERATIONAL_ALERT_CATEGORY_LABELS: Record<OperationalAlertCategory, string> = {
  failed_email: 'Email failures',
  failed_summary_dispatch: 'Summary dispatch failures',
  failed_booking: 'Booking failures',
  failed_payment: 'Payment failures',
  failed_refund: 'Refund failures',
  failed_webhook: 'Webhook failures',
  failed_backup: 'Backup alerts',
  health_degraded: 'Health degraded',
};

const ANALYTICS_LAYOUT_WIDGET_META: Record<AnalyticsWidgetKey, { title: string; description: string }> = {
  "executive-summary": {
    title: "Executive summary",
    description: "Headline operating posture and recommended focus.",
  },
  "pressure-panel": {
    title: "Pressure areas",
    description: "Queues and customer friction that need attention.",
  },
  "revenue-panel": {
    title: "Revenue and collections",
    description: "Quote conversion, collections, and open revenue follow-up.",
  },
  "capacity-panel": {
    title: "Capacity and recurring execution",
    description: "Technician load and recurring work pressure.",
  },
  "benchmark-delta": {
    title: "Benchmarks and trend deltas",
    description: "Current period versus previous 7 and 30 day periods.",
  },
  "customer-commercial-signals": {
    title: "Customer commercial signals",
    description: "Customer mix, quote pressure, and overdue balance signals.",
  },
};

const COMMAND_CENTRE_LAYOUT_SECTION_META: Record<CommandCentreSectionKey, { title: string; description: string; hideable: boolean }> = {
  filters: {
    title: 'Filters',
    description: 'Keep location and live-work scoping visible at the top.',
    hideable: false,
  },
  'recent-updates': {
    title: 'Recent updates',
    description: 'Show the latest live-work changes and customer movement.',
    hideable: true,
  },
  'bulk-actions': {
    title: 'Bulk actions',
    description: 'Expose batch actions when the team uses them regularly.',
    hideable: true,
  },
  'work-board': {
    title: 'Work board',
    description: 'The main live queue. This always stays visible.',
    hideable: false,
  },
};

function buildInternalNotificationPayload(input: Record<string, any>) {
  const notificationSettings = getInternalNotificationSettings({
    businessConfigJson: input.businessConfigJson,
    emailNotificationRecipients: input.emailNotificationRecipients,
  } as TenantSettings);
  return notificationSettings.internalRecipients.map((recipient) => ({
    email: recipient.email,
    label: recipient.label || null,
    enabled: recipient.enabled !== false,
    categories: recipient.categories.length ? recipient.categories : [...INTERNAL_NOTIFICATION_CATEGORIES],
  }));
}

function buildSettingsPayload(input: Record<string, any>) {
  const bookingsEnabled = typeof input.bookingsEnabled === 'boolean' ? input.bookingsEnabled : Boolean(input.featureBookings);
  const businessConfig = (input.businessConfigJson && typeof input.businessConfigJson === 'object') ? input.businessConfigJson : {};
  const internalRecipients = buildInternalNotificationPayload(input);
  const operationalAlerts = getOperationalAlertSettings(input as TenantSettings);
  return pickSettingsPayload({
    ...input,
    bookingsEnabled,
    featureBookings: bookingsEnabled,
    logoUrl: normalizeOptionalString(input.logoUrl),
    emailReplyTo: normalizeOptionalString(input.emailReplyTo),
    emailSenderName: normalizeOptionalString(input.emailSenderName),
    supportPhone: normalizeOptionalString(input.supportPhone),
    whatsappTemplateDefault: normalizeOptionalString(input.whatsappTemplateDefault),
    emailNotificationRecipients: internalRecipients.filter((recipient) => recipient.enabled).map((recipient) => recipient.email),
    defaultServiceNamePresets: String(input.defaultServiceNamePresets || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    businessConfigJson: {
      ...businessConfig,
      notificationRouting: {
        internalRecipients,
      },
      operationalAlerts: {
        externalEmailRecipients: operationalAlerts.externalEmailRecipients,
        enabledCategories: operationalAlerts.enabledCategories,
      },
    },
  });
}

function canonicalSettingsValue(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalSettingsValue);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, any>>((result, key) => {
        if (value[key] !== undefined) result[key] = canonicalSettingsValue(value[key]);
        return result;
      }, {});
  }
  return value;
}

function settingsValueContains(actual: any, expected: any): boolean {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((expectedEntry) =>
      actual.some((actualEntry) => settingsValueContains(actualEntry, expectedEntry)),
    );
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    return Object.keys(expected).every((key) => settingsValueContains(actual[key], expected[key]));
  }
  return JSON.stringify(canonicalSettingsValue(actual)) === JSON.stringify(canonicalSettingsValue(expected));
}

type StageSectionKey = 'bookings' | 'jobs' | 'technician';
type StageSectionConfig = {
  key: StageSectionKey;
  title: string;
  stages: WorkflowStage[];
};

type AutomationConditionDraft = {
  currentStatus?: string | null;
  invoiceIssued?: boolean | null;
  invoicePaid?: boolean | null;
  hasAssignedUser?: boolean | null;
  workflowStageReady?: string | null;
  customFieldEquals?: { entityType: 'job' | 'booking' | 'customer' | 'technician'; key: string; value: string } | null;
  customFieldExists?: { entityType: 'job' | 'booking' | 'customer' | 'technician'; key: string } | null;
  customFieldNotExists?: { entityType: 'job' | 'booking' | 'customer' | 'technician'; key: string } | null;
};

type AutomationActionDraft =
  | {
      type: 'create_reminder';
      delayDays?: number | null;
      note?: string | null;
      channel?: string | null;
    }
  | {
      type: 'send_internal_notification';
      title?: string | null;
      body?: string | null;
    }
  | {
      type: 'advance_job_stage';
      targetStatus?: string | null;
    }
  | {
      type: 'send_customer_message';
      subject?: string | null;
      body?: string | null;
    };

type AutomationRuleDraft = {
  id?: string | null;
  name: string;
  trigger: string;
  enabled: boolean;
  conditionJson: AutomationConditionDraft;
  actionJson: AutomationActionDraft;
};

type WorkspaceAutomationRule = {
  id: string;
  name: string;
  trigger: string;
  enabled: boolean;
  conditionJson?: AutomationConditionDraft | null;
  actionJson: AutomationActionDraft;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type AutomationTemplate = {
  key: string;
  title: string;
  description: string;
  trigger: string;
  conditionJson: AutomationConditionDraft;
  actionJson: AutomationActionDraft;
};

type AutomationSuggestion = {
  key: string;
  title: string;
  description: string;
  benefit: string;
  trigger: string;
  priority: 'high' | 'medium' | 'low';
  actionSummary: string;
  whyThisAppeared: string;
  status?: 'new' | 'applied' | 'dismissed';
};

type AutomationRun = {
  id: string;
  type: string;
  label: string;
  status?: string | null;
  at?: string | null;
  jobRef?: string | null;
  payloadJson?: {
    automationRuleId?: string | null;
    automationRuleName?: string | null;
    trigger?: string | null;
    actionType?: string | null;
    result?: Record<string, any> | null;
  } | null;
  actionSummary?: string | null;
  resultSummary?: string | null;
  whyItRan?: string | null;
};

const AUTOMATION_TRIGGER_OPTIONS = [
  { value: 'booking.converted', label: 'Booking converted', description: 'Use this when work intake becomes a live job and dispatch follow-up may be needed.' },
  { value: 'job.created', label: 'Job created', description: 'Use this when newly created jobs should immediately create a follow-up or notification.' },
  { value: 'job.completed', label: 'Job completed', description: 'Use this for post-completion billing, review, or customer follow-up workflows.' },
  { value: 'invoice.issued', label: 'Invoice issued', description: 'Use this when collections or customer communication should start once billing is sent.' },
  { value: 'invoice.overdue', label: 'Invoice overdue', description: 'Use this to escalate unpaid invoice follow-up once due dates have passed.' },
  { value: 'quote.sent', label: 'Quote sent', description: 'Use this when quote follow-up or internal revenue tracking should start after pricing is shared.' },
  { value: 'quote.approved', label: 'Quote approved', description: 'Use this when approved pricing should trigger conversion or internal follow-up.' },
  { value: 'technician.arrived', label: 'Team member arrived', description: 'Use this to notify dispatch or office staff when field work begins.' },
  { value: 'portal.document_signed', label: 'Portal document signed', description: 'Use this to continue workflow after a customer signs portal paperwork.' },
];

const AUTOMATION_ACTION_OPTIONS = [
  { value: 'create_reminder', label: 'Create reminder', description: 'Create an in-app follow-up reminder tied to the job.' },
  { value: 'send_internal_notification', label: 'Send internal notification', description: 'Log and surface an internal notification in the activity stream.' },
  { value: 'advance_job_stage', label: 'Advance job stage', description: 'Move the job to another canonical status using the existing jobs service.' },
  { value: 'send_customer_message', label: 'Prepare customer message', description: 'Prepare a customer follow-up without sending it until messaging is ready.' },
];

const AUTOMATION_STATUS_OPTIONS = ['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'CANCELLED'];

type WorkspaceServiceTypeConfig = NonNullable<ReturnType<typeof getWorkspaceJobForms>["serviceTypes"]>[number];
type WorkspaceJobFormSectionConfig = NonNullable<ReturnType<typeof getWorkspaceJobForms>["sections"]>[number];
type WorkspaceJobFormFieldConfig = NonNullable<ReturnType<typeof getWorkspaceJobForms>["fields"]>[number];

function createEditorId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    key: 'completed-job-billing-reminder',
    title: 'Completed job billing reminder',
    description: 'Follow up on completed work that still needs billing closure.',
    trigger: 'job.completed',
    conditionJson: { invoicePaid: false },
    actionJson: { type: 'create_reminder', delayDays: 3, note: 'Completed job billing follow-up', channel: 'in_app' },
  },
  {
    key: 'overdue-invoice-follow-up',
    title: 'Overdue invoice follow-up',
    description: 'Create a collections reminder when an invoice becomes overdue.',
    trigger: 'invoice.overdue',
    conditionJson: { invoicePaid: false },
    actionJson: { type: 'create_reminder', delayDays: 0, note: 'Overdue invoice follow-up', channel: 'in_app' },
  },
  {
    key: 'technician-arrival-office-notification',
    title: 'Team member arrival office notification',
    description: 'Notify the office when a team member arrives on site.',
    trigger: 'technician.arrived',
    conditionJson: {},
    actionJson: { type: 'send_internal_notification', title: 'Team member arrival check-in', body: 'A team member arrived on site and the office may need to follow up.' },
  },
  {
    key: 'portal-document-signed-follow-up',
    title: 'Portal document signed follow-up',
    description: 'Notify internal staff when portal paperwork is signed.',
    trigger: 'portal.document_signed',
    conditionJson: {},
    actionJson: { type: 'send_internal_notification', title: 'Portal document signed', body: 'A customer signed portal paperwork and the next office action should be reviewed.' },
  },
  {
    key: 'booking-conversion-dispatch',
    title: 'Booking conversion dispatch notification',
    description: 'Alert dispatch when converted work still needs assignment.',
    trigger: 'booking.converted',
    conditionJson: { hasAssignedUser: false },
    actionJson: { type: 'send_internal_notification', title: 'Dispatch follow-up required', body: 'A converted booking still needs dispatch review.' },
  },
];

function createDefaultRuleDraft(): AutomationRuleDraft {
  return {
    id: null,
    name: '',
    trigger: 'job.completed',
    enabled: true,
    conditionJson: {},
    actionJson: { type: 'create_reminder', delayDays: 3, note: 'Follow up after completion', channel: 'in_app' },
  };
}

function renderStatuses(stage: WorkflowStage) {
  return stage.statuses.join(', ');
}

function describeTrigger(trigger: string) {
  return AUTOMATION_TRIGGER_OPTIONS.find((option) => option.value === trigger)?.description || 'Choose the workflow event that should start this rule.';
}

function describeAction(actionType: string) {
  return AUTOMATION_ACTION_OPTIONS.find((option) => option.value === actionType)?.description || 'Choose what the rule should do when conditions match.';
}

function buildRuleSummary(ruleDraft: AutomationRuleDraft) {
  const triggerLabel = AUTOMATION_TRIGGER_OPTIONS.find((option) => option.value === ruleDraft.trigger)?.label || ruleDraft.trigger;
  const conditionParts: string[] = [];
  if (ruleDraft.conditionJson.currentStatus) conditionParts.push(`status is ${ruleDraft.conditionJson.currentStatus}`);
  if (ruleDraft.conditionJson.invoiceIssued === true) conditionParts.push('invoice is issued');
  if (ruleDraft.conditionJson.invoiceIssued === false) conditionParts.push('invoice is not issued');
  if (ruleDraft.conditionJson.invoicePaid === true) conditionParts.push('invoice is paid');
  if (ruleDraft.conditionJson.invoicePaid === false) conditionParts.push('invoice is unpaid');
  if (ruleDraft.conditionJson.hasAssignedUser === true) conditionParts.push('an assigned user exists');
  if (ruleDraft.conditionJson.hasAssignedUser === false) conditionParts.push('no assigned user exists');
  if (ruleDraft.conditionJson.workflowStageReady) conditionParts.push(`workflow stage ${ruleDraft.conditionJson.workflowStageReady} is ready`);
  if (ruleDraft.conditionJson.customFieldEquals?.key) {
    conditionParts.push(`${ruleDraft.conditionJson.customFieldEquals.entityType} field ${ruleDraft.conditionJson.customFieldEquals.key} equals ${ruleDraft.conditionJson.customFieldEquals.value}`);
  }
  if (ruleDraft.conditionJson.customFieldExists?.key) {
    conditionParts.push(`${ruleDraft.conditionJson.customFieldExists.entityType} field ${ruleDraft.conditionJson.customFieldExists.key} exists`);
  }
  if (ruleDraft.conditionJson.customFieldNotExists?.key) {
    conditionParts.push(`${ruleDraft.conditionJson.customFieldNotExists.entityType} field ${ruleDraft.conditionJson.customFieldNotExists.key} is missing`);
  }

  let actionSummary = 'record an action';
  if (ruleDraft.actionJson.type === 'create_reminder') {
    actionSummary = `create a reminder after ${ruleDraft.actionJson.delayDays ?? 0} day(s)`;
  } else if (ruleDraft.actionJson.type === 'send_internal_notification') {
    actionSummary = `send an internal notification${ruleDraft.actionJson.title ? ` called "${ruleDraft.actionJson.title}"` : ''}`;
  } else if (ruleDraft.actionJson.type === 'advance_job_stage') {
    actionSummary = `advance the job to ${ruleDraft.actionJson.targetStatus || 'a new status'}`;
  } else if (ruleDraft.actionJson.type === 'send_customer_message') {
    actionSummary = 'queue a customer message';
  }

  return `When ${triggerLabel.toLowerCase()}${conditionParts.length ? ` and ${conditionParts.join(' and ')}` : ''}, ${actionSummary}.`;
}

function getRuleDraftValidationError(ruleDraft: AutomationRuleDraft) {
  const name = String(ruleDraft.name || '').trim();
  if (!name) return 'Rule name is required.';
  if (ruleDraft.actionJson.type === 'create_reminder') {
    const delayDays = Number(ruleDraft.actionJson.delayDays ?? 0);
    if (!Number.isFinite(delayDays) || delayDays < 0 || delayDays > 30) {
      return 'Reminder delay must be between 0 and 30 days.';
    }
  }
  if (ruleDraft.actionJson.type === 'send_internal_notification' && !String(ruleDraft.actionJson.title || '').trim()) {
    return 'Internal notifications need a title.';
  }
  if (ruleDraft.actionJson.type === 'advance_job_stage' && !String(ruleDraft.actionJson.targetStatus || '').trim()) {
    return 'Choose a target status for the stage advance action.';
  }
  if (ruleDraft.actionJson.type === 'send_customer_message' && !String(ruleDraft.actionJson.body || '').trim()) {
    return 'Customer messages need message body text.';
  }
  const billingConditionSelected =
    ruleDraft.conditionJson.invoiceIssued !== null && ruleDraft.conditionJson.invoiceIssued !== undefined
    || ruleDraft.conditionJson.invoicePaid !== null && ruleDraft.conditionJson.invoicePaid !== undefined;
  if (billingConditionSelected && !['job.completed', 'invoice.issued', 'invoice.overdue', 'portal.document_signed', 'quote.sent', 'quote.approved'].includes(ruleDraft.trigger)) {
    return 'Invoice conditions can only be used with job completion, invoice, or portal-signing triggers.';
  }
  if (
    ruleDraft.conditionJson.hasAssignedUser !== null &&
    ruleDraft.conditionJson.hasAssignedUser !== undefined &&
    !['booking.converted', 'job.created', 'job.completed', 'technician.arrived', 'quote.sent', 'quote.approved'].includes(ruleDraft.trigger)
  ) {
    return 'Assigned-user conditions can only be used with booking, job, or technician workflow triggers.';
  }
  if (ruleDraft.conditionJson.workflowStageReady !== null && ruleDraft.conditionJson.workflowStageReady !== undefined && !String(ruleDraft.conditionJson.workflowStageReady || '').trim()) {
    return 'Workflow stage readiness conditions require a stage id.';
  }
  const matcher = ruleDraft.conditionJson.customFieldEquals || ruleDraft.conditionJson.customFieldExists || ruleDraft.conditionJson.customFieldNotExists;
  if (matcher && !String(matcher.key || '').trim()) {
    return 'Choose a custom field before saving the rule.';
  }
  if (ruleDraft.conditionJson.customFieldEquals?.key && !String(ruleDraft.conditionJson.customFieldEquals.value || '').trim()) {
    return 'Custom field equals conditions require a value.';
  }
  return '';
}

export default function SettingsPage() {
  const { settings, loading: settingsLoading, refresh, setLocalSettings } = useTenantSettings();
  const { features, planCode } = useEntitlements();
  const router = useRouter();
  const guidedSetupEnabled = isGuidedSetupV2Enabled();
  const notificationsEnabled = isNotificationsV1Enabled();
  const automationsEnabled = isAutomationsV1Enabled();
  const [tab, setTab] = useState<TabKey>('general');
  const [form, setForm] = useState<any>({});
  const formRef = useRef<any>({});
  const [emailReadiness, setEmailReadiness] = useState<EmailReadiness | null>(null);
  const [systemEmailReadiness, setSystemEmailReadiness] = useState<EmailReadiness | null>(null);
  const [summaryReadiness, setSummaryReadiness] = useState<any>(null);
  const [opsAlertStatus, setOpsAlertStatus] = useState<any>(null);
  const [opsAlertSmokeResult, setOpsAlertSmokeResult] = useState<any>(null);
  const [sendingOpsAlertSmoke, setSendingOpsAlertSmoke] = useState(false);
  const [summaryPreview, setSummaryPreview] = useState<any>(null);
  const [previewingSummary, setPreviewingSummary] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  const [geoDefaults, setGeoDefaults] = useState<GeoDefaults | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState<any>(null);
  const [serviceRecordRecipientDraft, setServiceRecordRecipientDraft] = useState('');
  const [automationRules, setAutomationRules] = useState<WorkspaceAutomationRule[]>([]);
  const [automationSuggestions, setAutomationSuggestions] = useState<AutomationSuggestion[]>([]);
  const [automationRuns, setAutomationRuns] = useState<AutomationRun[]>([]);
  const [automationRulesLoading, setAutomationRulesLoading] = useState(false);
  const [automationSuggestionsLoading, setAutomationSuggestionsLoading] = useState(false);
  const [automationRunsLoading, setAutomationRunsLoading] = useState(false);
  const [automationRulesError, setAutomationRulesError] = useState('');
  const [automationSuggestionsError, setAutomationSuggestionsError] = useState('');
  const [ruleDraft, setRuleDraft] = useState<AutomationRuleDraft>(createDefaultRuleDraft());
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customFieldsLoading, setCustomFieldsLoading] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [applyingSuggestionKey, setApplyingSuggestionKey] = useState<string | null>(null);
  const [dismissingSuggestionKey, setDismissingSuggestionKey] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [themeSaving, setThemeSaving] = useState<'light' | 'dark' | 'system' | ''>('');
  const [templateLibrary, setTemplateLibrary] = useState<any>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateActionLoading, setTemplateActionLoading] = useState('');
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [permissionsReady, setPermissionsReady] = useState(false);
  const { notice, showSuccess, showError, clearNotice } = useOperatorNotice();

  const canManageSettings = hasWorkspacePermission(permissions, 'settings.manage');
  const canManageWorkflow = hasWorkspacePermission(permissions, 'workflow.manage');
  const canManageCustomFields = hasWorkspacePermission(permissions, 'custom_fields.manage');
  const canManageAutomations = hasWorkspacePermission(permissions, 'automations.manage');

  const visibleTabs = useMemo(() => TABS.filter((item) => {
    if (item.key === 'jobs' || item.key === 'services' || item.key === 'team' || item.key === 'bookings') return canManageWorkflow;
    if (item.key === 'advanced') return canManageSettings || canManageCustomFields || canManageAutomations;
    return canManageSettings;
  }), [canManageAutomations, canManageCustomFields, canManageSettings, canManageWorkflow]);
  const visibleTabGroups = useMemo(
    () =>
      ['Setup', 'Settings']
        .map((group) => ({
          group,
          items: visibleTabs.filter((item) => item.group === group),
        }))
        .filter((group) => group.items.length > 0),
    [visibleTabs],
  );

  const updateForm = useCallback((updater: any) => {
    const next =
      typeof updater === 'function'
        ? updater(formRef.current || {})
        : updater;
    formRef.current = next;
    setForm(next);
  }, []);

  useEffect(() => {
    if (settings) {
      const nextForm = { ...settings };
      formRef.current = nextForm;
      setForm(nextForm);
      setSelectedTemplateId(String(settings.activeJobSheetTemplateId || ''));
    }
  }, [settings]);

  const loadTemplateLibrary = async () => {
    try {
      const response = await apiFetch('/templates/library');
      const firstTemplateId = Array.isArray(response?.templates) && response.templates.length ? response.templates[0]?.id : '';
      setTemplateLibrary(response);
      setSelectedTemplateId(String(response?.activeTemplate?.id || settings?.activeJobSheetTemplateId || firstTemplateId || ''));
    } catch {
      setTemplateLibrary(null);
    }
  };

  useEffect(() => {
    if (tab !== 'jobs') return;
    void loadTemplateLibrary();
  }, [settings?.activeJobSheetTemplateId, tab]);

  const selectedTemplate = useMemo(
    () => (templateLibrary?.templates || []).find((template: any) => String(template.id) === String(selectedTemplateId)) || null,
    [selectedTemplateId, templateLibrary?.templates],
  );
  const setupJourneyItems = useMemo(
    () => [
      {
        key: 'template-marketplace',
        title: 'Job sheet template',
        why: 'This controls what technicians capture and what customers see later.',
        href: '/dashboard/settings?tab=jobs&section=template-marketplace',
        completed: Boolean(form.activeJobSheetTemplateId || selectedTemplateId),
        stateLabel: form.activeJobSheetTemplateId || selectedTemplateId ? 'Active template selected' : 'Template still needs choosing',
        primaryAction: form.activeJobSheetTemplateId || selectedTemplateId ? 'Review job sheet' : 'Choose template',
      },
      {
        key: 'booking-setup',
        title: 'Bookings',
        why: 'Customers need a truthful route into your availability and service flow.',
        href: '/dashboard/settings?tab=bookings&section=booking-setup',
        completed: Boolean(form.bookingPublicEnabled),
        stateLabel: form.bookingPublicEnabled ? 'Public booking is enabled' : 'Public booking is still off',
        primaryAction: form.bookingPublicEnabled ? 'Review booking flow' : 'Set up booking',
      },
      {
        key: 'notifications-email',
        title: 'Notifications',
        why: 'Customers and operators need clear sender and routing details.',
        href: '/dashboard/settings?tab=messages&section=notifications&channel=email',
        completed: Boolean(form.emailSenderName || form.emailReplyTo),
        stateLabel: form.emailSenderName || form.emailReplyTo ? 'Workspace email details are present' : 'Email details still need review',
        primaryAction: form.emailSenderName || form.emailReplyTo ? 'Review email setup' : 'Add email details',
      },
      {
        key: 'plan-and-payments',
        title: 'Payments and billing',
        why: 'Commercial setup must stay truthful before billing-sensitive flows are relied on.',
        href: '/dashboard/billing?section=plan-and-payments',
        completed: Boolean(form.paymentsEnabled),
        stateLabel: form.paymentsEnabled ? 'Payments are enabled in this workspace' : 'Payments are not enabled yet',
        primaryAction: form.paymentsEnabled ? 'Review billing' : 'Set up payments',
      },
      {
        key: 'business-tools',
        title: 'Connect your business tools',
        why: 'Connect the tools your team uses for accounts, payments, and messages.',
        href: '/dashboard/integrations?section=business-tools&provider=quickbooks',
        completed: false,
        stateLabel: 'Review available connections',
        primaryAction: 'Open connections',
      },
    ],
    [form.activeJobSheetTemplateId, form.bookingPublicEnabled, form.emailReplyTo, form.emailSenderName, form.paymentsEnabled, selectedTemplateId],
  );
  const setupJourneyRecommended = useMemo(
    () => setupJourneyItems.find((item) => !item.completed) || setupJourneyItems[0],
    [setupJourneyItems],
  );
  const templateMarketplaceSections = useMemo(
    () => [
      {
        key: 'featured',
        title: 'Featured templates',
        description: 'Curated starters chosen for clarity, speed, and handover quality.',
        items: templateLibrary?.curated?.featured || [],
      },
      {
        key: 'premium',
        title: 'Premium starters',
        description: 'Richer foundations for teams that want a polished operational baseline.',
        items: templateLibrary?.curated?.premiumStarters || [],
      },
      {
        key: 'recent',
        title: 'Recently approved',
        description: 'Freshly approved templates that have passed platform review.',
        items: templateLibrary?.curated?.recentlyApproved || [],
      },
    ].filter((section) => Array.isArray(section.items) && section.items.length > 0),
    [templateLibrary?.curated],
  );
  useEffect(() => {
    let cancelled = false;
    void fetchGeoDefaults().then((defaults) => {
      if (!cancelled) {
        setGeoDefaults(defaults);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadMe = async () => {
      try {
        const me = await apiFetch('/me');
        if (!cancelled) {
          setPermissions(normalizePermissionSnapshot(me?.permissions));
        }
      } catch {
        if (!cancelled) {
          setPermissions(emptyPermissionSnapshot());
        }
      } finally {
        if (!cancelled) {
          setPermissionsReady(true);
        }
      }
    };
    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    const queryTab = typeof router.query.tab === 'string' ? router.query.tab : '';
    const querySection = typeof router.query.section === 'string' ? router.query.section : '';
    if (queryTab === 'integrations') {
      void router.replace('/dashboard/integrations');
      return;
    }
    const normalizedTab = (SECTION_TAB_MAP[querySection] || TAB_ALIASES[queryTab] || queryTab) as TabKey;
    if (normalizedTab && visibleTabs.some((item) => item.key === normalizedTab)) {
      setTab(normalizedTab);
    }
  }, [router.isReady, router.query.section, router.query.tab, visibleTabs]);

  useEffect(() => {
    if (!visibleTabs.some((item) => item.key === tab)) {
      setTab(visibleTabs[0]?.key || 'general');
    }
  }, [tab, visibleTabs]);

  useEffect(() => {
    const templateId = typeof router.query.templateId === 'string' ? router.query.templateId : '';
    if (!templateId || !(templateLibrary?.templates || []).length) return;
    const match = templateLibrary.templates.find((template: any) => String(template.id) === String(templateId));
    if (match) {
      setSelectedTemplateId(String(match.id));
    }
  }, [router.query.templateId, templateLibrary?.templates]);

  useEffect(() => {
    if (!notificationsEnabled || tab !== 'messages') return;
    let cancelled = false;
    apiFetch('/notifications/preferences')
      .then((res) => {
        if (!cancelled) setNotificationPrefs(res || null);
      })
      .catch(() => {
        if (!cancelled) setNotificationPrefs(null);
      });
    return () => {
      cancelled = true;
    };
  }, [notificationsEnabled, tab]);

  useEffect(() => {
    if (tab !== 'messages') return;
    let cancelled = false;
    void Promise.all([
      apiFetch('/tenant/settings/email-readiness'),
      apiFetch('/tenant/settings/email-readiness?ownership=system'),
      apiFetch('/notifications/summaries/readiness'),
      apiFetch('/notifications/ops-alerts/status'),
    ])
      .then(([workspaceRes, systemRes, summaryRes, opsAlertRes]) => {
        if (cancelled) return;
        setEmailReadiness((workspaceRes || null) as EmailReadiness | null);
        setSystemEmailReadiness((systemRes || null) as EmailReadiness | null);
        setSummaryReadiness(summaryRes || null);
        setOpsAlertStatus(opsAlertRes || null);
      })
      .catch(() => {
        if (!cancelled) {
          const fallback: EmailReadiness = {
            status: 'failing',
            source: 'missing',
            transport: 'none',
            canSend: false,
            guidance: 'We could not check outbound email readiness just now.',
            dnsRecords: [],
          };
          setEmailReadiness(fallback);
          setSystemEmailReadiness(fallback);
          setSummaryReadiness(null);
          setOpsAlertStatus(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const themeMode = form.themeMode === 'dark' || form.themeMode === 'system' ? form.themeMode : 'light';
  const settingsSection = typeof router.query.section === 'string' ? router.query.section : '';
  const settingsChannel = typeof router.query.channel === 'string' ? router.query.channel : '';
  const templateTarget = typeof router.query.templateId === 'string' ? `template-${router.query.templateId}` : '';
  const channelTarget = settingsChannel === 'email' ? 'channel-email' : settingsChannel === 'summary' ? 'summary-email' : settingsChannel === 'ops' ? 'ops-alerts' : '';
  const { getSectionProps } = useSectionTargeting({
    targetKey: templateTarget || channelTarget || settingsSection,
    ready: router.isReady && permissionsReady,
  });

  const preview = useMemo(() => {
    return {
      primary: form.brandPrimaryColor || '#4fd1c5',
      secondary: form.brandSecondaryColor || '#1a1f36',
      accent: form.brandAccentColor || form.brandPrimaryColor || '#4fd1c5',
    };
  }, [form]);

  const workflowConfig = useMemo(() => getBusinessConfig(form), [form]);
  const workflowTerms = useMemo(() => getBusinessTerms(form), [form]);
  const internalNotificationSettings = useMemo(() => getInternalNotificationSettings(form), [form]);
  const summaryEmailSettings = useMemo(() => getSummaryEmailSettings(form), [form]);
  const operationalAlertSettings = useMemo(() => getOperationalAlertSettings(form), [form]);
  const internalNotificationDrafts = useMemo(() => {
    const rawRecipients = Array.isArray(workflowConfig.notificationRouting?.internalRecipients)
      ? workflowConfig.notificationRouting.internalRecipients
      : internalNotificationSettings.internalRecipients;
    return rawRecipients.map((recipient): InternalNotificationRecipient => ({
      email: String(recipient?.email || ''),
      label: String(recipient?.label || '').trim() || null,
      enabled: recipient?.enabled !== false,
      categories:
        Array.isArray(recipient?.categories) && recipient.categories.length
          ? recipient.categories.filter((category): category is InternalNotificationCategory =>
              INTERNAL_NOTIFICATION_CATEGORIES.includes(category as InternalNotificationCategory),
            )
          : ['bookings'],
    }));
  }, [internalNotificationSettings.internalRecipients, workflowConfig.notificationRouting?.internalRecipients]);
  const selectedRegionOption = useMemo(
    () => findRegionOption(form.tenantCountry) || findRegionOptionByLocale(form.defaultLocale) || findRegionOption(geoDefaults?.countryCode),
    [form.defaultLocale, form.tenantCountry, geoDefaults?.countryCode],
  );
  const workspaceDeclarationText = useMemo(() => getJobDeclarationText(form), [form]);
  const serviceRecordEmailSettings = useMemo(() => getServiceRecordEmailSettings(form), [form]);
  const customerFeedbackSettings = useMemo(() => getCustomerFeedbackSettings(form), [form]);
  const workspaceJobForms = useMemo(() => getWorkspaceJobForms(form), [form]);
  const customerVisibleFields = useMemo(
    () =>
      (workspaceJobForms.fields || []).filter((field) =>
        Array.isArray((workflowConfig as any)?.jobFormsMeta?.customerSummaryFields)
          ? (workflowConfig as any).jobFormsMeta.customerSummaryFields.includes(field.key)
          : false,
      ),
    [workspaceJobForms.fields, workflowConfig],
  );
  const analyticsLayout = useMemo(() => {
    const analytics = form?.businessConfigJson?.analytics && typeof form.businessConfigJson.analytics === 'object'
      ? form.businessConfigJson.analytics
      : {};
    const widgetOrder = Array.isArray((analytics as any).widgetOrder)
      ? (analytics as any).widgetOrder
          .map((value: unknown) => String(value || '').trim())
          .filter((value: string): value is AnalyticsWidgetKey => ANALYTICS_WIDGET_KEYS.includes(value as AnalyticsWidgetKey))
      : [];
    const hiddenWidgets = Array.isArray((analytics as any).hiddenWidgets)
      ? (analytics as any).hiddenWidgets
          .map((value: unknown) => String(value || '').trim())
          .filter((value: string): value is AnalyticsWidgetKey => ANALYTICS_WIDGET_KEYS.includes(value as AnalyticsWidgetKey))
      : [];
    return {
      widgetOrder: Array.from(new Set([...(widgetOrder.length ? widgetOrder : ANALYTICS_WIDGET_KEYS), ...ANALYTICS_WIDGET_KEYS])) as AnalyticsWidgetKey[],
      hiddenWidgets: Array.from(new Set(hiddenWidgets)) as AnalyticsWidgetKey[],
      defaultWindowDays: Math.max(7, Math.min(90, Number((analytics as any).defaultWindowDays || 30))),
    };
  }, [form]);
  const commandCentreLayout = useMemo(() => getCommandCentreWorkspaceLayout(form), [form]);
  const bookingStages = useMemo(() => getBookingStages(form), [form]);
  const jobStages = useMemo(() => getJobStages(form), [form]);
  const technicianStages = useMemo(() => getTechnicianStages(form), [form]);
  const selectedTriggerMeta = useMemo(
    () => AUTOMATION_TRIGGER_OPTIONS.find((option) => option.value === ruleDraft.trigger) || null,
    [ruleDraft.trigger],
  );
  const selectedActionMeta = useMemo(
    () => AUTOMATION_ACTION_OPTIONS.find((option) => option.value === ruleDraft.actionJson.type) || null,
    [ruleDraft.actionJson.type],
  );
  const automationRuleSummary = useMemo(() => buildRuleSummary(ruleDraft), [ruleDraft]);
  const automationRuleValidationError = useMemo(() => getRuleDraftValidationError(ruleDraft), [ruleDraft]);
  const stageSections: StageSectionConfig[] = useMemo(() => [
    { key: 'bookings', title: 'Bookings workflow', stages: bookingStages },
    { key: 'jobs', title: 'Jobs workflow', stages: jobStages },
    { key: 'technician', title: 'Technician workflow', stages: technicianStages },
  ], [bookingStages, jobStages, technicianStages]);

  useEffect(() => {
    if (!automationsEnabled || tab !== 'advanced') return;
    void loadAutomationRules();
    void loadAutomationSuggestions();
    void loadAutomationRuns();
  }, [automationsEnabled, tab]);

  useEffect(() => {
    if (tab !== 'advanced' && tab !== 'jobs' && tab !== 'team' && tab !== 'bookings') return;
    void loadCustomFields();
  }, [tab]);

  function updateBusinessConfig(updater: (current: Record<string, any>) => Record<string, any>) {
    updateForm((prev: any) => ({
      ...prev,
      businessConfigJson: updater((prev?.businessConfigJson && typeof prev.businessConfigJson === 'object') ? prev.businessConfigJson : {}),
    }));
  }

  function applyRegionDefaults(countryCode: string) {
    const option = findRegionOption(countryCode);
    setForm((prev: any) => ({
      ...prev,
      tenantCountry: option?.countryCode || countryCode,
      defaultLocale: option?.locale || geoDefaults?.locale || DEFAULT_WORKSPACE_LOCALE,
      defaultTimezone:
        !String(prev.defaultTimezone || '').trim() ||
        prev.defaultTimezone === DEFAULT_WORKSPACE_TIMEZONE ||
        prev.defaultTimezone === geoDefaults?.timezone
          ? option?.timezone || geoDefaults?.timezone || DEFAULT_WORKSPACE_TIMEZONE
          : prev.defaultTimezone,
      defaultCurrency:
        !String(prev.defaultCurrency || '').trim() ||
        prev.defaultCurrency === DEFAULT_WORKSPACE_CURRENCY ||
        prev.defaultCurrency === geoDefaults?.currency
          ? option?.currency || geoDefaults?.currency || DEFAULT_WORKSPACE_CURRENCY
          : prev.defaultCurrency,
    }));
  }

  function updateJobForms(updater: (current: Record<string, any>) => Record<string, any>) {
    updateBusinessConfig((current) => ({
      ...current,
      jobForms: updater((current.jobForms && typeof current.jobForms === 'object') ? current.jobForms : {}),
    }));
  }

  function updateServiceRecordEmailConfig(updater: (current: Record<string, any>) => Record<string, any>) {
    updateBusinessConfig((current) => ({
      ...current,
      serviceRecordEmail: updater((current.serviceRecordEmail && typeof current.serviceRecordEmail === 'object') ? current.serviceRecordEmail : {}),
    }));
  }

  function updateNotificationRouting(updater: (current: { internalRecipients?: InternalNotificationRecipient[] | null }) => { internalRecipients?: InternalNotificationRecipient[] | null }) {
    updateBusinessConfig((current) => ({
      ...current,
      notificationRouting: updater(
        (current.notificationRouting && typeof current.notificationRouting === 'object') ? current.notificationRouting : {},
      ),
    }));
  }

  function updateSummaryEmailConfig(updater: (current: Record<string, any>) => Record<string, any>) {
    updateBusinessConfig((current) => ({
      ...current,
      summaryEmails: updater((current.summaryEmails && typeof current.summaryEmails === 'object') ? current.summaryEmails : {}),
    }));
  }

  function updateOperationalAlertConfig(updater: (current: Record<string, any>) => Record<string, any>) {
    updateBusinessConfig((current) => ({
      ...current,
      operationalAlerts: updater((current.operationalAlerts && typeof current.operationalAlerts === 'object') ? current.operationalAlerts : {}),
    }));
  }

  function addInternalRecipient() {
    updateNotificationRouting((current) => ({
      ...current,
      internalRecipients: [
        ...((Array.isArray(current.internalRecipients) ? current.internalRecipients : []) as InternalNotificationRecipient[]),
        {
          email: '',
          label: null,
          enabled: true,
          categories: ['bookings'],
        },
      ],
    }));
  }

  function updateInternalRecipient(index: number, updater: (recipient: InternalNotificationRecipient) => InternalNotificationRecipient) {
    const nextRecipients = internalNotificationDrafts.map((recipient, recipientIndex) =>
      recipientIndex === index ? updater(recipient) : recipient,
    );
    updateNotificationRouting(() => ({
      internalRecipients: nextRecipients,
    }));
  }

  function removeInternalRecipient(index: number) {
    updateNotificationRouting(() => ({
      internalRecipients: internalNotificationDrafts.filter((_, recipientIndex) => recipientIndex !== index),
    }));
  }

  function addServiceRecordRecipient() {
    const nextEmail = serviceRecordRecipientDraft.trim().toLowerCase();
    if (!nextEmail) return;
    updateServiceRecordEmailConfig((current) => ({
      ...current,
      defaultRecipients: Array.from(
        new Set([...(Array.isArray(current.defaultRecipients) ? current.defaultRecipients : []), nextEmail]),
      ),
    }));
    setServiceRecordRecipientDraft('');
  }

  function removeServiceRecordRecipient(email: string) {
    updateServiceRecordEmailConfig((current) => ({
      ...current,
      defaultRecipients: (Array.isArray(current.defaultRecipients) ? current.defaultRecipients : []).filter((value: unknown) => String(value || '').trim().toLowerCase() !== email),
    }));
  }

  function updateServiceTypes(nextServiceTypes: WorkspaceServiceTypeConfig[]) {
    updateJobForms((current) => ({
      ...current,
      serviceTypes: nextServiceTypes.map((serviceType, index) => ({
        id: serviceType.id,
        name: serviceType.name,
        description: serviceType.description || null,
        enabled: serviceType.enabled !== false,
        retired: serviceType.retired === true,
        order: index,
      })),
    }));
  }

  function updateJobFormSections(nextSections: WorkspaceJobFormSectionConfig[]) {
    updateJobForms((current) => ({
      ...current,
      sections: nextSections.map((section, index) => ({
        id: section.id,
        title: section.title,
        description: section.description || null,
        order: index,
        visible: section.visible !== false,
        serviceTypeIds: Array.isArray(section.serviceTypeIds) ? section.serviceTypeIds : [],
      })),
    }));
  }

  function updateJobFormFields(nextFields: WorkspaceJobFormFieldConfig[]) {
    updateJobForms((current) => ({
      ...current,
      fields: nextFields.map((field, index) => ({
        id: field.id,
        key: field.key,
        sectionId: field.sectionId,
        label: field.label,
        helpText: field.helpText || null,
        type: SAFE_JOB_FORM_FIELD_TYPES.includes(field.type as SafeJobFormFieldType) ? field.type : 'text',
        required: field.required === true,
        visible: field.visible !== false,
        order: index,
        options: Array.isArray(field.options) ? field.options : [],
        serviceTypeIds: Array.isArray(field.serviceTypeIds) ? field.serviceTypeIds : [],
      })),
    }));
  }

  function removeServiceType(serviceTypeId: string) {
    updateJobForms((current) => {
      const currentSections = Array.isArray(current.sections) ? current.sections : [];
      const currentFields = Array.isArray(current.fields) ? current.fields : [];
      const currentServiceTypes = Array.isArray(current.serviceTypes) ? current.serviceTypes : [];
      return {
        ...current,
        serviceTypes: currentServiceTypes
          .filter((serviceType: WorkspaceServiceTypeConfig) => serviceType.id !== serviceTypeId)
          .map((serviceType: WorkspaceServiceTypeConfig, index: number) => ({
            ...serviceType,
            order: index,
          })),
        sections: currentSections.map((section: WorkspaceJobFormSectionConfig, index: number) => ({
          ...section,
          order: index,
          serviceTypeIds: Array.isArray(section.serviceTypeIds)
            ? section.serviceTypeIds.filter((id) => id !== serviceTypeId)
            : [],
        })),
        fields: currentFields.map((field: WorkspaceJobFormFieldConfig, index: number) => ({
          ...field,
          order: index,
          serviceTypeIds: Array.isArray(field.serviceTypeIds)
            ? field.serviceTypeIds.filter((id) => id !== serviceTypeId)
            : [],
        })),
      };
    });
  }

  function removeJobFormSection(sectionId: string) {
    updateJobForms((current) => {
      const currentSections = Array.isArray(current.sections) ? current.sections : [];
      const currentFields = Array.isArray(current.fields) ? current.fields : [];
      return {
        ...current,
        sections: currentSections
          .filter((section: WorkspaceJobFormSectionConfig) => section.id !== sectionId)
          .map((section: WorkspaceJobFormSectionConfig, index: number) => ({
            ...section,
            order: index,
          })),
        fields: currentFields
          .filter((field: WorkspaceJobFormFieldConfig) => field.sectionId !== sectionId)
          .map((field: WorkspaceJobFormFieldConfig, index: number) => ({
            ...field,
            order: index,
          })),
      };
    });
  }

  function removeJobFormField(fieldId: string) {
    updateJobFormFields((workspaceJobForms.fields || []).filter((field) => field.id !== fieldId));
  }

  async function applyWorkspaceTemplate() {
    if (!selectedTemplateId) {
      showError('Choose a template first.');
      return;
    }
    setTemplateActionLoading('apply');
    try {
      const result = await apiFetch(`/templates/apply/${encodeURIComponent(selectedTemplateId)}`, { method: 'POST' });
      await refresh();
      await loadTemplateLibrary();
      showSuccess(`Applied ${result?.appliedTemplate?.name || 'job sheet template'}.`);
      setTab('jobs');
    } catch (err: any) {
      showError(err.message || 'Failed to apply job sheet template.');
    } finally {
      setTemplateActionLoading('');
    }
  }

  async function submitWorkspaceTemplateProposal() {
    setTemplateActionLoading('submit');
    try {
      const payload = {
        name: `${String(form.companyName || 'Workspace').trim() || 'Workspace'} job sheet`,
        tradeCategory: String(form.activeJobSheetTemplateTrade || form.primaryTrade || 'GENERAL').trim() || 'GENERAL',
        description: 'Submitted from workspace customisation.',
      };
      await apiFetch('/templates/submit', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await loadTemplateLibrary();
      showSuccess('Template proposal submitted for platform review.');
    } catch (err: any) {
      showError(err.message || 'Failed to submit template proposal.');
    } finally {
      setTemplateActionLoading('');
    }
  }

  function updateWorkflowStages(section: StageSectionKey, stages: WorkflowStage[]) {
    updateBusinessConfig((current) => ({
      ...current,
      workflowStages: {
        ...(current.workflowStages || {}),
        [section]: stages.map((stage) => ({
          id: stage.id,
          label: stage.label,
          statuses: stage.statuses,
          visible: stage.visible !== false,
          requiredCustomFieldKeys: Array.isArray(stage.requiredCustomFieldKeys) ? stage.requiredCustomFieldKeys : [],
          requiredFieldEnforcementMode: stage.requiredFieldEnforcementMode === 'block' ? 'block' : 'warn',
        })),
      },
    }));
  }

  function updateStageLabel(section: StageSectionKey, stageId: string, label: string, stages: WorkflowStage[]) {
    updateWorkflowStages(
      section,
      stages.map((stage) => (stage.id === stageId ? { ...stage, label } : stage)),
    );
  }

  function toggleStageVisibility(section: StageSectionKey, stageId: string, stages: WorkflowStage[]) {
    updateWorkflowStages(
      section,
      stages.map((stage) => (stage.id === stageId ? { ...stage, visible: stage.visible === false } : stage)),
    );
  }

  function moveStage(section: StageSectionKey, stageId: string, direction: -1 | 1, stages: WorkflowStage[]) {
    const index = stages.findIndex((stage) => stage.id === stageId);
    const nextIndex = index + direction;
    if (index === -1 || nextIndex < 0 || nextIndex >= stages.length) return;
    const nextStages = [...stages];
    const [stage] = nextStages.splice(index, 1);
    nextStages.splice(nextIndex, 0, stage);
    updateWorkflowStages(section, nextStages);
  }

  async function loadAutomationRules() {
    if (!automationsEnabled) return;
    setAutomationRulesLoading(true);
    setAutomationRulesError('');
    try {
      const data = await apiFetch('/automations/workspace-rules');
      setAutomationRules(Array.isArray(data) ? data as WorkspaceAutomationRule[] : []);
    } catch (err: any) {
      setAutomationRulesError(err?.message || 'Failed to load automation rules');
    } finally {
      setAutomationRulesLoading(false);
    }
  }

  async function loadAutomationSuggestions() {
    if (!automationsEnabled) return;
    setAutomationSuggestionsLoading(true);
    setAutomationSuggestionsError('');
    try {
      const data = await apiFetch('/automations/suggestions');
      setAutomationSuggestions(Array.isArray(data) ? data as AutomationSuggestion[] : []);
    } catch (err: any) {
      setAutomationSuggestions([]);
      setAutomationSuggestionsError(err?.message || 'Failed to load suggested automations');
    } finally {
      setAutomationSuggestionsLoading(false);
    }
  }

  async function loadAutomationRuns() {
    if (!automationsEnabled) return;
    setAutomationRunsLoading(true);
    try {
      const data = await apiFetch('/automations/runs?limit=20');
      setAutomationRuns(Array.isArray(data) ? data as AutomationRun[] : []);
    } catch {
      setAutomationRuns([]);
    } finally {
      setAutomationRunsLoading(false);
    }
  }

  async function loadCustomFields() {
    setCustomFieldsLoading(true);
    try {
      const data = await apiFetch('/custom-fields');
      setCustomFields(Array.isArray(data) ? data as CustomField[] : []);
    } catch {
      setCustomFields([]);
    } finally {
      setCustomFieldsLoading(false);
    }
  }

  async function applyAutomationSuggestion(suggestionKey: string) {
    if (!automationsEnabled) return;
    clearNotice();
    setApplyingSuggestionKey(suggestionKey);
    setAutomationSuggestionsError('');
    try {
      await apiFetch(`/automations/suggestions/${suggestionKey}/apply`, {
        method: 'POST',
      });
      showSuccess('Suggested automation applied');
      await Promise.all([loadAutomationSuggestions(), loadAutomationRules(), loadAutomationRuns()]);
    } catch (err: any) {
      showError(err?.message || 'Failed to apply suggested automation');
    } finally {
      setApplyingSuggestionKey(null);
    }
  }

  async function dismissAutomationSuggestion(suggestionKey: string) {
    if (!automationsEnabled) return;
    clearNotice();
    setDismissingSuggestionKey(suggestionKey);
    setAutomationSuggestionsError('');
    try {
      await apiFetch(`/automations/suggestions/${suggestionKey}/dismiss`, {
        method: 'POST',
      });
      showSuccess('Suggested automation dismissed');
      await loadAutomationSuggestions();
    } catch (err: any) {
      showError(err?.message || 'Failed to dismiss suggested automation');
    } finally {
      setDismissingSuggestionKey(null);
    }
  }

  function openNewRuleEditor() {
    setRuleDraft(createDefaultRuleDraft());
    setRuleEditorOpen(true);
  }

  function applyAutomationTemplate(template: AutomationTemplate) {
    setRuleDraft({
      id: null,
      name: template.title,
      trigger: template.trigger,
      enabled: true,
      conditionJson: template.conditionJson,
      actionJson: template.actionJson,
    });
    setRuleEditorOpen(true);
  }

  function openEditRule(rule: WorkspaceAutomationRule) {
    setRuleDraft({
      id: rule.id,
      name: rule.name,
      trigger: rule.trigger,
      enabled: rule.enabled,
      conditionJson: rule.conditionJson || {},
      actionJson: rule.actionJson,
    });
    setRuleEditorOpen(true);
  }

  async function saveAutomationRule() {
    if (!automationsEnabled) return;
    clearNotice();
    if (automationRuleValidationError) {
      showError(automationRuleValidationError);
      return;
    }
    setSavingRule(true);
    setAutomationRulesError('');
    try {
      const payload = {
        name: ruleDraft.name,
        trigger: ruleDraft.trigger,
        enabled: ruleDraft.enabled,
        conditionJson: ruleDraft.conditionJson,
        actionJson: ruleDraft.actionJson,
      };
      if (ruleDraft.id) {
        await apiFetch(`/automations/workspace-rules/${ruleDraft.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showSuccess('Automation rule updated');
      } else {
        await apiFetch('/automations/workspace-rules', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showSuccess('Automation rule created');
      }
      setRuleEditorOpen(false);
      setRuleDraft(createDefaultRuleDraft());
      await Promise.all([loadAutomationSuggestions(), loadAutomationRules(), loadAutomationRuns()]);
    } catch (err: any) {
      showError(err?.message || 'Failed to save automation rule');
    } finally {
      setSavingRule(false);
    }
  }

  async function toggleAutomationRule(rule: WorkspaceAutomationRule) {
    if (!automationsEnabled) return;
    clearNotice();
    try {
      await apiFetch(`/automations/workspace-rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      showSuccess(rule.enabled ? 'Automation rule disabled' : 'Automation rule enabled');
      await Promise.all([loadAutomationSuggestions(), loadAutomationRules()]);
    } catch (err: any) {
      showError(err?.message || 'Failed to update automation rule');
    }
  }

  async function deleteAutomationRule(ruleId: string) {
    if (!automationsEnabled) return;
    clearNotice();
    setDeletingRuleId(ruleId);
    try {
      await apiFetch(`/automations/workspace-rules/${ruleId}`, { method: 'DELETE' });
      showSuccess('Automation rule deleted');
      if (ruleDraft.id === ruleId) {
        setRuleEditorOpen(false);
        setRuleDraft(createDefaultRuleDraft());
      }
      await Promise.all([loadAutomationSuggestions(), loadAutomationRules(), loadAutomationRuns()]);
    } catch (err: any) {
      showError(err?.message || 'Failed to delete automation rule');
    } finally {
      setDeletingRuleId(null);
    }
  }

  const stats = useMemo(() => {
    const enabledFeatures = [
      Boolean(form.featureBookings),
      Boolean(form.featureAI),
      Boolean(form.featureAccounting),
      Boolean(form.featurePayments),
      Boolean(form.featureWhatsApp),
    ].filter(Boolean).length;
    return [
      { label: 'Theme', value: themeMode === 'dark' ? 'Dark' : themeMode === 'system' ? 'Use device setting' : 'Light', hint: 'Operator shell mode' },
      { label: 'Features on', value: String(enabledFeatures), hint: 'Core tenant toggles enabled' },
      { label: 'Plan', value: planCode || 'STANDARD', hint: 'Billing-controlled capability set' },
    ];
  }, [form.featureAI, form.featureAccounting, form.featureBookings, form.featurePayments, form.featureWhatsApp, planCode, themeMode]);
  const settingsPayload = useMemo(() => buildSettingsPayload(form), [form]);
  const baselineSettingsPayload = useMemo(() => buildSettingsPayload(settings || {}), [settings]);
  const settingsDirty = useMemo(
    () => JSON.stringify(settingsPayload) !== JSON.stringify(baselineSettingsPayload),
    [baselineSettingsPayload, settingsPayload],
  );

  async function saveSettings() {
    clearNotice();
    const nextPayload = buildSettingsPayload(formRef.current || {});
    const isDirty = JSON.stringify(nextPayload) !== JSON.stringify(baselineSettingsPayload);
    if (!isDirty) {
      showSuccess('No unsaved settings changes');
      return;
    }
    setSavingSettings(true);
    try {
      await apiFetch('/tenant/settings', {
        method: 'PUT',
        body: JSON.stringify(nextPayload),
      });
      const persisted = await apiFetch('/tenant/settings');
      const persistedPayload = buildSettingsPayload(persisted || {});
      if (!settingsValueContains(persistedPayload, nextPayload)) {
        throw new Error('Settings were not fully persisted. Reload and try again.');
      }
      setForm(persisted);
      setLocalSettings(persisted as TenantSettings);
      if (tab === 'messages' && notificationsEnabled) {
        try {
          const refreshedStatus = await apiFetch('/notifications/ops-alerts/status');
          setOpsAlertStatus(refreshedStatus || null);
        } catch {
          setOpsAlertStatus(null);
        }
      }
      showSuccess('Settings saved');
    } catch (err: any) {
      showError(err.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  }

  async function uploadLogo() {
    clearNotice();
    try {
      if (logoFile) {
        const formData = new FormData();
        formData.append('file', logoFile);
        const uploaded = await apiFetch('/tenant/settings/logo', { method: 'POST', body: formData });
        if (!String(uploaded?.logoUrl || '').trim()) throw new Error('The logo upload did not return a saved image.');
      } else if (form.logoUrl) {
        await apiFetch('/tenant/settings/logo', {
          method: 'POST',
          body: JSON.stringify({ logoUrl: form.logoUrl }),
        });
      } else {
        showError('Choose a logo file or enter a logo URL before updating branding.');
        return;
      }
      const persisted = await apiFetch('/tenant/settings');
      if (!String(persisted?.logoUrl || '').trim()) throw new Error('The logo was not persisted.');
      setForm(persisted);
      setLocalSettings(persisted as TenantSettings);
      showSuccess(`Logo saved${logoFile ? `: ${logoFile.name}` : ''}`);
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
      setLogoPreviewUrl('');
      setLogoFile(null);
      await refresh();
    } catch (err: any) {
      showError(err.message || 'Failed to upload logo');
    }
  }

  async function runGuidedSetup() {
    clearNotice();
    try {
      router.push('/dashboard/setup-wizard');
    } catch (err: any) {
      showError(err.message || 'Failed to start guided setup');
    }
  }

  async function updateThemeMode(mode: 'light' | 'dark' | 'system') {
    clearNotice();
    setThemeSaving(mode);
    try {
      await apiFetch('/tenant/settings', {
        method: 'PATCH',
        body: JSON.stringify({ themeMode: mode }),
      });
      const persisted = await apiFetch('/tenant/settings');
      if (persisted?.themeMode !== mode) throw new Error('The theme preference did not persist.');
      setForm(persisted);
      setLocalSettings(persisted as TenantSettings);
      showSuccess(`Theme saved: ${mode === 'system' ? 'Use device setting' : mode}`);
    } catch (err: any) {
      showError(err.message || 'Failed to update theme');
    } finally {
      setThemeSaving('');
    }
  }

  async function saveNotificationPref(key: string, value: boolean) {
    if (!notificationsEnabled) return;
    clearNotice();
    try {
      const updated = await apiFetch('/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value }),
      });
      setNotificationPrefs(updated);
      showSuccess('Notification preferences saved');
    } catch (err: any) {
      showError(err.message || 'Failed to update notification preferences');
    }
  }

  async function previewSummaryEmails() {
    clearNotice();
    setPreviewingSummary(true);
    try {
      const cadence = summaryEmailSettings.enabledCadences[0] || 'weekly';
      const response = await apiFetch('/notifications/summaries/dispatch', {
        method: 'POST',
        body: JSON.stringify({ cadence, dryRun: true }),
      });
      setSummaryPreview(response || null);
      showSuccess('Summary preview ready');
    } catch (err: any) {
      showError(err.message || 'Failed to build summary preview');
    } finally {
      setPreviewingSummary(false);
    }
  }

  async function sendOperationalAlertSmokeTest() {
    clearNotice();
    setSendingOpsAlertSmoke(true);
    try {
      const response = await apiFetch('/notifications/ops-alerts/smoke', {
        method: 'POST',
      });
      setOpsAlertSmokeResult(response || null);
      showSuccess('Operational alert smoke test sent');
      const refreshedStatus = await apiFetch('/notifications/ops-alerts/status');
      setOpsAlertStatus(refreshedStatus || null);
    } catch (err: any) {
      showError(err?.message || 'Failed to send operational alert smoke test');
    } finally {
      setSendingOpsAlertSmoke(false);
    }
  }

  function restartDemoTour() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem('mytitan_demo_tour_seen_v1');
    showSuccess('Tour reset. Open dashboard to start again.');
  }

  if (permissionsReady && !canManageSettings) {
    return (
      <DashboardShell>
        <div className="settings-premium-shell">
          <OperatorPageHeader
            eyebrow="Settings"
            title="Settings"
            subtitle="Only owners and admins can change this page."
            stats={[]}
          />
          <div className="card settings-premium-card" data-testid="settings-governance-blocked">
            <h2 style={{ marginTop: 0 }}>Access restricted</h2>
            <p className="muted settings-premium-muted" style={{ marginBottom: 0 }}>
              You do not have access to this page. Ask an owner or admin to make changes.
            </p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (settingsLoading && !settings) {
    return (
      <DashboardShell>
        <div className="settings-premium-shell">
          <OperatorPageHeader
            eyebrow="Settings"
            title="Workspace settings"
            subtitle="Loading the current workspace configuration."
            stats={[]}
          />
          <div className="card settings-premium-card" data-testid="settings-loading-state">
            <h2 style={{ marginTop: 0 }}>Loading settings</h2>
            <p className="muted settings-premium-muted" style={{ marginBottom: 0 }}>
              Pulling the current workspace configuration before edits are enabled.
            </p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
  <div className="settings-premium-shell">
      <OperatorNotice notice={notice} onDismiss={clearNotice} />
      <OperatorPageHeader
        eyebrow="Settings"
        title="Workspace settings"
        subtitle="Manage branding, workflow, customer setup, and workspace controls."
        actions={[
          { label: 'Review connected tools', href: '/dashboard/integrations?section=owner-command', variant: 'secondary' },
          { label: settings?.guidedSetupCompletedAt ? 'Review setup' : 'Finish setup', href: settings?.guidedSetupCompletedAt ? '/dashboard/settings?tab=jobs&section=template-marketplace' : '/dashboard/setup-wizard', variant: 'primary' },
        ]}
        shortcuts={['Each important concept has one home here', 'Use setup when you want guided help instead of manual changes']}
        stats={stats}
      />
      <GuidedSetupProgress enabled={guidedSetupEnabled} incomplete={!settings?.guidedSetupCompletedAt} compact />
      <div className="settings-command-strip" data-testid="settings-command-strip">
        <div className="settings-command-strip__item">
          <span className="settings-command-strip__label">Running well</span>
          <strong>Core controls are grouped by outcome</strong>
          <p className="muted settings-premium-muted">Business profile, work flow, customer setup, billing, and oversight each keep one clear home.</p>
        </div>
        <div className="settings-command-strip__item">
          <span className="settings-command-strip__label">Needs attention</span>
          <strong>{settings?.guidedSetupCompletedAt ? 'Keep launch truth and business readiness reviewed' : 'Finish setup before broad changes'}</strong>
          <p className="muted settings-premium-muted">
            {settings?.guidedSetupCompletedAt
              ? 'Use Launch Control and business readiness before customer-facing or billing changes.'
              : 'Guided setup will walk through the remaining essentials without hunting across settings.'}
          </p>
        </div>
        <div className="settings-command-strip__item settings-command-strip__item--action">
          <span className="settings-command-strip__label">Next action</span>
          <strong>{settings?.guidedSetupCompletedAt ? 'Review launch confidence' : 'Complete guided setup'}</strong>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <Link className="button secondary settings-premium-button" href={settings?.guidedSetupCompletedAt ? '/dashboard/settings/launch-control' : '/dashboard/setup-wizard'}>
              {settings?.guidedSetupCompletedAt ? 'Open launch control' : 'Open guided setup'}
            </Link>
          </div>
        </div>
      </div>
      <div className="card settings-premium-card" {...getSectionProps('guided-setup-hub')} data-testid="settings-guided-setup-hub">
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>Start here</h2>
          <p className="muted settings-premium-muted" style={{ marginBottom: 0 }}>
            Keep setup linear: choose the one outcome that matters next, then land directly on the exact control that finishes it.
          </p>
        </div>
        <div className="card settings-premium-subcard" style={{ marginBottom: 14 }}>
          <span className="mt-guided-setup-card__eyebrow">Recommended next step</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ maxWidth: 700 }}>
              <strong style={{ display: 'block', marginBottom: 6 }}>{setupJourneyRecommended.title}</strong>
              <p className="muted settings-premium-muted" style={{ margin: 0 }}>{setupJourneyRecommended.stateLabel}</p>
              <p className="muted settings-premium-muted" style={{ margin: '8px 0 0 0' }}>{setupJourneyRecommended.why}</p>
            </div>
            <Link className="button secondary settings-premium-button" href={setupJourneyRecommended.href}>
              {setupJourneyRecommended.primaryAction}
            </Link>
          </div>
        </div>
        <div className="mt-guided-setup-grid">
          {setupJourneyItems.map((item) => (
            <Link key={item.key} href={item.href} className="mt-guided-setup-card mt-linkCard" data-testid={`settings-setup-hub-${item.key}`}>
              <span className="mt-guided-setup-card__eyebrow">{item.completed ? 'Completed' : 'Needs attention'}</span>
              <strong>{item.title}</strong>
              <p className="muted settings-premium-muted" style={{ margin: 0 }}>{item.stateLabel}</p>
              <p className="muted settings-premium-muted" style={{ margin: 0 }}>{item.why}</p>
              <span className="mt-linkCard__action">{item.primaryAction}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="card settings-premium-card">
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>Choose the right home once</h2>
          <p className="muted settings-premium-muted" style={{ marginBottom: 0 }}>
            Keep changes in one place: payments in Billing, customer payment providers in Payments, sender setup in Email & Notifications, readiness in Operations / Monitoring, and launch truth in Launch Control.
          </p>
        </div>
        <div className="settings-tab-grid" style={{ marginBottom: 16 }} data-testid="settings-directory-grid">
          {SETTINGS_DIRECTORY.filter((item) => ['business-details', 'jobs-forms', 'booking', 'email-notifications', 'payments-invoicing', 'operations-monitoring'].includes(item.key)).map((item) => (
            <button
              key={item.key}
              type="button"
              className="tab-button settings-tab-button active"
              data-testid={`settings-directory-${item.key}`}
              onClick={() => void router.push(item.href)}
            >
              <strong>{item.title}</strong>
              <span>{item.description}</span>
              <span>{item.actionLabel}</span>
            </button>
          ))}
        </div>
        <details className="dashboard-home-details mt-technical-details">
          <summary>Open every settings area</summary>
          <div className="settings-tab-grid" style={{ marginTop: 14 }}>
            {SETTINGS_DIRECTORY.filter((item) => !['business-details', 'jobs-forms', 'booking', 'email-notifications', 'payments-invoicing', 'operations-monitoring'].includes(item.key)).map((item) => (
              <button
                key={item.key}
                type="button"
                className="tab-button settings-tab-button active"
                data-testid={`settings-directory-${item.key}`}
                onClick={() => void router.push(item.href)}
              >
                <strong>{item.title}</strong>
                <span>{item.description}</span>
                <span>{item.actionLabel}</span>
              </button>
            ))}
          </div>
        </details>
        <div style={{ display: 'grid', gap: 16 }}>
          {visibleTabGroups.map((group) => (
            <div key={group.group}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>{group.group}</h3>
              <div className="settings-tab-grid">
                {group.items.map((item) => (
                  <button
                    key={item.key}
                    data-testid={`settings-tab-${item.key}`}
                    className={`tab-button settings-tab-button ${tab === item.key ? 'active' : ''}`}
                    onClick={() => setTab(item.key)}
                    type="button"
                  >
                    <strong>{item.label}</strong>
                    <span>{item.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {tab === 'general' && (
          <>
            <div className="card settings-premium-card" style={{ marginBottom: 12 }} {...getSectionProps('business-profile')}>
              <h3 style={{ marginTop: 0 }}>Business details</h3>
              <p className="muted settings-premium-muted">Set the business identity and contact details operators and customers rely on every day.</p>
              <label className="settings-premium-label">Business name</label>
              <input className="input settings-premium-input" value={form.companyName || ''} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
              <div className="two-col">
                <div>
                  <label className="settings-premium-label">Registered business name</label>
                  <input className="input settings-premium-input" data-testid="settings-registered-business-name" value={form.registeredBusinessName || ''} onChange={(e) => setForm({ ...form, registeredBusinessName: e.target.value })} />
                </div>
                <div>
                  <label className="settings-premium-label">Trading name</label>
                  <input className="input settings-premium-input" data-testid="settings-trading-name" value={form.tradingName || ''} onChange={(e) => setForm({ ...form, tradingName: e.target.value })} />
                </div>
                <div>
                  <label className="settings-premium-label">Company number</label>
                  <input className="input settings-premium-input" data-testid="settings-company-number" value={form.companyNumber || ''} onChange={(e) => setForm({ ...form, companyNumber: e.target.value })} />
                </div>
                <div>
                  <label className="settings-premium-label">VAT or tax registration number</label>
                  <input className="input settings-premium-input" data-testid="settings-tax-registration-number" value={form.taxRegistrationNumber || ''} onChange={(e) => setForm({ ...form, taxRegistrationNumber: e.target.value })} />
                </div>
              </div>
              <label className="settings-premium-label">Registered address</label>
              <input className="input settings-premium-input" placeholder="Address line 1" value={form.businessAddressLine1 || ''} onChange={(e) => setForm({ ...form, businessAddressLine1: e.target.value })} />
              <input className="input settings-premium-input" placeholder="Address line 2 (optional)" value={form.businessAddressLine2 || ''} onChange={(e) => setForm({ ...form, businessAddressLine2: e.target.value })} style={{ marginTop: 8 }} />
              <div className="three-col">
                <input className="input settings-premium-input" aria-label="Business city" placeholder="Town or city" value={form.businessCity || ''} onChange={(e) => setForm({ ...form, businessCity: e.target.value })} />
                <input className="input settings-premium-input" aria-label="Business postcode" placeholder="Postcode" value={form.businessPostcode || ''} onChange={(e) => setForm({ ...form, businessPostcode: e.target.value })} />
                <input className="input settings-premium-input" aria-label="Business address country" placeholder="Country" value={form.businessCountry || ''} onChange={(e) => setForm({ ...form, businessCountry: e.target.value })} />
              </div>
              <div className="three-col">
                <div>
                  <label className="settings-premium-label">Contact phone</label>
                  <input className="input settings-premium-input" value={form.contactPhone || ''} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
                </div>
                <div>
                  <label className="settings-premium-label">Contact email</label>
                  <input className="input settings-premium-input" type="email" value={form.contactEmail || ''} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
                </div>
                <div>
                  <label className="settings-premium-label">Website</label>
                  <input className="input settings-premium-input" type="url" placeholder="https://" value={form.websiteUrl || ''} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} />
                </div>
              </div>
              <fieldset className="settings-premium-subcard" data-testid="settings-business-display-controls">
                <legend>Show business details on</legend>
                <div className="three-col">
                  {[
                    ['invoices', 'Invoices and estimates'],
                    ['receipts', 'Receipts'],
                    ['statements', 'Statements'],
                    ['jobSheets', 'Job sheets and PDFs'],
                    ['customerEmails', 'Customer emails'],
                    ['customerPortal', 'Customer portal'],
                    ['booking', 'Booking confirmation'],
                    ['tradePortal', 'Trade portal'],
                    ['legalFooter', 'Footer and legal documents'],
                  ].map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={form.businessDisplayJson?.[key] !== false}
                        onChange={(event) => setForm((current: any) => ({
                          ...current,
                          businessDisplayJson: {
                            ...(current.businessDisplayJson || {}),
                            [key]: event.target.checked,
                          },
                        }))}
                      />{' '}
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="two-col">
                <div>
                  <label className="settings-premium-label">Country or region</label>
                  <select
                    className="input settings-premium-input"
                    data-testid="settings-region-select"
                    value={selectedRegionOption?.countryCode || ''}
                    onChange={(e) => applyRegionDefaults(e.target.value)}
                  >
                    <option value="">Choose country or region</option>
                    {REGION_OPTIONS.map((option) => (
                      <option key={option.countryCode} value={option.countryCode}>{option.label}</option>
                    ))}
                  </select>
                  <p className="muted settings-premium-muted" style={{ marginTop: 6, marginBottom: 0 }}>
                    {geoDefaults?.detected && geoDefaults.country
                      ? `Detected from your connection. You can keep it or change it.`
                      : 'If detection is unavailable, MyTitan keeps GBP as the safe default.'}
                  </p>
                </div>
                <div>
                  <label className="settings-premium-label">Timezone</label>
                  <input className="input settings-premium-input" value={form.defaultTimezone || DEFAULT_WORKSPACE_TIMEZONE} onChange={(e) => setForm({ ...form, defaultTimezone: e.target.value })} />
                </div>
              </div>
              <label className="settings-premium-label">Locale code</label>
              <input className="input settings-premium-input" value={form.defaultLocale || DEFAULT_WORKSPACE_LOCALE} onChange={(e) => setForm({ ...form, defaultLocale: e.target.value })} />
              <div className="two-col">
                <div>
                  <label className="settings-premium-label">Public booking locale</label>
                  <input className="input settings-premium-input" data-testid="settings-public-booking-locale" value={form.publicBookingLocale || form.defaultLocale || DEFAULT_WORKSPACE_LOCALE} onChange={(e) => setForm({ ...form, publicBookingLocale: e.target.value })} />
                </div>
                <div>
                  <label className="settings-premium-label">Phone country default</label>
                  <input className="input settings-premium-input" data-testid="settings-phone-country-code" placeholder="+44" value={form.phoneCountryCode || ''} onChange={(e) => setForm({ ...form, phoneCountryCode: e.target.value })} />
                </div>
              </div>
              <label className="settings-premium-label">Support phone</label>
              <input className="input settings-premium-input" value={form.supportPhone || ''} onChange={(e) => setForm({ ...form, supportPhone: e.target.value })} />
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Operator defaults</h3>
              <p className="muted settings-premium-muted">Choose the first workspace view and keep navigation focused on the areas your team actually uses.</p>
              <label className="settings-premium-label">Default live board</label>
              <select
                className="input settings-premium-input"
                data-testid="settings-command-centre-default"
                value={workflowConfig.defaults?.commandCentreVersion || 'v2'}
                onChange={(e) => updateBusinessConfig((current) => ({
                  ...current,
                  defaults: { ...(current.defaults || {}), commandCentreVersion: e.target.value === 'v1' ? 'v1' : 'v2' },
                }))}
              >
                <option value="v2">Command Centre V2</option>
                <option value="v1">Command Centre V1</option>
              </select>

              {[
                ['showIntelligence', 'Show Intelligence in operator nav'],
                ['showPortalOps', 'Show Portal Ops in operator nav'],
                ['showTechnicianQueue', 'Show Assigned work queue in operator nav'],
              ].map(([key, label]) => (
                <label key={key} style={{ display: 'block', marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    checked={workflowConfig.navigation?.[key as 'showIntelligence'] !== false}
                    onChange={(e) => updateBusinessConfig((current) => ({
                      ...current,
                      navigation: { ...(current.navigation || {}), [key]: e.target.checked },
                    }))}
                    style={{ marginRight: 8 }}
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }} data-testid="settings-workspace-layout-card" {...getSectionProps('workspace-layout')}>
              <h3 style={{ marginTop: 0 }}>Workspace layout</h3>
              <p className="muted settings-premium-muted">
                Keep Live Work focused on active work only. Move saved board style and section visibility here instead of editing the live screen directly.
              </p>
              <label className="settings-premium-label">Default Live Work view</label>
              <select
                className="input settings-premium-input"
                data-testid="settings-command-centre-default-view"
                value={commandCentreLayout.defaultViewMode}
                onChange={(e) => updateBusinessConfig((current) => ({
                  ...current,
                  commandCentre: {
                    ...(current.commandCentre && typeof current.commandCentre === 'object' ? current.commandCentre : {}),
                    defaultViewMode: e.target.value === 'list' ? 'list' : 'kanban',
                  },
                }))}
              >
                <option value="kanban">Board</option>
                <option value="list">List</option>
              </select>
              <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                {commandCentreLayout.sectionOrder.map((sectionKey, index) => {
                  const hidden = commandCentreLayout.hiddenSections.includes(sectionKey);
                  const meta = COMMAND_CENTRE_LAYOUT_SECTION_META[sectionKey];
                  return (
                    <div
                      key={sectionKey}
                      className="integration-card"
                      data-testid={`settings-command-centre-layout-row-${sectionKey}`}
                      style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}
                    >
                      <div>
                        <strong>{meta.title}</strong>
                        <p className="muted settings-premium-muted" style={{ margin: '4px 0 0 0' }}>{meta.description}</p>
                        <p className="muted settings-premium-muted" style={{ margin: '4px 0 0 0' }}>{hidden ? 'Hidden from the saved Live Work layout' : 'Shown on the saved Live Work layout'}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          className="button secondary"
                          type="button"
                          disabled={index === 0}
                          onClick={() => updateBusinessConfig((current) => {
                            const commandCentre = current.commandCentre && typeof current.commandCentre === 'object' ? current.commandCentre : {};
                            const currentOrder = Array.isArray((commandCentre as any).sectionOrder)
                              ? (commandCentre as any).sectionOrder
                              : commandCentreLayout.sectionOrder;
                            const nextOrder = [...currentOrder];
                            const currentIndex = nextOrder.indexOf(sectionKey);
                            if (currentIndex > 0) {
                              [nextOrder[currentIndex - 1], nextOrder[currentIndex]] = [nextOrder[currentIndex], nextOrder[currentIndex - 1]];
                            }
                            return { ...current, commandCentre: { ...commandCentre, sectionOrder: nextOrder } };
                          })}
                        >
                          Move up
                        </button>
                        <button
                          className="button secondary"
                          type="button"
                          disabled={index === commandCentreLayout.sectionOrder.length - 1}
                          onClick={() => updateBusinessConfig((current) => {
                            const commandCentre = current.commandCentre && typeof current.commandCentre === 'object' ? current.commandCentre : {};
                            const currentOrder = Array.isArray((commandCentre as any).sectionOrder)
                              ? (commandCentre as any).sectionOrder
                              : commandCentreLayout.sectionOrder;
                            const nextOrder = [...currentOrder];
                            const currentIndex = nextOrder.indexOf(sectionKey);
                            if (currentIndex >= 0 && currentIndex < nextOrder.length - 1) {
                              [nextOrder[currentIndex + 1], nextOrder[currentIndex]] = [nextOrder[currentIndex], nextOrder[currentIndex + 1]];
                            }
                            return { ...current, commandCentre: { ...commandCentre, sectionOrder: nextOrder } };
                          })}
                        >
                          Move down
                        </button>
                        {meta.hideable ? (
                          <button
                            className="button secondary"
                            type="button"
                            onClick={() => updateBusinessConfig((current) => {
                              const commandCentre = current.commandCentre && typeof current.commandCentre === 'object' ? current.commandCentre : {};
                              const currentHidden = Array.isArray((commandCentre as any).hiddenSections)
                                ? (commandCentre as any).hiddenSections
                                : commandCentreLayout.hiddenSections;
                              const nextHidden = currentHidden.includes(sectionKey)
                                ? currentHidden.filter((item: string) => item !== sectionKey)
                                : [...currentHidden, sectionKey];
                              return { ...current, commandCentre: { ...commandCentre, hiddenSections: nextHidden } };
                            })}
                          >
                            {hidden ? 'Show section' : 'Hide section'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button
                  className="button secondary settings-premium-button"
                  type="button"
                  data-testid="settings-command-centre-layout-reset"
                  onClick={() => updateBusinessConfig((current) => ({
                    ...current,
                    commandCentre: {
                      ...(current.commandCentre && typeof current.commandCentre === 'object' ? current.commandCentre : {}),
                      sectionOrder: [...COMMAND_CENTRE_SECTION_KEYS],
                      hiddenSections: [],
                      defaultViewMode: 'kanban',
                    },
                  }))}
                >
                  Reset Live Work layout
                </button>
                <Link className="button secondary settings-premium-button" href="/dashboard/command-centre-v2">
                  Open Live Work
                </Link>
              </div>
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Dashboard & analytics layout</h3>
              <p className="muted settings-premium-muted">
                Keep Analytics focused on insight. Change the saved default time window and which panels show up from here.
              </p>
              <label className="settings-premium-label">Default analytics window</label>
              <select
                className="input settings-premium-input"
                data-testid="settings-analytics-window-default"
                value={analyticsLayout.defaultWindowDays}
                onChange={(e) => updateBusinessConfig((current) => ({
                  ...current,
                  analytics: {
                    ...(current.analytics && typeof current.analytics === 'object' ? current.analytics : {}),
                    defaultWindowDays: Number(e.target.value || 30),
                  },
                }))}
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
              <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                {analyticsLayout.widgetOrder.map((widgetKey, index) => {
                  const hidden = analyticsLayout.hiddenWidgets.includes(widgetKey);
                  const meta = ANALYTICS_LAYOUT_WIDGET_META[widgetKey];
                  return (
                    <div
                      key={widgetKey}
                      className="integration-card"
                      data-testid={`settings-analytics-layout-row-${widgetKey}`}
                      style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}
                    >
                      <div>
                        <strong>{meta.title}</strong>
                        <p className="muted settings-premium-muted" style={{ margin: '4px 0 0 0' }}>{meta.description}</p>
                        <p className="muted settings-premium-muted" style={{ margin: '4px 0 0 0' }}>{hidden ? 'Hidden from Analytics' : 'Shown on Analytics'}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          className="button secondary"
                          type="button"
                          disabled={index === 0}
                          onClick={() => updateBusinessConfig((current) => {
                            const analytics = current.analytics && typeof current.analytics === 'object' ? current.analytics : {};
                            const currentOrder = Array.isArray((analytics as any).widgetOrder)
                              ? (analytics as any).widgetOrder
                              : analyticsLayout.widgetOrder;
                            const nextOrder = [...currentOrder];
                            const currentIndex = nextOrder.indexOf(widgetKey);
                            if (currentIndex > 0) {
                              [nextOrder[currentIndex - 1], nextOrder[currentIndex]] = [nextOrder[currentIndex], nextOrder[currentIndex - 1]];
                            }
                            return { ...current, analytics: { ...analytics, widgetOrder: nextOrder } };
                          })}
                        >
                          Move up
                        </button>
                        <button
                          className="button secondary"
                          type="button"
                          disabled={index === analyticsLayout.widgetOrder.length - 1}
                          onClick={() => updateBusinessConfig((current) => {
                            const analytics = current.analytics && typeof current.analytics === 'object' ? current.analytics : {};
                            const currentOrder = Array.isArray((analytics as any).widgetOrder)
                              ? (analytics as any).widgetOrder
                              : analyticsLayout.widgetOrder;
                            const nextOrder = [...currentOrder];
                            const currentIndex = nextOrder.indexOf(widgetKey);
                            if (currentIndex >= 0 && currentIndex < nextOrder.length - 1) {
                              [nextOrder[currentIndex + 1], nextOrder[currentIndex]] = [nextOrder[currentIndex], nextOrder[currentIndex + 1]];
                            }
                            return { ...current, analytics: { ...analytics, widgetOrder: nextOrder } };
                          })}
                        >
                          Move down
                        </button>
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => updateBusinessConfig((current) => {
                            const analytics = current.analytics && typeof current.analytics === 'object' ? current.analytics : {};
                            const currentHidden = Array.isArray((analytics as any).hiddenWidgets)
                              ? (analytics as any).hiddenWidgets
                              : analyticsLayout.hiddenWidgets;
                            const nextHidden = currentHidden.includes(widgetKey)
                              ? currentHidden.filter((item: string) => item !== widgetKey)
                              : [...currentHidden, widgetKey];
                            return { ...current, analytics: { ...analytics, hiddenWidgets: nextHidden } };
                          })}
                        >
                          {hidden ? 'Show panel' : 'Hide panel'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button
                  className="button secondary settings-premium-button"
                  type="button"
                  data-testid="settings-analytics-layout-reset"
                  onClick={() => updateBusinessConfig((current) => ({
                    ...current,
                    analytics: {
                      ...(current.analytics && typeof current.analytics === 'object' ? current.analytics : {}),
                      widgetOrder: [...ANALYTICS_WIDGET_KEYS],
                      hiddenWidgets: [],
                      defaultWindowDays: 30,
                    },
                  }))}
                >
                  Reset layout
                </button>
                <Link className="button secondary settings-premium-button" href="/dashboard/analytics">
                  Open Analytics
                </Link>
              </div>
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Branding</h3>
              <p className="muted settings-premium-muted">Keep the workspace and customer outputs visually consistent from one place.</p>
              <label className="settings-premium-label">Logo link</label>
              <input className="input settings-premium-input" value={form.logoUrl || ''} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />

              <label className="settings-premium-label" htmlFor="tenant-logo-file">Upload logo (PNG, JPEG, or WebP)</label>
              <input id="tenant-logo-file" data-testid="tenant-logo-file-input" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => {
                const nextFile = e.target.files?.[0] || null;
                const validationError = nextFile ? validateUploadFile(nextFile, { category: 'image', maxBytes: UPLOAD_LIMITS.logo }) : null;
                if (validationError) {
                  showError(validationError);
                  e.target.value = '';
                  return;
                }
                if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
                setLogoFile(validationError ? null : nextFile);
                setLogoPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : '');
              }} />
              <div className="integration-card" style={{ marginTop: 8 }}>
                <label className="button secondary" htmlFor="tenant-logo-file">Choose image</label>
                <span data-testid="tenant-logo-file-name">{logoFile ? logoFile.name : 'No image selected'}</span>
              </div>
              {logoFile ? (
                <div className="integration-card" data-testid="logo-file-selection" style={{ marginTop: 10 }}>
                  {logoPreviewUrl ? (
                    <img src={logoPreviewUrl} alt="Selected logo preview" style={{ width: 180, height: 90, objectFit: 'contain' }} />
                  ) : null}
                  <div>
                    <strong>{logoFile.name}</strong>
                    <p className="muted" style={{ margin: '4px 0' }}>{(logoFile.size / 1024).toFixed(1)} KB selected</p>
                    <button className="button secondary" type="button" onClick={() => {
                      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
                      setLogoPreviewUrl('');
                      setLogoFile(null);
                    }}>Clear</button>
                  </div>
                </div>
              ) : form.logoUrl ? (
                <div className="integration-card" data-testid="saved-logo-preview" style={{ marginTop: 10 }}>
                  <img src={form.logoUrl} alt="Current business logo" style={{ width: 180, height: 90, objectFit: 'contain' }} />
                  <span className="muted">Saved logo</span>
                </div>
              ) : null}

              <div className="two-col">
                <div>
                  <label className="settings-premium-label">Main color</label>
                  <input className="input settings-premium-input" type="color" value={form.brandPrimaryColor || '#4fd1c5'} onChange={(e) => setForm({ ...form, brandPrimaryColor: e.target.value })} />
                </div>
                <div>
                  <label className="settings-premium-label">Second color</label>
                  <input className="input settings-premium-input" type="color" value={form.brandSecondaryColor || '#1a1f36'} onChange={(e) => setForm({ ...form, brandSecondaryColor: e.target.value })} />
                </div>
              </div>

              <label className="settings-premium-label">Accent color</label>
              <input className="input settings-premium-input" type="color" value={form.brandAccentColor || '#4fd1c5'} onChange={(e) => setForm({ ...form, brandAccentColor: e.target.value })} />

              <label className="settings-premium-label">Default look</label>
              <select className="input settings-premium-input" value={form.brandDefaultMode || 'dark'} onChange={(e) => setForm({ ...form, brandDefaultMode: e.target.value })}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>

              <div className="theme-preview" style={{ background: preview.secondary }}>
                <strong style={{ color: preview.primary }}>Preview header</strong>
                <p style={{ color: preview.accent, marginBottom: 0 }}>Preview accent text</p>
              </div>

              <button
                className="button settings-premium-button"
                type="button"
                disabled={!logoFile && !String(form.logoUrl || '').trim()}
                onClick={uploadLogo}
                style={{ marginTop: 12 }}
              >
                {logoFile ? 'Upload logo' : 'Save logo'}
              </button>
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Finance and tax defaults</h3>
              <p className="muted settings-premium-muted">Set the defaults new jobs and invoices inherit. This supports records and exports, not tax advice.</p>
              <label className="settings-premium-label">
                <input
                  type="checkbox"
                  checked={Boolean(form.vatEnabledDefault)}
                  onChange={(e) => setForm({ ...form, vatEnabledDefault: e.target.checked })}
                  style={{ marginRight: 8 }}
                />
                Turn VAT on by default
              </label>

              <div className="two-col">
                <div>
                  <label className="settings-premium-label">VAT rate (for example 2000 = 20%)</label>
                  <input className="input settings-premium-input" type="number" min={0} value={form.vatRateBpsDefault || 0} onChange={(e) => setForm({ ...form, vatRateBpsDefault: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="settings-premium-label">Currency</label>
                  <input className="input settings-premium-input" value={form.defaultCurrency || DEFAULT_WORKSPACE_CURRENCY} onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value.toUpperCase() })} />
                </div>
                <div>
                  <label className="settings-premium-label">Invoice currency</label>
                  <input className="input settings-premium-input" data-testid="settings-invoice-currency" value={form.invoiceCurrency || form.defaultCurrency || DEFAULT_WORKSPACE_CURRENCY} onChange={(e) => setForm({ ...form, invoiceCurrency: e.target.value.toUpperCase() })} />
                </div>
              </div>
              <label className="settings-premium-label">Tax label</label>
              <input className="input settings-premium-input" data-testid="settings-tax-label" placeholder="VAT, GST, sales tax" value={form.taxLabel || ''} onChange={(e) => setForm({ ...form, taxLabel: e.target.value })} />
              <label className="settings-premium-label">Invoice legal footer</label>
              <textarea className="input settings-premium-input" rows={3} value={form.invoiceLegalFooter || ''} onChange={(e) => setForm({ ...form, invoiceLegalFooter: e.target.value })} />

              <div className="two-col">
                <div>
                  <label className="settings-premium-label">VAT number</label>
                  <input
                    className="input settings-premium-input"
                    value={String(form.businessConfigJson?.finance?.vatNumber || '')}
                    onChange={(e) => updateBusinessConfig((current) => ({
                      ...current,
                      finance: {
                        ...(current.finance && typeof current.finance === 'object' ? current.finance : {}),
                        vatNumber: e.target.value,
                      },
                    }))}
                  />
                </div>
                <div>
                  <label className="settings-premium-label">Default VAT category</label>
                  <input
                    className="input settings-premium-input"
                    value={String(form.businessConfigJson?.finance?.defaultVatCategory || '')}
                    onChange={(e) => updateBusinessConfig((current) => ({
                      ...current,
                      finance: {
                        ...(current.finance && typeof current.finance === 'object' ? current.finance : {}),
                        defaultVatCategory: e.target.value,
                      },
                    }))}
                  />
                </div>
              </div>

              <div className="two-col">
                <div>
                  <label className="settings-premium-label">Invoice number prefix</label>
                  <input
                    className="input settings-premium-input"
                    value={String(form.businessConfigJson?.finance?.invoiceNumberPrefix || '')}
                    onChange={(e) => updateBusinessConfig((current) => ({
                      ...current,
                      finance: {
                        ...(current.finance && typeof current.finance === 'object' ? current.finance : {}),
                        invoiceNumberPrefix: e.target.value,
                      },
                    }))}
                  />
                </div>
                <div>
                  <label className="settings-premium-label">Payment terms in days</label>
                  <input
                    className="input settings-premium-input"
                    type="number"
                    min={0}
                    value={Number(form.businessConfigJson?.finance?.paymentTermsDays || 7)}
                    onChange={(e) => updateBusinessConfig((current) => ({
                      ...current,
                      finance: {
                        ...(current.finance && typeof current.finance === 'object' ? current.finance : {}),
                        paymentTermsDays: Number(e.target.value || 0),
                      },
                    }))}
                  />
                </div>
              </div>
              <p className="muted settings-premium-muted" style={{ marginBottom: 0 }}>
                Payment provider setup is managed from Settings → Payments so tenant-owned customer collection stays separate from MyTitan subscription billing.
              </p>
            </div>

            <div className="card settings-premium-card">
              <h3 style={{ marginTop: 0 }}>Setup tools</h3>
              <p className="muted settings-premium-muted">Use setup to guide the workspace without changing saved config paths.</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <button
                  type="button"
                  className={`button settings-premium-button ${themeMode === 'light' ? '' : 'secondary'}`}
                  data-testid="settings-theme-light"
                  disabled={Boolean(themeSaving)}
                  onClick={() => updateThemeMode('light')}
                >
                  {themeSaving === 'light' ? 'Saving light theme...' : 'Light workspace'}
                </button>
                <button
                  type="button"
                  className={`button settings-premium-button ${themeMode === 'dark' ? '' : 'secondary'}`}
                  data-testid="settings-theme-dark"
                  disabled={Boolean(themeSaving)}
                  onClick={() => updateThemeMode('dark')}
                >
                  {themeSaving === 'dark' ? 'Saving dark theme...' : 'Dark workspace'}
                </button>
                <button
                  type="button"
                  className={`button settings-premium-button ${themeMode === 'system' ? '' : 'secondary'}`}
                  data-testid="settings-theme-system"
                  disabled={Boolean(themeSaving)}
                  onClick={() => updateThemeMode('system')}
                >
                  {themeSaving === 'system' ? 'Saving device setting...' : 'Use device setting'}
                </button>
                <button type="button" className="button secondary settings-premium-button" onClick={restartDemoTour}>
                  Restart product tour
                </button>
                {guidedSetupEnabled ? (
                  <button className="button secondary settings-premium-button" type="button" onClick={runGuidedSetup}>
                    {settings?.guidedSetupCompletedAt ? 'Review setup' : 'Finish setup'}
                  </button>
                ) : null}
              </div>
            </div>
          </>
        )}

        {tab === 'output' && (
          <>
            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Job output ownership</h3>
              <p className="muted settings-premium-muted">This is the single home for the customer-safe service record chain. Submitted job records still drive email, PDF, portal content, and completion messaging.</p>
              <label className="settings-premium-label">Default WhatsApp completion message</label>
              <textarea
                className="input settings-premium-input"
                rows={4}
                value={form.whatsappTemplateDefault || ''}
                onChange={(e) => setForm({ ...form, whatsappTemplateDefault: e.target.value })}
                placeholder="Hi {{name}}, your service for {{jobRef}} was completed on {{completedDate}}."
              />
              <p className="muted settings-premium-muted" style={{ marginBottom: 0 }}>
                Use this as the default completion message when operators choose WhatsApp from a submitted job.
              </p>
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Service record delivery</h3>
              <p className="muted settings-premium-muted">Choose what customers receive when a submitted job sheet publishes its service record. Customer-safe sections stay on by default and internal-only notes stay out.</p>

              <label className="settings-premium-label">Default recipients</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                <input
                  className="input settings-premium-input"
                  data-testid="service-record-recipient-input"
                  type="email"
                  placeholder="customer@example.com"
                  value={serviceRecordRecipientDraft}
                  onChange={(e) => setServiceRecordRecipientDraft(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addServiceRecordRecipient();
                    }
                  }}
                />
                <button className="button secondary" type="button" data-testid="service-record-recipient-add" onClick={addServiceRecordRecipient}>
                  Add
                </button>
              </div>
              <div data-testid="service-record-recipient-list" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {serviceRecordEmailSettings.defaultRecipients.length === 0 ? (
                  <span className="muted">No default recipients yet.</span>
                ) : (
                  serviceRecordEmailSettings.defaultRecipients.map((email) => (
                    <span key={email} className="badge" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      {email}
                      <button
                        type="button"
                        className="button ghost"
                        data-testid={`service-record-recipient-remove-${email}`}
                        onClick={() => removeServiceRecordRecipient(email)}
                        style={{ padding: '2px 8px' }}
                      >
                        Remove
                      </button>
                    </span>
                  ))
                )}
              </div>

              <div className="two-col">
                <label className="settings-premium-label">
                  <input
                    type="checkbox"
                    checked={serviceRecordEmailSettings.includeJobCustomerEmail}
                    onChange={(e) => updateServiceRecordEmailConfig((current) => ({ ...current, includeJobCustomerEmail: e.target.checked }))}
                    style={{ marginRight: 8 }}
                  />
                  Send to the job customer email when present
                </label>
                <label className="settings-premium-label">
                  <input
                    type="checkbox"
                    checked={serviceRecordEmailSettings.includeBusinessDetails}
                    onChange={(e) => updateServiceRecordEmailConfig((current) => ({ ...current, includeBusinessDetails: e.target.checked }))}
                    style={{ marginRight: 8 }}
                  />
                  Include business details
                </label>
                <label className="settings-premium-label">
                  <input
                    type="checkbox"
                    checked={serviceRecordEmailSettings.includeContactDetails}
                    onChange={(e) => updateServiceRecordEmailConfig((current) => ({ ...current, includeContactDetails: e.target.checked }))}
                    style={{ marginRight: 8 }}
                  />
                  Include contact details
                </label>
                <label className="settings-premium-label">
                  <input
                    type="checkbox"
                    checked={serviceRecordEmailSettings.includeBillingDetails}
                    onChange={(e) => updateServiceRecordEmailConfig((current) => ({ ...current, includeBillingDetails: e.target.checked }))}
                    style={{ marginRight: 8 }}
                  />
                  Include billing details
                </label>
                <label className="settings-premium-label">
                  <input
                    type="checkbox"
                    checked={serviceRecordEmailSettings.includePaymentSummary}
                    onChange={(e) => updateServiceRecordEmailConfig((current) => ({ ...current, includePaymentSummary: e.target.checked }))}
                    style={{ marginRight: 8 }}
                  />
                  Include payment summary
                </label>
                <label className="settings-premium-label">
                  <input
                    type="checkbox"
                    checked={serviceRecordEmailSettings.includeEvidenceSummary}
                    onChange={(e) => updateServiceRecordEmailConfig((current) => ({ ...current, includeEvidenceSummary: e.target.checked }))}
                    style={{ marginRight: 8 }}
                  />
                  Include evidence summary
                </label>
                <label className="settings-premium-label">
                  <input
                    type="checkbox"
                    checked={serviceRecordEmailSettings.includeSignatureSummary}
                    onChange={(e) => updateServiceRecordEmailConfig((current) => ({ ...current, includeSignatureSummary: e.target.checked }))}
                    style={{ marginRight: 8 }}
                  />
                  Include signatures
                </label>
                <label className="settings-premium-label">
                  <input
                    type="checkbox"
                    checked={serviceRecordEmailSettings.includePortalLink}
                    onChange={(e) => updateServiceRecordEmailConfig((current) => ({ ...current, includePortalLink: e.target.checked }))}
                    style={{ marginRight: 8 }}
                  />
                  Include customer portal link
                </label>
                <label className="settings-premium-label">
                  <input
                    type="checkbox"
                    checked={serviceRecordEmailSettings.includePdfLink}
                    onChange={(e) => updateServiceRecordEmailConfig((current) => ({ ...current, includePdfLink: e.target.checked }))}
                    style={{ marginRight: 8 }}
                  />
                  Include PDF link
                </label>
              </div>

              <label className="settings-premium-label" style={{ marginTop: 16 }}>
                <input
                  type="checkbox"
                  checked={serviceRecordEmailSettings.signatureEnabled}
                  onChange={(e) => updateServiceRecordEmailConfig((current) => ({ ...current, signatureEnabled: e.target.checked }))}
                  style={{ marginRight: 8 }}
                />
                Append email signature / footer
              </label>
              <textarea
                className="input settings-premium-input"
                data-testid="service-record-signature-input"
                rows={4}
                placeholder="Thanks for choosing MyTitan."
                value={serviceRecordEmailSettings.signatureText || ''}
                onChange={(e) => updateServiceRecordEmailConfig((current) => ({ ...current, signatureText: e.target.value || null }))}
              />
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }} data-testid="customer-feedback-settings-card">
              <h3 style={{ marginTop: 0 }}>Customer feedback follow-up</h3>
              <p className="muted settings-premium-muted">
                Optionally add a feedback prompt after completed work. This only appears when you enable it, and the service record email keeps using the current workspace sender or MyTitan fallback path.
              </p>
              <label className="settings-premium-label">
                <input
                  type="checkbox"
                  checked={customerFeedbackSettings.enabled}
                  onChange={(e) => updateBusinessConfig((current) => ({
                    ...current,
                    customerFeedback: {
                      ...(current.customerFeedback || {}),
                      enabled: e.target.checked,
                    },
                  }))}
                  style={{ marginRight: 8 }}
                />
                Ask for a rating or review after completed work
              </label>
              <label className="settings-premium-label">Feedback prompt</label>
              <textarea
                className="input settings-premium-input"
                data-testid="customer-feedback-prompt-input"
                rows={3}
                value={customerFeedbackSettings.promptText || ""}
                onChange={(e) => updateBusinessConfig((current) => ({
                  ...current,
                  customerFeedback: {
                    ...(current.customerFeedback || {}),
                    promptText: e.target.value || null,
                  },
                }))}
                placeholder="If the work went well, you can leave a quick rating or review for the team."
              />
              <label className="settings-premium-label">Public review URL</label>
              <input
                className="input settings-premium-input"
                data-testid="customer-feedback-review-url-input"
                type="url"
                value={customerFeedbackSettings.publicReviewUrl || ""}
                onChange={(e) => updateBusinessConfig((current) => ({
                  ...current,
                  customerFeedback: {
                    ...(current.customerFeedback || {}),
                    publicReviewUrl: e.target.value || null,
                  },
                }))}
                placeholder="https://..."
              />
              <label className="settings-premium-label">Thank-you line</label>
              <input
                className="input settings-premium-input"
                data-testid="customer-feedback-thank-you-input"
                value={customerFeedbackSettings.thankYouText || ""}
                onChange={(e) => updateBusinessConfig((current) => ({
                  ...current,
                  customerFeedback: {
                    ...(current.customerFeedback || {}),
                    thankYouText: e.target.value || null,
                  },
                }))}
                placeholder="Thanks for taking a moment to share feedback with the team."
              />
            </div>

            <div className="card settings-premium-card">
              <h3 style={{ marginTop: 0 }}>Customer-facing labels</h3>
              <p className="muted settings-premium-muted">Keep customer wording aligned with the rest of the workspace from the output owner’s point of view.</p>
              <label className="settings-premium-label">Customers label</label>
              <input
                className="input settings-premium-input"
                value={workflowConfig.terminology?.customers || ''}
                onChange={(e) => updateBusinessConfig((current) => ({
                  ...current,
                  terminology: { ...(current.terminology || {}), customers: e.target.value || null },
                }))}
                placeholder="Customers"
              />
            </div>
          </>
        )}

        {tab === 'messages' && (
          <>
            <div className="card settings-premium-card" style={{ marginBottom: 12 }} data-testid="settings-workspace-email-card" {...getSectionProps('channel-email')}>
              <h3 style={{ marginTop: 0 }}>Workspace customer email</h3>
              <p className="muted settings-premium-muted">Keep your workspace sender blank until you are ready. Customer emails can be sent by MyTitan until you add your own sending email.</p>
              <label className="settings-premium-label">Name people see</label>
              <input className="input settings-premium-input" value={form.emailSenderName || ''} onChange={(e) => setForm({ ...form, emailSenderName: e.target.value })} />

              <label className="settings-premium-label">Reply-to email</label>
              <input className="input settings-premium-input" type="email" value={form.emailReplyTo || ''} onChange={(e) => setForm({ ...form, emailReplyTo: e.target.value })} />
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }} data-testid="internal-notification-recipients-card" {...getSectionProps('notifications-email')}>
              <h3 style={{ marginTop: 0 }}>Internal notification recipients</h3>
              <p className="muted settings-premium-muted">Internal updates will be sent to these addresses. Leave this blank if only workspace owners and admins should receive fallback internal alerts.</p>
              <div style={{ display: 'grid', gap: 12 }}>
                {internalNotificationDrafts.length ? internalNotificationDrafts.map((recipient, index) => (
                  <div key={`internal-recipient-${index}`} className="card" style={{ padding: 12, background: 'rgba(148, 163, 184, 0.08)' }}>
                    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', alignItems: 'end' }}>
                      <div>
                        <label className="settings-premium-label">Email</label>
                        <input
                          className="input settings-premium-input"
                          type="email"
                          value={recipient.email}
                          data-testid={`internal-recipient-email-${index}`}
                          onChange={(e) => updateInternalRecipient(index, (current) => ({ ...current, email: e.target.value }))}
                          placeholder="ops@example.com"
                        />
                      </div>
                      <div>
                        <label className="settings-premium-label">Label</label>
                        <input
                          className="input settings-premium-input"
                          value={recipient.label || ''}
                          data-testid={`internal-recipient-label-${index}`}
                          onChange={(e) => updateInternalRecipient(index, (current) => ({ ...current, label: e.target.value || null }))}
                          placeholder="Bookings desk"
                        />
                      </div>
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                      <input
                        type="checkbox"
                        checked={recipient.enabled !== false}
                        data-testid={`internal-recipient-enabled-${index}`}
                        onChange={(e) => updateInternalRecipient(index, (current) => ({ ...current, enabled: e.target.checked }))}
                      />
                      Enabled
                    </label>
                    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                      {INTERNAL_NOTIFICATION_CATEGORIES.map((category) => {
                        const checked = recipient.categories.includes(category);
                        return (
                          <label key={`${index}-${category}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              data-testid={`internal-recipient-category-${index}-${category}`}
                              onChange={(e) => updateInternalRecipient(index, (current) => ({
                                ...current,
                                categories: e.target.checked
                                  ? Array.from(new Set([...current.categories, category]))
                                  : current.categories.filter((value) => value !== category),
                              }))}
                            />
                            {INTERNAL_NOTIFICATION_CATEGORY_LABELS[category]}
                          </label>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <p className="muted settings-premium-muted" style={{ margin: 0 }}>
                        Non-routable addresses such as `.local`, `.test`, and `localhost` are ignored.
                      </p>
                      <button
                        className="button secondary"
                        type="button"
                        data-testid={`internal-recipient-remove-${index}`}
                        onClick={() => removeInternalRecipient(index)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )) : (
                  <p className="muted settings-premium-muted" data-testid="internal-recipient-empty-state" style={{ margin: 0 }}>
                    No extra recipients yet. Workspace owners and admins remain the fallback for internal alerts.
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                <p className="muted settings-premium-muted" style={{ margin: 0 }}>
                  Saved active recipients: {internalNotificationSettings.internalRecipients.filter((recipient) => recipient.enabled).length}
                </p>
                <button className="button secondary" type="button" data-testid="internal-recipient-add" onClick={addInternalRecipient}>
                  Add recipient
                </button>
              </div>
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }} data-testid="summary-email-settings-card" {...getSectionProps('summary-email')}>
              <h3 style={{ marginTop: 0 }}>Summary emails</h3>
              <p className="muted settings-premium-muted">
                Choose which business summaries your team should receive.
              </p>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={summaryEmailSettings.enabled}
                  data-testid="summary-email-enabled"
                  onChange={(e) => updateSummaryEmailConfig((current) => ({ ...current, enabled: e.target.checked }))}
                />
                Enable summary emails
              </label>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginTop: 12 }}>
                {SUMMARY_EMAIL_CADENCES.map((cadence) => {
                  const checked = summaryEmailSettings.enabledCadences.includes(cadence);
                  return (
                    <label key={cadence} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        data-testid={`summary-email-cadence-${cadence}`}
                        onChange={(e) => updateSummaryEmailConfig((current) => ({
                          ...current,
                          enabledCadences: e.target.checked
                            ? Array.from(new Set([...(Array.isArray(current.enabledCadences) ? current.enabledCadences : []), cadence]))
                            : (Array.isArray(current.enabledCadences) ? current.enabledCadences : []).filter((value: string) => value !== cadence),
                        }))}
                      />
                      {SUMMARY_EMAIL_CADENCE_LABELS[cadence]}
                    </label>
                  );
                })}
              </div>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 12 }}>
                {SUMMARY_EMAIL_SECTIONS.map((section) => {
                  const checked = summaryEmailSettings.enabledSections.includes(section);
                  return (
                    <label key={section} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        data-testid={`summary-email-section-${section}`}
                        onChange={(e) => updateSummaryEmailConfig((current) => ({
                          ...current,
                          enabledSections: e.target.checked
                            ? Array.from(new Set([...(Array.isArray(current.enabledSections) ? current.enabledSections : []), section]))
                            : (Array.isArray(current.enabledSections) ? current.enabledSections : []).filter((value: string) => value !== section),
                        }))}
                      />
                      {SUMMARY_EMAIL_SECTION_LABELS[section]}
                    </label>
                  );
                })}
              </div>
              <div style={{ marginTop: 12 }}>
                <p className="muted settings-premium-muted" data-testid="summary-email-runtime-note" style={{ marginBottom: 6 }}>
                  {summaryEmailSettings.enabled ? 'Summary delivery is enabled for the selected schedule.' : 'Turn on summary emails to start delivery.'}
                </p>
                <p className="muted settings-premium-muted" data-testid="summary-email-sender-status" style={{ marginBottom: 6 }}>
                  System sender: {summaryReadiness?.sender?.status === 'ready' ? 'Ready' : summaryReadiness?.sender?.status === 'failing' ? 'Configured but failing' : summaryReadiness?.sender?.status === 'misconfigured' ? 'Needs attention' : 'Not set up'}
                </p>
                <p className="muted settings-premium-muted" data-testid="summary-email-recipient-count" style={{ marginBottom: 0 }}>
                  Summary recipients today: {summaryReadiness?.recipientCount ?? 0}
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                <p className="muted settings-premium-muted" style={{ margin: 0 }}>
                  Last sent: {summaryEmailSettings.lastDispatchedAtByCadence?.[summaryEmailSettings.enabledCadences[0] || 'weekly'] || 'Not sent yet'}
                </p>
                <button className="button secondary" type="button" data-testid="summary-email-preview" onClick={previewSummaryEmails} disabled={previewingSummary}>
                  {previewingSummary ? 'Preparing…' : 'Preview summary'}
                </button>
              </div>
              {summaryPreview?.preview ? (
                <div className="card" style={{ marginTop: 12, padding: 12, background: 'rgba(148, 163, 184, 0.08)' }} data-testid="summary-email-preview-output">
                  <strong>{summaryPreview.preview.subject}</strong>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0 0', fontFamily: 'inherit' }}>{summaryPreview.preview.text}</pre>
                </div>
              ) : null}
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }} {...getSectionProps('ops-alerts')}>
              <h3 style={{ marginTop: 0 }}>External ops alerts</h3>
              <p className="muted settings-premium-muted">
                Send platform-safe operational alerts through the MyTitan system sender. Active verified workspace owners/admins are always included automatically. Extra recipients are optional and only used for the categories you enable below, including uptime-style health checks and backup alerts.
              </p>
              <label className="settings-premium-label">Optional extra ops recipient emails</label>
              <input
                className="input settings-premium-input"
                data-testid="ops-alert-recipient-input"
                value={operationalAlertSettings.externalEmailRecipients.join(', ')}
                onChange={(e) =>
                  updateOperationalAlertConfig((current) => ({
                    ...current,
                    externalEmailRecipients: e.target.value
                      .split(',')
                      .map((value) => value.trim().toLowerCase())
                      .filter(Boolean),
                  }))
                }
                placeholder="ops@example.com, incidents@example.com"
              />
              <p className="muted settings-premium-muted" style={{ marginTop: 8, marginBottom: 0 }}>
                Owner/admin recipients are resolved live from your current workspace team. Removed, disabled, unverified, or non-owner/admin users stop receiving these alerts automatically.
              </p>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 12 }}>
                {OPERATIONAL_ALERT_CATEGORIES.map((category) => {
                  const checked = operationalAlertSettings.enabledCategories.includes(category);
                  return (
                    <label key={category} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        data-testid={`ops-alert-category-${category}`}
                        onChange={(e) =>
                          updateOperationalAlertConfig((current) => ({
                            ...current,
                            enabledCategories: e.target.checked
                              ? Array.from(new Set([...(Array.isArray(current.enabledCategories) ? current.enabledCategories : []), category]))
                              : (Array.isArray(current.enabledCategories) ? current.enabledCategories : []).filter((value: string) => value !== category),
                          }))
                        }
                      />
                      {OPERATIONAL_ALERT_CATEGORY_LABELS[category]}
                    </label>
                  );
                })}
              </div>
              <div style={{ marginTop: 12 }} data-testid="ops-alert-status-card">
                <p className="muted settings-premium-muted" style={{ marginBottom: 6 }}>
                  System sender: {opsAlertStatus?.systemSender?.status === 'ready' ? 'Ready' : opsAlertStatus?.systemSender?.status === 'failing' ? 'Configured but failing' : opsAlertStatus?.systemSender?.status === 'misconfigured' ? 'Needs attention' : 'Not set up'}
                </p>
                <p className="muted settings-premium-muted" style={{ marginBottom: 6 }}>
                  Automatic owner/admin recipients: {opsAlertStatus?.ownerAdminRecipientCount ?? 0}
                </p>
                <p className="muted settings-premium-muted" style={{ marginBottom: 6 }}>
                  Optional extra recipients: {opsAlertStatus?.extraRecipientCount ?? 0}
                </p>
                <p className="muted settings-premium-muted" style={{ marginBottom: 6 }}>
                  Resolved recipient count for critical health alerts: {opsAlertStatus?.resolvedRecipientCount ?? 0}
                </p>
                <p className="muted settings-premium-muted" style={{ marginBottom: 0 }}>
                  Active owner and admin recipients are included automatically. Extra recipients are optional.
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                <p className="muted settings-premium-muted" style={{ margin: 0 }}>
                  Smoke test target counts only: {opsAlertSmokeResult?.ownerAdminRecipientCount ?? opsAlertStatus?.ownerAdminRecipientCount ?? 0} owner/admin, {opsAlertSmokeResult?.extraRecipientCount ?? opsAlertStatus?.extraRecipientCount ?? 0} extra
                </p>
                <button className="button secondary" type="button" data-testid="ops-alert-smoke-test" onClick={sendOperationalAlertSmokeTest} disabled={sendingOpsAlertSmoke}>
                  {sendingOpsAlertSmoke ? 'Sending…' : 'Send smoke test'}
                </button>
              </div>
              {opsAlertSmokeResult ? (
                <div className="card" style={{ marginTop: 12, padding: 12, background: 'rgba(148, 163, 184, 0.08)' }} data-testid="ops-alert-smoke-result">
                  <p className="muted settings-premium-muted" style={{ margin: 0 }}>
                    Smoke test sent: {opsAlertSmokeResult.resolvedExternalRecipientCount ?? 0} external recipients, {opsAlertSmokeResult.internalNotificationEmailCount ?? 0} internal notification emails, {opsAlertSmokeResult.platformCriticalCopyCount ?? 0} platform critical copies.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Delivery readiness</h3>
              <p className="muted settings-premium-muted">Workspace sender readiness, MyTitan fallback readiness, and the live customer-email path are shown separately so you can see what will actually happen before you send.</p>
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <p className="muted settings-premium-muted" data-testid="email-readiness-status">
                    Workspace sender: {emailReadiness?.workspace?.status === 'ready' ? 'Ready' : emailReadiness?.workspace?.status === 'failing' ? 'Configured but failing' : emailReadiness?.workspace?.status === 'misconfigured' ? 'Needs attention' : 'Not set up'}
                  </p>
                  <p className="muted settings-premium-muted">{emailReadiness?.workspace?.guidance || 'Checking workspace sender readiness…'}</p>
                  {emailReadiness?.workspace?.fromEmail ? <p className="muted settings-premium-muted">Workspace sending email: {emailReadiness.workspace.fromEmail}</p> : null}
                  {emailReadiness?.workspace?.replyToEmail ? <p className="muted settings-premium-muted">Workspace reply-to: {emailReadiness.workspace.replyToEmail}</p> : null}
                </div>
                <div>
                  <p className="muted settings-premium-muted" data-testid="system-email-readiness-status">
                    MyTitan system email: {systemEmailReadiness?.status === 'ready' ? 'Ready' : systemEmailReadiness?.status === 'failing' ? 'Configured but failing' : systemEmailReadiness?.status === 'misconfigured' ? 'Needs attention' : 'Not set up'}
                  </p>
                  <p className="muted settings-premium-muted">{systemEmailReadiness?.guidance || 'Checking MyTitan system email readiness…'}</p>
                </div>
                <div data-testid="effective-email-readiness-status">
                  <p className="muted settings-premium-muted">
                    Effective customer delivery: {emailReadiness?.effective?.canSend ? emailReadiness?.effective?.usingFallback ? 'Ready via MyTitan fallback' : 'Ready via workspace sender' : 'Unavailable'}
                  </p>
                  <p className="muted settings-premium-muted">{emailReadiness?.effective?.guidance || 'Checking effective customer-email delivery…'}</p>
                  {emailReadiness?.effective?.notice ? <p className="muted settings-premium-muted">{emailReadiness.effective.notice}</p> : null}
                </div>
              </div>
              {emailReadiness?.workspace?.dnsRecords?.length ? (
                <div data-testid="email-dns-guidance">
                  {emailReadiness.workspace.dnsRecords.map((item) => (
                    <p key={item} className="muted settings-premium-muted" style={{ marginBottom: 6 }}>{item}</p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Customer payment messages</h3>
              <p className="muted settings-premium-muted">Tell customers what to expect once a job moves into billing.</p>
              <label className="settings-premium-label">Invoice ready message</label>
              <textarea
                className="input settings-premium-input"
                rows={3}
                value={workflowConfig.portalCopy?.invoiceReadyMessage || ''}
                onChange={(e) => updateBusinessConfig((current) => ({
                  ...current,
                  portalCopy: { ...(current.portalCopy || {}), invoiceReadyMessage: e.target.value || null },
                }))}
              />

              <label className="settings-premium-label">Invoice overdue message</label>
              <textarea
                className="input settings-premium-input"
                rows={3}
                value={workflowConfig.portalCopy?.invoiceOverdueMessage || ''}
                onChange={(e) => updateBusinessConfig((current) => ({
                  ...current,
                  portalCopy: { ...(current.portalCopy || {}), invoiceOverdueMessage: e.target.value || null },
                }))}
              />

              <label className="settings-premium-label">Payment unavailable message</label>
              <textarea
                className="input settings-premium-input"
                rows={3}
                value={workflowConfig.portalCopy?.paymentUnavailableMessage || ''}
                onChange={(e) => updateBusinessConfig((current) => ({
                  ...current,
                  portalCopy: { ...(current.portalCopy || {}), paymentUnavailableMessage: e.target.value || null },
                }))}
              />
            </div>

            {notificationsEnabled ? (
              <div className="card settings-premium-card">
                <h3 style={{ marginTop: 0 }}>Notification defaults</h3>
                <p className="muted settings-premium-muted">Set the defaults that apply when email delivery is enabled.</p>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(notificationPrefs?.jobComplete)}
                    onChange={(e) => saveNotificationPref('jobComplete', e.target.checked)}
                    style={{ marginRight: 8 }}
                  />
                  Job complete notifications
                </label>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(notificationPrefs?.paymentReceived)}
                    onChange={(e) => saveNotificationPref('paymentReceived', e.target.checked)}
                    style={{ marginRight: 8 }}
                  />
                  Payment received notifications
                </label>
                <label style={{ display: 'block' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(notificationPrefs?.emailEnabled)}
                    onChange={(e) => saveNotificationPref('emailEnabled', e.target.checked)}
                    style={{ marginRight: 8 }}
                  />
                  Email delivery (if SMTP is configured)
                </label>
              </div>
            ) : null}
          </>
        )}

        {tab === 'services' && (
          <>
            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Service defaults</h3>
              <p className="muted settings-premium-muted">Keep the service catalogue and default commercial behaviour together without changing historical records.</p>
              <label className="settings-premium-label">Suggested service names</label>
              <input
                className="input settings-premium-input"
                value={Array.isArray(form.defaultServiceNamePresets) ? form.defaultServiceNamePresets.join(', ') : form.defaultServiceNamePresets || ''}
                onChange={(e) => setForm({ ...form, defaultServiceNamePresets: e.target.value })}
              />

              <label className="settings-premium-label">Default wheel pricing</label>
              <select
                className="input settings-premium-input"
                value={form.defaultWheelPricingMode || ''}
                onChange={(e) => setForm({ ...form, defaultWheelPricingMode: e.target.value || null })}
              >
                <option value="">None</option>
                <option value="PER_WHEEL">Per wheel</option>
                <option value="SET">Per set</option>
              </select>
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Service types</h3>
              <p className="muted settings-premium-muted">Owners and admins can define the service catalogue operators choose from when creating jobs. Retiring a service type hides it from future jobs without changing historical records.</p>

              <div style={{ display: 'grid', gap: 12 }} data-testid="settings-service-type-list">
                {workspaceJobForms.serviceTypes?.map((serviceType, index) => (
                  <div key={serviceType.id} data-testid="settings-service-type-row" className="settings-premium-subcard">
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <strong>{serviceType.name || `Service type ${index + 1}`}</strong>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="button secondary settings-premium-button"
                          type="button"
                          onClick={() => removeServiceType(serviceType.id)}
                        >
                          Remove
                        </button>
                        <button
                          className="button secondary settings-premium-button"
                          type="button"
                          data-testid={`settings-service-type-up-${serviceType.id}`}
                          onClick={() => {
                            if (index === 0) return;
                            const next = [...(workspaceJobForms.serviceTypes || [])];
                            const [item] = next.splice(index, 1);
                            next.splice(index - 1, 0, item);
                            updateServiceTypes(next);
                          }}
                          disabled={index === 0}
                        >
                          Up
                        </button>
                        <button
                          className="button secondary settings-premium-button"
                          type="button"
                          onClick={() => {
                            if (index === (workspaceJobForms.serviceTypes?.length || 0) - 1) return;
                            const next = [...(workspaceJobForms.serviceTypes || [])];
                            const [item] = next.splice(index, 1);
                            next.splice(index + 1, 0, item);
                            updateServiceTypes(next);
                          }}
                          disabled={index === (workspaceJobForms.serviceTypes?.length || 0) - 1}
                        >
                          Down
                        </button>
                      </div>
                    </div>

                    <label className="settings-premium-label">Name</label>
                    <input
                      className="input settings-premium-input"
                      data-testid={`settings-service-type-name-${serviceType.id}`}
                      value={serviceType.name}
                      onChange={(e) => updateServiceTypes((workspaceJobForms.serviceTypes || []).map((item) => item.id === serviceType.id ? { ...item, name: e.target.value } : item))}
                    />

                    <label className="settings-premium-label">Description</label>
                    <input
                      className="input settings-premium-input"
                      value={serviceType.description || ''}
                      onChange={(e) => updateServiceTypes((workspaceJobForms.serviceTypes || []).map((item) => item.id === serviceType.id ? { ...item, description: e.target.value } : item))}
                      placeholder="Shown to operators when picking a service type"
                    />

                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={serviceType.enabled !== false}
                          onChange={(e) => updateServiceTypes((workspaceJobForms.serviceTypes || []).map((item) => item.id === serviceType.id ? { ...item, enabled: e.target.checked } : item))}
                        />
                        Enabled for new jobs
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={serviceType.retired === true}
                          onChange={(e) => updateServiceTypes((workspaceJobForms.serviceTypes || []).map((item) => item.id === serviceType.id ? { ...item, retired: e.target.checked } : item))}
                        />
                        Retired
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12 }}>
                <button
                  className="button secondary settings-premium-button"
                  type="button"
                  data-testid="settings-service-type-add"
                  onClick={() => updateServiceTypes([
                    ...(workspaceJobForms.serviceTypes || []),
                    {
                      id: createEditorId('service_type'),
                      name: '',
                      description: '',
                      enabled: true,
                      retired: false,
                      order: workspaceJobForms.serviceTypes?.length || 0,
                    },
                  ])}
                >
                  Add service type
                </button>
              </div>
            </div>
          </>
        )}

        {tab === 'jobs' && (
          <>
            <div className="card settings-premium-card" style={{ marginBottom: 12 }} data-testid="settings-job-template-library" {...getSectionProps('template-marketplace')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: 6 }}>Job-sheet template library</h3>
                  <p className="muted settings-premium-muted" style={{ marginBottom: 0 }}>
                    Choose the starting structure for this workspace, preview what operators will capture, and submit your custom version back to MyTitan for platform review.
                  </p>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <strong>Active template</strong>
                  <span className="muted">{form.activeJobSheetTemplateName || 'Custom workspace template'}</span>
                </div>
              </div>
              {!form.activeJobSheetTemplateId ? (
                <div className="settings-premium-subcard" style={{ marginTop: 14, marginBottom: 2 }}>
                  <span className="mt-guided-setup-card__eyebrow">Setup prompt</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ maxWidth: 620 }}>
                      <strong>No active job sheet is applied yet.</strong>
                      <p className="muted settings-premium-muted" style={{ margin: '6px 0 0 0' }}>
                        Choose one template and apply it before asking the team to rely on the live job sheet.
                      </p>
                    </div>
                    <button
                      className="button secondary settings-premium-button"
                      type="button"
                      onClick={() => void applyWorkspaceTemplate()}
                      disabled={templateActionLoading === 'apply' || !selectedTemplateId}
                    >
                      {templateActionLoading === 'apply' ? 'Applying…' : 'Apply selected template'}
                    </button>
                  </div>
                </div>
              ) : null}
              <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
                {templateMarketplaceSections.map((section) => (
                  <div key={section.key} data-testid={`settings-template-marketplace-${section.key}`}>
                    <div style={{ marginBottom: 10 }}>
                      <strong>{section.title}</strong>
                      <p className="muted settings-premium-muted" style={{ margin: '4px 0 0 0' }}>{section.description}</p>
                    </div>
                    <div className="settings-tab-grid">
                      {section.items.map((template: any) => (
                        <button
                          key={template.id}
                          type="button"
                          className={`tab-button settings-tab-button ${selectedTemplateId === template.id ? 'active' : ''}`}
                          data-testid={`settings-job-template-${String(template.key || template.id)}`}
                          onClick={() => setSelectedTemplateId(template.id)}
                          {...getSectionProps(`template-${template.id}`)}
                        >
                          <em style={{ fontStyle: 'normal', fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#0f766e' }}>
                            {template.tradeCategory || 'GENERAL'}
                          </em>
                          <strong>{template.name}</strong>
                          <span>{template.metadata?.mockPreview || template.description || 'Template preview ready.'}</span>
                          <span>{(template.metadata?.bestFor || []).slice(0, 2).join(' • ') || 'Best for premium operational setup'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div>
                  <div style={{ marginBottom: 10 }}>
                    <strong>All templates</strong>
                    <p className="muted settings-premium-muted" style={{ margin: '4px 0 0 0' }}>
                      Browse the full curated library without clutter. Each card stays focused on fit, speed, and workflow shape.
                    </p>
                  </div>
                  <div className="settings-tab-grid" data-testid="settings-template-marketplace-all">
                    {(templateLibrary?.templates || []).map((template: any) => (
                      <button
                        key={template.id}
                        type="button"
                        className={`tab-button settings-tab-button ${selectedTemplateId === template.id ? 'active' : ''}`}
                        data-testid={`settings-job-template-all-${String(template.key || template.id)}`}
                        onClick={() => setSelectedTemplateId(template.id)}
                        {...getSectionProps(`template-${template.id}`)}
                      >
                        <em style={{ fontStyle: 'normal', fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#0f766e' }}>
                          {template.tradeCategory || 'GENERAL'}
                        </em>
                        <strong>{template.name}</strong>
                        <span>{template.description || 'Template preview ready.'}</span>
                        <span>
                          {(template?.payload?.serviceTypes || []).length} service types • {(template?.payload?.sections || []).length} sections • {(template?.payload?.fields || []).length} fields
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {selectedTemplate ? (
                <div className="two-col" style={{ marginTop: 16 }} data-testid="settings-template-preview-panel">
                  <div className="settings-premium-subcard">
                    <strong>{selectedTemplate.name}</strong>
                    <p className="muted settings-premium-muted" style={{ marginTop: 8 }}>
                      {selectedTemplate.metadata?.editorialTone || selectedTemplate.description || 'Curated template preview ready.'}
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                      <span className="platform-admin-chip">{selectedTemplate.tradeCategory}</span>
                      <span className="platform-admin-chip">{selectedTemplate.metadata?.estimatedSetupMinutes || 10} min setup</span>
                      <span className="platform-admin-chip">{selectedTemplate.metadata?.setupComplexity || 'balanced'}</span>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <strong style={{ display: 'block', marginBottom: 6 }}>Best for</strong>
                      <p className="muted settings-premium-muted" style={{ margin: 0 }}>
                        {(selectedTemplate.metadata?.bestFor || []).join(' • ') || 'General field-service workflows'}
                      </p>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <strong style={{ display: 'block', marginBottom: 6 }}>Workflow tags</strong>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {(selectedTemplate.metadata?.workflowTags || []).map((tag: string) => (
                          <span key={tag} className="platform-admin-chip">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="settings-premium-subcard">
                    <strong>Preview structure</strong>
                    <p className="muted settings-premium-muted" style={{ marginTop: 8 }}>
                      {selectedTemplate.metadata?.customerFacingSummary || 'A calm, customer-legible handover sits alongside the operator workflow.'}
                    </p>
                    <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                      {(selectedTemplate?.payload?.sections || []).slice(0, 4).map((section: any) => (
                        <div key={section.id} style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(15,23,42,0.08)' }}>
                          <strong>{section.title}</strong>
                          <div className="muted" style={{ marginTop: 4 }}>{section.description || 'Section preview ready.'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              {Array.isArray(templateLibrary?.curated?.popularByTrade) && templateLibrary.curated.popularByTrade.length ? (
                <div style={{ marginTop: 16 }} data-testid="settings-template-marketplace-popular">
                  <strong>Popular by trade</strong>
                  <div className="settings-tab-grid" style={{ marginTop: 10 }}>
                    {templateLibrary.curated.popularByTrade.slice(0, 4).map((group: any) => (
                      <div key={group.tradeCategory} className="settings-premium-subcard">
                        <strong>{group.tradeCategory}</strong>
                        <p className="muted settings-premium-muted" style={{ marginTop: 8 }}>
                          {group.count} approved {group.count === 1 ? 'template' : 'templates'} currently published.
                        </p>
                        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                          {(group.templates || []).slice(0, 3).map((template: any) => (
                            <button
                              key={template.id}
                              type="button"
                              className="button secondary settings-premium-button"
                              onClick={() => setSelectedTemplateId(template.id)}
                            >
                              {template.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                <button
                  type="button"
                  className="button secondary settings-premium-button"
                  onClick={() => void applyWorkspaceTemplate()}
                  disabled={templateActionLoading === 'apply' || !selectedTemplateId}
                >
                  {templateActionLoading === 'apply' ? 'Applying…' : 'Apply selected template'}
                </button>
                <button
                  type="button"
                  className="button secondary settings-premium-button"
                  onClick={() => void submitWorkspaceTemplateProposal()}
                  disabled={templateActionLoading === 'submit'}
                  data-testid="settings-submit-template-proposal"
                >
                  {templateActionLoading === 'submit' ? 'Submitting…' : 'Submit current template for review'}
                </button>
                <Link className="button secondary settings-premium-button" href="/dashboard/setup-wizard">
                  Re-run template selection
                </Link>
              </div>
            </div>

            <div className="card settings-premium-card" data-testid="settings-workflow-panel" style={{ marginBottom: 12 }} {...getSectionProps('template-builder')}>
              <h3 style={{ marginTop: 0 }}>Job-sheet wording</h3>
              <p className="muted settings-premium-muted">Rename the core job-sheet language without changing canonical status values.</p>

              <label className="settings-premium-label">Jobs label</label>
              <input
                className="input settings-premium-input"
                data-testid="settings-jobs-label-input"
                value={workflowConfig.terminology?.jobs || ''}
                onChange={(e) => updateBusinessConfig((current) => ({
                  ...current,
                  terminology: { ...(current.terminology || {}), jobs: e.target.value || null },
                }))}
                placeholder="Jobs"
              />
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Service catalogue ownership</h3>
              <p className="muted settings-premium-muted">Service types now live only in Services so the job-sheet builder stays focused on how work is captured.</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="button secondary settings-premium-button"
                  type="button"
                  onClick={() => setTab('services')}
                >
                  Open services
                </button>
              </div>
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Job declaration</h3>
              <p className="muted settings-premium-muted">This text appears on live job sheets and is stored with signed job records.</p>

              <label className="settings-premium-label">Approved declaration text</label>
              <textarea
                className="input settings-premium-input"
                rows={5}
                data-testid="settings-declaration-text"
                value={workflowConfig.jobForms?.declarationText || ''}
                onChange={(e) => updateBusinessConfig((current) => ({
                  ...current,
                  jobForms: { ...(current.jobForms || {}), declarationText: e.target.value || null },
                }))}
                placeholder={workspaceDeclarationText}
              />
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Job-sheet sections</h3>
              <p className="muted settings-premium-muted">These configurable sections appear between the fixed operational blocks and the final signatures/evidence areas.</p>

              <div style={{ display: 'grid', gap: 12 }} data-testid="settings-job-form-section-list">
                {(workspaceJobForms.sections || []).map((section, index) => (
                  <div key={section.id} data-testid="settings-job-form-section-row" className="settings-premium-subcard">
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <strong>{section.title || `Section ${index + 1}`}</strong>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="button secondary settings-premium-button"
                          type="button"
                          onClick={() => removeJobFormSection(section.id)}
                        >
                          Remove
                        </button>
                        <button
                          className="button secondary settings-premium-button"
                          type="button"
                          onClick={() => {
                            if (index === 0) return;
                            const next = [...(workspaceJobForms.sections || [])];
                            const [item] = next.splice(index, 1);
                            next.splice(index - 1, 0, item);
                            updateJobFormSections(next);
                          }}
                          disabled={index === 0}
                        >
                          Up
                        </button>
                        <button
                          className="button secondary settings-premium-button"
                          type="button"
                          onClick={() => {
                            if (index === (workspaceJobForms.sections?.length || 0) - 1) return;
                            const next = [...(workspaceJobForms.sections || [])];
                            const [item] = next.splice(index, 1);
                            next.splice(index + 1, 0, item);
                            updateJobFormSections(next);
                          }}
                          disabled={index === (workspaceJobForms.sections?.length || 0) - 1}
                        >
                          Down
                        </button>
                      </div>
                    </div>

                    <label className="settings-premium-label">Section title</label>
                    <input
                      className="input settings-premium-input"
                      data-testid={`settings-job-form-section-title-${section.id}`}
                      value={section.title}
                      onChange={(e) => updateJobFormSections((workspaceJobForms.sections || []).map((item) => item.id === section.id ? { ...item, title: e.target.value } : item))}
                    />

                    <label className="settings-premium-label">Helper text</label>
                    <input
                      className="input settings-premium-input"
                      value={section.description || ''}
                      onChange={(e) => updateJobFormSections((workspaceJobForms.sections || []).map((item) => item.id === section.id ? { ...item, description: e.target.value } : item))}
                    />

                    <label className="settings-premium-label">Visible for service types</label>
                    <select
                      className="input settings-premium-input"
                      multiple
                      value={Array.isArray(section.serviceTypeIds) ? section.serviceTypeIds : []}
                      onChange={(e) => updateJobFormSections((workspaceJobForms.sections || []).map((item) => item.id === section.id ? {
                        ...item,
                        serviceTypeIds: Array.from(e.target.selectedOptions).map((option) => option.value),
                      } : item))}
                    >
                      {(workspaceJobForms.serviceTypes || []).map((serviceType) => (
                        <option key={serviceType.id} value={serviceType.id}>
                          {serviceType.name}
                        </option>
                      ))}
                    </select>
                    <p className="muted settings-premium-muted">Leave empty to show this section for every service type.</p>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={section.visible !== false}
                        onChange={(e) => updateJobFormSections((workspaceJobForms.sections || []).map((item) => item.id === section.id ? { ...item, visible: e.target.checked } : item))}
                      />
                      Visible on the live job form
                    </label>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12 }}>
                <button
                  className="button secondary settings-premium-button"
                  type="button"
                  data-testid="settings-job-form-section-add"
                  onClick={() => updateJobFormSections([
                    ...(workspaceJobForms.sections || []),
                    {
                      id: createEditorId('job_section'),
                      title: '',
                      description: '',
                      visible: true,
                      serviceTypeIds: [],
                      order: workspaceJobForms.sections?.length || 0,
                    },
                  ])}
                >
                  Add section
                </button>
              </div>
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Job-sheet fields</h3>
              <p className="muted settings-premium-muted">Only safe structured field types are allowed here. Signatures, evidence, billing, and declaration remain system-controlled.</p>

              <div style={{ display: 'grid', gap: 12 }} data-testid="settings-job-form-field-list">
                {(workspaceJobForms.fields || []).map((field, index) => (
                  <div key={field.id} data-testid="settings-job-form-field-row" className="settings-premium-subcard">
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <strong>{field.label || field.key || `Field ${index + 1}`}</strong>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                          <span className="platform-admin-chip">{getJobFieldCategory(field.type)}</span>
                          <span className="platform-admin-chip">{field.required === true ? 'required' : 'optional'}</span>
                          <span className="platform-admin-chip">{field.visible !== false ? 'operator-visible' : 'hidden'}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="button secondary settings-premium-button"
                          type="button"
                          onClick={() => removeJobFormField(field.id)}
                        >
                          Remove
                        </button>
                        <button
                          className="button secondary settings-premium-button"
                          type="button"
                          onClick={() => {
                            if (index === 0) return;
                            const next = [...(workspaceJobForms.fields || [])];
                            const [item] = next.splice(index, 1);
                            next.splice(index - 1, 0, item);
                            updateJobFormFields(next);
                          }}
                          disabled={index === 0}
                        >
                          Up
                        </button>
                        <button
                          className="button secondary settings-premium-button"
                          type="button"
                          onClick={() => {
                            if (index === (workspaceJobForms.fields?.length || 0) - 1) return;
                            const next = [...(workspaceJobForms.fields || [])];
                            const [item] = next.splice(index, 1);
                            next.splice(index + 1, 0, item);
                            updateJobFormFields(next);
                          }}
                          disabled={index === (workspaceJobForms.fields?.length || 0) - 1}
                        >
                          Down
                        </button>
                      </div>
                    </div>

                    <div className="two-col">
                      <div>
                        <label className="settings-premium-label">Stored key</label>
                        <input
                          className="input settings-premium-input"
                          value={field.key}
                          onChange={(e) => updateJobFormFields((workspaceJobForms.fields || []).map((item) => item.id === field.id ? { ...item, key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() } : item))}
                          placeholder="site_access_notes"
                        />
                      </div>
                      <div>
                        <label className="settings-premium-label">Label</label>
                        <input
                          className="input settings-premium-input"
                          data-testid={`settings-job-form-field-label-${field.id}`}
                          value={field.label}
                          onChange={(e) => updateJobFormFields((workspaceJobForms.fields || []).map((item) => item.id === field.id ? { ...item, label: e.target.value } : item))}
                        />
                      </div>
                      <div>
                        <label className="settings-premium-label">Field type</label>
                        <select
                          className="input settings-premium-input"
                          value={field.type}
                          onChange={(e) => updateJobFormFields((workspaceJobForms.fields || []).map((item) => item.id === field.id ? { ...item, type: e.target.value as SafeJobFormFieldType } : item))}
                        >
                          {SAFE_JOB_FORM_FIELD_TYPES.map((type) => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="settings-premium-label">Section</label>
                        <select
                          className="input settings-premium-input"
                          value={field.sectionId}
                          onChange={(e) => updateJobFormFields((workspaceJobForms.fields || []).map((item) => item.id === field.id ? { ...item, sectionId: e.target.value } : item))}
                        >
                          <option value="">Choose a section</option>
                          {(workspaceJobForms.sections || []).map((section) => (
                            <option key={section.id} value={section.id}>{section.title}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <label className="settings-premium-label">Helper text</label>
                    <input
                      className="input settings-premium-input"
                      value={field.helpText || ''}
                      onChange={(e) => updateJobFormFields((workspaceJobForms.fields || []).map((item) => item.id === field.id ? { ...item, helpText: e.target.value } : item))}
                    />

                    <label className="settings-premium-label">Options</label>
                    <input
                      className="input settings-premium-input"
                      value={Array.isArray(field.options) ? field.options.join(', ') : ''}
                      onChange={(e) => updateJobFormFields((workspaceJobForms.fields || []).map((item) => item.id === field.id ? {
                        ...item,
                        options: e.target.value.split(',').map((value) => value.trim()).filter(Boolean),
                      } : item))}
                      placeholder="Only used for select fields"
                    />

                    <label className="settings-premium-label">Visible for service types</label>
                    <select
                      className="input settings-premium-input"
                      multiple
                      value={Array.isArray(field.serviceTypeIds) ? field.serviceTypeIds : []}
                      onChange={(e) => updateJobFormFields((workspaceJobForms.fields || []).map((item) => item.id === field.id ? {
                        ...item,
                        serviceTypeIds: Array.from(e.target.selectedOptions).map((option) => option.value),
                      } : item))}
                    >
                      {(workspaceJobForms.serviceTypes || []).map((serviceType) => (
                        <option key={serviceType.id} value={serviceType.id}>
                          {serviceType.name}
                        </option>
                      ))}
                    </select>
                    <p className="muted settings-premium-muted">Leave empty to show this field for every service type.</p>

                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={field.required === true}
                          onChange={(e) => updateJobFormFields((workspaceJobForms.fields || []).map((item) => item.id === field.id ? { ...item, required: e.target.checked } : item))}
                        />
                        Required
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={field.visible !== false}
                          onChange={(e) => updateJobFormFields((workspaceJobForms.fields || []).map((item) => item.id === field.id ? { ...item, visible: e.target.checked } : item))}
                        />
                        Visible
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12 }}>
                <button
                  className="button secondary settings-premium-button"
                  type="button"
                  data-testid="settings-job-form-field-add"
                  onClick={() => updateJobFormFields([
                    ...(workspaceJobForms.fields || []),
                    {
                      id: createEditorId('job_field'),
                      key: '',
                      sectionId: workspaceJobForms.sections?.[0]?.id || '',
                      label: '',
                      helpText: '',
                      type: 'text',
                      required: false,
                      visible: true,
                      options: [],
                      serviceTypeIds: [],
                      order: workspaceJobForms.fields?.length || 0,
                    },
                  ])}
                >
                  Add field
                </button>
              </div>
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }} data-testid="settings-job-template-live-preview" {...getSectionProps('job-sheet-preview')}>
              <h3 style={{ marginTop: 0 }}>Live preview</h3>
              <p className="muted settings-premium-muted">Check the operator shape and the customer-visible summary before saving changes.</p>
              <div className="two-col">
                <div className="settings-premium-subcard">
                  <strong>Operator editing flow</strong>
                  <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                    {(workspaceJobForms.sections || []).map((section) => (
                      <div key={section.id} style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(15,23,42,0.08)' }}>
                        <strong>{section.title || 'Untitled section'}</strong>
                        <div className="muted" style={{ marginTop: 4 }}>{section.description || 'No helper text yet.'}</div>
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {(workspaceJobForms.fields || []).filter((field) => field.sectionId === section.id).slice(0, 5).map((field) => (
                            <span key={field.id} className="platform-admin-chip">
                              {field.label || field.key || 'Field'}
                              {field.required === true ? ' *' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="settings-premium-subcard" data-testid="settings-job-template-customer-preview">
                  <strong>Customer sees</strong>
                  <p className="muted settings-premium-muted" style={{ marginTop: 8 }}>
                    This preview only shows the fields currently marked for customer-facing summary use.
                  </p>
                  <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                    {(customerVisibleFields || []).length ? customerVisibleFields.map((field) => (
                      <div key={field.id} style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(15,23,42,0.08)' }}>
                        <strong>{field.label || field.key}</strong>
                        <div className="muted" style={{ marginTop: 4 }}>{field.helpText || 'Customer summary field'}</div>
                      </div>
                    )) : (
                      <div className="muted">No customer-summary fields are selected yet.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {stageSections.filter((section) => section.key === 'jobs').map(({ key: sectionKey, title, stages }) => (
              <div className="card settings-premium-card" key={sectionKey} style={{ marginBottom: 12 }}>
                <h3 style={{ marginTop: 0 }}>{title}</h3>
                <p className="muted settings-premium-muted">Rename, reorder, or hide the steps people see in the app.</p>

                <div style={{ display: 'grid', gap: 12 }}>
                  {stages.map((stage, index) => (
                    <div key={`${sectionKey}-${stage.id}`} className="settings-premium-subcard">
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <strong>{stage.id}</strong>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="button secondary settings-premium-button" type="button" onClick={() => moveStage(sectionKey, stage.id, -1, stages)} disabled={index === 0}>
                            Up
                          </button>
                          <button className="button secondary settings-premium-button" type="button" onClick={() => moveStage(sectionKey, stage.id, 1, stages)} disabled={index === stages.length - 1}>
                            Down
                          </button>
                        </div>
                      </div>

                      <label className="settings-premium-label">Stage label</label>
                      <input
                        className="input settings-premium-input"
                        data-testid={`settings-stage-label-${sectionKey}-${stage.id}`}
                        value={stage.label}
                        onChange={(e) => updateStageLabel(sectionKey, stage.id, e.target.value, stages)}
                      />

                      <label style={{ display: 'block', marginBottom: 10 }}>
                        <input
                          type="checkbox"
                          checked={stage.visible !== false}
                          onChange={() => toggleStageVisibility(sectionKey, stage.id, stages)}
                          style={{ marginRight: 8 }}
                        />
                        Show this stage in operator surfaces
                      </label>

                      <label className="settings-premium-label">Required extra fields</label>
                      <input
                        className="input settings-premium-input"
                        value={Array.isArray(stage.requiredCustomFieldKeys) ? stage.requiredCustomFieldKeys.join(', ') : ''}
                        onChange={(e) => updateWorkflowStages(sectionKey, stages.map((item) => item.id === stage.id ? {
                          ...item,
                          requiredCustomFieldKeys: e.target.value.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
                        } : item))}
                        placeholder="serial_number, warranty_status"
                      />
                      <p className="muted settings-premium-muted" style={{ marginBottom: 10 }}>
                        Available field keys: {customFields.filter((field) => field.entityType === (sectionKey === 'jobs' ? 'job' : sectionKey === 'bookings' ? 'booking' : 'technician')).map((field) => field.key).join(', ') || 'none yet'}
                      </p>

                      <label className="settings-premium-label">What happens if something is missing</label>
                      <select
                        className="input settings-premium-input"
                        data-testid="workflow-stage-enforcement-toggle"
                        value={stage.requiredFieldEnforcementMode === 'block' ? 'block' : 'warn'}
                        onChange={(e) => updateWorkflowStages(sectionKey, stages.map((item) => item.id === stage.id ? {
                          ...item,
                          requiredFieldEnforcementMode: e.target.value === 'block' ? 'block' : 'warn',
                        } : item))}
                      >
                        <option value="warn">Show a warning</option>
                        <option value="block">Stop the move</option>
                      </select>
                      <p className="muted settings-premium-muted" style={{ marginBottom: 10 }}>
                        {Array.isArray(stage.requiredCustomFieldKeys) && stage.requiredCustomFieldKeys.length
                          ? `This stage requires: ${stage.requiredCustomFieldKeys.join(', ')}`
                          : 'This step does not require any extra fields.'}
                      </p>

                      <p className="muted settings-premium-muted" style={{ marginBottom: 0 }}>
                        Canonical statuses: {renderStatuses(stage)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="theme-preview" data-testid="settings-workflow-preview">
              <strong>Preview</strong>
              <p className="muted" style={{ margin: '8px 0 0' }}>
                {workflowTerms.jobs} stages: {jobStages.filter((stage) => stage.visible !== false).map((stage) => stage.label).join(' → ') || 'Hidden'}
              </p>
            </div>
          </>
        )}

        {tab === 'team' && (
          <>
            <div className="card settings-premium-card" style={{ marginBottom: 12 }} data-testid="settings-team-management-card" {...getSectionProps('team-access')}>
              <h3 style={{ marginTop: 0 }}>Team access</h3>
              <p className="muted settings-premium-muted">
                Invite team members, set their role, and check access status from the Team management page.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="button secondary settings-premium-button"
                  data-testid="settings-open-team-management"
                  onClick={() => void router.push('/dashboard/users')}
                >
                  Open team management
                </button>
              </div>
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Field-team wording</h3>
              <p className="muted settings-premium-muted">Match the language your field team already uses.</p>
              <label className="settings-premium-label">Technicians label</label>
              <input
                className="input settings-premium-input"
                value={workflowConfig.terminology?.technicians || ''}
                onChange={(e) => updateBusinessConfig((current) => ({
                  ...current,
                  terminology: { ...(current.terminology || {}), technicians: e.target.value || null },
                }))}
                placeholder="Technicians"
              />
            </div>

            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Field team checklist</h3>
              <p className="muted settings-premium-muted">Add one checklist item per line so your team knows what to confirm on site.</p>
              <label className="settings-premium-label">Checklist prompts</label>
              <textarea
                className="input settings-premium-input"
                rows={5}
                value={Array.isArray(workflowConfig.technicianPrompts?.checklist) ? workflowConfig.technicianPrompts?.checklist.join('\n') : ''}
                onChange={(e) => updateBusinessConfig((current) => ({
                  ...current,
                  technicianPrompts: {
                    ...(current.technicianPrompts || {}),
                    checklist: e.target.value
                      .split('\n')
                      .map((value: string) => value.trim())
                      .filter(Boolean),
                  },
                }))}
              />
            </div>

            {stageSections.filter((section) => section.key === 'technician').map(({ key: sectionKey, title, stages }) => (
              <div className="card settings-premium-card" key={sectionKey} style={{ marginBottom: 12 }}>
                <h3 style={{ marginTop: 0 }}>{title}</h3>
                <p className="muted settings-premium-muted">Rename, reorder, or hide the steps people see in the app.</p>
                <div style={{ display: 'grid', gap: 12 }}>
                  {stages.map((stage, index) => (
                    <div key={`${sectionKey}-${stage.id}`} className="settings-premium-subcard">
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <strong>{stage.id}</strong>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="button secondary settings-premium-button" type="button" onClick={() => moveStage(sectionKey, stage.id, -1, stages)} disabled={index === 0}>
                            Up
                          </button>
                          <button className="button secondary settings-premium-button" type="button" onClick={() => moveStage(sectionKey, stage.id, 1, stages)} disabled={index === stages.length - 1}>
                            Down
                          </button>
                        </div>
                      </div>

                      <label className="settings-premium-label">Stage label</label>
                      <input
                        className="input settings-premium-input"
                        data-testid={`settings-stage-label-${sectionKey}-${stage.id}`}
                        value={stage.label}
                        onChange={(e) => updateStageLabel(sectionKey, stage.id, e.target.value, stages)}
                      />

                      <label style={{ display: 'block', marginBottom: 10 }}>
                        <input
                          type="checkbox"
                          checked={stage.visible !== false}
                          onChange={() => toggleStageVisibility(sectionKey, stage.id, stages)}
                          style={{ marginRight: 8 }}
                        />
                        Show this stage in operator surfaces
                      </label>

                      <label className="settings-premium-label">Required extra fields</label>
                      <input
                        className="input settings-premium-input"
                        value={Array.isArray(stage.requiredCustomFieldKeys) ? stage.requiredCustomFieldKeys.join(', ') : ''}
                        onChange={(e) => updateWorkflowStages(sectionKey, stages.map((item) => item.id === stage.id ? {
                          ...item,
                          requiredCustomFieldKeys: e.target.value.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
                        } : item))}
                        placeholder="serial_number, warranty_status"
                      />
                      <p className="muted settings-premium-muted" style={{ marginBottom: 10 }}>
                        Available field keys: {customFields.filter((field) => field.entityType === 'technician').map((field) => field.key).join(', ') || 'none yet'}
                      </p>

                      <label className="settings-premium-label">What happens if something is missing</label>
                      <select
                        className="input settings-premium-input"
                        data-testid="workflow-stage-enforcement-toggle"
                        value={stage.requiredFieldEnforcementMode === 'block' ? 'block' : 'warn'}
                        onChange={(e) => updateWorkflowStages(sectionKey, stages.map((item) => item.id === stage.id ? {
                          ...item,
                          requiredFieldEnforcementMode: e.target.value === 'block' ? 'block' : 'warn',
                        } : item))}
                      >
                        <option value="warn">Show a warning</option>
                        <option value="block">Stop the move</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'bookings' && (
          <>
            <div className="card settings-premium-card" style={{ marginBottom: 12 }} {...getSectionProps('booking-setup')}>
              <h3 style={{ marginTop: 0 }}>Bookings setup</h3>
              <p className="muted settings-premium-muted">Keep public booking wording, workflow stages, and setup handoff together.</p>
              <label className="settings-premium-label">Bookings label</label>
              <input
                className="input settings-premium-input"
                data-testid="settings-bookings-label-input"
                value={workflowConfig.terminology?.bookings || ''}
                onChange={(e) => updateBusinessConfig((current) => ({
                  ...current,
                  terminology: { ...(current.terminology || {}), bookings: e.target.value || null },
                }))}
                placeholder="Bookings"
              />
            </div>

            {stageSections.filter((section) => section.key === 'bookings').map(({ key: sectionKey, title, stages }) => (
              <div className="card settings-premium-card" key={sectionKey} style={{ marginBottom: 12 }}>
                <h3 style={{ marginTop: 0 }}>{title}</h3>
                <p className="muted settings-premium-muted">Rename, reorder, or hide the steps people see in the app.</p>
                <div style={{ display: 'grid', gap: 12 }}>
                  {stages.map((stage, index) => (
                    <div key={`${sectionKey}-${stage.id}`} className="settings-premium-subcard">
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <strong>{stage.id}</strong>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="button secondary settings-premium-button" type="button" onClick={() => moveStage(sectionKey, stage.id, -1, stages)} disabled={index === 0}>
                            Up
                          </button>
                          <button className="button secondary settings-premium-button" type="button" onClick={() => moveStage(sectionKey, stage.id, 1, stages)} disabled={index === stages.length - 1}>
                            Down
                          </button>
                        </div>
                      </div>

                      <label className="settings-premium-label">Stage label</label>
                      <input
                        className="input settings-premium-input"
                        data-testid={`settings-stage-label-${sectionKey}-${stage.id}`}
                        value={stage.label}
                        onChange={(e) => updateStageLabel(sectionKey, stage.id, e.target.value, stages)}
                      />

                      <label style={{ display: 'block', marginBottom: 10 }}>
                        <input
                          type="checkbox"
                          checked={stage.visible !== false}
                          onChange={() => toggleStageVisibility(sectionKey, stage.id, stages)}
                          style={{ marginRight: 8 }}
                        />
                        Show this stage in operator surfaces
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="card settings-premium-card">
              <h3 style={{ marginTop: 0 }}>Setup links</h3>
              <p className="muted settings-premium-muted">Use Bookings for public availability and Integrations for provider calendars. Settings here should organize the experience, not hard-disable it.</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="button secondary settings-premium-button" onClick={() => void router.push('/dashboard/bookings')}>
                  Open bookings
                </button>
                <button type="button" className="button secondary settings-premium-button" onClick={() => void router.push('/dashboard/integrations?section=workspace-integrations')}>
                  Open integrations
                </button>
              </div>
            </div>
          </>
        )}

        {tab === 'advanced' && (
          <>
            <div className="card settings-premium-card" style={{ marginBottom: 12 }} {...getSectionProps('advanced-controls')}>
              <h3 style={{ marginTop: 0 }}>Advanced controls</h3>
              <p className="muted" style={{ marginBottom: 8 }}>
                Manage optional business connections after the core setup is complete.
              </p>
              <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
                <li>Bookings setup stays under Bookings Setup.</li>
                <li>Job output stays under Job Output.</li>
                <li>Permissions still apply, so workspace roles continue to control who can manage these areas.</li>
              </ul>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                <button type="button" className="button secondary settings-premium-button" onClick={() => void router.push('/dashboard/integrations?section=business-tools')}>
                  Open connections
                </button>
              </div>
            </div>
          </>
        )}

        {tab === 'jobs' && (
          <>
            <div className="theme-preview" data-testid="settings-workflow-preview">
              <strong>Preview</strong>
              <p className="muted" style={{ margin: '8px 0 0' }}>
                {workflowTerms.jobs} stages: {jobStages.filter((stage) => stage.visible !== false).map((stage) => stage.label).join(' → ') || 'Hidden'}
              </p>
            </div>
          </>
        )}

        {tab === 'team' && (
          <>
            <div className="theme-preview">
              <strong>Preview</strong>
              <p className="muted" style={{ margin: '8px 0 0' }}>
                {workflowTerms.technicians} stages: {technicianStages.filter((stage) => stage.visible !== false).map((stage) => stage.label).join(' → ') || 'Hidden'}
              </p>
            </div>
          </>
        )}

        {tab === 'bookings' && (
          <>
            <div className="theme-preview">
              <strong>Preview</strong>
              <p className="muted" style={{ margin: '8px 0 0' }}>
                {workflowTerms.bookings} stages: {bookingStages.filter((stage) => stage.visible !== false).map((stage) => stage.label).join(' → ') || 'Hidden'}
              </p>
            </div>
          </>
        )}

        {tab === 'advanced' && canManageCustomFields && (
          customFieldsLoading ? (
            <div className="card settings-premium-card"><p className="muted settings-premium-muted">Loading custom fields…</p></div>
          ) : (
            <CustomFieldManager
              fields={customFields}
              onFieldsChange={setCustomFields}
              showSuccess={showSuccess}
              showError={showError}
            />
          )
        )}

        {tab === 'advanced' && canManageAutomations && (
          <>
            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <div style={{ marginBottom: 12 }}>
                <h3 style={{ marginTop: 0, marginBottom: 6 }}>Suggested automations</h3>
                <p className="muted settings-premium-muted" style={{ marginBottom: 0 }}>
                  Deterministic suggestions are based on real workspace workflow patterns. Nothing is enabled until you apply it.
                </p>
              </div>

              {automationSuggestionsError ? <p style={{ color: '#fca5a5' }}>{automationSuggestionsError}</p> : null}

              <div data-testid="automation-suggestion-list" style={{ display: 'grid', gap: 12 }}>
                {automationSuggestionsLoading ? (
                  <p className="muted settings-premium-muted">Loading suggested automations…</p>
                ) : automationSuggestions.length ? (
                  automationSuggestions.map((suggestion) => (
                    <div
                      key={suggestion.key}
                      style={{
                        border: '1px solid rgba(148,163,184,0.18)',
                        borderRadius: 14,
                        padding: 14,
                        display: 'grid',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                        <div>
                          <strong>{suggestion.title}</strong>
                          <div className="muted settings-premium-muted" style={{ marginTop: 4 }}>
                            Priority: {suggestion.priority} • Trigger: {suggestion.trigger} • Action: {suggestion.actionSummary}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="button settings-premium-button"
                            type="button"
                            data-testid={`automation-suggestion-apply-${suggestion.key}`}
                            onClick={() => void applyAutomationSuggestion(suggestion.key)}
                            disabled={applyingSuggestionKey === suggestion.key || dismissingSuggestionKey === suggestion.key}
                          >
                            {applyingSuggestionKey === suggestion.key ? 'Applying…' : 'Apply'}
                          </button>
                          <button
                            className="button secondary settings-premium-button"
                            type="button"
                            data-testid={`automation-suggestion-dismiss-${suggestion.key}`}
                            onClick={() => void dismissAutomationSuggestion(suggestion.key)}
                            disabled={dismissingSuggestionKey === suggestion.key || applyingSuggestionKey === suggestion.key}
                          >
                            {dismissingSuggestionKey === suggestion.key ? 'Dismissing…' : 'Dismiss'}
                          </button>
                        </div>
                      </div>
                      <div>{suggestion.description}</div>
                      <div className="muted settings-premium-muted">{suggestion.benefit}</div>
                      <div className="muted settings-premium-muted">
                        Why this appeared: {suggestion.whyThisAppeared}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted settings-premium-muted">No suggested automations right now. Apply or create rules as your workflow evolves.</p>
                )}
              </div>
            </div>

            <div className="card settings-premium-card" data-testid="settings-automation-rules-panel" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: 6 }}>Automation rules</h3>
                  <p className="muted settings-premium-muted" style={{ marginBottom: 0 }}>
                    Create safe declarative rules that react to real workflow events without changing canonical business logic.
                  </p>
                </div>
                <button
                  className="button settings-premium-button"
                  type="button"
                  data-testid="automation-rule-new"
                  onClick={openNewRuleEditor}
                  disabled={!automationsEnabled}
                >
                  New rule
                </button>
              </div>

              {!automationsEnabled ? (
                <p className="muted settings-premium-muted">Automations are disabled for this runtime.</p>
              ) : null}

              <div className="theme-preview" data-testid="automation-template-list" style={{ marginBottom: 14 }}>
                <strong>Common templates</strong>
                <p className="muted settings-premium-muted" style={{ marginTop: 8, marginBottom: 12 }}>
                  Start from a safe template, then review the rule before saving it.
                </p>
                <div style={{ display: 'grid', gap: 10 }}>
                  {AUTOMATION_TEMPLATES.map((template) => (
                    <div key={template.key} style={{ border: '1px solid rgba(148,163,184,0.16)', borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div>
                        <strong>{template.title}</strong>
                        <div className="muted settings-premium-muted" style={{ marginTop: 4 }}>{template.description}</div>
                      </div>
                      <button
                        className="button secondary settings-premium-button"
                        type="button"
                        data-testid={`automation-template-${template.key}`}
                        onClick={() => applyAutomationTemplate(template)}
                        disabled={!automationsEnabled}
                      >
                        Use template
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {automationRulesError ? <p style={{ color: '#fca5a5' }}>{automationRulesError}</p> : null}

              <div data-testid="automation-rule-list" style={{ display: 'grid', gap: 12 }}>
                {automationRulesLoading ? (
                  <p className="muted settings-premium-muted">Loading automation rules…</p>
                ) : automationRules.length ? (
                  automationRules.map((rule) => (
                    <div
                      key={rule.id}
                      style={{
                        border: '1px solid rgba(148,163,184,0.18)',
                        borderRadius: 14,
                        padding: 14,
                        display: 'grid',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                        <div>
                          <strong>{rule.name}</strong>
                          <div className="muted settings-premium-muted" style={{ marginTop: 4 }}>
                            Trigger: {rule.trigger} • Action: {rule.actionJson.type.replace(/_/g, ' ')}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="button secondary settings-premium-button"
                            type="button"
                            data-testid={`automation-rule-toggle-${rule.id}`}
                            onClick={() => void toggleAutomationRule(rule)}
                          >
                            {rule.enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            className="button secondary settings-premium-button"
                            type="button"
                            data-testid={`automation-rule-edit-${rule.id}`}
                            onClick={() => openEditRule(rule)}
                          >
                            Edit
                          </button>
                          <button
                            className="button secondary settings-premium-button"
                            type="button"
                            data-testid={`automation-rule-delete-${rule.id}`}
                            onClick={() => void deleteAutomationRule(rule.id)}
                            disabled={deletingRuleId === rule.id}
                          >
                            {deletingRuleId === rule.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </div>
                      <div className="muted settings-premium-muted">
                        {rule.conditionJson?.currentStatus ? `Status is ${rule.conditionJson.currentStatus}` : 'No status condition'}
                        {rule.conditionJson?.invoiceIssued !== null && rule.conditionJson?.invoiceIssued !== undefined
                          ? ` • Invoice issued: ${rule.conditionJson.invoiceIssued ? 'yes' : 'no'}`
                          : ''}
                        {rule.conditionJson?.hasAssignedUser !== null && rule.conditionJson?.hasAssignedUser !== undefined
                          ? ` • Assigned user: ${rule.conditionJson.hasAssignedUser ? 'required' : 'not required'}`
                          : ''}
                        {rule.conditionJson?.workflowStageReady
                          ? ` • Workflow stage ready: ${rule.conditionJson.workflowStageReady}`
                          : ''}
                        {(rule.conditionJson as any)?.customFieldEquals?.key
                          ? ` • ${(rule.conditionJson as any).customFieldEquals.entityType} field ${(rule.conditionJson as any).customFieldEquals.key} equals ${(rule.conditionJson as any).customFieldEquals.value}`
                          : ''}
                        {(rule.conditionJson as any)?.customFieldExists?.key
                          ? ` • ${(rule.conditionJson as any).customFieldExists.entityType} field ${(rule.conditionJson as any).customFieldExists.key} exists`
                          : ''}
                        {(rule.conditionJson as any)?.customFieldNotExists?.key
                          ? ` • ${(rule.conditionJson as any).customFieldNotExists.entityType} field ${(rule.conditionJson as any).customFieldNotExists.key} missing`
                          : ''}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted settings-premium-muted">No auto follow-up rules yet.</p>
                )}
              </div>
            </div>

            {ruleEditorOpen ? (
              <div className="card settings-premium-card" data-testid="automation-rule-editor" style={{ marginBottom: 12 }}>
                <h3 style={{ marginTop: 0 }}>{ruleDraft.id ? 'Edit automation rule' : 'Create automation rule'}</h3>
                <div className="theme-preview" data-testid="automation-rule-summary" style={{ marginBottom: 12 }}>
                  <strong>Rule preview</strong>
                  <p className="muted settings-premium-muted" style={{ margin: '8px 0 0' }}>{automationRuleSummary}</p>
                </div>

                <label className="settings-premium-label">Rule name</label>
                <input
                  className="input settings-premium-input"
                  data-testid="automation-rule-name"
                  value={ruleDraft.name}
                  onChange={(e) => setRuleDraft((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Completed jobs need a billing reminder"
                />

                <label className="settings-premium-label">Trigger</label>
                <select
                  className="input settings-premium-input"
                  data-testid="automation-rule-trigger"
                  value={ruleDraft.trigger}
                  onChange={(e) => setRuleDraft((prev) => ({ ...prev, trigger: e.target.value }))}
                >
                  {AUTOMATION_TRIGGER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="muted settings-premium-muted" style={{ marginTop: 6 }}>{selectedTriggerMeta?.description || describeTrigger(ruleDraft.trigger)}</p>

                <label style={{ display: 'block', marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    checked={ruleDraft.enabled}
                    onChange={(e) => setRuleDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
                    style={{ marginRight: 8 }}
                  />
                  Enable this rule immediately
                </label>

                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 12 }}>
                  <div>
                    <label className="settings-premium-label">Condition: current status</label>
                    <select
                      className="input settings-premium-input"
                      value={ruleDraft.conditionJson.currentStatus || ''}
                      onChange={(e) => setRuleDraft((prev) => ({
                        ...prev,
                        conditionJson: { ...prev.conditionJson, currentStatus: e.target.value || null },
                      }))}
                    >
                      <option value="">Any status</option>
                      {AUTOMATION_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <p className="muted settings-premium-muted" style={{ marginTop: 6 }}>Only run when the job is already in a specific canonical status.</p>
                  </div>

                  <div>
                    <label className="settings-premium-label">Condition: invoice issued</label>
                    <select
                      className="input settings-premium-input"
                      value={ruleDraft.conditionJson.invoiceIssued === true ? 'true' : ruleDraft.conditionJson.invoiceIssued === false ? 'false' : ''}
                      onChange={(e) => setRuleDraft((prev) => ({
                        ...prev,
                        conditionJson: {
                          ...prev.conditionJson,
                          invoiceIssued: e.target.value === '' ? null : e.target.value === 'true',
                        },
                      }))}
                    >
                      <option value="">Any</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                    <p className="muted settings-premium-muted" style={{ marginTop: 6 }}>Only valid for job completion, invoice, or portal-signing triggers.</p>
                  </div>

                  <div>
                    <label className="settings-premium-label">Condition: assigned user</label>
                    <select
                      className="input settings-premium-input"
                      value={ruleDraft.conditionJson.hasAssignedUser === true ? 'true' : ruleDraft.conditionJson.hasAssignedUser === false ? 'false' : ''}
                      onChange={(e) => setRuleDraft((prev) => ({
                        ...prev,
                        conditionJson: {
                          ...prev.conditionJson,
                          hasAssignedUser: e.target.value === '' ? null : e.target.value === 'true',
                        },
                      }))}
                    >
                      <option value="">Any</option>
                      <option value="true">Assigned</option>
                      <option value="false">Unassigned</option>
                    </select>
                    <p className="muted settings-premium-muted" style={{ marginTop: 6 }}>Use this for dispatch-oriented workflows where assignment matters.</p>
                  </div>

                  <div>
                    <label className="settings-premium-label">Only run when required fields are complete</label>
                    <select
                      className="input settings-premium-input"
                      data-testid="automation-rule-workflow-stage-ready"
                      value={ruleDraft.conditionJson.workflowStageReady || ''}
                      onChange={(e) => setRuleDraft((prev) => ({
                        ...prev,
                        conditionJson: {
                          ...prev.conditionJson,
                          workflowStageReady: e.target.value || null,
                        },
                      }))}
                    >
                      <option value="">Any stage</option>
                      {jobStages.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.label} ({stage.id})
                        </option>
                      ))}
                    </select>
                    <p className="muted settings-premium-muted" style={{ marginTop: 6 }}>Use this when a rule should wait until the job has everything filled in for that step.</p>
                  </div>

                  <div>
                    <label className="settings-premium-label">Condition: custom field</label>
                    <select
                      className="input settings-premium-input"
                      data-testid="automation-rule-custom-field-mode"
                      value={
                        ruleDraft.conditionJson.customFieldEquals ? 'equals'
                          : ruleDraft.conditionJson.customFieldExists ? 'exists'
                          : ruleDraft.conditionJson.customFieldNotExists ? 'not_exists'
                          : ''
                      }
                      onChange={(e) => setRuleDraft((prev) => ({
                        ...prev,
                        conditionJson: {
                          ...prev.conditionJson,
                          customFieldEquals: e.target.value === 'equals' ? { entityType: 'job', key: '', value: '' } : null,
                          customFieldExists: e.target.value === 'exists' ? { entityType: 'job', key: '' } : null,
                          customFieldNotExists: e.target.value === 'not_exists' ? { entityType: 'job', key: '' } : null,
                        },
                      }))}
                    >
                      <option value="">None</option>
                      <option value="equals">Equals</option>
                      <option value="exists">Exists</option>
                      <option value="not_exists">Missing</option>
                    </select>
                    <p className="muted settings-premium-muted" style={{ marginTop: 6 }}>Reference a tenant-scoped custom field without changing canonical workflow statuses.</p>
                  </div>
                </div>

                {ruleDraft.conditionJson.customFieldEquals || ruleDraft.conditionJson.customFieldExists || ruleDraft.conditionJson.customFieldNotExists ? (
                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 12 }}>
                    {(() => {
                      const matcher = ruleDraft.conditionJson.customFieldEquals || ruleDraft.conditionJson.customFieldExists || ruleDraft.conditionJson.customFieldNotExists;
                      if (!matcher) return null;
                      const availableFields = customFields.filter((field) => field.entityType === matcher.entityType);
                      return (
                        <>
                          <div>
                            <label className="settings-premium-label">Custom field entity</label>
                            <select
                              className="input settings-premium-input"
                              value={matcher.entityType}
                              onChange={(e) => setRuleDraft((prev) => {
                                const entityType = e.target.value as 'job' | 'booking' | 'customer' | 'technician';
                                return {
                                  ...prev,
                                  conditionJson: {
                                    ...prev.conditionJson,
                                    customFieldEquals: prev.conditionJson.customFieldEquals ? { ...prev.conditionJson.customFieldEquals, entityType, key: '' } : null,
                                    customFieldExists: prev.conditionJson.customFieldExists ? { ...prev.conditionJson.customFieldExists, entityType, key: '' } : null,
                                    customFieldNotExists: prev.conditionJson.customFieldNotExists ? { ...prev.conditionJson.customFieldNotExists, entityType, key: '' } : null,
                                  },
                                };
                              })}
                            >
                              <option value="job">Job</option>
                              <option value="booking">Booking</option>
                              <option value="customer">Customer</option>
                              <option value="technician">Technician</option>
                            </select>
                          </div>
                          <div>
                            <label className="settings-premium-label">Field key</label>
                            <select
                              className="input settings-premium-input"
                              data-testid="automation-rule-custom-field-key"
                              value={matcher.key}
                              onChange={(e) => setRuleDraft((prev) => ({
                                ...prev,
                                conditionJson: {
                                  ...prev.conditionJson,
                                  customFieldEquals: prev.conditionJson.customFieldEquals ? { ...prev.conditionJson.customFieldEquals, key: e.target.value } : null,
                                  customFieldExists: prev.conditionJson.customFieldExists ? { ...prev.conditionJson.customFieldExists, key: e.target.value } : null,
                                  customFieldNotExists: prev.conditionJson.customFieldNotExists ? { ...prev.conditionJson.customFieldNotExists, key: e.target.value } : null,
                                },
                              }))}
                            >
                              <option value="">Choose field</option>
                              {availableFields.map((field) => (
                                <option key={field.id} value={field.key}>{field.label} ({field.key})</option>
                              ))}
                            </select>
                          </div>
                          {ruleDraft.conditionJson.customFieldEquals ? (
                            <div>
                              <label className="settings-premium-label">Field value</label>
                              <input
                                className="input settings-premium-input"
                                data-testid="automation-rule-custom-field-value"
                                value={ruleDraft.conditionJson.customFieldEquals.value}
                                onChange={(e) => setRuleDraft((prev) => ({
                                  ...prev,
                                  conditionJson: {
                                    ...prev.conditionJson,
                                    customFieldEquals: prev.conditionJson.customFieldEquals ? { ...prev.conditionJson.customFieldEquals, value: e.target.value } : null,
                                  },
                                }))}
                              />
                            </div>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                ) : null}

                <label className="settings-premium-label">Action</label>
                <select
                  className="input settings-premium-input"
                  data-testid="automation-rule-action"
                  value={ruleDraft.actionJson.type}
                  onChange={(e) => {
                    const nextType = e.target.value as AutomationActionDraft['type'];
                    const nextAction =
                      nextType === 'create_reminder'
                        ? { type: nextType, delayDays: 3, note: 'Automation follow-up', channel: 'in_app' }
                        : nextType === 'send_internal_notification'
                        ? { type: nextType, title: 'Dispatch review needed', body: '' }
                        : nextType === 'advance_job_stage'
                        ? { type: nextType, targetStatus: 'INVOICED' }
                        : { type: nextType, subject: 'Follow-up from MyTitan', body: 'We have an update for your job.' };
                    setRuleDraft((prev) => ({ ...prev, actionJson: nextAction }));
                  }}
                >
                  {AUTOMATION_ACTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="muted settings-premium-muted" style={{ marginTop: 6 }}>{selectedActionMeta?.description || describeAction(ruleDraft.actionJson.type)}</p>

                {ruleDraft.actionJson.type === 'create_reminder' ? (
                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    <div>
                      <label className="settings-premium-label">Delay days</label>
                      <input
                        className="input settings-premium-input"
                        data-testid="automation-rule-delay-days"
                        type="number"
                        min={0}
                        max={30}
                        value={ruleDraft.actionJson.delayDays ?? 1}
                        onChange={(e) => setRuleDraft((prev) => ({
                          ...prev,
                          actionJson: { ...prev.actionJson, delayDays: Number(e.target.value || 0) },
                        }))}
                      />
                    </div>
                    <div>
                      <label className="settings-premium-label">Reminder note</label>
                      <input
                        className="input settings-premium-input"
                        data-testid="automation-rule-note"
                        value={ruleDraft.actionJson.note || ''}
                        onChange={(e) => setRuleDraft((prev) => ({
                          ...prev,
                          actionJson: { ...prev.actionJson, note: e.target.value },
                        }))}
                      />
                    </div>
                  </div>
                ) : null}

                {ruleDraft.actionJson.type === 'send_internal_notification' ? (
                  <>
                    <label className="settings-premium-label">Notification title</label>
                    <input
                      className="input settings-premium-input"
                      value={ruleDraft.actionJson.title || ''}
                      onChange={(e) => setRuleDraft((prev) => ({
                        ...prev,
                        actionJson: { ...prev.actionJson, title: e.target.value },
                      }))}
                    />
                    <label className="settings-premium-label">Notification body</label>
                    <textarea
                      className="input settings-premium-input"
                      rows={3}
                      value={ruleDraft.actionJson.body || ''}
                      onChange={(e) => setRuleDraft((prev) => ({
                        ...prev,
                        actionJson: { ...prev.actionJson, body: e.target.value },
                      }))}
                    />
                  </>
                ) : null}

                {ruleDraft.actionJson.type === 'advance_job_stage' ? (
                  <>
                    <label className="settings-premium-label">Target status</label>
                    <select
                      className="input settings-premium-input"
                      value={ruleDraft.actionJson.targetStatus || 'INVOICED'}
                      onChange={(e) => setRuleDraft((prev) => ({
                        ...prev,
                        actionJson: { ...prev.actionJson, targetStatus: e.target.value },
                      }))}
                    >
                      {AUTOMATION_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}

                {ruleDraft.actionJson.type === 'send_customer_message' ? (
                  <>
                    <label className="settings-premium-label">Message subject</label>
                    <input
                      className="input settings-premium-input"
                      value={ruleDraft.actionJson.subject || ''}
                      onChange={(e) => setRuleDraft((prev) => ({
                        ...prev,
                        actionJson: { ...prev.actionJson, subject: e.target.value },
                      }))}
                    />
                    <label className="settings-premium-label">Message body</label>
                    <textarea
                      className="input settings-premium-input"
                      rows={4}
                      value={ruleDraft.actionJson.body || ''}
                      onChange={(e) => setRuleDraft((prev) => ({
                        ...prev,
                        actionJson: { ...prev.actionJson, body: e.target.value },
                      }))}
                    />
                    <p className="muted settings-premium-muted" style={{ marginTop: 0 }}>
                      Customer messages are prepared but not sent until a business messaging connection is ready.
                    </p>
                  </>
                ) : null}

                {automationRuleValidationError ? (
                  <p data-testid="automation-rule-validation-error" style={{ color: '#fca5a5', marginTop: 12 }}>{automationRuleValidationError}</p>
                ) : null}

                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button
                    className="button settings-premium-button"
                    type="button"
                    data-testid="automation-rule-save"
                    onClick={() => void saveAutomationRule()}
                    disabled={savingRule || Boolean(automationRuleValidationError)}
                  >
                    {savingRule ? 'Saving…' : 'Save rule'}
                  </button>
                  <button
                    className="button secondary settings-premium-button"
                    type="button"
                    onClick={() => {
                      setRuleEditorOpen(false);
                      setRuleDraft(createDefaultRuleDraft());
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <div className="card settings-premium-card">
              <h3 style={{ marginTop: 0 }}>Recent automation runs</h3>
              <p className="muted settings-premium-muted">Use recent runs to confirm rules executed, skipped, or failed against real workflow events.</p>
              <div data-testid="automation-run-list" style={{ display: 'grid', gap: 10 }}>
                {automationRunsLoading ? (
                  <p className="muted settings-premium-muted">Loading recent automation runs…</p>
                ) : automationRuns.length ? (
                  automationRuns.map((run) => (
                    <div key={run.id} data-testid="automation-run-row" style={{ border: '1px solid rgba(148,163,184,0.16)', borderRadius: 12, padding: 12 }}>
                      <strong>{run.label}</strong>
                      <div className="muted settings-premium-muted" style={{ marginTop: 4 }}>
                        {run.payloadJson?.automationRuleName ? `${run.payloadJson.automationRuleName} • ` : ''}
                        {run.payloadJson?.trigger || run.type}
                        {run.jobRef ? ` • ${run.jobRef}` : ''}
                        {run.status ? ` • ${run.status}` : ''}
                      </div>
                      <div className="muted settings-premium-muted" style={{ marginTop: 4 }}>
                        {run.actionSummary ? `Action: ${run.actionSummary}` : 'Action: not recorded'} • {run.resultSummary || 'Result recorded'}
                      </div>
                      <div className="muted settings-premium-muted" style={{ marginTop: 4 }}>
                        {run.whyItRan || 'Triggered by a matching automation event'}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted settings-premium-muted">No auto follow-up activity yet.</p>
                )}
              </div>
            </div>
          </>
        )}

        {tab === 'advanced' && (
          <>
            <p className="muted">This assistant runs on the server, so keys are never exposed in the browser.</p>
            {!features?.ai_enabled && (
              <p style={{ color: '#ffb86b' }}>
                Your current plan does not include the assistant. Upgrade in Billing to turn it on.
              </p>
            )}
            <label className="settings-premium-label">
              <input
                type="checkbox"
                checked={Boolean(form.aiEnabled)}
                onChange={(e) => setForm({ ...form, aiEnabled: e.target.checked })}
                style={{ marginRight: 8 }}
                disabled={!features?.ai_enabled}
              />
              Turn on the assistant for this workspace
            </label>

            <label style={{ display: 'block', marginTop: 12 }}>Monthly assistant limit</label>
            <input
              className="input settings-premium-input"
              type="number"
              min={0}
              value={form.aiRequestsLimit ?? ''}
              onChange={(e) => {
                const next = e.target.value === '' ? null : Number(e.target.value);
                setForm({ ...form, aiRequestsLimit: Number.isNaN(next) ? null : next });
              }}
              disabled={planCode !== 'ENTERPRISE'}
              placeholder="Leave blank for plan default"
            />
            {planCode !== 'ENTERPRISE' && (
              <p className="muted">Assistant limits come from your plan. Enterprise can change them here.</p>
            )}
          </>
        )}

        <div style={{ marginTop: 20 }}>
          <button
            className="button settings-premium-button"
            data-testid="settings-save-button"
            type="button"
            onClick={saveSettings}
            disabled={!settingsDirty || savingSettings}
          >
            {savingSettings ? 'Saving...' : settingsDirty ? 'Save changes' : 'Saved'}
          </button>
        </div>

      </div>
      </div>
</DashboardShell>
  );
}
