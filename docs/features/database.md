**Database entry points and path resolution**
- `server/database/db.js` defines `getDBPath()`, `getDatabase()`, `initializeDatabase()`, `closeDatabase()`, `resetDatabaseForTests()`, `getQueries()`, and `createLoggedQuery()`.
- `getDBPath()` resolves `DATABASE_URL` (strips `sqlite://`), `DATABASE_PATH` (resolves `./` relative to the repo root), or defaults to `data/flowerpil.db`.
- `getDatabase()` ensures the directory exists, opens `better-sqlite3`, sets `journal_mode = WAL` and `foreign_keys = ON`, and applies column guards with `ensurePlaylistCustomActionColumns()`, `ensurePlaylistAutoReferralColumn()`, and `ensurePlaylistPublishedAtColumn()`.
- `initializeDatabase()` creates base tables and indexes, calls `ensureTrackExtendedColumns()` after `tracks`, and uses `schemaInitialized` to avoid duplicate bootstraps.
- `server/index.js` calls `initializeDatabase()` inside `startServer()` before services and workers start.
- `logging-server/db.js` uses `resolveDbPath()` and `init()` to create a separate SQLite file for feedback at `logging-server/data/logging.db`.

**Base schema created in `initializeDatabase()`**
- Core content: `playlists` and `tracks` store playlist metadata and ordered tracks; `ensureTrackExtendedColumns()` adds linking and moderation fields such as `linking_status`, `match_confidence_apple`, `manual_override_tidal`, `flagged_for_review`, and `custom_sources`.
- Curation and auth: `curators`, `admin_users`, `users`, `csrf_tokens`, `email_codes`, and `password_reset_tokens` back curator profiles and account flows used by `server/api/curators.js` and `server/api/auth.js`.
- Security telemetry: `failed_login_attempts`, `account_lockouts`, and `security_events` store lockout and audit trails used by `server/utils/securityLogger.js` (`logSecurityEvent()`, `logFailedLoginAttempt()`).
- Flags and lists: `user_content_flags`, `custom_playlist_flags`, `playlist_flag_assignments`, `saved_tracks`, `lists`, `list_items`, and `share_pages` support content moderation and share links used by `server/api/flags.js`, `server/api/lists.js`, and `server/api/saved.js`.
- Export and DSP automation: `export_requests`, `oauth_tokens`, `curator_dsp_accounts`, `dsp_worker_heartbeats`, `dsp_auto_export_events`, `playlist_dsp_exports`, and `playlist_export_snapshots` support exports, managed export state, and worker health in `server/services/exportRequestService.js`, `server/services/playlistExportRunner.js`, `server/services/ExportValidationService.js`, and `server/services/dspTelemetryService.js`.
- Import and linking: `url_import_jobs`, `track_links`, `cross_links`, `track_match_cache`, and `apple_share_resolutions` support import and linking flows used by `server/services/urlImportRunner.js`, `server/services/matching/trackMatcher.js` (`checkCache()`, `cacheResult()`), and `server/services/appleShareUrlResolver.js` (`enqueueAppleShareResolution()`).
- Admin tooling: `admin_user_actions`, `admin_email_templates`, `user_groups`, `user_group_members`, `export_access_requests`, `user_import_log`, `demo_account_activity`, `spotify_imports`, and `invite_codes` back admin workflows used by `server/api/admin-users.js`, `server/api/admin/requests.js`, and `server/scripts/invite-codes.js`.

**Triggers and column guards**
- Timestamp triggers include `update_playlists_timestamp`, `update_export_requests_timestamp`, `update_oauth_tokens_timestamp`, `update_url_import_jobs_timestamp`, `update_dsp_worker_heartbeats_timestamp`, `update_cross_links_timestamp`, `trg_track_match_cache_updated`, `trg_apple_share_resolutions_updated`, `update_curator_dsp_accounts_timestamp`, and `trg_spotify_imports_updated_at`.
- Startup `ALTER TABLE` guards add fields such as `exported_spotify_url`, `exported_tidal_url`, and `exported_apple_url` on `playlists` so older databases align with `getQueries()` statements like `insertPlaylist` and `updatePlaylist`.

**Migration-managed schema**
- `server/database/migrate.js` drives migrations with `detectEnvironment()`, `validateEnvironment()`, `initializeMigrationsTable()`, `runPendingMigrations()`, and `rollbackLastMigration()`, storing filenames in the `migrations` table.
- Each file in `server/database/migrations/` exports `up()` and `down()`; several use `database ?? getDatabase()` (for example `server/database/migrations/056_end_scroll_feature.js` and `server/database/migrations/073_release_shows_direct.js`).
- Migration-only tables with active code references include:
  - `bio_profiles`, `bio_featured_links`, `bio_versions` from `server/database/migrations/009_bio_pages_system.js`, used by `server/api/bio-profiles.js` and `server/services/cacheManager.js`.
  - `export_oauth_tokens` from `server/database/migrations/042_oauth_tokens_v2.js`, used by `server/services/exportTokenStore.js` (`getExportToken()`, `saveExportToken()`).
  - `playlist_import_schedules` and `playlist_import_runs` from `server/database/migrations/034_playlist_import_schedules.js` and `server/database/migrations/035_playlist_import_runs.js`, used by `server/services/playlistSchedulerService.js` (`start()`).
  - `playlist_transfer_jobs` from `server/database/migrations/061_playlist_transfer_jobs.js`, used by `server/services/playlistTransferRunner.js`.
  - `linkout_config` and `linkout_analytics` from `server/database/migrations/050_linkout_modal.js`, used by `server/api/linkout.js`.
  - `end_scroll_config` and `end_scroll_analytics` from `server/database/migrations/056_end_scroll_feature.js`, used by `server/api/endScroll.js`.
  - `error_reports` from `server/database/migrations/054_error_reports.js`, used by `server/services/errorReportService.js` (`captureError()`).
  - `site_analytics_events`, `site_analytics_daily`, and `site_analytics_realtime` from `server/database/migrations/068_site_analytics.js`, used by `server/api/analytics.js` and `server/services/analyticsService.js` (`cleanupRealtimeSessions()`, `aggregateDailyStats()`).
  - `user_feedback` from `server/database/migrations/094_user_feedback.js`, used by `server/services/userFeedbackService.js` (`createUserReport()`, `getUserReports()`, `resolveUserReport()`).
  - `playlist_dsp_exports` and `playlist_export_snapshots` from `server/database/migrations/102_playlist_export_state_and_snapshots.js`, used by `server/services/playlistExportRunner.js` (managed export lookup, snapshot creation, upsert after export), `server/services/ExportValidationService.js` (managed export checks), and `server/services/autoExportService.js` (imported platform detection). Backfilled from legacy `exported_*_url` fields. `export_requests.execution_mode` and `url_import_jobs.draft_session_id` also added in this migration.

