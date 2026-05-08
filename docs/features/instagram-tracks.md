# Purpose

Enable curators to link Instagram artist profiles to playlist tracks so `ExpandableTrack.jsx` renders Instagram icons via `custom_sources`.

# Microservice

- `server/microservices/search-aggregator/index.js` exposes `POST /search` and `GET /health`.
- `/search` accepts `{ query, limit, maxResults, providers }`, merges provider results, and returns de-duplicated URLs.
- Provider handlers live in `providerHandlers` for `brave`, `bing`, `serpapi`, and `google_cse`.
- Providers are ordered by `SEARCH_AGGREGATOR_PROVIDER_ORDER` and filtered by available API keys.
- Requests use the `x-search-secret` header when `SEARCH_AGGREGATOR_SECRET` is set.
- `/health` reports enabled providers and is used for readiness checks.

# Backend Services

- `server/services/searchAggregatorService.js` exports `searchAggregator({ query, limit, maxResults, providers })`.
  - Builds the request to the aggregator at `SEARCH_AGGREGATOR_URL`.
  - Sends `x-search-secret` when configured.
  - Throws if the aggregator is not configured or returns an error.
- `server/services/searchAggregatorService.js` exports `getSearchAggregatorHealth()` to check `/health` and provider availability.
- `server/services/instagramLinkService.js` encapsulates Instagram matching logic.
  - `parseCustomSources(value)` normalizes JSON string or array input to a list.
  - `hasInstagramSource(sources)` detects existing Instagram entries.
  - `addInstagramSource(sources, url)` appends `{ name: 'Instagram', url }` if missing.
  - `normalizeInstagramProfileUrl(rawUrl)` validates profile URLs and rejects non-profile paths.
  - `findInstagramProfileForArtist(artist)` runs the search query `site:instagram.com <artist> instagram` and picks the first profile URL.

# API Route

- `server/api/tracks.js` adds `POST /api/v1/tracks/playlist/:playlistId/link-instagram`.
- Uses `authMiddleware` and enforces curator ownership (curators only) or admin access.
- Uses `getInstagramLinkingConfig()` and `getSearchAggregatorHealth()` to guard execution.
- Iterates tracks for the playlist and links profiles per artist.
- Body supports:
  - `dryRun` (boolean): resolves but does not persist.
  - `force` (boolean): overwrites even if Instagram is already present.
  - `limit` (number): limits tracks processed.
  - `concurrency` (number): parallel workers, capped between 1 and 5.
- Returns counts and a list of updated tracks in `data.updated_tracks` with `custom_sources` payloads.
- `GET /api/v1/tracks/instagram-link/status` returns `{ enabled, ready, reason, providers }` for curator/admin UIs.

# Data Writes

- `server/database/db.js` adds `updateTrackCustomSources` for the linker route.
- The linker writes a JSON string to `tracks.custom_sources`.
- UI updates use the returned `updated_tracks` to keep the editor in sync.

# Curator UI

- `src/modules/curator/components/CuratorPlaylistCreate.jsx`
  - `linkInstagramProfiles()` calls `/api/v1/tracks/playlist/:id/link-instagram` via `authenticatedFetch`.
  - Updates local playlist tracks using `updated_tracks` and sets `instagramLinkState` for feedback.
  - Uses `useSiteSettings()` and `/api/v1/tracks/instagram-link/status` to disable the action when unavailable.
  - Renders the action in an `InlineCard` inside the Tracks tab.
- `src/modules/curator/components/CuratorPlaylists.jsx`
  - `linkInstagramProfiles()` mirrors the create flow and patches track `custom_sources` in state.
  - Uses `useSiteSettings()` and `/api/v1/tracks/instagram-link/status` to disable the action when unavailable.
  - Renders the action in a `SectionCard` labeled “Track Details Tools”.

# Rendering Behavior

- `src/modules/playlists/components/ExpandableTrack.jsx` renders `custom_sources` icons in the streaming actions.
- `getPlatformIconPath()` supports `instagram` and maps it to `/assets/playlist-actions/instagram.png`.

# Configuration

- `ecosystem.config.cjs` adds server env vars:
  - `SEARCH_AGGREGATOR_URL`
  - `SEARCH_AGGREGATOR_SECRET`
  - `SEARCH_AGGREGATOR_TIMEOUT_MS`
- `ecosystem.config.cjs` registers `flowerpil-search-aggregator` with provider key placeholders:
  - `BRAVE_SEARCH_API_KEY`
  - `BING_SEARCH_API_KEY`
  - `SERPAPI_API_KEY`
  - `GOOGLE_CSE_API_KEY`
  - `GOOGLE_CSE_ENGINE_ID`
- `instagram_track_linking_enabled` lives in `admin_system_config` and is surfaced in `src/modules/admin/components/SiteDisplaySettings.jsx` and `src/shared/contexts/SiteSettingsContext.jsx`.
- `server/api/config.js` and `server/api/bootstrap.js` include `instagram_track_linking_enabled` in public site settings.
