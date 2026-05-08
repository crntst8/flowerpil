# DSP Workflow

## Curator playlist creation and editing
- `src/modules/curator/components/CuratorPlaylistCreate.jsx` orchestrates the create flow with `persistPlaylist`, `ensureDraft`, `handleDspImportSelection`, `handleUrlImport`, `handleTextImport`, `triggerCrossLinkingBackground`, and `startCrossLinking`.
- `src/modules/curator/components/CuratorPlaylists.jsx` manages existing playlists and uses `handleDspImportSelection`, `handleUrlImport`, and `savePlaylist`.
- `src/modules/curator/components/ImportModal.jsx` uses a staged flow (detect -> preview -> confirm) for URL imports: fetches playlist preview from `/api/v1/url-import/test-playlist`, shows summary card with track listing, and requires explicit confirmation before importing. Auto-import for playlist URLs has been removed. For DSP library imports it loads playlists via `GET /api/v1/curator/dsp/spotify/playlists`, `GET /api/v1/curator/dsp/apple/playlists`, and `GET /api/v1/curator/dsp/tidal/playlists`.

## Curator DSP auth and preferences
- `src/modules/curator/components/CuratorDSPConnections.jsx` uses `/api/v1/export/auth/:platform/url`, `/api/v1/export/auth/:platform/callback`, and `/api/v1/export/auth/status` from `server/api/playlist-export.js`, plus `/api/v1/apple/developer-token` and `/api/v1/apple/auth/token` from `server/api/apple-music.js`.
- `server/services/exportTokenStore.js` provides `resolveAccountContext`, `saveExportToken`, `getExportToken`, and `buildTokenStatus`. Tokens live in `export_oauth_tokens`.
- `server/api/curator/index.js` persists DSP preferences via `POST /api/v1/curator/onboarding/dsp` into `curator_dsp_accounts`.

## Import endpoints and services

### Spotify (curator import)
- `POST /api/v1/curator/dsp/spotify/import` in `server/api/curator/index.js` imports into a playlist using `importFromSpotify` and `processSpotifyArtwork` from `server/services/playlistImportService.js`.
- `importFromSpotify` de-dupes by `spotify_id`, supports append or replace, and sets `tracks.linking_status`.
- The endpoint triggers background tasks: `crossPlatformLinkingService.startPlaylistLinking`, `queueAutoExportForPlaylist`, and `DeezerPreviewService.getPreviewForTrack`.

### Spotify (admin and library tools)
- `server/api/spotify.js` exposes:
  - `POST /api/v1/spotify/import/:playlistId` (requires `X-Spotify-Token`).
  - `POST /api/v1/spotify/import-url` for public Spotify playlist URLs.
  - `GET /api/v1/spotify/library/playlists` and `POST /api/v1/spotify/library/import/:playlistId`.
- `src/modules/admin/components/SpotifyImport.jsx` uses `/api/v1/spotify/auth/url`, `/api/v1/spotify/auth/callback`, `/api/v1/spotify/playlists`, and `/api/v1/spotify/import/:playlistId`.
- `src/modules/admin/services/perfectSundaysService.js` uses `/api/v1/spotify/import-url` and `/api/v1/spotify/library/import/:playlistId`.

### Apple Music
- `server/api/apple-music.js` handles:
  - `GET /api/v1/apple/developer-token` and `POST /api/v1/apple/auth/token` (MusicKit MUT stored via `saveExportToken`).
  - `GET /api/v1/apple/import/playlists` and `POST /api/v1/apple/import/:playlistId` for library playlists.
  - `GET /api/v1/apple/catalog/playlists/:playlistId` for catalog playlists.
- Artwork caching uses `processAndSaveImageFromUrl` in `server/api/apple-music.js`.

### TIDAL
- `server/api/tidal.js` provides `GET /api/v1/tidal/playlists` and `POST /api/v1/tidal/import/:playlistId`.
- Token selection and refresh are in `ensureTidalAccessToken` and `refreshTidalToken` in `server/api/tidal.js`.
- Artwork helpers `buildTidalImageUrl` and `resolveTidalArtwork` normalize cover art.

