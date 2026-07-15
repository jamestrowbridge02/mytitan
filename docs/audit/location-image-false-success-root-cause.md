# Location Image False Success Root Cause

The upload endpoint wrote `Location.metadataJson.imageUrl`, but returned only `{ imageUrl }`. The frontend then treated any successful HTTP response with a loose image field as upload success.

That allowed this false-success state:

- selected file state cleared;
- generic success text shown;
- no canonical location record verified;
- persisted thumbnail could be missing or stale.

Corrections:

- `POST /locations/:id/image` now reads the canonical location back after database update.
- The API throws if the read-back record does not contain the exact persisted image reference.
- The response includes both `imageUrl` and `location`.
- The frontend rejects success unless the response contains a canonical location with `metadataJson.imageUrl`.
- The shared uploader no longer pairs `No image selected` with a saved current image.

