# End-Scroll Infinite Scroll

The end-scroll feature displays related playlists when users reach the bottom of a playlist's tracklist. The system supports priority-based configuration, A/B testing for call-to-action text, and comprehensive analytics tracking.

## Database Schema

### end_scroll_config

The `end_scroll_config` table stores configuration rules with three priority levels:

- **Per-playlist overrides**: `playlist_id` is set, `tag_id` is NULL
- **Tag-based rules**: `tag_id` is set, `playlist_id` is NULL
- **Global default**: Both `playlist_id` and `tag_id` are NULL

```sql
CREATE TABLE end_scroll_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER,
  tag_id INTEGER,
  enabled BOOLEAN DEFAULT 1,
  cta_text TEXT DEFAULT 'Explore More Playlists',
  variant_a_cta TEXT,
  variant_b_cta TEXT,
  ab_testing_enabled BOOLEAN DEFAULT 0,
  manual_playlist_ids TEXT,
  sort_order TEXT DEFAULT 'recent',
  max_playlists INTEGER DEFAULT 10,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES custom_playlist_flags(id) ON DELETE CASCADE
)
```

The `manual_playlist_ids` field stores a JSON array of playlist IDs for manual curation. When set, these playlists are shown instead of algorithmically selected ones.

### end_scroll_analytics

The `end_scroll_analytics` table tracks user interactions:

```sql
CREATE TABLE end_scroll_analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,
  variant TEXT NOT NULL,
  event_type TEXT NOT NULL,
  clicked_playlist_id INTEGER,
  user_fingerprint TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id),
  FOREIGN KEY (clicked_playlist_id) REFERENCES playlists(id)
)
```

The `event_type` field accepts three values:
- `impression`: Section becomes visible to user
- `click`: User clicks a related playlist card
- `scroll_back`: User scrolls back up after viewing section

The `variant` field stores which A/B test variant was shown: `A`, `B`, or `default`.

## Backend API

### Public Endpoints

#### GET /api/v1/end-scroll/:playlistId

Located in `server/api/endScroll.js`, this endpoint determines configuration using priority logic:

1. Checks for per-playlist override (`playlist_id = :playlistId`)
2. Falls back to tag-based rules (joins `playlist_flag_assignments` to find matching `tag_id`)
3. Falls back to global default (`playlist_id IS NULL AND tag_id IS NULL`)
4. Returns disabled state if no config exists
5. If a tag/per-playlist config returns no related playlists, it now re-runs with the global config to keep the section populated

When `manual_playlist_ids` is set, the endpoint parses the JSON array and fetches those specific playlists. Otherwise, it queries playlists sharing tags with the current playlist:

```sql
SELECT DISTINCT p.*
FROM playlists p
JOIN playlist_flag_assignments pfa ON p.id = pfa.playlist_id
WHERE pfa.flag_id IN (
  SELECT flag_id FROM playlist_flag_assignments
  WHERE playlist_id = ?
)
AND p.id != ?
AND p.published = 1
ORDER BY [sort_clause]
LIMIT ?
```

If a playlist has no tags (or the tag query yields zero rows) and the global config is active, it now falls back to the global published pool using the selected sort order:

```sql
SELECT p.*
FROM playlists p
WHERE p.published = 1
  AND p.id != ?
ORDER BY [sort_clause]
LIMIT ?
```

The `sort_order` field uses a whitelist map to prevent SQL injection:

```javascript
const sortMap = {
  'popular': 'p.id DESC',
  'random': 'RANDOM()',
  'recent': 'p.publish_date DESC'
};
```

The endpoint assigns A/B variants randomly (50/50 split) when `ab_testing_enabled` is true:

```javascript
let variant = 'default';
if (config.ab_testing_enabled && config.variant_a_cta && config.variant_b_cta) {
  variant = Math.random() < 0.5 ? 'A' : 'B';
}
```

Response format:

