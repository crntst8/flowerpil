# TIDAL Integration

Flowerpil integrates with TIDAL's OpenAPI v2 for track searching, playlist export, and cross-platform linking.

## Service Location

**Core service**: `server/services/tidalService.js`

The `TidalService` class handles all TIDAL API interactions including OAuth authentication, track searches, and playlist exports.

## Authentication

### Client Credentials (Search)

TIDAL OpenAPI v2 requires OAuth 2.0 client credentials for non-user operations like track searches.

```javascript
getAccessToken()  // Returns cached or fresh access token
```

**Implementation**:
- Token endpoint: `https://auth.tidal.com/v1/oauth2/token`
- Grant type: `client_credentials`
- Credentials: Basic auth with `TIDAL_CLIENT_ID` and `TIDAL_CLIENT_SECRET`
- Token caching: Stored in-memory with 1-minute buffer before expiry
- Location: `tidalService.js:89-131`

### User OAuth (Export)

Playlist export requires user authorization via OAuth 2.1 with PKCE.

```javascript
getAuthURL(state, useExportRedirect)  // Generate authorization URL
getUserAccessToken(code, codeVerifier, useExportRedirect)  // Exchange code for token
refreshAccessToken(refreshToken)  // Refresh expired token
```

**PKCE Flow**:
1. Generate code verifier (32 random bytes, base64url)
2. Create code challenge (SHA256 hash of verifier, base64url)
3. User authorizes with challenge
4. Exchange code with verifier for access token

**Scopes requested**: `user.read`, `playlists.read`, `playlists.write`, `search.read`

**Token storage**: Curator-specific DSP tokens table with encrypted refresh tokens
**Location**: `tidalService.js:617-801`

## Track Search

### ISRC Search (Primary)

ISRC lookups provide highest accuracy for track matching.

```javascript
searchByISRC(isrc)
```

**Endpoint**: `GET /tracks?filter[isrc]=XXXX&include=artists,albums&countryCode=AU`

**Process**:
1. Normalize ISRC (uppercase, remove non-alphanumeric)
2. Validate length (10-12 characters)
3. Try exact ISRC, then zero-padded variant if <12 chars
4. Parse JSON:API response with included artist/album resources
5. Return first match with 100% confidence

**Location**: `tidalService.js:235-285`

### Metadata Search (Fallback)

**IMPORTANT**: Tidal OpenAPI v2 does NOT support metadata/text search. The `/search` endpoint does not exist in the API specification. Only ISRC-based filtering is available via the `/tracks` endpoint.

```javascript
searchByMetadata(artist, title, options)
```

**Status**: Not supported - returns `null` immediately

**Limitation**: Tidal's OpenAPI v2 only supports filtering tracks by:
- `filter[isrc]` - ISRC code (used by `searchByISRC`)
- `filter[id]` - Track ID
- `filter[owners.id]` - User ID

There is no query-based search functionality available with client credentials. This means Tidal cross-linking will only succeed for tracks with valid ISRC codes.

**Location**: `tidalService.js:353-356`

### Unified Search

The `searchByTrack` method orchestrates the two-stage search strategy.

```javascript
searchByTrack(track)
```

**Flow**:
1. Rate limit delay (100ms)
2. Try ISRC search if `track.isrc` exists
3. Fall back to metadata search if ISRC fails
4. Return null if both strategies fail
5. Propagate 429 errors (rate limiting)

**Location**: `tidalService.js:452-497`

## API Request Handling

### makeRequest (Client Credentials)

All client credential API calls use this method.

**Features**:
- Automatic token refresh when expired
- Retry logic for 429/503/504 errors
- Exponential backoff with max 8s delay
- Honors `Retry-After` header
- 4 max attempts for retryable errors

**Location**: `tidalService.js:136-230`

### makeUserRequest (User Token)

User-authenticated API calls (playlist operations).

**Features**:
- JSON:API content type headers
- Empty response handling for POST operations
- 5 max attempts for retryable errors
- Same retry logic as `makeRequest`

**Location**: `tidalService.js:811-920`

## Playlist Export

### Create Playlist

```javascript
createPlaylist(userAccessToken, playlistData)
```

**Endpoint**: `POST /playlists`

**Payload**:
```json
{
  "data": {
    "type": "playlists",
    "attributes": {
      "name": "Playlist Title",
      "description": "Description\n\nExported from Flowerpil",
      "accessType": "PUBLIC"  // or "UNLISTED"
    }
  }
}
```

