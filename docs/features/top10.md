# Top 10 Playlists

Public user feature for creating and sharing personal Top 10 playlists for 2025. Users import tracks from DSP platforms, add commentary, and publish a public page with audio previews and social sharing.

## When to use

- Implementing Top 10 onboarding, editor, or public view
- Debugging import, track management, or publishing flows
- Understanding audio preview integration for inline tracks
- Working on Instagram share image generation
- Modifying Top 10 data models or API endpoints

## User flow

### 1. Onboarding (`/top10/start`)
- **Component**: `src/modules/top10/components/Top10Onboarding.jsx`
- **Store**: `src/modules/top10/store/onboardingStore.js`
- **Authentication**: Passwordless signup with auto-verification
  - Step 1: Email input (generates random password, auto-verifies)
  - Step 2: Display name entry
  - Step 3: Platform information (educational screen)
  - Step 4: Playlist URL import from 7 DSPs
- **API**: `POST /api/v1/auth/signup` with `autoVerify: true`
- **API**: `PUT /api/v1/users/me/profile` updates display name
- **API**: `POST /api/v1/top10/import` imports tracks from URL
- Creates initial Top 10 with imported tracks

### 2. Editing (`/top10`)
- **Component**: `src/modules/top10/components/Top10Editor.jsx`
- **Store**: `src/modules/top10/store/editorStore.js`
- **Features**:
  - Drag-drop track reordering (positions 1-10)
  - Track blurb editor per track (`Top10BlurbEditor.jsx`)
  - Manual track entry (`ManualTrackEntry.jsx`)
  - Track metadata editing (title, artist, album, duration)
  - Instagram share modal (`Top10InstagramShareModal.jsx`)
  - Publish/unpublish toggle
  - Export to DSPs (Spotify, Apple Music, Tidal)
- **API**: `GET /api/v1/top10/me` fetches user's Top 10
- **API**: `PUT /api/v1/top10/:id` updates tracks and metadata
- **API**: `POST /api/v1/top10/:id/publish` publishes Top 10
- **API**: `POST /api/v1/top10/:id/unpublish` unpublishes Top 10
- **API**: `POST /api/v1/top10/export` exports to DSP platform

### 3. Public view (`/top10/:slug`)
- **Component**: `src/modules/top10/components/Top10View.jsx`
- **Header**: `Top10Header.jsx` shows 2025 logo and curator name
- **Tracks**: `Top10TrackCard.jsx` displays track with metadata, blurb, DSP links, preview
- **Footer**: `Top10Footer.jsx` shows DSP export links and "Make your own" CTA
- **Features**:
  - Audio previews via `PreviewButton` (inline tracks without IDs)
  - DSP platform links
  - Track blurbs with rich text
  - View count tracking (rate limited: 1 per IP per 24h)
- **API**: `GET /api/v1/top10/:slug` fetches published Top 10
- **API**: `POST /api/v1/top10/:id/view` tracks view count

### 4. Browse page (`/top10/browse`)
- **Component**: `src/modules/top10/components/Top10List.jsx`
- **Layout**: Matches CuratorList page styling (light background, ReusableHeader, breadcrumb)
- **Features**:
  - Grid of cards showing all published Top 10s
  - Each card displays: placeholder artwork, display name, artist list
  - "Make your own" CTA button in header
  - Responsive grid (2 cols tablet, 1 col mobile)
- **API**: `GET /api/v1/top10/browse` fetches all published Top 10s
- **Navigation**: Conditional "TOP 10" link in public hamburger menu
  - Controlled by admin toggle: Operations → Site Settings → "Show Top 10 in Navigation"
  - Setting: `show_top10_in_nav` in `admin_system_config` table
  - Context helper: `useSiteSettings().isTop10NavVisible()`

## Data model

### `top10_playlists` table
- `id`, `user_id`
- `title`, `description`, `cover_image_url`
- `tracks` (JSON array of 10 track objects)
- `is_published`, `published_at`, `slug`
- `spotify_export_url`, `apple_export_url`, `tidal_export_url`
- `export_requested_at`, `export_completed_at`
- `view_count`, `share_count`, `featured`
- `created_at`, `updated_at`

`display_name` comes from `users.display_name` when API responses join user data.

### Track structure (JSON in `tracks` column)
Each track object:
- `position` (1-10)
- `title`, `artist`, `album`, `duration`
- `artwork_url`
- `blurb` (rich text HTML)
- `spotify_url`, `apple_music_url`, `tidal_url`, `youtube_url`, `soundcloud_url`, `bandcamp_url`, `qobuz_url`
- `isrc` (optional, for preview matching)

## Audio previews

