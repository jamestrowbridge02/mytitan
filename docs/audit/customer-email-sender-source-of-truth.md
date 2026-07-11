# Customer Email Sender Source Of Truth

Date: 2026-07-10

Scope: customer-facing email identity, readiness wording and delivery source resolution. This audit does not include SMTP credentials, provider secrets, message bodies, raw recipient lists or customer data.

## Root Cause

The product previously exposed the internal implementation split directly to tenant users:

- workspace/custom SMTP sender readiness
- MyTitan system sender readiness
- effective fallback delivery readiness

That made a healthy customer-email path look broken when the optional workspace sender was not configured. The backend could send through the verified MyTitan system sender, but the UI still showed “workspace sender not set up” and “customer email not set up” language.

## Authoritative Model

Customer email is resolved in this order:

1. Verified custom business sender/domain, when explicitly configured and verified.
2. Verified MyTitan email service using the business display name and the business email as Reply-To.
3. If a business Reply-To is missing, MyTitan email service can still send, but the UI asks the operator to add a reply email.

The custom sender/domain is an optional white-label upgrade. It is not required for basic customer email delivery.

## Sources

| Source | Purpose | Source of truth | Tenant-facing result |
| --- | --- | --- | --- |
| Business/trading name | Sender display name and template branding | Tenant settings `companyName` and `emailSenderName` | Used as sender label, e.g. `Wheel A&R via MyTitan` |
| Business reply email | Reply-To for customer responses | Tenant settings `emailReplyTo`, then `contactEmail` | Shown as `Replies` |
| MyTitan system sender | Verified From address and SMTP transport | Platform Email Provider config or runtime environment | Shown as `MyTitan email service` |
| Custom sender/domain | Optional verified From identity | Existing workspace SMTP readiness path | Shown as optional unless verified |
| Auth/security sender | Password reset and platform auth mail | System-owned email path | Kept separate from tenant branding where required |

## Security Result

- Unverified business email is never used as the SMTP From address.
- When MyTitan delivery is active, the From address is the verified MyTitan system sender.
- Business email is used as Reply-To only.
- SMTP credentials and provider secrets are not returned by APIs or rendered in the UI.
- SPF, DKIM and DMARC remain required for custom sender/domain verification but are not shown as mandatory for basic MyTitan delivery.
- Tenant isolation, audit events and outbound delivery records remain unchanged.

## User-Facing Wording

Tenant settings now present one summary:

- Customer email status
- Sending identity
- Replies
- Delivery service
- Custom sending domain

The old contradictory wording is removed from the primary tenant-facing path:

- Workspace sender: Not set up
- Customer email is not set up yet
- Ready via MyTitan fallback
- Sent by MyTitan because your workspace sending email is not set up

## Flow Coverage

Operational customer email sends use `EmailService.getOperationalReadiness()` and `sendOperationalEmail()`. The system path now passes the resolved business sender label and Reply-To into the MyTitan system sender instead of sending with a generic MyTitan display name.

Covered paths include booking notifications, job/service-record emails, customer messages, customer workspace invitations, summaries and operational notifications where policy allows. Auth and platform security emails remain system-owned.

## Remaining Optional Actions

- Add a business Reply-To if the tenant has none.
- Configure and verify a custom sending domain only if the business wants a deeper white-label From address.
- Platform Admin keeps maintaining the MyTitan email provider, SPF, DKIM, DMARC and provider health evidence.
