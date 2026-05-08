# Flowerpil Reusable Patterns Reference

Reference for LLM agents implementing new features. Check here BEFORE building.

---

## 1. URL/Content Import System

**THE unified import pattern.** Use everywhere content is imported from external URLs.

### Backend
- `server/services/urlImportService.js` - Platform detection, URL parsing, metadata resolution
- `server/services/urlImportRunner.js` - Background job execution
- `server/api/url-import.js` - API routes

### Endpoints
```
POST /api/v1/url-import/detect     → { platform, kind }
POST /api/v1/url-import/jobs       → Create background import job
GET  /api/v1/url-import/jobs/:id   → Poll job status
POST /api/v1/url-import/resolve-track → Single track resolution
```

### Supported Platforms
Spotify, Apple Music, TIDAL, Qobuz, SoundCloud, YouTube, Bandcamp

### Frontend Integration
- `CuratorPlaylistCreate.jsx` - `handleUrlImport()`
- `CuratorPlaylists.jsx` - `handleUrlImport()`
- `ManualTrackEntry.jsx` (Top10) - Uses `/resolve-track`

**RULE: Any "Import from URL" feature MUST use this system, not platform-specific endpoints.**

---

## 2. Design System (Curator UI)

**Location:** `src/modules/curator/components/ui/index.jsx`

### Core Exports
```jsx
import {
  Button, IconButton,
  Input, Select, TextArea, FormField,
  Stack, Flex, Grid,
  Card, SectionCard,
  SectionHeader, SectionTitle,
  PageHeader, PageHeaderActions,
  StatusBanner, Badge, StatusDot,
  StickyActionBar, ActionBar,
  Toolbar, ToolbarGroup, FilterPill, SearchInput,
  EmptyState, List, ListItem,
  TabList, Tab,
  tokens, theme, mediaQuery
} from './ui/index.jsx';
```

### Button Variants
`primary`, `secondary`, `success`, `danger`, `dangerOutline`, `ghost`, `olive`, `default`

### Button Sizes
`sm` (36px), `md` (44px), `lg` (56px)

### Design Tokens
```js
tokens.spacing[1-16]     // 4px base unit
tokens.sizing.touchTarget // 44px minimum
tokens.shadows.card       // 4px 4px 0 #000
tokens.transitions.fast   // 0.15s ease
```

---

## 3. Header System

### Homepage Header
- `src/modules/home/components/LandingHeader.jsx`
- Black background, centered flower logo, accordion menu
- Used ONLY on `/home` landing page

### ReusableHeader
- `src/shared/components/ReusableHeader.jsx`
- Black background, left text logo, accordion menu
- Used on ALL other public pages (playlists, curators, browse, etc.)

### Curator Dashboard Header
- Defined within `CuratorDashboard.jsx`
- Different pattern - has tabs, user menu, etc.

**RULE: New public pages use `ReusableHeader`. Never recreate headers.**

---

## 4. Modal System

**Location:** `src/shared/components/Modal/Modal.jsx`

### Usage
```jsx
import { ModalRoot, ModalSurface, ModalHeader, ModalTitle, ModalBody, ModalFooter, ModalCloseButton } from '@shared/components/Modal/Modal';

<ModalRoot isOpen={isOpen} onClose={handleClose}>
  <ModalSurface $size="md">
    <ModalCloseButton />
    <ModalHeader>
      <ModalTitle>Title</ModalTitle>
    </ModalHeader>
    <ModalBody>{content}</ModalBody>
    <ModalFooter>{actions}</ModalFooter>
  </ModalSurface>
</ModalRoot>
```

### Sizes
`xs` (360px), `sm` (440px), `md` (560px), `lg` (720px), `xl` (920px), `full` (1180px)

### Features
- Focus trapping, scroll lock, ESC to close, backdrop click to close
- Portal-based rendering
- Accessible (aria-modal, labelledby)

---

## 5. Image System

### ResponsiveImage Component
```jsx
import ResponsiveImage from '@shared/components/ResponsiveImage';
import { IMAGE_SIZES } from '@shared/utils/imageUtils';

<ResponsiveImage
  src={imageUrl}
  alt="Description"
  sizes={IMAGE_SIZES.CARD_MEDIUM}
  loading="lazy"
/>
```

