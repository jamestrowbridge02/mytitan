# Location image upload preservation matrix

| Area | Result |
| --- | --- |
| Selected file state | Owned by `EntityImageUpload`; filename derives from `pending.file.name`. |
| Preview state | Local object URL owned and revoked by `EntityImageUpload`. |
| Upload source | `uploadLocationImage(file)` receives the selected `File` directly. |
| Multipart field | `file`. |
| API route | `POST /locations/:id/image`. |
| Persisted field | `location.metadataJson.imageUrl`. |
| Tenant isolation | `LocationsService.savePublicImage` requires matching `companyId` and location id. |
| RBAC | Controller requires `OWNER` or `ADMIN`. |
| Audit event | `location.image.upload`. |
| Page reload | Removed from the upload success path. |
| Targeted update | Only the edited location/form metadata image URL is merged locally. |
| Unsaved form fields | Upload no longer calls `load()`; non-image edits are preserved. |
| Public booking card | Existing public config reads `metadataJson.imageUrl`. |

## File-state outcome

After selection, Locations show one selected filename, a preview, and an enabled `Upload image` action. `No image selected` is rendered only while there is no pending `File`.
