# Payment Provider Connection Framework

Tenant customer funds must never use MyTitan subscription Stripe. Payment provider cards therefore point to tenant-owned, verifiable routes:

- Stripe: native tenant customer payment setup through the existing guided Stripe flow.
- Bank transfer: tenant bank instructions and reconciliation.
- Manual card terminal, cash, cheque and financing/reference: manual collection records with operator evidence.
- PayPal, Square, GoCardless, Worldpay, Adyen, Checkout.com, Mollie, Braintree, Opayo and similar providers: provider-hosted payment links or instructions, with manual/reconciliation review before payment completion.
- SumUp, Zettle, Dojo, Tyl, Takepayments, Barclaycard, Lloyds Cardnet and similar terminal providers: terminal/manual collection plus reconciliation reports.
- Custom payment provider: payment link, signed webhook, reconciliation import or manual collection.

## Verification Boundary

Payment status must remain pending until a verified provider event, reviewed reconciliation import, or audited manual collection confirms it. Unverified webhook events cannot mark customer payment complete.

## Security Boundary

Payment link templates must use approved placeholders only. Provider credentials are not requested in catalogue cards. Signed payment webhooks require signature, timestamp/replay and idempotency controls before they affect payment state.
