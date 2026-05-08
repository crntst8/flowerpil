# Home Feed Visibility

Controls which playlists appear on the landing page and in what order. Allows pinning playlists to the top of the feed and hiding playlists from the landing page while keeping them accessible on `/playlists`.

## Data Model

Configuration is stored in the `admin_system_config` table with config key `feed_visibility`.

```json
{
  "pinned": [45, 12, 78],
  "hidden": [23, 56]
}
```

- `pinned` - Array of playlist IDs in display order (first ID appears at top)
- `hidden` - Array of playlist IDs excluded from landing page feed

A playlist cannot be both pinned and hidden. The API enforces this by removing from one list when adding to the other.

## Display Logic

The public feed endpoint at `server/api/public-playlists.js` applies visibility rules in the `GET /api/v1/public/feed` route:

1. `getFeedVisibilityConfig()` reads the config from `admin_system_config`
2. Hidden playlists are filtered out (combined with Perfect Sundays exclusions)
3. Results are sorted: pinned playlists first (by array position), then chronological by `published_at`

```javascript
// Sort: pinned playlists first (in order), then chronological
const sortedData = visibleData.sort((a, b) => {
  const aPin = pinnedIds.indexOf(a.id);
  const bPin = pinnedIds.indexOf(b.id);

  if (aPin !== -1 && bPin !== -1) return aPin - bPin;
  if (aPin !== -1) return -1;
  if (bPin !== -1) return 1;
  return 0;
});
```

Hidden playlists remain visible on `/playlists` because that page uses a different data source (`getPublishedPlaylists`) that does not apply feed visibility filtering.

## API Endpoints

All endpoints require admin authentication and are defined in `server/api/admin/feedVisibility.js`.

### GET /api/v1/admin/feed-visibility

Returns current visibility configuration.

### GET /api/v1/admin/feed-visibility/playlists

Returns all published playlists with their visibility state attached:

```javascript
{
  id: 45,
  title: "Playlist Name",
  visibility: {
    isPinned: true,
    isHidden: false,
    pinnedPosition: 0
  }
}
```

### PUT /api/v1/admin/feed-visibility

Full replacement of the visibility config. Validates that IDs are numbers and removes duplicates.

### POST /api/v1/admin/feed-visibility/pin

Pins a playlist to a specific position. Removes from hidden if present.

```json
{ "playlistId": 45, "position": 0 }
```

### POST /api/v1/admin/feed-visibility/unpin

Removes a playlist from pinned list, returning it to chronological ordering.

### POST /api/v1/admin/feed-visibility/hide

Hides a playlist from the landing page. Removes from pinned if present.

### POST /api/v1/admin/feed-visibility/unhide

Restores a hidden playlist to the landing page feed.

### POST /api/v1/admin/feed-visibility/reorder

Reorders all pinned playlists at once.

```json
{ "pinned": [78, 45, 12] }
```

## Admin UI

`src/modules/admin/components/FeedVisibilityPanel.jsx` provides the admin interface, accessed via the "Visibility" subtab under PLAYLISTS in the admin dashboard.

The component:
- Fetches playlists with visibility state from `/api/v1/admin/feed-visibility/playlists`
- Displays stats for total, pinned, hidden, and normal playlists
- Provides filter buttons to view subsets (All, Pinned, Hidden, Normal)
- Supports search by playlist title or curator name
- Shows pinned position badges for pinned playlists
- Offers actions: Pin to Top, Move Up, Move Down, Unpin, Hide, Unhide

Each action calls the corresponding API endpoint and updates local state on success.

## Integration

The subtab is registered in `src/modules/admin/components/tabs/PlaylistsTab.jsx`:

```javascript
{
  id: 'visibility',
  label: 'Visibility',
  content: <FeedVisibilityPanel />
}
```

The API route is mounted in `server/index.js`:

```javascript
app.use('/api/v1/admin/feed-visibility', adminSecurityHeaders, validateCSRFToken, adminFeedVisibilityRoutes);
```

## Relationship to Perfect Sundays

Perfect Sundays playlists are hidden via a separate config key (`perfect_sundays_page`). The feed endpoint combines both hidden sets:

```javascript
const hiddenIds = new Set([
  ...visibilityConfig.hidden,
  ...getPerfectSundaysIds()
]);
```

This means Perfect Sundays playlists do not appear in the feed visibility admin UI but are still filtered from the landing page.