Top 10 tracks don't exist in the `tracks` table (inline data only). Audio preview system handles this via:

### AudioPreviewContext integration
- **Context**: `src/shared/contexts/AudioPreviewContext.jsx`
- **Endpoint**: `POST /api/v1/preview/inline` (for tracks without IDs)
- **Request body**: `{ artist, title, isrc }`
- **CSRF protection**: Reads token from cookie, includes in `X-CSRF-Token` header
- **Matching**: Database lookup first, then Deezer search by ISRC or artist+title
- **Cache**: 30-minute frontend TTL, database cache for existing tracks

### Database-first lookup (track-overlap-cache)
Before calling Deezer API, the `/preview/inline` endpoint checks the `tracks` table:
- **Service**: `server/services/trackLookupService.js`
- **Lookup order**: ISRC match → metadata match (title + artist)
- **Cache hit**: Returns `/api/v1/preview/stream/{trackId}` URL (serves from DB)
- **Cache miss**: Falls back to Deezer API search
- **Performance**: ~1ms database lookup vs ~200-500ms Deezer API call
- **Logging**: `PREVIEW_CACHE` events for monitoring hit rates

### Track identification
- **With ID**: Compare by `track.id`
- **Without ID**: Compare by `artist + title` (case-insensitive)
- **Component**: `src/modules/playlists/components/PreviewButton.jsx`
- **isCurrentTrack**: Updated to handle inline tracks (lines 341-359)

## Import system

### URL import
- **Service**: `server/services/top10ImportService.js`
- **Supported platforms**: Spotify, Apple Music, Tidal, Qobuz, SoundCloud, YouTube, Bandcamp
- **Process**:
  1. Parse URL to detect platform
  2. Call platform-specific API (Spotify uses existing `/api/v1/spotify/import-url`)
  3. Normalize track metadata
  4. Fetch artwork and store URLs
  5. Enrich from database (track-overlap-cache)
  6. Return track array for Top 10 creation
- **Validation**: URL format validation per platform
- **Error handling**: Platform-specific error messages

### Database enrichment (track-overlap-cache)
Imported tracks are enriched with data from the `tracks` table:
- **Service**: `server/services/trackLookupService.js` → `enrichTrackFromDatabase()`
- **Lookup order**: ISRC → Spotify ID → metadata (title + artist)
- **Merged fields**: `apple_music_url`, `tidal_url`, `soundcloud_url`, `bandcamp_url`, `qobuz_url`, `artwork_url`, `isrc`
- **Benefit**: Imports get cross-platform links from curator playlists without additional API calls
- **Logging**: `TRACK_ENRICHMENT` events for monitoring

## Export system

### DSP export
- **Service**: `server/services/top10ExportService.js`
- **Platforms**: Spotify, Apple Music, Tidal
- **Process**:
  1. User clicks export in editor
  2. Backend creates playlist on DSP using curator's OAuth tokens
  3. Adds tracks by searching platform APIs
  4. Returns export URL
  5. Stores URL in `top10_playlists` table
- **Requirements**: User must have connected DSP account
- **Fallback**: If track not found on platform, skips with warning

## Instagram share

### Share image generation
- **Component**: `src/modules/top10/components/InstagramStoryGenerator.jsx`
- **Modal**: `Top10InstagramShareModal.jsx`
- **Canvas rendering**: Generates 1080x1920px Instagram Story image
- **Design**:
  - Black background
  - 2025 logo at top
  - Track positions with visual bars
  - Track metadata (title, artist)
  - Flowerpil branding at bottom
- **Download**: Triggers browser download of PNG
- **Safe zone**: Respects Instagram Story safe zones

## Referral code eligibility

Top 10 users receive a referral code to become full curators only when ALL conditions are met:
1. Email entered
2. Display name entered
3. User attempted a DSP URL import (success or failure counts, manual entry does not)

### Tracking
- **Store**: `onboardingStore.js` tracks `attemptedDspImport` (persisted to localStorage)
- **Set**: When user submits a DSP URL in onboarding step 4 (`Top10Onboarding.jsx:1284`)
- **Passed**: To publish endpoint via request body (`Top10Editor.jsx`)

### Publish with referral
- `POST /api/v1/top10/:id/publish` accepts `{ attemptedDspImport: boolean }`
- Referral code only generated if all 3 conditions met (`server/api/top10.js:827-851`)
- Email with referral code sent via `sendTop10PublishEmail()`

## Purgatory state

Users who publish a Top 10 but haven't signed up as curators are in "purgatory":
- Have `role='user'` (stored in `users` table, not `admin_users`)
- Have a published Top 10 (`is_published = 1`)
- Referral code status is exposed via `hasReferralCode` (unused referral code if present)

