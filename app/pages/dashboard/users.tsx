import { useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { EmptyState } from '../../components/ui/EmptyState';
import { OperatorPageHeader } from '../../components/ui/operator-page';
import { apiFetch } from '../../lib/api';
import {
  ASSIGNABLE_WORKSPACE_ROLES,
  emptyPermissionSnapshot,
  hasWorkspacePermission,
  normalizePermissionSnapshot,
} from '../../lib/workspace-permissions';
import { getResendVerificationMessage, getSafeVerificationError } from '../../lib/verification-resend';

const ROLES = ['OWNER', ...ASSIGNABLE_WORKSPACE_ROLES];

const phase6RoleFoundations = [
  { key: 'owner', label: 'Owner', detail: 'Full workspace control, billing authority, role changes, and support visibility.' },
  { key: 'admin', label: 'Admin', detail: 'Operational administration without platform controls.' },
  { key: 'finance', label: 'Finance', detail: 'Finance-only billing, invoices, credits, and reconciliation surfaces.' },
  { key: 'dispatcher', label: 'Dispatcher', detail: 'Location-first booking, calendar, scheduling, and customer workflow control.' },
  { key: 'technician', label: 'Technician', detail: 'Technician-only field execution, offline packets, evidence upload, and completion.' },
  { key: 'viewer', label: 'Viewer', detail: 'Read-only tenant visibility with governed modules hidden.' },
  { key: 'location_manager', label: 'Location manager', detail: 'Location-scoped operations foundation for larger teams.' },
  { key: 'commercial_read_only', label: 'Read-only commercial', detail: 'Commercial reporting visibility without operational mutation.' },
];

const phase6PermissionSafeguards = [
  'Location-level permissions',
  'Finance-only permissions',
  'Technician-only views',
  'Portal/support restrictions',
  'Audit role changes',
];

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('DISPATCHER');
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [emailVerified, setEmailVerified] = useState(true);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [recoveryHref, setRecoveryHref] = useState('');

  const load = async () => {
    setError('');
    try {
      const [list, me] = await Promise.all([apiFetch('/users'), apiFetch('/me')]);
      setUsers(Array.isArray(list) ? list : []);
      setPermissions(normalizePermissionSnapshot(me?.permissions));
      setPermissionsReady(true);
      setEmailVerified(Boolean(me?.emailVerified));
    } catch (err: any) {
      setPermissions(emptyPermissionSnapshot());
      setPermissionsReady(true);
      setError(err.message || 'Failed to load users');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const canInviteMembers = hasWorkspacePermission(permissions, 'users.invite');
  const canAssignRoles = hasWorkspacePermission(permissions, 'users.role_assign');
  const canManageTeam = canInviteMembers || canAssignRoles;
  const adminControlsSubtitle = useMemo(() => {
    if (canInviteMembers && canAssignRoles) return 'Invite team members, control roles, and track verification from one place.';
    if (canInviteMembers) return 'Invite team members and track who still needs access.';
    if (canAssignRoles) return 'Review access and update roles for existing team members.';
    return 'Only owners and admins can manage team access.';
  }, [canAssignRoles, canInviteMembers]);

  async function invite() {
    if (!canInviteMembers) return;
    setError('');
    setStatus('');
    setRecoveryHref('');
    try {
      const res = await apiFetch('/users/invite', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setStatus(String(res?.message || 'Invite processed.'));
      setRecoveryHref(typeof res?.actionHref === 'string' ? res.actionHref : '');
      if (res?.status === 'sent') {
        setInviteEmail('');
        setInviteRole('DISPATCHER');
        await load();
      }
    } catch (err: any) {
      setError(err?.message || 'We could not process the invite just now. Please try again shortly.');
    }
  }

  async function resendVerification() {
    setError('');
    setStatus('');
    setRecoveryHref('');
    setResendingVerification(true);
    try {
      const result = await apiFetch('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setStatus(getResendVerificationMessage(result));
      setRecoveryHref(typeof result?.actionHref === 'string' ? result.actionHref : '');
      if (result?.status === 'already_verified') {
        await load();
      }
    } catch (err: any) {
      setError(getSafeVerificationError(err));
    } finally {
      setResendingVerification(false);
    }
  }

  async function updateRole(userId: string, role: string) {
    if (!canAssignRoles) return;
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

  if (permissionsReady && !canManageTeam) {
    return (
      <DashboardShell>
        <div className="settings-premium-shell">
          <OperatorPageHeader
            eyebrow="Team"
            title="Team management"
            subtitle="Only owners and admins can invite members or change access."
            stats={[]}
          />
          <div className="card settings-premium-card" data-testid="team-governance-blocked">
            <h2 style={{ marginTop: 0 }}>Access restricted</h2>
            <p className="muted settings-premium-muted" style={{ marginBottom: 0 }}>
              Ask an owner or admin to invite team members or update workspace roles.
            </p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="settings-premium-shell">
        <OperatorPageHeader
          eyebrow="Team"
          title="Team management"
          subtitle={adminControlsSubtitle}
          stats={[
            { label: 'Members', value: String(users.length) },
            { label: 'Invites', value: canInviteMembers ? 'Enabled' : 'Hidden' },
            { label: 'Roles & access', value: canAssignRoles ? 'Editable' : 'View only' },
          ]}
          actions={[{ label: 'Open settings', href: '/dashboard/settings?tab=team', variant: 'secondary' }]}
        />
        <div className="card settings-premium-card">
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}
        {status && <p style={{ color: '#7bdba5' }}>{status}</p>}
        {recoveryHref ? <p><a className="button secondary" href={recoveryHref}>Open settings</a></p> : null}

        <section className="card" style={{ padding: 16, marginBottom: 20 }} data-testid="phase6-advanced-permissions">
          <div className="operator-section__header">
            <div>
              <p className="operator-eyebrow">Access model</p>
              <h2 className="operator-section__title">Advanced role foundations</h2>
              <p className="muted">
                Keep tenant access explicit: operational roles stay inside the workspace, platform controls stay outside, and every role change is auditable.
              </p>
            </div>
            <a className="button secondary" href="/dashboard/audit">Open audit trail</a>
          </div>
          <div className="operator-grid operator-grid--four">
            {phase6RoleFoundations.map((role) => (
              <article className="operator-mini-card" key={role.key} data-testid={`phase6-role-${role.key}`}>
                <strong>{role.label}</strong>
                <p className="muted">{role.detail}</p>
              </article>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }} data-testid="phase6-permission-safeguards">
            {phase6PermissionSafeguards.map((label) => <span className="operator-tag" key={label}>{label}</span>)}
          </div>
        </section>

        {!emailVerified ? (
          <div className="card" style={{ padding: 16, marginBottom: 20, border: '1px solid rgba(245, 158, 11, 0.35)' }}>
            <h3 style={{ marginTop: 0 }}>Verify your email to invite team members</h3>
            <p className="muted" style={{ marginBottom: 12 }}>
              Invite sending stays locked until your owner or admin email is verified.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="button" type="button" onClick={resendVerification} disabled={resendingVerification}>
                {resendingVerification ? 'Sending...' : 'Resend verification'}
              </button>
              <a className="button secondary" href="/verify-email">Open verification page</a>
            </div>
          </div>
        ) : null}

        <div className="card" style={{ padding: 16, marginBottom: 20 }} data-testid="team-invite-card">
          <h3>Invite team member</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            MyTitan sends the setup email for team access. The new user sets their own password from the secure link, and workspace customer-email settings are not used here.
          </p>
          <label>Sign-in email</label>
          <input
            className="input"
            data-testid="team-invite-email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            disabled={!canInviteMembers}
          />
          <label>Role</label>
          <select
            className="input"
            data-testid="team-invite-role"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            disabled={!canInviteMembers}
          >
            {ROLES.filter((r) => r !== 'OWNER').map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <button className="button" data-testid="team-invite-submit" type="button" onClick={invite} disabled={!emailVerified || !canInviteMembers}>
            Send setup email
          </button>
          <p className="muted">
            {!canInviteMembers
              ? 'Your role can review access but cannot send new invites.'
              : emailVerified
              ? 'MyTitan sends the setup email when system email is ready.'
              : 'Verify your email before inviting users.'}
          </p>
        </div>

        {users.length === 0 ? (
          <EmptyState title="No team members yet" subtitle="Invite your first user to get started." />
        ) : (
          <div className="list">
            {users.map((user) => (
              <div key={user.id} className="card" style={{ padding: 16 }} data-testid={`team-member-${user.id}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 999, background: user.color || '#0F766E', border: '1px solid currentColor' }} />
                    {user.email}
                  </strong>
                  <span className="badge">{user.role}</span>
                </div>
                <p className="muted">
                  Last active: {user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleString() : '—'}
                </p>
                {canManageTeam ? (
                  <p className="muted">
                    Last login: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'} • Email verified: {user.emailVerified ? 'Yes' : 'No'}
                  </p>
                ) : null}
                {canAssignRoles && user.role !== 'OWNER' && (
                  <select
                    className="input"
                    data-testid={`team-role-select-${user.id}`}
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
        )}
      </div>
      </div>
    </DashboardShell>
  );
}
