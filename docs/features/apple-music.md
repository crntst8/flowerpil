# Apple Music

## Frontend entry points
- `src/modules/curator/components/CuratorDSPConnections.jsx` uses `preInitializeMusicKit()` and `connectApple()` to fetch `/api/v1/apple/developer-token`, call `getMusicKitInstance()` plus `authorizeMusicKit()`, and POST `/api/v1/apple/auth/token`.
- `src/pages/AppleMusicAuth.jsx` runs `authorize()` on load, bootstraps the MusicKit v3 script, calls `music.authorize()`, and posts to `/api/v1/apple/auth/token`; it uses `sessionStorage` keys `apple_dev_token`, `apple_auth_return_url`, `apple_auth_redirect`, and `apple_auth_success`.
- `src/modules/admin/components/AdminDSPConnections.jsx` uses `connectApple()` to call `getMusicKitInstance()` plus `authorizeMusicKit()`, then POST `/api/v1/export/auth/apple/callback`.
- `src/modules/admin/components/PlaylistExportModal.jsx` uses `handleAuthenticate()` for Apple to call `/api/v1/apple/auth/token` and `handleExportSelected()` to call `/api/v1/export/playlists/:id/export/apple`.
- `src/modules/admin/components/AppleImport.jsx` uses `handleConnect()` to save tokens and `importByUrl()` or `handleImport()` to import playlists.
- `src/modules/curator/components/LibraryImportSection.jsx` lists library playlists from `/api/v1/curator/dsp/apple/playlists` and formats artwork templates with `formatAppleArtworkUrl()`.
- `src/modules/curator/components/CuratorPlaylistCreate.jsx` uses `handleDspImportSelection()` to call `/api/v1/apple/import/:playlistId` or `/api/v1/url-import/jobs` for URL imports, then saves via `persistPlaylist()`.
- `src/modules/curator/components/CuratorPlaylists.jsx` and `src/modules/curator/components/PlaylistSyncModal.jsx` call `/api/v1/apple/import/:playlistId` for imports and sync.
- `src/modules/playlists/components/PlaylistView.jsx` renders Apple streaming links from `currentPlaylist.apple_url`.
- `src/modules/playlists/components/ExpandableTrack.jsx` renders Apple track links from `track.apple_music_url` with fallback to `track.apple_id`.

## MusicKit loading and authorization
- `src/shared/utils/musicKitUtils.js` exposes `ensureMusicKitReady()`, `getMusicKitInstance()`, and `authorizeMusicKit()` to load `https://js-cdn.music.apple.com/musickit/v3/musickit.js`, configure MusicKit, and retry initialization.
- `CuratorDSPConnections.jsx` preloads MusicKit in `preInitializeMusicKit()` and uses `authorizeMusicKit()` inside `connectApple()`.
- `AppleMusicAuth.jsx` loads MusicKit directly, retries `MusicKit.getInstance()` and `MusicKit.configure()`, and uses `music.authorize()` on page load for popup-blocked cases.

## Auth endpoints and token storage
- `server/api/apple-music.js` exposes:
  - `GET /api/v1/apple/developer-token` which calls `appleMusicApiService.getDeveloperToken()`.
  - `POST /api/v1/apple/auth/token` which calls `resolveAccountContext()` and `saveExportToken()`, sets `expires_in` to the `APPLE_MUT_TTL_SECONDS` constant (6 months), then calls `calculateHealthStatus()` and `updateTokenHealth()`.
- `server/api/playlist-export.js` exposes `POST /api/v1/export/auth/apple/callback`, accepts `{ musicUserToken, storefront }`, resolves storefront via `appleMusicApiService.getUserStorefront()`, and saves via `saveExportToken()`.
- `server/services/exportTokenStore.js` owns `resolveAccountContext()`, `getExportToken()`, `saveExportToken()`, and `buildTokenStatus()`. `buildTokenStatus()` treats Apple tokens as connected when a row exists.
- `server/services/tokenHealthService.js` tracks token health with `calculateHealthStatus()` and `updateTokenHealth()`. `validateAppleToken()` calls `/v1/me/storefront` and sends the MUT as both `Authorization` and `Music-User-Token`.

