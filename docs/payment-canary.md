# Stripe booking deposit and refund canary

Use `scripts/stripe-deposit-refund-canary.sh` for a safe booking-deposit canary.

The script is intentionally strict:

- it refuses to run if `STRIPE_SECRET_KEY` is absent
- it inspects only the key prefix to determine mode
- it refuses live-mode keys unless `MYTITAN_CANARY_CONFIRM_LIVE=1` is set explicitly
- it does not print the key, webhook secret, or private URLs

Supported outcome paths:

- `REFUSED: ...` means a safe precondition is missing or live-mode approval was not supplied
- `Running test-mode canary.` means it is executing the deposit/refund Stripe Playwright coverage against test-mode credentials
- `Running live-mode canary after explicit confirmation.` means the operator explicitly overrode the refusal guard

Test-mode workflow:

1. create a controlled booking deposit checkout path
2. verify payment only after a signed webhook/test event
3. request refund
4. verify refund only after a signed webhook/test event
5. verify finance state reflects the authoritative refund data
6. keep duplicate webhook handling idempotent

Live-mode guidance:

- do not run this script against live keys unless an operator has approved a real canary window
- record the canary booking reference, timestamps, and operator sign-off outside the application
- review the finance report and webhook logs after completion
