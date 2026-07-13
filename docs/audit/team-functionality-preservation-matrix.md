# Team Functionality Preservation Matrix

| Record/action | API | Permission | Previous location | New location | Status | Coverage |
| --- | --- | --- | --- | --- | --- | --- |
| Member list | `/users` | Team manage | Always expanded cards | Members table | Preserved |
| Invite | `/users/invite` | `users.invite` | Permanent form | Invite dialog | Preserved/moved |
| Role change | `/users/:id/role` | `users.role_assign` | Inline select | Member editor | Preserved/moved |
| Profile fields | `/users/:id/workforce` | `users.role_assign` | Inline editor | Member editor | Preserved/moved |
| Workforce switches | `/users/:id/workforce` | `users.role_assign` | Inline editor | Member editor | Preserved/moved |
| Verification resend | `/auth/resend-verification` | Current user | Warning card | Warning card | Preserved |
| Role reference | Static role matrix | Team manage | Large cards | Roles & access table | Preserved/collapsed |
| Audit trail | `/dashboard/audit` | Team manage | Role model header | Header/action | Preserved |
