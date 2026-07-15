# Shared Location Scope Footer Audit

The shared location scope switcher is owned by `app/components/dashboard-shell.tsx`.

Observed issue:

- The component displayed a label `Location` followed by a visible text info marker `i`.
- In compact footer placement this produced visible `Locationi`.

Correction:

- The info marker is now an SVG icon with `aria-hidden="true"` inside the existing labelled/focusable wrapper.
- The wrapper keeps `aria-label="Filter Dashboard metrics and work by location."` and `title` for assistive and pointer users.
- No selector state, API call, or routing behavior changed.

Affected tenant pages continue to receive the same `location-scope-switcher` component when multiple locations are available.