```json
{
  "config": {
    "enabled": true,
    "cta_text": "Explore More Playlists",
    "variant_a_cta": "Discover Similar Playlists",
    "variant_b_cta": "Find More to Explore",
    "ab_testing_enabled": true,
    "max_playlists": 10
  },
  "relatedPlaylists": [...],
  "variant": "A"
}
```

Admin API responses are wrapped with `{ success: boolean, data: ... }`. The admin UI unwraps `response.data` first, but also tolerates plain arrays/objects for backward compatibility.

#### POST /api/v1/end-scroll/track

Accepts analytics events with validation:

```javascript
{
  playlist_id: number,
  variant: 'A' | 'B' | 'default',
  event_type: 'impression' | 'click' | 'scroll_back',
  clicked_playlist_id: number | null,
  user_fingerprint: string | null
}
```

The endpoint validates enums and returns 400 errors for invalid values. Events are inserted silently without blocking the response.

### Admin Endpoints

Located in `server/api/admin/endScroll.js`, all admin routes require authentication via `authMiddleware` and CSRF token validation.

#### GET /api/v1/admin/end-scroll/config

Returns all configurations with LEFT JOINs to include playlist and tag information:

```sql
SELECT
  esc.*,
  p.title as playlist_title,
  cpf.text as tag_text
FROM end_scroll_config esc
LEFT JOIN playlists p ON esc.playlist_id = p.id
LEFT JOIN custom_playlist_flags cpf ON esc.tag_id = cpf.id
ORDER BY esc.created_at DESC
```

#### POST /api/v1/admin/end-scroll/config

Creates new configuration. Validates `manual_playlist_ids` as JSON array if provided. The `sort_order` field accepts only `recent`, `popular`, or `random`.

#### PUT /api/v1/admin/end-scroll/config/:id

Updates existing configuration with same validation as POST.

#### DELETE /api/v1/admin/end-scroll/config/:id

Removes configuration. Foreign key cascades automatically remove related analytics entries.

#### GET /api/v1/admin/end-scroll/analytics?days=30

Aggregates metrics by variant:

```javascript
const stats = db.prepare(`
  SELECT
    COUNT(CASE WHEN event_type = 'impression' THEN 1 END) as impressions,
    COUNT(CASE WHEN event_type = 'click' THEN 1 END) as clicks,
    COUNT(CASE WHEN event_type = 'scroll_back' THEN 1 END) as scroll_backs
  FROM end_scroll_analytics
  WHERE variant = ?
    AND created_at >= datetime('now', '-' || ? || ' days')
`).get(variant, days);
```

Calculates click-through rate (CTR) and scroll-back rate as percentages:

```javascript
ctr: stats.impressions > 0
  ? parseFloat(((stats.clicks / stats.impressions) * 100).toFixed(2))
  : 0
```

Also returns top 10 most-clicked playlists:

```sql
SELECT
  p.id,
  p.title,
  COUNT(*) as click_count
FROM end_scroll_analytics esa
JOIN playlists p ON esa.clicked_playlist_id = p.id
WHERE esa.event_type = 'click'
  AND esa.created_at >= datetime('now', '-' || ? || ' days')
GROUP BY p.id, p.title
ORDER BY click_count DESC
LIMIT 10
```

## Frontend Components

### EndScrollSection

Located in `src/modules/playlists/components/EndScrollSection.jsx`, this component renders at the bottom of `PlaylistView` inside `TrackSectionWrapper`.

The component fetches configuration on mount:

```javascript
useEffect(() => {
  if (!playlistId) return;

  fetch(`/api/v1/end-scroll/${playlistId}`)
    .then(res => res.json())
    .then(data => {
      setConfig(data.config);
      setRelatedPlaylists(data.relatedPlaylists);
      setVariant(data.variant);
    });
}, [playlistId]);
```

IntersectionObserver tracks when the section becomes visible:

