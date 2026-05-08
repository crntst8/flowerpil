Data model
- Table `playlist_transfer_jobs` created in `server/database/migrations/061_playlist_transfer_jobs.js` tracks job state, progress counts, destinations (JSON), results JSON, track_results JSON, errors, timestamps, and match configuration. Indexes on status, created_at, source_playlist_id.
- Prepared statements in `server/database/db.js` (`insertTransferJob`, `getTransferJobById`, `listTransferJobs`, `listTransferJobsByStatus`, `updateTransferJobStatus`, `updateTransferJobProgress`, `updateTransferJobResults`, `updateTransferJobTrackResults`, `updateTransferJobError`, `deleteTransferJob`, `countTransferJobs`, `countTransferJobsByStatus`) back the CRUD operations.

Runner
- `server/services/playlistTransferRunner.js` exports `runTransfer(jobId)` and `startTransfer(jobId)`; `startTransfer` wraps `runTransfer` in `setImmediate`.
- Fetches Spotify playlist via `spotifyService.getPlaylistDetails` using client-credentials, normalizes to local track shape, and writes `source_playlist_name` back to the job row.
- Instantiates `EnhancedTrackMatcher` for Apple and TIDAL with the job’s `match_threshold`; iterates tracks and writes per-track results into `track_results` JSON with progress updates every 10 tracks.
- Caches matched pairs in `matchesByDestination`, then creates destination playlists via `appleMusicApiService.createPlaylist` or `tidalService.createPlaylist` using Flowerpil export tokens from `exportTokenStore.getExportToken`.
- Adds tracks via `appleMusicApiService.addTracksToPlaylist` or `tidalService.addTracksToPlaylist`; stores platform results in `results` JSON. If any destination returns `auth_required`, sets status to `auth_required`; otherwise marks `completed`.
- Honors cancellation by re-reading job status each loop and exiting if `cancelled`.
- Sends completion notification through `SlackNotificationService.sendTransferCompleteNotification`.

Exports
- `server/services/transferExportService.js` provides `exportTransferResultsAsJSON(jobId)` and `exportTransferResultsAsCSV(jobId)`; both read via `getTransferJobById` and parse `results`/`track_results`.

API surface
- `server/api/admin/transfers.js` (auth + admin middleware) exposes:
  - `POST /api/v1/admin/transfers` with `{ sourceUrl, destinations, options.matchThreshold }` → inserts job and triggers `startTransfer`.
  - `GET /api/v1/admin/transfers?limit&offset&status` → paginated list.
  - `GET /api/v1/admin/transfers/:id` → single job (includes parsed `results` and `track_results`).
  - `GET /api/v1/admin/transfers/:id/export?format=csv|json` → delegates to transferExportService with download headers.
  - `DELETE /api/v1/admin/transfers/:id` → marks cancellable jobs as `cancelled`.
- Route registered in `server/index.js` under `/api/v1/admin/transfers`.

Notifications
- `server/services/SlackNotificationService.js` adds `sendTransferCompleteNotification(job, summary)` using SYSTEM_ALERTS bot or legacy channel, including per-destination status, counts, and playlist links.

Admin UI
- Content tab uses `src/modules/admin/components/tabs/ContentTab.jsx` with a `Transfer` sub-tab that lazy-loads `src/modules/admin/components/tabs/TransferTab.jsx`.
- `TransferTab.jsx` composes `TransferJobCreate.jsx`, `TransferJobList.jsx`, and `TransferJobDetails.jsx`; polls active jobs and surfaces progress, results, exports, and cancellation.
- `TrackResultsTable.jsx` renders per-track Apple/TIDAL status, confidence, strategy, and links with filtering/search.
- Client API wrapper `src/modules/admin/services/transferService.js` implements `createTransfer`, `getTransferJob`, `listTransferJobs`, `exportTransferResults`, `deleteTransferJob` using admin API helpers.
