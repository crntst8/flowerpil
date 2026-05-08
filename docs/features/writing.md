# Premium Editorial System (Writing)

Long-form editorial content for Flowerpil with draft/publish workflows, curator ownership, staged rollout controls, feed cards, sidebar navigation, SEO fields, and per-piece analytics.

## Rollout Model

Writing now uses a two-phase rollout controlled by site admin config key `writing_rollout`.

### Config Storage

- Table: `admin_system_config`
- Key: `writing_rollout`
- Service: `server/services/writingRolloutService.js`

```json
{
  "phase": "pilot",
  "pilot_curator_ids": [],
  "show_in_home_feed": false,
  "show_sidebar_nav": false
}
```

### Phase Behavior

- `pilot`
- Only allowlisted curator IDs get dashboard + publishing access.
- Public feed cards and sidebar nav are off by default.

- `public`
- All curator accounts get dashboard + publishing access.
- `show_in_home_feed` and `show_sidebar_nav` default to enabled unless explicitly set `false`.

### Permission Resolution

`getWritingPermissions(user, rolloutConfig)` returns:

- `can_access_dashboard`
- `can_manage_all`
- `can_publish`
- `rollout_phase`
- `show_in_home_feed`
- `show_sidebar_nav`

Admins always have writing access and can manage all pieces.

## Site Admin Controls

Writing rollout is managed under Site Admin Content tab via `WritingTab`.

### Admin API

Routes in `server/api/admin/siteAdmin.js`:

- `GET /api/v1/admin/site-admin/writing-rollout`
- `PUT /api/v1/admin/site-admin/writing-rollout`
- `GET /api/v1/admin/site-admin/writing-rollout/curators`

### Admin UI

- File: `src/modules/admin/components/tabs/WritingTab.jsx`
- Embedded under: `src/modules/admin/components/tabs/ContentTab.jsx`

Controls:

- Rollout phase selector (`pilot` or `public`)
- Curator allowlist picker for pilot
- Toggle: show writing cards in landing feed
- Toggle: enable public writing sidebar endpoint

## Database Schema

Writing data lives in `feature_pieces` plus feature-flag assignments.

### `feature_pieces`

```sql
CREATE TABLE feature_pieces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  author_name TEXT,
  curator_id INTEGER,
  excerpt TEXT,
  metadata_type TEXT DEFAULT 'Feature',
  metadata_date TEXT,
  hero_image TEXT,
  hero_image_caption TEXT,
  seo_title TEXT,
  seo_description TEXT,
  canonical_url TEXT,
  newsletter_cta_label TEXT,
  newsletter_cta_url TEXT,
  featured_on_homepage INTEGER DEFAULT 0,
  homepage_display_order INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  last_viewed_at DATETIME,
  content_blocks TEXT NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (curator_id) REFERENCES curators(id) ON DELETE SET NULL
)
```

### `feature_piece_flag_assignments`

```sql
CREATE TABLE feature_piece_flag_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_piece_id INTEGER NOT NULL,
  flag_id INTEGER NOT NULL,
  assigned_by INTEGER,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (feature_piece_id, flag_id),
  FOREIGN KEY (feature_piece_id) REFERENCES feature_pieces(id) ON DELETE CASCADE,
  FOREIGN KEY (flag_id) REFERENCES custom_playlist_flags(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES admin_users(id)
)
```

### Writing Migration

- File: `server/database/migrations/099_writing_rollout_and_analytics.js`
- Adds curator ownership, SEO/CTA/homepage fields, view analytics columns, and feature-flag assignment table.

## Prepared Queries

Writing-related queries in `server/database/db.js` include:

- `getFeaturePiecesByCurator`
- `getPublishedFeaturePiecesForHomepage`
- `incrementFeaturePieceViews`
- `getFeaturePieceFlags`
- `assignFeaturePieceFlag`
- `removeFeaturePieceFlag`

Existing list/detail/create/update/publish queries remain and now include curator + SEO/CTA/homepage fields.

## API Routes

Routes live in `server/api/feature-pieces.js`.

Response envelope:

```json
{ "success": true, "data": {} }
```

or

```json
{ "success": false, "error": "message" }
```

### Public Routes

- `GET /api/v1/feature-pieces`
- Published pieces.

- `GET /api/v1/feature-pieces/:slug`
- Published piece by slug.
- Increments `view_count` and `last_viewed_at`.

- `GET /api/v1/feature-pieces/feed`
- Landing-feed cards.
- Returns empty array when rollout `show_in_home_feed` is disabled.

- `GET /api/v1/feature-pieces/sidebar?limit=8`
- Sidebar list for writing pages.
- Returns empty array when rollout `show_sidebar_nav` is disabled.

### Curator/Admin Routes

All require `authMiddleware + requireAnyRole(['curator','admin'])`.

