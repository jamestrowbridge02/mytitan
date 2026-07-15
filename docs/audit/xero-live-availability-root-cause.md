# Xero Live Availability Root Cause

The Xero OAuth and organisation-selection backend existed, but the tenant UI did not present deployment setup accurately.

Root causes:

- `XERO_REDIRECT_URL` was the only accepted redirect variable, while operator-facing setup material commonly refers to `XERO_REDIRECT_URI`.
- Connected Tools collapsed missing OAuth platform credentials into `Not available`, which looks like a missing product capability rather than an operator setup requirement.
- The setup page derived the callback URL from the app origin, even though the callback is handled by the API route.

Corrections:

- The API now accepts `XERO_REDIRECT_URI` and the legacy `XERO_REDIRECT_URL`.
- Missing Xero OAuth credentials now surface as `Setup required` for otherwise allowed/enabled tenants.
- Xero setup displays a safe callback URL from backend diagnostics without exposing secrets.
- Connected state still requires OAuth completion plus explicit organisation selection.

