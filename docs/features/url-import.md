# URL Import (Unified Paste URL)

Flowerpil supports importing playlists and resolving individual tracks from public URLs without requiring curators to connect their own DSP accounts.

This feature is designed to be a single, extensible “resolver” layer that can later be reused for cross-platform matching and additional platforms.

## Supported URLs

Playlists (public, no curator auth required)
- Spotify
- Apple Music
- TIDAL
- Qobuz
- SoundCloud
- YouTube

Tracks (resolve metadata from URL)
- All of the above
- Bandcamp

## Matching rules

- Matching + lookup attempts use stored app/admin credentials in this order:
  1. Spotify
  2. TIDAL
  3. Apple Music
- If all matches fail, Flowerpil imports the available metadata from the source URL.
- Bandcamp URLs never trigger DSP matching. Bandcamp resolution uses the Bandcamp page only.

## Backend API

### Create a background import job

`POST /api/v1/url-import/jobs`

Body:
```json
{
  "url": "https://open.spotify.com/playlist/...",
  "playlist_id": 123,
  "mode": "append",
  "append_position": "bottom",
  "update_metadata": true,
  "draft_session_id": "uuid-v4"
}
```

Notes
- Persists the resolved tracks into the playlist in the background.
- The job continues even if the user navigates away.
- `draft_session_id` (optional) links the import to a specific draft creation session so `urlImportRunner` can reuse an existing draft instead of creating duplicates.

### Job deduplication

Import jobs are deduplicated within a **30-second window** using a composite key:
- `curator_id` + normalized URL + `target_playlist_id` + `mode` + `append_position` + `update_metadata`

Matching recent `pending`/`running`/`completed` jobs are reused instead of inserting duplicates. The query `findRecentImportJob` in `db.js` implements this check.

### Preview a playlist URL before importing

`POST /api/v1/url-import/test-playlist`

Returns playlist metadata and first tracks for preview. Used by `ImportModal`'s staged flow (detect -> preview -> confirm) to show a summary card with track listing before the user confirms the import.

### Poll job status

`GET /api/v1/url-import/jobs/:id`

Returns:
- `status`: `pending | resolving | matching | saving | completed | failed`
- `progress.total`, `progress.processed`
- `result.playlist_id` on completion

### Detect a URL target

`POST /api/v1/url-import/detect`

Returns `{ platform, kind }` where `kind` is `playlist | track | auto`.

### Resolve a single track from URL (no background job)

`POST /api/v1/url-import/resolve-track`

Returns a normalized track payload suitable for the track editor (title/artist/album/year/duration + any resolved DSP ids/urls).

## Implementation

Backend
- `server/services/urlImportService.js` parses URLs, resolves metadata per platform, and applies matching rules.
- `server/services/urlImportRunner.js` executes background jobs and persists tracks into playlists. Reuses drafts from the same `draft_session_id` via `findDraftBySessionId` (guarded by `target_playlist_id IS NULL`) before creating new playlists.
- `server/api/url-import.js` exposes the API routes. Dedupes incoming jobs via `findRecentImportJob` (30s window composite key). Validates `draft_session_id` in Joi schema and passes it through to job rows.
- `server/database/db.js` creates and queries `url_import_jobs`. Includes `findRecentImportJob` and `findDraftBySessionId` query helpers.

Frontend (curator)
- `src/modules/curator/components/CuratorPlaylistCreate.jsx` adds a “Paste URL” import tab for playlist creation. Uses `draftPromiseRef` lock pattern on `ensureDraft()` to prevent concurrent callers from creating duplicate drafts. Generates a `draftSessionIdRef` UUID on mount, passed to the url-import API when no playlist ID exists.
- `src/modules/curator/components/CuratorPlaylists.jsx` adds a “Paste URL” import tab for playlist editing.
- `src/modules/curator/components/ImportModal.jsx` uses a staged flow (input -> previewing -> preview -> importing -> result) for URL imports. Fetches playlist preview from `/api/v1/url-import/test-playlist`, shows summary card with title/track count/platform icon and collapsible track list (first 10 tracks), and requires explicit confirmation before importing. Auto-import for playlist URLs has been removed (single track auto-resolve preserved). Supports merge mode selection (append vs replace).

Frontend (track tools)
- `src/modules/admin/components/TrackList.jsx` uses the unified resolver for “Import from URL”.
- `src/modules/top10/components/ManualTrackEntry.jsx` uses the unified resolver for “resolve url”.

## Existing URL import endpoints

These remain available and are still used by other parts of the codebase:
- `POST /api/v1/spotify/import-url` (Spotify public playlist import)
- `POST /api/v1/soundcloud/import` and `POST /api/v1/soundcloud/resolve`
- `POST /api/v1/qobuz/import` (legacy Qobuz playlist import)
- `POST /api/v1/bandcamp/resolve` (Bandcamp track resolve)

