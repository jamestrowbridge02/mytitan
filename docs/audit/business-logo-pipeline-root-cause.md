# Business Logo Pipeline Root Cause

## Root Cause

The business logo upload flow accepted PNG/JPEG/WebP by request MIME and extension, stored the file under the tenant upload namespace, then persisted a full API URL as `logoUrl`.

That created three launch risks:

- Browser rendering could break when the persisted API host did not match the deployed app/API proxy path.
- Legacy absolute API URLs were rendered directly in several app surfaces instead of being normalized through the app proxy.
- The upload path did not verify decoded image signatures and dimensions after Multer wrote the file.

## Corrected Flow

New uploads now:

- Use a random opaque logo filename.
- Remain stored inside the tenant upload namespace.
- Persist a relative controlled public-logo URL.
- Avoid exposing the tenant namespace in newly returned logo URLs.
- Validate the decoded file signature and dimensions before persistence.
- Reject corrupt, disguised, unsupported, oversized, or extreme-dimension files.

The public-logo delivery route now sets explicit `Content-Type`, `Content-Length`, `Cache-Control`, `ETag`, and `Last-Modified` headers.

Legacy two-segment public-logo URLs remain supported for existing saved logos.

## Affected Surfaces

Confirmed code paths include:

- Business Profile branding preview.
- Tenant sidebar identity.
- Mobile drawer identity.
- Public booking logo rendering.
- Email templates and server-rendered outputs that already resolve public URLs.

Additional downstream surfaces still relying on direct `logoUrl` rendering should use the shared media resolver when touched.
