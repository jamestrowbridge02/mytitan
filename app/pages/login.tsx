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
    <div className="container">
      <div className="card">
        <h1>Welcome back</h1>
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}
        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Password</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="input" style={{ marginBottom: 0 }} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="button secondary" onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {authPolish ? (
            <p style={{ marginTop: 8, marginBottom: 16 }}>
              <Link href="/forgot-password">Forgot password?</Link>
            </p>
          ) : null}
          <button className="button" type="submit">Log in</button>
        </form>
        <p style={{ marginTop: 16 }}>
          No account? <Link href="/signup">Create one</Link>
        </p>
      </div>
    </div>
  );
}
