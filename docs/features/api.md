# API

## Runtime
- `server/index.js` mounts the Express app with `requestContextMiddleware`, `publicSecurityHeaders`, `compression`, `corsConfig`, and `apiCacheHeaders` on `/api/v1` before routing.
- Body parsing uses `express.json`/`urlencoded` with 10mb limits; cookies are parsed for auth and CSRF checks.
- Development-only helpers: `csrfDebugHeaders` exposes token presence, `mockAuthMiddleware` enables header/query-based impersonation, and `/api/v1/auth/mock-login` is only registered outside production.
- Static assets (`/uploads`, `/icons`, `/assets`) set immutable cache headers; sitemap, embed HTML, `qobiz-help`, and `apple-flow` routes are registered ahead of the wildcard renderer.
- Health check lives at `/api/health`; the final catch-all renders bio pages or frontend assets when `NODE_ENV=production`.

## Auth, session, CSRF
- JWTs are issued in `server/api/auth.js` via `generateToken` and stored in `auth_token` cookies configured by `buildAuthCookieOptions`; `authMiddleware` in `server/middleware/auth.js` verifies tokens from either the Authorization header or cookie, loads the user via `getQueries()`, and places the result on `req.user`.
- `optionalAuth` allows anonymous reads while still parsing tokens; `requireRole`/`requireAnyRole` guard privileged endpoints; `checkTokenExpiry` can hint expiring tokens via `X-Token-Expiring`.
- Login, signup, password reset, and curator onboarding endpoints use Joi validation schemas and `authRateLimit`/`passwordChangeLimiter`/`passwordResetLimiter` from `server/middleware/rateLimiting.js`.
- CSRF uses a double-submit cookie pattern in `server/middleware/csrfProtection.js`: `generateCSRFTokenForUser` writes the cookie during login and stores the token in `csrf_tokens`; `validateCSRFToken` compares `X-CSRF-Token` to the cookie (and DB) for all non-GET methods. Admin, uploads, tracks, artwork, preview refresh, playlist-actions, export-requests, and curator endpoints are wired to `validateCSRFToken` in `server/index.js`. Cross-platform worker routes and Spotify OAuth GETs are exempted by design.

## Security, logging, and caching
- Security headers come from `publicSecurityHeaders`/`adminSecurityHeaders` plus `apiSecurityHeaders` in `server/middleware/securityHeaders.js`; CORS is restricted to known frontends with LAN dev fallbacks.
- Rate limiters in `server/middleware/rateLimiting.js` cover login (`loginLimiter`), admin APIs (`adminApiLimiter`), uploads (`uploadLimiter`), tester feedback (`testerFeedbackLimiter`), site access (`siteAccessLimiter`), and general public traffic (`publicApiLimiter`, currently commented out in `server/index.js`).
- Responses include a `request_id` via `requestContextMiddleware` (`server/utils/requestContext.js`); request/response logs are emitted in `server/index.js` and `server/middleware/logging.js`, with audit trails like `logPlaylistChange` in `server/utils/auditLogger.js`.
- `apiCacheHeaders` enforces `Vary: Cookie, Authorization` and `no-store` on sensitive or mutating routes; static assets set `Cache-Control` immutables.

## Data access and patterns
- SQLite lives at `data/flowerpil.db` (configurable in env) and is initialized in `server/database/db.js` with WAL mode and helper migrations. Use `getQueries()` for prepared statements and `getDatabase().transaction()` for multi-step writes.
- HTTP responses generally follow `{ success, data?, error? }`; playlist and track mutations return enriched records, often including flags or warnings.
- File cleanup helpers (`deleteImageFiles`, `deleteMultipleImageFiles`) are used after playlist/track deletions; uploads rely on multer instances in the route modules.

## Endpoint map (mounted in `server/index.js`)

### Auth and account
- `server/api/auth.js` (`/api/v1/auth`): login/logout, signup, curator verification, password reset, `first-login`, `change-password`, `change-email`, CSRF validation, optional `dev/quick-login`.
- `server/api/profile.js` (`/api/v1/profile`): `GET/PUT /me` for profile details using `authMiddleware`.
- `server/api/site-access.js` (`/api/site-access`): site password verification with `siteAccessLimiter`.

