# Calendar Daily View Readability Audit

## Affected Area

Daily Calendar timeline lanes used inline low-contrast literals for:

- hour labels
- workforce lane labels
- lane borders
- lane surfaces
- suggestion panel border
- month weekday labels

## Root Cause

The premium Calendar pass introduced a concise scheduling layout, but the daily timeline still mixed hard-coded slate/grey values with light and dark surfaces. In dark mode and some card states, muted text and lane labels could be difficult to read.

## Correction

The Calendar workspace now defines scoped semantic tokens on `data-calendar-experience="operations"`:

- `--calendar-grid-line`
- `--calendar-lane-bg`
- `--calendar-lane-border`
- `--calendar-hour-text`
- `--calendar-lane-text`

Daily and month labels now use those tokens instead of hard-coded low-contrast values. Booking cards keep their authoritative status colours and preserve click, drag, warning, focus and reschedule behaviour.

## Test Coverage

- `app/e2e/calendar-productization.spec.ts` verifies a rendered daily booking card has practical text/background contrast after reload.
- Existing calendar productization tests continue to cover day/week/month switching and rescheduling persistence.
