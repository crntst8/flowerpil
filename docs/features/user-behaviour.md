# User Behaviour Priorities

Feature-level action tracking and priority scoring system. Extends the existing site analytics stack with a behaviour layer that answers: what features are users using, where is friction highest, and what should be prioritized for improvement.

## Architecture

Two new database tables sit alongside the existing `site_analytics_events` tables. The frontend tracker queues action events and flushes them in batches. The backend validates, enriches with server-derived fields, and inserts. A separate admin endpoint computes priority scores from the raw data.

```
Frontend (siteAnalytics.js)  -->  POST /api/v1/analytics/action[s]  -->  site_analytics_actions
                                                                     -->  site_analytics_transitions
                                  GET /api/v1/admin/analytics/priorities  <--  PrioritiesView.jsx
```

## Database

Migration: `server/database/migrations/100_user_behavior_priorities.js`

### site_analytics_actions

Stores individual feature-level events. Each row represents one user action within a feature.

Key columns:
- `session_hash`, `visitor_hash` - Server-derived from IP + UA (same as existing analytics)
- `page_path`, `page_type`, `resource_id` - Server-derived via `parsePagePath()`
- `feature_key` - Which feature area: `landing_feed`, `playlist_view`, `playlist_track`, `curator_create`, `curator_library`
- `action_type` - One of: `click`, `start`, `complete`, `error`, `performance`, `dropoff`
- `action_name` - Specific action within the feature (e.g. `dsp_link_click`, `publish_success`)
- `target_key`, `target_text` - What was clicked (sanitized, max 50 chars)
- `duration_ms`, `value_num` - For performance metrics
- `success` - 1/0/null completion flag
- `metadata_json` - Sanitized JSON, max 10 keys, sensitive keys stripped
- `is_rage_click` - Reserved for Phase 2 rage-click detection
- `occurred_at` - Timestamp

Indexes on `occurred_at`, `(feature_key, action_type, occurred_at)`, `(session_hash, occurred_at)`, `(page_path, occurred_at)`, `(target_key, occurred_at)`.

### site_analytics_transitions

Pre-aggregated feature-to-feature transitions, computed at insert time. Avoids expensive window function queries on read.

Columns: `from_feature`, `to_feature`, `session_hash`, `occurred_at`.

Index on `(from_feature, to_feature, occurred_at)`.

Logic: on each action insert, `processAction()` in `server/api/analytics.js` checks the previous action for the same `session_hash`. If `feature_key` differs, a transition row is inserted.

## Event Contract

### Frontend payload

The frontend sends only the action-specific fields:

```json
{
  "feature_key": "playlist_view",
  "action_type": "click",
  "action_name": "dsp_link_click",
  "target_key": "dsp_link_click",
  "page_path": "/playlists/42",
  "metadata": { "platform": "spotify", "playlist_id": "42" }
}
```

The backend derives `session_hash`, `visitor_hash`, `page_type`, `resource_id`, `country_code`, `device_type`, `browser_family`, `os_family`, and `is_bot` using the same helpers from the existing analytics routes.

### Validation

Performed by `validateAction()` in `server/api/analytics.js`:

- `feature_key` required, max 64 chars, must match `[a-z_]+`
- `action_type` must be one of the six allowed types
- `action_name` required, max 64 chars
- `target_text` stripped of HTML and PII patterns, max 50 chars
- `duration_ms` clamped to 0-300000
- `metadata` max 10 keys, 200 chars per value, 2048 chars total JSON, sensitive keys (`email`, `token`, `password`, `auth`, `cookie`, `secret`, `key`, `ssn`, `phone`) stripped

Validation constants are defined in `src/shared/utils/actionCatalog.js`.

### Rate limiting

Per-session rate limit of 100 actions per minute per `session_hash`. Tracked in-memory via `sessionActionCounts` Map in `server/api/analytics.js`. Excess events are dropped silently (response always `{ success: true }`). Stale entries cleaned every 5 minutes.

### Sampling

Server-side sample rate controlled by `ANALYTICS_ACTION_SAMPLE_RATE` in `ecosystem.config.cjs` (default `1.0` = track everything). Applied via `Math.random() < sampleRate` check before insert.

### Dev gating