### Image Processing
- `processSpotifyArtwork(url, 'playlist')` → 9 variants (3 sizes × 3 formats)
- `processSpotifyArtwork(url, 'track')` → 3 JPG variants
- Stored in R2: `playlists/{uuid}_{size}.{format}`

### Size Variants
`small` (300px), `medium` (600px), `large` (1200px)

### Icon System
- Upload: `POST /api/v1/icons/upload`
- Library: `GET /api/v1/icons/library`
- Component: `<IconWithFallback src={url} />` (falls back to flower emoji)

---

## 6. Audio Preview System

### Context
```jsx
import { useAudioPreview } from '@shared/contexts/AudioPreviewContext';

const { playPreview, stopPreview, currentTrack, isPlaying, isLoading } = useAudioPreview();
```

### PreviewButton Component
```jsx
import PreviewButton from '@modules/playlists/components/PreviewButton';

<PreviewButton track={track} />
```

### Backend
- `GET /api/v1/preview/stream/:trackId` - Streams audio
- `GET /api/v1/preview/:trackId` - Metadata only
- `POST /api/v1/preview/inline` - For tracks without IDs (uses artist+title)

---

## 7. Cross-Platform Linking

### Trigger Linking
```jsx
const response = await authenticatedFetch('/api/v1/cross-platform/link-playlist', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ playlistId })
});
const { jobId } = await response.json();
```

### Poll Status
```jsx
const status = await authenticatedFetch(`/api/v1/cross-platform/job-status/${jobId}`);
// { status: 'processing', progress: { total, processed, found } }
```

### Backend Service
- `server/services/crossPlatformLinkingService.js` - Orchestration
- `server/services/appleMusicApiService.js` - Apple Music matching
- `server/services/tidalService.js` - TIDAL matching
- `server/services/spotifyService.js` - Spotify matching

---

## 8. Layout Patterns

### Public Page Structure
```jsx
<PageContainer>      {/* min-height: 100vh, centered */}
  <ReusableHeader />
  <Breadcrumb />     {/* if applicable */}
  <ContentWrapper>   {/* max-width: 1400px */}
    {/* page content */}
  </ContentWrapper>
</PageContainer>
```

### Curator Dashboard Structure
```jsx
<PageContainer>
  <Header />         {/* Custom curator header */}
  <Toolbar />        {/* Filters, search */}
  <ContentWrapper>
    <SectionCard>
      <SectionHeader>
        <SectionTitle>Section Name</SectionTitle>
      </SectionHeader>
      {/* content */}
    </SectionCard>
  </ContentWrapper>
  <StickyActionBar /> {/* Save/Cancel buttons */}
</PageContainer>
```

### Admin Panel Structure
```jsx
<AdminDashboardLayout>
  <CollapsibleSection title="SECTION">
    {/* content */}
  </CollapsibleSection>
</AdminDashboardLayout>
```

---

## 9. Form Patterns

### Standard Form
```jsx
<FormField label="Email" error={errors.email} required>
  <Input
    type="email"
    value={email}
    onChange={e => setEmail(e.target.value)}
    $error={!!errors.email}
  />
</FormField>
```

### Import Tools Pattern
```jsx
// Tabbed interface: "Paste Text" | "From DSP"
<ImportTabs>
  <ImportTab $active={tab === 'text'}>Paste Text</ImportTab>
  <ImportTab $active={tab === 'dsp'}>From DSP</ImportTab>
</ImportTabs>
```

---

## 10. State Management

### Zustand Stores
```jsx
// src/modules/{feature}/store/{feature}Store.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useFeatureStore = create(
  persist(
    (set, get) => ({
      data: null,
      loading: false,
      setData: (data) => set({ data }),
      reset: () => set({ data: null, loading: false }),
    }),
    { name: 'feature-store' }
  )
);
```

### Examples
- `src/modules/top10/store/editorStore.js`
- `src/modules/top10/store/onboardingStore.js`

---

## 11. API Patterns

### Authenticated Fetch
```jsx
const { authenticatedFetch } = useAuth();

const response = await authenticatedFetch('/api/v1/endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
```

### Response Format
```json
{
  "success": true,
  "data": { ... }
}
// or
{
  "success": false,
  "error": "Error message"
}
```

