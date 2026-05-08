# Releases

EPK-style release pages with action links, press assets, video embeds, and direct show/tour date entry.

## Public URL
`/r/:id`

## Homepage Integration
Published releases appear in the homepage unified feed alongside playlists, blog posts, and links. Release cards display artwork, artist name, title, release type/date, and genre tags.

## Data Model

```
releases
├── id, curator_id, artist_name, title
├── release_type (single|double-single|EP|album|live album|remix|remaster)
├── release_date, post_date, genres (JSON), description
├── video_url, artwork_url, is_published, password_hash
├── artist_bio_topline, artist_bio_subtext, artist_bio_image_url
├── show_video, show_images, show_about, show_shows (section toggles)
├── sort_order
└── created_at, updated_at

release_actions
├── id, release_id, platform_key, label, url, icon_mode, sort_order

release_assets
├── id, release_id, asset_type (press_image|hero_image|clip)
├── url, attribution, allow_download, sort_order

release_shows (direct per-release show entries)
├── id, release_id, show_date, venue, city, country
├── ticket_url, notes, sort_order, created_at
```

## Backend API

`server/api/releases-v2.js`

### Public
- `GET /api/v1/releases/feed` - published releases for homepage feed (no password-protected)
- `GET /api/v1/releases/:id/public` - public view with password gating
- `POST /api/v1/releases/:id/verify-password` - password verification, returns JWT

### Curator/Admin (authenticated)
- `GET /api/v1/curators/:id/releases` - curator's releases list
- `POST /api/v1/curators/:id/releases` - create release
- `GET /api/v1/releases/:id` - get release for editing
- `PUT /api/v1/releases/:id` - update release
- `DELETE /api/v1/releases/:id` - delete release
- `PUT /api/v1/releases/:id/password` - set/remove password
- `POST /api/v1/releases/:id/actions` - bulk update action links
- `POST /api/v1/releases/:id/assets` - bulk update assets
- `POST /api/v1/releases/:id/shows` - bulk update shows

### Import
- `POST /api/v1/releases/import/url` - import from any supported DSP URL (Spotify, Apple Music, Tidal, Bandcamp) with cross-platform linking
- `POST /api/v1/releases/import/spotify` - legacy Spotify-only import

## Frontend Module

`src/modules/releases/`

| File | Purpose |
|------|---------|
| `manifest.js` | route `/r/:id` |
| `services/releaseService.js` | API client |
| `components/ReleaseView.jsx` | public page |
| `components/ReleasePasswordGate.jsx` | password prompt |
| `components/ReleaseActionRow.jsx` | DSP platform icons |
| `components/ReleaseImageModal.jsx` | press image lightbox |

## Homepage Feed

`src/modules/home/`

| File | Purpose |
|------|---------|
| `components/FeedReleaseCard.jsx` | Release card for homepage feed |
| `services/unifiedFeedService.js` | Fetches releases alongside playlists |

## Curator Dashboard

`src/modules/curator/components/CuratorReleasesPanel.jsx`

### Section Visibility Controls
Checkboxes control both the public page display AND the editor input visibility:
- **Video** - Shows video URL input and video tab on public page
- **Press Assets** - Shows assets editor and images tab on public page
- **Artist Bio** - Shows bio fields and about section on public page
- **Tour Dates** - Shows tour dates editor and shows section on public page

### Editor Sections
- Import from URL (Spotify, Apple Music, Tidal, Bandcamp)
- Release details (artist, title, type, genres, dates, description)
- Artwork upload/URL
- Video URL (YouTube/Vimeo embed)
- Artist bio (headline, image, text)
- Press assets (draggable, with file upload)
- Tour dates/shows (draggable)
- Streaming links/actions (draggable)
- Publishing controls and password protection

## Platform Icons (First-Class)
Spotify, Apple Music, Tidal, Bandcamp, YouTube Music, Amazon Music

## Access Control
- Releases enabled for curator accounts with `profile_type` in artist/label categories
- `upcoming_releases_enabled = true` flag on curator account
- Admin can toggle release access or create releases for any curator

## Files Reference

| Purpose | Path |
|---------|------|
| Migration | `server/database/migrations/071_releases_mvp.js` |
| Shows restructure | `server/database/migrations/073_release_shows_direct.js` |
| API | `server/api/releases-v2.js` |
| Spotify methods | `server/services/spotifyService.js` |
| URL parsing | `server/services/urlParsing.js` |
| Frontend module | `src/modules/releases/` |
| Public page | `src/modules/releases/components/ReleaseView.jsx` |
| Curator editor | `src/modules/curator/components/CuratorReleasesPanel.jsx` |
| Homepage card | `src/modules/home/components/FeedReleaseCard.jsx` |
| Unified feed service | `src/modules/home/services/unifiedFeedService.js` |
