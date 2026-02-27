import { useEffect, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';

const ROLES = ['OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'];

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('STAFF');
  const [meRole, setMeRole] = useState<string>('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const load = async () => {
    setError('');
    try {
      const [list, me] = await Promise.all([apiFetch('/users'), apiFetch('/me')]);
      setUsers(Array.isArray(list) ? list : []);
      setMeRole(me?.role || '');
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    }
  };

  useEffect(() => {
    load();
  }, []);

  async function invite() {
    setError('');
    setStatus('');
    try {
      const res = await apiFetch('/users/invite', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setStatus(`Invite created. Token: ${res?.token || ''}`);
      setInviteEmail('');
      setInviteRole('STAFF');
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to invite');
    }
  }

  async function updateRole(userId: string, role: string) {
    setError('');
    setStatus('');
    try {
      await apiFetch(`/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      setStatus('Role updated');
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to update role');
    }
  }

  return (
    <DashboardShell>
      <div className="card">
        <h1>Team</h1>
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}
        {status && <p style={{ color: '#7bdba5' }}>{status}</p>}

        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <h3>Invite User</h3>
          <label>Email</label>
          <input className="input" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          <label>Role</label>
          <select className="input" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
            {ROLES.filter((r) => r !== 'OWNER').map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <button className="button" type="button" onClick={invite}>
            Send Invite
          </button>
          <p className="muted">Invite tokens are displayed once. Send them securely.</p>
        </div>

        <div className="list">
          {users.map((user) => (
            <div key={user.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong>{user.email}</strong>
                <span className="badge">{user.role}</span>
              </div>
              <p className="muted">
                Last active: {user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleString() : '—'}
              </p>
              {meRole === 'OWNER' ? (
                <p className="muted">
                  Last login: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'} • Email verified: {user.emailVerified ? 'Yes' : 'No'}
                </p>
              ) : null}
              {meRole === 'OWNER' && user.role !== 'OWNER' && (
                <select
                  className="input"
                  value={user.role}
                  onChange={(e) => updateRole(user.id, e.target.value)}
                >
                  {ROLES.filter((r) => r !== 'OWNER').map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
