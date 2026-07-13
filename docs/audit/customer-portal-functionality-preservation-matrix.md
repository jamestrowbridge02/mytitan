# Customer Portal Functionality Preservation Matrix

| Setting/action | Current label | Route/API | Permission | Source | New location | Status | Test coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Enable portal | Portal access enabled | `PUT /tenant/settings` | `portal.manage` | `businessConfigJson.portalControls`, `featureCustomerPortal` | Customer access tab | Preserved | Dashboard workflow E2E |
| Public booking | Let customers book directly | `PUT /tenant/settings` | `portal.manage` | `bookingPublicEnabled` | Customer access tab | Preserved | Existing booking/settings coverage |
| ETA/progress visibility | Show ETA window | `PUT /tenant/settings` | `portal.manage` | Portal controls | Customer access tab | Preserved | Typecheck/E2E |
| Assigned person visibility | Show technician name | `PUT /tenant/settings` | `portal.manage` | Portal controls | Customer access tab | Preserved with customer-facing label | Typecheck/E2E |
| Photos | Show before/after photos | `PUT /tenant/settings` | `portal.manage` | Portal controls | Customer access tab | Preserved | Typecheck/E2E |
| Invoices/payments | Show invoices/payments | `PUT /tenant/settings` | `portal.manage` | Portal controls | Customer access and Payments tabs | Preserved | Typecheck/E2E |
| Downloads | Allow document download | `PUT /tenant/settings` | `portal.manage` | Portal controls | Customer access tab | Preserved | Typecheck/E2E |
| Brand colour | Portal brand colour | `PUT /tenant/settings` | `portal.manage` | Portal controls/business config | Appearance tab | Preserved with hex validation | Typecheck |
| Help message | Customer contact message | `PUT /tenant/settings` | `portal.manage` | Portal controls | Appearance tab | Preserved | Typecheck |
| Deposit required | Require deposit | `PUT /tenant/settings` | `portal.manage` | Portal controls | Payments tab | Preserved | Typecheck/E2E |
| Booking without deposit | Allow booking without deposit | `PUT /tenant/settings` | `portal.manage` | Portal controls | Payments tab | Preserved | Typecheck/E2E |
| Price visibility | Show service prices | `PUT /tenant/settings` | `portal.manage` | Portal controls | Payments tab | Preserved | Typecheck/E2E |
| Payment readiness | Payment path/readiness | `GET /portal/overview` | `portal.manage` | Tenant payment settings | Payments tab compact warning | Preserved | Typecheck/E2E |
| Prepare link | Prepare link | `POST /portal/jobs/:id/link` | `portal.manage` | `PublicJobToken`, `Job` | Portal links queue | Preserved | Dashboard workflow E2E |
| Open/preview link | Open customer page | Active `portalUrl` | `portal.manage` | `PublicJobToken` | Header preview and row action | Preserved | Dashboard workflow E2E |
| Copy link | Not dedicated | Client clipboard from `portalUrl` | `portal.manage` page | Active `portalUrl` | Row overflow | Added, token remains in full URL only | Manual/E2E candidate |
| Regenerate | Regenerate link | `POST /portal/jobs/:id/regenerate` | `portal.manage` | `PublicJobToken`, audit | Row primary/overflow | Preserved | Dashboard workflow E2E |
| Revoke | Revoke link | `POST /portal/jobs/:id/revoke` | `portal.manage` | `PublicJobToken`, audit | Row overflow | Preserved | Dashboard workflow E2E |
| Account health | Account health | `GET /tenant/account-health` | Page permissions | Tenant health service | Compact setup alert | Preserved and collapsed | Dashboard workflow E2E |
| Audit history | Portal lifecycle audit | `GET /portal/overview` | `portal.manage` | `AuditEvent` | Portal audit history | Preserved | Existing overview coverage |
