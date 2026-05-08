# Scheduled Posts

Scheduled posts allow curators to set a future date and time for automatic playlist publication. The system stores a timestamp on the playlist record and a background service polls for due playlists every 60 seconds.

## Database Schema

The `playlists` table contains a `scheduled_publish_at` column:

```sql
scheduled_publish_at DATETIME
```

An index supports efficient querying of scheduled playlists:

```sql
CREATE INDEX idx_playlists_scheduled_publish ON playlists(published, scheduled_publish_at)
```

Migration: `server/database/migrations/098_scheduled_publish.js`

## API Endpoint

**PATCH `/api/v1/playlists/:id/schedule-publish`**

Location: `server/api/playlists.js` (lines 1115-1168)

Request body:
```json
{
  "scheduled_publish_at": "2026-01-30T14:00:00.000Z"
}
```

Pass `null` to cancel a scheduled publish.

Validation rules:
- Playlist must exist
- Curator must own the playlist (enforced via `req.user.curator_id`)
- Playlist cannot already be published
- Date must be in the future (with 2-minute grace window for clock skew)

The endpoint updates the `scheduled_publish_at` field via the `schedulePlaylistPublish` prepared statement in `server/database/db.js`.

## Auto-Publish Service

Location: `server/services/scheduledPublishService.js`

The service runs on a 60-second interval, started from `server/index.js`:

```javascript
import { startScheduledPublishService } from './services/scheduledPublishService.js';
startScheduledPublishService();
```

### Tick Function

Each tick queries for due playlists:

```sql
SELECT * FROM playlists
WHERE published = 0
  AND scheduled_publish_at IS NOT NULL
  AND scheduled_publish_at <= datetime('now')
```

For each due playlist, the service:

1. Sets `published = 1`
2. Sets `published_at = CURRENT_TIMESTAMP` (if not already set)
3. Clears `scheduled_publish_at = NULL`
4. Queues auto-export via `queueAutoExportForPlaylist()` with trigger `'scheduled_publish'`

## Frontend Components

### CuratorPlaylistCreate

Location: `src/modules/curator/components/CuratorPlaylistCreate.jsx`

The publish workspace contains a timing selector with two options:
- "Post Now" - immediate publication
- "Scheduled Post" - deferred publication

State variables (inside `PublishExportWorkspace`):
- `publishTiming` - `'now'` or `'scheduled'`
- `scheduledDate` - date string from date picker
- `scheduledTime` - time string, defaults to `'12:00'`
- `scheduleSuccess` - success message shown after scheduling

The `handleScheduleClick` function in `PublishExportWorkspace` calls `onSchedulePublish(utcTimestamp)` which is handled by `handleSchedulePublish` in the main component.

`handleSchedulePublish` uses `runAction('schedule', ...)` to:
- Set `actionInFlight` (prevents autosave interference)
- Call the schedule-publish API
- Redirect to `/curator-admin/playlists` after 2 seconds

### ScheduleModal

Location: `src/modules/curator/components/ScheduleModal.jsx`

This modal supports two modes via the `mode` prop:
- `'import'` - for recurring import schedules (different feature)
- `'publish'` - for one-time scheduled publication

In publish mode, the modal renders date/time pickers and calls `handleSavePublishSchedule` which:
- Constructs UTC timestamp from local date/time
- PATCHes `/api/v1/playlists/:id/schedule-publish`
- Calls `onPlaylistUpdated(json.data)` to refresh the playlist list

The `onPlaylistUpdated` callback is separate from `onSaved` (which handles import schedules) to avoid state corruption.

### CuratorDashboard

Location: `src/modules/curator/components/CuratorDashboard.jsx`

The dashboard displays scheduled playlists with visual indicators:

```javascript
const isScheduled = Boolean(pl.scheduled_publish_at) && !isPublished;
```

Visual elements for scheduled playlists:
- Yellow status indicator (`$scheduled={true}` on `StatusIndicator`)
- "Posting {date}" label in amber (`#a16207`)

The Schedule button opens `ScheduleModal` with mode determined by publish state:

```javascript
onClick={() => openScheduleModal(pl, scheduleRecord || null, isPublished ? 'import' : 'publish')}
```

When `onPlaylistUpdated` fires, the dashboard calls `refreshPlaylists()` to fetch updated data.

## Track Count Display

The `getAllPlaylists` query in `server/database/db.js` includes a track count subquery:

```sql
(SELECT COUNT(*) FROM tracks t WHERE t.playlist_id = p.id) AS tracks_count
```

This ensures drafts and scheduled playlists display accurate track counts in the dashboard. The frontend uses this field as a fallback when detailed stats are unavailable:

```javascript
const stats = playlistStats[pl.id] || { total: pl.tracks_count || 0, ... };
```

## Action Flow

1. Curator creates/edits a draft playlist
2. Curator selects "Scheduled Post" and picks date/time
3. Frontend converts to UTC and calls schedule-publish API
4. API validates and stores `scheduled_publish_at` on playlist
5. Curator sees "Posting {date}" in dashboard
6. `scheduledPublishService` tick finds due playlist
7. Service sets `published = 1`, clears schedule, queues export
8. Playlist appears as published in dashboard

## Autosave Protection

The scheduling action uses `runAction('schedule', ...)` which sets `actionInFlight = 'schedule'`. The autosave effect in `CuratorPlaylistCreate` checks this flag:

```javascript
if (actionInFlight) return undefined;
```

This prevents autosave from running during the scheduling operation, which could otherwise cause race conditions or overwrite the scheduled state.

## Related Files

| Purpose | Path |
|---------|------|
| API endpoint | `server/api/playlists.js` |
| Auto-publish service | `server/services/scheduledPublishService.js` |
| Database queries | `server/database/db.js` |
| Migration | `server/database/migrations/098_scheduled_publish.js` |
| Playlist editor | `src/modules/curator/components/CuratorPlaylistCreate.jsx` |
| Schedule modal | `src/modules/curator/components/ScheduleModal.jsx` |
| Dashboard | `src/modules/curator/components/CuratorDashboard.jsx` |