### Common Endpoints
```
/api/v1/playlists/:id          - Playlist CRUD
/api/v1/curator/*              - Curator operations
/api/v1/admin/*                - Admin operations
/api/v1/export/*               - DSP export
/api/v1/cross-platform/*       - Cross-platform linking
/api/v1/linker/*               - URL/platform resolution
```

---

## 12. Content Display Hierarchy

When displaying featured content (playlist, release, track):

```
1. TYPE / DATE        ← smallest, mono, uppercase (e.g., "PLAYLIST / JAN 2025")
2. ATTRIBUTION        ← medium, primary font, lighter weight (curator/artist name)
3. TITLE              ← largest, primary font, heavier weight
```

---

## VISUAL DESIGN PATTERNS

These are the "feel" patterns - harder to codify but critical for consistency.

---

## V1. Homepage Feed Card Anatomy

**Reference:** `src/modules/home/components/FeedPlaylistCard.jsx`

The canonical "content card" used on the homepage feed. Copy this structure for any new card-based listing.

```
┌─────────────────────────────────────────────────────────┐
│  [FLAG TABS - hang from top edge, colored backgrounds]  │ ← FlagsContainer (absolute, top: 0)
│                                                         │
│  ┌─────────┐   CURATOR NAME | CURATOR TYPE              │ ← CuratorInfo (smaller, opacity 0.8)
│  │         │   PLAYLIST TITLE                           │ ← PlaylistTitle (largest, bold)
│  │  IMAGE  │   ┌─────┐ ┌─────┐ ┌──────┐                │ ← GenreTagList
│  │ 150x150 │   │GENRE│ │GENRE│ │GENRE │                │ ← GenreTag chips
│  │         │   └─────┘ └─────┘ └──────┘                │
│  └─────────┘                                            │
└─────────────────────────────────────────────────────────┘
```

**Key elements:**
- Card has `border: 1px solid black`, subtle box-shadow
- Image is fixed square (150px desktop, 120px mobile)
- Image scales up slightly on hover (`transform: scale(1.05)`)
- Content section is flex-column, left-aligned
- Entire card is wrapped in a `<Link>` for navigation

---

## V2. Genre Chips (GenreTag)

Small pill-shaped labels showing playlist/content categorization. NOT buttons, just visual labels.

**Reference:** `FeedPlaylistCard.jsx` lines 405-427

```jsx
const GenreTag = styled.span`
  display: inline-flex;
  padding: 2px 8px;
  border: 1px solid ${props => props.$color};
  color: ${props => props.$color};
  font-family: ${theme.fonts.primary};
  font-size: clamp(0.5rem, 1.2vw, 0.7rem);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-radius: 0;                    // Square corners
  background: transparent;
`;
```

**Characteristics:**
- Border and text same color (passed via `$color` prop)
- Transparent background
- Square corners (no border-radius)
- Very small text, uppercase
- Usually displayed in a row with small gap

**Data source:** `playlist.tags` → parsed via `parseGenreTags()` → resolved via `genreLookup.resolve(tag)`

---

## V3. Content Flags (FlagButton)

Colored tabs that hang from the top edge of cards. These ARE clickable - they link to content tag pages.

**Reference:** `FeedPlaylistCard.jsx` lines 458-537

```
      ┌──────┐ ┌──────┐
      │ FLAG │ │ FLAG │    ← Hang from top, no top border
──────┴──────┴─┴──────┴────────────────────────
│                                              │
│              CARD CONTENT                    │
```

**Characteristics:**
- Position: absolute, top: 0, right: aligned with card edge
- Border on left, right, bottom only (no top border - creates "hanging" effect)
- Background color from `flag.color`, text from `flag.text_color`
- On hover: padding increases to "extend" the tab downward
- Links to `/content-tag/${flag.url_slug}`
- Font: primary, bold, capitalized (not uppercase)

**Data source:** `playlist.flags` array with `{ id, text, color, text_color, url_slug }`

---

## V4. Playlist Detail Page Layout

**Reference:** `src/modules/playlists/components/PlaylistView.jsx`

