# Site Analytics

Privacy-first analytics system for tracking page visits, unique users, realtime activity, traffic sources, exit pages, and geographic data.

## Architecture

The system consists of five main components:

1. **Frontend Tracking Script** - Captures pageviews, scroll depth, time on page
2. **Public API** - Receives tracking events from the frontend
3. **Admin API** - Provides aggregated data for the admin dashboard
4. **Admin UI** - Analytics tab in the site admin dashboard
5. **Background Service** - Cleans up stale sessions and old data

## Privacy Measures

- No IP addresses stored (only used for hashing)
- No raw User-Agent stored (parsed to device/browser type)
- Session hash rotates daily using `SHA256(IP + UserAgent + dailySalt)`
- Visitor hash is stable for unique counting: `SHA256(IP + UserAgent + staticSalt)`
- Referrer domain only stored (full URLs stripped)
- No cookies used (sessionStorage for session scope)
- 90-day event retention (raw events deleted, aggregates kept)

## Database Schema

Migration: `/server/database/migrations/068_site_analytics.js`

### Tables

**site_analytics_events** - High-frequency event logging
- `session_hash`, `visitor_hash` - Anonymized identifiers
- `page_path`, `page_type`, `resource_id` - Page information
- `event_type` - 'pageview' or 'exit'
- `referrer_domain`, `utm_source/medium/campaign/term/content` - Traffic source
- `country_code`, `device_type`, `browser_family`, `os_family` - Client info
- `time_on_page`, `scroll_depth` - Engagement metrics (exit events only)

**site_analytics_daily** - Daily aggregates
- Pageviews, unique visitors, unique sessions
- JSON breakdowns: `referrer_breakdown`, `country_breakdown`, `device_breakdown`

**site_analytics_weekly** / **site_analytics_monthly** - Periodic aggregates with growth rates

**site_analytics_realtime** - Live session tracking
- `session_hash`, `page_path`, `last_heartbeat`
- Sessions without heartbeat in 2 minutes are cleaned up

**site_analytics_exits** - Exit page tracking
- `page_path`, `exit_count`, `avg_time_before_exit`

## Frontend Tracking

File: `/src/shared/utils/siteAnalytics.js`

The `SiteAnalytics` class initializes on app mount via `/src/App.jsx`:

```javascript
useEffect(() => {
  siteAnalytics.init();
}, []);
```

### Key Methods

- `init()` - Sets up tracking, scroll listener, exit handler, route detection
- `trackPageview()` - Sends pageview to `/api/v1/analytics/track`
- `setupScrollTracking()` - Tracks max scroll depth via passive listener
- `setupExitTracking()` - Uses `visibilitychange`, `beforeunload`, `pagehide`
- `sendExitEvent()` - Uses `navigator.sendBeacon` for reliable delivery
- `startHeartbeat()` - Pings `/api/v1/analytics/heartbeat` every 30 seconds
- `setupRouteChangeDetection()` - Intercepts `history.pushState/replaceState` and `popstate`

Session ID stored in `sessionStorage` under key `fp_analytics_session`.

## Public API

File: `/server/api/analytics.js`

### Endpoints

**POST /api/v1/analytics/track** - Track pageview
- Extracts IP from `cf-connecting-ip` or `x-forwarded-for`
- Extracts country from `cf-ipcountry` header (Cloudflare)
- Hashes session and visitor identifiers
- Parses page path to determine type (playlist, curator, home, etc.)
- Inserts into `site_analytics_events` and updates `site_analytics_realtime`

**POST /api/v1/analytics/heartbeat** - Keep realtime session alive
- Updates `last_heartbeat` in `site_analytics_realtime`

**POST /api/v1/analytics/exit** - Track page exit
- Accepts `text/*` content type for `sendBeacon` compatibility
- Records `time_on_page` and `scroll_depth`
- Updates `site_analytics_exits` aggregates
- Removes session from `site_analytics_realtime`

### Helper Functions

- `getDailySalt()` - Returns date-based salt for session hashing
- `hashSession(ip, ua)` - Creates daily-rotating session hash
- `hashVisitor(ip, ua)` - Creates stable visitor hash
- `parsePagePath(path)` - Returns `{ type, id }` for page classification
- `extractReferrerDomain(referrer)` - Strips URL to domain only
- `getDeviceType(ua)` / `getBrowserFamily(ua)` / `getOSFamily(ua)` - UA parsing
- `isBot(ua)` - Filters crawler traffic

## Admin API

File: `/server/api/admin/analytics.js`

All endpoints require CSRF token and admin authentication.

### Endpoints

**GET /api/v1/admin/analytics/overview**
- Returns today/7d/30d pageviews, unique visitors, sessions
- Includes average time on page and current realtime count
- Optional `range` + `unit` (minutes/hours/days) to include a custom range summary (5 minutes to 30 days)

**GET /api/v1/admin/analytics/realtime**
- Returns active visitors grouped by page
- Sessions with heartbeat in last 2 minutes

**GET /api/v1/admin/analytics/events?limit=100&page_type=&event_type=pageview**
- Returns recent events for the event log view
- Supports filtering by page type and event type

**GET /api/v1/admin/analytics/pages?days=7**
- Returns top pages by views
- Returns top exit pages with average time before exit
- Returns breakdown by page type