### Playlists, tracks, exports
- `server/api/playlists.js` (`/api/v1/playlists`): public `GET /` and `GET /:id`; authenticated `POST/PUT/DELETE` with curator ownership checks; `PATCH /:id/publish`; `POST /:id/queue-export` (uses `queueAutoExportForPlaylist` and `ensureExportRequest`); `PATCH /:id/tracks/order`; `POST /artwork/download` streams ZIP archives. CRUD uses `getQueries()` and playlist audit logging.
- `server/api/tracks.js` (`/api/v1/tracks`): playlist track fetch, search, track metadata updates, and preview deletion; mutating routes require `authMiddleware`.
- `server/api/playlist-actions.js` (`/api/v1/playlist-actions`): scheduler CRUD and run-now hooks for DSP imports/exports; all routes gated by `authMiddleware` and `adminApiLimiter`.
- `server/api/playlist-export.js` (`/api/v1/export`): DSP auth flows (`/auth/:platform/url|callback`), export validation, and `POST /playlists/:id/export/:platform` using `authMiddleware`; supports Spotify, Tidal, and Apple.
- `server/api/export-requests.js` (`/api/v1/export-requests`): create export requests, fetch by playlist, execute, or mark failed with `authMiddleware`.
- `server/api/artwork.js` (`/api/v1/artwork`): artwork search and fetch; bulk upload and download with `authMiddleware`.
- `server/api/preview.js` (`/api/v1/preview`): preview streams, batch refresh, playlist stats; non-stream mutations use `authMiddleware`.

### DSP linking and importers
- `server/api/crossPlatform.js` (`/api/v1/cross-platform`): batch and per-track linking via `crossPlatformLinkingService.startPlaylistLinking`/`linkTrack`; distributed worker mode exposes `/worker-config`, `/lease`, `/heartbeat`, `/release`, `/report` guarded by `requireWorkerAuth` and `LINKING_WORKER_KEYS`; stats, track history, flag management, and job cleanup are included.
- `server/api/linker.js` (`/api/v1/linker`): DSP URL resolver using `linkResolverService.resolveUrl`; requires `requireClubOrAbove` (club/curator/admin roles); exposes `resolve-url`, `supported-providers`, and `health`.
- `server/api/spotify.js` (`/api/v1/spotify`): OAuth URL/callback, playlist discovery, `import-url`, `import/:playlistId`, and `analyze/:playlistId`; `spotifyCSRFMiddleware` in `server/index.js` skips CSRF only for public OAuth GETs.
- `server/api/apple-music.js` (`/api/v1/apple`): developer token, user token exchange, playlist import, catalog lookup; all require `authMiddleware`.
- `server/api/tidal.js` (`/api/v1/tidal`), `server/api/qobuz.js` (`/api/v1/qobuz`), `server/api/soundcloud.js` (`/api/v1/soundcloud`), `server/api/bandcamp.js` (`/api/v1/bandcamp`), `server/api/youtube-music.js` (`/api/v1/youtube-music`): playlist validation/import endpoints with `authMiddleware` where relevant.
- `server/api/url-import.js` (`/api/v1/url-import`): unified URL import jobs and track resolution for all supported platforms.
- `server/api/playlist-actions.js` and `server/api/playlist-export.js` coordinate automated exports/imports alongside `server/services/playlistSchedulerService.js`.

