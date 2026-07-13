# Reports Premium Redesign Audit

Scope: `/dashboard/analytics` and `/dashboard/reports`.

Data sources preserved:

- `/analytics/executive`
- `/analytics/operations`
- `/analytics/revenue`
- `/analytics/customers`
- `/analytics/capacity`
- `/analytics/benchmarks`
- `/analytics/traffic/summary`
- `/enterprise/phase-1k/reports/widgets`
- `/billing/me`

Block classification:

| Block | Classification | New placement |
| --- | --- | --- |
| Executive metrics | Executive metric | Overview snapshot |
| Revenue and collections | Operational metric / chart / table | Revenue tab |
| Job completion and booking conversion | Operational metric / chart | Work tab |
| Customer commercial signals | Detailed table | Customers tab |
| Capacity and recurring execution | Operational metric / detailed table | Capacity tab |
| Forecast cards | Forecast signal | Forecasts table plus evidence drawer |
| Benchmark deltas | Benchmark | Overview detail |
| Custom KPI widgets | Configuration/source evidence | Overview, compact |
| Repeated explanation prose | Explanatory noise | Removed or moved to evidence/detail |

No analytics calculation was changed. The pass changes presentation, grouping and progressive disclosure only.