```javascript
useEffect(() => {
  if (!sectionRef.current || !config) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting && !isVisible) {
        setIsVisible(true);
        // Track impression
        fetch('/api/v1/end-scroll/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playlist_id: playlistId,
            variant,
            event_type: 'impression'
          })
        });
      }
    },
    { threshold: 0.2 }
  );

  observer.observe(sectionRef.current);
  return () => observer.disconnect();
}, [config, isVisible, playlistId, variant]);
```

The threshold of 0.2 means 20% of the section must be visible before tracking an impression.

Click tracking fires when users click a playlist card:

```javascript
const trackClick = (clickedPlaylistId) => {
  fetch('/api/v1/end-scroll/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playlist_id: playlistId,
      variant,
      event_type: 'click',
      clicked_playlist_id: clickedPlaylistId
    })
  });
};
```

The component determines CTA text based on variant:

```javascript
const ctaText = variant === 'A' ? config.variant_a_cta :
                variant === 'B' ? config.variant_b_cta :
                config.cta_text;
```

Returns null when disabled or no playlists exist:

```javascript
if (!config || !config.enabled || relatedPlaylists.length === 0) {
  return null;
}
```

The component includes a gradient overlay that creates a smooth visual transition from the tracklist:

```javascript
const GradientOverlay = styled.div`
  position: absolute;
  top: -60px;
  left: 0;
  right: 0;
  height: 60px;
  background: linear-gradient(
    to bottom,
    rgba(219, 219, 218, 0),
    rgba(219, 219, 218, 1)
  );
  pointer-events: none;
`;
```

### CompactPlaylistCard

Located in `src/modules/playlists/components/CompactPlaylistCard.jsx`, this component displays playlists in a vertical layout optimized for grid display.

Uses ResponsiveImage for lazy loading:

```javascript
<ResponsiveImage
  src={imageUrl}
  alt={playlist.title}
  sizes={IMAGE_SIZES.CARD_MEDIUM}
  loading="lazy"
  placeholder="NO IMAGE"
  fallback={playlist.image}
/>
```

The image container maintains a 1:1 aspect ratio:

```javascript
const ImageContainer = styled.div`
  position: relative;
  width: 100%;
  padding-bottom: 100%; /* 1:1 aspect ratio */

  img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;
```

Displays up to 2 playlist flags with custom colors:

```javascript
{playlist.flags && playlist.flags.length > 0 && (
  <FlagsContainer>
    {playlist.flags.slice(0, 2).map((flag) => (
      <Flag
        key={flag.id}
        $bgColor={flag.color}
        $textColor={flag.text_color}
      >
        {flag.text}
      </Flag>
    ))}
  </FlagsContainer>
)}
```

### PlaylistView Integration

Located in `src/modules/playlists/components/PlaylistView.jsx`, the EndScrollSection component is added after the TrackList:

```javascript
<TrackSectionWrapper>
  <TrackSection>
    {currentTracks.length > 0 ? (
      <TrackList>
        {currentTracks.map((track, index) => (
          <ExpandableTrack ... />
        ))}
      </TrackList>
    ) : (
      <EmptyTracks>No tracks available</EmptyTracks>
    )}
  </TrackSection>

  <EndScrollSection playlistId={currentPlaylist.id} />
