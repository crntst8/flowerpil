# YouTube Music Integration

YouTube Music integration uses a Python Flask microservice running on port 3001 that wraps the `ytmusicapi` library. The Node.js backend communicates with this service via HTTP.

## Architecture

```
Frontend                    Node.js Backend              Python Microservice
─────────                   ───────────────              ───────────────────
CuratorDSPConnections  ──►  /api/v1/youtube-music/*  ──►  Flask :3001
ImportModal            ──►  youtubeMusicService.js   ──►  ytmusicapi
ExportModal            ──►  playlistExportRunner.js  ──►
ExpandableTrack            linking-worker.js
```

## Database Schema

Migration `070_youtube_music_integration.js` adds:

**tracks table:**
- `youtube_music_id` - YouTube video ID (e.g., `dQw4w9WgXcQ`)
- `youtube_music_url` - Full URL to track
- `match_confidence_youtube` - Match confidence score (0-100)
- `match_source_youtube` - How the match was found (`search`, `isrc`, `import`)

**playlists table:**
- `youtube_music_url` - Source playlist URL (for imports)
- `exported_youtube_music_url` - URL of exported playlist

**Indexes:**
- `idx_tracks_youtube_music_id`
- `idx_tracks_match_confidence_youtube`

## Node.js Service Layer

`/server/services/youtubeMusicService.js` provides the HTTP client with circuit breaker pattern.

### Authentication Methods
- `startDeviceAuth()` - Returns `{ deviceCode, userCode, verificationUrl }`
- `pollDeviceAuth(deviceCode)` - Returns `{ status: 'pending'|'success', oauthData }`
- `refreshToken(oauthJson)` - Refreshes expired token
- `validateToken(oauthJson)` - Tests token validity

### Playlist Methods
- `getUserPlaylists(oauthJson)` - Lists user's library playlists
- `getPlaylistTracks(playlistId, oauthJson)` - Gets tracks from playlist
- `importPlaylistByUrl(url)` - Imports from public URL (no auth)
- `createPlaylist(oauthJson, playlistData, tracks)` - Creates and populates playlist
- `exportPlaylist(oauthJson, playlistData, tracks)` - Full export flow

### Search Methods
- `searchTrack(track)` - Single track search
- `searchTracksBatch(tracks)` - Batch search
- `searchByTrack(track)` - Alias for linking worker

## API Routes

