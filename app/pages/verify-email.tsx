import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiFetch } from '../lib/api';

export default function VerifyEmailPage() {
  const router = useRouter();
  const token = typeof router.query.token === 'string' ? router.query.token : '';
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.remove('dark');
  }, []);

  async function verify(tokenValue: string) {
    if (!tokenValue) return;
    setLoading(true);
    setError('');
    setStatus('');
    try {
      await apiFetch('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: tokenValue }),
      });
      setStatus('Email verified successfully.');
    } catch (err: any) {
      setError(err?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) verify(token);
  }, [token]);

  async function resend() {
    setError('');
    setStatus('');
    try {
      await apiFetch('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setStatus('Verification email sent (or queued).');
    } catch (err: any) {
      setError(err?.message || 'Could not resend verification');
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Verify email</h1>
        <p className="muted">Use the verification link from your inbox or request a new one.</p>
        {loading ? <p className="muted">Verifying...</p> : null}
        {status ? <p style={{ color: '#5eead4' }}>{status}</p> : null}
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            resend();
          }}
        >
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button className="button" type="submit">Resend verification</button>
        </form>
      </div>
    </div>
  );
}
