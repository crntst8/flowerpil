# YouTube Cross-Link Admin

Admin interface for reviewing and applying YouTube Music cross-links with manual override support. Enables controlled, gradual rollout of YouTube linking across existing playlists before enabling automatic linking for new content.

## Database Schema

### Staging Table

`server/database/migrations/079_youtube_crosslink_staging.js`

```sql
youtube_crosslink_staging (
  id, track_id, playlist_id,
  artist, title, album, isrc, duration_ms,          -- track snapshot
  youtube_video_id, youtube_url, youtube_title,     -- match result
  youtube_artist, youtube_duration_ms,
  match_confidence, match_source,
  status,                                            -- pending|approved|rejected|overridden
  override_video_id, override_url, override_reason,
  job_id, created_at, reviewed_at, applied_at
)
```

### Track Columns

The `tracks` table includes:
- `youtube_music_id` - video ID
- `youtube_music_url` - full URL
- `match_confidence_youtube` - 0-100 score
- `match_source_youtube` - 'search', 'manual', etc.
- `manual_override_youtube` - stores manual correction URL

### Config

`admin_system_config` stores `youtube_auto_link_enabled` (true/false) to control automatic linking for new playlists.

## API Endpoints

`server/api/admin/youtube-crosslink.js`

All endpoints require admin authentication and CSRF token.

| Endpoint | Method | Handler |
|----------|--------|---------|
| `/dry-run` | POST | Start dry run with `{ playlistId }` or `{ siteWide: true }` |
| `/job/:jobId` | GET | Poll job progress, returns ETA |
| `/results` | GET | Paginated staging entries, supports `status`, `playlistId`, `search` filters |
| `/stats` | GET | Counts by status |
| `/override` | POST | Set override with `{ stagingId, url, reason }` |
| `/bulk-approve` | POST | Approve entries with `{ stagingIds: [] }` |
| `/apply` | POST | Apply to tracks with `{ stagingIds }` or `{ applyAll: true }` |
| `/staging/:id/status` | PATCH | Update status to pending/approved/rejected |
| `/staging/:id` | DELETE | Remove staging entry |
| `/settings` | GET/POST | Read/write `youtube_auto_link_enabled` |
| `/playlists` | GET | List playlists with `missing_youtube_count` |

## Service Layer

`server/services/crossPlatformLinkingService.js`

### Dry Run

```javascript
startYouTubeDryRun({ playlistId?, siteWide?, batchSize? })
```

Creates a job, fetches tracks missing YouTube links, and processes them through `processYouTubeDryRunJob()`. Results are stored in `youtube_crosslink_staging` without modifying the `tracks` table.

Rate limiting uses `TokenBucket` with `LINKING_YOUTUBE_RPS` (default 2 requests/second).

### Job Progress

```javascript
getYouTubeDryRunProgress(jobId)
```

Returns `{ status, progress: { total, processed, found }, eta_seconds }`. Jobs are stored in-memory via `this.jobQueue`.

### Applying Results

```javascript
applyYouTubeStagingEntries(stagingIds?, applyAll?, statusFilter?)
```

For each staging entry:
- If `status === 'overridden'`: uses `override_video_id` and `override_url`, sets `manual_override_youtube`
- If `status === 'approved'`: uses matched `youtube_video_id` and `youtube_url`
- Updates `tracks` table and marks staging entry with `applied_at`

### Manual Override

```javascript
setYouTubeStagingOverride(stagingId, videoId, url, reason)
```

Extracts video ID from URL if needed, sets status to 'overridden', stores in `override_*` columns.

```javascript
setManualYouTubeOverride(trackId, url)
```

Direct override on track, bypassing staging. Sets `match_source_youtube = 'manual'` and `match_confidence_youtube = 100`.

### Auto-Link Setting

```javascript
isYouTubeAutoLinkEnabled()
setYouTubeAutoLinkEnabled(enabled)
```

Reads/writes `youtube_auto_link_enabled` in `admin_system_config`. When enabled, `linkTrack()` includes YouTube in the normal cross-platform linking flow.

## Frontend Component

`src/modules/admin/components/YouTubeCrossLinkReview.jsx`

Registered in `src/modules/admin/components/tabs/OperationsTab.jsx` under the "YouTube Cross-Link" subtab.

### State

- `stats` - staging table counts
- `results` - paginated staging entries
- `playlists` - dropdown options with missing counts
- `jobProgress` - active dry run progress
- `selectedIds` - Set for batch operations
- `overrideModal` - entry being overridden
- `settings` - auto-link toggle state

### Key Functions

| Function | Purpose |
|----------|---------|
| `startDryRun(siteWide)` | POST to `/dry-run`, starts polling |
| `pollJobProgress(jobId)` | Recursive polling every 2s until complete |
| `approveSelected()` | POST to `/bulk-approve` |
| `applySelected()` | POST to `/apply` with selected IDs |
| `applyAll()` | POST to `/apply` with `applyAll: true` |
| `updateStatus(id, status)` | PATCH to update single entry |
| `saveOverride()` | POST to `/override` from modal |
| `toggleAutoLink()` | POST to `/settings` |

### UI Components

- `MetricsGrid` - stats cards
- `SettingsRow` - auto-link toggle
- `ControlsRow` - playlist dropdown, dry run buttons, filters
- `ProgressBar` - shows during active dry run
- `Table` with `Row` - results with inline YouTube embeds
- `YouTubeEmbed` - 150x84px iframe embed per row
- `OverrideModal` - URL input with reason field

## YouTube Music Service

`server/services/youtubeMusicService.js`

The `searchYouTubeMusicByTrack(track)` function calls the Python microservice at `YTMUSIC_API_BASE` (default `http://127.0.0.1:3001`). Returns:

```javascript
{
  videoId, url, title, artist, album,
  confidence, source, duration
}
```

Circuit breaker (`ytmusic-search`) protects against cascading failures.

## Usage Flow

1. Navigate to Admin > Operations > YouTube Cross-Link
2. Select a playlist or click "Dry Run Site-Wide"
3. Wait for progress bar to complete
4. Review results - verify matches using inline embeds
5. Approve correct matches, override incorrect ones with correct URLs
6. Click "Apply All Approved/Overridden" to write to tracks table
7. Enable "Auto-link YouTube for new playlists" toggle after successful retroactive linking
