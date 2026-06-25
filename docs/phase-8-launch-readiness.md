# Phase 8 Launch Readiness

## Upload Safety

- Nginx request ceiling: 110 MB, including multipart overhead.
- Images: 25 MB.
- Videos: 100 MB.
- PDFs and documents: 20 MB.
- Plain text: 5 MB.
- CSV imports: 5 MB and 2,000 rows per preview.
- Tenant logos: 2 MB.
- Job-form base64 media: 8 MB because this legacy path is JSON-backed.

The API validates tenant ownership, MIME type, extension, size, and storage path. Executable and active-content file types are rejected. Accepted and rejected artifact attempts are audited.

Virus scanning is not configured and must not be represented as active. Client compression, queue, retry, and reconnect states exist, but server-side chunk assembly and resumable upload sessions are not enabled.

The repository Nginx policy is in `deploy/nginx/mytitan-upload-limits.conf`. Production readiness remains `needs_setup` until the active API proxy includes `client_max_body_size 110M`.

## Final Completion Phase

The operational audit and truthful readiness boundaries for booking, Wheel A&R pilot setup, payments, offline work, communications, platform administration, white labelling, and legal publication are recorded in `docs/audit/final-completion-phase-audit.md`.