**GET /api/v1/admin/analytics/geography?days=7**
- Returns country breakdown with view counts and percentages

**GET /api/v1/admin/analytics/sources?days=7**
- Returns referrer breakdown
- Returns UTM campaign breakdown
- Returns device and browser breakdown

**GET /api/v1/admin/analytics/traffic?days=7**
- Returns daily traffic data
- Returns hourly traffic for today
- Optional `range` + `unit` to return bucketed series for the custom timeframe

**GET /api/v1/admin/analytics/journeys?days=7**
- Returns top session patterns (page type sequences with frequency)
- Entry pages (first page visited per session)
- Exit pages with average time before exit
- Session depth distribution (1 page, 2 pages, 3+, etc.)
- Analyzes up to 500 most recent multi-page sessions

**GET /api/v1/admin/analytics/behavior?days=7**
- Scroll depth distribution (0-25%, 25-50%, 50-75%, 75-100%)
- Time on page distribution (buckets: <10s, 10-30s, 30-60s, 1-2min, 2-5min, 5+min)
- Device engagement comparison (avg time and scroll per device type)
- Bounce rate by page type (single-page sessions / total sessions)
- Hourly engagement patterns (avg time and scroll by hour of day)

**GET /api/v1/admin/analytics/content?days=30**
- Top playlists with engagement metrics (views, visitors, avg time, avg scroll)
- Top curators with engagement metrics
- Content type performance comparison
- Trending content (7-day vs prior 7-day growth percentage)

**GET /api/v1/admin/analytics/export?type=daily&days=30**
- CSV export with types: daily, events, pages, resources
- Customizable date ranges (up to 90 days)

## Admin UI

File: `/src/modules/admin/components/tabs/AnalyticsTab.jsx`

Added to admin dashboard via `/src/modules/admin/components/AdminPage.jsx` in `TAB_CONFIG`:

```javascript
{ id: 'analytics', label: 'Analytics', component: AnalyticsTab }
```

### Design

Dark monitoring-dashboard aesthetic with data-dense panel grids.

**Theme:** `#0a0a0f` background, `#12121a` panel surfaces, `#1e1e2e` borders.
**Accent colors:** Cyan (visitors/views), Purple (engagement), Green (positive/live), Amber (warnings/bounce), Red (drops/exits), Blue (playlists).

**Charting Library:** Recharts - provides AreaChart, BarChart, PieChart with custom dark tooltips.

### Sub-tabs

Uses `SubTabNavigation` component with 6 views:

1. **Live** (`LiveView`) - Realtime visitor count with pulsing indicator, active pages table. Auto-refreshes every 15 seconds.

2. **Overview** (`OverviewView`) - Custom timeframe control (5 minutes to 30 days) drives range metrics (views, visitors, sessions, avg time) and the traffic trend chart. 30-day totals remain below. CSV export dropdown.

3. **Content** (`ContentView`) - Top playlists ranked by views with engagement metrics (avg time, scroll depth). Top curators. Content type donut chart. Trending content with week-over-week growth percentages. Content type bar chart comparison.

4. **Journeys** (`JourneysView`) - Top session patterns displayed as colored step sequences (e.g., home -> playlist -> playlist) with frequency bars. Session depth pie chart. Entry and exit page tables.

5. **Acquisition** (`AcquisitionView`) - Traffic area chart over time. Traffic sources horizontal bar chart. Device breakdown donut. Geography table with percentages. Browser table. UTM campaign table.

6. **Behavior** (`BehaviorView`) - Insight cards surfacing mobile vs desktop gaps. Scroll depth bar chart. Time on page distribution. Device engagement grouped bars (time + scroll). Bounce rate by page type. Hourly engagement area chart.

### Key Patterns

- All views use `adminGet()` from `/src/modules/admin/utils/adminApi.js`
- Period selectors (7d/14d/30d/60d/90d) per tab
- Custom `ChartTooltip` component for consistent dark-themed tooltips
- `TrendBadge` for positive/negative indicators
- `TypeBadge` for color-coded page type labels
- `InsightCard` for surfacing actionable UX findings
- `FreqBar` for proportional frequency visualization in journey patterns
- All grids collapse to single column on mobile (768px breakpoint)

## Background Service

File: `/server/services/analyticsService.js`

Started in `/server/index.js` via `startAnalyticsService()`.

### Functions

- `cleanupRealtimeSessions()` - Runs every 60 seconds, removes sessions with no heartbeat in 2 minutes
- `cleanupOldEvents()` - Runs daily at 3 AM, deletes events older than 90 days
- `cleanupOldExits()` - Runs daily, deletes exit data older than 90 days

## Page Type Classification

The `parsePagePath()` function in `/server/api/analytics.js` classifies pages:

| Path Pattern | Type |
|--------------|------|
| `/` | home |
| `/playlists/*` | playlist |
| `/curators/*` or `/@*` | curator |
| `/lists/*` | list |
| `/top10/*` | top10 |
| `/search` | search |
| Other | other |

## Route Registration

Routes registered in `/server/index.js`:

```javascript
// Public tracking (no CSRF)
app.use('/api/v1/analytics', analyticsRoutes);

// Admin dashboard (CSRF protected)
app.use('/api/v1/admin/analytics', adminSecurityHeaders, validateCSRFToken, adminAnalyticsRoutes);
```
