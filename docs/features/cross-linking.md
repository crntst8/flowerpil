# Cross-Linking

Cross-linking matches tracks across music streaming platforms (Apple Music, Tidal, Spotify) to enable multi-platform playlist exports. When a curator creates a playlist on Flowerpil, the system links each track to its equivalent on other DSPs so listeners can open the playlist on their preferred service.

## Architecture

The cross-linking system orchestrates multiple DSP search services through a central service that manages job queues, rate limiting, and progress tracking.

### Core Components

**`server/services/crossPlatformLinkingService.js`**

The main orchestration service that coordinates all cross-platform linking operations. Exports a singleton `crossPlatformLinkingService` that manages job queues, tracks progress, and handles concurrent processing with rate limiting.

Key methods:
- `startPlaylistLinking(playlistId, options)` - Creates and queues a linking job for all tracks in a playlist
- `linkTrack(trackId, options)` - Links a single track across all platforms
- `getJobStatus(jobId)` - Returns current status and progress of a linking job
- `getPlaylistLinkingStats(playlistId)` - Returns coverage statistics for a playlist

**`server/services/appleMusicService.js`**

Wrapper service that delegates to `appleMusicApiService` for API-based search. Provides the `searchAppleMusicByTrack(track, options)` function used by the cross-linking service.

**`server/services/appleMusicApiService.js`**

Implements Apple Music catalog search using the official Apple Music API. Handles developer token generation, multi-storefront search, and sophisticated scoring logic.

**`server/services/tidalService.js`**

Handles Tidal track search and matching.

**`server/services/spotifyService.js`**

Handles Spotify track search and ID resolution.

## Search Strategy

Cross-linking uses a prioritized, multi-strategy approach to find matches with the highest confidence.

### Apple Music Search Flow

The `searchCatalogTrack()` method in `appleMusicApiService.js` implements a comprehensive search strategy:

1. **Primary Storefront Search** - Searches in the user's primary storefront (from OAuth token or environment variable)
2. **ISRC Lookup** - If track has an ISRC, searches using `searchCatalogByISRC()` for exact match
3. **Metadata Search** - Tries multiple search term variations via `buildSearchAttempts()`:
   - Combined (artist + title + album)
   - Base (artist + title)
   - Stripped (removes version/remix tokens from title)
   - Album-focused (reorders terms to prioritize album)
   - Tidal-guided (uses Tidal metadata if available)
4. **Compilation Override** - If best match is a compilation album, attempts to find preferred album version
5. **Album Rescue Fallback** - If no match or low confidence, searches albums and examines tracks:
   - Searches for albums matching artist + album name
   - Fetches tracks from up to 7 albums (MAX_ALBUM_LOOKUPS)
   - Scores each track against the search target
6. **Multi-Storefront Fallback** - If primary storefront yields no results above threshold, tries alternative storefronts in priority order (AU, US, GB, CA)

### Search Parameters

Defined at the top of `appleMusicApiService.js`:

```javascript
const CONFIDENCE_THRESHOLD = 70        // Minimum score to accept match
const SECONDARY_THRESHOLD = 60         // Lower threshold for album rescue
const MAX_METADATA_RESULTS = 30        // Results examined per search
const MAX_ALBUM_LOOKUPS = 7            // Albums checked in rescue fallback
const MAX_ALBUM_TRACKS = 100           // Tracks fetched per album
const COMPILATION_OVERRIDE_DELTA = 8   // Score difference allowing override
```

### Search Term Generation

The `buildSearchAttempts()` method creates multiple search variations to maximize match probability:

```javascript
// Example for track: { artist: "Horsegirl", title: "Switch Over", album: "Versions of Modern Performance" }

[
  { term: "Horsegirl Switch Over Versions of Modern Performance", label: "combined" },
  { term: "Horsegirl Switch Over", label: "base" },
  { term: "Switch Over Versions of Modern Performance Horsegirl", label: "album_focus" }
]
```

When Tidal guidance exists (from a previously matched Tidal track), additional attempts incorporate Tidal metadata.