### Curators, bios, and content
- `server/api/curator/index.js` (`/api/v1/curator`): curator dashboard APIs with `authMiddleware`, `requireAnyRole(['curator','admin'])`, and `adminApiLimiter`; profile updates, DSP onboarding, playlist imports, embed settings, flags, referrals.
- `server/api/curators.js` (`/api/v1/curators`): public curator listing plus admin-only CRUD guarded by `authMiddleware`, `validateCSRFToken`, and role checks; manages DSP accounts and section configs.
- `server/api/bio-profiles.js` (`/api/v1/bio-profiles`), `server/api/bio-handles.js` (`/api/v1/bio-handles`), `server/api/bio-themes.js` (`/api/v1/bio-themes`): bio profile CRUD, publishing, versioning, preview, handle validation/suggestions, theme palettes and audits. Mutations require `authMiddleware`; public read endpoints under `/public/:handle` and handle checkers remain open.
- `server/api/releases-v2.js` (`/api/v1/releases`), `server/api/shows.js` (`/api/v1/shows`), `server/api/blog-posts.js` (`/api/v1/blog-posts`): public feeds with authenticated create/update/delete (uploads via multer where applicable). `releases-v2.js` supports curator-scoped CRUD with ownership checks; `shows.js` handles curator show management. Legacy `/api/v1/new-music` was removed; releases is the active feed.
- `server/api/flags.js` (`/api/v1`): public flag submission plus authenticated admin review/resolve endpoints.
- `server/api/lists.js` (`/api/v1/lists`), `server/api/saved.js` (`/api/v1/saved`), `server/api/shares.js` (`/api/v1/shares`): authenticated list management, saved tracks, and share slugs; use `authMiddleware` and ownership checks.
- `server/api/icons.js` (`/api/v1/icons`): icon upload/delete with role checks; uses multer storage for icon assets.

### Public consumption and search
- `server/api/public-playlists.js` (`/api/v1/public`): feed, playlist detail, track listing for public UI/embeds. `server/api/public.js` serves slug-based share pages under `/s/:slug`, `/l/:slug`, `/p/:slug`.
- `server/api/config.js` (`/api/v1/config`): exposes limited config like Google Places key and site settings.
- `server/api/consent.js` (`/api/v1/consent`): consent records and updates.
- `server/api/meta.js` (`/api/v1/meta`): meta/conversion events queue endpoints.
- `server/routes/search.js` (`/api/v1/search`): FTS-backed search with two modes — `preview` (grouped results for dropdown) and `full` (flat ranked results for `/search` page). Supports `?q=<query>&mode=preview|full&limit=N&offset=N`. Core logic lives in `server/services/siteSearchService.js` which handles intent inference (artist/genre/song/time_period/mixed), playlist-first ranking with score boosts, and secondary curator results from `curators_fts`. Editorial suggestions served via `/suggestions` endpoint from `search_editorials` table. See `docs/features/search.md` for full details.
- `server/api/genreCategories.js` (`/api/v1/genre-categories`): genre category listing used in admin and public UIs.
- `server/api/bootstrap.js` (`/api/v1/bootstrap`): initial payload with site settings used by the frontend bootstrap service.
- `server/api/announcements.js` (`/api/v1/announcements`): public announcement payloads with view/dismiss tracking.
- `server/api/qrCodeCtas.js` (`/api/v1/qr-ctas`): QR CTA fetch + tracking endpoints.
- `server/api/linkout.js` (`/api/v1/linkout`) and `server/api/endScroll.js` (`/api/v1/end-scroll`): linkout configuration and playlist end-scroll content (analytics handled in admin counterparts).
- `server/api/embed.js` (`/`): HTML for embed player, registered before wildcard handlers.
- `server/api/sitemap.js` (`/sitemap.xml`): dynamic sitemap generation.

### Media, uploads, and audio
- `server/api/uploads.js` (`/api/v1/uploads`): authenticated image/video upload/delete, served from `storage/uploads` with CORS headers.
- `server/api/preview.js` handles audio preview streaming and refresh; `server/api/audio.js` (enabled when `ENABLE_AUDIO_FEATURES=true`) manages release audio streams/downloads plus metadata extraction via multer `audioUpload`.
- `server/api/icons.js` and `server/api/artwork.js` provide asset libraries and artwork search/bulk upload.

### Feedback, telemetry, and logs
- `server/api/logs.js` (`/api/v1/logs`): public endpoints for frontend error/performance logging.
- `server/api/tester-feedback.js` (`/api/v1/tester-feedback`) and `server/api/internal/tester-feedback-logs.js` (`/api/v1/internal/tester-feedback`): tester submissions (rate limited) and internal log ingestion guarded by API key (`authorize` middleware inside the module).