### URL import jobs (Qobuz, SoundCloud, Spotify, Apple, TIDAL, YouTube)
- `server/api/url-import.js` uses `detectUrlTarget` and `startUrlImportJob`.
- `server/services/urlImportService.js` exports `resolveUrlImport`, `resolvePlaylistFromUrl`, and `resolveTrackFromUrl`.
- `server/services/urlImportRunner.js` (`runUrlImportJob`) resolves playlists, merges tracks with `mergeTracks`, and persists with `persistTracks`.
- UI paths: `CuratorPlaylistCreate.jsx` (`handleUrlImport`) and `CuratorPlaylists.jsx` (`handleUrlImport`) call `/api/v1/url-import/jobs` and poll `/api/v1/url-import/jobs/:id`.

### Text paste import
- `CuratorPlaylistCreate.jsx` (`parseTextTracks`) parses "Artist - Title" or "Title by Artist".
- `handleTextImport` merges the parsed tracks into the draft and calls `persistPlaylist`.

## Cross-platform linking

### API surface
- `server/api/crossPlatform.js` defines:
  - `POST /api/v1/cross-platform/link-playlist` -> `crossPlatformLinkingService.startPlaylistLinking`.
  - `POST /api/v1/cross-platform/link-track` -> `crossPlatformLinkingService.linkTrack`.
  - `GET /api/v1/cross-platform/job-status/:jobId` and `GET /api/v1/cross-platform/stats/:playlistId`.
  - `POST /api/v1/cross-platform/manual-override`, `POST /api/v1/cross-platform/flag-for-review`, `GET /api/v1/cross-platform/flagged-tracks`.

### Linking service
- `server/services/crossPlatformLinkingService.js` runs `linkTrack`, `startPlaylistLinking`, `updateTrackAppleLink`, `updateTrackTidalLink`, `updateTrackSpotifyId`, and `updateTrackLinkingStatus`.
- Apple matching uses `searchAppleMusicByTrack` from `server/services/appleMusicService.js`, which calls `appleMusicApiService.searchCatalogByISRC` and `appleMusicApiService.searchCatalogByMetadata`.
- TIDAL matching uses `server/services/tidalService.js` (`searchByTrack`, ISRC only).
- Spotify matching uses `server/services/spotifyService.js` (`searchByTrack`, ISRC then metadata).
- Rate limiting uses token buckets in `crossPlatformLinkingService.createRateLimiters` with `LINKING_APPLE_RPS`, `LINKING_TIDAL_RPS`, and `LINKING_SPOTIFY_RPS`.

### Distributed linking
- `LINKING_DISTRIBUTED=on` makes `/link-playlist` and `/link-track` mark rows as `pending` and rely on the worker.
- `server/worker/linking-worker.js` calls `/api/v1/cross-platform/worker-config`, leases tracks with `/lease`, extends with `/heartbeat`, releases with `/release`, and reports via `/report`.
- The worker uses `searchAppleMusicByTrack`, `searchTidalByTrack`, `spotifyService.searchByTrack`, and `DistributedRateLimiter` in `server/utils/DistributedRateLimiter.js`.

### Linking data fields
- `tracks` columns: `apple_music_url`, `tidal_url`, `match_confidence_apple`, `match_confidence_tidal`, `match_source_apple`, `match_source_tidal`, `linking_status`, `linking_error`, `linking_retry_count`, `linking_last_retry_at`, `linking_lease_owner`, `linking_lease_expires`, `manual_override_apple`, `manual_override_tidal`, `flagged_for_review`, `flagged_reason`.
- `cross_links` stores Apple link metadata via `crossPlatformLinkingService.updateTrackAppleLink` and link resolver writes in `server/services/linkResolverService.js` (`persistToCrossLinks`).

## Publish and export

### Publish and queue
- `PATCH /api/v1/playlists/:id/publish` in `server/api/playlists.js` calls `queueAutoExportForPlaylist` from `server/services/autoExportService.js`.
- `POST /api/v1/playlists/:id/queue-export` queues export requests using `ensureExportRequest` or `queueAutoExportForPlaylist`.
- UI labels adapt based on managed export state: "Publish & Sync" when `playlist_dsp_exports` rows exist for the playlist, "Publish & Export" otherwise. Per-platform labels show "Updates existing playlist" (Spotify/TIDAL) vs "Creates new and re-links" (Apple/YouTube).

