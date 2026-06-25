# ADR 0006: Multi-Entity Isolation

## Context
Parent companies, branches, franchises, and multi-entity reporting are requested. MyTitan currently treats Company as the hard tenant boundary and relies on it for isolation.

## Decision
Keep Company as the hard boundary. Multi-entity features must use explicit hierarchy mappings and scoped aggregation services rather than cross-company joins in ordinary workflow queries.

## Consequences
- Branch reporting is additive and permission-gated.
- Operational screens stay tenant-scoped by default.
- Parent-company access requires explicit grants and audit trails.

## Rejected Alternatives
- Implicit joins across Company records.
- Shared customer records across entities without consent and retention rules.
- Platform-admin-only data paths reused for parent companies.

## Rollout Notes
Multi-entity work remains later phase. Schema must model parent/child relationships without weakening existing company filters.
