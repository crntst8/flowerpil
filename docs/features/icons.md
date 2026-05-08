# Custom Action Icons

## Purpose

Stores custom action icons (playlist CTAs) in Cloudflare R2 as single-asset 512×512px PNGs. Icons load from R2 URLs with a Unicode flower fallback for missing assets. Replaces the previous local filesystem storage that broke during the R2/image overhaul.

## How It Works

Custom action icons are uploaded to R2 as single 512×512px PNG files with no size or format variants. The system stores both preset icons (migrated from static assets) and user-uploaded icons in a unified R2 directory structure.

### Upload Flow

**Icon Upload** (`server/api/icons.js`)
- Endpoint: `POST /api/v1/icons/upload`
- Accepts PNG/SVG/WebP files up to 10MB
- Processes with Sharp:
  - Resize to 512×512px (fit: contain, no crop)
  - Transparent background (RGBA)
  - PNG format, quality 100, compression level 9
  - Palette optimization for icon-appropriate compression
- Uploads single asset to R2: `icons/{uuid}.png`
- Returns R2 URL: `https://pub-xxx.r2.dev/icons/{uuid}.png`

**Preset Icons**
- Stored in R2 under `icons/preset-{name}.png` (e.g., `preset-youtube.png`, `preset-instagram.png`)
- Source assets live in `/public/assets/playlist-actions/`
- Preset set was seeded out-of-band; no in-repo migration script

### Icon Library

**Library API** (`server/api/icons.js`)
- Endpoint: `GET /api/v1/icons/library`
- Lists all objects in R2 bucket with `icons/` prefix
- Returns combined list of preset and uploaded icons
- Sorting: presets first (alphabetical), uploaded second (newest first)
- Response includes: key, filename, url, type, size, lastModified

### Frontend Rendering

**IconWithFallback Component** (`src/shared/components/IconWithFallback.jsx`)
- Simple `<img>` tag with error handling (not ResponsiveImage)
- Props: `src`, `alt`, `size` (default 28px)
- Missing/failed icons display Unicode flower glyph (U+273F)
- Fallback rendered as styled text, not image
- No console errors for missing icons

**PlaylistView Integration** (`src/modules/playlists/components/PlaylistView.jsx`)
- Lines 302-307: IconWithFallback replaces ResponsiveImage
- Displays icon from `custom_action_icon` database field
- Automatic fallback if URL is null, empty, or fails to load
- Icon size: 28×28px in custom action button

### Admin Interface

**Playlist Custom Action Editor** (`src/modules/admin/components/PlaylistCustomActionEditor.jsx`)
- Upload via ImageUpload component with `uploadType="icons"`
- Icon library displays flat grid of all R2 icons (preset + uploaded)
- Click to select icon → stores R2 URL in database
- No icon source tracking (removed `custom_action_icon_source` logic)
- Preview shows selected icon at 76×76px

**ImageUpload Component** (`src/modules/admin/components/ImageUpload.jsx`)
- Lines 255-283: Special handling for `uploadType="icons"`
- Routes to `/api/v1/icons/upload` instead of `/api/v1/uploads/image`
- Field name: `icon` (not `image`)
- Response structure: `{url, size, format}` (not `{data: {primary_url, images}}`)

### Data Flow

1. Admin uploads icon via ImageUpload component
2. POST to `/api/v1/icons/upload` with multipart form data
3. Sharp processes file → 512×512px PNG with transparency
4. Upload to R2: `icons/{uuid}.png`
5. Return R2 URL to admin UI
6. Admin selects icon from library
7. Database stores R2 URL in `playlists.custom_action_icon`
8. Frontend fetches playlist → receives icon URL
9. IconWithFallback renders icon or fallback

## API/Interface

### Upload Icon

**Endpoint:** `POST /api/v1/icons/upload`

**Authentication:** Required (admin/curator roles)

**Request:**
- Content-Type: `multipart/form-data`
- Field: `icon` (file, max 10MB)
- Allowed types: `image/png`, `image/svg+xml`, `image/webp`

**Response:**
```json
{
  "success": true,
  "url": "https://pub-xxx.r2.dev/icons/3fa85f64-5717-4562-b3fc-2c963f66afa6.png",
  "size": 512,
  "format": "png",
  "filename": "3fa85f64-5717-4562-b3fc-2c963f66afa6.png"
}
```

### List Icons

