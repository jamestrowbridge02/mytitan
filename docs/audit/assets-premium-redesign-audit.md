# Assets Premium Redesign Audit

## Scope

Tenant route: `/dashboard/assets`

The page used the enterprise asset API at `/enterprise/phase-9/assets` and already supported asset creation plus checkout, check-in, maintenance, out-of-service and inspection actions. The redesign keeps that API and moves the page to the shared premium pattern: one title, one primary action, a compact snapshot, search/filter controls and a register-first workspace.

## Item Mapping

| Previous item | Classification | Source / permission | New placement | Result |
| --- | --- | --- | --- | --- |
| Operations eyebrow | Duplicate navigation context | Shell route context | Removed from page content | Merged |
| Assets & tools title | Page title | Tenant asset route | `Assets` h1 | Renamed |
| Asset register heading | Main workspace | Asset API | Register section | Preserved |
| Tracked asset count | Metric | Asset API | Snapshot `Tracked` | Preserved |
| Add asset | Primary action | POST asset API | Header action and empty state | Preserved |
| Asset name | Create field | Asset API | Add asset panel | Preserved |
| Equipment type | Create/filter field | Asset API | Add panel and Type filter | Preserved |
| Serial number | Create/list field | Asset API | Add panel and register row | Preserved |
| Required for template | Advanced field | Asset API | `Required on selected job sheets` | Preserved with clearer label |
| Check out / Check in | Asset workflow | Asset API | Row actions | Preserved |
| Maintenance due / Out of service / Inspection | Asset workflow | Asset API | Row actions | Preserved |
| Location scope | Not implemented as authoritative page filter | N/A | Not added | Avoided false scope |

## Data Integrity

No asset states are invented. Snapshot metrics use existing asset status and assignment fields only.
