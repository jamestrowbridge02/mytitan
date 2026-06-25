# ADR 0003: Offline Packet Design

## Context
Field users need resilience when connectivity drops. Full-page auth caching or broad offline database mirrors would increase data leakage and tenant-isolation risk.

## Decision
Offline mobile will use scoped job packets. Packets contain only the jobs, tasks, forms, media placeholders, and safe customer context needed for assigned field work.

## Consequences
- Offline access is explicit, time-bound, and revocable.
- Packets avoid platform admin data, billing secrets, payment provider credentials, and unrelated customer records.
- Sync conflicts are handled per packet with server-side authority.

## Rejected Alternatives
- Full workspace offline mirrors.
- Offline auth bypass for dashboard pages.
- Caching secrets or provider tokens for field use.

## Rollout Notes
Gate with `offline_job_packets_v1`. Start with dry-run packet manifests and conflict tests before offline mutation is enabled.