</TrackSectionWrapper>
```

## Admin Panel

### EndScrollAdminPanel

Located in `src/modules/admin/components/EndScrollAdminPanel.jsx`, this component provides tab-based navigation for managing the feature.

Uses lazy loading for subcomponents:

```javascript
const GlobalConfig = lazy(() => import('./endScroll/GlobalConfig'));
const TagBasedConfig = lazy(() => import('./endScroll/TagBasedConfig'));
const PerPlaylistConfig = lazy(() => import('./endScroll/PerPlaylistConfig'));
const AnalyticsView = lazy(() => import('./endScroll/AnalyticsView'));
```

Fetches configuration count for display in tab labels:

```javascript
useEffect(() => {
  const fetchCounts = async () => {
    const data = await adminGet('/api/v1/admin/end-scroll/config');
    if (Array.isArray(data)) {
      setConfigCount(data.length);
    }
  };
  fetchCounts();
}, []);
```

Tab structure:

```javascript
const tabs = [
  { id: 'global', label: 'Global Default', content: globalContent },
  { id: 'tags', label: 'Tag-Based Rules', content: tagBasedContent },
  { id: 'playlists', label: `Per-Playlist Overrides (${configCount})`, content: perPlaylistContent },
  { id: 'analytics', label: 'Analytics', content: analyticsContent }
];
```

### GlobalConfig

Located in `src/modules/admin/components/endScroll/GlobalConfig.jsx`, this component manages the global default configuration.

Fetches existing global config (where `playlist_id IS NULL AND tag_id IS NULL`):

```javascript
const data = await adminGet('/api/v1/admin/end-scroll/config');
const global = data.find(c => !c.playlist_id && !c.tag_id);
```

Saves configuration with explicit NULL values for priority fields:

```javascript
const payload = {
  playlist_id: null,
  tag_id: null,
  enabled: globalConfig.enabled,
  cta_text: globalConfig.cta_text,
  variant_a_cta: globalConfig.variant_a_cta || null,
  variant_b_cta: globalConfig.variant_b_cta || null,
  ab_testing_enabled: globalConfig.ab_testing_enabled,
  sort_order: globalConfig.sort_order,
  max_playlists: parseInt(globalConfig.max_playlists, 10)
};
```

Uses PUT if config exists, POST if creating new:

```javascript
let response;
if (globalConfig.id) {
  response = await adminPut(`/api/v1/admin/end-scroll/config/${globalConfig.id}`, payload);
} else {
  response = await adminPost('/api/v1/admin/end-scroll/config', payload);
}
```

### TagBasedConfig

Located in `src/modules/admin/components/endScroll/TagBasedConfig.jsx`, this component creates rules for playlists with specific tags.

Fetches available tags from custom_playlist_flags:

```javascript
const [configsData, tagsData] = await Promise.all([
  adminGet('/api/v1/admin/end-scroll/config'),
  adminGet('/api/v1/admin/site-admin/custom-flags')
]);

const tagBasedConfigs = configsData.filter(c => c.tag_id && !c.playlist_id);
setConfigs(tagBasedConfigs);
setTags(tagsData?.flags || []);
```

Creates configuration with `tag_id` set and `playlist_id` NULL:

```javascript
const payload = {
  playlist_id: null,
  tag_id: parseInt(selectedTag),
  enabled: true,
  cta_text: formData.cta_text,
  sort_order: formData.sort_order,
  max_playlists: parseInt(formData.max_playlists)
};
```

### PerPlaylistConfig

Located in `src/modules/admin/components/endScroll/PerPlaylistConfig.jsx`, this component manages per-playlist overrides.

Implements playlist search with autocomplete:

```javascript
const handleSearchPlaylist = async (query) => {
  if (!query.trim()) {
    setSearchResults([]);
    return;
  }

  const data = await adminGet(`/api/v1/playlists/search?q=${encodeURIComponent(query)}`);
  setSearchResults(Array.isArray(data) ? data.slice(0, 5) : []);
};
```

Parses comma-separated manual playlist IDs:

```javascript
let manualIds = null;
if (formData.manual_playlist_ids.trim()) {
  manualIds = formData.manual_playlist_ids
    .split(',')
    .map(id => parseInt(id.trim()))
    .filter(Boolean);
}
```

Creates override with `playlist_id` set and `tag_id` NULL:

```javascript
const payload = {
  playlist_id: selectedPlaylist.id,
  tag_id: null,
  enabled: true,
  cta_text: formData.cta_text,
  manual_playlist_ids: manualIds ? JSON.stringify(manualIds) : null,
  sort_order: formData.sort_order,
  max_playlists: parseInt(formData.max_playlists)
};
```

### AnalyticsView

Located in `src/modules/admin/components/endScroll/AnalyticsView.jsx`, this component displays A/B test metrics and user interaction data.

Fetches analytics with configurable time range:

```javascript
const [days, setDays] = useState(30);

