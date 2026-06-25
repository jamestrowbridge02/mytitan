# Backup and restore

MyTitan includes an encrypted backup helper and a restore-preview helper:

- `scripts/backup.sh`
- `scripts/restore-test.sh`

Preconditions:

- `.env` exists on the host
- `BACKUP_ENCRYPTION_KEY` is present
- `mytitan_postgres` is reachable from Docker

Backup flow:

1. `scripts/backup.sh` creates a Postgres dump from `mytitan_postgres`
2. the dump is gzipped
3. the gzip is encrypted with `BACKUP_ENCRYPTION_KEY`
4. encrypted archives older than 30 days are removed
5. a non-secret marker is written so host readiness checks can report the latest successful backup timestamp without exposing storage credentials

Restore drill:

1. Confirm `BACKUP_ENCRYPTION_KEY` is available on the host
2. Identify the latest `.enc` backup or pass one explicitly to `scripts/restore-test.sh`
3. Run `scripts/restore-test.sh /path/to/backup.enc`
4. Verify the previewed SQL header looks correct
5. Record the drill date and operator outcome in the deployment log
6. the helper writes a non-secret restore-preview marker so readiness checks can report when the last drill ran
7. the marker also records the encrypted artifact name, SHA-256, preview status, and duration without exposing the decryption key

Notes:

- `restore-test.sh` is a preview only; it does not mutate production data
- full restore execution should be practiced in an isolated environment before broad launch
- do not treat the presence of the script as proof that backups are scheduled; scheduling remains an operator-owned host responsibility
- `bash ./scripts/backup-readiness-status.sh` reports:
  - `ready`
  - `needs_backup_run`
  - `needs_restore_drill`
  - `needs_schedule`
  - `unknown`
