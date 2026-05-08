# Quick Import (`/go`)

Quick Import lets anyone paste a playlist or track URL and instantly see cross-platform links without an account. Anonymous users get an ephemeral preview (no database writes). Authenticated curators get a "Save as draft" button that feeds into the existing URL import job pipeline.

## Why a Separate Route

The existing `/api/v1/url-import/test-playlist` endpoint sits behind `authMiddleware` at the file level -- every route in `server/api/url-import.js` requires authentication. Rather than conditionally bypassing auth on specific endpoints, Quick Import uses its own route file with `optionalAuth` middleware.

## Backend

### Route: `server/api/quick-import.js`

Single endpoint: `POST /api/v1/quick-import/resolve`

Middleware: `optionalAuth` -- attaches `req.user` if a valid token is present, does not block anonymous requests.

Input validation uses Joi:

```javascript
const resolveSchema = Joi.object({
  url: Joi.string().trim().min(5).required()
});
```

### Resolution Flow

1. `detectUrlTarget(url)` from `server/services/urlImportService.js` identifies the platform and content kind (`track` or `playlist`).
2. **Single track**: calls `resolveTrackFromUrl(url, { match: true })`, then `crossLinkTrack()` for remaining platforms.
3. **Playlist**: calls `resolvePlaylistFromUrl(url, { match: false })`, caps at 50 tracks, then runs `crossLinkTrack()` on each track in parallel via `Promise.all()`.

### `crossLinkTrack(track, spotifyService)`

Defined at line 17 of `server/api/quick-import.js`. Fills each missing platform independently, unlike `enrichWithPreferredDspMatch` in `urlImportService.js` which short-circuits once any DSP ID exists.

For each missing platform:

- **Spotify** (`!out.spotify_id`): tries `spotifyService.searchByISRC(isrc)`, falls back to `spotifyService.searchByMetadata(artist, title)`. Uses `SpotifyService` from `server/services/spotifyService.js`.
- **TIDAL** (`!out.tidal_id`): calls `searchTidalByTrack({ title, artist, album, duration, isrc })` from `server/services/tidalService.js`.
- **Apple Music** (`!out.apple_id`): calls `searchAppleMusicByTrack({ title, artist, album, duration, isrc })` from `server/services/appleMusicService.js`.

Each lookup is wrapped in a try/catch that silently swallows failures -- a missing platform link is acceptable, a thrown error should not break the response.

### Response Shape

**Track:**
```json
{
  "success": true,
  "data": {
    "kind": "track",
    "platform": "spotify",
    "url": "https://open.spotify.com/track/abc",
    "track": { "title": "...", "artist": "...", "spotify_id": "...", "tidal_id": "...", "apple_id": "..." },
    "stats": { "totalTimeMs": 1234 }
  }
}
```

**Playlist:**
```json
{
  "success": true,
  "data": {
    "kind": "playlist",
    "platform": "spotify",
    "url": "https://open.spotify.com/playlist/xyz",
    "playlist": { "title": "...", "description": "...", "image": "...", "trackCount": 12 },
    "tracks": [{ "position": 1, "title": "...", "spotify_id": "...", "tidal_id": "...", "apple_id": "...", "artwork_url": "..." }],
    "stats": { "totalTimeMs": 5678 }
  }
}
```

Tracks are spread as full objects (`...t`) in the response, not whitelist-filtered. This preserves all fields that `ExpandableTrack` needs (`artwork_url`, `album_artwork_url`, `spotify_id`, `tidal_id`, `apple_id`, DSP URLs).

### Rate Limiting

`quickImportLimiter` in `server/middleware/rateLimiting.js` (line 285):

| Environment | Max requests | Window |
|---|---|---|
| Production | 10 | 15 minutes |
| Development | 30 | 15 minutes |
| Test | 10000 | 15 minutes |

Uses `ipKeyGenerator` for key extraction. Logs `QUICK_IMPORT` security event on 429 via `logSecurityEvent`.

### Route Mounting

In `server/index.js`:

```javascript
import quickImportRoutes from './api/quick-import.js';
app.use('/api/v1/quick-import', quickImportLimiter, quickImportRoutes);
```

Mounted before the url-import routes.

## Frontend

### Page: `src/pages/QuickImportPage.jsx`

Routed at `/go` in `src/App.jsx`. Three-state page component: idle, loading, result (plus error).

### State Machine

| State | Trigger | Display |
|---|---|---|
| `idle` | Initial load, or reset | Logo, tagline, URL input, "go" button |
| `loading` | Form submit or auto-resolve | Breathing flower animation, cycling text |
| `result` | Successful API response | Header, track list with DSP links |
| `error` | API failure | Error message, retry button |

### Idle State

- Full-height centered layout with black background
- `/text.png` wordmark logo (inverted white via CSS `filter: brightness(0) invert(1)`)
- Tagline: "paste the link for a playlist or song / get the links for everywhere else" in `theme.fonts.primary`
- URL text input (transparent background, white text, glass border effect)
- "go" button (white background, black text, Paper Mono uppercase)
- Footer link: "discover playlists & curators" pointing to `/home`
- All elements use staggered `fadeUp` entrance animations

