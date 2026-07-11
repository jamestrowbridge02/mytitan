# Customer Payment Request Audit

Date: 2026-07-11

## Source of Truth

`CustomerPaymentRequest` is the authoritative collection-instruction record for tenant customer payment requests. It is not proof of payment. Invoice and job payment truth remains on the job/invoice fields and is updated only after provider webhook evidence or an authorised manual settlement action.

## Current Paths Mapped

| Area | Current state | Result |
| --- | --- | --- |
| Stripe Connect | Tenant-owned customer payment provider readiness exists through BYOG credentials and guarded checkout creation. | Used only when the tenant/customer provider is ready. MyTitan Billing Stripe is excluded. |
| Manual bank transfer | Manual collection records already existed for job payment requests. | Finance can now create manual requests and secure instruction pages. |
| Manual card terminal | Covered by manual settlement method and evidence workflow. | Requires authorised manual settlement before paid state. |
| Booking deposits | Existing booking deposit checkout path remains separate and tenant-provider gated. | Not reused for Finance requests. |
| Invoice payments | Existing job-scoped payment request path existed from job detail. | Finance can now create from invoice/job and defaults amount from outstanding balance. |
| Statements | Statement generation/sending existed without payment request creation. | Finance can now create statement-linked requests. |
| Customer portal | Job portal showed job-scoped payment request state. | New opaque `/payment-request/:token` page supports source-neutral requests. |
| Provider webhooks | Existing tenant payment webhook handling updates request status and invoice truth. | Preserved. |
| Finance page | Report showed payment request counts and reconciliation queue but no primary create action. | Added `Create payment request` flow and Payment requests table. |

## Root Cause

Finance reported payment request counts from existing job-scoped records but did not expose a visible creation workflow. Payment request creation was reachable from job detail only, which made custom, statement, customer, and standalone collection instructions unavailable from Finance.

## Consolidation

No duplicate payment request model was created. The existing table was extended with source-neutral fields:

- `sourceType`
- `bookingId`
- `statementId`
- `relatedRecordLabel`
- `recipientEmail`
- `recipientPhone`
- `description`
- `reference`
- `deliveryChannel`
- `expiresAt`
- `viewedAt`
- `expiredAt`

`jobId` is now optional so standalone and statement/customer requests do not require a false job record.

## Provider Boundary

Finance requests use `getTenantPaymentProviderReadiness()` and `createTenantStripeCheckoutSession()` through the tenant/customer provider path only. MyTitan Billing Stripe is explicitly marked as excluded and is not offered in the provider selector.

Reserved providers such as PayPal, Open Banking and GoCardless remain unavailable until implemented. Manual collection remains available and never marks a request paid without authorised evidence.

## Email Boundary

Payment request email delivery uses the operational customer email resolver. The visible sender uses business identity through MyTitan delivery infrastructure, with business Reply-To where configured. No unverified business From address is spoofed.

## Security Controls

- RBAC uses `billing.manage`.
- Tenant lookup is scoped by `companyId` / `tenantId`.
- Public access uses an opaque token hash.
- Public page omits tenant IDs, provider references, internal notes and audit metadata.
- Provider references are masked in authenticated responses.
- Webhook settlement remains signature-gated.
- Duplicate active requests are blocked per related record.
- Invoice paid state is not changed by request creation.

## Remaining External / Operator Actions

- Live Stripe Connect checkout still requires tenant-owned provider readiness and live feature flags.
- Manual bank/card settlement requires finance evidence before marking paid.
- SMS delivery remains unavailable unless a configured provider is added.