```
┌──────────────────────────────────────────────────────────────┐
│ [REUSABLE HEADER]                                            │
├──────────────────────────────────────────────────────────────┤
│ Home / Playlists / Playlist Title                            │ ← Breadcrumb
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    PLAYLIST BY                             │ ← Small, mono, gray
│  │              │    CURATOR NAME | TYPE                     │ ← Link, underlined
│  │    LARGE     │    PLAYLIST TITLE                          │ ← Largest, bold
│  │    IMAGE     │                                            │
│  │              │    ABOUT THIS PLAYLIST:                    │ ← If description exists
│  │              │    [description text]                      │
│  │              │                                            │
│  │              │    [Spotify] [Apple] [Tidal] [Share] [CTA] │ ← Action buttons
│  └──────────────┘                                            │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  TRACK 1  Artist - Title                    [actions]        │ ← ExpandableTrack
│  TRACK 2  Artist - Title                    [actions]        │
│  ...                                                         │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  [END SCROLL SECTION - Related playlists]                    │
└──────────────────────────────────────────────────────────────┘
```

**Text hierarchy in detail page:**
1. `PublishDate` - smallest, mono, uppercase (e.g., "JAN 15, 2025")
2. "Playlist By" header - tiny, mono
3. `CuratorLink` - bold, underlined, links to curator page
4. `CuratorTypeDisplay` - inline after curator name, lighter
5. `PlaylistTitle` - largest, bold, Helvetica Neue

---

## V5. Action Button Patterns

**Page-level actions (PlaylistView):**
```jsx
<StreamingIconButton>     // Icon-only, 44x44, for DSP links
<ActionButton>            // Icon + text, for Share/etc
<CustomActionLink>        // Icon + text, for curator CTAs
```

**Track-level actions (ExpandableTrack):**
- Smaller icons (32x32 on desktop, 44x44 on mobile for touch)
- Row of platform icons
- Preview button integrated

---

## V6. Two-Part Layouts (Hero + List)

Many pages follow: **Hero section** (image + metadata) → **List section** (tracks/items)

```
┌─────────────────────────────────────────┐
│           HERO SECTION                  │  ← Dark or light background
│     (image, title, metadata, actions)   │
├─────────────────────────────────────────┤
│           LIST SECTION                  │  ← Usually light/fpwhite background
│     (tracks, items, cards)              │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

The background color change creates visual separation.

---

## V7. Shadow Layering

Two separate shadow systems exist. Use the right one for context.

**Public theme** (`src/shared/styles/GlobalStyles.js` → `theme.shadows`):
```
card:        0 2px 8px rgba(0, 0, 0, 0.08)
cardHover:   0 4px 16px rgba(0, 0, 0, 0.12)
modal:       0 8px 32px rgba(0, 0, 0, 0.24)
button:      3px 3px 0 #000
buttonHover: 4px 4px 0 #000
```

**Curator design system** (`ui/index.jsx` → `tokens.shadows`):
```
card:        4px 4px 0 #000
cardHover:   6px 6px 0 #000
cardActive:  2px 2px 0 #000
button:      3px 3px 0 #000
buttonHover: 4px 4px 0 #000
buttonActive:2px 2px 0 #000
modal:       0 32px 80px rgba(0, 0, 0, 0.64)
subtle:      0 2px 8px rgba(0, 0, 0, 0.08)
```

Public pages use soft card shadows. Curator dashboard uses brutalist card shadows.

---

## V8. Mobile Collapse Pattern

Desktop two-column layouts collapse to single column:

```
DESKTOP:                          MOBILE:
┌────────┐ ┌────────────┐        ┌──────────────┐
│ IMAGE  │ │  CONTENT   │   →    │    IMAGE     │
│        │ │            │        ├──────────────┤
└────────┘ └────────────┘        │   CONTENT    │
                                 └──────────────┘
```

Content centers on mobile. Touch targets expand to 44-48px minimum.

---

## 13. Shared Admin Components

**Location:** `src/modules/admin/components/shared/`

- `CollapsibleSection` - Expandable sections with title
- `ColorPicker` - Color selection
- `EmptyState` - Empty state display
- `InlineEditor` - Inline text editing
- `SearchFilter` - Search input with filtering
- `StatusMessage` - Success/error messages
- `ConfirmationDialog` - Confirm actions
- `SubTabNavigation` - Sub-tab navigation
- `Toast` - Toast notifications

---

## 14. Platform Icons

```jsx
import PlatformIcon from '@shared/components/PlatformIcon';

