## BYOG Integrations Implementation Map

### Current baseline
- Password reset flow lives in `api/src/auth/auth.service.ts` and uses `PasswordResetToken` plus tracked email notifications.
- Legacy integration connections live in `IntegrationConnection` and `IntegrationAuthState`.
- Existing integration UI lives in `app/pages/dashboard/integrations.tsx`.
- Existing webhook tooling is outbound only:
  - `IntegrationPlatformService` manages tenant-scoped API tokens, outbound webhook endpoints, and delivery logs.
  - `WebhookEvent` currently protects MyTitan Stripe billing webhooks from duplicate processing.
- Customer payment ownership messaging already exists in:
  - `api/src/billing/payment-collection.ts`
  - `api/src/bookings/bookings.service.ts`
  - billing and booking UI surfaces.

### Gaps before this change
- No dedicated password-reset regression suite.
- No generic tenant/user credential store for BYOG providers.
- No dynamic per-tenant integration client resolver.
- No inbound multi-tenant webhook route pattern for tenant-owned providers.
- Payment collection preferences can describe provider intent, but they do not yet derive readiness from a tenant-owned encrypted credential record.

### Target architecture

#### 1. Password reset testability
- Keep the production reset flow unchanged.
- Add E2E-only fixture helpers for a seeded safe account so tests can inspect the latest reset link without sending real email.
- Add a dedicated Playwright regression spec that covers:
  - newest link wins
  - replay fails closed
  - superseded unused links fail
  - expired links fail
  - invalid links fail
  - login works only with the new password after success

#### 2. BYOG credential store
- Add a new `IntegrationCredential` model for tenant-scoped and user-scoped BYOG credentials.
- Add a new `IntegrationWebhookReceipt` model for inbound webhook idempotency and safe processing state.
- Preserve `IntegrationConnection` for existing legacy OAuth connections so current functionality remains stable while BYOG expands.

#### 3. Dynamic client initialization
- Add a server-side client factory that:
  - resolves the correct tenant/user credential row at request time
  - decrypts payloads only server-side
  - never returns raw secrets to the frontend
  - returns safe error categories for disabled, missing, revoked, or misconfigured states

#### 4. Inbound webhook routing
- Add tenant-owned inbound webhook routes under:
  - `/integrations/webhooks/:provider/:routeId`
- Resolve the integration record by provider and stable route ID.
- Verify signatures with the provider-scoped stored secret.
- Enforce per-integration idempotency by provider event ID.
- Update last webhook timestamps and safe error state only.

#### 5. Truthful billing ownership
- Keep MyTitan Stripe limited to:
  - SaaS subscriptions
  - MyTitan job packs
- Make customer payment readiness depend on tenant-owned BYOG provider configuration.
- Preserve manual collection as the safe fallback whenever no tenant-owned provider is live.

#### 6. UI outcome
- Keep default wording business-friendly:
  - Connected tools
  - My integrations
  - Business integrations
  - Business payment setup
  - My calendar
  - Team calendar
  - Accounting connection
  - Needs reconnecting
- Reserve protocol details such as OAuth, webhook, token, and secret for advanced disclosure only.
