import { useState } from 'react';
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
      setStatus('Password reset complete. You can now log in.');
    } catch (err: any) {
      const msg = String(err?.message || '');
      setError(msg.includes('Failed to fetch') ? 'Cannot reach server. Check your connection and try again.' : (msg || 'Reset failed'));
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Reset password</h1>
        {status ? <p style={{ color: '#5eead4' }}>{status}</p> : null}
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
        <form onSubmit={onSubmit}>
          <label>New password</label>
          <input className="input" type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          <label>Confirm password</label>
          <input className="input" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          <button type="button" className="button secondary" onClick={() => setShowPassword((v) => !v)} style={{ marginRight: 10 }}>
            {showPassword ? 'Hide' : 'Show'} password
          </button>
          <button className="button" type="submit">Reset password</button>
        </form>
      </div>
    </div>
  );
}