### Export API
- Routes live under `/api/v1/export` in `server/api/playlist-export.js`:
  - `GET /api/v1/export/playlists/:id/export/validate`
  - `GET /api/v1/export/playlists/:id/export/validate/:platform`
  - `POST /api/v1/export/playlists/:id/queue-export/:platform`
  - `POST /api/v1/export/playlists/:id/export/:platform` (legacy blocking)
- `ExportValidationService.validatePlaylistEligibility` and `ExportValidationService.validatePlaylistForExport` enforce exportability.

### Export execution
- `server/services/playlistExportRunner.js` (`runPlaylistExport`) handles token resolution, managed export lookup, snapshot creation, export execution, and result persistence.
- `server/services/platformCapabilities.js` defines per-platform capability flags (`canReplace`, `canReadTracks`).
- The runner resolves managed export state from `playlist_dsp_exports` first (legacy `exported_*_url` as fallback), then branches:
  - **Spotify/TIDAL** (`canReplace: true`): calls `syncPlaylist()` to replace in place (PUT/PATCH metadata, replace tracks). Creates a pre-mutation snapshot with `rollback_capability: 'full'`.
  - **Apple/YouTube** (`canReplace: false`): calls `exportPlaylist()` to create new, updates the managed export pointer. Snapshot has `rollback_capability: 'audit_only'`.
  - **`create_new` mode**: always creates a new remote playlist regardless of platform.
- After success, upserts `playlist_dsp_exports` with the remote playlist ID/URL and `status: 'active'`.
- Source URLs (imported `*_url` fields) are preserved separately from export URLs (`exported_*_url`).
- Platform runners:
  - `server/services/spotifyService.js` (`exportPlaylist`, `syncPlaylist`)
  - `server/services/appleMusicApiService.js` (`exportPlaylist`)
  - `server/services/tidalService.js` (`exportPlaylist`, `syncPlaylist`)
- Apple exports notify via `SlackNotificationService.notifyAppleExportSuccess` when no share URL is returned.

## Export requests and worker
- `server/api/export-requests.js` creates and reads `export_requests` via `ensureExportRequest` in `server/services/exportRequestService.js`.
- `server/worker/dspExportWorker.js` runs `workerLoop`, `leaseRequest`, `processExportRequest`, `handleFailedExport`, and `updateHeartbeat`.
- Progress updates use `server/api/sse.js` (`broadcastExportProgress`).

## Scheduled imports
- `server/services/playlistSchedulerService.js` (`start`) runs scheduled Spotify imports from `playlist_import_schedules` and calls `importFromSpotify`, `queueAutoExportForPlaylist`, and `crossPlatformLinkingService.startPlaylistLinking`.
- `server/api/playlist-actions.js` exposes schedule endpoints (`/api/v1/playlist-actions/schedules`) and manual runs (`POST /api/v1/playlist-actions/import-now`).
- UI uses `src/modules/curator/components/SchedulesTab.jsx`, `src/modules/curator/components/ScheduleModal.jsx`, and `src/modules/curator/services/scheduleService.js`.

## Admin surfaces
- `src/modules/admin/components/AdminDSPConnections.jsx` uses `/api/v1/export/auth/*` and `/api/v1/admin/dsp/tokens/health`.
- `src/modules/admin/components/RequestsQueue.jsx` and `src/modules/admin/components/ExportRequestsPanel.jsx` manage `export_requests`.
- `src/modules/admin/components/CrossPlatformLinkingManager.jsx` and `src/modules/curator/components/CuratorLinkingModal.jsx` hit `/api/v1/cross-platform/*`.
- `src/modules/admin/components/ScheduledImportsPanel.jsx` uses `/api/v1/admin/scheduled-imports`.

## Data tables
- Core: `playlists`, `tracks`.
- DSP workflow: `export_oauth_tokens`, `export_requests`, `curator_dsp_accounts`, `url_import_jobs`, `playlist_import_schedules`, `playlist_import_runs`, `dsp_worker_heartbeats`, `dsp_auto_export_events`, `cross_links`, `playlist_dsp_exports`, `playlist_export_snapshots`.
