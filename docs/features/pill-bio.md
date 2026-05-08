# pil.bio System Overview

## Scope

pil.bio is Flowerpil's link-in-bio service. It serves curator-controlled micro-sites on the wildcard domain `*.pil.bio`, mirroring a Linktree-style experience that is tightly integrated with curator playlists, profiles, and the broader platform. Curators configure pages through the dashboard (`src/modules/curator/components/CuratorBioPage.jsx`), admins can override and audit configurations from the site admin suite (`src/modules/admin/components/SiteAdmin.jsx`, `BioPageAdmin.jsx` plus the System Health card), and the public surface is rendered server-side by the backend (`server/middleware/bioHostRouting.js`, `server/services/bioPageRenderer.js`). This document details every moving part across infrastructure, backend, frontend, data, and operations.

---

## Domain, Edge & Routing

- **DNS & CDN:** `*.pil.bio` wildcard records terminate at Cloudflare. Cloudflare forwards requests to NGINX on the application host (`prod`), which injects `X-Bio-Handle` headers for detected subdomain handles before proxying to the Node server.
- **Express middleware stack:**
  - `server/middleware/bioHostRouting.js` inspects the `Host` header (or `X-Bio-Handle`) to extract a valid handle (3–30 chars, lowercase alphanumeric plus hyphen). Reserved words (e.g., `admin`, `api`, `support`, etc.) abort routing.
  - In development `devBioRouting` permits overrides via `?bio_handle=handle` for local testing.
  - When a published profile is found (`getPublishedBioProfile` query), the middleware annotates the request with `isBioPageRequest`, `bioHandle`, and `bioProfile` for downstream handlers.
  - Missing or unpublished handles return a monochrome HTML 404 with “Bio Page Not Found”; errors render a 500 fallback.
- **Final handler:** `server/index.js` has a wildcard `app.get('*', …)` that detects `X-Bio-Handle` and renders pages by:
  1. Fetching curated profile + curator joins from SQLite.
  2. Loading featured links (`getBioFeaturedLinks`).
  3. Feeding data into `generateBioPageCSS`, `generateBioMetaTags`, and `generateBioPageHTML`.
  4. Returning fully composed HTML with cache headers (`public, max-age=300`).
- **Preview route:** `/api/v1/bio/:handle` ( `server/api/bio-page-handler.js`) mirrors the same SSR but allows draft previews in non-production environments when `?preview=1` or `?draft=1` is supplied.
- **CORS:** `server/middleware/securityHeaders.js` explicitly whitelists wildcard `https://*.pil.bio`, ensuring public assets and API calls from those origins survive.

---

## Data Model (SQLite)

The primary schema stems from migrations `009_bio_pages_system.js` and `010_admin_performance_tools.js`.

### Core Tables

- **`bio_profiles`** (`handle`, `curator_id`, JSON blobs for `display_settings`, `theme_settings`, `seo_metadata`, `draft_content`, `published_content`, booleans for publication, version tracking, timestamps, `last_handle_change_at`).
- **`bio_featured_links`** (three-slot layout, per-position uniqueness, typed `link_type` distinguishing URL vs. curated content, JSON `link_data` & `display_settings`, `is_enabled`).
- **`bio_versions`** (immutable history snapshots with `version_number`, JSON `content_snapshot`, `change_summary`, `created_by`).
- **`bio_analytics_views` / `bio_analytics_clicks`** (privacy-aware rollups capturing per-day views/clicks, session hashes, referrers; indexes ready for aggregation). `009_enhanced_analytics.js` extends this with `bio_analytics_events`, `bio_analytics_daily`, `bio_analytics_weekly`, `bio_analytics_realtime`, `bio_analytics_links`, and `bio_analytics_performance` for richer telemetry pipelines.

### Operational Tables

