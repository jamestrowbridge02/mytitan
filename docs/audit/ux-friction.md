# UX Friction Audit

## Scope
Inspected key UI files under `/opt/mytitan/app/pages` and shared shell/components.

## Core Flows Reviewed
- Booking -> Job -> Customer/CRM -> Payment/Billing
- Public portal (job + booking)
- Dashboard command centre and guided surfaces

## Findings

### 1) Navigation/interaction consistency
- Mixed use of `Link`, raw `<a href>`, and `window.location.href` redirects.
- Examples:
  - `app/components/dashboard-shell.tsx` uses `window.location.href` for sign-out and onboarding redirect.
  - Multiple dashboard pages use `<a className="button" href="...">` causing full page reloads.

Impact:
- Inconsistent SPA behavior and potential state loss across navigation.

### 2) Loading/empty/error state consistency
- Many pages use bespoke text-only states (`No ... yet`, `Failed to load ...`) with no common skeleton/spinner component.
- Public portal has a plain `Loading...` fallback (`app/pages/portal/job/[token].tsx`).

Impact:
- Inconsistent perceived quality and status clarity.

### 3) Form behavior and recoverability
- Job creation (`app/pages/dashboard/jobs/new.tsx`) has strong draft logic and guided sections, which is good.
- Other forms (catalog, bookings, integrations, inventory) vary in autosave, validation messaging, and optimistic updates.

Impact:
- Different mental model page-to-page for save/submit expectations.

### 4) Role/feature-aware affordances
- Dashboard shell shows many links conditionally by feature flag.
- Some page-level CTAs still appear even when backend fallback behavior is soft-disabled.

Impact:
- Potential “button works but does nothing meaningful” perception in edge flag combinations.

### 5) Public flow polish gaps
- Booking and portal flows are broadly functional, but success/failure UX still depends on plain text messages in several steps.
- Payment fallback messaging exists, but style/wording differs across pages.

## Positive Notes
- `DashboardShell` centralizes tenant branding, location context, notifications access, and  banners.
-  and guided setup overlays/checklists are in place and linked to real screens.
- Job form includes media + signature capture with practical controls.

## Timeline Comms Metadata
- Entity timelines now include lightweight communication metadata (channel, status, reason) when available.

## Prioritized Next Actions
1. Standardize navigation primitives (`Link` for internal navigation; explicit external links only for external targets).
2. Add shared `LoadingState`, `EmptyState`, `ErrorState` components and adopt across dashboard + portal pages.
3. Define one save feedback pattern (`Saving`, `Saved`, `Failed`) for all form-heavy pages.
4. Add UX acceptance checklist per flow (booking/job/crm/billing/public portal).