Dev traffic is excluded by default. If the request host contains `localhost`, `127.0.0.1`, or `dev.testing`, inserts are skipped unless `ANALYTICS_DEV_MODE=true` is set in `ecosystem.config.cjs`.

### Privacy mode

Respects the existing `analytics_settings.privacy_mode` from `site_settings`. When enabled, all action events are dropped. Cached for 60 seconds to avoid DB lookups per request.

## Ingest API

File: `server/api/analytics.js`

**POST /api/v1/analytics/action** - Single event ingest. Validates, checks rate limit, sampling, dev gating, privacy mode, then calls `processAction()`.

**POST /api/v1/analytics/actions** - Batch ingest, max 25 events. Accepts both JSON and text content types (for `sendBeacon` compatibility). Runs all inserts within a `db.transaction()`. Each event individually validated and sampled.

Both endpoints always return `{ success: true }` regardless of validation failures.

`processAction()` handles:
1. Session/visitor hashing
2. Page path derivation (from payload or referer header)
3. Page type classification via `parsePagePath()`
4. Row insert into `site_analytics_actions`
5. Transition detection: queries the last action for the same session, inserts into `site_analytics_transitions` if `feature_key` changed

## Frontend Tracker

File: `src/shared/utils/siteAnalytics.js`

### Queue

Actions are queued in-memory via `enqueueAction()`:

- Max 100 items in queue. Overflow drops oldest.
- Flush triggers: every 5 seconds (`ACTION_FLUSH_INTERVAL`) or when queue reaches 25 items (`ACTION_FLUSH_THRESHOLD`).
- `flushActions()` sends a batch via `POST /api/v1/analytics/actions`.
- On `visibilitychange` (hidden) and `pagehide`: flushes via `navigator.sendBeacon()`.
- On flush failure: batch is discarded silently.

### Deduplication

`isDuplicateAction()` skips consecutive events with the same `feature_key` + `action_name` + `target_key` within 200ms.

### Tracking methods

All methods are fire-and-forget, never throw:

- `trackAction(payload)` - Enqueue a raw action event
- `trackFeatureStart(featureKey, actionName, metadata)` - Shorthand for `action_type='start'`
- `trackFeatureComplete(featureKey, actionName, metadata)` - Shorthand for `action_type='complete'`
- `trackFeatureError(featureKey, actionName, metadata)` - Shorthand for `action_type='error'`
- `trackClick(featureKey, targetKey, metadata)` - Shorthand for `action_type='click'`
- `trackPerformance(featureKey, metricName, durationMs, metadata)` - Shorthand for `action_type='performance'`

Each method automatically attaches `window.location.pathname` as `page_path`.

## Instrumented Components

Five components have manual tracking calls:

### LandingPage.jsx (`landing_feed`)

`src/modules/home/components/LandingPage.jsx`

- `trackFeatureStart('landing_feed', 'page_load')` - After initial feed loads in the `useEffect`
- `trackClick('landing_feed', '{contentType}_card_click')` - On each feed item click, with `content_type` and `content_id` in metadata

### PlaylistView.jsx (`playlist_view`)

`src/modules/playlists/components/PlaylistView.jsx`

- `trackFeatureStart('playlist_view', 'page_load')` - After playlist data loads, alongside existing `metaPixel.trackEvent('ViewContent')`
- `trackClick('playlist_view', 'dsp_link_click')` - On each streaming platform button (Spotify, Apple, Tidal, Qobuz, SoundCloud), with `platform` in metadata
- `trackClick('playlist_view', 'share_click')` - On the share button
- `trackClick('playlist_view', 'cta_click')` - On the custom action link, with `label` in metadata

### ExpandableTrack.jsx (`playlist_track`)

`src/modules/playlists/components/ExpandableTrack.jsx`

- `trackClick('playlist_track', 'track_expand')` - In `handleToggle()` when expanding (not collapsing), with `track_id` and `position`
- `trackClick('playlist_track', 'dsp_link_click')` - In `handleStreamingClick()`, with `platform` and `track_id`
- `trackClick('playlist_track', 'preview_play')` - On the `PreviewButton` wrapper, with `track_id`

### CuratorPlaylistCreate.jsx (`curator_create`)

`src/modules/curator/components/CuratorPlaylistCreate.jsx`

