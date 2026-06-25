# MyTitan Final Production Security Check

Date: 2026-06-06

## Scope

This was a safe, local, authorised review of the MyTitan deployment and source tree. It did not include destructive load testing, third-party attacks, credential guessing, payment-provider mutation, external uptime-monitor configuration, or attempts to bypass legal scope.

## Dependency security

- API production and development dependencies: `npm audit` reports 0 vulnerabilities.
- App production and development dependencies: `npm audit` reports 0 vulnerabilities.
- Marketing production and development dependencies: `npm audit` reports 0 vulnerabilities.
- API upgraded to patched stable NestJS 11 packages.
- App and marketing upgraded to patched stable Next.js 16.2.7.
- Patched `qs` and `postcss` transitive releases are pinned through package overrides.
- Marketing now has a lockfile for reproducible builds.

## Secret and key scanning

A repository scan excluded environment files, dependency directories, lockfiles, Git metadata, and documentation examples. It found no committed live Stripe keys, AWS access keys, GitHub tokens, Slack tokens, or private-key blocks in application source.

Environment/readiness checks remain presence-only. No secret values were printed or copied into this report.

## Authentication and authorisation

- Authenticated APIs continue to use JWT guards and role/permission guards.
- Workspace review submission is restricted to tenant `OWNER` and `ADMIN` roles.
- Review moderation and bespoke-enquiry inbox routes require platform-admin authorization.
- Tenant users cannot approve, reject, archive, pin, or reorder public reviews.
- Platform support-mode access remains timed, reason-gated, tenant-selected, and audited.
- Existing tenant isolation and RBAC regression suites remain part of the zero-skip validator.

## Public forms and content safety

- Bespoke enquiries require explicit contact consent.
- Public enquiry rate limiting uses a one-way request fingerprint and does not return raw request identity.
- A hidden spam field rejects automated submissions without creating records.
- Public and review text fields reject HTML-like angle-bracket input.
- DTO validation rejects unknown fields, invalid email, excessive lengths, invalid ratings, and invalid volume ranges.
- Public reviews are an allowlisted projection of approved, consented fields only.
- Pending, rejected, and archived reviews are excluded from the public endpoint.
- React renders review and enquiry text as text, not raw HTML.

## CSV and upload safety

- CSV import remains preview-first, role-gated, tenant-scoped, transactional, and rollback-capable for created records.
- Generated CSV error reports neutralize spreadsheet formula prefixes (`=`, `+`, `-`, `@`).
- Artifact and tenant-logo uploads retain MIME allowlists and explicit byte limits.
- Import DTO validation, duplicate checks, and no-overwrite defaults remain enabled.

## OAuth and request state

- OAuth authorization state is generated server-side, provider-bound, tenant/user scoped, expiring, looked up before exchange, and deleted when consumed.
- Invalid, expired, or provider-mismatched state fails closed.
- No OAuth token or provider secret is returned to browser readiness responses.

## Browser and transport controls

- API Helmet controls remain environment-gated by production configuration.
- Production CORS no longer defaults to every origin when no explicit list exists.
- App and marketing responses set `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and restrictive `Permissions-Policy` headers.
- Authentication uses bearer tokens rather than a cross-site cookie mutation flow; credentialed CORS remains allowlisted in production.

## Error and log handling

- Public responses use controlled validation and status messages.
- Review public output excludes tenant IDs, submitting user IDs, moderation notes, internal notes, request fingerprints, and email delivery metadata.
- Bespoke inbox contact data is available only to the platform-admin surface.
- Existing safe-error-log and request-ID handling remain in place.
- Automated security assertions verify that public review output does not expose private identifiers.

## Billing and external boundaries

- No Stripe mutation was performed.
- Checkout remains governed by existing readiness gates.
- Customer payment ownership remains separate from MyTitan subscription/job-pack billing.
- No external uptime monitor was configured or represented as configured.

## Residual security work

- External uptime monitoring remains intentionally deferred and must continue to be reported as `not_configured`.
- A future independent penetration test should use a written scope, isolated test tenant, rate limits, data-handling agreement, and explicit authorization.
- Dependency audits should remain release-gating checks because advisories and patched versions change over time.
