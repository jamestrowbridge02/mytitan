import { useState } from 'react';
import { apiFetch } from '../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('');
    setError('');
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setStatus('If an account exists, a reset link has been sent.');
    } catch (err: any) {
      const msg = String(err?.message || '');
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
        <form onSubmit={onSubmit}>
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button className="button" type="submit">Send reset link</button>
        </form>
      </div>
    </div>
  );
}