- `GET /api/v1/feature-pieces/access`
- Current writing permissions for the requesting user.

- `GET /api/v1/feature-pieces/mine`
- Curator-scoped list.
- Admin can optionally pass `curator_id`.

- `GET /api/v1/feature-pieces/analytics`
- Totals + top pieces by view count.
- Admin can optionally pass `curator_id`.

- `GET /api/v1/feature-pieces/drafts`
- Scoped drafts.

- `GET /api/v1/feature-pieces/all`
- Scoped full list.

- `GET /api/v1/feature-pieces/id/:id`
- Edit payload by numeric ID.

- `POST /api/v1/feature-pieces`
- Create draft piece.
- Curator ownership enforced.
- Attempts to auto-assign `Feature` tag.

- `PUT /api/v1/feature-pieces/:id`
- Update piece.
- Curators can only update own pieces.

- `DELETE /api/v1/feature-pieces/:id`
- Delete piece.
- Curators can only delete own pieces.

- `POST /api/v1/feature-pieces/:id/publish`
- Publish piece.
- Requires `can_publish` and ownership/admin.

- `POST /api/v1/feature-pieces/:id/unpublish`
- Unpublish piece.
- Requires `can_publish` and ownership/admin.

- `POST /api/v1/feature-pieces/upload-image`
- Image upload (multer + Sharp + R2).
- Requires writing dashboard access.

## Curator Dashboard

Curator writing workspace is now gated by rollout permissions.

### Dashboard Integration

- File: `src/modules/curator/components/CuratorDashboard.jsx`
- New tab: `writing`
- Tab visibility depends on `can_access_dashboard` from `/api/v1/feature-pieces/access`.

### Writing Panel

- File: `src/modules/curator/components/CuratorWritingPanel.jsx`
- Uses:
- `fetchAccess()`
- `fetchMine()`
- `fetchAnalytics()`

Displays:

- Totals (pieces, published, drafts, total views)
- Piece list with status + updated/published dates
- Quick actions: `New Piece`, `Edit`, `View`

## Public Surfaces

### Landing Feed Card

- Service: `src/modules/home/services/unifiedFeedService.js`
- Writing cards come from `GET /api/v1/feature-pieces/feed`.
- Mapped as `contentType: 'feature'`.

- Rendered in: `src/modules/home/components/LandingPage.jsx`
- Card component: `src/modules/features/components/FeaturePieceFeedCard.jsx`

Card behavior:

- Playlist-card style layout
- Shows date, author attribution, title, excerpt/subtitle
- Renders attached flags
- Flag click routes to `/content-tag/:slug`

### Sidebar Navigation Endpoint

- `FeaturePieceView` calls `fetchSidebarItems()`.
- Sidebar is shown only when endpoint returns items (rollout toggle enabled).

### SEO in Public View

`FeaturePieceView` applies:

- `seo_title` fallback to piece title
- `seo_description` fallback to excerpt/subtitle
- `canonical_url` fallback to `/features/:slug`

`SEO` component now accepts absolute canonical URLs (`http://` or `https://`) and site-relative canonicals.

## Content Tag Integration

Writing pieces now participate in content-tag pages.

### Public API

- Endpoint: `GET /api/v1/content-tag/:slug` in `server/api/public.js`
- Response now includes:
- `tag.feature_count`
- `features[]` (published feature pieces with flags)

### Frontend

- File: `src/modules/content-tags/components/ContentTagPage.jsx`
- Renders a dedicated `Writing` section using `FeaturePieceFeedCard`
- Count summary includes playlists, posts, and features

## Editor and Migration-Oriented Controls

Store and editor now include fields targeted for Substack migration parity:

- `excerpt`
- `seo_title`
- `seo_description`
- `canonical_url`
- `newsletter_cta_label`
- `newsletter_cta_url`
- `featured_on_homepage`
- `homepage_display_order`

Files:

- `src/modules/features/store/featureEditorStore.js`
- `src/modules/features/components/FeaturePieceEditor.jsx`

### Inline Quote Behavior

- Side `+` controls on a body block insert an inline `pull_quote` immediately before that body block.
- Inline quote alignment (`left` / `right`) controls float direction.
- This ordering lets the quote wrap around the target body text block instead of rendering below it.

## Draft/Publish and Ownership Rules

- New pieces start as `draft`.
- Curators can only manage pieces where `feature_pieces.curator_id === req.user.curator_id`.
- Admin can manage all pieces.
- Slugs are auto-generated and deduplicated (`-1`, `-2`, etc).
- Public slug route only returns `status='published'`.

## Operational Notes

- Run database migration before enabling rollout in admin:
- `npm run db:migrate`

- For staggered launch:
1. Keep phase `pilot` and curate allowlist.
2. Let pilot curators create/publish and monitor analytics.
3. Move to `public` when stable.
4. Enable home feed + sidebar toggles for broad discovery.
