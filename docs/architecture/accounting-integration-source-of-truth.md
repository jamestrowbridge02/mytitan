# Accounting Integration Source Of Truth

`IntegrationConnection` is the authoritative tenant connection model for accounting OAuth providers.

For Xero:

- `status=organization_selection_required` means OAuth tokens were stored but no organisation has been selected.
- `status=connected` requires an explicit selected organisation and read-only verification timestamp.
- `externalTenantId` remains server-side and is never returned to the tenant UI.
- `externalTenantName` may be displayed as the safe organisation label.
- `metadataJson.pendingOrganisations` is used only to create redacted selection tokens.
- `accessTokenEncrypted` and `refreshTokenEncrypted` must never leave the API.

QuickBooks remains truthful to deployment readiness. It may show a connect action only when the OAuth setup route is actually configured.

Sage has no tenant OAuth journey in this release and must remain coming soon.

Connected Tools must distinguish native Finance, native OAuth providers, import/export paths, API/webhook-compatible paths and planned providers. Catalogue cards may describe alternatives, but they must not show Connected without `IntegrationConnection` evidence, must not show Connect without a real usable route, and must not expose raw provider IDs, tenant IDs, access tokens, refresh tokens or encrypted payloads.