### Maintenance and streaming
- `server/api/backfill.js` (`/api/v1/backfill`): preview/cross-link backfill status, stats, and triggers.
- `server/api/sse.js` (`/api/v1/sse`): server-sent events stream for export progress updates.

### Admin-only surfaces (all mounted under `/api/v1/admin` with `adminSecurityHeaders`, `validateCSRFToken`, and `requireAdmin` where applied)
- `server/api/admin/siteProtection.js`: feature toggle for maintenance/protection mode.
- `server/api/admin/systemConfig.js`: config key CRUD/history with API logging.
- `server/api/admin/dashboard.js`: stats, forced logout, curator password reset, playlist/bio lookups, Spotify import status updates.
- `server/api/admin/dsp-tokens.js`: DSP token registry, health checks, worker metrics.
- `server/api/admin/scheduled-imports.js`: manage playlist import schedules.
- `server/api/admin/referrals.js`: issue/delete referral codes.
- `server/api/admin/requests.js`: approve/deny referral or access requests with bulk export.
- `server/api/admin/apple-share.js`: Apple Music share URL management and stats.
- `server/api/admin/linkout.js`, `server/api/admin/endScroll.js`: config and analytics for linkout/end-scroll blocks.
- `server/api/admin/errorReports.js`: error report triage, fixes, and resolution marking.
- `server/api/admin/siteAdmin.js`: curator type CRUD, genre categories, custom flags, playlist flags, system health diagnostics, and about-page content management.
- `server/api/admin/transfers.js`: playlist transfer job queue management.
- `server/api/admin/analytics.js`: admin analytics dashboards and reports.
- `server/api/admin/metrics.js`: system metrics summaries for admin dashboards.
- `server/api/admin/worker-health.js`: export worker health and queue status.
- `server/api/admin/state-recovery.js`: recovery actions for stuck exports/linking leases.
- `server/api/admin/demo-accounts.js`: demo curator resets and activity logs.
- `server/api/admin/dead-letter-tracks.js`: linking/preview dead-letter recovery tools.
- `server/api/admin/circuit-breakers.js`: circuit breaker controls for platform services.
- `server/api/admin/qrCodeCtas.js`: QR CTA CRUD and analytics.
- `server/api/admin/feedVisibility.js`: feed pin/hide/reorder controls.
- `server/api/admin/announcements.js`: announcements CRUD, push, and scheduling.
- `server/api/admin/youtube-crosslink.js`: YouTube crosslink staging review + apply.
- `server/api/admin-users.js`: admin users CRUD and export access management.
- `server/api/admin-user-groups.js`: admin user group CRUD and membership management.
- `server/api/top10.js`: admin Top 10 endpoints are exposed via `/api/v1/admin/top10/*` adapter in `server/index.js`.
- `server/api/admin/bioPagesAdmin.js`, `server/api/admin/handleManager.js`, `server/api/admin/securityMonitor.js` exist but are not mounted (commented out in `server/index.js`).

## Building new endpoints
- Mount new routers in `server/index.js` under `/api/v1` and apply the correct middleware: `authMiddleware` + `requireRole` for privileged actions, `validateCSRFToken` for any state change, and the relevant rate limiter from `server/middleware/rateLimiting.js`.
- Validate input with Joi or explicit guards; follow existing response shape `{ success, data, error }` and include ownership checks for curator-scoped data (see `server/api/playlists.js` and `server/api/crossPlatform.js`).
- Use `getQueries()` for DB access and wrap multi-statement writes in `getDatabase().transaction()`; prefer prepared statements already exposed in the queries module.
- When returning personalized data, keep `apiCacheHeaders` defaults; for long-running work, consider asynchronous schedulers (`server/services/playlistSchedulerService.js`, `queueAutoExportForPlaylist`) or worker patterns (`requireWorkerAuth`).
- For uploads or streamed responses, copy the multer and cleanup patterns in `server/api/uploads.js`, `server/api/artwork.js`, and `server/api/playlists.js` (ZIP streaming with archiver).
