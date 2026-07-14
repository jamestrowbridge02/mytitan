# Business Logo Source Of Truth

The canonical business logo value is `TenantSetting.logoUrl`.

Rules:

- The database stores the authoritative logo reference.
- New uploaded logos store a relative controlled public-logo path.
- The API resolves server-side public URLs only when needed for email/PDF/external output.
- Browser surfaces use `resolveMediaUrl` so relative media routes use the same-origin API proxy.
- Normal tenant UI must not expose raw storage paths, tenant ids, or editable logo URLs.
- The sidebar must not maintain a separate logo source.
- Existing legacy logo references remain readable.

Fallback order:

1. Saved business logo.
2. Stable business initials.
3. Approved single-profile fallback icon.

The current signed-in user avatar remains separate from business identity.
