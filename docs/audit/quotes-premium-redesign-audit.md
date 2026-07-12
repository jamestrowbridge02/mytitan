# Quotes Premium Redesign Audit

## Scope

Tenant route: `/dashboard/quotes`

The page uses `/quotes`, `/customers?limit=200`, `/me` and quote lifecycle endpoints. The redesign keeps quote permissions, source data and lifecycle actions while making the quote queue the primary workspace and moving creation/editing into a focused editor.

## Item Mapping

| Previous item | Classification | Source / permission | New placement | Result |
| --- | --- | --- | --- | --- |
| Revenue ops eyebrow | Duplicate navigation context | Shell route context | Removed | Merged |
| Quotes title | Page title | Page route | One `Quotes` h1 | Preserved |
| Accounting/audit explanatory copy | Explanatory noise | Static UI | Removed from permanent UI | Collapsed |
| Create quote | Primary action | `billing.manage`, POST `/quotes` | Header action opens editor | Preserved |
| Drafts / Awaiting approval / Approved / Converted / Expired stats | Lifecycle metrics | Quote API | Four-card snapshot and queue tabs | Preserved/merged |
| Quote list | Main workspace | Quote API | Quote queue | Preserved |
| Raw line item textarea | Editing implementation detail | Quote API payload | Structured line-item editor | Replaced safely |
| Save draft/edit | Lifecycle action | POST/PATCH `/quotes` | Editor save | Preserved |
| Send / approve / decline / convert | Lifecycle actions | Quote endpoints | Row actions | Preserved |
| Linked job reference | Queue context | Quote API | Row metadata | Preserved |
| Empty state | Long workflow copy | Quote API | Concise empty state | Improved |

## Data Integrity

Totals remain server-authoritative. The UI converts normal currency input into minor units before sending existing API payloads.
