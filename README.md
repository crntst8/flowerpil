# Flowerpil

Flowerpil is a curator-focused music publishing platform. It combines public editorial surfaces, curator playlist tooling, cross-platform DSP workflows, and admin operations in one system.

**deployed version: <https://flowerpil.io>**

## What Flowerpil Includes

- A public discovery site with a unified home feed.
- Published playlist pages with rich track metadata, previews, and DSP links.
- Curator accounts for creating, editing, importing, linking, and exporting playlists.
- Editorial content surfaces including releases, blog posts, announcements, and the About page.
- Public-user features such as Top 10 playlists and user accounts.
- `pil.bio`, a wildcard link-in-bio product tied to curator identities.
- Admin tools for content, analytics, visibility, DSP token health, error triage, and operations.

## Public Site Surfaces

### Home and discovery

- `/home` is the main landing experience.
- The unified feed can include playlists, releases, blog posts, announcements, and managed landing-page links.
- Feed visibility is curated by admins, with support for pinning and hiding items without removing them from their canonical destinations.
- Public browse and detail experiences also exist for playlists, curators, content tags, and embeds.

### Playlist publishing

- Flowerpil's core public object is the published playlist.
- Curator playlists are assembled in the dashboard, then published to public views.
- Tracks can carry cross-platform links, previews, flags, artwork, and editorial context.
- Public playlists are also the base material used by exports, embeds, and discovery surfaces.

### Releases and editorial content

- `/r/:id` serves EPK-style release pages with streaming actions, assets, embeds, and show data.
- `/posts/:slug` serves blog content created in admin.
- `/about` is an admin-managed public page with rich text and accordion sections.
- Announcements, CTA surfaces, end-scroll modules, and generic landing-page cards extend the editorial layer.

### Top 10

- `/top10/start` is a passwordless onboarding flow for public users.
- `/top10` is the authenticated editor for building a personal Top 10 list.
- `/top10/:slug` is the published public view.
- `/top10/browse` is the discovery page for published Top 10s.
- Top 10 supports DSP URL import, inline commentary, previews, social sharing, publishing, and export.

### pil.bio

- `*.pil.bio` hosts curator-controlled link-in-bio pages rendered by the backend.
- Bio pages are tightly connected to curator identities, playlist promotion, featured links, analytics, and admin moderation.
- The product supports draft editing, publishing, theme customization, reservations, analytics, and server-rendered public delivery.

## Curator Workflow

Curators are the main operators in the product.

1. Authenticate and complete onboarding.
2. Connect DSP accounts for import and export.
3. Create or edit playlists in the curator workspace.
4. Import tracks from DSP URLs or pasted text.
5. Trigger background cross-linking so tracks resolve across Apple Music, TIDAL, and Spotify.
6. Publish playlists and optionally queue exports back to supported DSPs.
7. Extend their presence with releases, `pil.bio`, and other profile surfaces.

The main curator code lives in `src/modules/curator` with supporting APIs in `server/api/curator`, `server/api/playlists.js`, `server/api/url-import.js`, `server/api/crossPlatform.js`, and `server/api/playlist-export.js`.

## Platform and Content Systems

### Imports

- Unified URL import supports Spotify, Apple Music, TIDAL, Qobuz, SoundCloud, YouTube, and Bandcamp.
- Some legacy platform-specific flows still exist, but the shared URL import system is the standard pattern.
- Import paths feed both curator playlists and Top 10.

### Cross-linking

- Cross-linking resolves tracks across Apple Music, TIDAL, and Spotify.
- The system uses job-based orchestration, confidence scoring, storefront handling, retries, and optional distributed workers.
- This is the foundation for multi-platform playlist exports and richer public track metadata.

### Exports

- Flowerpil can export playlists to connected DSP accounts.
- Export requests, worker processing, token storage, validation, and progress tracking all exist in the backend.
- Scheduled imports and automated export flows are also supported.

### Audio, images, and embeds

- Audio previews are available for playlist tracks and inline Top 10 tracks.
- Image handling includes upload, optimization, placeholder artwork, icon libraries, and R2-backed delivery.
- Embed, QR CTA, Instagram, and share-oriented surfaces extend distribution beyond the main site.

## Accounts and Access

- Authentication is JWT-based with cookie and bearer support.
- The system includes CSRF protection, rate limiting, account lockout, password reset, role checks, and audit logging.
- Core roles are admin, curator, and public user.
- Public-user flows exist alongside curator/admin flows, especially for Top 10 and personal account features.

## Admin and Operations

Admin tooling is a first-class part of the product, not an afterthought.

- Site admins manage playlists, curators, releases, posts, About content, announcements, reports, user groups, and feed visibility.
- Operational tooling covers DSP token health, worker health, system metrics, logging, error reporting, state recovery, and transfers.
- Content and platform settings are largely persisted in SQLite-backed config tables and exposed through `/api/v1/admin/*`.

## Architecture

### Frontend

- `src/` contains the React app.
- User-facing features are organized into modules under `src/modules/*`.
- Shared public layout primitives live in shared components, while curator UI uses the centralized curator design system.
- Dynamic routing loads feature modules from manifests and composes them with routes declared in `src/App.jsx`.

### Backend

- `server/index.js` mounts the Express app and registers `/api/v1` routes.
- `server/api/` contains route handlers.
- `server/services/` contains cross-platform logic, import/export orchestration, rendering helpers, and operational services.
- `server/worker/` contains background workers for linking, export processing, and token refresh tasks.

### Data and storage

- SQLite is the primary database, typically at `data/flowerpil.db`.
- Images and media flow through uploads plus R2-backed delivery patterns.
- PM2 manages local and deployed Node processes.

## Key Areas in This Repo

- `src/` - React frontend
- `server/` - Express API, services, workers, database layer
- `docs/features/` - feature-focused documentation
- `docs/PATTERNS.md` - code style guide and implementation patterns
- `docs/RULES.md` - development rules
- `docs/UX.md` - UX guidance

## Local Development

### Prerequisites

- Node.js (v20+)
- Python 3 (for YouTube Music microservice)
- Redis (optional, for caching)
- PM2 (`npm install -g pm2`)

### Setup

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Copy the example config and fill in your credentials:
   ```bash
   cp ecosystem.config.example.cjs ecosystem.config.cjs
   ```
   Edit `ecosystem.config.cjs` with your DSP API keys and other secrets. This file is gitignored and should never be committed.

3. Initialize the database:
   ```bash
   npm run db:init
   ```

4. Start development:
   ```bash
   npm run dev
   ```

### Development URLs

- Web app: `127.0.0.1:5173`
- API: `127.0.0.1:3000`

Team convention is to put secrets and environment-specific values in `ecosystem.config.cjs`, not in committed `.env` files.

## Testing

- Unit and integration tests run with Vitest.
- End-to-end tests run with Playwright.
- Backend, frontend, and E2E commands are available through the npm scripts defined in the repo.

## Contributing

1. Fork the repo and create a feature branch.
2. Follow the patterns in `docs/PATTERNS.md` and rules in `docs/RULES.md`.
3. Write tests for new functionality.
4. Open a pull request with a clear description of the change.

## License

All rights reserved. This source code is provided for reference and contribution purposes. See LICENSE for details.