**Endpoint:** `GET /api/v1/icons/library`

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "icons": [
    {
      "key": "icons/preset-youtube.png",
      "filename": "preset-youtube.png",
      "url": "https://pub-xxx.r2.dev/icons/preset-youtube.png",
      "type": "preset",
      "size": 12456,
      "lastModified": "2025-11-10T03:42:15.000Z"
    },
    {
      "key": "icons/3fa85f64-5717-4562-b3fc-2c963f66afa6.png",
      "filename": "3fa85f64-5717-4562-b3fc-2c963f66afa6.png",
      "url": "https://pub-xxx.r2.dev/icons/3fa85f64-5717-4562-b3fc-2c963f66afa6.png",
      "type": "uploaded",
      "size": 8234,
      "lastModified": "2025-11-10T04:15:32.000Z"
    }
  ],
  "count": 2
}
```

### Delete Icon

**Endpoint:** `DELETE /api/v1/icons/:filename`

**Authentication:** Required (admin role only)

**Restrictions:**
- Cannot delete preset icons (filename starts with `preset-`)
- Updates any playlists using the icon to NULL

**Response:**
```json
{
  "success": true,
  "message": "Icon deleted successfully",
  "playlistsUpdated": 2
}
```

## Database

### Schema

**playlists table:**
- `custom_action_icon` (TEXT): Full R2 URL to icon
- `custom_action_icon_source` (TEXT): Deprecated, no longer used
- `custom_action_label` (TEXT): Button text
- `custom_action_url` (TEXT): Button destination URL

### URL Format

**R2 Icons:**
```
https://your-r2-public-url.r2.dev/icons/3fa85f64-5717-4562-b3fc-2c963f66afa6.png
https://your-r2-public-url.r2.dev/icons/preset-youtube.png
```

**Legacy URLs (cleared during migration):**
```
/uploads/playlist-action-icons/uuid_medium.png
/assets/playlist-actions/youtube.png
```

### Legacy Cleanup

The legacy icon paths (`/uploads/playlist-action-icons/*`, `/assets/playlist-actions/*`) were cleared as a one-time cleanup. The `custom_action_icon_source` column remains unused; current updates are managed via the admin UI or direct DB edits.

## Storage Structure

### R2 Bucket Path

```
flowerpil-images/
└── icons/
    ├── preset-apple.png
    ├── preset-bandcamp.png
    ├── preset-discogs.png
    ├── preset-discord.png
    ├── preset-instagram.png
    ├── preset-link.png
    ├── preset-mixcloud.png
    ├── preset-more.png
    ├── preset-reddit.png
    ├── preset-share.png
    ├── preset-soundcloud.png
    ├── preset-spotify.png
    ├── preset-tidal.png
    ├── preset-tiktok.png
    ├── preset-website.png
    ├── preset-youtube.png
    ├── preset-youtube1.png
    └── {uuid}.png (user uploads)
```

**File Specifications:**
- Format: PNG only (converted from any input format)
- Size: 512×512px (exact)
- Transparency: Supported (RGBA)
- Compression: Level 9 (maximum)
- Naming: UUID v4 for uploads, `preset-{name}` for presets

## Integration Points

**Icon Upload API** (`server/api/icons.js`)
- Imports: `uploadToR2()`, `deleteFromR2()` from `server/utils/r2Storage.js`
- Imports: `ListObjectsV2Command`, `S3Client` from `@aws-sdk/client-s3`
- Uses Sharp for image processing
- Router mounted at `/api/v1/icons` in `server/index.js:335`

**ImageUpload Component** (`src/modules/admin/components/ImageUpload.jsx`)
- Lines 255-259: Detects `uploadType="icons"` and routes to icon endpoint
- Lines 260: Field name changed from `image` to `icon`
- Lines 276: Response parsing for icon endpoint structure

**PlaylistCustomActionEditor** (`src/modules/admin/components/PlaylistCustomActionEditor.jsx`)
- Line 154: Calls `/api/v1/icons/library` to load icon list
- Line 191: Stores only `custom_action_icon` URL (no source tracking)
- Line 295: Upload type set to `"icons"`

**IconWithFallback Component** (`src/shared/components/IconWithFallback.jsx`)
- Used in PlaylistView.jsx:302-307
- Props: `src`, `alt`, `size`
- Fallback: U+273F (Black Florette)
- Styled with theme.colors.black, opacity 0.6

**Preset Icon Seeding**
- Source directory: `/public/assets/playlist-actions/`
- Preset icons are stored in R2 with `preset-` filenames
- Seeding was a one-time task; no in-repo migration script

## Legacy Code Removed

### Upload Configuration
**File:** `server/api/uploads.js`
- Removed: `'playlist-action-icons'` from `VALID_SUBDIRS` (line 26)
- Removed: `'playlist-action-icons'` config from `TYPE_CONFIG` (lines 43-55)
  - Previous config: 4 size variants (512px, 256px, 128px, 64px)
  - Previous fit: contain, transparent background, PNG format

### Icon Library Endpoint
**File:** `server/api/playlist-actions.js`
- Removed: `PRESET_ICONS_DIR`, `UPLOADED_ICONS_DIR` constants (lines 20-21)
- Removed: `ICON_EXTENSIONS` constant (line 22)
- Removed: `readIconDirectory()` helper function (lines 86-100)
- Removed: `GET /icons` endpoint (lines 105-140)
  - Previous endpoint returned preset + uploaded icons from filesystem
  - Response format: `{success: true, data: [...]}`

### Local Storage
**Directory:** `/storage/uploads/playlist-action-icons/`
- Deleted: Entire directory and contents
- Previous contents: 5 uploaded icons with 20 total files (4 size variants each)
- Example files: `b88ce9e4-a8bb-4bee-9f74-5b8903e864d0_medium.png`

### Database Cleanup
- 7 playlists with old paths updated to NULL
- Playlist IDs affected: 49, 50, 53, 62, 69, 104, 110
- Previous paths cleared:
  - `/uploads/playlist-action-icons/{uuid}_{size}.png`
  - `/assets/playlist-actions/{name}.png`

## Configuration

### Environment Variables

Icons use the same R2 configuration as other images:

```bash
R2_ACCOUNT_ID="your-r2-account-id"
R2_ACCESS_KEY_ID="your-r2-access-key-id"
R2_SECRET_ACCESS_KEY="your-r2-secret-access-key"
R2_BUCKET_NAME="your-bucket-name"
R2_PUBLIC_URL="https://your-r2-public-url"
```

### R2 Bucket Settings

**Public Access:** Must be enabled in Cloudflare R2 dashboard for icons to load on frontend.

**CORS Policy:** Same as other images (configured at bucket level).

**Cache Control:** `public, max-age=31536000, immutable` (1 year)

## Known Issues

### R2 Public Access
Icons require R2 bucket public access to be enabled. If icons return 401 Unauthorized:
1. Go to Cloudflare R2 Dashboard
2. Select `flowerpil-images` bucket
3. Settings → Public Access → Enable
4. Verify icons load: `https://pub-xxx.r2.dev/icons/preset-youtube.png`

### Preset Icon References
Static asset references (e.g., `/assets/playlist-actions/youtube.png`) cleared from database during migration. Preset icons now load from R2 URLs only.

### Icon Source Column
Database column `custom_action_icon_source` exists but is no longer used. The column was not dropped during migration due to SQLite trigger dependencies. Future schema updates can remove it safely.

## Migration Impact

### Playlists Affected
7 playlists had custom action icons prior to migration:
- ID 49: Bar Italia (uploaded icon)
- ID 50: Ninajirachi (preset: youtube)
- ID 53: Water From Your Eyes (uploaded icon)
- ID 62: 2hollis (preset: youtube)
- ID 69: Not On Streaming (preset: link)
- ID 104: Melody's Echo Chamber (uploaded icon)
- ID 110: GRAIN DJ: October Mix (uploaded icon)

All icons set to NULL during migration. Curators must re-upload icons.

### Curator Action Required
Curators with custom action icons must:
1. Navigate to admin → playlist editor
2. Upload new icon (or select preset from library)
3. Icon automatically stored in R2
4. Frontend immediately displays icon or fallback

### Frontend Behavior
- Playlists without icons: display U+273F fallback glyph (not broken image icon)
- Playlists with R2 icons: Display icon normally
- Playlists with old paths: display U+273F fallback glyph (paths cleared)

---

**File References**
- `server/api/icons.js` - Icon upload/library/delete endpoints
- `server/utils/r2Storage.js` - R2 upload/delete functions
- `src/shared/components/IconWithFallback.jsx` - Icon component with fallback
- `src/modules/playlists/components/PlaylistView.jsx` - Frontend icon rendering
- `src/modules/admin/components/PlaylistCustomActionEditor.jsx` - Admin icon management
- `src/modules/admin/components/ImageUpload.jsx` - Icon upload handler
- (Preset icons are seeded in R2; no in-repo migration script)
