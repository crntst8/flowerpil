## Purpose
Displays a call-to-action banner below the site header after users spend 10 seconds on the site. The banner promotes Instagram engagement through A/B tested messaging and tracks user interactions for analytics.

## How It Works
`src/shared/components/LinkOutBanner/LinkOutBanner.jsx` fetches configuration from `/api/v1/linkout/config`, assigns the user to variant A or B (stored in localStorage), and tracks eligibility based on cumulative time spent across all pages. Once the user has been on the site for 10 seconds (tracked via `fp:linkout:visitStart` timestamp in localStorage), the banner becomes eligible. After a 500ms delay, the banner fades in below the header with variant-specific headline and link. User interactions (impressions, clicks, dismissals) are tracked to `/api/v1/linkout/track` with time-to-action metrics. Dismissal or link click sets a 7-day snooze via `fp:linkout:snoozeUntil` in localStorage.

## API/Interface
- `GET /api/v1/linkout/config` (file: `server/api/linkout.js:322-364`)
  Returns: `{ success: boolean, data: { enabled: boolean, variantA: { headline: string, link: string }, variantB: { headline: string, link: string } } }`
  Reads from `linkout_config` table. Disabled by default (`enabled=0`).

- `POST /api/v1/linkout/track` (file: `server/api/linkout.js:367-419`)
  Body: `{ variant: 'A'|'B', eventType: 'impression'|'click'|'dismiss', timeToAction: number|null, userFingerprint: string }`
  Writes to `linkout_analytics` table. No authentication required (public tracking).

- `GET /api/v1/admin/linkout/config` (file: `server/api/admin/linkout.js:8-44`)
  Requires admin auth. Returns full config including enabled status.

- `PUT /api/v1/admin/linkout/config` (file: `server/api/admin/linkout.js:47-102`)
  Requires admin auth, CSRF token. Updates variant headlines, links, and enabled status.

- `GET /api/v1/admin/linkout/analytics` (file: `server/api/admin/linkout.js:105-174`)
  Query params: `timeRange` ('24h'|'7d'|'30d'|'all'), `variant` ('A'|'B'|'all').
  Returns aggregated metrics: total impressions/clicks/dismissals per variant, CTR, dismiss rate, average time-to-action.

## Database
- `linkout_config` table (file: `server/database/migrations/050_linkout_modal.js:6-15`):
  Single-row configuration with columns `id`, `variant_a_headline`, `variant_a_link`, `variant_b_headline`, `variant_b_link`, `enabled` (default 0), `created_at`, `updated_at`. Default values: "want to know when we publish new playlists?" and "find new music every week" both linking to Instagram.

- `linkout_analytics` table (file: `server/database/migrations/050_linkout_modal.js:18-28`):
  Columns: `id`, `variant`, `event_type` ('impression'|'click'|'dismiss'), `time_to_action`, `user_fingerprint`, `created_at`. Indexes on `(variant, event_type, created_at)` for analytics queries and `(user_fingerprint, created_at)` for user behavior tracking.

## Integration Points
- `src/App.jsx:19,41` imports and renders `<LinkOutBanner />` at root level, outside authentication providers, ensuring visibility for all users including non-logged-in visitors.

- `src/modules/admin/components/SiteAdmin.jsx:11,231` imports and renders `<LinkOutAdminPanel />` in the admin interface under Settings section (line 231).

- `src/dev/DevUserSwitcher.jsx:290-315` provides developer controls:
  - "Show Banner Now" button sets `fp:linkout:visitStart` to 11 seconds ago and reloads
  - "Reset All LinkOut Preferences" clears all localStorage keys (`fp:linkout:snoozeUntil`, `fp:linkout:visitStart`, `fp:linkout:variant`) and reloads

- Server routes registered in `server/index.js:370,379` for public endpoints and `server/index.js:261` for admin endpoints.

## Component Architecture
`LinkOutBanner.jsx` manages five state variables:
- `config` - fetched configuration object
- `variant` - assigned variant ('A' or 'B')
- `isEligible` - true after 10-second threshold
- `isVisible` - controls CSS opacity/transform animation
- `isDismissed` - prevents reopening after user dismisses

State flow (lines 142-264):
1. Fetch config on mount (lines 142-156)
2. Check snooze and assign variant (lines 159-179): If `fp:linkout:snoozeUntil` exists and future, return early. Otherwise retrieve or generate variant (50/50 random split), store in `fp:linkout:variant`, and initialize `fp:linkout:visitStart` if not set.
3. Check eligibility every second (lines 182-202): Calculate elapsed time from `fp:linkout:visitStart`. If >= 10 seconds, set `isEligible` to true and stop interval.
4. Show banner after eligibility (lines 205-214): Once eligible and not dismissed, wait 500ms then set `isVisible` to true and track impression timestamp.
5. Track impression (lines 217-221): When visible, send impression event to analytics API.

Event handlers (lines 162-189):
- `trackEvent(eventType, timeToAction)` - POSTs to `/api/v1/linkout/track` with variant, event type, optional time-to-action, and fingerprint (`${variant}-${Date.now()}`).
- `handleClose()` - Tracks dismiss event with time-to-action, sets `isVisible` and `isDismissed` to false/true, writes 7-day snooze timestamp to localStorage, removes visit start timestamp.
- `handleLinkClick()` - Tracks click event, closes banner, sets snooze, removes visit start. Link opens in new tab via `target="_blank" rel="noopener noreferrer"`.

