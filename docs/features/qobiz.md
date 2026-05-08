Qobuz playlist import enables curators to import tracks from public Qobuz playlist URLs by scraping playlist pages and matching tracks across DSP platforms.

## How It Works

The feature scrapes public Qobuz playlist pages using a Python script, extracts track metadata, and matches tracks against Spotify, Apple Music, and TIDAL using existing DSP APIs. Artwork is processed from Spotify matches, and tracks are stored with linking status 'completed' to avoid redundant cross-platform linking.

## API/Interface

### Endpoints

**GET /api/v1/qobuz/validate-url**

Validates Qobuz URL format without scraping.
Supports standard playlist pages, widget embeds, and open links such as `https://widget.qobuz.com/playlist/46509814?zone=au-en` and `https://open.qobuz.com/playlist/46509814`. The numeric ID between `playlist/` and any query string is used for scraping and caching.

```javascript
// Request
GET /api/v1/qobuz/validate-url?url=https://www.qobuz.com/us-en/playlists/example/12345

// Response
{
  success: true,
  data: {
    valid: true,
    playlistId: "12345"
  }
}
```

**GET /api/v1/qobuz/playlist-info/:playlistId**

Returns cached playlist information including track count.

```javascript
// Request
GET /api/v1/qobuz/playlist-info/12345

// Response
{
  success: true,
  data: {
    playlistId: "12345",
    trackCount: 25,
    cached: true
  }
}
```

**POST /api/v1/qobuz/import**

Imports tracks from a Qobuz playlist URL. Requires curator authentication.

```javascript
// Request
POST /api/v1/qobuz/import
{
  url: "https://www.qobuz.com/us-en/playlists/example/12345",
  curatorId: 123,
  playlistId: 456  // optional: existing playlist to add to
}

// Response
{
  success: true,
  data: {
    tracks: [
      {
        position: 1,
        title: "Track Name",
        artist: "Artist Name",
        album: "Album Name",
        year: 2024,
        duration: 245000,
        spotify_id: "spotify:track:12345",
        apple_id: "apple:track:67890",
        apple_music_url: "https://music.apple.com/track/67890",
        match_confidence_apple: 95,
        match_source_apple: "isrc",
        tidal_id: "tidal:track:11111",
        tidal_url: "https://tidal.com/track/11111",
        match_confidence_tidal: 90,
        match_source_tidal: "metadata",
        qobuz_url: "https://www.qobuz.com/us-en/playlists/example/12345",
        isrc: "US1234567890",
        explicit: false,
        preview_url: "https://p.scdn.co/mp3-preview/...",
        artwork_url: "/uploads/1735689600000-abc123.jpg",
        linking_status: "completed"
      }
    ],
    skipped: [
      {
        title: "Unmatched Track",
        artist: "Unknown Artist",
        reason: "No Spotify match found"
      }
    ],
    summary: {
      total: 26,
      matched: 25,
      skipped: 1,
      successRate: 0.9615
    }
  }
}
```

### Props

Frontend components accept standard import selection objects:

```javascript
{
  platform: 'qobuz',
  url: string,        // Qobuz playlist URL
  title: string,      // Playlist title
  description: string,
  image: string,
  total: number       // Track count (0 for Qobuz since unknown until import)
}
```

### Public Methods

**validateQobuzUrl(url)** - Validates URL format and extracts playlist ID
**extractQobuzPlaylistId(url)** - Extracts playlist ID from URL
**scrapeQobuzPlaylist(url)** - Scrapes playlist and returns track metadata
**matchQobuzTrack(track, url)** - Matches single track across DSPs
**matchQobuzTracks(tracks, url)** - Batch matches multiple tracks

## Database

### Schema Changes

Migration `server/database/migrations/052_qobuz_url.js` adds `qobuz_url` column to tracks table:

```sql
ALTER TABLE tracks ADD COLUMN qobuz_url TEXT;
CREATE INDEX idx_tracks_qobuz_url ON tracks(qobuz_url);
```

Migration `server/database/migrations/053_add_qobuz_url_to_playlists.js` adds `qobuz_url` column to playlists table:

```sql
ALTER TABLE playlists ADD COLUMN qobuz_url TEXT;
CREATE INDEX idx_playlists_qobuz_url ON playlists(qobuz_url);
```

