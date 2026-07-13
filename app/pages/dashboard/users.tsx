import { useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  OperatorActiveFilters,
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorFilterBar,
  OperatorFilterField,
  OperatorPageHeader,
  OperatorRowActions,
  OperatorSavedViews,
} from '../../components/ui/operator-page';
import { apiFetch } from '../../lib/api';
import {
  ASSIGNABLE_WORKSPACE_ROLES,
  emptyPermissionSnapshot,
  hasWorkspacePermission,
  normalizePermissionSnapshot,
} from '../../lib/workspace-permissions';
import { resolveWorkforceTerminology } from '../../lib/workforce-terminology';
import { getResendVerificationMessage, getSafeVerificationError } from '../../lib/verification-resend';

const ROLES = ['OWNER', ...ASSIGNABLE_WORKSPACE_ROLES];

const phase6RoleFoundations = [
  { key: 'owner', label: 'Owner', detail: 'Full workspace control, billing authority, role changes, and support visibility.' },
  { key: 'admin', label: 'Admin', detail: 'Operational administration without platform controls.' },
  { key: 'finance', label: 'Finance', detail: 'Finance-only billing, invoices, credits, and reconciliation surfaces.' },
  { key: 'dispatcher', label: 'Dispatcher', detail: 'Location-first booking, calendar, scheduling, and customer workflow control.' },
  { key: 'field_worker', label: 'Field worker', detail: 'Assigned-work execution, offline packets, evidence upload, and completion.' },
  { key: 'viewer', label: 'Viewer', detail: 'Read-only tenant visibility with governed modules hidden.' },
  { key: 'location_manager', label: 'Location manager', detail: 'Location-scoped operations foundation for larger teams.' },
  { key: 'commercial_read_only', label: 'Read-only commercial', detail: 'Commercial reporting visibility without operational mutation.' },
];