## Storefront resolution
- `server/utils/appleStorefront.js` provides `resolveStorefront()`, `resolveStorefrontWithFallbacks()`, and `getStorefrontPriority()` for default and fallback storefronts.
- `appleMusicApiService.getUserStorefront()` uses `/v1/me/storefront` and normalizes with `resolveStorefrontWithFallbacks()`.
- `crossPlatformLinkingService.getAppleStorefront()` reads from the legacy `oauth_tokens` table, caches for five minutes, and falls back to `process.env.APPLE_MUSIC_STOREFRONT` or `us`.

## Apple Music API client
- `server/services/appleMusicApiService.js` handles:
  - Developer token minting via `getConfig()`, `getPrivateKeyPEM()`, and `getDeveloperToken()` (env keys include `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, `APPLE_MUSIC_PRIVATE_KEY`, `APPLE_MUSIC_PRIVATE_KEY_PATH`, `APPLE_MUSIC_TOKEN_TTL_MIN`).
  - HTTP calls via `apiRequest()` with a `CircuitBreaker` named `apple-music-api`.
  - Catalog search via `searchCatalogTrack()`, `searchCatalogByISRC()`, and `searchCatalogByMetadata()`; scoring uses `createScoringContext()` and `scoreAppleCandidate()` from `server/services/apple-music/scoring.js`.
  - Playlist operations via `createPlaylist()`, `addTracksToPlaylist()`, `getLibraryPlaylistTrackIds()`, and `exportPlaylist()`.
  - Share URL helpers via `extractPlaylistIdFromUrl()`, `isLibraryPlaylistId()`, `isCatalogPlaylistId()`, `isShareUrl()`, and `resolvePlaylistShareUrl()`.

## Library playlist imports (authenticated)
- `server/api/apple-music.js` `router.get('/import/playlists')` uses `getAppleTokenForUser()` and `appleMusicApiService.apiRequest()` against `/v1/me/library/playlists`.
- `server/api/apple-music.js` `router.post('/import/:playlistId')`:
  - Fetches playlist ordering via `/v1/me/library/playlists/:id?include=tracks`.
  - Paginates tracks via `/v1/me/library/playlists/:id/tracks?limit=100&include=catalog`.
  - Enriches metadata with `/v1/catalog/{storefront}/songs` and album includes.
  - Builds track rows with `resolveAppleArtworkUrl()` and saves playlist artwork via `processAndSaveImageFromUrl()`.
- `server/api/curator/index.js` `router.get('/dsp/apple/playlists')` uses `getCuratorOAuthToken()` and `AppleMusicApiService.getUserLibraryPlaylists()` to populate `LibraryImportSection.jsx`.

## Public catalog and URL imports
- `server/services/urlImportService.js` detects Apple URLs in `detectUrlTarget()`, extracts IDs via `extractAppleStorefrontFromUrl()` and `extractAppleSongIdFromUrl()`, and resolves:
  - Tracks with `/v1/catalog/{storefront}/songs/{songId}` inside `resolveTrackFromUrl()`.
  - Playlists with `/v1/catalog/{storefront}/playlists/{playlistId}` inside `resolvePlaylistFromUrl()` and rejects library playlist IDs (`p.`).
- `server/services/urlImportRunner.js` calls `resolveUrlImport()` to persist tracks, set `linking_status`, and update `playlists.apple_url` when the resolved playlist includes an Apple URL.
- `CuratorPlaylistCreate.jsx` calls `/api/v1/url-import/jobs` in `handleUrlImport()` when a selection has `selection.url` but no `selection.id`.

## Export flow
- `server/services/ExportValidationService.js` treats a track as Apple-ready when it has `apple_id` or `apple_music_url` in `validatePlaylistForExport()` and `getExportReadyTracks()`.
- `server/api/playlist-export.js` routes:
  - `POST /api/v1/export/playlists/:id/export/apple` to `runPlaylistExport()` (blocking).
  - `POST /api/v1/export/playlists/:id/queue-export/apple` to enqueue a worker job.
- `server/services/playlistExportRunner.js` calls `appleMusicApiService.exportPlaylist()` and persists `playlists.apple_url` and `playlists.exported_apple_url` when a share URL is available.
- `appleMusicApiService.exportPlaylist()` calls `createPlaylist()` and `addTracksToPlaylist()`, filters tracks by `apple_id`, and returns `shareUrlPending` when the playlist URL is a library ID (`p.`).
- `SlackNotificationService.notifyAppleExportSuccess()` sends a notification when export returns a library playlist without a share URL.

## Share URL resolution and admin tools
- `server/services/appleShareUrlResolver.js` tracks resolution jobs in `apple_share_resolutions`, uses `resolvePlaylistShareUrl()` to look up a catalog share URL, and reads tokens from the legacy `oauth_tokens` table via `fetchAppleAuthToken()`.
- `server/api/admin/apple-share.js` exposes `GET /api/v1/admin/apple-share/pending`, `POST /api/v1/admin/apple-share/manual-url`, and `POST /api/v1/admin/apple-share/trigger-check/:playlistId`.
- `server/services/playlistExportRunner.js` does not call `enqueueAppleShareResolution()` (the import is commented), so share resolution relies on admin tools and manual updates.

## Cross-platform linking and matching
- `server/services/appleMusicService.js` exposes `searchAppleMusicByTrack()`, `searchAppleMusicByISRC()`, and `searchAppleMusicByMetadata()`; it defers to `appleMusicApiService` when `useApiSearch` is enabled by `process.env.APPLE_MUSIC_API_SEARCH`.
- `server/services/crossPlatformLinkingService.js` uses `searchAppleMusicByTrack()` and `normalizeAppleResultPayload()` to populate `tracks.apple_music_url`, `tracks.apple_id`, `match_confidence_apple`, and `match_source_apple`.
- `crossPlatformLinkingService.setManualOverride()` updates `manual_override_apple`, `match_source_apple`, and `match_confidence_apple` for manual links; `server/api/crossPlatform.js` validates URLs with `validateAppleMusicUrl()` from `server/services/appleMusicService.js`.
- `server/services/matching/trackMatcher.js` uses `appleMusicApiService.searchCatalogTrack()` for EnhancedTrackMatcher flows.

## Transfer and Top 10
- `server/services/playlistTransferRunner.js` uses `appleMusicApiService.createPlaylist()`, `addTracksToPlaylist()`, and `getLibraryPlaylistTrackIds()` with Flowerpil tokens from `exportTokenStore.getExportToken()`.
- `server/services/top10LinkingService.js` calls `searchAppleMusicByTrack()` to add `apple_music_url` to inline Top 10 tracks.
- `server/services/top10ExportService.js` uses `exportTop10ToApple()` to create a library playlist via `appleMusicApiService.createPlaylist()` and writes `top10_playlists.apple_export_url`.

## Data model touchpoints
- `export_oauth_tokens` stores Apple tokens with `platform='apple'`, `account_type`, `owner_curator_id`, `access_token`, `expires_at`, `user_info`, and `health_status` via `saveExportToken()` in `server/services/exportTokenStore.js`.
- `tracks` stores `apple_id`, `apple_music_url`, `match_confidence_apple`, `match_source_apple`, `manual_override_apple`, and linking fields updated by `crossPlatformLinkingService.updateTrackLinkingStatus()`.
- `playlists` stores `apple_url` and `exported_apple_url`, updated in `playlistExportRunner.js` and `urlImportRunner.js`.
- `apple_share_resolutions` stores share-resolution jobs created by `enqueueAppleShareResolution()` in `server/services/appleShareUrlResolver.js`.
