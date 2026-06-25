# ADR 0004: RBAC Evolution

## Context
Enterprise FSM introduces more workflows, subcontractor access, branch structures, and sensitive operational controls. Existing roles must continue to work while finer permissions are added.

## Decision
Evolve RBAC additively. Preserve existing role checks, attach new enterprise permissions to feature-specific actions, and audit high-impact changes.

## Consequences
- Company remains the hard tenant boundary.
- New access surfaces must define owner/admin/staff/finance/read-only behavior explicitly.
- Platform-admin visibility remains separate from workspace ownership.

## Rejected Alternatives
- Replacing existing roles in one migration.
- Inferring access from UI visibility alone.
- Sharing platform-admin diagnostics with tenant users.

## Rollout Notes
Gate expanded permission sets with `advanced_rbac_v1`. Tests must cover blocked owner/non-owner, platform-admin separation, and cross-company denial.
