# Location Image Source Of Truth

The authoritative public-booking location image field is:

`Location.metadataJson.imageUrl`

Rules:

- Uploads use `POST /locations/:id/image` with multipart field `file`.
- The API validates PNG/JPEG/WebP and the published location image size limit.
- The API persists the public media URL into `metadataJson.imageUrl`.
- The API must read the location back and verify `metadataJson.imageUrl` before returning success.
- The frontend must merge the returned canonical location rather than constructing a URL.
- Public booking cards must read the same `metadataJson.imageUrl` value.
- Raw storage paths and tenant IDs must not be exposed in new UI text.

