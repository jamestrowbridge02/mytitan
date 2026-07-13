# Settings Functionality Preservation Matrix

| Setting/action | Canonical owner | Route/API | Permission | New placement | Status | Test coverage |
| --- | --- | --- | --- | --- | --- | --- |
| Settings directory | Settings | `/dashboard/settings` | `settings.manage` | Default Settings page | Preserved/improved | App typecheck |
| Settings search | Settings | client-side directory search | `settings.manage` | Default Settings page | Added | App typecheck |
| Business Profile form | Business Profile | `/dashboard/settings?tab=general&section=business-profile` | `settings.manage` | Deep-linked profile page | Preserved | App typecheck |
| Appearance/layout | Settings | `/dashboard/settings?tab=general&section=workspace-layout` | `settings.manage` | Application settings deep link | Preserved/moved | App typecheck |
| Work/job sheet | Settings | `/dashboard/settings?tab=jobs` | `workflow.manage` | Existing tab | Preserved | Existing tests retained |
| Services | Settings | `/dashboard/settings?tab=services` | `workflow.manage` | Existing tab | Preserved | Existing tests retained |
| Notifications/email | Settings | `/dashboard/settings?tab=messages` | `settings.manage` | Existing tab | Preserved | Existing tests retained |
| Advanced/developer/automation | Settings | advanced and developer routes | scoped permissions | Existing routes | Preserved | Existing tests retained |
| Setup/readiness | Setup | `/dashboard/setup-wizard`, launch/readiness routes | `settings.manage` | Compact directory card/link | Linked | App typecheck |
