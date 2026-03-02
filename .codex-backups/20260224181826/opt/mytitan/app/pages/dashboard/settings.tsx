import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardShell } from '../../components/dashboard-shell';
import { GuidedSetupProgress } from '../../components/guided-setup-progress';
import { apiFetch } from '../../lib/api';
import { useBilling } from '../../lib/billing';
import { isGuidedSetupV2Enabled } from '../../lib/feature-flags';
import { TenantSettings, useTenantSettings } from '../../lib/tenant-settings';

type TabKey = 'branding' | 'email' | 'pricing' | 'features' | 'ai';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'branding', label: 'Branding' },
  { key: 'email', label: 'Email' },
  { key: 'pricing', label: 'Pricing Defaults' },
  { key: 'features', label: 'Feature Toggles' },
  { key: 'ai', label: 'AI' },
];

export default function SettingsPage() {
  const { settings, refresh, setLocalSettings } = useTenantSettings();
  const { features, plan } = useBilling();
  const router = useRouter();
  const guidedSetupEnabled = isGuidedSetupV2Enabled();
  const [tab, setTab] = useState<TabKey>('branding');
  const [form, setForm] = useState<any>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (settings) {
      setForm({ ...settings });
    }
  }, [settings]);

  const themeMode = form.themeMode === 'dark' ? 'dark' : 'light';

  const preview = useMemo(() => {
    return {
      primary: form.brandPrimaryColor || '#4fd1c5',
      secondary: form.brandSecondaryColor || '#1a1f36',
      accent: form.brandAccentColor || form.brandPrimaryColor || '#4fd1c5',
    };
  }, [form]);

  async function saveSettings() {
    setStatus('');
    setError('');
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
        body: JSON.stringify(payload),
      });
      setLocalSettings(updated as TenantSettings);
      setStatus('Settings saved');
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    }
  }

  async function uploadLogo() {
    setStatus('');
    setError('');
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
      setStatus('Logo updated');
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to upload logo');
    }
  }

  async function runGuidedSetup() {
    setStatus('');
    setError('');
    try {
      await apiFetch('/guided-setup/reset', { method: 'POST' });
      router.push('/dashboard/setup-wizard');
    } catch (err: any) {
      setError(err.message || 'Failed to start guided setup');
    }
  }

  async function updateThemeMode(mode: 'light' | 'dark') {
    setStatus('');
    setError('');
    try {
      const updated = await apiFetch('/tenant/settings', {
        method: 'PATCH',
        body: JSON.stringify({ themeMode: mode }),
      });
      setForm((prev: any) => ({ ...prev, themeMode: mode }));
      setLocalSettings(updated as TenantSettings);
      setStatus('Theme updated');
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to update theme');
    }
  }

  function restartDemoTour() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem('mytitan_demo_tour_seen_v1');
    setStatus(' tour reset. Open dashboard to start again.');
  }

  return (
    <DashboardShell>
      <GuidedSetupProgress enabled={guidedSetupEnabled} incomplete={!settings?.guidedSetupCompletedAt} compact />
      <div className="card">
        <h1>Tenant Settings</h1>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Appearance</h2>
          <p className="muted">Theme mode</p>
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
            <button type="button" className="button secondary" onClick={restartDemoTour}>
              Restart  tour
            </button>
          </div>
        </div>
        {guidedSetupEnabled ? (
          <div style={{ marginBottom: 12 }}>
            <button className="button secondary" type="button" onClick={runGuidedSetup}>
              Run guided setup again
            </button>
          </div>
        ) : null}
        <div className="tab-row">
          {TABS.map((item) => (
            <button
              key={item.key}
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
            <label>Company name</label>
            <input className="input" value={form.companyName || ''} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />

            <label>Logo URL</label>
            <input className="input" value={form.logoUrl || ''} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />

            <label>Upload logo (png/jpeg/webp)</label>
            <input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />

            <label>Primary colour</label>
            <input className="input" type="color" value={form.brandPrimaryColor || '#4fd1c5'} onChange={(e) => setForm({ ...form, brandPrimaryColor: e.target.value })} />

            <label>Secondary colour</label>
            <input className="input" type="color" value={form.brandSecondaryColor || '#1a1f36'} onChange={(e) => setForm({ ...form, brandSecondaryColor: e.target.value })} />

            <label>Accent colour</label>
            <input className="input" type="color" value={form.brandAccentColor || '#4fd1c5'} onChange={(e) => setForm({ ...form, brandAccentColor: e.target.value })} />

            <label>Default mode</label>
            <select className="input" value={form.brandDefaultMode || 'dark'} onChange={(e) => setForm({ ...form, brandDefaultMode: e.target.value })}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>

            <div className="theme-preview" style={{ background: preview.secondary }}>
              <strong style={{ color: preview.primary }}>Preview Header</strong>
              <p style={{ color: preview.accent, marginBottom: 0 }}>Accent text preview</p>
            </div>

            <button className="button" type="button" onClick={uploadLogo} style={{ marginRight: 12 }}>
              Save Logo
            </button>
          </>
        )}

        {tab === 'email' && (
          <>
            <label>Sender name</label>
            <input className="input" value={form.emailSenderName || ''} onChange={(e) => setForm({ ...form, emailSenderName: e.target.value })} />

            <label>Reply-to</label>
            <input className="input" type="email" value={form.emailReplyTo || ''} onChange={(e) => setForm({ ...form, emailReplyTo: e.target.value })} />

            <label>Notification recipients (comma separated)</label>
            <input
              className="input"
              value={Array.isArray(form.emailNotificationRecipients) ? form.emailNotificationRecipients.join(', ') : form.emailNotificationRecipients || ''}
              onChange={(e) => setForm({ ...form, emailNotificationRecipients: e.target.value })}
            />

            <label>SMTP host (placeholder)</label>
            <input className="input" value={form.smtpHost || ''} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} />

            <label>SMTP port (placeholder)</label>
            <input className="input" type="number" value={form.smtpPort || ''} onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) || undefined })} />

            <label>SMTP username (placeholder)</label>
            <input className="input" value={form.smtpUsername || ''} onChange={(e) => setForm({ ...form, smtpUsername: e.target.value })} />
          </>
        )}

        {tab === 'pricing' && (
          <>
            <label>WhatsApp template default</label>
            <textarea className="input" rows={4} value={form.whatsappTemplateDefault || ''} onChange={(e) => setForm({ ...form, whatsappTemplateDefault: e.target.value })} />

            <label>
              <input
                type="checkbox"
                checked={Boolean(form.vatEnabledDefault)}
                onChange={(e) => setForm({ ...form, vatEnabledDefault: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              VAT enabled by default
            </label>

            <label>VAT rate (basis points)</label>
            <input className="input" type="number" min={0} value={form.vatRateBpsDefault || 0} onChange={(e) => setForm({ ...form, vatRateBpsDefault: Number(e.target.value) })} />

            <label>Currency</label>
            <input className="input" value={form.defaultCurrency || 'USD'} onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value.toUpperCase() })} />

            <label>Locale</label>
            <input className="input" value={form.defaultLocale || 'en-US'} onChange={(e) => setForm({ ...form, defaultLocale: e.target.value })} />

            <label>Timezone</label>
            <input className="input" value={form.defaultTimezone || 'UTC'} onChange={(e) => setForm({ ...form, defaultTimezone: e.target.value })} />

            <label>Default service names (comma separated)</label>
            <input
              className="input"
              value={Array.isArray(form.defaultServiceNamePresets) ? form.defaultServiceNamePresets.join(', ') : form.defaultServiceNamePresets || ''}
              onChange={(e) => setForm({ ...form, defaultServiceNamePresets: e.target.value })}
            />

            <label>Default wheel pricing mode</label>
            <select
              className="input"
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
            <label>
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
              className="input"
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
          <button className="button" type="button" onClick={saveSettings}>
            Save Settings
          </button>
        </div>

        {status && <p style={{ color: '#7bdba5' }}>{status}</p>}
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}
      </div>
    </DashboardShell>
  );
}