## Scoring System

The scoring system evaluates match quality across multiple factors with weighted contributions. Implementation lives in `server/services/apple-music/scoring.js`.

### Weights

```javascript
const DEFAULT_WEIGHTS = {
  isrc: 40,     // ISRC match (exact identifier)
  title: 25,    // Title similarity
  album: 20,    // Album similarity
  artist: 10,   // Artist similarity
  duration: 5   // Duration proximity
}
```

### Scoring Logic

The `scoreAppleCandidate()` function computes a confidence score from 0-100:

1. **ISRC Factor** - Binary (1 or 0). Normalized ISRCs must match exactly.
2. **Title Factor** - Levenshtein similarity ratio between normalized titles. Builds multiple title variants (stripped of version tokens, parentheticals removed, hyphen splits).
3. **Album Factor** - Similarity ratio between normalized album names. Generates variants with deluxe/remaster tokens removed.
4. **Artist Factor** - Similarity ratio. Splits on common delimiters (`,`, `&`, `and`, `feat`) to match multi-artist tracks.
5. **Duration Factor** - Distance-based scoring:
   - ≤1.5s difference: 1.0
   - ≤3.5s difference: 0.7
   - ≤6s difference: 0.35
   - ≤9s difference: 0.15
   - >9s difference: 0

Final score: `(isrc_weight × isrc_factor) + (title_weight × title_factor) + ...`

### Text Normalization

All text fields undergo aggressive normalization before comparison:

- NFKD Unicode normalization (decomposes characters)
- Diacritic removal
- Lowercase conversion
- `&` → `and`
- Remove all non-alphanumeric except spaces and hyphens
- Collapse multiple spaces
- Trim whitespace
- Remove featuring credits (`feat.`, `featuring`, `ft.`)
- Strip version tokens (`live`, `remastered`, `demo`, `edit`, `mix`)

Implemented in `normalizeText()` and related helper functions.

### Compilation Detection

The `isCompilationCandidate()` function identifies tracks from compilation albums to avoid false matches:

```javascript
const COMPILATION_KEYWORDS = [
  'soundtrack', 'motion picture', 'original score', 'original cast',
  'various artists', 'compilation', 'anthology', 'greatest hits',
  'karaoke', 'tribute'
]
```

Checks:
- Album `isCompilation` attribute
- Album name contains compilation keywords
- Artist is "Various Artists"

When the best match is a compilation and a non-compilation match from the preferred album exists within COMPILATION_OVERRIDE_DELTA, the system chooses the non-compilation version.

## Storefront Handling

Apple Music content availability varies by region. The system handles this through configurable storefront priority.

### Storefront Resolution

`server/utils/appleStorefront.js` defines storefront resolution logic:

```javascript
const STOREFRONT_PRIORITY = ['au', 'us', 'gb', 'ca'];
```

The `resolveStorefront()` function normalizes storefront codes to two-letter lowercase country codes matching the regex `/^[a-z]{2}$/`.

### Primary Storefront

The cross-linking service determines the primary storefront via `getAppleStorefront()` in `crossPlatformLinkingService.js`:

1. Check cached value (cached for 5 minutes)
2. Query `oauth_tokens` table for most recent Apple Music token
3. Parse `user_info` JSON column for storefront
4. Fall back to `APPLE_MUSIC_STOREFRONT` environment variable
5. Default to `'us'`

### Multi-Storefront Fallback

When `tryMultipleStorefronts: true` (default), the `searchCatalogTrack()` method tries alternative storefronts if the primary search yields no results above threshold. It iterates through `STOREFRONT_PRIORITY`, excluding the primary storefront already tried.

Logs capture which storefront produced the final match:

```javascript
logger.info('APPLE_LINK', 'Found better match in alternative storefront', {
  track: `${baseTrack.artist} - ${baseTrack.title}`,
  primaryStorefront: primaryRegion,
  selectedStorefront: altRegion,
  primaryScore: primaryResult?.score ?? null,
  selectedScore: altResult.score
});
```

