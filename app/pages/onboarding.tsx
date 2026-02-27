import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { AiAssistant } from '../components/ai-assistant';
import { apiFetch } from '../lib/api';
import { isMarketplaceEnabled, isStartHereEnabled } from '../lib/feature-flags';
import { useTenantSettings } from '../lib/tenant-settings';

type Integration = {
  key: string;
  name: string;
  description: string;
  configureUrl: string;
  enabled: boolean;
  allowed: boolean;
};

type TradeOption = 'WHEELS' | 'BODYSHOP' | 'GARAGE' | 'MOBILE';
type TradePack = {
  code: string;
  name: string;
  description: string;
  includes: string[];
  installed: boolean;
};

const START_HERE_TITLES = [
  'What do you do?',
  'Branding',
  'Email',
  'Services & Catalog',
  'Bookings',
  'Billing',
  'Go Live',
];

const CLASSIC_TITLES = [
  'Branding',
  'Email',
  'Choose a Trade Pack',
  'Services & Catalog',
  'Bookings',
  'Billing',
  'Go Live',
];

const TRADE_OPTIONS: Array<{ key: TradeOption; title: string; description: string }> = [
  { key: 'WHEELS', title: 'Wheels', description: 'Tyres, wheel alignment, alloy and wheel services.' },
  { key: 'BODYSHOP', title: 'Bodyshop', description: 'Body repair, paint, scratches, and dent work.' },
  { key: 'GARAGE', title: 'Garage', description: 'General servicing, diagnostics, brakes, and MOT prep.' },
  { key: 'MOBILE', title: 'Mobile Tech', description: 'On-site diagnostics and mobile repairs.' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { settings } = useTenantSettings();
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [primary, setPrimary] = useState('#4fd1c5');
  const [secondary, setSecondary] = useState('#1a1f36');
  const [accent, setAccent] = useState('#4fd1c5');
  const [senderName, setSenderName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [unitPrice, setUnitPrice] = useState('0');
  const [defaultQty, setDefaultQty] = useState('1');
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedTrade, setSelectedTrade] = useState<TradeOption | ''>('');
  const [persistedTrade, setPersistedTrade] = useState<TradeOption | ''>('');
  const [selectedPack, setSelectedPack] = useState('');
  const [tradePacks, setTradePacks] = useState<TradePack[]>([]);
  const [installedPacks, setInstalledPacks] = useState<string[]>([]);
  const [bookingPublicEnabled, setBookingPublicEnabled] = useState(false);
  const [startHour, setStartHour] = useState('09:00');
  const [endHour, setEndHour] = useState('17:00');

  const marketplaceEnabled = isMarketplaceEnabled();
  const startHereEnabled = isStartHereEnabled();
  const guidedEnabled = marketplaceEnabled || startHereEnabled;
  const stepTitles = startHereEnabled ? START_HERE_TITLES : CLASSIC_TITLES;
  const progress = useMemo(() => Math.round(((step + 1) / stepTitles.length) * 100), [step, stepTitles.length]);

  const index = startHereEnabled
    ? { trade: 0, branding: 1, email: 2, pack: -1, services: 3, bookings: 4, billing: 5, live: 6 }
    : { trade: -1, branding: 0, email: 1, pack: 2, services: 3, bookings: 4, billing: 5, live: 6 };

  useEffect(() => {
    if (!guidedEnabled) return;
    const load = async () => {
      try {
        const data = await apiFetch('/onboarding/status');
        if (typeof data?.onboardingStep === 'number') {
          setStep(Math.min(data.onboardingStep, stepTitles.length - 1));
        }
      } catch {
        // ignore
      }
    };
    load();
  }, [guidedEnabled, stepTitles.length]);

  useEffect(() => {
    if (!startHereEnabled) return;
    const loadTrade = async () => {
      try {
        const data = await apiFetch('/onboarding/trade');
        if (data?.trade) {
          const trade = data.trade as TradeOption;
          setSelectedTrade(trade);
          setPersistedTrade(trade);
        }
        if (Array.isArray(data?.installedPacks)) {
          setInstalledPacks(data.installedPacks.map((item: any) => item.packCode));
        }
      } catch {
        // ignore
      }
    };
    loadTrade();
  }, [startHereEnabled]);

  useEffect(() => {
    if (startHereEnabled || !marketplaceEnabled) return;
    const loadTradePacks = async () => {
      try {
        const data = await apiFetch('/trade-packs');
        const list = Array.isArray(data) ? data : [];
        setTradePacks(list);
        const installed = list.find((item: TradePack) => item.installed);
        if (installed) {
          setSelectedPack(installed.code);
        }
      } catch {
        // ignore
      }
    };
    loadTradePacks();
  }, [startHereEnabled, marketplaceEnabled]);

  useEffect(() => {
    if (!settings) return;
    setLogoUrl(settings.logoUrl || '');
    setCompanyName(settings.companyName || '');
    setPrimary(settings.brandPrimaryColor || '#4fd1c5');
    setSecondary(settings.brandSecondaryColor || '#1a1f36');
    setAccent(settings.brandAccentColor || '#4fd1c5');
    setSenderName(settings.emailSenderName || '');
    setReplyTo(settings.emailReplyTo || '');
    setBookingPublicEnabled(Boolean(settings.bookingPublicEnabled));
    if (!selectedTrade && settings.primaryTrade) {
      const trade = settings.primaryTrade as TradeOption;
      setSelectedTrade(trade);
      setPersistedTrade(trade);
    }
  }, [settings, selectedTrade]);

  useEffect(() => {
    if (!marketplaceEnabled) return;
    const loadIntegrations = async () => {
      try {
        const data = await apiFetch('/integrations');
        setIntegrations(Array.isArray(data) ? data : []);
      } catch {
        // ignore
      }
    };
    loadIntegrations();
  }, [marketplaceEnabled]);

  const presets = ['Wheel Alignment', 'Tyre Change', 'Brake Inspection', 'Oil Service'];

  const toggleIntegration = (key: string) => {
    setIntegrations((prev) => prev.map((item) => (item.key === key ? { ...item, enabled: !item.enabled } : item)));
  };

  const buildBusinessHours = () => {
    const [startH, startM] = startHour.split(':').map(Number);
    const [endH, endM] = endHour.split(':').map(Number);
    const startMinute = startH * 60 + startM;
    const endMinute = endH * 60 + endM;
    return [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinute, endMinute }));
  };

  async function saveStep() {
    setError('');
    setStatus('');
    setSaving(true);
    try {
      if (step === index.trade) {
        if (!selectedTrade) {
          throw new Error('Please choose your trade type to continue.');
        }
        if (
          persistedTrade &&
          selectedTrade !== persistedTrade &&
          typeof window !== 'undefined' &&
          !window.confirm(
            `Change trade from ${persistedTrade} to ${selectedTrade}? This updates defaults and does not delete existing tenant data.`,
          )
        ) {
          return false;
        }
        await apiFetch('/onboarding/select-trade', {
          method: 'POST',
          body: JSON.stringify({ trade: selectedTrade }),
        });
        setPersistedTrade(selectedTrade);
      }

      if (step === index.branding) {
        let nextLogoUrl = logoUrl;
        if (logoFile) {
          const form = new FormData();
          form.append('file', logoFile);
          const upload = await apiFetch('/tenant/settings/logo', { method: 'POST', body: form });
          nextLogoUrl = upload?.logoUrl || nextLogoUrl;
        }
        await apiFetch('/onboarding/step', {
          method: 'POST',
          body: JSON.stringify({
            step,
            data: {
              companyName,
              logoUrl: nextLogoUrl,
              brandPrimaryColor: primary,
              brandSecondaryColor: secondary,
              brandAccentColor: accent,
            },
          }),
        });
      }

      if (step === index.email) {
        await apiFetch('/onboarding/step', {
          method: 'POST',
          body: JSON.stringify({
            step,
            data: {
              emailSenderName: senderName,
              emailReplyTo: replyTo,
            },
          }),
        });
      }

      if (step === index.pack) {
        await apiFetch('/onboarding/step', {
          method: 'POST',
          body: JSON.stringify({ step, data: { packCode: selectedPack || undefined } }),
        });
      }

      if (step === index.services) {
        await apiFetch('/onboarding/step', {
          method: 'POST',
          body: JSON.stringify({
            step,
            data: {
              serviceName,
              unitPrice,
              defaultQty,
            },
          }),
        });
      }

      if (step === index.bookings) {
        await apiFetch('/onboarding/step', {
          method: 'POST',
          body: JSON.stringify({
            step,
            data: {
              bookingPublicEnabled,
              businessHours: buildBusinessHours(),
            },
          }),
        });
      }

      if (step === index.billing) {
        await apiFetch('/onboarding/step', {
          method: 'POST',
          body: JSON.stringify({ step, data: {} }),
        });
      }

      if (step === index.live) {
        await apiFetch('/onboarding/step', {
          method: 'POST',
          body: JSON.stringify({
            step,
            data: {
              integrations: integrations.map((item) => ({ key: item.key, enabled: item.enabled })),
            },
          }),
        });
        await apiFetch('/onboarding/complete', { method: 'POST' });
        router.replace(startHereEnabled ? '/start' : '/dashboard');
        return;
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save step');
      return false;
    } finally {
      setSaving(false);
    }
    return true;
  }

  async function handleSaveStep() {
    const ok = await saveStep();
    if (ok) {
      setStatus('Saved. Moving to the next step.');
      setStep((prev) => Math.min(prev + 1, stepTitles.length - 1));
    }
  }

  async function handleSaveExit() {
    const ok = await saveStep();
    if (ok) {
      router.replace(startHereEnabled ? '/start' : '/dashboard');
    }
  }

  if (!guidedEnabled) {
    return (
      <div className="container">
        <div className="card">
          <h1>Setup wizard</h1>
          <p className="muted">The guided setup wizard is currently disabled.</p>
          <Link className="button" href="/dashboard">Go to dashboard</Link>
        </div>
      </div>
    );
  }

  const aiAllowed = Boolean(settings?.featureAI ?? settings?.aiEnabled);

  return (
    <div className="container">
      <div className="card">
        <div className="wizard-header">
          <div>
            <h1>Let&apos;s set up your workspace</h1>
            <p className="muted">Simple steps so you can start taking customers quickly.</p>
          </div>
          <div className="wizard-step">
            Step {step + 1} of {stepTitles.length}
          </div>
        </div>

        <div className="progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <h3 style={{ marginTop: 18 }}>{stepTitles[step]}</h3>

        {step === index.trade && (
          <>
            <p className="muted">Choose your main trade. We will install the matching defaults for you.</p>
            {selectedTrade ? (
              <p className="muted" style={{ marginBottom: 8 }}>
                Selected: <strong>{selectedTrade}</strong>. You can change this any time. Changing trade updates defaults and does not delete your existing data.
              </p>
            ) : null}
            {persistedTrade && selectedTrade && selectedTrade !== persistedTrade ? (
              <p style={{ color: '#f7c46a', marginBottom: 8 }}>
                Warning: this will change your primary trade from <strong>{persistedTrade}</strong> to <strong>{selectedTrade}</strong>.
              </p>
            ) : null}
            {installedPacks.length > 0 ? (
              <p className="muted" style={{ marginBottom: 8 }}>Installed packs: {installedPacks.join(', ')}</p>
            ) : null}
            <div className="list">
              {TRADE_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className="integration-card"
                  onClick={() => setSelectedTrade(option.key)}
                  style={{ textAlign: 'left', cursor: 'pointer', border: selectedTrade === option.key ? '1px solid var(--tenant-primary)' : undefined }}
                >
                  <strong>{option.title}</strong>
                  <p className="muted">{option.description}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {step === index.branding && (
          <>
            <label>Business name</label>
            <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            <label>Logo (upload or paste URL)</label>
            <input className="input" type="file" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
            <input className="input" placeholder="https://..." value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
            <div className="list">
              <div className="theme-preview">
                <strong>Colour preview</strong>
                <div className="color-row">
                  <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} />
                  <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} />
                  <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
                </div>
              </div>
            </div>
          </>
        )}

        {step === index.email && (
          <>
            <label>Sender name</label>
            <input className="input" value={senderName} onChange={(e) => setSenderName(e.target.value)} />
            <label>Support / reply-to email</label>
            <input className="input" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
            <button className="button secondary" type="button" onClick={() => setStatus('Test email queued (stub).')}>
              Send test email
            </button>
            <p className="muted">You can connect SMTP later in Settings.</p>
          </>
        )}

        {step === index.pack && (
          <>
            <p className="muted">Choose a trade pack or skip for now.</p>
            <div className="list">
              {tradePacks.map((pack) => (
                <div key={pack.code} className="integration-card">
                  <div>
                    <strong>{pack.name}</strong>
                    <p className="muted">{pack.description}</p>
                  </div>
                  <div className="integration-actions">
                    {pack.installed ? <span className="badge">Installed</span> : null}
                    <button className={`toggle ${selectedPack === pack.code ? 'on' : ''}`} type="button" onClick={() => setSelectedPack(pack.code)}>
                      {selectedPack === pack.code ? 'Selected' : 'Select'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button className="button secondary" type="button" onClick={() => setSelectedPack('')}>
              Skip for now
            </button>
          </>
        )}

        {step === index.services && (
          <>
            <label>Quick service preset</label>
            <div className="pill-row">
              {presets.map((preset) => (
                <button key={preset} type="button" className="pill" onClick={() => setServiceName(preset)}>
                  {preset}
                </button>
              ))}
            </div>
            <label>Service name</label>
            <input className="input" value={serviceName} onChange={(e) => setServiceName(e.target.value)} />
            <label>Unit price</label>
            <input className="input" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            <label>Default quantity</label>
            <input className="input" type="number" value={defaultQty} onChange={(e) => setDefaultQty(e.target.value)} />
          </>
        )}

        {step === index.bookings && (
          <>
            <p className="muted">Choose how customers can request bookings online.</p>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={bookingPublicEnabled}
                onChange={(e) => setBookingPublicEnabled(e.target.checked)}
              />
              Enable public booking requests
            </label>
            <div className="two-col">
              <div>
                <label>Start time</label>
                <input className="input" type="time" value={startHour} onChange={(e) => setStartHour(e.target.value)} />
              </div>
              <div>
                <label>End time</label>
                <input className="input" type="time" value={endHour} onChange={(e) => setEndHour(e.target.value)} />
              </div>
            </div>
            <p className="muted">These hours apply Monday-Friday. You can fine-tune later in Bookings.</p>
          </>
        )}

        {step === index.billing && (
          <>
            <p className="muted">Connect billing so you can take payments and send invoices.</p>
            <Link className="button secondary" href="/dashboard/billing">Open billing setup</Link>
          </>
        )}

        {step === index.live && (
          <>
            <p className="muted">Switch on the tools you want to try first. You can change this later.</p>
            <div className="list">
              {integrations.map((item) => (
                <div key={item.key} className="integration-card">
                  <div>
                    <strong>{item.name}</strong>
                    <p className="muted">{item.description}</p>
                  </div>
                  <div className="integration-actions">
                    {!item.allowed ? <span className="badge warn">Upgrade required</span> : null}
                    <button
                      type="button"
                      className={`toggle ${item.enabled ? 'on' : ''}`}
                      onClick={() => item.allowed && toggleIntegration(item.key)}
                      disabled={!item.allowed}
                    >
                      {item.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {status && <p style={{ color: '#7bdba5' }}>{status}</p>}
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}

        <div style={{ marginTop: 16 }}>
          {step > 0 && (
            <button className="button secondary" type="button" onClick={() => setStep(step - 1)} style={{ marginRight: 10 }}>
              Back
            </button>
          )}
          <button className="button secondary" type="button" onClick={handleSaveExit} disabled={saving} style={{ marginRight: 10 }}>
            Save & Exit
          </button>
          <button className="button" type="button" onClick={handleSaveStep} disabled={saving}>
            {step === stepTitles.length - 1 ? 'Finish setup' : 'Save & Continue'}
          </button>
        </div>
      </div>

      {marketplaceEnabled && aiAllowed ? <AiAssistant /> : null}
    </div>
  );
}