- **`bio_admin_settings`** (locks, optimization state, performance score, featured flag, admin notes, review metadata).
- **`bio_handle_reservations`** (admin-controlled reservation lifecycle with status transitions `reserved` → `assigned` → `released`, expirations, notes).
- **`bio_performance_metrics`** (granular metrics keyed by `metric_type`, e.g., `page_load`, `cache_hit`).
- **`bio_user_restrictions`** (per-user throttles or bans), **`admin_audit_log`** (traceable actions), **`system_performance_log`**, **`security_incidents`**, **`admin_system_config`** (feature toggles and thresholds).
- **`feature_flags`** (shared table but used by pil.bio to control rollouts).

All JSON columns are persisted as strings, so API layers parse/serialize these values (`processBioProfileResponse` in `server/api/bio-profiles.js`).

---

## Backend Services

### Bio Profile API (`server/api/bio-profiles.js`)

| Route | Purpose | Notes |
| --- | --- | --- |
| `GET /api/v1/bio-profiles` | List profiles | Admin/authenticated curators; optional filters (`published`, `curator_id`). Curators only see their profiles enforced via `ensureCuratorAccess`. |
| `GET /api/v1/bio-profiles/:id` | Load profile + featured links, versions, analytics, curator info | Parses JSON columns, returns curated `profileLinks` derived from curator socials (`getProfileLinksForDisplay`). |
| `POST /api/v1/bio-profiles` | Create profile | Validates handle via `checkHandleAvailability`, requires `curator_id`, optionally processes `content_image` upload through `multer` + `sharp` into `public/uploads/bio-pages`. Inserts version snapshot (`insertBioVersion`). |
| `PUT /api/v1/bio-profiles/:id` | Update draft | Enforces 24h handle-change cooldown (`getLastHandleChange`). Writes version, increments `version_number`, reassigns handle reservation if changed. |
| `POST /api/v1/bio-profiles/:id/publish` | Queue publish job | Schedules background job (see Queue). Validates non-empty draft content. |
| `POST /api/v1/bio-profiles/:id/unpublish` | Queue unpublish | Enqueues removal/invalidation. |
| `DELETE /api/v1/bio-profiles/:id` | Delete profile | Cascades through foreign keys. |
| `GET /api/v1/bio-profiles/:id/preview` | Authenticated JSON preview | Packages profile + curator + featured links. |
| `GET /api/v1/bio-profiles/public/:handle` | Public JSON | Validates handle, returns published profile plus cached HTML if available (used by external integrations). |
| `PUT /api/v1/bio-profiles/:id/featured-links` | Bulk update featured links | Accepts JSON array, sanitizes each entry. |
| `GET /api/v1/bio-profiles/jobs/:jobId` | Job status | Surfaces queue metadata. |
| `GET /api/v1/bio-profiles/queue/stats` | Queue + cache stats | Combines `getQueueStats()` and `cacheManager.getCacheStats()`. |
| `POST /api/v1/bio-profiles/:id/rollback/:versionId` | Queue version rollback | Uses job queue to reapply `bio_versions` snapshot. |

The module leans on helper utilities:
- `sanitizeBioProfileData` and `validateHandle` from `server/utils/bioValidation.js` for input normalization and reserved list enforcement (200+ disallowed handles).
- `ensureCuratorAccess` ensures logged-in curators cannot mutate other curators’ bios (403 guard).
- `processAndSaveBioImage` standardizes uploaded imagery (JPEG, 800x600 or 1200x400 for banners).

### Handle API (`server/api/bio-handles.js`)

- `GET /check/:handle` couples format validation with DB lookups. If unavailable, returns alternative suggestions via `suggestHandles`.
- `GET /validate/:handle` supplies synchronous format validation feedback.
- `GET /suggest/:partial` produces sanitized completions (requires ≥2 chars).

### Theme & Accessibility API (`server/api/bio-themes.js`)

- Abstracts color accessibility: validators rely on `server/utils/accessibilityValidator.js` for WCAG contrast calculations, color-blindness simulations, and alternative suggestions.
- Provides curated palettes via `server/utils/colorPalettes.js`, accessible categories, and variation generators.

