# MyTitan Logo Spec

## Concept Statement
MyTitan uses a shield and helmet mark to signal strength, control, and reliability for service businesses. The mark should feel premium and modern, not aggressive, playful, or game-like.

## Brand Feel
- Premium
- Strong
- Modern
- Calm under pressure
- Clear and original

The mark must not feel like esports, fantasy clip-art, a military badge, or a generic SaaS blob.

## Core Shape
- The outer shape is a broad shield with a stable base and slightly tapered shoulders.
- The helmet sits inside the shield as one bold silhouette, not a detailed illustration.
- The helmet should read clearly as a Spartan or Titan-inspired profile at a glance.
- The crest, brow, cheek guard, and face opening should be implied through shape, not thin line detail.

## Geometry Rules
- Build on a centered square artboard.
- Keep the shield vertically symmetrical.
- Keep the helmet slightly forward-leaning to imply motion and direction.
- Use large, clean shape transitions.
- Avoid tiny notches, narrow gaps, or decorative cuts that disappear below 32px.

## Silhouette Principles
- The shield must remain recognizable even when the helmet detail is reduced.
- The helmet must remain recognizable even if gradients are removed.
- The face opening should be the strongest internal cut.
- The crest should be integrated into the helmet silhouette rather than drawn as a separate ornament.

## Stroke And Fill Strategy
- Prefer fill-based construction over outlined drawing.
- Avoid thin strokes entirely in the primary mark.
- Use two or three large value groups at most:
  - shield
  - helmet
  - optional internal cut/shadow
- If shading is used, it should stay broad and structural.

## Size Behavior
### 16px
- Use only the shield, helmet silhouette, and one internal face cut.
- Remove subtle shadows and small inset shapes.
- Prioritize a strong read over exact detail.

### 32px
- Keep the simplified helmet silhouette and face cut.
- Allow one additional structural shape for depth if it still reads cleanly.

### 64px
- Use the full production mark with restrained tonal depth.
- Keep internal shapes broad and crisp.

### Large Sizes
- Maintain clean edges and broad fills.
- Do not add decorative strokes, highlights, or extra helmet detail.

## Clearspace
- Mark only:
  Clearspace equals at least 0.25x the mark width on all sides.
- Full lockup:
  Clearspace equals at least the height of the internal helmet face cut on all sides.

## Lockup Rules
### Mark Only
- Use for favicon, app rail, compact surfaces, and social avatars.

### Wordmark Only
- Use when the product name is already established and the mark would be redundant.

### Full Lockup
- Use mark plus wordmark horizontally.
- The wordmark should align to the visual center of the mark, not the SVG box.
- Do not attach slogans or descriptors inside the primary lockup.

## Color Rules
- Primary shield:
  deep brand blue with restrained teal support
- Helmet:
  bright neutral light on light-brand renderings
- Wordmark:
  dark slate on light surfaces, soft light neutral on dark surfaces

Avoid neon gradients, metallic chrome effects, or glossy highlights.

## Light And Dark Surfaces
- On light backgrounds:
  use the primary mark and dark wordmark
- On dark backgrounds:
  keep the shield saturated, brighten the helmet slightly, and use a light wordmark
- Do not place the full lockup on noisy or low-contrast backgrounds without a container

## Favicon Guidance
- Use the mark only
- Remove tagline and wordmark
- Keep a single bold internal cut for the face opening
- Test at actual browser-tab size, not just exported canvas size

## Recommended SVG Style
- Use pure vector paths
- Prefer fills and masks over strokes
- Keep gradients simple and limited
- Avoid embedded bitmap effects
- Keep IDs stable and minimal
- Ensure mirrored assets in app and marketing stay identical

## What To Avoid
- Thin outline helmets
- Detailed face features
- Spears, laurels, wings, flames, or mascot styling
- Small decorative cuts that disappear at favicon size
- Taglines embedded into core logo files
- Overly dark or overly glossy badge treatments

## Originality And Copyright Safety
- Build from simple geometric shield and helmet primitives
- Avoid tracing or closely echoing famous Spartan sports logos, film props, or gaming marks
- Keep the crest, brow, and cheek guard arrangement distinct and structurally minimal
- Favor reduction and clarity over recognisable pop-culture references

## Current Asset Changes Needed
- Remove embedded descriptors from full lockups
- Keep one consistent mark across app and marketing
- Simplify the internal helmet structure so it reads better at 16px and 32px
- Keep the social card lockup clean and descriptor-free
- Preserve the mark-only asset as the source of truth for favicon and compact app usage
