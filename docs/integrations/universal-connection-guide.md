# Universal Connection Guide

Use the strongest truthful connection method available.

## Accounting

- Use MyTitan Finance when no external accounting system is required.
- Use Xero native setup when platform credentials and tenant organisation selection are ready.
- Use QuickBooks, FreeAgent, FreshBooks, Zoho Books, Dynamics, NetSuite, SAP Business One, Oracle, MYOB, Odoo or Exact Online through scoped API tokens, signed webhooks and finance exports unless a native connector is later verified.
- Use Sage and KashFlow through finance file exchange plus API/webhook options.

## Payments

- Use Stripe only through the tenant customer-payments flow.
- Use provider-hosted payment links or instructions for PayPal, Square, GoCardless, Worldpay, Adyen, Checkout.com, Mollie, Braintree and similar providers.
- Use manual collection and reconciliation for terminal providers such as SumUp, Zettle, Dojo, Tyl, Takepayments, Barclaycard and Lloyds Cardnet.
- Keep payment pending until verified by webhook, reviewed reconciliation or audited manual evidence.

## Calendar

- Use Google Calendar native sync where connected.
- Use the MyTitan ICS feed for Apple Calendar, Microsoft 365, Outlook, Exchange and generic calendars.
- Use scoped API tokens and signed webhooks for scheduling systems.

## Custom Systems

Use Developer Tools for scoped API tokens and signed webhooks. Use Finance exports, booking ICS feeds, payment-link tracking and manual collection where those workflows match the external system.

Do not enter provider passwords, API keys, client secrets, tokens, tenant IDs or organisation IDs into marketplace cards or support requests.
