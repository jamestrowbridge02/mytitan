# Assets Functionality Preservation Matrix

| Capability | Old location | New location | Permission / source | Test coverage | Result |
| --- | --- | --- | --- | --- | --- |
| View asset register | Main page | Asset register workspace | `/enterprise/phase-9/assets` | Route smoke | Preserved |
| Add asset | Inline form | Header action opens add panel | Asset POST API | E2E phase 9 route plus typecheck | Preserved |
| Asset name/type/serial | Inline form and row | Add panel and row | Asset model | Typecheck | Preserved |
| Required template flag | Inline field | Advanced business label in add panel | Asset model | Typecheck | Preserved |
| Search assets | Not available | Register toolbar | Client filter over loaded assets | Typecheck | Added |
| Filter by type/status | Not available | Register toolbar and snapshot | Client filter over loaded assets | Typecheck | Added |
| Checkout/check-in | Row buttons | Row buttons | Asset workflow endpoints | Existing E2E server workflow | Preserved |
| Maintenance/out-of-service/inspection | Row buttons | Row buttons | Asset workflow endpoints | Existing E2E server workflow | Preserved |
| Empty state | Implicit empty list | Concise empty state | Asset API | Typecheck | Improved |
