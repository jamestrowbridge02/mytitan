# Customers Premium Redesign Audit

Date: 2026-07-12

## Previous Surface Classification

| Previous item | Classification | New placement |
| --- | --- | --- |
| Customers page title repeated in shell/page/guidance | Duplicate information | Single page-owned h1 |
| Add contact | Primary customer action | Header primary action as Add customer |
| New Job | Contextual workflow action | Header secondary action and row overflow |
| Review Bookings | Secondary navigation | Header secondary action and row overflow |
| Customers / Ready for first work / Needs follow-up / Missing contact metrics | Relationship metrics | Four concise metric filters |
| Customer intake stays clear | Explanatory noise | Removed |
| First-job path stays available | Explanatory noise | Removed |
| Follow-up stays visible | Explanatory noise | Removed |
| Customer relationships paragraph | Explanatory noise | Replaced by Customer queue heading |
| All / Ready for work / Needs follow-up / Recent activity / Missing contact views | Queue filters | All / Ready for work / Needs follow-up / Missing details; recent activity remains available through Activity filter |
| Search customer, phone, or email | Queue filter | Search customers... |
| Contact filter | Queue filter | Preserved |
| Activity filter | Queue filter | Preserved |
| Reset filters always visible | Duplicate control | Visible only when filters are active |
| Move relationships into work guidance | Explanatory noise | Removed |
| Bulk copy actions | Queue action | Preserved when rows selected |
| Empty-state paragraph and many actions | Empty-state content | Concise empty state with one primary and one secondary action |
| Custom fields card | Configuration/record detail | Preserved contextually after selection |

## New Information Architecture

1. Compact Customers header
2. Relationship snapshot
3. Single contextual customer action when real data supports it
4. Customer queue
5. Row primary action and overflow actions
6. Contextual custom fields editor

## Copy Reduction

Removed permanent workflow education and repeated title-like labels. Technical/internal wording such as workspace is not used in the normal Customers page content.

## Data and Permissions

The redesign continues to use the existing `/customers`, `/custom-fields/values`, `/trade-accounts`, `/activity/events` and `/activity/communications/send` flows. Server-side tenant isolation, RBAC and audit behavior are unchanged.
