# Dashboard Header Live Fix

## Root Cause

The Dashboard page owned a visible `Dashboard` kicker while the operational greeting was the only semantic `h1`. In the live shell this could appear alongside shell route context, producing a duplicated visible Dashboard label and unclear heading ownership.

## Correction

- The Dashboard page now owns the single semantic `h1`: `Dashboard`.
- The greeting remains visible as the primary operational greeting line, but it is no longer a second title owner.
- The greeting uses the primary text token and the business/date line uses the secondary text token.
- The visible Business snapshot heading remains removed; the KPI group keeps its accessible label through the existing visually-hidden heading.
- `Open analytics`, location selection, the primary action, KPI cards, schedule, live work and activity logic were not changed.

## Tests

- `app/e2e/dashboard-workflows.spec.ts` asserts one visible Dashboard `h1`, one semantic `h1`, readable computed text colour, no visible setup/footer clutter, and preserved Dashboard sections.

## Live Build Evidence

Recorded after validation in release output:

- source commit
- app image ID
- app container creation time
- Next.js `BUILD_ID`
- public route status
