# Xero Production Setup

This runbook is for operator-controlled Xero activation. It must not be used to run automated live writes.

## 1. Xero Developer Application

- Create or confirm the MyTitan-owned Xero OAuth application.
- Configure the production callback URI exactly as exposed by MyTitan: `/integrations/xero/callback` on the production API origin.
- Request only required scopes:
  - `offline_access`
  - `accounting.transactions`
  - `accounting.settings`
  - `accounting.contacts`
  - `accounting.reports.read`
- Record the application environment as production or test.
- Configure webhook signing only after the endpoint and signing key are available.

## 2. MyTitan Platform Configuration

- Store the Xero client ID and client secret through the approved encrypted platform/runtime configuration path.
- Do not paste credentials into tenant-visible pages, documentation, logs, or tickets.
- Confirm the runtime reports setup available on the Xero tenant setup page.

## 3. First Organisation Connection

- Sign in as an authorised MyTitan business admin.
- Open `Dashboard -> Connected Tools -> Xero`.
- Start Connect Xero.
- Complete Xero OAuth as the Xero organisation owner or authorised delegate.
- Return to MyTitan and explicitly select the Xero organisation shown on the setup page.
- Run the read-only verification.

## 4. Mapping Wizard And Preview

- Configure sales account, payment/deposit account, tax rates, contact matching, invoice target state, tracking categories and reconciliation policy.
- Keep MyTitan operational records authoritative unless an operator-approved policy says otherwise.
- Use preview/dry-run output before any live export.

## 5. Operator-Controlled Canaries

- Contact canary: create or match only an approved test contact in the operator-owned Xero organisation.
- Invoice canary: export only an approved draft test invoice; do not approve, email, void, pay, refund or reconcile automatically.
- Reconciliation canary: import status/payment allocation only for the approved canary record.

## 6. Disconnect / Reconnect Drill

- Disconnect from MyTitan and confirm encrypted token material is removed.
- Confirm MyTitan invoices, contacts, payments and audit records are preserved.
- Reconnect and select the organisation again.

## 7. Rollback

- Disable live Xero sync flags.
- Disconnect the Xero tenant connection from MyTitan.
- Revoke the MyTitan OAuth app from Xero if required.
- Keep audit and historical mapping records for investigation.

## Status

Code-controlled integration setup is ready for isolated validation. Live operational readiness still requires real Xero app configuration, organisation-owner approval, read-only verification and operator-controlled canaries.
