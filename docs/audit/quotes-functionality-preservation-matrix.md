# Quotes Functionality Preservation Matrix

| Capability | Old location | New location | Permission / source | Test coverage | Result |
| --- | --- | --- | --- | --- | --- |
| View quotes | Quote list | Quote queue | `/quotes`, `billing.manage` | Revenue operations E2E | Preserved |
| Create quote | Permanent form | Header action and editor | POST `/quotes` | Revenue operations E2E | Preserved |
| Edit quote | Permanent form for selected quote | Row opens editor | PATCH `/quotes/:id` | Revenue operations E2E | Preserved |
| Structured line items | Pipe textarea | Line-item rows | Existing line item API payload | Revenue operations E2E | Improved |
| Normal currency input | Raw cents textarea | Unit price and tax fields | Converted to cents client-side, validated server-side | Revenue operations E2E | Improved |
| Send | Row button | Row button | `/quotes/:id/send` | Revenue operations E2E | Preserved |
| Approve/decline | Row buttons | Row buttons | `/quotes/:id/approve`, `/decline` | Revenue operations E2E | Preserved |
| Convert to job | Row button | Row button | `/quotes/:id/convert` | Revenue operations E2E | Preserved |
| Status filters | Static stats | Queue tabs and snapshot | Quote status | Typecheck/E2E flow | Preserved |
| Customer selection | Form field | Editor field | `/customers?limit=200` | Revenue operations E2E | Preserved |
