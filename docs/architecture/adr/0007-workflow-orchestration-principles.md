# ADR 0007: Workflow Orchestration Principles

## Context
Enterprise FSM adds quote, schedule, dispatch, portal, payment, notification, and inventory steps. These workflows must improve continuity without creating hidden automation risk.

## Decision
Prefer explicit workflow transitions with next-step continuity, audit logs, and reversible feature flags. Automation may recommend or prepare steps, but must not silently mutate schedules, payments, or provider state.

## Consequences
- Estimate-to-job conversion is an explicit operator action after approval.
- Route optimisation starts as preview, not automatic schedule mutation.
- Provider actions begin as dry-run diagnostics and require rollout gates.

## Rejected Alternatives
- Automatic conversion of quotes without approval.
- Route optimisation that changes schedules without operator confirmation.
- Background provider mutations without audit events.

## Rollout Notes
Every enterprise workflow must define disabled-state UX, rollback behavior, and validation gates before release.
