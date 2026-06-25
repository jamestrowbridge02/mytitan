# ADR 0002: Telemetry Isolation

## Context
MyTitan already has proprietary Titan and ActivGuard telemetry logic. Enterprise FSM asks for hardware-neutral telemetry, fleet tracking, and predictive maintenance without destabilising existing device behavior.

## Decision
Use a telemetry bridge. New neutral providers publish normalized observations into isolated ingestion contracts and cannot replace proprietary Titan or ActivGuard pipelines.

## Consequences
- Proprietary device ingestion remains authoritative for Titan/ActivGuard hardware.
- Neutral telemetry has explicit source attribution and capability declarations.
- Predictive maintenance remains a later-phase feature until enough truthful data exists.

## Rejected Alternatives
- Replacing proprietary ingestion with a generic device model.
- Mixing third-party telemetry directly into existing ActivGuard logic.
- Presenting unverified predictions as operational truth.

## Rollout Notes
Keep telemetry work behind bridge contracts and feature flags. Early providers must report dry-run diagnostics only.