### Checking purgatory status
- **Endpoint**: `GET /api/v1/top10/purgatory-status`
- **Response**: `{ isPurgatory: boolean, hasReferralCode: boolean }`
- Only returns true for `role='user'` (curators/admins return false)

### Purgatory CTA modal
When a purgatory user visits a playlist page:
1. If the user is authenticated with `role='user'` and the snooze window allows it, check purgatory status via API
2. If `isPurgatory` is true, show `PurgatoryCTAModal`
3. Modal: "want to make playlists? we've sent a referral code to your inbox"
4. 24-hour snooze on dismiss (localStorage: `fp:purgatory-cta:snoozeUntil`)

**Files**:
- `src/modules/playlists/components/PurgatoryCTAModal.jsx` - Modal component with snooze logic
- `src/modules/playlists/components/PlaylistView.jsx` - Integration

### Navigation gating
- `GET /api/v1/auth/status` includes `user.top10_playlist_id` for UI gating.

## Admin operations

### Feature on landing page
- **Endpoint**: `PUT /api/v1/admin/top10/:id/feature` with `{ featured: 1 | 0 }`
- **Effect**: Creates/updates a `landing_page_links` card for `/top10/:slug` when featured, and unpublishes it when unfeatured.

### Bulk email
- **Endpoint**: `POST /api/v1/admin/top10/bulk-email` with `{ subject, message }`
- **Audience**: Unique emails from `top10_playlists` joined to `users`
- **Behavior**: Invalid emails are skipped; response includes recipient, invalid, sent, and failed counts.

### Delete
- **Endpoint**: `DELETE /api/v1/admin/top10/:id`
- **Effect**: Unpublishes the landing page link, deletes the Top 10, and deletes the public user only if there is no matching curator/admin account (`admin_users.username = users.email`).

### Landing page cleanup
- **UI**: Site Admin > Content > Landing Page Links
- **Endpoint**: `POST /api/v1/admin/site-admin/landing-page-links/prune-top10`
- **Effect**: Unpublishes cards whose `/top10/:slug` no longer exists in `top10_playlists`.

## Publishing

### Publish flow
1. User completes Top 10 in editor
2. Clicks "Publish" button
3. **Frontend**: Calls `POST /api/v1/top10/:id/publish` with `{ attemptedDspImport }`
4. **Backend**:
   - Validates all 10 positions filled
   - Generates unique slug from display name
   - Sets `is_published = 1`, `published_at = now()`
   - If eligible (email + name + DSP import attempt), generates referral code and sends email
   - Returns success with slug
5. **Frontend**: Redirects to public view at `/top10/:slug`

### Unpublish flow
1. User clicks "Unpublish" in editor
2. **API**: `POST /api/v1/top10/:id/unpublish`
3. Sets `is_published = 0`
4. Public URL becomes inaccessible (returns 404)

### Slug generation
- **Base**: Display name converted to lowercase, spaces → hyphens
- **Sanitization**: Removes non-alphanumeric characters except hyphens
- **Collision handling**: Appends 4-char random suffix if slug exists
- **Max attempts**: 3 attempts before error

## View tracking

### Analytics
- **Endpoint**: `POST /api/v1/top10/:id/view`
- **Rate limiting**: 1 view per IP per 24 hours
- **Privacy**: IP addresses hashed with SHA-256
- **Storage**: `view_tracking` table with `top10_id`, `ip_hash`, `viewed_at`
- **Increment**: Updates `view_count` in `top10_playlists` on unique view

## Component architecture

### Editor components
- **Top10Editor.jsx**: Main editing interface with track list
- **Top10TrackList.jsx**: Drag-drop reorderable track list
- **Top10BlurbEditor.jsx**: Rich text editor for track commentary
- **ManualTrackEntry.jsx**: Form for manual track addition
- **Top10PositionBar.jsx**: Visual position indicator (10→1 countdown)

### Public view components
- **Top10View.jsx**: Public playlist display
- **Top10Header.jsx**: Logo and curator name header
- **Top10TrackCard.jsx**: Track card with metadata, blurb, DSP links, preview
- **Top10Footer.jsx**: DSP export links and CTA
- **Top10List.jsx**: Browse page with grid of all published Top 10s

### Shared components
- **Top10Onboarding.jsx**: Four-step onboarding flow
- **Top10PublishSuccessModal.jsx**: Post-publish confirmation
- **Top10InstagramShareModal.jsx**: Instagram share image generator

## State management

### Onboarding store
- **File**: `src/modules/top10/store/onboardingStore.js`
- **Zustand store** with localStorage persistence
- **State**: Current step, form data, auth state, loading/error states
- **Actions**: `nextStep()`, `prevStep()`, `updateFormData()`, `reset()`