`/server/api/youtube-music.js` exposes:

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/auth/device` | POST | Yes | Start device code flow |
| `/auth/poll` | POST | Yes | Poll for token completion |
| `/auth/status` | GET | Yes | Check connection status |
| `/auth/disconnect` | DELETE | Yes | Remove stored token |
| `/playlists` | GET | Yes | List user playlists |
| `/import-url` | POST | Yes | Import from public URL |
| `/import/:playlistId` | POST | Yes | Import from library |
| `/health` | GET | No | Service health check |

Tokens are stored in `export_oauth_tokens` with:
- `platform`: `youtube_music`
- `access_token`: JSON stringified oauth_data blob
- `account_type`: `curator` or `flowerpil`

## Export Integration

`playlistExportRunner.js` handles the `youtube_music` case:
```javascript
} else if (platform === 'youtube_music') {
  const oauthJson = JSON.parse(oauthToken.access_token);
  result = await youtubeMusicService.exportPlaylist(oauthJson, playlistData, tracks);
}
```

`ExportValidationService.js` checks track readiness:
```javascript
} else if (platform === 'youtube_music') {
  readyTracks = tracks.filter(track =>
    track.youtube_music_id || track.youtube_music_url
  );
}
```

## Cross-Platform Linking

`linking-worker.js` includes YouTube Music in its search pool:
```javascript
const pending = new Set(['apple', 'tidal', 'spotify', 'youtube']);
// ...
youtubePool.submit(async () => {
  const yt = await searchYouTubeMusicByTrack(t);
  if (yt?.videoId) {
    partial.youtube = { id: yt.videoId, url: yt.url, confidence: yt.confidence };
  }
});
```

`crossPlatformLinkingService.js` provides:
```javascript
updateTrackYouTubeLink(trackId, result)
// Updates youtube_music_id, youtube_music_url, match_confidence_youtube, match_source_youtube
```

## Frontend Components

### CuratorDSPConnections
- YouTube Music card with device code auth flow
- Modal displays `userCode` and `verificationUrl` for user to complete at google.com/device
- Polls `/auth/poll` every 5 seconds until success or timeout

### ImportModal
- YouTube Music tab for URL paste import
- Accepts `music.youtube.com/playlist?list=...` and `youtube.com/playlist?list=...` formats

### ExportModal (Disabled)
YouTube Music export is disabled for curators in `CuratorPlaylistCreate.jsx`. The platform is excluded from:
- `exportChoices` state initialization
- `accountTypes` state
- `selected` platforms filter in the export handler
- `PlatformDestinationsGrid` platform map

**Reason:** Export to YouTube Music via curator accounts is restricted by API limitations. The integration remains active for:
- Cross-platform linking (automatic track matching via `linking-worker.js`)
- Playlist import from YouTube Music URLs
- Display of YouTube Music links on published playlists

Admin export via `AdminDSPExport` or direct API calls is still possible with authorized Flowerpil tokens.

### ExpandableTrack
- YouTube Music streaming button when `youtube_music_url` or `youtube_music_id` exists
- Uses existing `/assets/playlist-actions/youtube.png` icon

## Python Microservice

Located at `/server/python-services/ytmusic/`.

### Dependencies

`requirements.txt` specifies:
- ytmusicapi>=1.8.0
- flask>=3.0.0
- gunicorn>=21.0.0

### Flask Application

`app.py` defines the HTTP API with the following endpoints:

| Route | Method | Auth Required | Purpose |
|-------|--------|---------------|---------|
| `/health` | GET | No | Returns service health status |
| `/auth/device-code` | POST | No | Initiates OAuth device flow |
| `/auth/poll` | POST | No | Polls for token after user enters code |
| `/auth/refresh` | POST | Yes | Refreshes expired access token |
| `/auth/validate` | POST | Yes | Validates token with test API call |
| `/playlists` | GET | Yes | Lists user's library playlists |
| `/playlist/<id>` | GET | Optional | Gets playlist tracks |
| `/playlist/import-url` | POST | No | Imports from public playlist URL |
| `/playlist/create` | POST | Yes | Creates playlist and adds tracks |
| `/playlist/<id>/tracks` | POST | Yes | Adds tracks to existing playlist |
| `/search/track` | POST | No | Searches by ISRC or metadata |
| `/search/batch` | POST | No | Batch searches multiple tracks |

Authentication passes via `X-OAuth-Json` header containing base64-encoded OAuth JSON blob.

### Authentication Service

`services/auth.py` implements Google's TV/Device OAuth flow.

`start_device_flow()` calls Google's device authorization endpoint and returns a `user_code` for the user to enter at `google.com/device`, plus a `device_code` for polling.

`poll_for_token(device_code)` polls Google's token endpoint. Returns `{'status': 'pending'}` while waiting, or `{'status': 'success', 'oauth_data': {...}}` when the user completes authorization.

`get_ytmusic_client(oauth_json)` creates an authenticated `YTMusic` instance. Checks token expiration and calls `refresh_token()` if needed (5-minute buffer before expiry).

`get_unauthenticated_client()` creates a `YTMusic` instance without auth for public playlist fetching and search.

### Search Service

`services/search.py` handles track matching.

`search_track(query_data, oauth_json)` searches for a track. Accepts a dict with `isrc`, `artist`, `title`, `album`, `duration_ms`. Tries ISRC search first (YouTube Music may match ISRC in metadata), then falls back to artist+title metadata search. Scores candidates using `utils/matching.py` and returns the best match above 70 confidence.

Returns:
```python
{
    'videoId': 'dQw4w9WgXcQ',
    'confidence': 85,
    'source': 'metadata_search',  # or 'isrc_search'
    'title': 'Never Gonna Give You Up',
    'artist': 'Rick Astley',
    'album': 'Whenever You Need Somebody'
}
```

`search_tracks_batch(tracks, oauth_json)` processes multiple tracks sequentially, returning results in input order.

### Playlist Service

`services/playlist.py` handles playlist operations.

`get_user_playlists(oauth_json)` calls `ytmusic.get_library_playlists()` and returns a simplified list with `id`, `title`, `trackCount`, `thumbnail`.

`get_playlist_tracks(playlist_id, oauth_json)` fetches all tracks from a playlist. Parses duration strings ("3:45") to milliseconds. Returns:
```python
{
    'playlist': {'id', 'title', 'description', 'image', 'trackCount', 'author'},
    'tracks': [{'position', 'title', 'artist', 'album', 'duration_ms', 'youtube_music_id', 'artwork_url'}, ...]
}
```

`import_playlist_by_url(url)` parses the URL using `utils/url_parser.py` and calls `get_playlist_tracks()` with no auth (public playlists only).

`create_playlist(oauth_json, playlist_data, tracks)` creates a new playlist via `ytmusic.create_playlist()`, then searches for and adds tracks. Tracks with `youtube_music_id` are added directly; others are searched by metadata. Adds tracks in batches of 25 (YouTube Music API limit).

### URL Parser

`utils/url_parser.py` handles YouTube Music URL formats.

`parse_youtube_music_url(url)` extracts playlist IDs from:
- `https://music.youtube.com/playlist?list=PLxxxxxx`
- `https://www.youtube.com/playlist?list=PLxxxxxx`
- `https://music.youtube.com/browse/VLxxxxxx`