### Loading State

- `/logo-nobg.png` flower logo with `breathe` keyframe animation:
  ```
  0%, 100% { transform: scale(1); opacity: 0.7; }
  50% { transform: scale(1.06); opacity: 1; }
  ```
  Period: 3 seconds, ease-in-out, infinite loop.
- Cycling text via `useEffect`/`setInterval` (2.5s interval): "importing...", "cross-linking...", "almost there..."

### Result State

- `ResultTopZone` (black background) contains `ReusableHeader` and an auth-aware banner
- **Anonymous users**: CTA banner with "to save, share & export playlists, create a (free) account" linking to `/signup`
- **Authenticated curators** (`isAuthenticated && user?.role === 'curator'`): "save as draft" button
- Playlist metadata: title, "Imported from [Platform]" with `PlatformIcon`, track count
- Playlist image if available
- Track list using `ExpandableTrack` components

### URL Query Param Handling

On mount, reads `?url=` from `useSearchParams()`. If present, auto-triggers `resolveUrl()` (guarded by `hasAutoResolved` ref to prevent double-fire). After resolution, updates the URL bar via `window.history.replaceState()` so the page is bookmarkable and shareable. `/go?url=https://open.spotify.com/track/abc` is a valid share link.

### Save-to-Draft Flow

`handleSaveToDraft()` (line 101):

1. Sets `savingToDraft: true`
2. Creates import job: `authenticatedFetch('/api/v1/url-import/jobs', { method: 'POST', body: { url } })`
3. Polls `GET /api/v1/url-import/jobs/${jobId}` every 2 seconds (up to 60 iterations)
4. On `status === 'completed'`: navigates to `/curator/playlist/edit/${playlistId}`
5. Shows loading state on button during save

This reuses the existing URL import job pipeline -- the same backend that powers the curator import modal.

### `ExpandableTrack` Compatibility

Ephemeral tracks have no database `id`. Graceful behavior:

- `handleCopyTrack` returns early when `!track?.id` -- pass `showCopyButton={false}`
- `PreviewButton` falls back to `artist + title` search when no `id` -- audio preview works
- DSP link buttons read `track.spotify_url`, `track.apple_music_url`, `track.tidal_url` directly -- works because `crossLinkTrack` populates these
- Save-to-list requires `track.id` -- not available for anonymous, expected
- Analytics calls use `track?.id || ''` -- graceful

## Navigation

`src/modules/home/components/AccordionMenu.jsx` includes "QUICK IMPORT" in the EXPLORE section, linking to `/go`. Since `AccordionMenu` is used by both `ReusableHeader` and `LandingHeader`, the link appears on all pages.

## Logging

All log entries use the `QUICK_IMPORT` tag via `server/utils/logger.js`:

- `logger.info('QUICK_IMPORT', 'Resolved single track', { platform, url, totalTimeMs, userId })`
- `logger.info('QUICK_IMPORT', 'Resolved playlist', { platform, url, trackCount, totalTimeMs, userId })`
- `logger.error('QUICK_IMPORT', 'Resolution failed', { url, platform, error, userId })`

`userId` is `req.user?.id || null` -- null for anonymous requests.

## Tests

`server/api/__tests__/quick-import.test.js` -- 11 tests covering:

- Validation: missing URL, short URL, unsupported URL format
- Track resolution: Spotify track, TIDAL track
- Playlist resolution: Spotify playlist with cross-linking verification, Apple Music playlist cross-linking
- Response shape: position and core fields present
- Error handling: service throws on playlist resolve, service throws on track resolve
- Anonymous access: works without authentication headers

Mocks `urlImportService`, `spotifyService`, `tidalService` (`searchTidalByTrack`), and `appleMusicService` (`searchAppleMusicByTrack`). Uses `createTestApp()` from `tests/utils/testApp.js` with supertest.

## Reused Services

No new service code. Quick Import composes existing functions:

| Function | Source |
|---|---|
| `detectUrlTarget(url)` | `server/services/urlImportService.js` |
| `resolveTrackFromUrl(url, opts)` | `server/services/urlImportService.js` |
| `resolvePlaylistFromUrl(url, opts)` | `server/services/urlImportService.js` |
| `SpotifyService.searchByISRC(isrc)` | `server/services/spotifyService.js` |
| `SpotifyService.searchByMetadata(artist, title)` | `server/services/spotifyService.js` |
| `searchTidalByTrack(params)` | `server/services/tidalService.js` |
| `searchAppleMusicByTrack(params)` | `server/services/appleMusicService.js` |

## Files

| File | Role |
|---|---|
| `server/api/quick-import.js` | API route with `/resolve` endpoint and `crossLinkTrack()` |
| `server/middleware/rateLimiting.js` | `quickImportLimiter` export |
| `server/index.js` | Route mounting |
| `src/pages/QuickImportPage.jsx` | Frontend page component |
| `src/App.jsx` | `/go` route |
| `src/modules/home/components/AccordionMenu.jsx` | Sidebar nav entry |
| `server/api/__tests__/quick-import.test.js` | Backend tests |
