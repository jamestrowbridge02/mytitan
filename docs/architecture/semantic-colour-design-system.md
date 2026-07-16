# Semantic Colour Design System

Date: 2026-07-16

## Product Tokens

The app token layer now defines semantic foreground, heading, surface, control, link, and dark-surface tokens. Shared components should consume these tokens rather than choosing hard-coded body text colours directly.

Key contracts:

- `--text-primary`, `--text-secondary`, `--text-muted`, `--text-subtle`
- `--text-link`, `--text-link-hover`, `--link-on-light`, `--link-on-dark`
- `--heading-primary`, `--heading-secondary`, `--heading-on-dark`
- `--control-text`, `--control-background`, `--control-border`
- `--dark-surface-text-primary`, `--dark-surface-text-secondary`, `--dark-surface-link`

## Usage Rules

- Light surfaces use primary/secondary text and `--link-on-light`.
- Dark surfaces use `--heading-on-dark`, `--dark-surface-text-*`, and `--link-on-dark`.
- Accent CTAs must define both readable foreground and concrete background colour, even when a gradient is present.
- Muted text should use a semantic muted token, not opacity alone.
- Status colours remain allowed when paired with labels, badges, or text.

## Test Contract

Rendered contrast must be verified with computed styles. Class-name checks are insufficient because gradients, transparency, and inherited colour can produce failures despite apparently correct class names.
