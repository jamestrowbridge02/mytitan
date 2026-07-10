# MyTitan Mass Launch Readiness Dossier - 2026-07-10

This dossier records the final engineering pass completed in this session. It is evidence-led and does not claim formal security, legal, or compliance certification.

## Executive Summary

MyTitan was advanced from baseline `a26da0c8` to `31c5d03c` with scoped, validated improvements across launch evidence preservation, Calendar/Operations, Enterprise Annual billing repair, integration marketplace truthfulness, profile-save reliability, and final release evidence.

The repository is not certified as formally compliant. The current code-controlled changes validated successfully, including the complete isolated E2E suite: 489 passed, 0 failed, 0 skipped, 0 flaky.

The main remaining launch constraints are external/operator/legal prerequisites, especially external uptime monitoring, provider credentials/registrations, legal approval of policy/certificate claims, and any live Stripe catalog/account mapping decisions that require operator confirmation.

## Implemented Code-Controlled Changes

| Area | Result | Evidence |
| --- | --- | --- |
| Baseline and change safety | RESOLVED IN CODE | Safety archive created at `/root/mytitan-launch-completion-backups/20260710T010908Z`; baseline document created. |
| Pre-existing UX/test work | RESOLVED IN CODE | Preserved and committed as `c078288b feat(ui): preserve launch product polish`. |
| Operations command centre | RESOLVED IN CODE | Calendar gained Bookings, Staff rota, Availability, Capacity, Assets, Fleet, and Live map lenses; warnings and capacity evidence added; committed as `72ad357e`. |
| Enterprise Annual repair | RESOLVED IN CODE | Safe candidate discovery/adoption wizard added; uses configured MyTitan Billing Stripe credential; never mutates Stripe products/prices; committed as `19e03bd9`. |
| Integration marketplace | RESOLVED IN CODE | Tenant-facing provider states now distinguish connected, setup-required, external-account, beta, not-implemented, and not-available; committed as `150a0ea5`. |
| Integration tests | RESOLVED IN CODE | Old marketplace expectations updated; committed as `f5d64be8`. |
| Trade profile save reliability | RESOLVED IN CODE | Business Profile form is disabled while loading/saving to prevent hydration overwrites; committed as `08c3980d`. |
| Final release evidence | RESOLVED IN CODE | Release branch attached at `31c5d03c`; final audit evidence committed after validation. |

## Validation Results

Detailed validation evidence is in `docs/audit/mass-launch-evidence/validation-summary-2026-07-10.md`.

| Validation | Result |
| --- | --- |
| App/API/marketing typecheck | PASS |
| App/API/marketing build | PASS |
| Billing catalog diagnostics | PASS |
| Production boundary guards | PASS |
| Bundle budgets | PASS |
| Healthcheck | PASS |
| Production readiness | PARTIAL: external uptime monitor not configured |
| Backup readiness | PASS |
| Container scheduling smoke | PASS |
| Protected-record verification | PASS |
| Principal-admin immutability | PASS |
| Full isolated E2E | PASS: 489 expected, 0 unexpected, 0 skipped, 0 flaky |

## Final Release Candidate State

| Item | Classification | Evidence |
| --- | --- | --- |
| Authoritative release branch | RESOLVED IN CODE | `release/v1.0.0-clean` fast-forwarded from `2787fe09` to `31c5d03c`; production worktree is no longer detached. |
| Release tag | RESOLVED IN CODE | Planned annotated tag: `v1.0.0-rc1`, to be created after this dossier/evidence commit. |
| Tag target commit | RESOLVED IN CODE | Target is the validated release branch HEAD after final evidence commit. |
| Rollback reference | RESOLVED IN CODE | Previous protected release baseline: `2787fe098321cbb5402b1d10f3288f722e507756`; previous rollback tag: `v1.0.0-clean`. |
| Deployment verification state | VERIFIED IN PRODUCTION | `docker compose -p mytitan build api app marketing` passed; `api`, `app`, and `marketing` were force-recreated; health returned `HTTP 200`. |
| Backup and restore preview | VERIFIED IN PRODUCTION | Latest encrypted backup: `2026-07-10T03:00:06Z`; restore preview marker: `2026-07-02T22:31:48Z`. |
| Dependency audit | VERIFIED IN PRODUCTION | API/app/marketing `npm audit --audit-level=high` passed with 0 high and 0 critical vulnerabilities. |

## Wheel A&R Pilot Evidence