### Admin Bio APIs

- `server/api/admin/bioPagesAdmin.js` exposes admin dashboards: listing, filtering, locking, bulk publish/unpublish, queue stats, featured flagging, and audit logging.
- `server/api/admin/handleManager.js` manages reservations, stats, expirations, and logs operations to `admin_audit_log`.
- `server/api/admin/siteAdmin.js` stitches the admin UI (handles along with other platform features).

### Rendering & Caching

- `server/services/bioPageRenderer.js` orchestrates published vs. draft rendering. It parses JSON fields, resolves theme palette (`getThemeById` in `src/shared/constants/bioThemes.js`), and defers to utility functions for CSS, HTML, and metadata.
- `server/utils/bioPageRenderer.js` provides lower-level primitives:
  - `generateBioPageCSS` builds CSS variables and layout rules tailored to theme colors.
  - `generateBioMetaTags` emits SEO/OG/Twitter tags, canonical URL, and structured data, defaulting to curated text when SEO metadata is absent.
  - `generateBioPageHTML` (long template) renders layout: header, avatar, name, optional location/bio, featured link cards, playlist previews, profile buttons (with emoji icons), and Flowerpil badge.
  - Asset resolver + public URL normalizer ensure relative URLs resolve to Flowerpil origin or `BIO_ASSET_BASE_URL` override.
- `server/services/cacheManager.js` handles static caching:
  - Stores HTML snapshots under `.cache/bio-pages` and optionally `public/bio-static/<handle>.html`.
  - `cacheStaticBioPage` writes SSR output; `invalidateBioPageCache` removes stale artifacts.
  - `getCachedBioPage` (not yet widely used) checks for ready-made HTML.
  - `warmBioPageCache` bulk primes caches; `cleanupCache` purges aged entries.

### Publishing Queue (`server/services/publishingQueue.js`)

- Maintains an in-memory priority queue with concurrency cap (3 jobs).
- Job types: `publish`, `unpublish`, `cache_warm`, `cache_invalidate`, `version_rollback`.
- `executePublishJob` validates content, snapshots draft into `bio_versions`, updates `bio_profiles` (promoting draft → published), then invokes `cacheStaticBioPage`.
- `executeUnpublishJob` flips `is_published`, clears `published_at`, and invalidates caches.
- Queue exposes metrics (`getQueueStats`) and audit logging via `logger`.
- Jobs support retries with exponential backoff (5s * attempt).

---

## Frontend Surfaces

### Curator Dashboard (`src/modules/curator/components/CuratorBioPage.jsx`)

- On mount, fetches the authenticated curator via `authenticatedFetch('/api/v1/curator/profile')`, seeds the `useBioEditorStore` with the curator object, and primes the selected curator (`setCurators`, `setSelectedCurator`).
- Fetches existing bio profiles for that curator, preferring the latest `updated_at` entry to pre-populate the editor.
- Renders the shared `<BioEditor />` component inside a stylized container (mono fonts, gradient background).

### Bio Editor Module

- **State store:** `src/modules/bio/store/bioEditorStore.js` (Zustand) centralizes editor state.
  - Holds `currentBioProfile`, `featuredLinks`, derived `profileLinks`, validation state, UI flags (`isLoading`, `unsavedChanges`, `previewMode`), auto-save timer, etc.
  - Computed helpers `isValidForSave` (requires handle + curator + handle availability) and `isValidForPublish` (adds persisted ID plus either enabled featured links or custom bio text).
  - `updateHandle` cleans handles and triggers preview URL updates respecting `VITE_BIO_DOMAIN` (defaults to `pil.bio`), producing `https://{handle}.pil.bio` in production or proxied `/api/v1/bio/{handle}` in dev.
  - `enableAutoSave` schedules 30s background saves when drafts are valid and dirty.

