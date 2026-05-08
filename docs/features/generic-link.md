# Landing Page Link Cards

Landing page link cards are custom content tiles that appear in the unified feed alongside playlists and blog posts. Unlike playlists or posts, these cards link to external URLs rather than internal content. They share the same visual presentation as other feed items but serve as promotional or navigational elements to external resources.

## Purpose

Link cards allow administrators to feature external content, partner sites, merchandise stores, ticket platforms, or promotional campaigns directly in the main content feed without creating full playlist or blog post entries. Cards support customizable content tags with adjustable colors, priority-based ordering, and the same image handling as playlists.

## Database Schema

**Table**: `landing_page_links` (created by migration `062_landing_page_links.js`)

Columns:
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `title` TEXT NOT NULL - Main heading displayed on the card
- `subtitle` TEXT - Secondary text styled like curator names
- `url` TEXT NOT NULL - External URL the card links to
- `image` TEXT - Cover image path or URL
- `tags` TEXT - Comma-separated genre or category tags
- `content_tag` TEXT - Label for the content tag badge (e.g., "Featured", "Partner")
- `content_tag_color` TEXT DEFAULT '#667eea' - Hex color for the content tag background
- `published` INTEGER DEFAULT 0 - Visibility flag (0 = draft, 1 = published)
- `priority` INTEGER DEFAULT 0 - Sort weight (higher values appear first)
- `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
- `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP

Indexes:
- `idx_landing_page_links_published` on `published`
- `idx_landing_page_links_priority` on `priority DESC`

## Database Queries

Queries are defined in `server/database/db.js` within the `getQueries()` function:

- `getAllLandingPageLinks` - Returns all link cards ordered by priority DESC, created_at DESC
- `getPublishedLandingPageLinks` - Returns only published links with same ordering
- `getLandingPageLinkById` - Fetches single link by id
- `insertLandingPageLink` - Creates new link with (title, subtitle, url, image, tags, content_tag, content_tag_color, published, priority)
- `updateLandingPageLink` - Updates all fields except id, sets updated_at to CURRENT_TIMESTAMP
- `deleteLandingPageLink` - Removes link by id

All queries use prepared statements wrapped by `createLoggedQuery()` for error logging.

## Admin API

Admin endpoints are mounted in `server/api/admin/siteAdmin.js` under `/api/v1/admin/site-admin/landing-page-links`. All routes require authentication and are protected by CSRF validation.