### Queries

Track lookup by Qobuz URL:
```sql
SELECT * FROM tracks WHERE qobuz_url = ?;
```

Playlist lookup by Qobuz URL:
```sql
SELECT * FROM playlists WHERE qobuz_url = ?;
```

### Data Structures

Tracks store the full Qobuz playlist URL for provenance tracking. Playlists store the source URL when imported from Qobuz.

## Integration Points

Connects to existing DSP import infrastructure:

- **ImportModal** (`src/modules/curator/components/ImportModal.jsx`) - Qobuz tab with URL input field
- **CuratorPlaylistCreate** (`src/modules/curator/components/CuratorPlaylistCreate.jsx`) - Creation wizard support
- **QobuzImport** (`src/modules/admin/components/QobuzImport.jsx`) - Admin interface for testing imports
- **QobuzImportTest** (`src/modules/admin/components/QobuzImportTest.jsx`) - Development testing wrapper

Route registration in `server/index.js`:
```javascript
import qobuzRoutes from './api/qobuz.js';
app.use('/api/v1/qobuz', qobuzRoutes);
```

## Configuration

No additional environment variables required beyond existing DSP API tokens:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `APPLE_MUSIC_STOREFRONT`
- `TIDAL_CLIENT_ID`
- `TIDAL_CLIENT_SECRET`

## Usage Examples

### Frontend Import Flow

```javascript
// ImportModal - Qobuz URL input
<SearchInput
  type="url"
  placeholder="Paste Qobuz playlist URL..."
  value={qobuzUrl}
  onChange={(e) => setQobuzUrl(e.target.value)}
/>
<Button
  onClick={() => {
    if (!qobuzUrl.trim()) return;
    onImported({
      platform: 'qobuz',
      url: qobuzUrl.trim(),
      title: 'Qobuz Playlist',
      description: '',
      image: '',
      total: 0
    });
  }}
>
  Import
</Button>
```

### Service Layer Usage

```javascript
// Validate URL
const validation = validateQobuzUrl(url);
if (!validation.valid) {
  throw new Error('Invalid Qobuz URL format');
}

// Scrape playlist
const tracks = await scrapeQobuzPlaylist(url);

// Match tracks
const results = await matchQobuzTracks(tracks, url);
console.log(`Matched ${results.matched.length} of ${tracks.length} tracks`);
```

### Python Script Execution

The service spawns the Python scraper:
```javascript
const child = spawn('python3', [scriptPath, url], {
  cwd: join(__dirname, '../..'),
  env: process.env
});
```

Python script extracts track data using BeautifulSoup:
```python
for container in soup.select("div.track__items"):
    title = container.select_one(".track__item--name span").get_text(strip=True)
    artist = container.select_one(".track__item--artist").get_text(" ", strip=True)
    album = container.select_one(".track__item--album").get_text(strip=True)
    duration = container.select_one(".track__item--duration").get_text(strip=True)
```

### Artwork Processing

```javascript
async function processAndSaveImageFromUrl(imageUrl) {
  const resp = await fetch(imageUrl);
  const buffer = Buffer.from(await resp.arrayBuffer());

  const sizes = [
    { suffix: '', width: 800, height: 800 },
    { suffix: '_md', width: 400, height: 400 },
    { suffix: '_sm', width: 200, height: 200 }
  ];

  for (const size of sizes) {
    const outputPath = join(uploadsDir, `${filename}${size.suffix}.jpg`);
    await sharp(buffer)
      .resize(size.width, size.height, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 85 })
      .toFile(outputPath);
  }

  return filename;
}
```

### Error Handling

```javascript
// Invalid URL
if (!validation.valid) {
  return res.status(400).json({
    success: false,
    error: 'Invalid Qobuz URL format. Expected: https://www.qobuz.com/{region}/playlists/{name}/{id} or https://widget.qobuz.com/playlist/{id}'
  });
}

// Empty playlist
if (!qobuzTracks || qobuzTracks.length === 0) {
  return res.status(404).json({
    success: false,
    error: 'No tracks found in Qobuz playlist'
  });
}

// Python script failure
if (code !== 0) {
  reject(new Error(`Python script failed: ${stderr || 'Unknown error'}`));
}
```
