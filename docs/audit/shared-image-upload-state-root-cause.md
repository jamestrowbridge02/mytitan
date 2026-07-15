# Shared image upload state root cause

## Baseline

- Branch: `release/v1.0.0-clean`
- HEAD at audit start: `1db9658ea10a3f6df43b1b2f9450fd26ab884ce5`
- Worktree at audit start: clean
- Latest protected release tag: `v1.0.0`
- Latest release-candidate tag found: `v1.0.0-rc15`

## Root cause

Locations and Service Folders each implemented image upload state inline. The native file input, a separate filename span, a separate selected-file block, and the upload handler were all maintained by the page component. That created conflicting visible ownership of the same file selection: after choosing an image, the UI could show a selected native/custom filename while another visible state still read `No image selected`, or the same selected filename could be rendered twice.

The risky pattern was:

- native `input[type=file]` owned the browser file selection;
- React state separately owned the selected `File`;
- filename display was not derived from one rendering path;
- preview object URLs were managed independently in each page;
- upload success triggered broad reloads in Locations and Service Folders, which could clear page state beyond the changed image.

## Fix

`app/components/media/EntityImageUpload.tsx` now owns the selected `File`, preview URL, upload status, retry state, explicit non-submit upload button, clear button, and object URL cleanup. The upload handler receives the selected `File` directly from React state.

Locations and Service Folders pass domain-specific upload functions into the shared component. Those functions keep their existing API routes and authorization boundaries:

- Locations: `POST /locations/:id/image`, multipart field `file`
- Service Folders: `POST /booking/folders/image`, multipart fields `category` and `file`

Both surfaces merge the returned canonical `imageUrl` into local state for the affected entity only.

## Safety notes

- The protected `v1.0.0` tag was not moved.
- No location or service-folder image records were removed.
- No raw storage paths are exposed by the client changes.
- The existing server-side tenant ownership, RBAC, audit logging, MIME/type limits, size limits, and storage namespace remain in use.