**GET /** - List all landing page links
- Calls `queries.getAllLandingPageLinks.all()`
- Returns `{ links: [...] }`

**GET /:id** - Fetch single link
- Calls `queries.getLandingPageLinkById.get(id)`
- Returns `{ link: {...} }` or 404 if not found

**POST /** - Create new link
- Required fields: `title`, `url`
- Optional fields: `subtitle`, `image`, `tags`, `content_tag`, `content_tag_color`, `published`, `priority`
- Defaults: `content_tag_color` = '#667eea', `published` = 0, `priority` = 0
- Calls `queries.insertLandingPageLink.run(...)` and returns created link
- Logs creation via `logger.info('ADMIN', 'Created landing page link', { userId, linkId, title })`

**PUT /:id** - Update existing link
- Same fields as POST
- Checks existence before updating
- Calls `queries.updateLandingPageLink.run(...)`
- Returns updated link or 404 if not found
- Logs update via `logger.info('ADMIN', 'Updated landing page link', { userId, linkId, title })`

**DELETE /:id** - Remove link
- Checks existence before deletion
- Calls `queries.deleteLandingPageLink.run(id)`
- Returns `{ success: true }` or 404 if not found
- Logs deletion via `logger.info('ADMIN', 'Deleted landing page link', { userId, linkId, title })`

## Public API

Public endpoint is defined in `server/api/public-playlists.js`:

**GET /api/v1/public/landing-page-links** - Fetch published links
- Calls `queries.getPublishedLandingPageLinks.all()`
- Transforms each link to add normalized image paths and variants
- Uses `normalizeImagePath(link.image)` to handle remote URLs and `/uploads/` paths
- Generates image variants via `buildImageVariant(link.image, size)` for 'original', 'large', 'medium', 'small'
- Returns `{ links: [...] }` with transformed links including `imageVariants` object
- Returns 500 with `{ error: 'Server error' }` on failure

## Admin UI

**Service**: `src/modules/admin/services/landingPageLinksService.js`

Functions:
- `getAllLandingPageLinks()` - Fetches all links via `adminGet('/api/v1/admin/site-admin/landing-page-links')`
- `getLandingPageLinkById(id)` - Fetches single link
- `createLandingPageLink(linkData)` - Creates link via `adminPost(...)`
- `updateLandingPageLink(id, linkData)` - Updates link via `adminPut(...)`
- `deleteLandingPageLink(id)` - Deletes link via `adminDelete(...)`

All functions use admin API helpers from `src/modules/admin/utils/adminApi.js` which handle authentication, CSRF tokens, and error formatting.

**Component**: `src/modules/admin/components/LandingPageLinksAdmin.jsx`

State management:
- `links` - Array of all link cards
- `editingId` - ID of link being edited (null for new creation)
- `formData` - Current form values (title, subtitle, url, image, tags, content_tag, content_tag_color, published, priority)

Handlers:
- `loadLinks()` - Fetches all links via `getAllLandingPageLinks()`
- `handleCreate()` - Validates and calls `createLandingPageLink(formData)`
- `handleUpdate()` - Validates and calls `updateLandingPageLink(editingId, formData)`
- `handleDelete(id)` - Prompts confirmation and calls `deleteLandingPageLink(id)`
- `handleEdit(link)` - Populates form with link data and sets `editingId`
- `handleImageUpload(e)` - Uploads image via `uploadPlaylistArtwork(null, file)` from `perfectSundaysService` and updates `formData.image`

Form fields:
- Title input (required)
- Subtitle input (optional, labeled "appears like curator name")
- URL input (required)
- Tags input (comma-separated)
- Content tag label input
- Color picker for content tag color
- Priority number input (higher values appear first)
- Published checkbox
- File input for cover image with preview

The component is lazy-loaded in `src/modules/admin/components/tabs/ContentTab.jsx` as `LandingPageLinksAdmin` and mounted under the "Link Cards" tab with description "Create custom link cards that appear on the landing page".

## Frontend Display

**Component**: `src/modules/home/components/FeedLinkCard.jsx`

Renders a single link card with:
- Clickable anchor tag (`<a>`) with `target="_blank"` and `rel="noopener noreferrer"`
- Full playlist-card shell (border, box-shadow, padding) so link cards visually match playlists/blog cards
- Artwork block uses `ResponsiveImage` with `IMAGE_SIZES.CARD_MEDIUM` and falls back to `imageVariants.original`/`image`
- Content tag rendered as a flag in the top-right (same style/placement as playlist flags), using `content_tag_color`
- Subtitle styled identically to curator line in playlists (bold, slight opacity/shadow)
- Title uses the same large playlist title styling and responsive sizing
- Genre tags rendered with the shared genre lookup + tag styling used in playlists
- Hover state mirrors playlists (slight translate/opacity)

Props:
- `link` - Link object with url, title, subtitle, image, imageVariants, tags, content_tag, content_tag_color
- `genreLookup` - Passed from landing page to resolve genre colors/labels

## Feed Integration

**Service**: `src/modules/home/services/unifiedFeedService.js`

Function `getLandingPageLinks()`:
- Fetches from `/api/v1/public/landing-page-links`
- Returns array of published links or empty array on error
- Logs warnings if fetch fails

Function `getUnifiedFeed(options)`:
- Fetches playlists, blog posts, and landing page links in parallel via `Promise.all()`
- Adds `contentType: 'link'` and `sortDate: new Date(item.created_at)` to each link
- Combines all content types into single array
- Sorts by priority for links (higher priority first), then by date (newest first)
- Logic: if both items are links, sort by priority difference; otherwise sort by date
- Applies limit to final combined feed

**Landing Page**: `src/modules/home/components/LandingPage.jsx`

Feed rendering:
- Imports `FeedLinkCard` alongside `FeedPlaylistCard` and `BlogPostCard`
- Maps over `unifiedFeed` array and checks `item.contentType`
- Renders `<FeedLinkCard link={item} />` when `contentType === 'link'`
- Renders `<BlogPostCard post={item} />` when `contentType === 'post'`
- Renders `<FeedPlaylistCard playlist={item} genreLookup={genreLookup} />` for all other types

## Image Handling

Images follow the same pattern as playlists:

Upload process:
- Admin component reuses `uploadPlaylistArtwork(null, file)` from `src/modules/admin/services/perfectSundaysService.js`
- Uploads to `/api/v1/artwork/playlist-upload` endpoint
- Returns response with `data.image` pointing at the R2 public URL (e.g., `https://images.flowerpil.io/playlists/<uuid>.jpg`) plus `_large/_medium/_small` variants
- Requires R2 env vars (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`) to be present; missing vars in local dev will prevent stored images from resolving

Variant generation:
- Public API applies `normalizeImagePath(value)` to preserve remote URLs or convert legacy `/uploads/` paths
- `buildImageVariant(value, size)` generates size-specific paths by inserting `_small`, `_medium`, or `_large` suffix before file extension
- Remote URLs (starting with `http://` or `https://`) are parsed to extract pathname and transform suffix
- Variants: 'original' (no suffix), 'large', 'medium', 'small'

Frontend consumption:
- `FeedLinkCard` receives `imageVariants` object from feed service
- Uses `getImageUrl(imageVariants, 'medium')` to select appropriate size
- Falls back to raw `image` value if variants unavailable
- Image lazy loads via `loading="lazy"` attribute

## Content Tag Styling

Content tags appear as colored badges overlaying the top-left corner of card images. The admin interface provides:

- Text input for tag label (e.g., "Featured", "Partner", "Exclusive")
- HTML color picker for background color
- Default color '#667eea' (purple-blue) matching theme.colors.primary
- Tag renders only if `content_tag` field has value

Rendered styling in `FeedLinkCard`:
- Absolute positioning at top: 12px, left: 12px
- Padding: 6px 12px
- Border radius: 4px
- Background from `content_tag_color`
- White text, 12px, font-weight 600
- Uppercase transform with 0.05em letter-spacing
- z-index: 1 to appear above image

## Priority and Ordering

Links support integer `priority` field to control placement in feed. Higher priority values appear before lower values when both items are links. The sort logic in `unifiedFeedService.js`:

```javascript
combinedFeed.sort((a, b) => {
  if (a.contentType === 'link' && b.contentType === 'link') {
    const priorityDiff = (b.priority || 0) - (a.priority || 0);
    if (priorityDiff !== 0) return priorityDiff;
  }
  return b.sortDate - a.sortDate;
});
```

This ensures:
- Links with priority 10 appear before links with priority 5
- Links with same priority sort by creation date
- Links mixed with playlists/posts sort by date alone
- Zero or null priority treated as 0

Use cases:
- Set priority 100 for urgent promotional campaigns
- Set priority 50 for featured partners
- Set priority 0 (default) for standard links
- Negative priority values push links toward end of feed
