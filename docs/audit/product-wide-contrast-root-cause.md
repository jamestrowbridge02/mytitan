# Product-Wide Contrast Root Cause

## Root Cause

Dark-mode tokens existed, but several shared components still relied on hard-coded light-theme foreground colours or inherited muted opacity. The newest sidebar identity also introduced hard-coded light theme text colours.

This allowed dark text or low-contrast muted text to appear on dark cards, popovers, forms, selected controls, and navigation surfaces.

## Corrected Areas

The launch fix added explicit dark-mode foreground/background pairings for:

- Sidebar business identity product and business labels.
- Sidebar business logo/initials fallback surface.
- Muted metadata.
- Labels and table headers.
- Inputs, placeholders, disabled controls.
- Dialogs, dropdowns, row action panels.
- Logo preview light/dark surfaces.

## Verification

Focused computed-style contrast coverage was added for the dark tenant sidebar identity. Existing broader design tests continue to cover page-level light/dark behavior.
