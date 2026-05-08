# Announcements System

A flexible announcement system for displaying targeted modals, banners, and notifications to users. Admins create announcements using a block-based editor with live preview, configure targeting rules, and track analytics. Supports real-time push via WebSocket, user-type targeting, display delays, and per-block styling.

## Database Schema

Migrations:
- `server/database/migrations/090_announcements.js` - Base schema
- `server/database/migrations/091_announcements_enhancements.js` - Display delay, show next visit, push tracking

### Tables

**announcements** - Core announcement records
- `id`, `title`, `status` (draft/active/paused/archived), `format` (modal/banner_top/banner_bottom)
- `placement` (global/page_specific), `target_pages` (JSON array), `priority` (1-10)
- `display_delay` (INTEGER, seconds to wait before showing)
- `show_next_visit_after` (DATETIME, trigger timestamp for next-visit override)
- `created_by`, `created_at`, `updated_at`

**announcement_content** - Content variants for A/B testing
- `announcement_id`, `variant` (A/B or null), `blocks` (JSON), `header_style` (JSON)

**announcement_schedule** - Timing configuration
- `announcement_id`, `start_date`, `end_date`, `relative_trigger`, `relative_delay_days`, `manual_override`

**announcement_persistence** - Display frequency rules
- `announcement_id`, `show_mode` (once/until_cta/max_times/cooldown), `max_show_count`, `gap_hours`
- Show modes:
  - `once` - Show once, never again after dismissal
  - `until_cta` - Keep showing until user clicks a CTA button
  - `cooldown` - After dismissal, hide for `gap_hours` then show again (repeats forever)
  - `max_times` - Show up to `max_show_count` times with `gap_hours` between shows

**announcement_targets** - Targeting rules (multiple per announcement)
- `announcement_id`, `target_type` (user_type/tag/curator_id), `target_value`
- User type values: `unauthenticated`, `listener`, `curator`, `admin`

**announcement_pushes** - Real-time push tracking
- `id`, `announcement_id`, `pushed_at`, `pushed_by`, `target_count`

**announcement_views** - User interaction tracking
- `announcement_id`, `user_id`, `variant_shown`, `view_count`, `first_seen_at`, `last_seen_at`
- `dismissed_at`, `cta_clicked`, `dismissed_permanently`

**curator_tags** - Tags for targeting specific curator groups
- `curator_id`, `tag`, `created_at`

## API Endpoints

### Admin API

Route file: `server/api/admin/announcements.js`

Mounted at `/api/v1/admin/announcements` with `adminSecurityHeaders` and `validateCSRFToken` middleware.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all announcements with variants, schedule, persistence, targets, and stats |
| GET | `/:id` | Get single announcement with all related data |
| POST | `/` | Create announcement with variants, schedule, persistence, targets |
| PUT | `/:id` | Update announcement (replaces related data) |
| DELETE | `/:id` | Delete announcement (cascades to related tables) |
| GET | `/:id/analytics` | Get view stats grouped by variant, CTA breakdown |
| POST | `/:id/push` | Push announcement to all connected WebSocket clients |
| POST | `/:id/trigger-next-visit` | Set show_next_visit_after to trigger for all users |
| GET | `/curator-tags` | List all tags with curator counts |
| POST | `/curator-tags` | Add tag to curator |
| DELETE | `/curator-tags/:curatorId/:tag` | Remove tag from curator |

### Public API

Route file: `server/api/announcements.js`

