SoundCloud integration is implemented with app-level client credentials. No user OAuth flow is present yet; all requests use the app client_id and client_secret from `ecosystem.config.cjs`.

Backend
- `server/services/soundcloudService.js` handles token retrieval, URL resolution, track/playlist transforms, and preview URL discovery. `getClientCredentialsToken` caches the client_credentials token with validation to ensure valid tokens before use. `fetchWithAuth` injects `Authorization: OAuth <token>` header, sets a User-Agent, and manually follows redirects while preserving the Authorization header (OAuth tokens don't require `client_id` in query strings per SoundCloud API docs). `resolveUrl` and `importFromUrl` call SoundCloud's `/resolve` and playlist/track endpoints. `buildTrack` tries media transcodings first, then `/tracks/:id/streams`, and sets `preview_url` when available.
- Routes in `server/api/soundcloud.js`: `POST /api/v1/soundcloud/import` imports a SoundCloud playlist or track URL and returns normalized tracks plus optional playlist metadata; `POST /api/v1/soundcloud/resolve` resolves a single track URL and returns a normalized track with preview when available. Both routes require auth via `authMiddleware`.
- Server wiring in `server/index.js` mounts the routes at `/api/v1/soundcloud`.
- Cross-linking rules treat SoundCloud-only tracks as eligible for linking (bandcamp-only is still skipped). See linking status decisions in `server/api/playlists.js` and `server/services/playlistImportService.js`.

Frontend (curator)
- Import modal supports SoundCloud paste mode. In `src/modules/curator/components/ImportModal.jsx`, allowed platforms include `soundcloud`; selecting the tab prompts for a SoundCloud URL and triggers `onImported` with `platform: 'soundcloud'`.
- Playlist creation flow handles SoundCloud imports. In `src/modules/curator/components/CuratorPlaylistCreate.jsx`, `handleDspImportSelection` has a `soundcloud` branch: it POSTs to `/api/v1/soundcloud/import`, creates/updates the draft via `ensureDraft`/`persistPlaylist`, normalizes tracks, and kicks off cross-linking as with other DSP imports.

Frontend (admin/shared)
- Track add row supports “Paste URL” for SoundCloud tracks. `src/modules/admin/components/TrackList.jsx` uses `handleImportFromUrl` to POST `/api/v1/soundcloud/resolve`, pre-fills title/artist/duration/artwork, sets `soundcloud_url`, and includes preview_url if available.
- Callback page for future OAuth flow exists at `src/modules/admin/components/SoundcloudCallback.jsx` and route `/auth/soundcloud/callback` is registered in `src/modules/admin/manifest.js` and `src/modules/admin/index.js`, but no server-side OAuth exchange is implemented yet.

Behavioral notes
- Imports use app-level client credentials, so only public SoundCloud resources are supported today.
- Authentication: All API requests use `Authorization: OAuth <token>` header format. The service validates tokens before use and handles redirects while preserving authorization headers. When using OAuth tokens, `client_id` is not included in query strings (per SoundCloud API requirements).
- Previews: when SoundCloud provides progressive/hls transcodings or `/tracks/:id/streams` has a playable URL, `preview_url` is set and surfaces in the playlist UI via existing preview components. The preview system prioritizes SoundCloud preview URLs over Deezer when both are available. SoundCloud streams are proxied through `/api/v1/preview/stream/:trackId` for CORS compliance and proper attribution. Client-side duration limiting enforces a 30-second preview limit using both timeout (30s) and timeupdate event listeners to ensure playback stops at the limit even for full-length tracks. The SoundCloud API provides three access levels: "playable" (full stream), "preview" (preview available), and "blocked" (metadata only).
- Linking: SoundCloud-only tracks set linking_status to `pending`, allowing cross-platform linking attempts; only Bandcamp-only tracks are skipped by default.
