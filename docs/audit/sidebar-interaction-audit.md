# Sidebar Interaction Audit

Baseline: desktop sidebar expanded through CSS `:hover` and `:focus-within`, which made hover and focus share one implicit state.

Root cause: after pointer interaction, focus could remain inside the desktop rail. Because expansion was controlled by `:focus-within`, moving the pointer away did not reliably collapse the temporary flyout.

Navigation modes:

| Mode | Trigger | Close behavior | Result |
| --- | --- | --- | --- |
| PINNED | Desktop rail at rest | Remains collapsed rail; no hover state retained | Preserved |
| TEMPORARY_HOVER | Pointer enters desktop rail | Closes after delayed pointer leave; cancelled on re-entry | Fixed |
| TEMPORARY_CLICK | Sidebar actions/search | Closes through route/search behavior and existing outside/Escape handlers | Preserved |
| MOBILE_DRAWER | Mobile menu button | Tap/backdrop/Escape/route close | Preserved |
| KEYBOARD_FOCUS | Focus enters rail | Stays open while focus remains inside; closes on focus leaving or Escape-driven flows | Preserved |

Implementation notes:

- `Sidebar` now tracks temporary hover explicitly with `data-sidebar-mode`.
- CSS expands on `.is-temporary-open` or `:focus-within`, not raw `:hover`.
- Hover close uses a 220 ms delay and clears timers on teardown.
- Pointer re-entry cancels pending close.
- Route changes close temporary desktop navigation.
- Mobile drawer remains tap controlled.
