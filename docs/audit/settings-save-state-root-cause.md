# Settings Save-State Root Cause

Date: 2026-07-13

## Failure

The isolated E2E suite previously failed around Settings dirty/save state:

- `app/e2e/dashboard-workflows.spec.ts` expected the workspace layout Settings save to show a saved success state.
- `app/e2e/final-product-experience-polish.spec.ts` expected Business Profile to show `All profile changes saved` after a successful save.
- Follow-on Settings checks observed the save button remaining in the dirty state after a successful save.

## Root Cause

Settings had multiple competing representations of save state:

- editable React form state;
- a saved payload snapshot;
- the tenant-settings provider value;
- a temporary clean override introduced during the media/branding pass.

The temporary override could make the UI appear clean without being the authoritative saved baseline. It also made it harder to reason about server-normalised values and edits that arrive while a save request is in flight.

There was also a ref synchronisation risk: many form inputs updated React state directly, while the save path reads from `formRef.current`. If a user or test saved immediately after an edit, the ref needed to be kept in lockstep with state.

The first full-suite rerun exposed one more edge in the same area: the dirty comparison treated nested arrays and objects as a permissive containment check. That was useful for older partial payloads, but it was wrong for canonical Settings saves. Workspace layout fields such as section order, hidden sections, and default Live Work view need exact normalised equality against the saved payload. Otherwise a real workspace-layout edit can be misread as clean after prior tests have changed tenant settings.

The next full-suite rerun showed the remaining route-level regression. The Command Centre still linked to `/dashboard/settings?tab=general` and relied on Settings defaults to expose the workspace layout controls. After the Business Profile/Settings split, the general tab defaults to Business Profile. The workspace-layout controls still existed in the DOM for compatibility, so tests could mutate hidden controls while the visible page and save action belonged to the wrong section. The product handoff needed an explicit canonical section route.

A later full-suite run exposed the final race. The save path used a full-payload fingerprint to decide whether to replace the editable form with the server-confirmed response. Provider refreshes and server-normalised settings can change the form representation during an in-flight save without being a user edit, which made the fingerprint guard refuse to sync the confirmed clean response. A follow-up run showed the same risk in React scheduling: if a fast Save followed an edit, the edit callback could increment the revision after the save captured its submitted revision. The last interleaving issue was save completion order: the tenant provider refresh could render between the saved snapshot update and editable-form replacement, leaving the page visibly dirty even after a successful server-confirmed save.

## Correction

The Settings page now uses one dirty model:

1. `savedSettingsPayload` stores the canonical saved snapshot.
2. `form` stores editable local state.
3. `settingsDirty` is derived by comparing the normalised editable payload to the normalised saved snapshot.
4. The local `setForm` wrapper updates `formRef.current` synchronously with React state.
5. On successful save, the API response is treated as the server-confirmed settings object.
6. `savedSettingsPayload` is reset from the server-confirmed response.
7. Editable state is synchronised to the server-confirmed response only when no newer edit happened during the in-flight save.
8. If a newer edit happens while saving, the new edit remains in the form and dirty state stays true against the confirmed saved baseline.
9. On failure, edits remain in place and dirty state stays true.
10. Dirty comparison now uses exact canonical payload equality, including ordered arrays, instead of subset matching.
11. Command Centre now links directly to `/dashboard/settings?tab=general&section=workspace-layout` for layout customisation, so the visible Settings section, save action, and edited controls are aligned.
12. In-flight save protection now uses a form revision counter. User edit setters increment the revision synchronously; server/provider hydration and confirmed save replacement do not. After save success, the form is resynchronised to the server-confirmed response unless a real edit occurred during the request.
13. The server-confirmed saved snapshot and editable-form replacement now commit atomically before the tenant-settings provider is refreshed, so the page cannot render an intermediate dirty state after a successful save.

The previous clean override was removed. The Save buttons, Business Profile save state, and header action now all derive from `settingsDirty`.

## Validation Required

Focused Settings E2E must pass before the full isolated suite:

- `app/e2e/dashboard-workflows.spec.ts`
- `app/e2e/final-product-experience-polish.spec.ts`
- Settings-related checks in `app/e2e/job-form-builder.spec.ts`

The full isolated E2E suite must then pass with 0 failed, 0 skipped, and 0 flaky before rc16 can be tagged.