const phase6PermissionSafeguards = [
  'Location-level permissions',
  'Finance-only permissions',
  'Assigned-work views',
  'Portal/support restrictions',
  'Audit role changes',
];

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('DISPATCHER');
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [emailVerified, setEmailVerified] = useState(true);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [recoveryHref, setRecoveryHref] = useState('');
  const [activeTab, setActiveTab] = useState<'members' | 'invitations' | 'roles'>('members');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [workforceFilter, setWorkforceFilter] = useState('');

  const load = async () => {
    setError('');
    try {
      const [list, me, tenantSettings] = await Promise.all([apiFetch('/users'), apiFetch('/me'), apiFetch('/tenant/settings')]);
      setUsers(Array.isArray(list) ? list : []);
      setSettings(tenantSettings || null);
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
  const workforceTerms = useMemo(() => resolveWorkforceTerminology(settings), [settings]);
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((user) => {
      if (q && !`${user.email || ''} ${user.displayName || ''} ${user.jobTitle || ''} ${user.department || ''}`.toLowerCase().includes(q)) return false;
      if (roleFilter && user.role !== roleFilter) return false;
      if (workforceFilter === 'active' && !user.isStaffMember) return false;
      if (workforceFilter === 'system' && user.isStaffMember) return false;
      return true;
    });
  }, [roleFilter, search, users, workforceFilter]);
  const pendingInvites = users.filter((user) => !user.emailVerified);
  const workforceActive = users.filter((user) => user.isStaffMember).length;
  const accessIssues = users.filter((user) => !user.emailVerified || !user.active).length;

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
        setInviteOpen(false);
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

  async function updateWorkforce(user: any, patch: Record<string, boolean | string>) {
    if (!canAssignRoles) return;
    setError('');
    setStatus('');
    const next = {
      isStaffMember: Boolean(user.isStaffMember),
      isSchedulable: Boolean(user.isSchedulable),
      isAssignable: Boolean(user.isAssignable),
      appearsOnRota: Boolean(user.appearsOnRota),
      appearsInBookingAssignment: Boolean(user.appearsInBookingAssignment),
      isPublicBookable: Boolean(user.isPublicBookable),
      workforceAccessType: user.workforceAccessType || 'EMPLOYEE',
      displayName: user.displayName || '',
      jobTitle: user.jobTitle || '',
      department: user.department || '',
      seniority: user.seniority || '',
      employeeReference: user.employeeReference || '',
      permissionProfile: user.permissionProfile || user.role || '',
      ...patch,
    };
    if (!next.isStaffMember) {
      next.isSchedulable = false;
      next.isAssignable = false;
      next.appearsOnRota = false;
      next.appearsInBookingAssignment = false;
      next.isPublicBookable = false;
    }
    if (!next.isSchedulable) next.appearsOnRota = false;
    if (!next.isAssignable) next.appearsInBookingAssignment = false;
    if (!next.isSchedulable || !next.appearsInBookingAssignment) next.isPublicBookable = false;
    try {
      await apiFetch(`/users/${user.id}/workforce`, {
        method: 'PATCH',
        body: JSON.stringify(next),
      });
      setStatus('Workforce settings updated');
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to update workforce settings');
    }
  }

  if (permissionsReady && !canManageTeam) {
    return (
      <DashboardShell>
        <div className="settings-premium-shell">
          <OperatorPageHeader
            eyebrow="Team"
            title="Team"
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
          title="Team"
          info={`System access controls who can sign in. ${workforceTerms.plural} controls who appears on rota, availability, booking assignment, and work queues.`}
          stats={[
            { label: 'Members', value: String(users.length) },
            { label: 'Pending invites', value: String(pendingInvites.length) },
            { label: 'Workforce active', value: String(workforceActive) },
            { label: 'Access issues', value: String(accessIssues) },
          ]}
          actions={[
            ...(canInviteMembers ? [{ label: 'Invite team member', onClick: () => setInviteOpen(true), testId: 'team-invite-open' }] : []),
            { label: 'Settings', href: '/dashboard/settings?tab=team', variant: 'secondary' },
            { label: 'Audit trail', href: '/dashboard/audit', variant: 'secondary' },
          ]}
        />

        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
        {status ? <p style={{ color: '#7bdba5' }}>{status}</p> : null}
        {recoveryHref ? <p><a className="button secondary" href={recoveryHref}>Open settings</a></p> : null}

        {!emailVerified ? (
          <section className="card operator-section">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Verify your email to invite team members</h2>
              </div>
              <button className="button" type="button" onClick={resendVerification} disabled={resendingVerification}>
                {resendingVerification ? 'Sending...' : 'Resend verification'}
              </button>
            </div>
          </section>
        ) : null}

        <OperatorSavedViews
          label="Team tabs"
          activeView={activeTab}
          onChange={(view) => setActiveTab(view as typeof activeTab)}
          views={[
            { id: 'members', label: 'Members', count: users.length },
            { id: 'invitations', label: 'Invitations', count: pendingInvites.length },
            { id: 'roles', label: 'Roles & access' },
          ]}
        />

        {activeTab === 'members' ? (
          <section className="card operator-section" data-testid="team-members-panel">
            <OperatorFilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search team..."
              resultsLabel={`${filteredUsers.length} shown`}
              actions={search || roleFilter || workforceFilter ? [{ label: 'Reset', variant: 'secondary', onClick: () => { setSearch(''); setRoleFilter(''); setWorkforceFilter(''); } }] : []}
            >
              <OperatorFilterField label="Role">
                <select className="input" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                  <option value="">All roles</option>
                  {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </OperatorFilterField>
              <OperatorFilterField label="Workforce">
                <select className="input" value={workforceFilter} onChange={(event) => setWorkforceFilter(event.target.value)}>
                  <option value="">All statuses</option>
                  <option value="active">Workforce active</option>
                  <option value="system">System access only</option>
                </select>
              </OperatorFilterField>
            </OperatorFilterBar>
            <OperatorActiveFilters
              chips={[
                search ? { id: 'search', label: search, onClear: () => setSearch('') } : null,
                roleFilter ? { id: 'role', label: roleFilter, onClear: () => setRoleFilter('') } : null,
                workforceFilter ? { id: 'workforce', label: workforceFilter, onClear: () => setWorkforceFilter('') } : null,
              ].filter(Boolean) as any}
            />
            {filteredUsers.length ? (
              <OperatorDataTable columns="minmax(220px, 1.1fr) minmax(150px, 0.7fr) minmax(180px, 0.8fr) minmax(180px, 0.8fr) minmax(150px, auto)">
                <OperatorDataTableHeader>
                  <div className="operator-table__cell">Member</div>
                  <div className="operator-table__cell">Role</div>
                  <div className="operator-table__cell">Profile</div>
                  <div className="operator-table__cell">Workforce</div>
                  <div className="operator-table__cell">Action</div>
                </OperatorDataTableHeader>
                {filteredUsers.map((user) => (
                  <OperatorDataTableRow key={user.id} data-testid={`team-member-${user.id}`}>
                    <div className="operator-table__cell">
                      <strong>{user.displayName || user.email}</strong>
                      <div className="operator-cellSubtle">{user.email}</div>
                    </div>
                    <div className="operator-table__cell">{user.role}</div>
                    <div className="operator-table__cell">{user.jobTitle || 'No job title'}{user.department ? ` · ${user.department}` : ''}</div>
                    <div className="operator-table__cell">{user.isStaffMember ? `${workforceTerms.singular}${user.isSchedulable ? ' · schedulable' : ''}` : 'System access only'}</div>
                    <div className="operator-table__cell">
                      <OperatorRowActions
                        primaryAction={{ label: 'Edit', onClick: () => setEditingUser(user), testId: `team-edit-${user.id}` }}
                        actions={[
                          ...(canAssignRoles && user.role !== 'OWNER' ? [{ label: 'Change role', onClick: () => setEditingUser(user), group: 'Access' }] : []),
                        ]}
                      />
                    </div>
                  </OperatorDataTableRow>
                ))}
              </OperatorDataTable>
            ) : (
              <OperatorEmptyStateCard title={`No ${workforceTerms.plural.toLowerCase()} match this view`} description="Clear filters or invite a team member." eyebrow={null} actions={canInviteMembers ? [{ label: 'Invite team member', onClick: () => setInviteOpen(true) }] : []} />
            )}
          </section>
        ) : null}

        {activeTab === 'invitations' ? (
          <section className="card operator-section" data-testid="team-invite-card">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Invitations</h2>
              </div>
              {canInviteMembers ? <button className="button" type="button" onClick={() => setInviteOpen(true)}>Invite team member</button> : null}
            </div>
            <p className="muted">MyTitan sends the setup email for team access. The new user sets their own password from the secure link, and workspace customer-email settings are not used here.</p>
            <p className="muted">MyTitan sends the setup email when system email is ready.</p>
            {pendingInvites.length ? (
              <OperatorDataTable columns="minmax(240px, 1fr) minmax(160px, 0.8fr) minmax(140px, auto)">
                <OperatorDataTableHeader>
                  <div className="operator-table__cell">Email</div>
                  <div className="operator-table__cell">Role</div>
                  <div className="operator-table__cell">Status</div>
                </OperatorDataTableHeader>
                {pendingInvites.map((user) => (
                  <OperatorDataTableRow key={user.id}>
                    <div className="operator-table__cell"><strong>{user.email}</strong></div>
                    <div className="operator-table__cell">{user.role}</div>
                    <div className="operator-table__cell">Pending verification</div>
                  </OperatorDataTableRow>
                ))}
              </OperatorDataTable>
            ) : (
              <OperatorEmptyStateCard title="No pending invites" description="New invitations will appear here until setup is complete." eyebrow={null} actions={canInviteMembers ? [{ label: 'Invite team member', onClick: () => setInviteOpen(true) }] : []} />
            )}
          </section>
        ) : null}

        {activeTab === 'roles' ? (
          <section className="card operator-section" data-testid="phase6-advanced-permissions">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Role and access matrix</h2>
              </div>
              <a className="button secondary" href="/dashboard/audit">Open audit trail</a>
            </div>
            <OperatorDataTable columns="minmax(180px, 0.8fr) minmax(180px, 1fr) minmax(150px, 0.7fr) minmax(150px, 0.7fr) minmax(150px, 0.7fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Role/profile</div>
                <div className="operator-table__cell">Customer/work access</div>
                <div className="operator-table__cell">Scheduling</div>
                <div className="operator-table__cell">Finance</div>
                <div className="operator-table__cell">Settings</div>
              </OperatorDataTableHeader>
              {phase6RoleFoundations.map((role) => (
                <OperatorDataTableRow key={role.key} data-testid={`phase6-role-${role.key}`}>
                  <div className="operator-table__cell"><strong>{role.label}</strong></div>
                  <div className="operator-table__cell">{role.detail}</div>
                  <div className="operator-table__cell">{/dispatcher|field|location/i.test(role.key) ? 'Available when enabled' : 'Not automatic'}</div>
                  <div className="operator-table__cell">{/owner|finance|commercial/i.test(role.key) ? 'Allowed by role' : 'Limited'}</div>
                  <div className="operator-table__cell">{/owner|admin/i.test(role.key) ? 'Allowed' : 'Restricted'}</div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }} data-testid="phase6-permission-safeguards">
              {phase6PermissionSafeguards.map((label) => <span className="operator-tag" key={label}>{label}</span>)}
            </div>
          </section>
        ) : null}

        {inviteOpen ? (
          <div role="dialog" aria-modal="true" aria-labelledby="team-invite-title" className="operator-modalBackdrop">
            <section className="card operator-section operator-modalPanel" data-testid="team-invite-dialog">
              <div className="operator-section__header">
                <div><h2 id="team-invite-title" className="operator-section__title">Invite team member</h2></div>
                <button className="button secondary" type="button" onClick={() => setInviteOpen(false)}>Close</button>
              </div>
              <label>Sign-in email</label>
              <input className="input" data-testid="team-invite-email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} disabled={!canInviteMembers} />
              <label>Role</label>
              <select className="input" data-testid="team-invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} disabled={!canInviteMembers}>
                {ROLES.filter((r) => r !== 'OWNER').map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              <p className="muted">MyTitan sends the setup email when system email is ready. Workspace customer-email settings are not used here.</p>
              <button className="button" data-testid="team-invite-submit" type="button" onClick={invite} disabled={!emailVerified || !canInviteMembers}>Send setup email</button>
            </section>
          </div>
        ) : null}

        {editingUser ? (
          <div role="dialog" aria-modal="true" aria-labelledby="team-editor-title" className="operator-modalBackdrop">
            <section className="card operator-section operator-modalPanel" data-testid="team-member-editor">
              <div className="operator-section__header">
                <div><h2 id="team-editor-title" className="operator-section__title">Edit member</h2></div>
                <button className="button secondary" type="button" onClick={() => setEditingUser(null)}>Close</button>
              </div>
              <div className="team-workforce-grid" data-testid={`team-workforce-controls-${editingUser.id}`}>
                <label>Display name<input className="input" value={editingUser.displayName || ''} onChange={(event) => setEditingUser({ ...editingUser, displayName: event.target.value })} onBlur={() => updateWorkforce(editingUser, { displayName: editingUser.displayName || '' })} data-testid={`team-profile-display-name-${editingUser.id}`} /></label>
                <label>Job title<input className="input" value={editingUser.jobTitle || ''} onChange={(event) => setEditingUser({ ...editingUser, jobTitle: event.target.value })} onBlur={() => updateWorkforce(editingUser, { jobTitle: editingUser.jobTitle || '' })} data-testid={`team-profile-job-title-${editingUser.id}`} /></label>
                <label>Department<input className="input" value={editingUser.department || ''} onChange={(event) => setEditingUser({ ...editingUser, department: event.target.value })} onBlur={() => updateWorkforce(editingUser, { department: editingUser.department || '' })} data-testid={`team-profile-department-${editingUser.id}`} /></label>
                <label>Seniority<input className="input" value={editingUser.seniority || ''} onChange={(event) => setEditingUser({ ...editingUser, seniority: event.target.value })} onBlur={() => updateWorkforce(editingUser, { seniority: editingUser.seniority || '' })} data-testid={`team-profile-seniority-${editingUser.id}`} /></label>
                {canAssignRoles && editingUser.role !== 'OWNER' ? (
                  <label>Role<select className="input" data-testid={`team-role-select-${editingUser.id}`} value={editingUser.role} onChange={(event) => { setEditingUser({ ...editingUser, role: event.target.value }); void updateRole(editingUser.id, event.target.value); }}>{ROLES.filter((r) => r !== 'OWNER').map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
                ) : null}
                {editingUser.role === 'OWNER' ? (
                  <label>Role<select className="input" data-testid={`team-role-select-${editingUser.id}`} value="OWNER" disabled><option value="OWNER">OWNER</option></select></label>
                ) : null}
                {[
                  ['isStaffMember', workforceTerms.singular],
                  ['isSchedulable', 'Include in scheduling'],
                  ['isAssignable', 'Can be assigned jobs'],
                  ['appearsOnRota', 'Show on rota'],
                  ['appearsInBookingAssignment', 'Booking assignment'],
                  ['isPublicBookable', 'Publicly bookable'],
                ].map(([key, label]) => (
                  <label key={key} className="team-workforce-switch">
                    <input
                      type="checkbox"
                      checked={Boolean(editingUser[key])}
                      disabled={(key !== 'isStaffMember' && !editingUser.isStaffMember) || (key === 'appearsOnRota' && !editingUser.isSchedulable) || (key === 'appearsInBookingAssignment' && !editingUser.isAssignable) || (key === 'isPublicBookable' && (!editingUser.isSchedulable || !editingUser.appearsInBookingAssignment))}
                      onChange={(event) => {
                        const next = { ...editingUser, [key]: event.target.checked };
                        setEditingUser(next);
                        void updateWorkforce(editingUser, { [key]: event.target.checked });
                      }}
                      data-testid={`team-workforce-${key.replace(/^is|^appearsIn|^appearsOn/, '').replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`).replace(/^-/, '')}-${editingUser.id}`}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );

}