**Query layer and usage patterns**
- `getQueries()` in `server/database/db.js` returns prepared statements wrapped by `createLoggedQuery()`, which logs errors through `logger.dbError()` in `server/utils/logger.js`.
- Representative statements include `getAllPlaylists`, `insertPlaylist`, `getTracksByPlaylistId`, `updateTrack`, `getCuratorById`, `listExportRequests`, `createExportRequest`, `getTesterFeedbackByAction`, and `getUserByEmail`.
- APIs and services use `getQueries()` for consistent SQL, for example `server/api/playlists.js`, `server/api/auth.js`, `server/services/publishingQueue.js`, and `server/services/autoExportService.js`.
- Direct SQL via `getDatabase()` shows up in routes such as `server/routes/search.js`, `server/api/analytics.js`, and `server/api/sitemap.js` (`generateSitemap()` opens a read-only `Database` instance).

**Search and FTS**
- `schema/search.sql` defines `playlists_fts`, `tracks_fts`, `artists_fts`, `genres_fts`, `curators_fts`, `playlist_freshness`, and projection/helper tables: `search_artists`, `search_genres`, `search_artist_playlists`, `search_genre_playlists`, `search_curators`, and `search_editorials`. Triggers include `playlists_fts_ai`, `tracks_fts_au`, and curator FTS sync triggers.
- `server/services/siteSearchService.js` owns search logic (intent inference, candidate collection, ranking). `server/routes/search.js` delegates to the service and ensures `search_editorials` via `ensureSearchEditorialSchema()`.
- `server/scripts/rebuild-search-index.js` applies `schema/search.sql` with `applySearchSchema()`, clears projections in `resetSearchProjectionTables()`, and rebuilds indexes through `rebuildPlaylistsFts()`, `rebuildTracksFts()`, `rebuildArtistsIndex()`, `rebuildGenresIndex()`, and `rebuildCuratorsIndex()`. Genre linking preserves tag-only genres using a sentinel track_id of -1 in `search_genre_playlists`.
- Migration 103 (`server/database/migrations/103_search_curator_index_and_search_schema_sync.js`) creates `search_curators` and `curators_fts` tables for existing databases.

**Audit, security, and system telemetry**
- `server/utils/auditLogger.js` writes to `audit_logs` through `logPlaylistChange()` and `logAdminAction()` (table created in `server/database/migrations/008_audit_logging.js`).
- `server/utils/securityLogger.js` writes to `security_events`, `failed_login_attempts`, and `account_lockouts`.
- `server/database/systemPerformanceRepository.js` manages `system_performance_log` with `recordSystemMetric()`, `getRecentSystemMetrics()`, and `pruneOldSystemMetrics()`.
- `server/services/dspTelemetryService.js` writes to `dsp_worker_heartbeats` and `dsp_auto_export_events` via `recordWorkerHeartbeat()` and `logAutoExportEvent()`.

**Feedback data stores**
- `tester_feedback` lives in the main database and is accessed by `server/services/testerFeedbackService.js` (`createFeedbackEntries()`, `getUnsyncedFeedback()`, `markFeedbackSynced()`).
- `logging-server/db.js` stores raw feedback in the `feedback` table for the standalone logging server.

**Scripts and operational tooling**
- `scripts/init-db.js` calls `initializeDatabase()` and `closeDatabase()` for a base schema.
- `scripts/create-fresh-database.js` backs up `data/flowerpil.db`, removes WAL/SHM files, and re-runs `initializeDatabase()`.
- `server/scripts/rebuild-search-index.js` replays `schema/search.sql` and rebuilds FTS tables for search consistency.
- Primary backup writes are event-driven in `server/services/backupService.js` and stored in R2 as `db/backup-*.db.gz`.
- Failover should be restore-only from R2 and should not run continuous Litestream replication writers.
- Backup and restore helpers still present in scripts include `scripts/backup-db.sh`, `scripts/restore-db.sh`, `scripts/sync-db-to-failover.sh`, and `scripts/litestream-restore.sh`; Litestream config remains in `litestream.yml` for restore/legacy operations.
- `server/scripts/admin-dashboard.js` opens its own `better-sqlite3` connection using `DATABASE_PATH` without `getDatabase()`.

**Testing**
- `tests/setup.backend.js` sets `DATABASE_PATH=':memory:'`, calls `initializeDatabase()`, runs `runMigrationsForTests()`, and truncates tables in `clearDatabaseForTests()`.
- `resetDatabaseForTests()` in `server/database/db.js` enforces `NODE_ENV === 'test'` before re-initializing the schema.