<PlatformIcon platform="spotify" size={24} />
```

Supported: `spotify`, `apple`, `tidal`, `soundcloud`, `bandcamp`, `youtube`, `instagram`, `discord`, `twitter`, `x`, `facebook`, `tiktok`, `linkedin`, `twitch`, `website`, `email`, `curator`

---

## 15. Loading States

### Skeleton Pattern
```jsx
const SkeletonRow = styled.div`...`;
const SkeletonImage = styled.div`...`;
const SkeletonLine = styled.div`...`;

{loading && (
  <LoadingContainer>
    {[0, 1, 2].map((idx) => (
      <SkeletonRow key={idx}>
        <SkeletonImage />
        <SkeletonLine />
      </SkeletonRow>
    ))}
  </LoadingContainer>
)}
```

### Bootstrap Service
```jsx
import { fetchBootstrapData } from '@shared/services/bootstrapService';

const { siteSettings, genres } = await fetchBootstrapData();
```

---

## 16. Defensive Patterns (from prod-patches)

Recurring production issues distilled into rules. See `docs/prod-patch/` for full incident details.

### DSP Data Extraction: Extract All Available Fields

When integrating with a DSP API (Spotify, Apple Music, TIDAL, etc.), extract **every useful field** the API returns - not just the ones immediately needed. Compare new implementations against the Spotify import path as the reference.

Fields commonly missed: `artwork_url`, `album_artwork_url`, `isrc`, `duration_ms`.

```javascript
// BAD - only extracting IDs
const result = { id: track.id, url: track.url };

// GOOD - extract all available metadata
const result = {
  id: track.id,
  url: track.url,
  isrc: track.external_ids?.isrc || null,
  artwork_url: track.album?.images?.[0]?.url || null,
  album_artwork_url: track.album?.images?.[0]?.url || null,
  duration_ms: track.duration_ms || null,
};
```

**RULE: When adding or modifying a DSP integration, diff the returned fields against Spotify's implementation to check for gaps.**

---

### Data Updates: Merge, Don't Replace

When updating or re-importing track data, merge new values into existing records without overwriting data that's already present.

**SQL pattern** - `COALESCE(NULLIF(...))` fills NULLs and empty strings without clobbering:
```sql
UPDATE tracks SET
  artwork_url = COALESCE(NULLIF(artwork_url, ''), ?),
  album_artwork_url = COALESCE(NULLIF(album_artwork_url, ''), ?)
WHERE id = ?
```

**JS pattern** - fallback chain on merge:
```javascript
return {
  ...existingTrack,
  artwork_url: existingTrack.artwork_url || newTrack.artwork_url || null,
  album_artwork_url: existingTrack.album_artwork_url || newTrack.album_artwork_url || null,
};
```

**RULE: Never discard incoming data when reusing existing records. Use COALESCE/fallback to fill gaps.**

---

### Worker Resilience: Isolate Non-Critical Operations

Non-critical operations (telemetry, heartbeats, analytics) must never crash a worker. Wrap in try/catch with silent fallback.

```javascript
// BAD - heartbeat failure kills the worker
insertHeartbeatStmt.run(workerId, status);

// GOOD - heartbeat failure is logged and swallowed
try {
  insertHeartbeatStmt.run(workerId, status);
} catch (err) {
  if (err?.code !== 'SQLITE_BUSY' && !err?.message?.includes('database is locked')) {
    console.warn('[TELEMETRY] Heartbeat write failed:', err?.message || err);
  }
}
```

For `SQLITE_BUSY` in worker query loops, return empty and let the next cycle retry:
```javascript
try {
  rows = db.prepare(sql).all(limit);
} catch (err) {
  if (err?.message?.includes('database is locked') || err?.code === 'SQLITE_BUSY') {
    return []; // Next poll cycle will retry
  }
  throw err;
}
```

**RULE: Workers should only crash on unrecoverable errors. DB contention is transient - retry on next cycle.**

---

### React Hook Ordering: Define Before Dependents

In large components, `useCallback`/`useMemo` hooks must be defined **above** any hook that references them in a dependency array. `const` declarations in the Temporal Dead Zone cause a `ReferenceError` that crashes silently in production builds with no useful stack trace.

```javascript
// BAD - handleImport references triggerLinking before it's defined
const handleImport = useCallback(() => {
  triggerLinking(playlistId); // ReferenceError in TDZ
}, [triggerLinking]);

