import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { apiFetch, setToken } from '../lib/api';
import {
  DEFAULT_WORKSPACE_CURRENCY,
  DEFAULT_WORKSPACE_LOCALE,
  DEFAULT_WORKSPACE_TIMEZONE,
  fetchGeoDefaults,
  findRegionOption,
  REGION_OPTIONS,
  type GeoDefaults,
} from '../lib/geo-defaults';
import MyTitanLogo from '../components/brand/mytitan-logo';
import { getResendVerificationMessage, getSafeVerificationError } from '../lib/verification-resend';
import { resolvePostAuthDestination } from '../lib/post-auth';

export default function Signup() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [currency, setCurrency] = useState(DEFAULT_WORKSPACE_CURRENCY);
  const [defaultLocale, setDefaultLocale] = useState(DEFAULT_WORKSPACE_LOCALE);
  const [timezone, setTimezone] = useState(DEFAULT_WORKSPACE_TIMEZONE);
  const [showPassword, setShowPassword] = useState(false);
  const [verifyPrompt, setVerifyPrompt] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [recoveryHref, setRecoveryHref] = useState('');
  const [geoDefaults, setGeoDefaults] = useState<GeoDefaults | null>(null);
  const [currencyEdited, setCurrencyEdited] = useState(false);
  const [timezoneEdited, setTimezoneEdited] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.remove('dark');
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchGeoDefaults().then((defaults) => {
      if (cancelled) return;
      setGeoDefaults(defaults);
      setCountryCode((prev) => prev || defaults.countryCode || '');
      setDefaultLocale((prev) => (prev && prev !== DEFAULT_WORKSPACE_LOCALE ? prev : defaults.locale || DEFAULT_WORKSPACE_LOCALE));
      if (!currencyEdited) {
        setCurrency(defaults.currency || DEFAULT_WORKSPACE_CURRENCY);
      }
      if (!timezoneEdited) {
        setTimezone(defaults.timezone || DEFAULT_WORKSPACE_TIMEZONE);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currencyEdited, timezoneEdited]);

  function handleCountryChange(nextCountryCode: string) {
    setCountryCode(nextCountryCode);
    const option = findRegionOption(nextCountryCode);
    if (option) {
      setDefaultLocale(option.locale);
      if (!currencyEdited) {
        setCurrency(option.currency);
      }
      if (!timezoneEdited) {
        setTimezone(option.timezone);
      }
      return;
    }
    if (!currencyEdited) {
      setCurrency(DEFAULT_WORKSPACE_CURRENCY);
    }
    if (!timezoneEdited) {
      setTimezone(geoDefaults?.timezone || DEFAULT_WORKSPACE_TIMEZONE);
    }
    setDefaultLocale(geoDefaults?.locale || DEFAULT_WORKSPACE_LOCALE);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setRecoveryHref('');
    try {
      const res = await apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ companyName, email, password, countryCode: countryCode || undefined, currency, defaultLocale, timezone }),
      });
      setToken(res.token);
      setVerifyPrompt(Boolean(res?.emailVerificationRequired));
      if (typeof res?.emailDeliveryMessage === 'string') {
        setInfo(res.emailDeliveryMessage);
      }
      setRecoveryHref(typeof res?.emailActionHref === 'string' ? res.emailActionHref : '');
      if (!res?.emailVerificationRequired) {
        const nextPath = await resolvePostAuthDestination({ startHereEnabled: true }).catch(() => res?.user?.platformAdmin ? '/platform' : '/dashboard');
        router.replace(nextPath);
      }
    } catch (err: any) {
      const msg = String(err?.message || '');
      setError(msg.includes('Failed to fetch') ? 'Cannot reach server. Check your connection and try again.' : (msg || 'Could not create your account'));
    }
  }

  async function resendVerification() {
    setError('');
    setInfo('');
    setRecoveryHref('');
    try {
      const result = await apiFetch('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setInfo(getResendVerificationMessage(result));
      setRecoveryHref(typeof result?.actionHref === 'string' ? result.actionHref : '');
    } catch (err: any) {
      setError(getSafeVerificationError(err));
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-shell__frame">
        <section className="auth-shell__panel auth-shell__hero">
          <div>
            <div className="auth-shell__brandRow">
              <MyTitanLogo size="lg" glimmer className="auth-shell__brand" />
            </div>
            <div className="auth-shell__eyebrow">14-day free trial</div>
            <h1 className="auth-shell__title">Start running jobs, customers, and billing in one place.</h1>
            <p className="auth-shell__lead">
              Create your workspace, complete your first live workflow, and decide on a paid plan only when the product is already proving value.
            </p>
          </div>
          <ul className="auth-shell__featureList">
            <li className="auth-shell__feature">
              <strong>No card required to get started</strong>
              Set up your workspace first, invite your team when ready, and evaluate the trial before billing begins.
            </li>
            <li className="auth-shell__feature">
              <strong>Reach first value quickly</strong>
              Create your first job, share a service record, and show the customer outcome without a long setup project.
            </li>
            <li className="auth-shell__feature">
              <strong>Built for real service operations</strong>
              Keep bookings, jobs, customer updates, approvals, and billing follow-through under one roof.
            </li>
          </ul>
          <div className="card" style={{ marginTop: 18, padding: 18 }}>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>What happens next</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <strong>1. Set the basics</strong>
                <p className="muted" style={{ margin: '4px 0 0 0' }}>Add business details, turn on your booking link, and publish the first service.</p>
              </div>
              <div>
                <strong>2. Start the first workflow</strong>
                <p className="muted" style={{ margin: '4px 0 0 0' }}>Create or receive a booking, then move it into a real job.</p>
              </div>
              <div>
                <strong>3. Finish and follow up</strong>
                <p className="muted" style={{ margin: '4px 0 0 0' }}>Complete the work, send the result, and collect payment through the method you choose.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="card auth-shell__panel">
          <div className="auth-shell__formBrand">
            <MyTitanLogo size="sm" glimmer />
          </div>
          <h1>Start your 14-day trial</h1>
          <p className="muted">Create your business workspace and main admin user. You can add the rest of the team after setup.</p>
          {verifyPrompt ? (
            <p className="muted">
              {info || 'Check your email to verify your address before sensitive actions.'}
              <button type="button" className="button secondary" style={{ marginLeft: 10 }} onClick={resendVerification}>Resend verification</button>
            </p>
          ) : null}
          {info && !verifyPrompt ? <p style={{ color: '#5eead4' }}>{info}</p> : null}
          {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}
          {recoveryHref ? <p><a className="button secondary" href={recoveryHref}>Open email settings</a></p> : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <span className="badge">14-day trial</span>
            <span className="badge">No card required during setup</span>
            <span className="badge">Secure admin access</span>
          </div>
          <form className="auth-shell__form" onSubmit={handleSubmit}>
            <label htmlFor="signup-company-name">Company name</label>
            <input id="signup-company-name" className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            <label htmlFor="signup-email">Work email</label>
            <input id="signup-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <div className="two-col" data-testid="signup-region-defaults">
              <div>
                <label htmlFor="signup-country-code">Country or region</label>
                <select
                  id="signup-country-code"
                  className="input"
                  data-testid="signup-country-select"
                  value={countryCode}
                  onChange={(e) => handleCountryChange(e.target.value)}
                >
                  <option value="">Choose country or region</option>
                  {REGION_OPTIONS.map((option) => (
                    <option key={option.countryCode} value={option.countryCode}>{option.label}</option>
                  ))}
                </select>
                <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
                  {geoDefaults?.detected && geoDefaults.country
                    ? `Detected from your connection. You can change it any time.`
                    : 'We will use a safe GBP default if we cannot detect your region.'}
                </p>
              </div>
              <div>
                <label htmlFor="signup-currency">Currency</label>
                <input
                  id="signup-currency"
                  className="input"
                  data-testid="signup-currency-input"
                  value={currency}
                  onChange={(e) => {
                    setCurrencyEdited(true);
                    setCurrency(e.target.value.toUpperCase());
                  }}
                />
              </div>
            </div>
            <label htmlFor="signup-timezone">Timezone</label>
            <input
              id="signup-timezone"
              className="input"
              data-testid="signup-timezone-input"
              value={timezone}
              onChange={(e) => {
                setTimezoneEdited(true);
                setTimezone(e.target.value);
              }}
            />
            <label htmlFor="signup-password">Password</label>
            <div className="auth-shell__actions">
              <input id="signup-password" className="input" style={{ marginBottom: 0, flex: 1 }} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="button secondary" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <p style={{ marginTop: 4, marginBottom: 4 }}>
              <Link href="/verify-email">Already have a verification code?</Link>
            </p>
            <div className="auth-shell__actions">
              <button className="button" type="submit">Start 14-day trial</button>
              <Link className="button secondary" href="/login">Log in</Link>
            </div>
          </form>
          <p className="muted" style={{ marginTop: 16, marginBottom: 0 }}>
            You will land in the shortest path to set up the workspace, open bookings, complete work, send the result, and get paid.
          </p>
        </section>
      </div>
    </div>
  );
}