### Storefront in Results

All Apple Music match results include a `storefront` field indicating where the match was found. This persists to the database in `match_source_apple` as `source|storefront:XX` format.

The `normalizeAppleResultPayload()` method in `crossPlatformLinkingService.js` ensures consistent storefront tagging:

```javascript
const matchSource = providedMatchSource && providedMatchSource.includes('|storefront:')
  ? providedMatchSource
  : applyStorefrontSuffix(providedMatchSource || sourceBase || 'metadata', normalizedStorefront);
```

## Database Schema

Cross-linking writes results to two tables.

### tracks table

Primary link storage in track records:

```sql
apple_id                  TEXT        -- Apple Music catalog ID
apple_music_url           TEXT        -- Deep link URL
match_confidence_apple    INTEGER     -- Score 0-100
match_source_apple        TEXT        -- Match method (e.g., "api:metadata|storefront:us")
tidal_id                  TEXT        -- Tidal track ID
tidal_url                 TEXT        -- Tidal URL
match_confidence_tidal    INTEGER     -- Score 0-100
match_source_tidal        TEXT        -- Match method
spotify_id                TEXT        -- Spotify track ID
linking_status            TEXT        -- 'completed', 'failed', 'processing'
linking_error             TEXT        -- Error message if failed
linking_updated_at        TIMESTAMP   -- Last linking attempt
flagged_for_review        BOOLEAN     -- Manual review needed
flagged_reason            TEXT        -- Why flagged
manual_override_apple     TEXT        -- Manual override URL
manual_override_tidal     TEXT        -- Manual override URL
```

### cross_links table

Extended metadata storage for each platform link:

```sql
CREATE TABLE cross_links (
  track_id    INTEGER    -- Foreign key to tracks.id
  platform    TEXT       -- 'apple', 'tidal', 'spotify'
  url         TEXT       -- Platform URL
  confidence  INTEGER    -- Match confidence score
  metadata    TEXT       -- JSON with detailed match info
  created_at  TIMESTAMP
  updated_at  TIMESTAMP
  UNIQUE(track_id, platform)
)
```

The `metadata` JSON column stores:

```javascript
{
  id: "1234567890",
  url: "https://music.apple.com/...",
  confidence: 85,
  source: "api:metadata",
  matchSource: "api:metadata|storefront:us",
  matchStrategy: "combined",
  scoreBreakdown: { isrc: 0, title: 25, album: 18, artist: 10, duration: 5 },
  matchFactors: { isrc: 0, title: 1.0, album: 0.9, artist: 1.0, duration: 1.0 },
  matchedPreferredAlbum: true,
  viaGuidance: false,
  rescueReason: null,
  storefront: "us",
  durationMs: 234000,
  isrc: "USRC12345678",
  timestamp: "2025-01-15T10:30:00.000Z"
}
```

### Database Updates

The cross-linking service updates both tables through these methods:

**`updateTrackAppleLink(trackId, result)`**
- Updates `tracks` table with URL, confidence, match source
- Inserts/updates `cross_links` table with full metadata
- Extracts `apple_id` from URL if not provided

**`updateTrackTidalLink(trackId, result)`**
- Updates `tracks` table with Tidal URL, confidence, match source
- Extracts `tidal_id` from URL

**`updateTrackSpotifyId(trackId, result)`**
- Updates `tracks.spotify_id`

**`updateTrackLinkingStatus(trackId, status, error)`**
- Sets `linking_status` and `linking_error`
- Updates `linking_updated_at` timestamp

## Job Queue System

The cross-linking service manages asynchronous batch linking through a job queue with concurrency control.

### Job Creation

`startPlaylistLinking()` creates a job object:

```javascript
{
  id: "playlist_123_1641234567890",
  type: "playlist_linking",
  playlistId: 123,
  tracks: [...],  // Tracks needing linking
  status: "pending",
  progress: {
    total: 50,
    processed: 0,
    found: 0,
    errors: []
  },
  options: {},
  createdAt: Date,
  startedAt: null,
  completedAt: null
}
```

