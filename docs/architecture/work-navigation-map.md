# Work Navigation Map

Date: 2026-07-12

`/dashboard/work` is the canonical tenant-facing Work entry. It represents the operational work surface and owns these concepts:

| Concept | Previous top-level route | Canonical location |
| --- | --- | --- |
| Assigned | `/dashboard/technician` | Work filter/view; technician route retained |
| Live Work | `/dashboard/command-centre-v2` | Work live queue view; command-centre route retained |
| Jobs | `/dashboard/jobs` | Work records view; job list and record URLs retained |
| Drafts | `/dashboard/work` | Work draft filter |
| In progress | `/dashboard/work` / `/dashboard/jobs` | Work status filter |
| Ready to send | `/dashboard/work` / job records | Work status filter |
| Completed | `/dashboard/jobs?status=COMPLETED` | Work status filter and job list compatibility |
| Payment follow-up | `/dashboard/billing/readiness`, unpaid job filters | Work/Finance contextual view |

Deep links to `/dashboard/jobs/:id` remain authoritative record links. Global search may still open individual jobs directly.

