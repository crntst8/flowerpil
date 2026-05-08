# Audio Preview System

## Purpose

Provides 30-second audio previews for tracks using Deezer's preview API through a server-side proxy. Manages playback state across the application with automatic cleanup on navigation.

## How It Works

AudioPreviewContext (`src/shared/contexts/AudioPreviewContext.jsx`) provides global audio playback state using React Context and HTML5 Audio element. The context initializes an Audio element with preload='none', volume=1.0, and muted=false without crossOrigin (same-origin proxy requests). Event listeners handle ended, error, canplay, play, and pause events.

The playPreview() function implements toggle behavior (stops if same track playing), sets loading state, checks for cached preview_data.url with 30-minute TTL, fetches metadata from `/api/v1/preview/${trackId}` if cache miss, sets audioRef.current.src to `/api/v1/preview/stream/${trackId}`, calls play() returning a Promise, immediately sets isPlaying=true and isLoading=false after Promise resolves, and schedules 30-second auto-stop timeout.

Navigation cleanup useEffect monitors location.pathname changes. The cleanup function (not effect body) pauses audio and resets state when pathname changes. Critical fix (November 9, 2025): Removed isPlaying from dependency array to prevent race condition where state update triggered effect, which immediately paused audio after playback started.

PreviewButton component (`src/modules/playlists/components/PreviewButton.jsx`) displays loading spinner, play icon, or pause icon based on context state. Integrated in ExpandableTrack.jsx on desktop and mobile action bars with tooltip "Play 30-second preview (powered by Deezer)".

Server-side streaming endpoint GET /api/v1/preview/stream/:trackId (`server/api/preview.js`:36-160) fetches track, checks URL expiration via isDeezerUrlExpired(), refreshes from deezerService.getPreviewForTrack() if expired, fetches audio stream from Deezer with User-Agent and Accept headers, handles 403 retry logic by refreshing URL and retrying fetch, converts Web ReadableStream to Node.js stream, pipes to response with Content-Type audio/mpeg and Cache-Control public max-age=3600.

DeezerPreviewService (`server/services/deezerPreviewService.js`) implements two-tier matching. ISRC matching queries `https://api.deezer.com/track/isrc:{isrc}` with 100% confidence. Metadata matching searches by artist and title, calculates Levenshtein distance similarity, returns 0-100% confidence. Rate limiting enforces 100ms minimum between requests via sequential queue. In-memory cache uses 24-hour TTL.

Deezer preview URLs contain hdnea signature parameter with expiration timestamp. isDeezerUrlExpired() parses parameter, decodes timestamp, compares to current time. Automatic refresh fetches new URL before streaming when expired.

## API/Interface

### Stream Endpoint

```
GET /api/v1/preview/stream/:trackId
```

Streams 30-second audio preview. Automatically refreshes expired Deezer URLs.

**Response Headers:**
```
Content-Type: audio/mpeg
Accept-Ranges: bytes
Cache-Control: public, max-age=3600
Access-Control-Allow-Origin: *
```

### Metadata Endpoint

```
GET /api/v1/preview/:trackId
```