Jobs only include tracks where `linking_status !== 'completed'` unless `options.forceRefresh` is true.

### Job Processing

The `processNextJob()` method implements the queue processor:

1. Checks if processing capacity available (max 2 concurrent jobs)
2. Finds next pending job
3. Sets status to `'processing'` and adds to `processingJobs` Set
4. Calls `processPlaylistLinkingJob()` to link each track
5. Updates progress via event emitter after each track
6. Applies rate limiting delay (150ms) between tracks
7. Sets final status (`'completed'` or `'failed'`)
8. Removes from `processingJobs` Set
9. Triggers next job processing

### Progress Tracking

The service emits events during processing:

```javascript
service.emit('jobStarted', { jobId, job });
service.emit('jobProgress', { jobId, progress, currentTrack });
service.emit('jobCompleted', { jobId, job });
service.emit('jobFailed', { jobId, job, error });
```

Frontend code can listen to these events or poll `getJobStatus(jobId)` which returns:

```javascript
{
  id: "playlist_123_...",
  type: "playlist_linking",
  status: "processing",
  progress: { total: 50, processed: 23, found: 20, errors: [...] },
  createdAt: Date,
  startedAt: Date,
  completedAt: null,
  eta: 54000,  // milliseconds remaining
  eta_seconds: 54
}
```

## API Endpoints

### Start Linking Job

`POST /api/v1/linker/playlists/:playlistId/link`

Handled by `server/api/linker.js`.

Request body (optional):
```json
{
  "forceRefresh": false
}
```

Response:
```json
{
  "success": true,
  "jobId": "playlist_123_1641234567890",
  "status": "queued",
  "tracksToProcess": 45,
  "estimatedTimeSeconds": 90
}
```

### Get Job Status

`GET /api/v1/linker/jobs/:jobId`

Response:
```json
{
  "success": true,
  "job": {
    "id": "playlist_123_1641234567890",
    "status": "processing",
    "progress": {
      "total": 45,
      "processed": 12,
      "found": 10,
      "errors": []
    },
    "eta_seconds": 66
  }
}
```

### Get Playlist Stats

`GET /api/v1/linker/playlists/:playlistId/stats`

Response:
```json
{
  "success": true,
  "stats": {
    "total_tracks": 50,
    "apple_links": 48,
    "tidal_links": 45,
    "spotify_links": 49,
    "with_links": 49,
    "completed": 50,
    "failed": 0,
    "flagged": 1,
    "coverage": 0.98,
    "apple_coverage": 0.96,
    "tidal_coverage": 0.90,
    "spotify_coverage": 0.98,
    "avg_apple_confidence": 87.5,
    "avg_tidal_confidence": 82.3,
    "apple_storefront_counts": { "us": 40, "au": 5, "gb": 3 },
    "apple_rescue_counts": { "low_confidence": 2, "compilation": 1 },
    "apple_guidance_matches": 3,
    "apple_album_alignment_matches": 45
  }
}
```

## Frontend Integration

### CuratorPlaylistCreate Component

After importing tracks (via DSP import, text paste, or Spotify URL), the component triggers cross-linking:

```javascript
await startCrossLinking(playlistId, totalTracks);
```

Defined in `src/modules/curator/components/CuratorPlaylistCreate.jsx` around line 2667:

