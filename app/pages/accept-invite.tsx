import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { apiFetch } from '../lib/api';

export default function AcceptInvitePage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.remove('dark');
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    if (typeof router.query.token === 'string') {
      setToken(router.query.token);
    }
  }, [router.isReady, router.query.token]);

  async function acceptInvite(event: React.FormEvent) {
    event.preventDefault();
    const inviteToken = token.trim();
    if (!inviteToken) {
      setError('Your setup link is incomplete. Open the invite email again and use the full link.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await apiFetch('/users/accept-invite', {
        method: 'POST',
        body: JSON.stringify({ token: inviteToken, password }),
      });
      setStatus('Invite accepted. You can now sign in to MyTitan.');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err?.message || 'Could not accept invite');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Accept team invite</h1>
        <p className="muted">Set your password to finish your MyTitan account setup for this workspace.</p>
        {status ? <p className="auth-shell__status auth-shell__status--success">{status}</p> : null}
        {error ? <p className="auth-shell__status auth-shell__status--error">{error}</p> : null}
        <form onSubmit={acceptInvite}>
          <p className="muted" style={{ marginTop: 0 }}>
            The secure setup link already includes your invite. Choose a password below to activate your access.
          </p>
          <label>Password</label>
          <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <label>Confirm password</label>
          <input className="input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          <button className="button" type="submit" disabled={busy || !token || !password || !confirmPassword}>
            {busy ? 'Accepting…' : 'Accept invite'}
          </button>
        </form>
        <p style={{ marginTop: 16 }}>
          Already active? <Link href="/login">Go to login</Link>
        </p>
      </div>
    </div>
  );
}
