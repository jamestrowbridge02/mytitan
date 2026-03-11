import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { apiFetch, setToken } from '../lib/api';
import { isAuthPolishV1Enabled, isStartHereEnabled } from '../lib/feature-flags';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const authPolish = isAuthPolishV1Enabled();

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
            <div className="auth-shell__eyebrow">MyTitan operations workspace</div>
            <h1 className="auth-shell__title">Control the day without losing the detail.</h1>
            <p className="auth-shell__lead">
              Run bookings, jobs, customer approvals, service plans, documents, and billing from one operational system built for service teams.
            </p>
          </div>
          <ul className="auth-shell__featureList">
            <li className="auth-shell__feature">
              <strong>Readable under pressure</strong>
              Clear workflow, scheduling, and billing surfaces for high-volume operators.
            </li>
            <li className="auth-shell__feature">
              <strong>Governed by default</strong>
              Workspace permissions, audit-friendly automation, and tenant-scoped controls stay intact.
            </li>
            <li className="auth-shell__feature">
              <strong>Built for real service work</strong>
              Capacity planning, recurring work, approvals, artifacts, and customer visibility are part of the core system.
            </li>
          </ul>
        </section>

        <section className="card auth-shell__panel">
          <h1>Welcome back</h1>
          {error ? <p className="auth-shell__status auth-shell__status--error">{error}</p> : null}
          <form className="auth-shell__form" onSubmit={handleSubmit}>
            <label>Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label>Password</label>
            <div className="auth-shell__actions">
              <input className="input" style={{ marginBottom: 0, flex: 1 }} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} />
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
            Secure operator access with role-based governance and tenant-scoped data boundaries.
          </p>
        </section>
      </div>
    </div>
  );
}