Mounted at `/api/v1/announcements` with CSRF middleware on POST requests only.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/active?page=` | Get active announcements for current user/page |
| POST | `/:id/view` | Record view (increments count or creates record) |
| POST | `/:id/dismiss` | Record dismissal with optional button label and permanent flag |

#### Targeting Logic

The `/active` endpoint in `server/api/announcements.js` applies filters in order:

1. `matchesTargets(targets, user)` - Checks user_type, curator_id, or tag membership
2. `isScheduleValid(schedule, user)` - Validates start/end dates and relative triggers
3. `checkPersistence(persistence, view)` - Enforces show_mode rules (once, until_cta, max_times with gap)

A/B variant assignment uses deterministic split: `user.id % variants.length`

## Frontend Components

### Block Renderers

Location: `src/modules/shared/components/announcements/blocks/`

Each block component accepts `block` (config object) and `onAction` (callback) props.

| Component | Block Type | Config Options |
|-----------|------------|----------------|
| `HeadingBlock.jsx` | `heading` | content, size (h1/h2/h3), alignment, color |
| `ParagraphBlock.jsx` | `paragraph` | content (HTML), alignment, color, fontWeight |
| `ButtonBlock.jsx` | `button` | label, action (dismiss/navigate/external_link), url, variant |
| `ButtonGroupBlock.jsx` | `button_group` | buttons array with same options as button |
| `ImageBlock.jsx` | `image` | src, width, height, alt, alignment |
| `IconGridBlock.jsx` | `icon_grid` | icons array (platform or src), columns, showLabels |
| `FlowDiagramBlock.jsx` | `flow_diagram` | steps array (platform/icon), animated, description |
| `InfoBoxBlock.jsx` | `info_box` | content, style (success/warning/info/danger), icon |
| `DividerBlock.jsx` | `divider` | style (solid/dashed), margin |
| `SpacerBlock.jsx` | `spacer` | height (sm/md/lg/xl) |

All blocks support per-block styling via the `style` property:
- `style.backgroundColor` - Background color (hex)
- `style.textColor` - Text color (hex)

Export index: `src/modules/shared/components/announcements/blocks/index.js`

### Main Renderer

`src/modules/shared/components/announcements/AnnouncementRenderer.jsx`

Maps block types to components via `blockComponentMap`. Handles responsive visibility through `isVisibleAtBreakpoint(visible, breakpoint)` helper.

Props:
- `blocks` - Array of block configurations
- `onAction` - Callback for button clicks
- `breakpoint` - Current viewport size (desktop/tablet/mobile)

### Display Containers

**AnnouncementModal.jsx** (`src/modules/shared/components/announcements/`)

Full-screen overlay modal with:
- Safari-safe height (`100dvh` with `100vh` fallback)
- Animated entrance (fadeIn overlay, slideUp content)
- Optional header with logo (controlled by `header_style`)
- Responsive breakpoint detection via `useEffect`

**AnnouncementBanner.jsx** (`src/modules/shared/components/announcements/`)

Sticky banner with:
- Position prop (top/bottom)
- Safe area inset padding for notched devices
- Close button with touch-target sizing
- slideDown/slideUp animations

Both containers handle action callbacks:
- `dismiss` - Closes with optional button tracking
- `navigate` - Closes and redirects to URL
- `external_link` - Opens URL in new tab

### Context Provider

`src/shared/contexts/AnnouncementContext.jsx`

Exports:
- `AnnouncementProvider` - Wraps entire app in `App.jsx`, manages fetch/display queue
- `useAnnouncements()` - Hook for accessing context (returns no-op values if outside provider)

**Global Integration:**

The `AnnouncementProvider` is mounted globally in `App.jsx`, wrapping all routes. It automatically detects the current page from the route pathname using `getPageFromPath()`:

| Route Pattern | Page Identifier |
|---------------|-----------------|
| `/home`, `/` | `home` |
| `/curator/*` | `curator_dashboard` |
| `/admin/*` | `admin` |
| `/playlist/*` | `playlist_view` |
| `/l/*`, `/p/*`, `/s/*` | `public_share` |
| Other | First path segment |

Provider behavior:
1. Fetches `/api/v1/announcements/active?page={page}` on mount and route change
2. Tracks fetched pages in `fetchedPagesRef` to prevent duplicate requests
3. **Auth-aware refetching:** Clears cache and refetches when user logs in/out
4. Manages display queue: one modal at a time, max 2 banners
5. Records views via `recordView(announcementId, variant)`
6. Handles dismissals via `dismissAnnouncement(id, { button, permanent })`

Context value:
```javascript
{
  announcements,      // All fetched announcements
  loading,            // Fetch in progress
  dismissAnnouncement,// Dismiss and record
  refreshAnnouncements,// Force re-fetch for page
  currentModal,       // Currently displayed modal
  currentBanners,     // Currently displayed banners (max 2)
}
```

### WebSocket Integration

`src/shared/contexts/WebSocketContext.jsx`

The WebSocket system provides stable real-time connections for announcement push delivery.

**Connection Stability:**
- Uses refs for auth state to prevent reconnection loops during auth changes
- Tracks connection state with guards to prevent duplicate connection attempts
- Automatic reconnection with exponential backoff (1s to 30s max)
- Page visibility handling: reconnects when tab becomes visible after being backgrounded
- Heartbeat every 25 seconds to keep connection alive

**WebSocket Provider:**

Mounted globally in `App.jsx`, provides:
- `connected` - Boolean, true when WebSocket is open
- `authenticated` - Boolean, true when user is authenticated on WebSocket
- `subscribe(type, callback)` - Subscribe to message types, returns unsubscribe function
- `send(message)` - Send JSON message to server
- `connect()` / `disconnect()` - Manual connection control

**Push Event Handling:**
1. AnnouncementContext subscribes to `announcement:push` WebSocket events
2. When received, announcement is added to the display queue
3. Display delay is applied if configured
4. Announcement shows immediately to all connected users

**Display Delay:**
- Announcements can have a `display_delay` (0-60 seconds)
- AnnouncementContext applies `setTimeout` before adding to display queue
- Useful for avoiding immediate popups on page load

## Admin UI

### Manager Component

`src/modules/admin/components/AnnouncementsManager.jsx`

Accessible at Site Admin > Content > Announcements tab.

**List View** displays:
- Title, status badge, format, priority
- View/click stats if available
- Actions: Edit, Duplicate, Pause/Activate, Push Now, Next Visit, Delete

**Editor View** provides:
- Basic info: title, format, status, priority, display delay (seconds)
- Targeting: placement, target pages, user types (checkboxes for Listeners/Curators/Admins/Unauthenticated)
- Display frequency: show mode (once/until action/with cooldown) and cooldown days
- Block editor with palette and live preview
- Per-block styling: background color and text color pickers for each block
- Two-column layout (editor left, preview right on desktop)

Block templates defined in `BLOCK_TEMPLATES` constant provide default configurations for each block type.

Functions:
- `handleCreate()` - Initialize empty form
- `handleEdit(announcement)` - Load announcement into form
- `handleSave()` - POST or PUT based on `editingId`
- `handleDuplicate(announcement)` - Copy with "(Copy)" suffix, set to draft
- `handleToggleStatus(announcement)` - Toggle between active/paused
- `handlePushNow(announcement)` - Push to all connected WebSocket clients
- `handleTriggerNextVisit(announcement)` - Set show_next_visit_after timestamp
- `addBlock(type)` - Add block from template
- `updateBlock(blockIndex, updates)` - Modify block config
- `removeBlock(blockIndex)` - Delete block
- `moveBlock(blockIndex, direction)` - Reorder blocks

### Tab Registration

`src/modules/admin/components/tabs/ContentTab.jsx`

Lazy-loaded via:
```javascript
const AnnouncementsManager = lazy(() => import('../AnnouncementsManager.jsx'));
```

Added to tabs array with id `announcements`, label `Announcements`.

## Dev Tools Integration

`src/dev/DevUserSwitcher.jsx`

The dev user switcher includes an **Announcement Preview** section for testing announcements without activating them.

State:
- `announcements` - Fetched list from admin API
- `selectedAnnouncementId` - Currently selected for preview
- `previewAnnouncement` - Formatted announcement data
- `showAnnouncementPreview` - Toggle preview visibility

Functions:
- `fetchAnnouncements()` - GET `/api/v1/admin/announcements`
- `triggerAnnouncementPreview()` - Format selected announcement and show
- `closeAnnouncementPreview()` - Hide preview

Renders `AnnouncementModal` or `AnnouncementBanner` based on format.

## Block JSON Structure

Blocks follow this schema:

```json
{
  "id": "block_1234567890",
  "type": "heading",
  "content": "Welcome",
  "size": "h1",
  "visible": {
    "desktop": true,
    "tablet": true,
    "mobile": false
  },
  "style": {
    "backgroundColor": "#f0f0f0",
    "textColor": "#333333"
  }
}
```

The `visible` property controls responsive display. If omitted, block shows on all breakpoints.

The `style` property enables per-block styling:
- `backgroundColor` - Hex color for block background
- `textColor` - Hex color for text within the block

Image block structure:
```json
{
  "id": "block_1234567890",
  "type": "image",
  "src": "https://example.com/image.jpg",
  "width": 400,
  "height": 300,
  "alt": "Description",
  "alignment": "center"
}
```

Button actions:
- `dismiss` - Close announcement, optionally track button label
- `navigate` - Close and redirect to `url`
- `external_link` - Open `url` in new tab

## Usage

### Creating an Announcement

1. Navigate to Site Admin > Content > Announcements
2. Click "+ New Announcement"
3. Set title, format (modal/banner), status
4. Add blocks from palette
5. Configure placement (global or specific pages)
6. Save

### Testing with Dev Switcher

1. Open dev switcher (floating button or Cmd+K)
2. Scroll to "Announcement Preview"
3. Select announcement from dropdown
4. Click "Trigger Announcement"

### Page Integration

The `AnnouncementProvider` is mounted globally in `App.jsx`, so no per-page setup is required. All pages automatically receive announcements based on their route.

**Page Targeting:**

When creating announcements in admin, set `placement` to `page_specific` and add target pages matching the page identifiers:
- `home` - Landing page
- `curator_dashboard` - Curator dashboard routes
- `admin` - Admin panel routes
- `playlist_view` - Playlist view pages
- `public_share` - Public share links (/l/, /p/, /s/)

**Custom Page Override:**

For specific page targeting, override the auto-detected page:
```jsx
import { AnnouncementProvider } from '@shared/contexts/AnnouncementContext';

function CustomPage() {
  return (
    <AnnouncementProvider page="custom_page_id">
      <PageContent />
    </AnnouncementProvider>
  );
}
```

### Accessing Announcement State

Use the `useAnnouncements()` hook to access context:

```jsx
import { useAnnouncements } from '@shared/contexts/AnnouncementContext';

function Component() {
  const { currentModal, currentBanners, dismissAnnouncement } = useAnnouncements();
  // Use announcement state
}
```
