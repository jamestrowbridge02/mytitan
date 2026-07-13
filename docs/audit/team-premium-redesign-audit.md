# Team Premium Redesign Audit

Scope: `/dashboard/users`.

Preserved sources/actions:

- `/users`
- `/users/invite`
- `/users/:id/role`
- `/users/:id/workforce`
- `/tenant/settings`
- `/auth/resend-verification`

Model separation:

- Role controls system access and RBAC.
- Job title, department, seniority and employee reference remain profile metadata.
- Workforce membership controls scheduling/assignment/rota/public-bookable eligibility.
- Owner/admin/finance users are not made schedulable by labels.

New IA:

- Header snapshot: Members, Pending invites, Workforce active, Access issues.
- Members tab: searchable member queue.
- Invitations tab: setup-email status and contextual invite action.
- Roles & access tab: compact role matrix.
- Member editor: contextual modal with profile/access/work fields.
