# Accounting Integration Options

MyTitan businesses can use MyTitan Finance without connecting another accounting system. External accounting tools remain optional.

## Built In

MyTitan Finance supports invoices, payment requests, balances, statements, finance reporting and VAT record support. It is not presented as regulated accounting software, tax filing software or professional tax advice.

## Native Provider

Xero has a real OAuth and organisation-selection implementation. In the current production baseline it is shown as Setup required because production credentials are absent.

## Universal Provider Routes

QuickBooks, FreeAgent, FreshBooks, Zoho Books, Dynamics 365 Business Central, NetSuite, SAP Business One, Oracle accounting/ERP, MYOB, Odoo and Exact Online use scoped API tokens, signed webhooks and validated finance exports unless a native connector is later verified.

Sage and KashFlow use file exchange first, with API token and webhook routes available for approved external workflows.

These providers do not show fake native Connect actions.

## Flexible Connections

Finance export, scoped API tokens and signed webhooks are the current external-system path. Custom accounting systems should use approved API tokens and signed webhook deliveries, with secrets configured only in the dedicated developer tools flow. Accounting imports are not shown where validation, preview, dry run and confirmation are not implemented.

## Requesting A Provider

The marketplace request form is available from the detail drawer as a secondary native-connector request. It captures provider name, business reason, records to synchronise, one-way/two-way preference, current accounting software and optional contact permission. It does not request secrets or promise a delivery date.
