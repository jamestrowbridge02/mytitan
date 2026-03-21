import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { CustomFieldManager } from '../../components/custom-fields/CustomFieldManager';
import { OperatorNotice } from '../../components/feedback/OperatorNotice';
import { useOperatorNotice } from '../../components/feedback/useOperatorNotice';
import { DashboardShell } from '../../components/dashboard-shell';
import { GuidedSetupProgress } from '../../components/guided-setup-progress';
import { OperatorPageHeader } from '../../components/ui/operator-page';
import { apiFetch } from '../../lib/api';
import { getBusinessConfig, getBusinessTerms } from '../../lib/business-config';
import { useBilling } from '../../lib/billing';
import type { CustomField } from '../../lib/custom-fields';
import { isAutomationsV1Enabled, isGuidedSetupV2Enabled, isNotificationsV1Enabled } from '../../lib/feature-flags';
import { TenantSettings, useTenantSettings } from '../../lib/tenant-settings';
import { getBookingStages, getJobStages, getTechnicianStages, type WorkflowStage } from '../../lib/workflow-config';
import { emptyPermissionSnapshot, hasWorkspacePermission, normalizePermissionSnapshot } from '../../lib/workspace-permissions';

type TabKey = 'branding' | 'email' | 'pricing' | 'features' | 'workflow' | 'custom_fields' | 'automation_rules' | 'ai';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'branding', label: 'Branding' },
  { key: 'email', label: 'Email' },
  { key: 'pricing', label: 'Pricing Defaults' },
  { key: 'features', label: 'Feature Toggles' },
  { key: 'workflow', label: 'Workflow' },
  { key: 'custom_fields', label: 'Custom Fields' },
  { key: 'automation_rules', label: 'Automation Rules' },
  { key: 'ai', label: 'AI' },
];

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
  'defaultCurrency',
  'defaultItems',
  'defaultLocale',
  'defaultServiceNamePresets',
  'defaultTimezone',
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
  'smtpHost',
  'smtpPasswordEncrypted',
  'smtpPort',
  'smtpUsername',
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
  { value: 'technician.arrived', label: 'Technician arrived', description: 'Use this to notify dispatch or office staff when field work begins.' },
  { value: 'portal.document_signed', label: 'Portal document signed', description: 'Use this to continue workflow after a customer signs portal paperwork.' },
];

const AUTOMATION_ACTION_OPTIONS = [
  { value: 'create_reminder', label: 'Create reminder', description: 'Create an in-app follow-up reminder tied to the job.' },
  { value: 'send_internal_notification', label: 'Send internal notification', description: 'Log and surface an internal notification in the activity stream.' },
  { value: 'advance_job_stage', label: 'Advance job stage', description: 'Move the job to another canonical status using the existing jobs service.' },
  { value: 'send_customer_message', label: 'Queue customer message', description: 'Queue a customer follow-up message as metadata-only activity.' },
];