```javascript
const startCrossLinking = useCallback(async (targetPlaylistId, trackTotal) => {
  const pid = targetPlaylistId || playlist?.id;
  if (!pid) return;

  try {
    const resp = await authenticatedFetch(`/api/v1/linker/playlists/${pid}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const json = await safeJson(resp);
    if (!json.success) throw new Error(json.error);

    const jobId = json.jobId;
    pollLinkingProgress(jobId, trackTotal);
  } catch (err) {
    console.error('Failed to start cross-linking:', err);
  }
}, [playlist?.id, authenticatedFetch, pollLinkingProgress]);
```

### Progress Polling

The `pollLinkingProgress()` function polls job status every 2 seconds:

```javascript
const pollLinkingProgress = useCallback(async (jobId, total) => {
  let attempts = 0;
  const maxAttempts = 150; // 5 minutes max

  const poll = async () => {
    attempts++;
    const resp = await authenticatedFetch(`/api/v1/linker/jobs/${jobId}`);
    const json = await safeJson(resp);

    if (json.success && json.job) {
      const { status, progress } = json.job;

      if (status === 'completed' || status === 'failed') {
        await refreshPlaylist();
        return;
      }

      if (attempts < maxAttempts) {
        setTimeout(poll, 2000);
      }
    }
  };

  poll();
}, [authenticatedFetch, refreshPlaylist]);
```

### ImportProgressOverlay Component

Displays linking progress to users:

```javascript
<ImportProgressOverlay
  phase={importPhase}
  progress={importProgress}
  platform={importPlatform}
  feedback={importFeedback}
/>
```

Shows percentage complete and current phase (`'fetching'`, `'saving'`, `'linking'`).

## Rate Limiting

The cross-linking service implements rate limiting to respect DSP API quotas.

### Delays

Defined in `crossPlatformLinkingService.js`:

```javascript
this.rateLimitDelay = 150; // Base delay between API calls (ms)
```

Applied between:
- Individual track linking operations
- Different DSP searches for the same track
- Job processing loops

### Retry Logic

Tidal searches implement exponential backoff:

```javascript
const tidalRetries = options.tidalRetryAttempts ?? 3;
let tidalAttempt = 0;

while (tidalAttempt < tidalRetries && !results.tidal) {
  tidalAttempt += 1;
  try {
    const tidalResult = await searchTidalByTrack(track);
    if (tidalResult && tidalResult.url) {
      results.tidal = tidalResult;
      break;
    }
  } catch (error) {
    const isRateLimit = error?.status === 429;
    const backoffMs = isRateLimit
      ? Math.max(error.retryAfter ?? 1500, this.rateLimitDelay * Math.pow(2, tidalAttempt))
      : this.rateLimitDelay * Math.pow(2, tidalAttempt - 1);

    if (tidalAttempt >= tidalRetries) break;

    await this.delay(Math.min(backoffMs, 8000));
  }
}
```

## Manual Overrides

Admins can manually set platform links for disputed matches.

### Setting Overrides

`setManualOverride(trackId, platform, url)` in `crossPlatformLinkingService.js`:

```javascript
service.setManualOverride(trackId, 'apple', 'https://music.apple.com/...');
```

Updates:
- Sets URL in tracks table
- Sets `manual_override_apple` to the URL
- Sets `match_source_apple` to `'manual'`
- Sets `match_confidence_apple` to `100`
- Clears `flagged_for_review`
- Sets `linking_status` to `'completed'`

### Flagging for Review

`flagTrackForReview(trackId, reason)` marks tracks requiring manual attention:

```javascript
service.flagTrackForReview(trackId, 'Low confidence match for rare track');
```

Sets `flagged_for_review = TRUE` and stores the reason. Flagged tracks appear in admin review interfaces.

## Configuration

### Environment Variables

**Apple Music API**
```
APPLE_MUSIC_TEAM_ID           # Apple Developer Team ID
APPLE_MUSIC_KEY_ID            # Key ID for API token
APPLE_MUSIC_PRIVATE_KEY       # ES256 private key (PEM format)
APPLE_MUSIC_PRIVATE_KEY_PATH  # Alternative: path to key file
APPLE_MUSIC_TOKEN_TTL_MIN     # Token lifetime (default: 30)
APPLE_MUSIC_STOREFRONT        # Default storefront (default: 'us')
APPLE_MUSIC_API_SEARCH        # Enable API search (default: 'true')
APPLE_MUSIC_HTTP_TIMEOUT_MS   # Request timeout (default: 15000)
```

**Tidal**
```
TIDAL_CLIENT_ID
TIDAL_CLIENT_SECRET
```

**Spotify**
```
SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET
```

### Service Instantiation

All services are singletons exported from their modules:

```javascript
import { crossPlatformLinkingService } from './services/crossPlatformLinkingService.js';
import appleMusicService from './services/appleMusicService.js';
import tidalService from './services/tidalService.js';
```

### Apple Music Developer Token

The `getDeveloperToken()` method in `appleMusicApiService.js` mints ES256 JWT tokens:

```javascript
const token = jwt.sign(
  {
    iss: teamId,
    iat: now,
    exp: now + (tokenTTLMin * 60)
  },
  privateKey,
  {
    algorithm: 'ES256',
    header: { kid: keyId }
  }
);
```

Tokens are generated on-demand for each request (no caching) to ensure validity.

## Metadata Enrichment

The cross-linking service provides methods to enrich track objects with detailed link metadata.

### Loading Metadata

`getLinkMetadataMap(trackIds)` bulk-loads metadata from `cross_links` table:

```javascript
const metadataMap = service.getLinkMetadataMap([123, 456, 789]);
// Returns: Map { 123 => { apple: {...}, tidal: {...} }, ... }
```

### Decorating Tracks

`hydrateTracksWithLinkMetadata(tracks)` adds link details to track objects:

```javascript
const enriched = service.hydrateTracksWithLinkMetadata(tracks);

