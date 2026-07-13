# Business Profile Functionality Preservation Matrix

| Field/action | Canonical owner | API/source | Permission | New placement | Status | Test coverage |
| --- | --- | --- | --- | --- | --- | --- |
| Business details | Business Profile | `/tenant/settings` | `settings.manage` | Business details | Preserved | App typecheck; existing isolated settings coverage |
| Registered address | Business Profile | `/tenant/settings` | `settings.manage` | Business details | Preserved | App typecheck; existing isolated settings coverage |
| Output visibility | Business Profile | `/tenant/settings` | `settings.manage` | Business details | Preserved | App typecheck; existing isolated settings coverage |
| Logo upload | Business Profile | `/tenant/settings/logo` | `settings.manage` | Branding | Preserved | App typecheck; existing upload tests retained |
| Saved logo preview | Business Profile | `settings.logoUrl` | `settings.manage` | Branding | Preserved; raw URL hidden | App typecheck |
| Brand colours | Business Profile | `/tenant/settings` | `settings.manage` | Branding | Preserved | App typecheck |
| Regional defaults | Business Profile | `/tenant/settings` + geo defaults | `settings.manage` | Regional controls | Preserved | App typecheck |
| VAT/tax defaults | Business Profile | `/tenant/settings` | `settings.manage` | Finance & tax | Preserved; percent input maps to bps | App typecheck |
| Live Work layout | Settings | `businessConfigJson.commandCentre` | `settings.manage` | Settings appearance/layout deep link | Moved | App typecheck; existing settings coverage |
| Reports layout | Settings | `businessConfigJson.analytics` | `settings.manage` | Settings appearance/layout deep link | Moved | App typecheck; existing settings coverage |
| Guided setup | Setup/readiness | `/dashboard/setup-wizard` | `settings.manage` | Settings compact setup card | Linked | App typecheck |