Detailed evidence is in `docs/audit/wheel-ar-release-candidate-pilot.md`.

| Area | Classification | Evidence |
| --- | --- | --- |
| Tenant and owner identity | VERIFIED IN PRODUCTION | Wheel A&R exists exactly once; owner `hello@wheelar.co.uk` exists exactly once, active, verified, role `OWNER`; hash presence verified without printing hash. |
| Public booking route | VERIFIED IN PRODUCTION | `/portal/booking/cmq4vib8k0ho83wsw12uaq0pc` returned `HTTP 200`; 12 public-configured services present. |
| Business configuration | VERIFIED IN PRODUCTION | Tenant settings row exists; 3 active locations; 24 active services. |
| Trade portal state | REQUIRES OPERATOR ACTION | 0 trade accounts and 0 active trade portal accesses found; classified setup-required/not-applicable. No invitation was generated or sent. |
| Job lifecycle | REQUIRES OPERATOR ACTION | 0 production bookings/jobs found for Wheel A&R, so no safe existing pilot record was available for non-destructive verification. |
| Payment boundary | VERIFIED IN PRODUCTION | Stripe Connect live credential/webhook verified; no live charge, deposit, or refund was performed; MyTitan Billing Stripe was not used for tenant customer money. |
| Email readiness | VERIFIED IN PRODUCTION | Platform email config row exists; no customer email was sent. Operator test recipient is not configured. |
| Support-mode production UI proof | REQUIRES OPERATOR ACTION | Isolated E2E support-mode coverage passed. Production support-mode session was not started because it requires operator session, reason, target, before/after evidence, and explicit confirmation. |

## Security Evidence

- Stripe catalog repair is read/list/adopt-only and reason/confirmation/audit gated.
- Stripe product/price mutation is not implemented in the repair wizard.
- Tenant customer-payment provider states remain separate from MyTitan Billing Stripe.
- Integration Marketplace does not expose tokens, internal diagnostics, or false-ready OAuth/provider claims.
- Protected-record verification confirms protected users, password hash fingerprints, provider vault row counts, and delete guards.
- Platform/admin E2E coverage passed for support mode, credential vault separation, tenant access denial, and token-free recovery flows.

## Architecture Evidence

- Calendar/Operations uses existing booking/schedule/capacity data and does not introduce Booking V2 or Calendar V2.
- Enterprise Annual repair uses existing billing catalog override and audit infrastructure.
- Integration Marketplace remains a directory over existing readiness and BYOG provider surfaces, with explicit external prerequisites for unavailable live providers.
- Business Profile save reliability preserves the existing canonical trade account/CRM update path.

## Operational Evidence

- Healthcheck returned HTTP 200 with status `ok`.
- Backup readiness reported recent encrypted backup artifacts and restore preview.
- Production readiness reported runtime, app, API, marketing, Postgres, Redis, scheduler, TLS visibility, Stripe credential presence, upload limits, and disk/memory headroom as ready.
- Production readiness also reported external uptime monitoring as `not_configured`; this remains an external operational prerequisite.

## Compliance Readiness

No formal certification is claimed.

| Framework | Readiness | Evidence / Limitation |
| --- | --- | --- |
| OWASP ASVS / Top 10 / API Top 10 | PARTIALLY READY | Security headers, RBAC/platform isolation, protected-record checks, webhook/payment tests, and E2E security coverage pass. Full ASVS evidence workbook remains manual. |
| Cyber Essentials / Plus | MANUAL EVIDENCE REQUIRED | Code and host checks exist, but formal device, patch, malware, access-control, and assessor evidence is external/manual. |
| ISO 27001 | MANUAL EVIDENCE REQUIRED | Technical controls exist in places; ISMS policy, risk treatment, internal audit, and management review are legal/operator evidence. |
| SOC 2 | MANUAL EVIDENCE REQUIRED | Technical evidence exists for access and audit controls; trust-services operating evidence requires an audit period and external auditor. |
| GDPR / UK GDPR | LEGAL REVIEW REQUIRED | Data security and token-redaction controls exist; privacy notices, retention/legal basis, DPA, DPIA, and DSAR operations need legal/operator approval. |
| PCI DSS | PARTIALLY READY | Stripe/payment boundaries minimize card-data handling. Formal PCI scope and SAQ evidence require provider and operator confirmation. |
| WCAG 2.2 AA | PARTIALLY READY | E2E includes mobile/readability/accessibility-oriented assertions, but full WCAG AA audit remains manual. |