// Each track gains:
// - apple_storefront
// - match_source_apple_base
// - apple_link_details: {
//     id, url, confidence, source, matchSource, storefront,
//     matchStrategy, scoreBreakdown, matchFactors,
//     matchedPreferredAlbum, viaGuidance, rescueReason,
//     durationMs, isrc, observedAt, metadata
//   }
```

The `buildAppleLinkDetails()` method assembles this detail object from both the `tracks` table columns and the `cross_links.metadata` JSON.

### API Response Normalization

When linking results come from the Apple Music API, `normalizeAppleResultPayload()` ensures consistent formatting:

```javascript
const normalized = service.normalizeAppleResultPayload(rawResult, fallbackStorefront);
```

Adds:
- Normalized storefront code
- Properly formatted `matchSource` with storefront suffix
- Default values for optional fields
- Consistent field names

## Album Rescue Fallback

When metadata search fails or returns low-confidence matches, the album rescue fallback searches albums to find tracks.

### Trigger Conditions

`searchCatalogAlbumForTrack()` activates when:

1. No metadata match found (`fallbackReason = 'no_metadata_match'`)
2. Best match score below threshold (`fallbackReason = 'low_confidence'`)
3. Best match is compilation album (`fallbackReason = 'compilation'`)

### Search Process

1. Search Apple Music catalog for albums: `term = "${artist} ${album}"`
2. Fetch tracks from top N albums (N = MAX_ALBUM_LOOKUPS = 7)
3. Score each track using same scoring logic as metadata search
4. Keep best-scoring track across all albums
5. Return if score meets SECONDARY_THRESHOLD (60)

### Rescue Reason Tracking

Results include `rescueReason` field indicating why rescue was invoked. This persists to `cross_links.metadata.rescueReason`.

Statistics track rescue usage via `getPlaylistLinkingStats()`:

```javascript
{
  apple_rescue_counts: {
    'no_metadata_match': 3,
    'low_confidence': 5,
    'compilation': 2
  }
}
```

## Tidal Guidance

When a track already has a Tidal match (from DSP import or previous linking), the Tidal metadata can guide Apple Music search.

### Providing Guidance

Pass Tidal track data via the `tidalGuidance` parameter:

```javascript
const appleResult = await appleMusicApiService.searchCatalogTrack({
  track: { artist: "Artist", title: "Title", album: "Album" },
  tidalGuidance: {
    title: "Title (Radio Edit)",
    album: "Album - Deluxe Edition",
    durationMs: 234567
  }
});
```

### Guidance Integration

The `createScoringContext()` function merges Tidal guidance:

1. Adds Tidal title variants to `context.titleVariants`
2. Adds Tidal artist variants to `context.artistVariants`
3. Adds Tidal album variants to `context.albumVariants`
4. Uses Tidal ISRC if track ISRC missing
5. Uses Tidal duration if track duration missing
6. Sets `context.guidance.tidal` with original values
7. Updates `context.preferredAlbum` if track album was empty

### Search Term Variations

`buildSearchAttempts()` creates Tidal-guided search terms:

```javascript
// Standard: "Artist Title Album"
{ term: "Artist Title Album", label: "combined", viaGuidance: false }

