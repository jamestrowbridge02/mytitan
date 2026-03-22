# Next Feature Phase

## Recommended Themes
### 1. CRM And Customer Record Depth
Why it matters:
MyTitan already handles jobs, billing, approvals, and customer workspace flows. The next leverage point is making the customer record more useful before and between jobs.

What to productize next:
- timeline of jobs, quotes, approvals, payments, and messages in one customer view
- customer tags, segments, and saved views
- follow-up tasks and reminders tied to customer or quote state
- basic outbound communication logging

Risk and complexity:
- medium
- needs careful scope control to avoid turning into a generic CRM rebuild

### 2. User And Team Management
Why it matters:
Commercial readiness improves when buyers can set up real teams cleanly without manual help.

What to productize next:
- invite, suspend, and role-edit flows with cleaner team management
- sub-user and branch-scoped access refinements
- clearer default roles for owner, manager, dispatcher, finance, technician, and viewer
- audit-friendly membership history

Risk and complexity:
- medium
- touches permissions and location scope, so regression coverage matters

### 3. Payments And Provider Expansion
Why it matters:
Money flow is core product leverage. Wider payment coverage improves conversion and retention.

What to productize next:
- tighter Stripe production readiness first
- better payment state visibility inside billing flows
- more flexible payment-link and receipt handling
- architecture seam for a second provider after Stripe readiness is solid

Risk and complexity:
- medium to high
- payment surface changes need careful truthfulness and fallback handling

### 4. Configurable Service And Job Sheet Setup
Why it matters:
Different service businesses need their own job templates, customer forms, and service definitions.

What to productize next:
- reusable service templates
- configurable job sheets and completion forms
- clearer admin setup for required fields by workflow or service type
- better defaults for recurring service and multi-step execution

Risk and complexity:
- medium
- can expand fast unless template scope stays disciplined

### 5. Simpler Onboarding And Setup
Why it matters:
The product is broad. Faster setup improves trial conversion and reduces implementation drag.

What to productize next:
- role-aware first-run setup
- clearer import and starter-template choices
- better default workflow presets by business type
- progress tracking for billing, jobs, customer workspace, and repeat work setup

Risk and complexity:
- low to medium
- high commercial impact relative to implementation size

### 6. Integration Expansion
Why it matters:
Integrations close deal friction once the core workflow is trusted.

What to productize next:
- accounting export or sync improvements
- calendar sync hardening
- broader webhook event coverage
- documented integration recipes for common service-business stacks

Risk and complexity:
- medium
- should follow stronger internal admin and billing setup

## Suggested Order
1. user and team management
2. onboarding and setup simplification
3. CRM and customer record depth
4. configurable service and job sheet setup
5. Stripe readiness and payment-flow expansion
6. integration expansion

## What To Productize Next
- team management
- onboarding simplification
- customer timeline and follow-up workflows

These three themes most improve buyer confidence, rollout speed, and day-to-day retention.

## What To Defer
- broad “AI” positioning
- enterprise procurement theater
- heavy forecasting suites
- speculative marketplace programs
- full marketing automation

## Biggest Customer-Value Gains
- less setup friction
- clearer team access
- better customer follow-up between jobs
- more flexible service configuration

## Biggest Commercial-Readiness Gains
- cleaner team administration
- clearer onboarding
- stronger payment readiness
- stronger integration story

## Biggest Retention And Usability Gains
- CRM timeline and reminder depth
- repeat-work and service-template configuration
- better user-role setup for growing teams
