# SEO System

## Overview

Flowerpil uses a centralized SEO component for managing meta tags, OpenGraph, Twitter Cards, and JSON-LD structured data across all pages.

## SEO Component

**Location:** `src/shared/components/SEO.jsx`

### Usage

```jsx
import SEO, { generateWebsiteSchema, generateItemListSchema } from '@shared/components/SEO';

<SEO
  title="Page Title"
  description="Page description for search results"
  canonical="/page-path"
  keywords={['keyword1', 'keyword2']}
  structuredData={generateItemListSchema(items, 'List Name')}
/>
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `title` | string | Yes | Page title (automatically suffixed with " \| Flowerpil") |
| `description` | string | Yes | Meta description (150-160 characters recommended) |
| `canonical` | string | Yes | Canonical URL path (e.g., "/discover") |
| `keywords` | string[] | No | Array of keywords for meta keywords tag |
| `image` | string | No | OpenGraph image URL (defaults to `/og-image.png`) |
| `type` | string | No | OpenGraph type (defaults to "website") |
| `structuredData` | object | No | JSON-LD structured data object |
| `noindex` | boolean | No | Set to true to add noindex,nofollow robots tag |

### Schema Generators

#### `generateWebsiteSchema()`
Generates WebSite structured data with search action.

```jsx
import { generateWebsiteSchema } from '@shared/components/SEO';

const schema = generateWebsiteSchema();
// Returns WebSite schema with name, url, description, and SearchAction
```

#### `generateOrganizationSchema()`
Generates Organization structured data.

```jsx
import { generateOrganizationSchema } from '@shared/components/SEO';

const schema = generateOrganizationSchema();
// Returns Organization schema with name, url, logo
```

#### `generatePlaylistSchema(playlist)`
Generates MusicPlaylist structured data for individual playlists.

```jsx
import { generatePlaylistSchema } from '@shared/components/SEO';

const schema = generatePlaylistSchema({
  id: 123,
  title: 'Playlist Name',
  description: 'Playlist description',
  curatorName: 'Curator Name',
  trackCount: 25
});
```

#### `generateItemListSchema(items, listName)`
Generates ItemList structured data for list pages.

```jsx
import { generateItemListSchema } from '@shared/components/SEO';

const items = [
  { type: 'MusicPlaylist', name: 'Playlist 1', url: 'https://flowerpil.io/playlists/1' },
  { type: 'Person', name: 'Curator 1', url: 'https://flowerpil.io/curator/curator-1' }
];

const schema = generateItemListSchema(items, 'Featured Playlists');
```

---

## SEO Landing Pages

### Discover Page
- **Route:** `/discover`
- **File:** `src/modules/home/components/DiscoverPage.jsx`
- **Target Keywords:** music discovery, new music playlists, curated playlists, discover new music
- **Content:** Hero section, featured playlists grid, curators showcase, feature cards

### Releases Page
- **Route:** `/releases`
- **File:** `src/modules/home/components/ReleasesPage.jsx`
- **Target Keywords:** new music releases 2026, weekly new music, new album releases
- **Content:** Hero section, releases grouped by month/year, feature cards
- **Data Source:** `/api/v1/releases/feed`

### Australia Page
- **Route:** `/australia`
- **File:** `src/modules/home/components/AustraliaPage.jsx`
- **Target Keywords:** Australian music releases, new music Australia, Australian music blogs
- **Content:** Hero section, Australian curators, Australian playlists, city descriptions
- **Data Source:** Filters curators/playlists by Australian locations

---

## Pages with SEO

| Page | Route | Title | Structured Data |
|------|-------|-------|-----------------|
| Homepage | `/home` | Curated Music Playlists | WebSite + Organization |
| Discover | `/discover` | Discover New Music & Curated Playlists | WebSite + ItemList (playlists) |
| Releases | `/releases` | New Music Releases - Weekly New Tracks & Albums | WebSite + ItemList (releases) |
| Australia | `/australia` | Australian Music Releases & Curators | WebSite + ItemList (curators) |
| Curators | `/curators` | Music Curators & Playlist Creators | ItemList (curators) |
| Playlists | `/playlists` | Browse Curated Playlists | ItemList (playlists) |
| Search | `/search?q=` | Search: {query} | None (dynamic query page) |

---

## Route Registration

Routes are registered in `src/modules/home/manifest.js`:

```js
routes: [
  { path: '/home', component: 'LandingPage' },
  { path: '/discover', component: 'DiscoverPage' },
  { path: '/releases', component: 'ReleasesPage' },
  { path: '/australia', component: 'AustraliaPage' }
]
```

Components are exported from `src/modules/home/index.js`.

---

## Adding SEO to a New Page

1. Import the SEO component:
```jsx
import SEO, { generateItemListSchema } from '@shared/components/SEO';
```

2. Add SEO component as first child of page container:
```jsx
return (
  <PageContainer>
    <SEO
      title="Page Title"
      description="Description for search results (150-160 chars)"
      canonical="/page-path"
      keywords={['relevant', 'keywords']}
      structuredData={yourStructuredData}
    />
    {/* Page content */}
  </PageContainer>
);
```

3. For list pages, generate structured data from your data:
```jsx
const schemaItems = useMemo(() => {
  return items.slice(0, 10).map(item => ({
    type: 'Thing', // or MusicPlaylist, Person, etc.
    name: item.name,
    url: `https://flowerpil.io/items/${item.id}`
  }));
}, [items]);
```

---

## Meta Tag Strategy

- **Title Format:** `{Page Title} | Flowerpil`
- **Description:** 150-160 characters, include primary keyword
- **Keywords:** 5-10 relevant terms per page
- **Canonical URLs:** Format `https://flowerpil.io{path}`

---

## Structured Data Types

| Page Type | Schema Type | Purpose |
|-----------|-------------|---------|
| Homepage | WebSite + Organization | Site-wide search, brand info |
| List pages | ItemList | Rich snippets for collections |
| Playlist pages | MusicPlaylist | Rich snippets for playlists |
| Curator profiles | Person | Rich snippets for curators |

---

## OpenGraph Images

- **Default:** `/og-image.png`
- **Playlists:** Use playlist artwork via `image` prop
- **Curators:** Use curator profile image via `image` prop

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/shared/components/SEO.jsx` | SEO component with schema generators |
| `src/modules/home/components/DiscoverPage.jsx` | Discover landing page |
| `src/modules/home/components/ReleasesPage.jsx` | Releases landing page |
| `src/modules/home/components/AustraliaPage.jsx` | Australia landing page |
| `src/modules/home/components/LandingPage.jsx` | Homepage with SEO |
| `src/modules/curators/components/CuratorList.jsx` | Curators list with SEO |
| `src/modules/playlists/components/PlaylistList.jsx` | Playlists list with SEO |
| `src/modules/home/manifest.js` | Route definitions |
| `src/modules/home/index.js` | Component exports |