Conditional rendering (lines 273-302):
Returns null until config, variant, and eligibility are all satisfied. Then renders portal to `document.body` containing styled overlay and container with flower icon, headline, clickable link text, and close button.

## Styling
`BannerOverlay` (lines 12-18): Fixed position at `top: 60px` (below header), full width, z-index 9999, pointer-events none on overlay.

`BannerContainer` (lines 20-50): Positioned banner with max-width 600px centered, dark background (`rgba(0,0,0,0.88)`), backdrop blur, dashed border, padding. Animates via `opacity` and `translateY(20px → 0)` over 300ms ease-out when `$isVisible` prop changes. Mobile responsive: full width, no border-radius or side borders, smaller padding.

`Headline` (lines 70-81): Bold white text using primary font. Font size reduces on mobile.

`LinkText` (lines 83-94): Underlined white text with hover opacity change.

`CloseButton` (lines 96-123): Positioned absolute top-right, transparent background, × symbol, hover opacity effect. Mobile adjustments for smaller size and position.

`FlowerIcon` (lines 52-58): 48×48px flower image (`/public/images/linkout-flower.png`), scales down to 40×40px on mobile.

## Admin Panel
`src/modules/admin/components/LinkOutAdminPanel.jsx` provides admin interface with three tabs:

Configuration tab (lines 99-250):
- Toggle to enable/disable banner globally
- Separate forms for Variant A and Variant B with headline and link inputs
- Save button validates and PUTs to `/api/v1/admin/linkout/config`
- Displays last updated timestamp

Analytics tab (lines 252-382):
- Time range selector (24h, 7d, 30d, all time)
- Variant filter (A, B, all)
- Metrics cards showing total impressions, clicks, dismissals, CTR, dismiss rate, average time-to-action
- Per-variant breakdown with side-by-side comparison

Preview tab (lines 384-449):
- Live preview of banner appearance for both variants
- "Test Banner" button that simulates banner with sample data
- Shows actual styling, positioning, and responsive behavior

State management (lines 59-97):
Fetches config and analytics on mount and when filters change. Updates optimistically on save with error rollback. Loading and error states displayed via styled components.

## Configuration
Database defaults (`server/database/migrations/050_linkout_modal.js:6-15`):
- `enabled`: 0 (disabled)
- `variant_a_headline`: "want to know when we publish new playlists?"
- `variant_a_link`: "https://instagram.com/flowerpil"
- `variant_b_headline`: "find new music every week"
- `variant_b_link`: "https://instagram.com/flowerpil"

LocalStorage keys:
- `fp:linkout:snoozeUntil` - Unix timestamp (milliseconds) until which banner is snoozed
- `fp:linkout:variant` - Assigned variant ('A' or 'B'), persists across sessions
- `fp:linkout:visitStart` - Unix timestamp (milliseconds) of first visit, cleared after dismissal

Constants (lines 6-10):
- `SNOOZE_DAYS`: 7
- `ENGAGEMENT_THRESHOLD`: 10000 (10 seconds in milliseconds)

## File Reference
### Frontend
- `src/shared/components/LinkOutBanner/LinkOutBanner.jsx` - Main banner component
- `src/modules/admin/components/LinkOutAdminPanel.jsx` - Admin interface
- `src/modules/admin/components/SiteAdmin.jsx` - Admin integration point
- `src/App.jsx` - Root-level banner integration
- `src/dev/DevUserSwitcher.jsx` - Developer testing controls

### Backend
- `server/api/linkout.js` - Public endpoints (config, track)
- `server/api/admin/linkout.js` - Admin endpoints (config CRUD, analytics)
- `server/index.js` - Route registration

### Database
- `server/database/migrations/050_linkout_modal.js` - Schema migration

### Assets
- `public/images/linkout-flower.png` - Banner icon

## Usage Examples
```javascript
// Enable banner via admin API
await fetch('/api/v1/admin/linkout/config', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken
  },
  body: JSON.stringify({
    enabled: true,
    variantA: {
      headline: 'Get weekly music updates',
      link: 'https://instagram.com/flowerpil'
    },
    variantB: {
      headline: 'Never miss a new playlist',
      link: 'https://instagram.com/flowerpil'
    }
  })
});
```

```javascript
// Track custom event (internal use)
trackEvent('impression', null); // First appearance
trackEvent('click', 5234); // Clicked after 5.234 seconds
trackEvent('dismiss', 12000); // Dismissed after 12 seconds
```

```javascript
// Query analytics via admin API
const response = await fetch('/api/v1/admin/linkout/analytics?timeRange=7d&variant=all');
const data = await response.json();
// Returns: { impressions, clicks, dismissals, ctr, dismissRate, avgTimeToAction, variantA: {...}, variantB: {...} }
```

```sql
-- Database queries (used by API)
SELECT variant, event_type, COUNT(*) as count
FROM linkout_analytics
WHERE created_at >= datetime('now', '-7 days')
GROUP BY variant, event_type;

SELECT AVG(time_to_action) as avg_time
FROM linkout_analytics
WHERE event_type = 'click' AND time_to_action IS NOT NULL;
```