- **Component suite:**
  - `BioEditor.jsx` orchestrates form panels, action bars, status toasts, floating controls, preview modal toggling, and auto-save lifecycle.
  - `HandleInput.jsx` manages live validation, suggestions, `https://____.pil.bio` preview string, indicating availability/format errors from `bioService.validateHandle()`.
  - `FeaturedLinksManager.jsx` provides drag/drop reordering, toggles, metadata editing (title, description, image, CTA), limiting to three slots.
  - `ProfileLinksDisplay.jsx` shows read-only derived links (Spotify, social, website) computed via `profileLinksDerived.js` heuristics.
  - `DisplaySettingsPanel.jsx` toggles sections (bio, location, social, featured links, analytics).
  - `ThemeCustomizer.jsx` lists palettes from `BIO_THEME_PALETTES`, custom color pickers, accessibility badges driven by `bioService` theme endpoints.
  - `BioPreview.jsx` renders an inline mock of the final page with responsive breakpoints (mobile/tablet/desktop) using theme colors and derived content.
  - `BioPreviewModal.jsx` surfaces the preview in a modal with shareable preview URLs.

- **User flow:**
  1. Choose handle (`HandleInput`) → triggers validation/reservation checks in background.
  2. Configure featured links, toggles, theme, SEO fields (pulled from `currentBioProfile`).
  3. `Save Draft` (POST/PUT). The store merges server response with local featured link order to avoid flicker.
  4. `Publish` constructs queue job; UI relies on job status endpoints for follow-up (admins may surface progress in dashboards).
  5. Auto-save ensures unsaved changes are persisted opportunistically.

- **Error handling:** `showStatus` displays toasts; store maintains `error` string. Reset clears draft to defaults.

### Admin Surfaces

- **Bio Page Administration (`src/modules/admin/components/BioPageAdmin.jsx`):**
  - Provides filters for status, optimization, search, featured.
  - Displays aggregated stats (views/clicks via joined analytics tables) and admin settings (locks, optimization state).
  - Integrates actions for publish/unpublish, locking, assignment, queue management.
- **Site Admin Handles (`src/modules/admin/components/SiteAdmin.jsx` section near lines ≈1330):**
  - Toggle between `Profiles` and `Reservations` views.
  - Uses `/api/v1/admin/handle-manager` to load reservations, release, or assign handles; provides quick navigation into the Bio Editor using `openBioEditor(handle)` which manipulates the query string.
  - Displays reservation status (expired, released, assigned) with `handle_next_change_at` feedback.
- **System Health card (Site Admin)** tracks `bio_performance_metrics` and `system_performance_log` summaries so admins can spot slow bio pages or cache misses alongside other platform alerts.

### Shared Constants & Utilities

- `src/shared/constants/bioThemes.js` enumerates accessible palettes with metadata (`category`, contrast ratios). Used both server-side (for fallback) and client-side.
- `src/modules/bio/utils/publicUrl.js` ensures featured link URLs resolve to absolute URLs, defaulting to `VITE_PUBLIC_SITE_URL` or window origin.
- `server/utils/profileLinksDerived.js` auto-detects streaming/social platforms from curator `social_links` & `external_links`, guaranteeing four profile buttons (three derived + Flowerpil profile).

---

## Image & Asset Handling

- Uploads saved by the API land under `public/uploads/bio-pages`. The resizing pipeline uses `sharp` to maintain aspect ratio with cover cropping.
- `bioPageRenderer`'s `resolveAssetUrl` respects absolute URLs, protocol-relative URLs, and local asset paths. Set `BIO_ASSET_BASE_URL` env to point at CDN if assets are mirrored.
- The SSR template references Flowerpil logos hosted on the main domain (`https://flowerpil.io`).

---

## Draft vs. Published Lifecycle

1. **Draft editing:** `draft_content` stores a JSON payload containing `customBio`, `bio` (curator text snippet), `featuredLinks[]`, and optional `contentImage` path.
2. **Publishing:** The queue copies `draft_content` to `published_content`, stamps `published_at`, increments version, caches HTML, and logs admin audit entries (via admin routes).
3. **Unpublish:** Clears `is_published`, invalidates caches, but retains draft data for later republish.
4. **Versioning:** Each save increments `version_number`. Admins can trigger rollbacks that enqueue `VERSION_ROLLBACK` jobs.