const triggerLinking = useCallback(() => { ... }, []);

// GOOD - triggerLinking defined first
const triggerLinking = useCallback(() => { ... }, []);

const handleImport = useCallback(() => {
  triggerLinking(playlistId);
}, [triggerLinking]);
```

**RULE: When adding a new `useCallback`/`useMemo`, check if any existing hook depends on it and place it above those hooks.**

---

## 17. Authentication Middleware

**Location:** `server/middleware/auth.js`

Three tiers of route protection, used on every API route:

```javascript
import { authMiddleware, optionalAuth, requireRole, requireAdmin } from '../middleware/auth.js';

// Requires valid JWT - blocks unauthenticated users
router.get('/curator/playlists', authMiddleware, handler);

// Allows both authenticated and anonymous - sets req.user or null
router.get('/playlists/:id', optionalAuth, handler);

// Requires specific role - must follow authMiddleware
router.post('/admin/settings', authMiddleware, requireAdmin, handler);

// Custom role check
router.put('/curator/profile', authMiddleware, requireRole('curator'), handler);
```

After `authMiddleware`, `req.user` contains:
```javascript
{
  id, username, email, role,
  curator_id,    // null if not a curator
  curator_name,
  tester,        // boolean
  is_demo         // boolean
}
```

**RULE: Every new API route must use one of these. Public routes use `optionalAuth`, authenticated routes use `authMiddleware`, admin routes add `requireAdmin`.**

---

## 18. Structured Logging

**Location:** `server/utils/logger.js`

All server-side logging uses component tags for filtering:

```javascript
import logger from '../utils/logger.js';

logger.info('URL_IMPORT_JOB', 'Enqueued job', { jobId, platform, url });
logger.error('AUTO_EXPORT', 'Failed to queue', { playlistId, error: err.message });
logger.warn('RATE_LIMIT_EXCEEDED', 'Auth limit hit', { ip, endpoint });
logger.debug('WORKER', 'Processing track', { trackId, platform });
```

Common tags: `URL_IMPORT_JOB`, `AUTO_EXPORT`, `EXPORT_QUEUE`, `AUTH_MIDDLEWARE`, `AUTH_LOGIN`, `WORKER`, `TELEMETRY`, `APPLE_MUSIC`, `APPLE_LINK`, `CIRCUIT_APPLE`

**RULE: Always use `logger.level('TAG', message, data)` format. Choose a descriptive uppercase tag. Never use bare `console.log` in service files.**

---

## 19. Database Transactions

**Location:** `server/database/db.js` (better-sqlite3)

Use `db.transaction()` for multi-step write operations that must succeed or fail together:

```javascript
const tx = db.transaction(() => {
  const stmt = db.prepare('UPDATE tracks SET position = ? WHERE id = ? AND playlist_id = ?');
  for (const track of reorderedTracks) {
    stmt.run(track.position, track.id, playlistId);
  }
});

tx(); // Runs atomically - all succeed or all roll back
```

Used in: `playlistImportService.js`, `urlImportRunner.js`, `exportRequestService.js`, `rebuild-search-index.js`

**RULE: Any operation that writes to multiple rows or tables in a single logical step must use `db.transaction()`. Never leave partial writes possible.**

---

## 20. localStorage Key Convention

All client-side storage keys use the `fp:` or `fp_` prefix for namespacing:

```javascript
// Colon-separated for feature scoping
'fp:curator:hasSeenBioModal'
'fp:curator:showFirstVisitDSPModal'
'fp:linkout:snoozeUntil'
'fp:linkout:visitStart'
'fp:linkout:variant'
'fp:linkout:referralContext'

// Underscore for versioned settings
'fp_embed_settings_v1'
'fp_analytics_session'
```

**RULE: New localStorage keys must start with `fp:` (feature-scoped) or `fp_` (versioned). Never use bare key names.**