## Remaining Risks And Prerequisites

| Item | Classification | Risk | Priority | Owner | Safe next action | Effort |
| --- | --- | --- | --- | --- | --- | --- |
| External uptime monitor | REQUIRES EXTERNAL PROVIDER | Launch readiness cannot evidence external availability alerting. | High | SRE / Operator | Configure monitor and rerun production readiness. | 0.5d |
| Xero live activation | REQUIRES EXTERNAL PROVIDER | OAuth/sync cannot be proven live without app credentials and tenant consent. | High | Operator / Integrations | Register Xero app, configure credentials, run provider verification. | 1-2d |
| Non-Stripe payment providers | REQUIRES EXTERNAL PROVIDER | Providers are truthfully setup-gated, not live. | Medium | Operator / Payments | Choose providers, register accounts, add credentials/webhook tests. | 2-5d |
| Enterprise Annual Stripe mapping | REQUIRES OPERATOR ACTION | Repair wizard can adopt only verified existing candidate prices; no live adoption was performed. | High | Platform Admin | Run wizard with configured MyTitan Billing Stripe, confirm candidate if present. | 0.5d |
| Wheel A&R booking hours and location-based pilot proof | REQUIRES OPERATOR ACTION | Read-only probe found no booking hours and no safe existing production booking/job record. | High | Operator / Pilot owner | Confirm booking hours/location mode, then create or identify an operator-approved safe pilot record. | 0.5d |
| Wheel A&R trade portal pilot user | REQUIRES OPERATOR ACTION | No trade account/access exists; invitation would be a real customer action. | Medium | Operator / Pilot owner | Create/invite only with explicit operator approval and designated recipient. | 0.5d |
| Wheel A&R customer email delivery | REQUIRES OPERATOR ACTION | No operator test recipient configured and no customer email was sent. | Medium | Operator | Configure operator-controlled test recipient or approve a specific customer-safe email test. | 0.5d |
| Legal policy/certificate claims | REQUIRES LEGAL/COMPLIANCE | Regulated certificate and policy claims cannot be asserted by code alone. | High | Legal / Compliance | Review terms, privacy, retention, certificate templates, and compliance claims. | 2-10d |
| Formal compliance certification | REQUIRES LEGAL/COMPLIANCE | External certification cannot be claimed from repo evidence. | Medium | Compliance | Produce assessor-ready control workbook and engage auditor. | 2-12w |
| Remaining product phases beyond this pass | DEFERRED POST-LAUNCH | The user requested a very broad product roadmap; not all features were implemented in this session. | Medium | Product / Engineering | Continue by scoped domain commits with isolated validation after each. | Multi-week |

## Scores

Scores are evidence-based and intentionally below 100 where external or manual evidence is missing.

| Score | Value | Deductions |
| --- | ---: | --- |
| Engineering | 88 | Full validation passes, but requested roadmap scope exceeds this session. |
| Architecture | 86 | No duplicate booking/calendar system introduced; broader source-of-truth audit remains manual for all modules. |
| Security | 87 | Strong protected-record/payment/provider evidence; formal ASVS mapping remains incomplete. |
| Reliability | 86 | Full E2E passes and profile flake fixed; external monitoring not configured. |
| Performance | 80 | Bundle budgets pass; deep load/DB performance testing was not completed in this pass. |
| Accessibility | 78 | Existing mobile/readability checks pass; full WCAG 2.2 AA audit remains manual. |
| UX | 84 | Operations lenses, truthful marketplace, and profile reliability improved; full route/button audit remains broader continuation work. |
| Operational Readiness | 82 | Health, backups, scheduler, TLS visibility pass; external uptime monitor missing. |
| Compliance Readiness | 64 | Technical controls exist; formal/legal evidence is mostly manual or external. |
| Mass-Launch Readiness | 78 | Code-controlled critical changes validated; external monitor, provider activation, legal/compliance, and operator billing mapping remain. |

## Launch Recommendation

Do not claim formal certification. Do not claim external provider readiness where provider evidence is absent.

The current code-controlled changes are validated and suitable to carry forward. Public launch approval should remain conditional on:

- external uptime monitor evidence,
- operator review of Enterprise Annual Stripe mapping,
- legal approval of public policy/compliance/certificate language,
- provider credential setup for any integrations marketed as live,
- release-manager acceptance of remaining deferred roadmap scope.
