import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { apiFetch, setToken } from '../lib/api';

export default function Signup() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifyPrompt, setVerifyPrompt] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.remove('dark');
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    try {
      const res = await apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ companyName, email, password }),
      });
      setToken(res.token);
      setVerifyPrompt(Boolean(res?.emailVerificationRequired));
      if (!res?.emailVerificationRequired) {
        router.replace('/dashboard');
      }
    } catch (err: any) {
      const msg = String(err?.message || '');
      setError(msg.includes('Failed to fetch') ? 'Cannot reach server. Check your connection and try again.' : (msg || 'Signup failed'));
    }
  }

  async function resendVerification() {
    setError('');
    setInfo('');
    try {
      await apiFetch('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setInfo('Verification email sent (or queued).');
    } catch (err: any) {
      setError(err?.message || 'Could not resend verification');
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Create your MyTitan account</h1>
        <p className="muted">Start with your company and admin user.</p>
        {verifyPrompt ? (
          <p className="muted">
            Check your email to verify your address before sensitive actions.
            <button type="button" className="button secondary" style={{ marginLeft: 10 }} onClick={resendVerification}>Resend verification</button>
          </p>
        ) : null}
        {info ? <p style={{ color: '#5eead4' }}>{info}</p> : null}
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}
        <form onSubmit={handleSubmit}>
          <label>Company name</label>
          <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Password</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="input" style={{ marginBottom: 0 }} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="button secondary" onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <p style={{ marginTop: 8, marginBottom: 16 }}>
            <Link href="/verify-email">Already have a verification token?</Link>
          </p>
          <button className="button" type="submit">Create account</button>
        </form>
        <p style={{ marginTop: 16 }}>
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
