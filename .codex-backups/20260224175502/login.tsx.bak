import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, setToken } from '../lib/api';
import { isStartHereEnabled } from '../lib/feature-flags';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const demoTokenParam = router.query.demo_token;
    if (typeof demoTokenParam === 'string' && demoTokenParam.trim()) {
      setToken(demoTokenParam.trim());
      window.location.href = '/dashboard';
      return;
    }
    if (router.query.demo === '1' && !demoLoading) {
      setDemoLoading(true);
      apiFetch('/public/demo-login', { method: 'POST', body: JSON.stringify({}) })
        .then((res) => {
          if (res?.token) {
            setToken(res.token);
            window.location.href = '/dashboard';
            return;
          }
          throw new Error('Demo token unavailable');
        })
        .catch((err: any) => {
          setError(err?.message || 'Demo login failed');
        })
        .finally(() => {
          setDemoLoading(false);
        });
    }
  }, [router.isReady, router.query.demo, router.query.demo_token, demoLoading]);

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
          window.location.href = status?.onboardingCompleted ? '/start' : '/onboarding';
          return;
        } catch {
          window.location.href = '/dashboard';
          return;
        }
      }

      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Welcome back</h1>
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}
        {demoLoading && <p className="muted">Starting demo session...</p>}
        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="button" type="submit">Log in</button>
        </form>
        <p style={{ marginTop: 16 }}>
          No account? <a href="/signup">Create one</a>
        </p>
      </div>
    </div>
  );
}
