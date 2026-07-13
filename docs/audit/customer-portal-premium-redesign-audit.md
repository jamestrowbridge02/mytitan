# Customer Portal Premium Redesign Audit

Baseline route: `/dashboard/portal`

Primary API: `GET /portal/overview`

Settings API: `GET/PUT /tenant/settings`

Health API: `GET /tenant/account-health`

Lifecycle APIs:

- `POST /portal/jobs/:id/link`
- `POST /portal/jobs/:id/revoke`
- `POST /portal/jobs/:id/regenerate`

## Findings

- The page mixed portal link operations, customer access settings, appearance, payment controls, account health and audit history in one long workspace.
- The controller already enforces `portal.manage` and the service queries jobs by authenticated company id.
- Portal links are exposed to operators as full customer URLs only for active links. The schema still stores `PublicJobToken.token` as a raw token, so this pass preserves behavior and keeps tokens out of normal labels/tables.
- Customer-money readiness comes from tenant payment settings and `summarizeCustomerCollectionReadiness`; it does not use MyTitan billing Stripe as the customer payment path.

## Implemented Layout

- Compact header with one `Customer Portal` h1 and one primary preview action.
- Four snapshot metrics: active links, awaiting approval, expiring soon and expired.
- Primary tabs:
  - Customer access
  - Appearance
  - Payments
  - Portal links
- Compact setup alert using account-health counts.
- Portal links queue with status tabs, search, status filter and row overflow actions.
- Portal preview panel in Appearance and a consistent preview action.

## Preserved Security

- Permission gate remains `portal.manage`.
- Link lifecycle endpoints remain tenant-scoped.
- Raw portal tokens are not rendered as separate UI values.
- Expired links are not opened as active portal URLs.
- Revocation/regeneration remains audited by `PortalService`.
