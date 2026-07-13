# Sidebar Business Identity Audit

## Scope

Audited the Business Profile navigation entry in `app/components/nav/nav-config.ts` and `app/components/nav/sidebar.tsx`.

## Findings

- Current root cause: Business Profile used the shared `settings` icon, so the sidebar presented business identity as a generic configuration item.
- Canonical logo source: `useTenantSettings().settings.logoUrl`, the same tenant settings logo used by customer-facing profile, portal, booking and document surfaces.
- User avatar source remains separate from navigation identity; the sidebar Business Profile entry does not use the current user's avatar.
- Collapsed, expanded and mobile sidebar all render through the same `SidebarIcon` slot.
- Permission behavior is unchanged because only the icon and nav destination changed.

## Result

Business Profile now uses a dedicated business identity renderer:

- saved `logoUrl` is rendered as an avatar image when present
- image failures fall back to a single-person profile icon
- logo is lazy-loaded and decoded asynchronously
- alt text uses the business name without exposing tenant IDs or raw identifiers
- the Settings cog remains reserved for Settings
