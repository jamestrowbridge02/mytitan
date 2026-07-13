# Compliance Premium Redesign Audit

Scope: `/dashboard/compliance`.

Preserved sources:

- `/compliance/sla-policies`
- `/compliance/sla-events`
- `/compliance/exceptions`
- `/compliance/summary`
- `/locations`

Functional areas:

| Area | Current issue | New placement |
| --- | --- | --- |
| SLA policies | List plus permanent creation form | Policies tab plus contextual editor |
| SLA events | Always shown below policies | Events tab |
| Exceptions | Always shown below events | Exceptions tab |
| Filters | Permanent explanatory block | Compact shared filters |
| Navigation shortcuts | Header actions competing with work | Secondary header actions |
| Empty states | Repeated long workspace explanations | Concise tab-specific states |

Policy creation, editing, event links, exception resolve/dismiss and permission gates remain unchanged.
