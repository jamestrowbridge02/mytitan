# ADR 0001: Tenant Payment Separation

## Context
MyTitan owns SaaS subscription billing and gated job-pack billing. Operators may collect customer payments for real work, but those funds belong to the tenant/operator, not MyTitan.

## Decision
Keep MyTitan Stripe usage limited to SaaS subscriptions and explicitly enabled job packs. Customer/operator payment providers must use tenant-owned bring-your-own-gateway contracts behind provider interfaces.

## Consequences
- Tenant payment integrations cannot charge customers on the MyTitan platform account.
- Stripe Connect customer payments use direct charges on the tenant connected account. The tenant remains merchant of record and customer funds remain on that connected account.
- Product catalog work must not create customer payment routes through MyTitan billing.
- Tenant payment readiness must be visible without implying MyTitan is merchant of record.

## Rejected Alternatives
- Using charges created on the MyTitan platform account as the customer payment path.
- Sharing SaaS catalog identifiers with tenant payment workflows.
- Enabling job-pack checkout without verified readiness and explicit confirmation.

## Rollout Notes
Ship tenant payment work behind `tenant_payments_byog_v1`. Provider adapters must start in dry-run mode and pass billing boundary tests before any checkout path is exposed.
