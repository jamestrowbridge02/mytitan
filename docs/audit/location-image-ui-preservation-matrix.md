# Location Image UI Preservation Matrix

| Surface | Source of truth | Change | Preserved |
| --- | --- | --- | --- |
| Upload API | `Location.metadataJson.imageUrl` | No change to field; read-back remains required | RBAC, tenant isolation, audit logging, validation |
| Edit form | `form.metadataJson.imageUrl` | Uses canonical selector | Unsaved form fields, selected-file retry behavior |
| Location list card | `items[].metadataJson.imageUrl` | Adds compact `SafeImage` thumbnail | Address, timezone, visibility, membership count, edit/archive actions |
| Public booking | `location.metadataJson.imageUrl` | No field change | Public/trade visibility and fallback card behavior |
| Shared footer scope | Dashboard location context | Replaces visible `i` text with icon | Location selector, keyboard focus, accessible label |
