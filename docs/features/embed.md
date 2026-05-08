# Embed Feature

The Flowerpil Embed feature allows users to embed playlists and single tracks on external websites using an iframe. The embed is fully responsive and supports two design variants: Large (Desktop) and Small (Mobile).

## Usage

### Playlist Embed

To embed a playlist, use the following iframe code structure:

```html
<iframe
  src="https://flowerpil.io/embed/playlist/:playlistId?variant=large"
  width="100%"
  height="420"
  frameborder="0"
  style="border:0;max-width:100%;"
  allow="autoplay; clipboard-write"
  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
  loading="lazy">
</iframe>
```

### Track Embed

To embed a single track, use the following iframe code structure:

```html
<iframe
  src="https://flowerpil.io/embed/track/:trackId?variant=small"
  width="100%"
  height="180"
  frameborder="0"
  style="border:0;max-width:100%;"
  allow="autoplay; clipboard-write"
  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
  loading="lazy">
</iframe>
```

## URL Parameters

The embed URL accepts the following query parameters for customization:

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `variant` | `string` | `large` | `large` (Desktop, actions on right) or `small` (Mobile, actions below). |
| `bg` | `hex` | `#dbdbda` | Background color (e.g., `%23000000`). |
| `text` | `hex` | `#000000` | Text color. |
| `accent` | `hex` | `#438eff` | Accent color (used for hover states). |
| `font` | `string` | `helvetica` | Font stack. Options: `helvetica`, `PaperMono`. |

## Variants

### Large (Desktop)
*   **Recommended Height:** `420px` (Playlist), `120px` (Track)
*   **Layout:** Artwork and text on the left, action buttons on the right.
*   **Best for:** Desktop websites, wide articles.

### Small (Mobile)
*   **Recommended Height:** `600px` (Playlist), `180px` (Track)
*   **Layout:** Artwork and text centered or stacked, action buttons in a row below the track info.
*   **Best for:** Mobile views, sidebars, compact widgets.

## Features

### Audio Preview
When a track has a `preview_url`, a play button appears allowing users to listen to a 30-second preview directly in the embed. Only one track plays at a time.

### Genre Tags
Tracks with a `genre` field display a tag with black border and uppercase text in Paper Mono font.

### Quotes
Tracks with a `quote` field display a quote block above the track content with a gray background and dashed olive border.

### Platform Links
Embeds support links to: Tidal, Apple Music, Spotify, YouTube Music, Bandcamp, SoundCloud, and Qobuz.

## Security Headers

Embeds are served with the following headers for cross-browser compatibility:

| Header | Value | Purpose |
| :--- | :--- | :--- |
| `Content-Security-Policy` | `frame-ancestors *` | Allow embedding on any domain |
| `Permissions-Policy` | `clipboard-write=*, autoplay=*` | Enable clipboard and autoplay features |
| `Cross-Origin-Resource-Policy` | `cross-origin` | Allow cross-origin resource loading |

The `X-Frame-Options` header is removed to prevent conflicts with CSP.

## Technical Implementation

*   **Server:** `server/api/embed.js` handles the rendering of the HTML. It fetches data from the public API (`server/api/public-playlists.js` and `server/api/tracks.js` implicitly via internal fetch or direct logic if refactored).
*   **Edge Function:** `functions/embed/[[path]].js` proxies embed requests and adds security headers at the Cloudflare edge.
*   **Styling:** CSS is injected directly into the HTML response based on the parameters.
*   **Frontend:**
    *   `PlaylistShareModal.jsx` generates the embed code for playlists.
    *   `TrackShareModal.jsx` generates the embed code for tracks.
    *   `ExpandableTrack.jsx` opens the `TrackShareModal`.
