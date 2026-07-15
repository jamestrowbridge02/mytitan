# Product-wide upload form safety audit

## Audited patterns

Search terms included `selectedFile`, `selectedImage`, `fileInputRef`, `uploadImage`, `handleFileChange`, `imageFile`, `pendingFile`, `No image selected`, `Choose image`, `Upload image`, `new FormData`, and `type="file"`.

## Corrected surfaces

- Locations public booking image
- Service Folder image
- Booking service image duplicate filename rendering
- Business logo duplicate visible filename rendering

## Button safety

The shared `EntityImageUpload` component sets upload and clear actions to `type="button"` and prevents default click submission before invoking upload. Existing Location and Booking Settings action buttons around upload, edit, move, archive, clear, and save were audited; upload-related non-save actions use explicit non-submit buttons.

## Remaining non-shared upload surfaces

Business logo, guided setup logo, artifact uploads, job evidence uploads, onboarding uploads, and technician photo inputs retain their domain-specific flows. They should continue to be monitored, but they do not share the broken Location/Service Folder state maps after this change.
