# Service Folder image upload root cause

Service Folder image upload used per-page maps for selected files and preview URLs:

- `folderImageFiles`
- `folderImagePreviews`

The row also rendered a filename span and a second selected-file block. That duplicated selected-file display and kept the state model separate from the actual upload action.

## Fix

Each folder row now renders `EntityImageUpload`, keyed by the stable folder `key`. The component owns the selected file and preview URL for that row. The folder-specific upload callback posts:

- `category`: folder key
- `file`: selected image

Upload success merges the returned canonical image URL into:

- `folders`
- `settings.folderImages`
- `settings.folders`

No full settings reload is required on success.

## Persistence

The backend stores the image URL in `businessConfigJson.publicBookingFolderImages` and the matching `publicBookingFolders` entry. Reorder, edit, and archive operations continue to use the stable folder key, so the image remains attached to the correct folder.