- `trackFeatureStart('curator_create', 'page_load')` - On profile load in the mount `useEffect`
- `trackFeatureStart('curator_create', 'import_submit')` - At the start of `handleUrlImport()`
- `trackFeatureComplete('curator_create', 'import_success')` - After URL import completes
- `trackFeatureError('curator_create', 'import_error')` - In the import catch block
- `trackClick('curator_create', 'publish_click')` - At the start of `handlePublish()`
- `trackFeatureComplete('curator_create', 'publish_success')` - After publish confirms
- `trackFeatureError('curator_create', 'publish_error')` - When publish response fails

### CuratorPlaylists.jsx (`curator_library`)

`src/modules/curator/components/CuratorPlaylists.jsx`

- `trackFeatureStart('curator_library', 'page_load')` - In the profile load `useEffect`
- `trackClick('curator_library', 'playlist_click')` - In `handleSelectPlaylist()`, with `playlist_id`
- `trackClick('curator_library', 'publish_click')` / `trackClick('curator_library', 'republish_click')` - In `handleRepublish()`, with `playlist_id`

## Priority Scoring

Endpoint: `GET /api/v1/admin/analytics/priorities` in `server/api/admin/analytics.js`

Accepts `range` and `unit` query params (uses existing `getMinutesFromQuery()` helper, default 30 days).

### Response sections

**topline** - Total sessions, unique visitors, tracked actions, active features count for the range.

**featureUsage** - Per-feature: sessions, actions, usage_share (feature sessions / total sessions), growth_pct (current window vs prior window of same length).

**featureFriction** - Per-feature: starts, completes, errors, dropoff_rate, error_rate. Dropoff is computed server-side as sessions with a `start` but no `complete` for the same feature within the same session.

**topClickTargets** - Top 50 click targets grouped by feature + target_key, with click count and unique sessions.

**topTransitions** - Top 30 feature-to-feature transitions from `site_analytics_transitions`, with count and unique sessions.

**priorityRanking** - Scored and sorted list of features. Scoring formula:

```
friction_score = 0.50 * dropoff_rate + 0.35 * error_rate + 0.15 * rage_rate
absolute_impact = round(friction_score * feature_sessions)
priority_score = (0.6 * usage_share + 0.4 * (absolute_impact / max_absolute_impact)) * friction_score * 100
```

Sorted descending. Highest score = best candidate for product investment. Features with zero friction score zero regardless of usage.

## Admin UI

### PrioritiesView.jsx

File: `src/modules/admin/components/tabs/PrioritiesView.jsx`

Added as a 7th sub-tab in `AnalyticsTab.jsx` via:

```jsx
{ id: 'priorities', label: 'Priorities', content: <PrioritiesView /> }
```

Uses the same dark theme (`AT` object), styled components, and Recharts patterns as the existing analytics views.

### Panels

1. **Time range selector** - Preset chips: 7d, 14d, 30d, 90d
2. **Topline KPIs** - 4-column grid: Total Sessions, Tracked Actions, Active Features, Unique Visitors
3. **Priority Ranking table** - Columns: Feature, Score (color-coded badge), Usage Share, Dropoff, Error Rate, Rage Rate, Impact. Sorted by priority_score descending.
4. **Feature Transitions chart** - Recharts horizontal `BarChart` of top 10 transitions. Label format: `from_feature -> to_feature`.
5. **Click Hotspots table** - Feature, Target, Clicks, Sessions. Top 20.
6. **Friction Detail table** - Feature, Starts, Completes, Errors, Dropoff Rate, Error Rate. Rates > 25% are highlighted red.
7. **Feature Usage table** - Feature, Sessions, Actions, Usage Share, Growth percentage.

## Data Retention

`server/services/analyticsService.js` - `cleanupOldActions()` runs daily at 3 AM alongside existing cleanup. Deletes rows older than 90 days from both `site_analytics_actions` and `site_analytics_transitions`.

## Config

In `ecosystem.config.cjs`:

- `ANALYTICS_ACTION_SAMPLE_RATE` - Server-side sample rate, 0.0-1.0 (default `1.0`)
- `ANALYTICS_DEV_MODE` - Set to `'true'` to track dev traffic (default `'false'`)
