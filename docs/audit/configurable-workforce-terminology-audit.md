# Configurable Workforce Terminology Audit

Date: 2026-07-11

## Root Cause

MyTitan historically used `Technician` for three different concepts:

- an internal permission/capability surface for assigned field execution
- a schedulable workforce participant
- a tenant-facing business label

Those concepts now remain separate. Permission and route names can stay technical for compatibility, while tenant-facing labels resolve from business terminology settings.

## Classification

| Area | Existing wording | Classification | Result |
| --- | --- | --- | --- |
| `UserRole.TECHNICIAN` | Technician | Genuine role/permission concept | Kept as internal RBAC enum. It does not define job title or scheduling visibility. |
| Technician route/API names | `/dashboard/technician`, `technician.execute` | Technical/internal model name | Kept for compatibility and server enforcement. |
| Calendar filters and rota labels | Technician/staff | Tenant-facing display text | Uses configured workforce label where the UI describes schedulable people. |
| Public booking provider choice | Provider/team member | Business-configurable terminology | Uses `workforceTerminology.publicBookingLabel`. |
| Team profile fields | Staff member, job title, department, seniority | Person model | Job titles/departments are editable display metadata and do not grant permissions. |
| Platform Admin diagnostics | Technician/internal capability | Platform diagnostic | May show both configured label and internal capability for support clarity. |
| Historical records and test fixture ids | technician | Legacy compatibility wording | Left unchanged to preserve stable IDs, URLs, and historical data. |

## Source Of Authority

Identity/profile:

- `User.displayName`
- `User.jobTitle`
- `User.department`
- `User.seniority`
- `User.employeeReference`

System access:

- `User.role`
- `User.permissionProfile` as display metadata only
- server-side permission checks remain authoritative

Workforce participation:

- `User.isStaffMember`
- `User.isSchedulable`
- `User.isAssignable`
- `User.appearsOnRota`
- `User.appearsInBookingAssignment`
- `User.isPublicBookable`
- `User.skillsJson`
- location membership/default location

Business terminology:

- `TenantSetting.businessConfigJson.workforceTerminology.singular`
- `TenantSetting.businessConfigJson.workforceTerminology.plural`
- `TenantSetting.businessConfigJson.workforceTerminology.defaultFieldWorkerLabel`
- `TenantSetting.businessConfigJson.workforceTerminology.publicBookingLabel`

## Safety Notes

- Terminology changes do not alter RBAC.
- Owners/admins are not made schedulable by terminology changes.
- Public booking lists only active, schedulable, assignment-visible, public-bookable users.
- Existing assignments are not rewritten.
- Wheel A&R can keep Technician/Technicians by configuration.
