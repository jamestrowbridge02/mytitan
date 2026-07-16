# Universal Connector Security Boundaries

Universal integration routes must remain governed.

## Enforced Now

- API tokens are reveal-once, tenant-scoped and revocable.
- Outbound webhooks use encrypted signing secrets and delivery logs.
- Webhook destinations reject URL credentials, localhost/private/link-local/cloud metadata addresses, unsafe hostnames and production non-HTTPS destinations.
- Production webhook ports are restricted to default HTTPS.
- Webhook hostnames are DNS-resolved before storage so blocked resolved addresses are rejected.
- Finance file exchange remains export-led unless an import path has validation, preview and confirmation.
- ICS feeds use opaque booking tokens and tenant settings do not return raw ICS tokens.
- Payment completion is not inferred from unverified provider webhooks.

## Gated

- Generic REST connector execution is not shipped from the marketplace until SSRF controls, DNS rebinding controls, redirect limits, response limits and timeout policy are proven end to end.
- Generic OAuth2 is not shipped until state/PKCE, redirect allowlisting and encrypted token handling are implemented for that flow.
- Scheduled imports are not shown as available unless malware/file validation, mapping preview, duplicate detection, dry run, explicit confirmation, audit and rollback strategy exist.
- Arbitrary code transformations are prohibited.