---

## Analytics & Monitoring

- **Recording:** Instrumentation hooks are scaffolded via `bio_analytics_*` tables and `bio_performance_metrics`. Data ingestion (e.g., from Cloudflare Workers or client-side beacons) is expected to insert into these tables; they feed the Site Admin System Health dashboards.
- **Admin analytics:** `bioPagesAdmin` query joins `bio_analytics_views` and `bio_analytics_clicks` counts to show total interactions alongside admin state.
- **Cache metrics:** `cacheManager.getCacheStats()` reports count & total size of HTML caches (both `.cache` and `public/bio-static`).
- **System performance log:** Designed to capture environment health metrics (CPU, queue depth) and threshold breaches to trigger alerts.
- **Security incidents:** Provide audit trail for unusual activity (e.g., rate-limit breaches on handle validation endpoints).

---

## Security, Privacy & Compliance

- **Authentication:**
  - Curator-facing endpoints rely on `authMiddleware` to attach `req.user`. `ensureCuratorAccess` enforces ownership.
  - Admin routes stack `authMiddleware` plus rate-limiting (via `adminApiLimiter` in `server/index.js`).
- **CSRF:** All mutating requests must include the `X-CSRF-Token` header; the frontend uses `bioService` helpers to append tokens from cookies.
- **Handle restrictions:**
  - Format enforced via regex (`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`).
  - Reserved list includes infrastructure keywords, business/legal terms, abusive language, Flowerpil brand words, etc., across both middleware and validation utilities.
  - Handle change cooldown: `bio_profiles.last_handle_change_at` ensures a 24-hour wait between updates.
- **Uploads:** `multer` rejects non-image MIME types; `sharp` re-encodes images, stripping metadata.
- **CORS:** Only configured origins / wildcard subdomains permitted. `credentials: true` ensures cookies (CSRF) are preserved.
- **HTTPS:** Production runs behind Cloudflare + NGINX; Express listens on HTTP but `securityHeaders.js` adds HSTS when `NODE_ENV=production`.
- **Privacy:** Analytics tables store hashed session identifiers, no raw IPs, supporting privacy policy requirements.

---

## Local Development & Configuration

- **Environment flags:**
  - `BIO_DEBUG=true` logs host routing decisions.
  - `BIO_ASSET_BASE_URL` overrides asset host.
  - `FRONTEND_URL` (server) and `VITE_PUBLIC_SITE_URL` (frontend) define canonical URLs.
  - `VITE_BIO_DOMAIN` sets preview domain fallback (default `pil.bio`).
  - `USE_HTTPS`, `SSL_KEY_PATH`, `SSL_CERT_PATH` enable HTTPS locally for accurate subdomain testing.
- **Developer preview:** Append `?bio_handle=test` to local URLs when `NODE_ENV=development` to preview specific handles without DNS. `BioEditor` preview uses proxied backend route to avoid cross-origin issues.
- **Seeding:** To manually inspect a page, insert into `bio_profiles` and `bio_featured_links` via SQLite, or run migrations and create via admin UI.
- **Cache directories:** Ensure `.cache/bio-pages` and `public/bio-static` exist (created lazily by `cacheManager`).

---

## Request Lifecycle Walkthrough

1. **Visitor hits** `https://audiencename.pil.bio`.
2. Cloudflare resolves -> NGINX -> Express. Middleware (`bioHostRouting`) extracts `audiencename`, validates handle, fetches published profile.
3. `generateBioPageHTML` composes HTML (theme injection, meta tags, structured data).
4. Response served with 5-minute cache header. Optionally, if `cacheStaticBioPage` previously ran, the HTML also exists on disk for faster future load or CDN seeding.
5. Embedded links direct traffic to streaming services, curated playlists, or Flowerpil features, inheriting theme for consistent UX.

---

