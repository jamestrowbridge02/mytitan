import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { apiFetch } from '../lib/api';

export default function ResetPasswordPage() {
  const router = useRouter();
  const token = typeof router.query.token === 'string' ? router.query.token : '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const newPasswordInputId = 'reset-password-new';
  const confirmPasswordInputId = 'reset-password-confirm';

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.remove('dark');
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('');
    setError('');
    if (!token) {
      setError('Missing reset token.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      setStatus('Your password has been updated. You can sign in with the new one now.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('Cannot reach server') || msg.includes('Failed to fetch')) {
        setError('We could not reach MyTitan right now. Check your connection and try again.');
        return;
      }
      if (msg.includes('no longer valid') || msg.includes('Invalid or expired token')) {
        setError('This link has already been used, expired, or been replaced by a newer email. Request a fresh reset link to keep going.');
        return;
      }
      setError(msg || 'We could not reset your password just now.');
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Reset password</h1>
        {status ? <p className="auth-shell__status auth-shell__status--success">{status}</p> : null}
        {error ? <p className="auth-shell__status auth-shell__status--error">{error}</p> : null}
        {status ? (
          <p>
            <Link href="/login">Return to login</Link>
          </p>
        ) : null}
        {error && error.includes('Request a fresh reset link') ? (
          <p>
            <Link href="/forgot-password">Send a new reset email</Link>
          </p>
        ) : null}
        <form onSubmit={onSubmit}>
          <label htmlFor={newPasswordInputId}>New password</label>
          <input id={newPasswordInputId} className="input" type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          <label htmlFor={confirmPasswordInputId}>Confirm password</label>
          <input id={confirmPasswordInputId} className="input" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          <button type="button" className="button secondary" onClick={() => setShowPassword((v) => !v)} style={{ marginRight: 10 }}>
            {showPassword ? 'Hide' : 'Show'} password
          </button>
          <button className="button" type="submit">Reset password</button>
        </form>
      </div>
    </div>
  );
}