Returns `{'type': 'playlist', 'id': 'PLxxxxxx'}` or `None` for invalid URLs.

### Matching Utilities

`utils/matching.py` provides confidence scoring for track matches.

`normalize_string(s)` lowercases, removes diacritics, strips parenthetical suffixes like "(Remaster)", "(Remix)", "(Live)", and normalizes whitespace.

`calculate_match_score(result, query_data)` computes a 0-100 score:
- Title match: 0-40 points (exact match = 40, partial word overlap scaled)
- Artist match: 0-35 points (checks all result artists against query)
- Album match: 0-15 points
- Duration match: 0-10 points (within 5s = 10, within 10s = 7, within 20s = 4)

`is_good_match(result, query_data, threshold=70)` returns true if score meets threshold.

`get_best_thumbnail(thumbnails)` selects the highest resolution thumbnail by width*height.

## Environment Variables

Node.js backend:
- `YTMUSIC_API_BASE` - Microservice URL (default `http://127.0.0.1:3001`)
- `YTMUSIC_SERVICE_PORT` - Port for microservice (default `3001`)
- `YTMUSIC_TIMEOUT_MS` - Request timeout (default 30000)
- `YTMUSIC_CB_THRESHOLD` - Circuit breaker failure threshold (default 10)

Python microservice:
- `YOUTUBE_CLIENT_ID` - Google OAuth client ID
- `YOUTUBE_CLIENT_SECRET` - Google OAuth client secret
- `YTMUSIC_SERVICE_PORT` - Port to bind (default 3001)
- `FLASK_ENV` - Set to 'development' for debug mode

## Running the Service

Development:
```bash
cd server/python-services/ytmusic
pip install -r requirements.txt
python app.py
```

Production (via PM2 in `ecosystem.config.cjs`):
```javascript
{
  name: 'flowerpil-ytmusic-service',
  script: 'gunicorn',
  args: '-w 2 -b 127.0.0.1:3001 app:app',
  cwd: './server/python-services/ytmusic',
  interpreter: 'none',
  autorestart: true,
  env: {
    YOUTUBE_CLIENT_ID: '...',
    YOUTUBE_CLIENT_SECRET: '...'
  }
}
```

## Key Differences from Other DSPs

| Aspect | Spotify/TIDAL/Apple | YouTube Music |
|--------|---------------------|---------------|
| Implementation | Pure Node.js | Python microservice bridge |
| OAuth Flow | Web redirect | TV/Device code flow |
| Token Storage | Standard access_token | JSON blob in access_token field |
| ISRC Support | Official API support | Metadata search only |
| Rate Limiting | Distributed limiter | Handled by microservice |
