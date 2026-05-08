# Image Optimization System

## Purpose

Optimizes uploaded images by generating multiple formats (JPEG, WebP, AVIF) and size variants (large, medium, small). Ensures responsive, browser-aware delivery and efficient storage in Cloudflare R2.

## How It Works

Images are processed via Sharp library creating 9 variants per upload: 3 sizes (large: 1200px, medium: 600px, small: 300px) multiplied by 3 formats (jpg, webp, avif). Playlists use UUID-based naming scheme (playlists/{uuid}_{size}.{format}), while tracks maintain timestamp-based legacy format (tracks/{timestamp}-{random}.jpg with _md and _sm suffixes).

processSpotifyArtwork() accepts type parameter determining upload path and naming convention. When type='playlist', creates 9 variants uploaded to playlists/ directory. When type='track', creates 3 JPG variants only for backward compatibility.

Manual uploads via /api/v1/uploads/image follow playlist pattern with 9 variants. ResponsiveImage component (`src/shared/components/ResponsiveImage.jsx`) renders picture elements with source sets, allowing browsers to select AVIF for modern browsers, WebP for partial support, and JPEG fallback for legacy browsers.

buildImageVariant() in API endpoints dynamically generates URLs with _large, _medium, _small suffixes. Frontend buildSrcSet() excludes non-existent "original" size (removed November 2024), only including small (200w), medium (400w), and large (800w) variants in srcset attribute.

Cleanup utilities in imageCleanupService.js detect orphaned images by comparing R2 contents against database references, validate image accessibility, and provide deletion tools.

## API/Interface

### Upload Endpoint

```
POST /api/v1/uploads/image
```

Accepts multipart/form-data image upload, generates 9 variants, uploads to R2.

**Request:**
- Content-Type: multipart/form-data
- Field: image (file)

**Response:**
```json
{
  "primary_url": "https://images.flowerpil.io/playlists/abc123_large.jpg",
  "urls": {
    "jpeg": [
      "https://images.flowerpil.io/playlists/abc123_small.jpg",
      "https://images.flowerpil.io/playlists/abc123_medium.jpg",
      "https://images.flowerpil.io/playlists/abc123_large.jpg"
    ],
    "webp": ["..."],
    "avif": ["..."]
  }
}
```

### Public Playlist Endpoints

```
GET /api/v1/public/feed
GET /api/v1/playlists/:id
```

Returns playlist objects with image variant URLs.

**Response:**
```json
{
  "image": "https://images.flowerpil.io/playlists/uuid_large.jpg",
  "image_url_large": "https://images.flowerpil.io/playlists/uuid_large.jpg",
  "image_url_medium": "https://images.flowerpil.io/playlists/uuid_medium.jpg",
  "image_url_small": "https://images.flowerpil.io/playlists/uuid_small.jpg"
}
```

### Processing Functions

**processSpotifyArtwork:**
```javascript
processSpotifyArtwork(artwork, type)
// type: 'playlist' or 'track'
// Returns: primary_url pointing to _large.jpg variant
```

From `server/services/playlistImportService.js`.

**buildImageVariant:**
```javascript
buildImageVariant(baseUrl, size)
// size: 'small', 'medium', 'large'
// Returns: URL with _{size} suffix injected before extension
```

Used in API endpoints to generate size-specific URLs.

## Database

Image URLs stored in database tables:

### Playlists Table

**Field:** `image` (TEXT)

**Format:**
```
https://images.flowerpil.io/playlists/{uuid}_large.jpg
```

All 9 variants exist in R2:
```
playlists/{uuid}_small.avif / .webp / .jpg
playlists/{uuid}_medium.avif / .webp / .jpg
playlists/{uuid}_large.avif / .webp / .jpg
```

### Tracks Table

**Field:** `artwork_url` (TEXT)

**Format:**
```
https://images.flowerpil.io/tracks/{timestamp}-{random}.jpg
```

Variants:
```
tracks/{timestamp}-{random}.jpg      (800px)
tracks/{timestamp}-{random}_md.jpg   (400px)
tracks/{timestamp}-{random}_sm.jpg   (200px)
```

## Integration Points

### Internal Dependencies

- **Sharp** - Image processing library for resizing and format conversion
- **Cloudflare R2** - Object storage for image variants
- **ResponsiveImage** (`src/shared/components/ResponsiveImage.jsx`) - Frontend component for responsive rendering
- **imageUtils** (`src/shared/utils/imageUtils.js`) - buildSrcSet, buildImageVariant utilities
- **imageCleanupService** (`server/services/imageCleanupService.js`) - Orphan detection and cleanup
- **playlistImportService** (`server/services/playlistImportService.js`) - processSpotifyArtwork implementation

### External Dependencies

- **Cloudflare R2** - S3-compatible object storage
- **Sharp** - Image processing (npm package)

### Feature Flags

Controlled via `server/config/imageFeatures.js`:

```javascript
FEATURE_GENERATE_WEBP: true
FEATURE_GENERATE_AVIF: true
```

### Frontend Integration

ResponsiveImage component automatically generates picture element:

```javascript
<picture>
  <source
    type="image/avif"
    srcset="...uuid_small.avif 200w, ...uuid_medium.avif 400w, ...uuid_large.avif 800w"
  />
  <source
    type="image/webp"
    srcset="...uuid_small.webp 200w, ...uuid_medium.webp 400w, ...uuid_large.webp 800w"
  />
  <img
    src="...uuid_large.jpg"
    srcset="...uuid_small.jpg 200w, ...uuid_medium.jpg 400w, ...uuid_large.jpg 800w"
  />
</picture>
```

## Configuration

### Environment Variables

**R2_ACCOUNT_ID**
- Cloudflare account identifier
- Required for R2 access

**R2_ACCESS_KEY_ID**
- R2 access key
- Required for authentication

**R2_SECRET_ACCESS_KEY**
- R2 secret key
- Required for authentication

**R2_BUCKET_NAME**
- Bucket name for image storage
- Example: flowerpil-images

**R2_PUBLIC_URL**
- Public CDN URL for images
- Example: https://images.flowerpil.io

**FEATURE_GENERATE_WEBP**
- Enable WebP variant generation
- Default: true

**FEATURE_GENERATE_AVIF**
- Enable AVIF variant generation
- Default: true

### R2 CORS Configuration

```json
{
  "AllowedOrigins": [
    "https://flowerpil.io",
    "https://www.flowerpil.io",
    "http://localhost:5173"
  ],
  "AllowedMethods": ["GET", "HEAD"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3600
}
```

## Usage Examples

### Manual Upload

```bash
curl -X POST https://api.flowerpil.io/api/v1/uploads/image \
  -F "file=@cover.jpg" \
  -H "Cookie: ..."
```

### Frontend Responsive Image

From `src/shared/components/ResponsiveImage.jsx`:

```javascript
import ResponsiveImage from '@shared/components/ResponsiveImage';
import { IMAGE_SIZES } from '@shared/utils/imageUtils';

<ResponsiveImage
  src="https://images.flowerpil.io/playlists/abc_large.jpg"
  alt="Playlist cover"
  sizes={IMAGE_SIZES.CARD_MEDIUM}
  loading="lazy"
/>
```

### Processing Playlist Artwork

From `server/services/playlistImportService.js`:

```javascript
const primaryUrl = await processSpotifyArtwork(artworkUrl, 'playlist');
// Returns: https://images.flowerpil.io/playlists/{uuid}_large.jpg
// Creates 9 variants in R2
```

### Processing Track Artwork

```javascript
const artworkUrl = await processSpotifyArtwork(trackArtwork, 'track');
// Returns: https://images.flowerpil.io/tracks/{timestamp}-{random}.jpg
// Creates 3 JPG variants (_sm, _md, and base)
```

### Building Size Variants

From API endpoint:

```javascript
const baseUrl = playlist.image; // ...uuid_large.jpg
const smallUrl = buildImageVariant(baseUrl, 'small');   // ...uuid_small.jpg
const mediumUrl = buildImageVariant(baseUrl, 'medium'); // ...uuid_medium.jpg
const largeUrl = buildImageVariant(baseUrl, 'large');   // ...uuid_large.jpg
```

### Regenerating Existing Images

```bash
node --env-file=.env scripts/regenerate-images.js --prefix playlists/ --batch 3
```

Processes images in batches of 3 with delays to avoid rate limits.

### Cleanup Operations

```bash
# Scan for orphaned images
npm run images:scan

# View statistics
npm run images:stats

# Find orphaned images
npm run images:find-orphaned

# Delete specific image
npm run images:delete <url>

# Validate all image references
npm run images:validate
```

### srcSet Generation

From `src/shared/utils/imageUtils.js`:

```javascript
export const buildSrcSet = (baseUrl, format = 'jpg') => {
  const sizeWidths = {
    small: 200,
    medium: 400,
    large: 800
    // 'original' removed - does not exist in R2
  };

  return Object.entries(sizeWidths)
    .map(([size, width]) => {
      const url = buildImageVariant(baseUrl, size, format);
      return `${url} ${width}w`;
    })
    .join(', ');
};
```

### Checking for Orphaned Images

From `server/services/imageCleanupService.js`:

```javascript
const orphanedImages = await findOrphanedImages();
// Returns array of R2 keys not referenced in database

for (const key of orphanedImages) {
  console.log(`Orphaned: ${key}`);
  // Optionally delete: await deleteFromR2(key);
}
```

### Format-Specific URL Generation

```javascript
const avifUrl = buildImageVariant(baseUrl, 'large', 'avif');
const webpUrl = buildImageVariant(baseUrl, 'medium', 'webp');
const jpegUrl = buildImageVariant(baseUrl, 'small', 'jpg');
```
