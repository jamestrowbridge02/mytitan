import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { apiFetch, setToken } from '../lib/api';
import { isAuthPolishV1Enabled, isGuidedSetupV2Enabled, isStartHereEnabled } from '../lib/feature-flags';
import MyTitanLogo from '../components/brand/mytitan-logo';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const authPolish = isAuthPolishV1Enabled();
  const guidedSetupV2Enabled = isGuidedSetupV2Enabled();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.remove('dark');
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    const demoTokenParam = router.query.demo_token;
    if (typeof demoTokenParam === 'string' && demoTokenParam.trim()) {
      setToken(demoTokenParam.trim());
      router.replace('/dashboard');
    }
  }, [router.isReady, router.query.demo_token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(res.token);

      if (isStartHereEnabled()) {
        try {
          const status = await apiFetch('/onboarding/status');
          if (guidedSetupV2Enabled && !status?.onboardingCompleted) {
            router.replace('/dashboard/setup-wizard');
            return;
          }
          router.replace(status?.onboardingCompleted ? '/start' : '/onboarding');
          return;
        } catch {
          router.replace('/dashboard');
          return;
        }
      }

      router.replace('/dashboard');
    } catch (err: any) {
      const msg = String(err?.message || '');
      setError(msg.includes('Failed to fetch') ? 'Cannot reach server. Check your connection and try again.' : (msg || 'Login failed'));
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
            <div className="auth-shell__eyebrow">Service business software</div>
            <h1 className="auth-shell__title">Run bookings, jobs, customers, and billing in one place.</h1>
            <p className="auth-shell__lead">
              MyTitan keeps daily work clear without making your team jump between tools.
            </p>
          </div>
          <ul className="auth-shell__featureList">
            <li className="auth-shell__feature">
              <strong>Clear during busy days</strong>
              Keep jobs, schedules, and payments easy to follow when the pace picks up.
            </li>
            <li className="auth-shell__feature">
              <strong>Safe by default</strong>
              Roles, approvals, and workspace controls stay in place as the team grows.
            </li>
            <li className="auth-shell__feature">
              <strong>Built for service teams</strong>
              Plan work, manage repeats, track approvals, and keep customers informed in one system.
            </li>
          </ul>
        </section>

        <section className="card auth-shell__panel">
          <div className="auth-shell__formBrand">
            <MyTitanLogo size="sm" />
          </div>
          <h1>Welcome back</h1>
          {error ? <p className="auth-shell__status auth-shell__status--error">{error}</p> : null}
          <form className="auth-shell__form" onSubmit={handleSubmit}>
            <label htmlFor="login-email">Email</label>
            <input id="login-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label htmlFor="login-password">Password</label>
            <div className="auth-shell__actions">
              <input id="login-password" className="input" style={{ marginBottom: 0, flex: 1 }} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="button secondary" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {authPolish ? (
              <p style={{ marginTop: 4, marginBottom: 4 }}>
                <Link href="/forgot-password">Forgot password?</Link>
              </p>
            ) : null}
            <div className="auth-shell__actions">
              <button className="button" type="submit">Log in</button>
              <Link className="button secondary" href="/signup">Create account</Link>
            </div>
          </form>
          <p className="muted" style={{ marginTop: 16, marginBottom: 0 }}>
            Secure sign-in with the right access for each team member.
          </p>
        </section>
      </div>
    </div>
  );
}