**Returns**: `{ id, url, name }`
**Location**: `tidalService.js:928-967`

### Add Tracks

```javascript
addTracksToPlaylist(userAccessToken, playlistId, tidalIds)
```

**Endpoint**: `POST /playlists/{id}/relationships/items`

**Batching**: TIDAL API limit is 20 tracks per request. Tracks are split into batches with 100ms delay between batches.

**Payload structure**:
```json
{
  "data": [
    { "type": "tracks", "id": "123456" },
    { "type": "tracks", "id": "789012" }
  ]
}
```

**Location**: `tidalService.js:976-1024`

### Full Export

```javascript
exportPlaylist(userAccessToken, playlistData, tracks)
```

**Process**:
1. Create empty playlist
2. Filter tracks with `tidal_id` or extractable `tidal_url`
3. Extract TIDAL IDs from URLs if needed (regex: `/track/(\d+)/`)
4. Add tracks in batches
5. Return export result with coverage stats

**Coverage calculation**: `tracksAdded / totalTracks`
**Location**: `tidalService.js:1085-1145`

## Data Structures

### Track Search Result

```javascript
{
  id: "123456",                    // TIDAL track ID
  url: "https://tidal.com/browse/track/123456",
  title: "Track Title",
  artist: "Artist Name",
  album: "Album Name",
  confidence: 100,                 // 0-100 score
  source: "isrc",                  // "isrc" or "metadata"
  isrc: "USUM71907597",
  duration: 180,                   // Seconds
  releaseDate: "2019-03-29"
}
```

### Export Result

```javascript
{
  platform: "tidal",
  playlistUrl: "https://tidal.com/browse/playlist/...",
  playlistId: "abc-123",
  playlistName: "My Playlist",
  tracksAdded: 45,
  totalTracks: 50,
  coverage: 0.9,                   // 90%
  success: true,
  missingTracks: 5
}
```

## Rate Limiting

**Default delay**: 100ms between requests (10 req/sec)
**Retry strategy**: Exponential backoff starting at 500ms, capped at 8s
**Honors**: `Retry-After` header from TIDAL API

## Error Handling

### Retryable Errors

HTTP 429, 503, 504 trigger automatic retries with exponential backoff.

### Non-Retryable Errors

All other errors thrown immediately with detailed message including status code.

### Token Errors

- `REFRESH_TOKEN_INVALID`: Refresh token revoked or expired (requires re-auth)
- Missing credentials: Environment variables not set

## URL Validation

```javascript
validateTidalUrl(url)      // Returns boolean
extractTrackId(url)        // Returns track ID or null
```

**Valid format**: `https://tidal.com/browse/track/{id}`
**Location**: `tidalService.js:502-519`

## Country Code

Default country code is `AU` (Australia). Automatically appended to all API requests as required by TIDAL API.

**Configuration**: `this.countryCode = 'AU'` in constructor

## JSON:API Response Parsing

TIDAL uses JSON:API format with included resources.

**Helper method**:
```javascript
findIncludedResource(included, type, id)
```

**Purpose**: Resolve relationships (e.g., artist/album from track response)
**Location**: `tidalService.js:561-569`

## Environment Variables

**Required**:
- `TIDAL_CLIENT_ID`: OAuth client ID
- `TIDAL_CLIENT_SECRET`: OAuth client secret

**Optional**:
- `TIDAL_REDIRECT_URI`: OAuth redirect (defaults to `https://flowerpil.io/auth/tidal/callback`)
- `TIDAL_EXPORT_REDIRECT_URI`: Export OAuth redirect (defaults to `https://flowerpil.io/auth/tidal/export/callback`)

## Singleton Export

```javascript
import tidalService from './services/tidalService.js';
import { searchTidalByTrack } from './services/tidalService.js';
```

**Exported functions**: `searchTidalByTrack`, `searchTidalByISRC`, `searchTidalByMetadata`, `testTidalConnection`, `validateTidalUrl`, `getTidalTrackById`, `getTidalPlaylistTrackIds`

## Integration Points

**Playlist transfers**: `server/services/playlistTransferRunner.js` uses `searchTidalByTrack` for cross-platform matching

**Playlist exports**: `server/services/playlistExportRunner.js` uses export methods for curator DSP exports

**Track linking**: `server/services/linkResolverService.js` fetches track details by ID