Returns preview metadata without streaming.

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://api.flowerpil.io/api/v1/preview/stream/123",
    "source": "deezer-isrc",
    "confidence": 100,
    "deezer_id": "3135556",
    "attribution": "Preview powered by Deezer"
  }
}
```

### Batch Endpoint

```
POST /api/v1/preview/batch
```

Fetches previews for multiple tracks.

**Request:**
```json
{
  "tracks": [
    { "id": 1, "isrc": "USRC11234567", "title": "Song", "artist": "Artist" }
  ]
}
```

**Features:**
- Processes in batches of 5 tracks
- 200ms delay between batches
- Returns array of preview data objects

### AudioPreviewContext Methods

**playPreview:**
```javascript
playPreview(track, apiEndpoint)
// Toggles playback, fetches metadata if needed, streams audio
```

**stopPreview:**
```javascript
stopPreview()
// Stops current playback and resets state
```

**Context State:**
```javascript
{
  currentTrack: object | null,
  isPlaying: boolean,
  isLoading: boolean,
  error: string | null
}
```

### DeezerPreviewService Methods

**getPreviewForTrack:**
```javascript
getPreviewForTrack(track)
// Returns: { url, deezer_id, source, confidence }
```

From `server/services/deezerPreviewService.js`:15-72, checks cache, attempts ISRC search, falls back to metadata search, returns preview object with direct Deezer URL, deezer_id, matching source, and confidence score.

## Database

### Tracks Table Columns

Preview-related fields:

```sql
deezer_id TEXT              -- Deezer track identifier
deezer_preview_url TEXT     -- Direct Deezer preview URL
preview_source TEXT         -- 'deezer-isrc' or 'deezer-search'
preview_confidence INTEGER  -- Match confidence 0-100
```

**Update Query:**
```sql
UPDATE tracks
SET deezer_id = ?,
    deezer_preview_url = ?,
    preview_source = ?,
    preview_confidence = ?
WHERE id = ?
```

Used in `server/api/preview.js` when refreshing expired URLs.

## Integration Points

### Internal Dependencies

- **AudioPreviewContext** (`src/shared/contexts/AudioPreviewContext.jsx`) - Global playback state
- **PreviewButton** (`src/modules/playlists/components/PreviewButton.jsx`) - UI component
- **ExpandableTrack** (`src/modules/playlists/components/ExpandableTrack.jsx`) - Integration point
- **DeezerPreviewService** (`server/services/deezerPreviewService.js`) - Deezer API integration
- **securityHeaders** (`server/middleware/securityHeaders.js`) - CSP configuration

### External Dependencies

- **Deezer API** - https://api.deezer.com/track/isrc:{isrc} and search endpoints
- **HTML5 Audio API** - Browser audio playback via Audio element
- **React Context** - State management across components
- **react-router-dom** - useLocation hook for navigation detection

### CSP Configuration

From `server/middleware/securityHeaders.js`:40-45:

```javascript
mediaSrc: ["'self'", "https:", "blob:", "data:"]
```

Allows HTTPS audio sources.

From `server/middleware/securityHeaders.js`:97-98:

```javascript
crossOriginResourcePolicy: {
  policy: "cross-origin"
}
```

Enables cross-origin audio requests.

### App Wrapper

From `src/App.jsx`:44,63:

```javascript
<AudioPreviewProvider>
  <ModuleProvider>
    {/* All routes */}
  </ModuleProvider>
</AudioPreviewProvider>
```

## Configuration

No environment variables required. Uses existing server configuration and database connection.

**Deezer API:**
- Base URL: https://api.deezer.com
- Rate limit: 100ms minimum between requests
- No API key required for public endpoints

**Caching:**
- Server response: Cache-Control public, max-age=3600 (1 hour)
- Service cache: 24-hour TTL in-memory
- Frontend cache: 30-minute TTL in track.preview_data

**Audio Format:**
- Format: MP3
- Bitrate: ~128kbps from Deezer
- Duration: 30 seconds
- Content-Type: audio/mpeg

## Usage Examples

### Using AudioPreviewContext

From `src/modules/playlists/components/PreviewButton.jsx`:

```javascript
import { useAudioPreview } from '@shared/contexts/AudioPreviewContext';

