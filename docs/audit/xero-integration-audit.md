# Xero Integration Audit

Date: 2026-07-10

Scope: read-only audit and code-controlled remediation of the MyTitan Xero connection path. No Xero secrets, tokens, tenant IDs, customer accounting data, invoices, payments, or live provider writes are included here.

## Current Root Cause

The Xero setup UI previously started OAuth through `IntegrationConnection`, but accounting sync readiness checked `IntegrationCredential`. That split meant the UI could appear connected while sync/readiness still saw setup as missing.

The callback also queried Xero organisations and silently selected the first available organisation. That created an unsafe “connected” state without explicit business-admin confirmation of the Xero organisation.

## Implementation Map

| Path | Source file | Route | Permission | Source of truth | Working state | Missing dependency / risk | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Xero status | `api/src/integrations/integrations.controller.ts` | `GET /integrations/xero/status` | Owner/Admin/Staff/Read only | `IntegrationConnection` | Returns redacted setup, connection, health and diagnostics state | Requires platform OAuth config for real connect | Keep token-free responses |
| Xero connect | `api/src/integrations/integrations.controller.ts` | `POST /integrations/xero/connect` | Owner/Admin | `IntegrationAuthState` then `IntegrationConnection` | Creates short-lived state and redirects to Xero | External Xero app credentials must exist | Operator configures Xero app registration |
| Xero callback | `api/src/integrations/integrations.controller.ts` | `GET /integrations/xero/callback` | Provider redirect | `IntegrationConnection` | Exchanges code, stores encrypted tokens, records pending organisation state | Real Xero callback requires matching redirect URI | Verify with real read-only connection |
| Xero organisation selection | `api/src/integrations/integrations.controller.ts` | `GET /integrations/xero/organisations`, `POST /integrations/xero/organisations/select` | Owner/Admin | `IntegrationConnection.metadataJson` and selected organisation fields | Uses redacted selection IDs; marks connected only after selection/read-only verification | External organisation owner must approve access | Operator-controlled live read-only verification |
| Xero health check | `api/src/integrations/integrations.controller.ts` | `POST /integrations/xero/check` | Owner/Admin | `IntegrationConnection` | Reports select-organisation versus ready state without provider mutation | Does not perform invoice/contact/payment writes | Keep as safe launch gate |
| Xero sync check | `api/src/integrations/integrations.controller.ts` | `POST /integrations/xero/sync` | Owner/Admin | `IntegrationConnection` | Blocks until connection is selected and verified; remains read-only gated | Mapping/export live sync not enabled | Build live sync only behind explicit operator-gated workflow |
| Disconnect | `api/src/integrations/integrations.controller.ts` | `POST /integrations/xero/disconnect` | Owner/Admin | `IntegrationConnection` | Removes encrypted token material and preserves historical row/audit | Provider-side revoke is not yet implemented | Add revoke when Xero app credentials are configured and tested |
| Tenant setup UI | `app/pages/dashboard/settings/integrations/[provider].tsx` | `/dashboard/settings/integrations/xero` | Authenticated tenant user | Status API | Shows setup blocker, organisation selector, safe actions | Real credentials still external | Operator completes Xero production setup |

## Security Result

- OAuth codes and tokens are never returned to the browser.
- Raw Xero tenant IDs are not returned; organisation selection uses short one-way selection IDs.
- Stored OAuth token material uses the existing encrypted integration secret storage.
- Live provider mutation remains disabled from automated checks.
- Sync readiness now uses the same `IntegrationConnection` source of truth as OAuth status.

## Current Capability State

- Connect initiation: code-controlled and ready once platform credentials exist.
- Callback: code-controlled and stores encrypted token material.
- Organisation selection: code-controlled and explicit.
- Token refresh: not fully implemented for live rotation; external Xero verification remains required.
- Contacts, invoices and payment reconciliation: dry-run/readiness only; no live Xero mutation is enabled by this change.
- Webhook handling: generic integration webhook primitives exist, but Xero-specific signing/event routing is not claimed ready.

## Required External Actions

- Register/verify the Xero developer application.
- Configure the exact callback URI in Xero.
- Store Xero client ID and client secret in approved runtime/platform configuration.
- Have the Xero organisation owner approve the connection.
- Run a real read-only organisation verification.
- Run operator-controlled contact and invoice draft canaries before enabling live writes.
