# Platform duplication and dead-end report

Generated: 2026-06-29

## Duplicate / overlap findings

| Finding | Status | Action |
| --- | --- | --- |
| `/platform/infrastructure` and `/platform/configuration` | intentional alias, not duplicate implementation | kept backwards-compatible alias to authoritative configuration page |
| Company OS and Autopilot both show operational risk | complementary surfaces | Company OS summarizes Autopilot; Autopilot remains sentinel/incident owner |
| Company OS Platform Operations lacked a direct setup link | fixed | added Infrastructure link to operations section |
| Tenant Setup Wizard and Platform Infrastructure both mention payments | intentionally separate | wizard points to tenant/customer payment setup; Infrastructure owns platform provider vault |
| Tenant Launch Control and Company OS both show readiness | intentionally separate | Launch Control is tenant go-live readiness; Company OS is platform evidence governance |

## Dead-end audit

| Area | Result | Evidence |
| --- | --- | --- |
| Platform Admin Infrastructure cards | no dead support button found | cards expose configure, verify, test, reload, delete, checklist, or redacted history actions |
| Email not_configured | actionable | Configure Email Provider, Verify provider, Send test email, delivery log |
| Stripe Connect missing_config | actionable | save/rotate, verify, reload runtime, onboarding preflight, canary checklist |
| MyTitan Billing Stripe missing_config | actionable | save/rotate, verify billing readiness, verify subscription prices, sync job-pack catalog, reload runtime |
| External monitoring not_configured | actionable | configure monitor, verify monitor evidence, redacted status |
| Tenant access to platform setup | blocked | tenant users receive forbidden page/API denial |

## Deferred cleanup

- Keep `/platform/infrastructure` as a route alias because existing tests, operator links, and release instructions use that URL.
- Do not delete tenant setup or Launch Control surfaces; they own tenant readiness, not platform infrastructure.
- Do not remove validation-only billing catalog actions; they are safe release checks and do not mutate Stripe products/prices from Infrastructure.
- Preserve `contact support` text outside platform-owned setup where it is customer-facing fallback copy or sentinel test input.

## Risk notes

- Real external monitor evidence may still be missing. That is a configuration gap, not a code gap.
- Real live Stripe Connect credentials and live canary evidence may still be missing. Do not mark public launch ready until configured and verified.
- Docker build cache is large and reclaimable, but cleanup must be scheduled and approved separately.
