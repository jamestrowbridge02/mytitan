# Dashboard Priority Rules

Date: 2026-07-12  
Scope: tenant-facing `/dashboard`

The Dashboard shows exactly one dominant priority. It uses existing tenant-scoped data and filters every action through the current user permission snapshot before display.

## Inputs

| Input | Endpoint | Used for |
| --- | --- | --- |
| Permission snapshot | `/me` | Hiding actions the user cannot complete |
| Setup checklist | `/setup/checklist` | Owner setup priority when incomplete and permitted |
| Command-centre summary | `/command-centre/summary` | Drafts, live jobs, completed jobs, today’s bookings, unpaid jobs |
| Tenant settings | tenant settings hook | Canonical Live Work route |

## Deterministic Order

1. Complete essential setup when there is an incomplete first-value checklist item and the user has `settings.manage`.
   - If that incomplete setup item is the first booking/job step, the visible priority title is `Run the first booking or job` with a compact `Setup` detail.
2. Use the checklist recommended action when it is permitted and the user has `settings.manage`; the Dashboard still renders only one priority card.
3. Resume the newest available draft.
4. Assign unassigned live work when a live job has no assigned person and the scheduling route is permitted.
5. Send completed work when a completed due/overdue job exists.
6. Review overdue payment when an unpaid job exists and the user has `billing.manage`.
7. Open today’s booking when today has scheduled booking work and no stronger priority exists.
8. Show `No urgent action` with a compact Live Work link when no actionable priority exists.

## Guardrails

- The priority is never duplicated elsewhere on the page.
- Finance-related priorities require `billing.manage`.
- Setup priorities require `settings.manage`.
- Completed setup steps are ignored.
- The fallback state is calm and compact; it does not invent activity or celebrate zero data.
- Links point to the exact record when an ID is available, otherwise to the canonical source page.
