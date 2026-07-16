# Accounting Integration Options

MyTitan businesses can use MyTitan Finance without connecting another accounting system. External accounting tools remain optional.

## Built In

MyTitan Finance supports invoices, payment requests, balances, statements, finance reporting and VAT record support. It is not presented as regulated accounting software, tax filing software or professional tax advice.

## Native Provider

Xero has a real OAuth and organisation-selection implementation. In the current production baseline it is shown as Setup required because production credentials are absent.

## Planned Providers

QuickBooks, Sage, FreeAgent, FreshBooks, Zoho Books, KashFlow, Dynamics 365 Business Central, NetSuite, SAP Business One, Oracle accounting/ERP and MYOB are visible only with truthful Coming soon or API/webhook-compatible alternatives. They do not show fake Connect actions.

## Flexible Connections

Finance export, scoped API tokens and signed webhooks are the current external-system path. Custom accounting systems should use approved API tokens and signed webhook deliveries, with secrets configured only in the dedicated developer tools flow.

## Requesting A Provider

The marketplace request form captures provider name, business reason, records to synchronise, one-way/two-way preference, current accounting software and optional contact permission. It does not request secrets or promise a delivery date.