useEffect(() => {
  const response = await adminGet(`/api/v1/admin/end-scroll/analytics?days=${days}`);
  setAnalytics(response.data);
}, [days]);
```

Displays metrics by variant:

```javascript
{byVariant?.A && (
  <AnalyticCard>
    <AnalyticLabel>Variant A CTR</AnalyticLabel>
    <AnalyticValue>{byVariant.A.ctr}%</AnalyticValue>
    <AnalyticMeta>
      {byVariant.A.impressions} impressions • {byVariant.A.clicks} clicks
    </AnalyticMeta>
  </AnalyticCard>
)}
```

Shows most-clicked playlists table:

```javascript
{analytics.mostClickedPlaylists && analytics.mostClickedPlaylists.length > 0 && (
  <PlaylistTable>
    <thead>
      <tr>
        <TableHeader>Playlist</TableHeader>
        <TableHeader>Clicks</TableHeader>
      </tr>
    </thead>
    <tbody>
      {analytics.mostClickedPlaylists.map((playlist) => (
        <tr key={playlist.id}>
          <TableCell>{playlist.title}</TableCell>
          <TableCell>{playlist.click_count}</TableCell>
        </tr>
      ))}
    </tbody>
  </PlaylistTable>
)}
```

### ContentTab Integration

Located in `src/modules/admin/components/tabs/ContentTab.jsx`, the End Scroll panel is added as a subtab:

```javascript
const EndScrollAdminPanel = lazy(() => import('../EndScrollAdminPanel.jsx'));

const endScrollContent = (
  <Suspense fallback={<LoadingFallback>Loading end-scroll configuration…</LoadingFallback>}>
    <EndScrollAdminPanel />
  </Suspense>
);

const tabs = [
  { id: 'blog', label: 'Blog', content: blogContent },
  { id: 'about', label: 'About', content: aboutContent },
  { id: 'search', label: 'Search', content: searchContent },
  { id: 'endScroll', label: 'End Scroll', content: endScrollContent },
  { id: 'flagged', label: 'Flag Reports', content: flaggedContent }
];
```

## Security

### SQL Injection Prevention

The `sort_order` field uses a whitelist map in `server/api/endScroll.js`:

```javascript
const sortMap = {
  'popular': 'p.id DESC',
  'random': 'RANDOM()',
  'recent': 'p.publish_date DESC'
};
const sortClause = sortMap[config.sort_order] || 'p.publish_date DESC';
```

The `manual_playlist_ids` field validates array length to prevent DOS attacks:

```javascript
if (playlistIds.length > 100) {
  console.warn('[END_SCROLL] Too many manual playlists specified, truncating to 100');
  playlistIds = playlistIds.slice(0, 100);
}
```

Dynamic placeholders are constructed safely:

```javascript
const placeholders = playlistIds.map(() => '?').join(',');
const query = `
  SELECT p.*
  FROM playlists p
  WHERE p.id IN (${placeholders})
  ...
`;
relatedPlaylists = db.prepare(query).all(...playlistIds, playlistId, config.max_playlists);
```

### Input Validation

Admin endpoints validate enums:

```javascript
if (sort_order && !['recent', 'popular', 'random'].includes(sort_order)) {
  return res.status(400).json({
    success: false,
    error: 'sort_order must be recent, popular, or random'
  });
}
```

Public tracking endpoint validates variants and event types:

```javascript
if (!['A', 'B', 'default'].includes(variant)) {
  return res.status(400).json({
    success: false,
    error: 'Invalid variant. Must be A, B, or default'
  });
}

