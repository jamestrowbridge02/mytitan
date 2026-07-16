# Universal Integrations Security Review

## Reviewed Risks

| Risk | Result |
| --- | --- |
| SSRF | Outbound webhook URL validation blocks localhost, private/link-local ranges, metadata endpoints, URL credentials and unsafe production schemes/ports. Generic REST execution remains gated. |
| DNS rebinding | Webhook hostnames are resolved before storage and blocked if any address is private or metadata-like. |
| Redirect abuse | Generic REST execution is not shipped. Webhook delivery does not follow custom redirect logic or expose platform secrets in arbitrary headers. |
| OAuth state/PKCE | Only existing native provider flows may claim OAuth. Generic OAuth2 remains gated. |
| Token encryption | Existing integration/webhook secrets use encrypted storage and reveal-once handling. |
| Secret redaction | Tenant UI and Platform Admin diagnostics report presence/counts only. |
| Webhook forgery/replay/idempotency | Existing provider webhook routes validate signatures and duplicate event IDs. Outbound webhooks are signed. |
| CSV formula injection | File exchange remains export-focused from supported Finance data; imports are not claimed where not implemented. |
| Malicious files | Scheduled import is not shipped from the marketplace. |
| Tenant isolation/RBAC | Marketplace actions link to existing tenant-scoped settings, Finance, booking and Developer Tools permission gates. |
| Rate limits/timeouts | Existing outbound webhook delivery has a request timeout. Generic REST remains gated pending full response-size and retry-storm controls. |

## Decision

Ship the universal marketplace as an action layer over existing safe primitives. Do not ship a generic REST runner, generic OAuth2, CalDAV sync or broad import pipeline in this release.
