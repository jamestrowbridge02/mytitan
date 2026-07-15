# Reports Data Visualisation Audit

## Dataset classification

| Dataset | Source | Classification | Result |
| --- | --- | --- | --- |
| Jobs completed over time | `operations.jobs.completedSeries` | Chart-ready | SVG trend + bar/table values |
| Jobs created over time | `operations.jobs.createdSeries` | Chart-ready | Available for Work tab calculations |
| Booking created vs converted | `operations.conversions` | Chart-ready | Booking conversion visual |
| Quote and invoice funnel | `revenue.funnel` | Chart-ready when billing permission exists | Revenue funnel visual |
| Overdue aging buckets | `revenue.overdueInvoices.agingBuckets` | Chart-ready | Revenue aging visual and table |
| Customer quote volume | `customers.topQuoteVolume` | Table-ready / chart-ready | Table retained; aggregate-safe |
| Approval responsiveness | `customers.approvalResponsiveness` | Table-ready | Table retained |
| Workforce utilization | `capacity.technicians` | Chart-ready | Capacity visual and table |
| Job-pack usage | `billing.jobCompletionAllowance` | Chart-ready | Allowance visual |
| Traffic summary | `traffic.surfaces` | Metric-only | Kept as summary cards |
| Forecast evidence | Derived from current analytics responses | Evidence-only | No synthetic future curve |

## Visualisation rule

Charts are rendered only from returned rows. When rows are absent, the card shows an empty state. When rows exist but all values are zero, the card distinguishes that from missing data with `No activity in this period`.