if (!['impression', 'click', 'scroll_back'].includes(event_type)) {
  return res.status(400).json({
    success: false,
    error: 'Invalid event_type. Must be impression, click, or scroll_back'
  });
}
```

### Authentication

All admin routes use `authMiddleware` and CSRF token validation:

```javascript
// server/index.js
app.use('/api/v1/admin/end-scroll',
  adminSecurityHeaders,
  validateCSRFToken,
  adminEndScrollRoutes
);
```

Admin API applies middleware at router level:

```javascript
// server/api/admin/endScroll.js
router.use(apiLoggingMiddleware);
router.use(authMiddleware);
```

## Error Handling

The frontend silently handles expected errors (no config, 404s) to avoid log spam:

```javascript
catch (err) {
  // Silently handle expected errors (no config, 404s)
  if (err.message && !err.message.includes('404') && !err.message.includes('Not Found')) {
    console.error('[EndScrollSection] Error fetching config:', err);
  }
  setError(err.message);
  setIsLoading(false);
}
```

Analytics tracking failures do not impact user experience:

```javascript
fetch('/api/v1/end-scroll/track', { ... })
  .catch(err => console.error('[END_SCROLL] Failed to track impression:', err));
```

Backend logs errors with structured JSON for PM2 monitoring:

```javascript
console.error(`[PM2_ERROR] End-scroll config fetch error: ${JSON.stringify({
  error: error.message,
  stack: error.stack,
  timestamp: new Date().toISOString()
})}`);
```

## Responsive Design

The playlist grid adapts to screen size:

```javascript
const PlaylistGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: ${theme.spacing.lg};

  ${mediaQuery.tablet} {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: ${theme.spacing.md};
  }

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.md};
  }
`;
```

Cards fade in with staggered animation:

```javascript
const PlaylistCardWrapper = styled.div`
  opacity: 0;
  animation: ${fadeInUp} 0.4s ease-out forwards;
  animation-delay: ${props => props.$index * 0.08}s;
`;

const fadeInUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;
```

## Performance

IntersectionObserver prevents unnecessary API calls by only tracking when the section is visible. The observer disconnects after the first impression to avoid repeated tracking:

```javascript
const observer = new IntersectionObserver(
  ([entry]) => {
    if (entry.isIntersecting && !isVisible) {
      setIsVisible(true);
      // Track once, then observer cleanup happens on unmount
    }
  },
  { threshold: 0.2 }
);
```

Images lazy load via ResponsiveImage component with the `loading="lazy"` attribute.

Admin panel uses Suspense boundaries for code splitting:

```javascript
const GlobalConfig = lazy(() => import('./endScroll/GlobalConfig'));
```

Analytics requests are limited by the time period selector (7/30/90 days) to prevent large dataset queries.

## Testing

The admin panel should be tested by:

1. Creating a global default configuration at `/admin?tab=content` → End Scroll
2. Enabling the feature and setting CTA text
3. Optionally enabling A/B testing with two variant CTAs
4. Navigating to any published playlist page
5. Scrolling to the bottom of the tracklist
6. Verifying the end-scroll section appears with related playlists
7. Checking browser Network tab for impression POST request
8. Clicking a related playlist card
9. Verifying click tracking POST request
10. Confirming navigation to the clicked playlist

Tag-based rules should be tested by:

1. Creating a tag-based configuration for "Artist Curated" or "Post" tags
2. Finding a playlist with that tag
3. Verifying the tag-based rule takes precedence over global default

Per-playlist overrides should be tested by:

1. Searching for a specific playlist in the Per-Playlist Overrides tab
2. Creating an override with custom CTA text or manual playlist IDs
3. Verifying the override takes precedence over tag-based and global rules

Analytics should be tested by:

1. Generating impressions and clicks through normal usage
2. Viewing the Analytics tab to see aggregated metrics
3. Comparing CTR between A/B variants if testing is enabled
4. Checking the most-clicked playlists list