## Operational Checklist

- **Creating new curator bios:** Ensure curator exists (`curators` table). Use dashboard `Pil.Bio` tab to claim handle, configure content, save, and publish (queues job). Monitor queue stats via admin API if needed.
- **Reserving handles:** Admins reserve early via `/api/v1/admin/handle-manager/reservations` to hold campaign handles; `assignHandleReservation` automatically updates statuses when curator creates a profile with that handle.
- **Troubleshooting missing pages:**
  - Verify profile is published (`is_published=1`).
  - Check cache invalidation via `GET /api/v1/bio-profiles/queue/stats` (see cache summary).
  - For 404s, confirm handle not in reserved list and that DNS/Cloudflare proxies to Express with correct header.
- **Performance tuning:** Review `bio_performance_metrics` for slow renderings and adjust theme assets/images accordingly. The Site Admin System Health view highlights flagged pages needing optimization.

---

## Extensibility Pointers

- **Adding new featured link types:** Extend `bio_featured_links.link_type` validation, update editor manager to surface new fields, and adapt renderer to display new card designs.
- **Telemetry integration:** Hook Cloudflare worker logs or client beacons to insert entries into `bio_analytics_events` for real-time dashboards.
- **Edge caching:** If elevating to static hosting, leverage `public/bio-static/<handle>.html` outputs, optionally serving them directly via NGINX/Cloudflare Workers when TTL allows.
- **Theming:** Extend `BIO_THEME_PALETTES` for new palettes and ensure `colorPalettes.js` validations (contrast + categories) include them.
- **Multi-tenant support:** `bio_hostRouting` already accommodates wildcard detection; additional domains can reuse the same middleware by extending regex and adjusting environment variables (e.g., `altbio.example.com`).

---

## Key File Map

- Backend routing & services: `server/middleware/bioHostRouting.js`, `server/api/bio-page-handler.js`, `server/api/bio-profiles.js`, `server/api/bio-handles.js`, `server/api/bio-themes.js`, `server/services/bioPageRenderer.js`, `server/services/cacheManager.js`, `server/services/publishingQueue.js`, `server/utils/bioPageRenderer.js`, `server/utils/bioValidation.js`, `server/utils/profileLinksDerived.js`.
- Database migrations & queries: `server/database/migrations/009_bio_pages_system.js`, `server/database/migrations/010_admin_performance_tools.js`, `server/database/db.js` (bio queries around lines 1080–1190).
- Frontend modules: `src/modules/curator/components/CuratorBioPage.jsx`, `src/modules/bio/components/BioEditor.jsx`, `src/modules/bio/components/BioEditorV2.jsx`, `src/modules/bio/components/BioPreview.jsx`, `src/modules/bio/components/BioPreviewModal.jsx`, `src/modules/bio/components/CuratorSelector.jsx`, `src/modules/bio/components/DisplaySettingsPanel.jsx`, `src/modules/bio/components/DisplaySettingsPanelV2.jsx`, `src/modules/bio/components/FeaturedLinksManager.jsx`, `src/modules/bio/components/FeaturedLinksManagerV2.jsx`, `src/modules/bio/components/HandleInput.jsx`, `src/modules/bio/components/ProfileLinksDisplay.jsx`, `src/modules/bio/components/ProfileSelector.jsx`, `src/modules/bio/components/PublicBioPage.jsx`, `src/modules/bio/components/ThemeCustomizer.jsx`, `src/modules/bio/components/ThemeCustomizerV2.jsx`, `src/modules/bio/store/bioEditorStore.js`, `src/modules/bio/services/bioService.js`, `src/modules/admin/components/BioPageAdmin.jsx`, `src/modules/admin/components/SiteAdmin.jsx`.
- Shared constants/utilities: `src/shared/constants/bioThemes.js`, `src/modules/bio/utils/publicUrl.js`.

This overview should equip any contributor (human or LLM) to trace the pil.bio feature end-to-end, extend it safely, and diagnose issues across the stack.