// With Tidal album: "Artist Title Tidal-Album"
{ term: "Artist Title Album - Deluxe", label: "combined_tidal", viaGuidance: true }

// With Tidal title: "Artist Tidal-Title Album"
{ term: "Artist Title (Radio Edit) Album", label: "tidal_title", viaGuidance: true }
```

Search attempts marked `viaGuidance: true` set `candidate.viaGuidance = true` and change source to `'api:metadata:tidal'`.

### Statistics

The stats endpoint tracks guidance usage:

```javascript
{
  apple_guidance_matches: 12  // Tracks where viaGuidance was true
}
```

## Error Handling

The cross-linking service captures and stores errors at multiple levels.

### Track-Level Errors

Individual platform search failures store in the `results.errors` array:

```javascript
{
  trackId: 123,
  apple: { url: "...", confidence: 85 },
  tidal: null,
  spotify: { id: "..." },
  errors: [
    "Tidal: Connection timeout after 3 retries"
  ]
}
```

If all platforms fail, `linking_status` becomes `'failed'` and `linking_error` stores the concatenated error messages.

### Job-Level Errors

Job progress tracking includes an `errors` array:

```javascript
{
  progress: {
    total: 50,
    processed: 50,
    found: 47,
    errors: [
      { trackId: 123, error: "Apple Music: Invalid response" },
      { trackId: 456, error: "Tidal: Rate limit exceeded" }
    ]
  }
}
```

Jobs continue processing remaining tracks even after individual track failures.

### API Error Responses

Apple Music API errors parse from response structure:

```javascript
const appleErrors = Array.isArray(response?.data?.errors) ? response.data.errors : [];
```

Errors include:
- HTTP status code
- Apple error code
- Error detail message
- Source pointer (indicates which track in batch failed)

The system logs these with context:

```javascript
logger.warn('APPLE_EXPORT', 'Apple rejected track while adding to playlist', {
  playlistId,
  storefront,
  appleSongId,
  trackTitle,
  status: issue.status,
  code: issue.code,
  detail: issue.detail
});
```

## Logging

The cross-linking system uses structured logging through `server/utils/logger.js`.

### Log Channels

**APPLE_LINK** - Apple Music search and matching
```javascript
logger.debug('APPLE_LINK', 'Metadata search attempt failed', { storefront, term, reason });
logger.info('APPLE_LINK', 'Album rescue fallback selected Apple match', { chosenId, chosenScore });
logger.warn('APPLE_LINK', 'Album rescue lookup failed', { storefront, trackArtist });
```

**APPLE_EXPORT** - Apple Music playlist export
```javascript
logger.info('APPLE_EXPORT', 'Re-resolved Apple track for storefront', { originalAppleId, resolvedAppleId });
logger.error('APPLE_EXPORT', 'Some Apple tracks failed to add', { failedCount });
```

### Log Levels

- **DEBUG** - Search attempts, candidate evaluation, fallback triggers
- **INFO** - Successful matches, compilation overrides, storefront fallbacks
- **WARN** - Lookup failures, missing metadata, configuration issues
- **ERROR** - API failures, job failures, data corruption

### Console Logging

The service also logs key events to console:

```javascript
console.log(`📋 Created linking job ${jobId} for playlist ${playlistId}`);
console.log(`🔗 Starting cross-platform linking for: ${track.artist} - ${track.title}`);
console.log(`✅ Completed linking for track ${trackId}`);
```

Used for development monitoring and debugging.
