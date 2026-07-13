# Compliance Functionality Preservation Matrix

| Record/action | API | Permission | Previous location | New location | Status | Coverage |
| --- | --- | --- | --- | --- | --- | --- |
| SLA policy list | `/compliance/sla-policies` | Intelligence view | Main page | Policies tab | Preserved |
| Create policy | POST `/compliance/sla-policies` | Settings manage | Permanent form | Create policy dialog | Preserved/moved |
| Edit policy | PATCH `/compliance/sla-policies/:id` | Settings manage | Inline form | Policy dialog | Preserved/moved |
| SLA event list | `/compliance/sla-events` | Intelligence view | Main page | Events tab | Preserved/moved |
| Event entity links | `event.href` | Intelligence view | Event row | Event row | Preserved |
| Exception list | `/compliance/exceptions` | Intelligence view | Main page | Exceptions tab | Preserved/moved |
| Resolve/dismiss | POST exception actions | Settings manage | Exception row | Exception row | Preserved |
| Filters | Query params | Intelligence view | Filter block | Shared filter bar | Preserved |