### Editor store
- **File**: `src/modules/top10/store/editorStore.js`
- **Zustand store** with Top 10 data
- **State**: Tracks, metadata, publish status, loading/error states
- **Actions**: `loadTop10()`, `updateTrack()`, `reorderTracks()`, `publish()`, `unpublish()`

## API endpoints

### Public
- `GET /api/v1/top10/featured` - List featured Top 10s
- `GET /api/v1/top10/recent` - List recent published Top 10s
- `GET /api/v1/top10/browse` - List all published Top 10s for browse page
- `GET /api/v1/top10/:slug` - Get published Top 10 by slug
- `POST /api/v1/top10/:id/view` - Track view (rate limited)

### Authenticated
- `GET /api/v1/top10/me` - Get user's Top 10
- `GET /api/v1/top10/me/playlist` - Legacy alias for current user's Top 10
- `GET /api/v1/top10/purgatory-status` - Check if user is in purgatory state
- `POST /api/v1/top10/import` - Import from URL
- `PUT /api/v1/top10/:id` - Update Top 10
- `POST /api/v1/top10/:id/publish` - Publish Top 10 (accepts `{ attemptedDspImport }`)
- `POST /api/v1/top10/:id/unpublish` - Unpublish Top 10
- `POST /api/v1/top10/export` - Export to DSP

### Admin
- `GET /api/v1/admin/top10/list` - List Top 10s with filters
- `POST /api/v1/admin/top10/bulk-email` - Send bulk email to Top 10 users
- `GET /api/v1/admin/top10/:id` - Fetch Top 10 details
- `PUT /api/v1/admin/top10/:id/feature` - Feature/unfeature on landing page
- `DELETE /api/v1/admin/top10/:id` - Delete Top 10
- `POST /api/v1/admin/top10/:id/export` - Manually trigger DSP export

### Site Admin
- `GET /api/v1/admin/site-admin/landing-page-links` - List landing page link cards
- `POST /api/v1/admin/site-admin/landing-page-links` - Create landing page link card
- `PUT /api/v1/admin/site-admin/landing-page-links/:id` - Update landing page link card
- `DELETE /api/v1/admin/site-admin/landing-page-links/:id` - Delete landing page link card
- `POST /api/v1/admin/site-admin/landing-page-links/prune-top10` - Unpublish stale Top 10 cards

## Routes

- `/top10/start` - Onboarding flow
- `/top10/browse` - Browse all published Top 10s
- `/top10` - Editor (requires auth)
- `/top10/:slug` - Public view

## Dev mode

### Testing shortcuts
- **Activation**: Press Shift+D+E+V in onboarding
- **Effect**: Click-to-skip through steps with dummy data
- **Indicator**: Yellow "DEV MODE" badge in top-right
- **Data**: Prefills email, display name, test Spotify URL
- **Purpose**: Rapid visual testing without completing real signup

## Mobile optimization

### Design guidelines
- **Min font size**: 16px to prevent iOS zoom
- **Touch targets**: ≥48px (buttons 48px on mobile, 56px on desktop)
- **Viewport**: Mobile-first, responsive to 375px
- **Typography**: Fluid sizing with `clamp()`
- **Action bar**: Right-aligned buttons with consistent sizing
- **Preview button**: Matches DSP button styling on mobile

### Button styling
- **Desktop**: 44x44px with drop shadow, border-radius: 0
- **Mobile**: 48x48px with subtle border, border-radius: 2px
- All buttons identical size and spacing
- Right-aligned for natural thumb access

## Common issues

### Preview buttons all change state
- **Cause**: Tracks lack unique IDs, all match as `undefined === undefined`
- **Fix**: `isCurrentTrack` compares by artist+title for inline tracks (AudioPreviewContext.jsx:341-359)

### CSRF token errors on preview
- **Cause**: POST requests to `/api/v1/preview/inline` missing CSRF header
- **Fix**: AudioPreviewContext reads CSRF token from cookie, includes in request (lines 223-232)

### Mobile buttons stretched
- **Cause**: `flex: 1` on action buttons
- **Fix**: Use `flex-shrink: 0` with fixed width (Top10TrackCard.jsx:336-367)

### Stale landing page cards
- **Cause**: `landing_page_links` entry references a deleted Top 10 slug
- **Fix**: Unpublish/delete the card in Site Admin > Content > Landing Page Links, or run the prune action

## Related features

- **Audio Previews**: See `src/shared/contexts/AudioPreviewContext.jsx`
- **DSP Import**: See `dsp-workflow` skill for import flows
- **DSP Export**: See `exports` skill for export workflow
- **Authentication**: See `auth` skill for signup/login