const PreviewButton = ({ track }) => {
  const { playPreview, currentTrack, isPlaying, isLoading } = useAudioPreview();

  const handleClick = () => {
    playPreview(track);
  };

  const isCurrentTrack = currentTrack?.id === track.id;
  const showPlaying = isCurrentTrack && isPlaying;
  const showLoading = isCurrentTrack && isLoading;

  return (
    <button onClick={handleClick}>
      {showLoading ? <Spinner /> : showPlaying ? <PauseIcon /> : <PlayIcon />}
    </button>
  );
};
```

### Audio Element Setup

From `src/shared/contexts/AudioPreviewContext.jsx`:36-114:

```javascript
useEffect(() => {
  const audio = new Audio();
  audio.preload = 'none';
  audio.volume = 1.0;
  audio.muted = false;
  // No crossOrigin - same-origin proxy requests

  audio.addEventListener('ended', handleEnded);
  audio.addEventListener('error', handleError);
  audio.addEventListener('canplay', handleCanPlay);
  audio.addEventListener('play', handlePlay);
  audio.addEventListener('pause', handlePause);

  audioRef.current = audio;

  return () => {
    audio.pause();
    audio.src = '';
    // Remove listeners
  };
}, []);
```

### Navigation Cleanup

From `src/shared/contexts/AudioPreviewContext.jsx`:117-131:

```javascript
useEffect(() => {
  return () => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = '';
      setCurrentTrack(null);
      setIsPlaying(false);
      setIsLoading(false);
      setError(null);
    }
  };
}, [location.pathname]); // Only pathname in deps - critical fix
```

### Playback Function

From `src/shared/contexts/AudioPreviewContext.jsx`:144-293:

```javascript
const playPreview = async (track, apiEndpoint = '/api/v1/preview') => {
  if (currentTrack?.id === track.id && isPlaying) {
    stopPreview();
    return;
  }

  setIsLoading(true);
  setError(null);

  try {
    // Check cache
    const cached = track.preview_data;
    const isCacheValid = cached?.url && cached?.cachedAt &&
      (Date.now() - cached.cachedAt < CACHE_TTL);

    let previewUrl;
    if (isCacheValid) {
      previewUrl = cached.url;
    } else {
      const response = await fetch(`${apiEndpoint}/${track.id}`);
      const data = await response.json();
      previewUrl = data.data.url;

      // Cache for next time
      track.preview_data = {
        ...data.data,
        cachedAt: Date.now()
      };
    }

    setCurrentTrack(track);
    audioRef.current.src = previewUrl;
    await audioRef.current.play();

    // Critical: Set state immediately after play() Promise resolves
    setIsPlaying(true);
    setIsLoading(false);

    // Auto-stop after 30 seconds
    clearTimeout(autoStopTimeoutRef.current);
    autoStopTimeoutRef.current = setTimeout(() => {
      stopPreview();
    }, 30000);
  } catch (error) {
    setError(error.message);
    setIsLoading(false);
  }
};
```

### Server-Side URL Expiration Check

From `server/api/preview.js`:

```javascript
function isDeezerUrlExpired(url) {
  if (!url) return true;

  try {
    const urlObj = new URL(url);
    const hdnea = urlObj.searchParams.get('hdnea');
    if (!hdnea) return true;

    // Parse expiration from hdnea parameter
    const decoded = Buffer.from(hdnea, 'base64').toString('utf8');
    const expMatch = decoded.match(/exp=(\d+)/);
    if (!expMatch) return true;

    const expTimestamp = parseInt(expMatch[1], 10);
    return Date.now() > expTimestamp * 1000;
  } catch {
    return true;
  }
}
```

### Deezer ISRC Matching

From `server/services/deezerPreviewService.js`:75-84:

```javascript
async searchByISRC(isrc) {
  const url = `https://api.deezer.com/track/isrc:${isrc}`;
  const data = await this.queueRequest(url);

  if (data && data.id && data.preview) {
    return {
      url: data.preview,
      deezer_id: data.id.toString(),
      confidence: 100,
      source: 'deezer-isrc'
    };
  }
  return null;
}
```

### Batch Preview Fetching Script

From `scripts/backfill-deezer-previews-v2.js`:

```javascript
const batchSize = 5;

for (let i = 0; i < tracksToProcess.length; i += batchSize) {
  const batch = tracksToProcess.slice(i, i + batchSize);

  await Promise.all(batch.map(async (track) => {
    const preview = await deezerService.getPreviewForTrack(track);
    if (preview) {
      db.prepare(`
        UPDATE tracks
        SET deezer_id = ?, deezer_preview_url = ?,
            preview_source = ?, preview_confidence = ?
        WHERE id = ?
      `).run(preview.deezer_id, preview.url, preview.source, preview.confidence, track.id);
    }
  }));
}
```
