# Location Image Live Refresh And Footer Root Cause

Baseline:

- Branch: `release/v1.0.0-clean`
- Starting HEAD: `e1c9f08a3079c2ca529558184111717cf944383d`
- Existing candidate tag: `v1.0.1-rc3`

## Location Image Refresh

The location upload API correctly persisted `metadataJson.imageUrl` and returned a read-back location. The edit form consumed that value through `EntityImageUpload`, but the management list rendered the saved image through a direct raw `<img>` expression and did not share the same image selector or media resolver.

The live state reconciliation also replaced the list item with the returned object directly. That made the image update dependent on the exact response shape and could drop list-only relationship fields used by the card.

Fix:

- Added a single `getLocationImageUrl()` selector for `metadataJson.imageUrl`.
- Added `mergeLocationImageState()` so the returned canonical media reference is merged into the existing list card without losing list-only fields.
- Replaced the raw list `<img>` with shared `SafeImage`.
- Added a compact persisted image thumbnail to location cards when an image exists.

## Footer `Locationi`

The dashboard shell location scope card rendered:

`Location` + a visible text `i`

When the footer card was compact, that appeared as the concatenated visible string `Locationi`.

Fix:

- Replaced the literal `i` with an inline SVG info icon.
- Preserved the accessible label and title for keyboard and pointer users.
- Kept the location selector and scope behavior unchanged.
