# Placeholder Artwork System

Generates colored placeholder images with a centered flower for tracks, playlists, and curators missing artwork. Colors harmonize when items appear together in lists.

## Core Files

| File | Purpose |
|------|---------|
| `src/shared/contexts/PlaceholderColorContext.jsx` | Loads color palette, filters bright colors, provides harmonization logic |
| `src/shared/hooks/usePlaceholderColor.js` | Hook for accessing color selection |
| `src/shared/components/PlaceholderArtwork.jsx` | Renders colored background + flower |
| `public/placeholder/colors.json` | ~300 colors with harmonization pairings |
| `public/placeholder/flower.png` | Centered flower image |
| `scripts/refresh-placeholder-colors.js` | Updates stored fallback colors for curators in the database. |

## Usage

```jsx
import PlaceholderArtwork from '@shared/components/PlaceholderArtwork';

// Basic usage
<PlaceholderArtwork itemId={playlist.id} size="medium" />

// With harmonization (pass previous item's color index)
<PlaceholderArtwork
  itemId={track.id}
  previousColorIndex={previousColor?.index}
  size="small"
  borderRadius="4px"
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `itemId` | string \| number | required | Unique ID for deterministic color selection |
| `previousColorIndex` | number | null | Previous item's color index for harmonization |
| `size` | `'small'` \| `'medium'` \| `'large'` | `'medium'` | Controls flower size relative to container |
| `borderRadius` | string | `'4px'` | CSS border-radius value |

### Size Configuration

```js
small:  { flower: '60%', minFlower: '24px' }  // Track thumbnails
medium: { flower: '55%', minFlower: '40px' }  // Playlist cards
large:  { flower: '50%', minFlower: '60px' }  // Playlist view, curator profiles
```

## Color Selection

### Brightness Filtering

To improve visual consistency and legibility, overly bright colors are filtered out from the selection process. `PlaceholderColorContext.jsx` now calculates the luminance of each color upon loading `colors.json`.

- Any color with a luminance value greater than `200` is excluded from the available color pool.
- This prevents washed-out or excessively bright backgrounds (e.g., harsh yellows, light pinks) from being used.
- The harmonization and hashing logic then operates only on this pre-filtered set of colors.

### Deterministic Hashing

`PlaceholderColorContext.jsx` uses a hash function to select colors deterministically from item IDs:

```js
const hashString = (str) => {
  let hash = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};
```

The same `itemId` always produces the same color from the filtered pool.

### Harmonization

Each color in `colors.json` has a `combinations` array listing indices of colors that pair well:

```json
{
  "index": 1,
  "name": "Hermosa Pink",
  "hex": "#ffb3f0",
  "combinations": [176, 227, 273]
}
```

When `previousColorIndex` is provided, `getColorForItem()` attempts to pick from the previous color's combinations, but **only if** those combination colors are present in the filtered, non-bright list.

### Repetition Avoidance

`usedIndicesRef` in the context tracks colors used within a render cycle. Call `resetUsedColors()` when the list changes to allow reuse.

## Flower Visibility Adjustment

While the brightest colors are now excluded, `PlaceholderArtwork.jsx` still performs minor adjustments to the flower's visibility against the remaining backgrounds.

### Luminance Calculation

```js
const getLuminance = (hex) => {
  const r = parseInt(hex.substring(1, 3), 16);
  const g = parseInt(hex.substring(3, 5), 16);
  const b = parseInt(hex.substring(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};
```

### Filter Thresholds

This logic makes subtle adjustments to ensure the flower remains legible across the approved color palette.

| Luminance | Filter Applied |
|-----------|----------------|
| > 160 | `brightness(0.75) contrast(1.05)` |
| > 120 | `brightness(0.9)` |
| < 120 | `brightness(1.05)` + stronger shadow |

## Noise Texture

`NoiseOverlay` adds static grain using an inline SVG with `feTurbulence`:

```jsx
const NoiseOverlay = styled.div`
  position: absolute;
  inset: 0;
  opacity: 0.08;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,...feTurbulence...");
`;
```

- Uses `fractalNoise` for organic grain
- `mix-blend-mode: overlay` blends with the color
- 8% opacity for subtle texture
- Flower renders above noise layer (z-index: 1)

## Database & Refresh Script

To ensure curators have a consistent placeholder color across the site, their color index is stored in the database.

### Database Storage

- **Table:** `curators`
- **Column:** `fallback_flower_color_index` (INTEGER)
- This column stores the `index` of the color assigned to the curator based on the deterministic hashing of their ID.

### Refresh Script

A script is provided to update all stored curator colors to align with the latest color filtering logic. This is useful after changing the `BRIGHTNESS_THRESHOLD` or otherwise modifying the color selection rules.

- **Location:** `scripts/refresh-placeholder-colors.js`
- **Purpose:** Iterates through all curators, recalculates their placeholder color index using the filtered color list, and updates the `fallback_flower_color_index` in the database if it has changed.
- **Usage:**
  ```bash
  node scripts/refresh-placeholder-colors.js
  ```

## Components Using Placeholders

### Playlists
- `src/modules/playlists/components/PlaylistCard.jsx`
- `src/modules/playlists/components/PlaylistView.jsx`
- `src/modules/playlists/components/CompactPlaylistCard.jsx`
- `src/modules/home/components/FeedPlaylistCard.jsx`

### Tracks
- `src/modules/playlists/components/ExpandableTrack.jsx`
- `src/modules/top10/components/Top10TrackCard.jsx`

### Curators
- `src/modules/curators/components/CuratorProfile.jsx`
- `src/modules/curators/components/CuratorList.jsx`

## Provider Setup

`PlaceholderColorProvider` wraps the app in `src/App.jsx`:

```jsx
<SiteSettingsProvider>
  <PlaceholderColorProvider>
    <AuthProvider>
      {/* app content */}
    </AuthProvider>
  </PlaceholderColorProvider>
</SiteSettingsProvider>
```

The provider fetches `/placeholder/colors.json` once on mount, filters out bright colors, and caches color selections in `colorCacheRef`.
