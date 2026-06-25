import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, getToken } from '../lib/api';
import { getResendVerificationMessage, getSafeVerificationError } from '../lib/verification-resend';

export default function VerifyEmailPage() {
  const router = useRouter();
  const token = typeof router.query.token === 'string' ? router.query.token : '';
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [actionHref, setActionHref] = useState('');
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
    setActionHref('');
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
    setActionHref('');
    try {
      const path = getToken() ? '/auth/resend-verification' : '/auth/resend-verification/public';
      const result = await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setStatus(getResendVerificationMessage(result));
      setActionHref(typeof result?.actionHref === 'string' ? result.actionHref : '');
    } catch (err: any) {
      setError(getSafeVerificationError(err));
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
        {actionHref ? <p><a className="button secondary" href={actionHref}>Open email settings</a></p> : null}
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
