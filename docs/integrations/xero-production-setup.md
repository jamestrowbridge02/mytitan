# Xero Production Setup

This runbook is for operator-controlled Xero activation. Automated tests must use mocked provider responses and must not call live Xero.

Required runtime values:

- `XERO_CLIENT_ID`
- `XERO_CLIENT_SECRET`
- `XERO_REDIRECT_URI` or legacy `XERO_REDIRECT_URL`
- `INTEGRATIONS_ENCRYPTION_KEY`
- `API_PUBLIC_URL`
- `APP_PUBLIC_URL`

The Xero developer app callback must exactly match the API callback:

`https://api.mytitan.co.uk/integrations/xero/callback`

Tenant operator flow:

1. Open Connected Tools.
2. Open Accounting.
3. Confirm Xero is `Available` or `Setup required`.
4. Select Connect only when setup is available.
5. Complete Xero OAuth manually.
6. Return to MyTitan.
7. Select the Xero organisation.
8. Confirm the connection shows Connected.

Never publish client secrets, access tokens, refresh tokens, raw tenant IDs, organisation IDs or encrypted payloads.

