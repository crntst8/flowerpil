# Database Backups and Litestream Operations

## Current production state

- Primary writes database backups to Cloudflare R2 through `server/services/backupService.js`.
- Backup objects are stored in `flowerpil-backups` under `db/backup-*.db.gz`.
- Backup writes are triggered from playlist-write flows (`server/api/playlists.js`, `server/services/urlImportRunner.js`) and debounced.
- Retention is enforced in app code by pruning old objects and keeping the newest backups.
- Failover must not run `litestream replicate` continuously.
- Failover is restore-only for R2 recovery and promotion.

## Failover hardening requirements

On failover host:

- `pm2 list` must not contain `litestream`.
- `pgrep -af litestream` must return no active writer process.
- `systemctl is-enabled litestream` should be `masked`.
- `systemctl is-active litestream` should be `inactive`.

If any of the above is false, failover may write `db/generations/*` objects to R2 and inflate bucket usage.

## R2 object expectations

Expected steady-state objects in `flowerpil-backups`:

- `db/backup-*.db.gz`

Unexpected objects that indicate a Litestream writer is active:

- `db/generations/*`

Operational check:

- Sample `db/generations/` object count twice, 60 seconds apart.
- Count should stay flat when failover writers are correctly disabled.

## Promotion and restore

Failover promotion restore command:

```bash
cd /var/www/flowerpil && ./scripts/litestream-restore.sh restore --force
```

Notes:

- This is a pull operation from R2 for recovery/promotion.
- Do not start or keep a continuous `litestream replicate` writer on failover.

## Historical context

- Older production setup used PM2-managed Litestream replication writers and generated `db/generations/*`.
- Current production backup model is event-driven app backups to `db/backup-*` from primary.