const AUTOMATION_STATUS_OPTIONS = ['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'CANCELLED'];

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
    title: 'Technician arrival office notification',
    description: 'Notify the office when a technician arrives on site.',
    trigger: 'technician.arrived',
    conditionJson: {},
    actionJson: { type: 'send_internal_notification', title: 'Technician arrival check-in', body: 'A technician arrived on site and the office may need to follow up.' },
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
  const { settings, refresh, setLocalSettings } = useTenantSettings();
  const { features, plan } = useBilling();
  const router = useRouter();
  const guidedSetupEnabled = isGuidedSetupV2Enabled();
  const notificationsEnabled = isNotificationsV1Enabled();
  const automationsEnabled = isAutomationsV1Enabled();
  const [tab, setTab] = useState<TabKey>('branding');
  const [form, setForm] = useState<any>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState<any>(null);
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
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [permissionsReady, setPermissionsReady] = useState(false);
  const { notice, showSuccess, showError, clearNotice } = useOperatorNotice();

  const canManageSettings = hasWorkspacePermission(permissions, 'settings.manage');
  const canManageWorkflow = hasWorkspacePermission(permissions, 'workflow.manage');
  const canManageCustomFields = hasWorkspacePermission(permissions, 'custom_fields.manage');
  const canManageAutomations = hasWorkspacePermission(permissions, 'automations.manage');

  const visibleTabs = useMemo(() => TABS.filter((item) => {
    if (item.key === 'workflow') return canManageWorkflow;
    if (item.key === 'custom_fields') return canManageCustomFields;
    if (item.key === 'automation_rules') return canManageAutomations;
    return canManageSettings;
  }), [canManageAutomations, canManageCustomFields, canManageSettings, canManageWorkflow]);

  useEffect(() => {
    if (settings) {
      setForm({ ...settings });
    }
  }, [settings]);

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
    if (queryTab && visibleTabs.some((item) => item.key === queryTab)) {
      setTab(queryTab as TabKey);
    }
  }, [router.isReady, router.query.tab, visibleTabs]);

  useEffect(() => {
    if (!visibleTabs.some((item) => item.key === tab)) {
      setTab(visibleTabs[0]?.key || 'branding');
    }
  }, [tab, visibleTabs]);

  useEffect(() => {
    if (!notificationsEnabled) return;
    apiFetch('/notifications/preferences')
      .then((res) => setNotificationPrefs(res || null))
      .catch(() => setNotificationPrefs(null));
  }, [notificationsEnabled]);

  const themeMode = form.themeMode === 'dark' ? 'dark' : 'light';

  const preview = useMemo(() => {
    return {
      primary: form.brandPrimaryColor || '#4fd1c5',
      secondary: form.brandSecondaryColor || '#1a1f36',
      accent: form.brandAccentColor || form.brandPrimaryColor || '#4fd1c5',
    };
  }, [form]);

  const workflowConfig = useMemo(() => getBusinessConfig(form), [form]);
  const workflowTerms = useMemo(() => getBusinessTerms(form), [form]);
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
    if (!automationsEnabled || tab !== 'automation_rules') return;
    void loadAutomationRules();
    void loadAutomationSuggestions();
    void loadAutomationRuns();
  }, [automationsEnabled, tab]);

  useEffect(() => {
    if (tab !== 'custom_fields' && tab !== 'workflow' && tab !== 'automation_rules') return;
    void loadCustomFields();
  }, [tab]);

  function updateBusinessConfig(updater: (current: Record<string, any>) => Record<string, any>) {
    setForm((prev: any) => ({
      ...prev,
      businessConfigJson: updater((prev?.businessConfigJson && typeof prev.businessConfigJson === 'object') ? prev.businessConfigJson : {}),
    }));
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
      { label: 'Theme', value: themeMode === 'dark' ? 'Dark' : 'Light', hint: 'Operator shell mode' },
      { label: 'Features on', value: String(enabledFeatures), hint: 'Core tenant toggles enabled' },
      { label: 'Plan', value: plan?.code || 'STANDARD', hint: 'Billing-controlled capability set' },
    ];
  }, [form.featureAI, form.featureAccounting, form.featureBookings, form.featurePayments, form.featureWhatsApp, plan?.code, themeMode]);

  async function saveSettings() {
    clearNotice();
    try {
      const payload = {
        ...form,
        emailNotificationRecipients: String(form.emailNotificationRecipients || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        defaultServiceNamePresets: String(form.defaultServiceNamePresets || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      };
      const updated = await apiFetch('/tenant/settings', {
        method: 'PUT',
        body: JSON.stringify(pickSettingsPayload(payload)),
      });
      setLocalSettings(updated as TenantSettings);
      showSuccess('Settings saved');
      await refresh();
    } catch (err: any) {
      showError(err.message || 'Failed to save settings');
    }
  }

  async function uploadLogo() {
    clearNotice();
    try {
      if (logoFile) {
        const formData = new FormData();
        formData.append('file', logoFile);
        await apiFetch('/tenant/settings/logo', { method: 'POST', body: formData });
      } else if (form.logoUrl) {
        await apiFetch('/tenant/settings/logo', {
          method: 'POST',
          body: JSON.stringify({ logoUrl: form.logoUrl }),
        });
      } else {
        showError('Choose a logo file or enter a logo URL before updating branding.');
        return;
      }
      showSuccess('Logo updated');
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

  async function updateThemeMode(mode: 'light' | 'dark') {
    clearNotice();
    try {
      const updated = await apiFetch('/tenant/settings', {
        method: 'PATCH',
        body: JSON.stringify({ themeMode: mode }),
      });
      setForm((prev: any) => ({ ...prev, themeMode: mode }));
      setLocalSettings(updated as TenantSettings);
      showSuccess('Theme updated');
      await refresh();
    } catch (err: any) {
      showError(err.message || 'Failed to update theme');
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
            eyebrow="Configuration"
            title="Settings"
            subtitle="Only owners and admins can change workspace settings."
            stats={[]}
          />
          <div className="card settings-premium-card" data-testid="settings-governance-blocked">
            <h2 style={{ marginTop: 0 }}>Access restricted</h2>
            <p className="muted settings-premium-muted" style={{ marginBottom: 0 }}>
              Your workspace role does not include settings management. Ask an owner or admin to update workspace configuration.
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
        eyebrow="Workspace setup"
        title="Settings"
        subtitle="Update your brand, defaults, team tools, and customer basics in one place."
        actions={[
          { label: 'Integrations', href: '/dashboard/integrations', variant: 'secondary' },
          { label: settings?.guidedSetupCompletedAt ? 'Review guided setup' : 'Resume guided setup', onClick: () => void runGuidedSetup() },
        ]}
        shortcuts={['Tabs keep related setup together', 'Save after each section']}
        stats={stats}
      />
      <GuidedSetupProgress enabled={guidedSetupEnabled} incomplete={!settings?.guidedSetupCompletedAt} compact />
      <div className="card settings-premium-card">
        <h1 className="settings-premium-title">Workspace settings</h1>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Appearance</h2>
          <p className="muted settings-premium-muted">Set the look, starting points, and key controls for this workspace.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className={`button settings-premium-button ${themeMode === 'light' ? '' : 'secondary'}`}
              onClick={() => updateThemeMode('light')}
            >
              Light
            </button>
            <button
              type="button"
              className={`button settings-premium-button ${themeMode === 'dark' ? '' : 'secondary'}`}
              onClick={() => updateThemeMode('dark')}
            >
              Dark
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <button type="button" className="button secondary settings-premium-button" onClick={restartDemoTour}>
              Restart demo tour
            </button>
          </div>
        </div>
        {guidedSetupEnabled ? (
          <div style={{ marginBottom: 12 }}>
            <button className="button secondary settings-premium-button" type="button" onClick={runGuidedSetup}>
              {settings?.guidedSetupCompletedAt ? 'Review guided setup' : 'Resume guided setup'}
            </button>
          </div>
        ) : null}
        <div className="tab-row">
          {visibleTabs.map((item) => (
            <button
              key={item.key}
              data-testid={`settings-tab-${item.key}`}
              className={`tab-button ${tab === item.key ? 'active' : ''}`}
              onClick={() => setTab(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'branding' && (
          <>
            <label className="settings-premium-label">Company name</label>
            <input className="input settings-premium-input" value={form.companyName || ''} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />

            <label className="settings-premium-label">Logo URL</label>
            <input className="input settings-premium-input" value={form.logoUrl || ''} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />

            <label className="settings-premium-label">Upload logo (png/jpeg/webp)</label>
            <input className="input settings-premium-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />

            <label className="settings-premium-label">Primary colour</label>
            <input className="input settings-premium-input" type="color" value={form.brandPrimaryColor || '#4fd1c5'} onChange={(e) => setForm({ ...form, brandPrimaryColor: e.target.value })} />

            <label className="settings-premium-label">Secondary colour</label>
            <input className="input settings-premium-input" type="color" value={form.brandSecondaryColor || '#1a1f36'} onChange={(e) => setForm({ ...form, brandSecondaryColor: e.target.value })} />

            <label className="settings-premium-label">Accent colour</label>
            <input className="input settings-premium-input" type="color" value={form.brandAccentColor || '#4fd1c5'} onChange={(e) => setForm({ ...form, brandAccentColor: e.target.value })} />

            <label className="settings-premium-label">Default mode</label>
            <select className="input settings-premium-input" value={form.brandDefaultMode || 'dark'} onChange={(e) => setForm({ ...form, brandDefaultMode: e.target.value })}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>

            <div className="theme-preview" style={{ background: preview.secondary }}>
              <strong style={{ color: preview.primary }}>Preview Header</strong>
              <p style={{ color: preview.accent, marginBottom: 0 }}>Accent text preview</p>
            </div>

            <button className="button settings-premium-button" type="button" onClick={uploadLogo} style={{ marginRight: 12 }}>
              Save Logo
            </button>
          </>
        )}

        {tab === 'email' && (
          <>
            <label className="settings-premium-label">Sender name</label>
            <input className="input settings-premium-input" value={form.emailSenderName || ''} onChange={(e) => setForm({ ...form, emailSenderName: e.target.value })} />

            <label className="settings-premium-label">Reply-to</label>
            <input className="input settings-premium-input" type="email" value={form.emailReplyTo || ''} onChange={(e) => setForm({ ...form, emailReplyTo: e.target.value })} />

            <label className="settings-premium-label">Notification recipients (comma separated)</label>
            <input
              className="input settings-premium-input"
              value={Array.isArray(form.emailNotificationRecipients) ? form.emailNotificationRecipients.join(', ') : form.emailNotificationRecipients || ''}
              onChange={(e) => setForm({ ...form, emailNotificationRecipients: e.target.value })}
            />

            <label className="settings-premium-label">SMTP host (placeholder)</label>
            <input className="input settings-premium-input" value={form.smtpHost || ''} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} />

            <label className="settings-premium-label">SMTP port (placeholder)</label>
            <input className="input settings-premium-input" type="number" value={form.smtpPort || ''} onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) || undefined })} />

            <label className="settings-premium-label">SMTP username (placeholder)</label>
            <input className="input settings-premium-input" value={form.smtpUsername || ''} onChange={(e) => setForm({ ...form, smtpUsername: e.target.value })} />
          </>
        )}

        {tab === 'pricing' && (
          <>
            <label className="settings-premium-label">WhatsApp template default</label>
            <textarea className="input settings-premium-input" rows={4} value={form.whatsappTemplateDefault || ''} onChange={(e) => setForm({ ...form, whatsappTemplateDefault: e.target.value })} />

            <label className="settings-premium-label">
              <input
                type="checkbox"
                checked={Boolean(form.vatEnabledDefault)}
                onChange={(e) => setForm({ ...form, vatEnabledDefault: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              VAT enabled by default
            </label>

            <label className="settings-premium-label">VAT rate (basis points)</label>
            <input className="input settings-premium-input" type="number" min={0} value={form.vatRateBpsDefault || 0} onChange={(e) => setForm({ ...form, vatRateBpsDefault: Number(e.target.value) })} />

            <label className="settings-premium-label">Currency</label>
            <input className="input settings-premium-input" value={form.defaultCurrency || 'USD'} onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value.toUpperCase() })} />

            <label className="settings-premium-label">Locale</label>
            <input className="input settings-premium-input" value={form.defaultLocale || 'en-US'} onChange={(e) => setForm({ ...form, defaultLocale: e.target.value })} />

            <label className="settings-premium-label">Timezone</label>
            <input className="input settings-premium-input" value={form.defaultTimezone || 'UTC'} onChange={(e) => setForm({ ...form, defaultTimezone: e.target.value })} />

            <label className="settings-premium-label">Default service names (comma separated)</label>
            <input
              className="input settings-premium-input"
              value={Array.isArray(form.defaultServiceNamePresets) ? form.defaultServiceNamePresets.join(', ') : form.defaultServiceNamePresets || ''}
              onChange={(e) => setForm({ ...form, defaultServiceNamePresets: e.target.value })}
            />

            <label className="settings-premium-label">Default wheel pricing mode</label>
            <select
              className="input settings-premium-input"
              value={form.defaultWheelPricingMode || ''}
              onChange={(e) => setForm({ ...form, defaultWheelPricingMode: e.target.value || null })}
            >
              <option value="">None</option>
              <option value="PER_WHEEL">PER_WHEEL</option>
              <option value="SET">SET</option>
            </select>
          </>
        )}

        {tab === 'features' && (
          <>
            {[
              ['bookingsEnabled', 'Bookings enabled'],
              ['accountingEnabled', 'Accounting enabled'],
              ['paymentsEnabled', 'Payments enabled'],
              ['socialEnabled', 'Social enabled'],
              ['aiEnabled', 'AI enabled'],
            ].map(([key, label]) => (
              <label key={key} style={{ display: 'block', marginBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={Boolean(form[key])}
                  onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                  style={{ marginRight: 8 }}
                />
                {label}
              </label>
            ))}
            {notificationsEnabled ? (
              <div className="card settings-premium-card" style={{ marginTop: 12 }}>
                <h3 style={{ marginTop: 0 }}>Notifications</h3>
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

        {tab === 'workflow' && (
          <>
            <div className="card settings-premium-card" data-testid="settings-workflow-panel" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Business terminology</h3>
              <p className="muted settings-premium-muted">Adapt the language operators and customers see so MyTitan matches your business model.</p>

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
              <h3 style={{ marginTop: 0 }}>Operational defaults</h3>
              <p className="muted settings-premium-muted">Choose which live board operators open and which optional areas stay visible in the menu.</p>

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
                ['showTechnicianQueue', 'Show Technician queue in operator nav'],
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

            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Portal wording</h3>
              <p className="muted settings-premium-muted">Override key customer-safe billing messages without changing the portal security model.</p>

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

            <div className="card settings-premium-card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>Technician prompts</h3>
              <p className="muted settings-premium-muted">Supply one checklist item per line to tailor the field handoff workflow for your team.</p>

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

            {stageSections.map(({ key: sectionKey, title, stages }) => (
              <div className="card settings-premium-card" key={sectionKey} style={{ marginBottom: 12 }}>
                <h3 style={{ marginTop: 0 }}>{title}</h3>
                <p className="muted settings-premium-muted">Rename, reorder, and hide UI stages while keeping canonical statuses intact.</p>

                <div style={{ display: 'grid', gap: 12 }}>
                  {stages.map((stage, index) => (
                    <div key={`${sectionKey}-${stage.id}`} style={{ border: '1px solid rgba(148,163,184,0.18)', borderRadius: 14, padding: 12 }}>
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

                      <label className="settings-premium-label">Required custom field keys</label>
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
                        Available {sectionKey} keys: {customFields.filter((field) => field.entityType === (sectionKey === 'jobs' ? 'job' : sectionKey === 'bookings' ? 'booking' : 'technician')).map((field) => field.key).join(', ') || 'none yet'}
                      </p>

                      <label className="settings-premium-label">Enforcement mode</label>
                      <select
                        className="input settings-premium-input"
                        data-testid="workflow-stage-enforcement-toggle"
                        value={stage.requiredFieldEnforcementMode === 'block' ? 'block' : 'warn'}
                        onChange={(e) => updateWorkflowStages(sectionKey, stages.map((item) => item.id === stage.id ? {
                          ...item,
                          requiredFieldEnforcementMode: e.target.value === 'block' ? 'block' : 'warn',
                        } : item))}
                      >
                        <option value="warn">Warn only</option>
                        <option value="block">Block transition</option>
                      </select>
                      <p className="muted settings-premium-muted" style={{ marginBottom: 10 }}>
                        {Array.isArray(stage.requiredCustomFieldKeys) && stage.requiredCustomFieldKeys.length
                          ? `This stage requires: ${stage.requiredCustomFieldKeys.join(', ')}`
                          : 'This stage has no required custom fields configured.'}
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
              <strong>Workflow preview</strong>
              <p className="muted" style={{ margin: '8px 0 0' }}>
                {workflowTerms.jobs}, {workflowTerms.bookings}, {workflowTerms.customers}, and {workflowTerms.technicians} will update across key operator surfaces after save.
              </p>
              <p className="muted" style={{ margin: '8px 0 0' }}>
                Bookings stages: {bookingStages.filter((stage) => stage.visible !== false).map((stage) => stage.label).join(' → ') || 'Hidden'}
              </p>
              <p className="muted" style={{ margin: '8px 0 0' }}>
                {workflowTerms.jobs} stages: {jobStages.filter((stage) => stage.visible !== false).map((stage) => stage.label).join(' → ') || 'Hidden'}
              </p>
              <p className="muted" style={{ margin: '8px 0 0' }}>
                {workflowTerms.technicians} stages: {technicianStages.filter((stage) => stage.visible !== false).map((stage) => stage.label).join(' → ') || 'Hidden'}
              </p>
            </div>
          </>
        )}

        {tab === 'custom_fields' && (
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

        {tab === 'automation_rules' && (
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
                  <p className="muted settings-premium-muted">No workspace automation rules yet.</p>
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
                    <label className="settings-premium-label">Condition: workflow stage ready</label>
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
                    <p className="muted settings-premium-muted" style={{ marginTop: 6 }}>Only run when the selected job workflow stage has all required custom fields present.</p>
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
                      Customer messages are queued as metadata-only activity in this MVP. Delivery execution remains a future integration seam.
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
                  <p className="muted settings-premium-muted">No automation runs recorded yet.</p>
                )}
              </div>
            </div>
          </>
        )}

        {tab === 'ai' && (
          <>
            <p className="muted">The tenant AI assistant uses the server-side OpenAI Responses API and never exposes keys to the browser.</p>
            {!features?.ai_enabled && (
              <p style={{ color: '#ffb86b' }}>
                Your current plan does not include AI. Upgrade in Billing to enable it.
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
              Enable AI assistant for this tenant
            </label>

            <label style={{ display: 'block', marginTop: 12 }}>AI requests limit (per month)</label>
            <input
              className="input settings-premium-input"
              type="number"
              min={0}
              value={form.aiRequestsLimit ?? ''}
              onChange={(e) => {
                const next = e.target.value === '' ? null : Number(e.target.value);
                setForm({ ...form, aiRequestsLimit: Number.isNaN(next) ? null : next });
              }}
              disabled={plan?.code !== 'ENTERPRISE'}
              placeholder="Leave blank for plan default"
            />
            {plan?.code !== 'ENTERPRISE' && (
              <p className="muted">AI limits are managed by your plan. Enterprise can override caps.</p>
            )}
          </>
        )}

        <div style={{ marginTop: 20 }}>
          <button className="button settings-premium-button" data-testid="settings-save-button" type="button" onClick={saveSettings}>
            Save Settings
          </button>
        </div>

      </div>
      </div>
</DashboardShell>
  );
}
