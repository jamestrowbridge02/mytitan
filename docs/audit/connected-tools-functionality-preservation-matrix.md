# Connected Tools Functionality Preservation Matrix

| Integration/action | Source | Permission | New placement | Status | Test coverage |
| --- | --- | --- | --- | --- | --- |
| Stripe manage/setup | Payment readiness + Stripe settings | `settings.manage` | Payments card | Preserved | App typecheck; existing payment checks |
| Bank transfer | BYOG provider row | `settings.manage` | Payments card | Preserved | App typecheck |
| Manual terminal | BYOG provider row | `settings.manage` | Payments card | Preserved | App typecheck |
| Xero | Xero status endpoint | `settings.manage` | Accounting card | Preserved/truthful state | App typecheck |
| QuickBooks | QuickBooks status endpoint | `settings.manage` | Accounting card | Preserved/truthful state | App typecheck |
| Email sender | BYOG workspace/email sender row | `settings.manage` | Communications card | Preserved; MyTitan delivery available | App typecheck |
| WhatsApp/SMS setup | BYOG and message settings | `settings.manage` | Communications cards | Preserved | App typecheck |
| API tokens | Developer tools | `settings.manage` | Developer card | Preserved | App typecheck |
| Webhooks | Developer tools | `settings.manage` | Developer card | Preserved | App typecheck |
| Unsupported providers | Static catalogue entries | `settings.manage` | Not available / requires external account cards | Preserved without fake Connect | App typecheck |
