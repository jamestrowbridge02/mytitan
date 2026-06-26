import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const emailInputId = 'forgot-password-email';
  const fallbackStatus = 'If an account exists, a reset link has been sent.';

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.remove('dark');
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(`${fallbackStatus} Use the most recent MyTitan email if you request more than one link.`);
    setError('');
    try {
      const response = await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const baseMessage = String(response?.message || fallbackStatus);
      setStatus(`${baseMessage} Use the most recent MyTitan email if you request more than one link.`);
    } catch (err: any) {
      const msg = String(err?.message || '');
      setStatus('');
      setError(msg.includes('Failed to fetch') ? 'Cannot reach server. Check your connection and try again.' : (msg || 'Request failed'));
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Forgot password</h1>
        <p className="muted">Enter your email and we will send a reset link.</p>
        {status ? <p style={{ color: '#5eead4' }}>{status}</p> : null}
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
        <form onSubmit={onSubmit} noValidate>
          <label htmlFor={emailInputId}>Email</label>
          <input id={emailInputId} className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button className="button" type="submit">Send reset link</button>
        </form>
      </div>
    </div>
  );
}
