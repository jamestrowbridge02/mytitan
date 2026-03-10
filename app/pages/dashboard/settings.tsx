import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { OperatorNotice } from '../../components/feedback/OperatorNotice';
import { useOperatorNotice } from '../../components/feedback/useOperatorNotice';
import { DashboardShell } from '../../components/dashboard-shell';
import { GuidedSetupProgress } from '../../components/guided-setup-progress';
import { OperatorPageHeader } from '../../components/ui/operator-page';
import { apiFetch } from '../../lib/api';
import { getBusinessConfig, getBusinessTerms } from '../../lib/business-config';
import { useBilling } from '../../lib/billing';
import { isGuidedSetupV2Enabled, isNotificationsV1Enabled } from '../../lib/feature-flags';
import { TenantSettings, useTenantSettings } from '../../lib/tenant-settings';
import { getBookingStages, getJobStages, getTechnicianStages, type WorkflowStage } from '../../lib/workflow-config';

type TabKey = 'branding' | 'email' | 'pricing' | 'features' | 'workflow' | 'ai';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'branding', label: 'Branding' },
  { key: 'email', label: 'Email' },
  { key: 'pricing', label: 'Pricing Defaults' },
  { key: 'features', label: 'Feature Toggles' },
  { key: 'workflow', label: 'Workflow' },
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

function renderStatuses(stage: WorkflowStage) {
  return stage.statuses.join(', ');
}

export default function SettingsPage() {
  const { settings, refresh, setLocalSettings } = useTenantSettings();
  const { features, plan } = useBilling();
  const router = useRouter();
  const guidedSetupEnabled = isGuidedSetupV2Enabled();
  const notificationsEnabled = isNotificationsV1Enabled();
  const [tab, setTab] = useState<TabKey>('branding');
  const [form, setForm] = useState<any>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState<any>(null);
  const { notice, showSuccess, showError, clearNotice } = useOperatorNotice();

  useEffect(() => {
    if (settings) {
      setForm({ ...settings });
    }
  }, [settings]);

  useEffect(() => {
    if (!router.isReady) return;
    const queryTab = typeof router.query.tab === 'string' ? router.query.tab : '';
    if (queryTab && TABS.some((item) => item.key === queryTab)) {
      setTab(queryTab as TabKey);
    }
  }, [router.isReady, router.query.tab]);

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
  const stageSections: StageSectionConfig[] = useMemo(() => [
    { key: 'bookings', title: 'Bookings workflow', stages: bookingStages },
    { key: 'jobs', title: 'Jobs workflow', stages: jobStages },
    { key: 'technician', title: 'Technician workflow', stages: technicianStages },
  ], [bookingStages, jobStages, technicianStages]);

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
      await apiFetch('/guided-setup/reset', { method: 'POST' });
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

  return (
    <DashboardShell>
  <div className="settings-premium-shell">
      <OperatorNotice notice={notice} onDismiss={clearNotice} />
      <OperatorPageHeader
        eyebrow="Configuration"
        title="Settings"
        subtitle="Keep appearance, defaults, and tenant capability controls in one consistent workspace."
        actions={[
          { label: 'Integrations', href: '/dashboard/integrations', variant: 'secondary' },
          { label: 'Run guided setup', onClick: () => void runGuidedSetup() },
        ]}
        shortcuts={['Tabs keep configuration areas compact', 'Save once after grouped edits']}
        stats={stats}
      />
      <GuidedSetupProgress enabled={guidedSetupEnabled} incomplete={!settings?.guidedSetupCompletedAt} compact />
      <div className="card settings-premium-card">
        <h1 className="settings-premium-title">Tenant Settings</h1>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Appearance</h2>
          <p className="muted settings-premium-muted">Theme mode</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className={`button ${themeMode === 'light' ? '' : 'secondary'}`}
              onClick={() => updateThemeMode('light')}
            >
              Light
            </button>
            <button
              type="button"
              className={`button ${themeMode === 'dark' ? '' : 'secondary'}`}
              onClick={() => updateThemeMode('dark')}
            >
              Dark
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <button type="button" className="button secondary settings-premium-button" onClick={restartDemoTour}>
              Restart  tour
            </button>
          </div>
        </div>
        {guidedSetupEnabled ? (
          <div style={{ marginBottom: 12 }}>
            <button className="button secondary settings-premium-button" type="button" onClick={runGuidedSetup}>
              Run guided setup again
            </button>
          </div>
        ) : null}
        <div className="tab-row">
          {TABS.map((item) => (
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
              <p className="muted settings-premium-muted">Choose how operators land in Command Centre and which optional destinations stay visible in navigation.</p>

              <label className="settings-premium-label">Default Command Centre experience</label>
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
