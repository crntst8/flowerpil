# Meta Pixel + Conversions API

This document describes the current Meta Pixel and Conversions API plumbing in Flowerpil. It covers consent gating, event routing, queue behavior, and the exposed data fields used by the frontend. It does not describe OAuth or ads creation flows yet.

---

## 1. Architecture

### Components
- Consent API: `/api/v1/consent` with cookie + DB persistence.
- Pixel client: `src/shared/utils/metaPixel.js` and `src/shared/components/MetaPixelManager.jsx`.
- CAPI bridge: `/api/v1/meta/events` with queue-based delivery.
- Queue service: `server/services/metaConversionsService.js`.
- Public data exposure: `meta_pixel_id` is included on public playlist and curator payloads.

### Event flow (current)
1. App boot loads site settings and consent state.
2. MetaPixelManager configures pixel state when settings or consent change.
3. PageView events fire on SPA route changes via `siteAnalytics`.
4. Playlist view triggers a ViewContent event in `PlaylistView.jsx`.
5. Track clickouts trigger a PlaylistClickout event in `ExpandableTrack.jsx`:
   - Browser pixel event fires immediately.
   - A matching CAPI event is queued via `/api/v1/meta/events`.

Only clickout events are mirrored to CAPI right now. PageView and ViewContent are pixel-only.

---

## 2. Configuration

### System config keys (admin_system_config)
These are exposed to the frontend via `/api/v1/config/site-settings` and `/api/v1/bootstrap`:
- `meta_pixel_enabled`: `{ "enabled": false }`
- `meta_ads_enabled`: `{ "enabled": false }` (reserved for ads features)
- `meta_require_admin_approval`: `{ "enabled": true }`
- `meta_pixel_mode`: `{ "mode": "curator" }` (`curator`, `global`, `both`)
- `meta_global_pixel_id`: `{ "value": "" }`
- `meta_pixel_advanced_matching`: `{ "enabled": false }`
- `analytics_settings`: `{ data_retention_days, enable_detailed_tracking, privacy_mode, anonymize_after_days }`

The `analytics_settings.privacy_mode` flag disables both pixel and CAPI delivery, even if other flags are enabled.

### Environment variables (ecosystem.config.cjs)
- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI`
- `META_GRAPH_VERSION` (default: `v24.0`)
- `META_CAPI_TEST_EVENT_CODE` (dev only)
- `META_SYSTEM_USER_TOKEN` (optional)
- `BASE_URL` (canonical host used for event_source_url validation)

No `.env` is used; add or update values in `ecosystem.config.cjs`.

### Admin UI (Site Admin)
Location: Admin -> Operations -> Meta

The Meta panel manages the system config keys above and triggers `site-settings-updated`
so the frontend refreshes without a full reload.

Controls available:
- Meta Pixel Enabled
- Pixel Routing Mode
- Global Pixel ID
- Advanced Matching
- Meta Ads Enabled
- Require Admin Approval
- Privacy Mode (analytics_settings.privacy_mode)

---

## 3. Data model

### Curator approval flag
`curators.meta_oauth_approved` (integer, default `0`).

### Meta accounts
`curator_meta_accounts` tracks curator connection state and selected assets:
- `curator_id`, `meta_user_id`, `business_id`, `ad_account_id`, `page_id`, `pixel_id`, `token_id`
- `is_active`, `last_synced_at`, timestamps

### Meta ads
`meta_ads` holds ad IDs and status for future UI reporting:
- `curator_id`, `playlist_id`, `campaign_id`, `adset_id`, `ad_id`, `creative_id`
- `status`, `budget_cents`, `metadata_json`, timestamps

### CAPI queue
`meta_event_queue` stores events awaiting delivery:
- `pixel_id`, `event_name`, `event_time`, `event_id`, `payload_json`
- `status`: `pending`, `retry`, `sent`, `failed`
- `attempt_count`, `next_attempt_at`, `last_error`

### Consent records
`consent_records` stores user or session-based consent:
- `user_id` (nullable), `session_id`, `consent_type`, `status`, `policy_version`, `source`
- `last_seen_at`, timestamps

---

## 4. Consent and privacy gating

### Consent states
Supported values:
- `unknown`
- `granted_ads`
- `denied_ads`

### Cookies
Cookies are non-HttpOnly so the browser can read them:
- `fp_consent_ads`: `unknown|granted_ads|denied_ads`
- `fp_consent_policy`: policy version string
- `fp_consent_ts`: unix ms timestamp
- `fp_consent_session`: opaque session id

### API endpoints
- `GET /api/v1/consent`
  - Returns `{ status, policy_version, timestamp }`
  - Resolves from cookies and, when authenticated, the latest `consent_records`.
  - Refreshes cookies if missing or stale.
- `POST /api/v1/consent`
  - Body: `{ status, policy_version, source }`
  - Validates status and persists to `consent_records`.
  - Sets cookies and logs status changes.

### Gating rules
Tracking is suppressed when:
- `meta_pixel_enabled` is false, or
- `analytics_settings.privacy_mode` is true, or
- consent status is not `granted_ads`.

This applies to both browser pixel initialization and CAPI event delivery.

---

## 5. Pixel client integration

### Key files
- `src/shared/utils/metaPixel.js` – loader and event API.
- `src/shared/components/MetaPixelManager.jsx` – configures pixel based on settings + consent.
- `src/shared/utils/siteAnalytics.js` – triggers PageView on SPA route changes.
- `src/modules/playlists/components/PlaylistView.jsx` – ViewContent tracking.
- `src/modules/playlists/components/ExpandableTrack.jsx` – PlaylistClickout tracking.

### Pixel routing
Targets are resolved by `meta_pixel_mode`:
- `global`: only the global pixel
- `curator`: only the curator pixel
- `both`: both pixels

The curator pixel id comes from API payloads (`meta_pixel_id`) when present.

### Events (current)
- `PageView` – on route changes (pixel-only).
- `ViewContent` – on playlist load (pixel-only).
- `PlaylistClickout` – on DSP clickouts (pixel + CAPI).

### Deduplication
The clickout flow uses a shared base event id:
- Browser: `fbq('trackSingle', ..., { eventID: baseId:pixelId })`
- Server: builds the same `event_id` using `event_id_base` + pixel id.

---

## 6. CAPI bridge and queue

### Endpoint
`POST /api/v1/meta/events` is a public endpoint used by the browser for clickouts.

Request body:
```
{
  "event_name": "PlaylistClickout",
  "event_id_base": "uuid",
  "pixel_ids": ["123"],
  "event_source_url": "https://flowerpil.com/playlists/123",
  "custom_data": { "playlist_id": 123, "track_id": 456, "platform": "spotify" }
}
```

Validation:
- Event name must be in the allowlist (`PageView`, `ViewContent`, `PlaylistClickout`).
- `event_source_url` host must match `BASE_URL`, `FRONTEND_URL`, or the request host.
- Suppressed when privacy mode is enabled or consent is not granted.

### Payload construction
`server/services/metaConversionsService.js` builds payloads with:
- `event_name`, `event_time`, `event_source_url`, `action_source`, `event_id`
- `user_data` (hashed when available)
- `custom_data`, `client_user_agent`, `client_ip_address`
- `fbp` / `fbc` if present on cookies (unhashed)

### User data hashing
If available on the authenticated user:
- `em`, `ph`, `fn`, `ln`, `external_id` are normalized and SHA-256 hashed.

### Queue + retry
- Queue table: `meta_event_queue`
- Batch size: 50 events per pixel
- Retry on network/5xx/429 with exponential backoff
- Max attempts: 6 (then status becomes `failed`)

Queue flush is triggered on event ingest; there is no scheduled worker yet.

---

## 7. Public data exposure

The frontend needs `meta_pixel_id` for routing events:
- Playlists: `GET /api/v1/playlists/:id` and `/api/v1/public/*` include `meta_pixel_id`
- Curators: `GET /api/v1/curators` and `/api/v1/curators/:id|/by-name/:name` include `meta_pixel_id`

The value is pulled from `curator_meta_accounts` where `is_active = 1`.

---

## 8. Logging and diagnostics

- Consent changes log to the server console with prior/current status.
- CAPI suppression logs include consent state and session id.
- Queue failures are tracked in `meta_event_queue.last_error` and `status`.

---

## 9. Manual validation

1. Confirm consent cookie behavior:
   - Call `GET /api/v1/consent` and verify `fp_consent_*` cookies appear.
2. Toggle `meta_pixel_enabled` in system config and confirm pixel loads only when enabled.
3. Set consent to `granted_ads` and confirm `fbevents.js` loads after the change.
4. Load a playlist and confirm ViewContent is sent in Meta Test Events.
5. Click a track DSP button:
   - Pixel event fires immediately.
   - `/api/v1/meta/events` returns `success: true`.
   - A queued event appears in `meta_event_queue` and transitions to `sent`.
6. Update a toggle in Admin -> Operations -> Meta and confirm settings refresh on the frontend.

---

## 10. Known gaps (not implemented yet)

- Meta OAuth connection flows and asset selection endpoints.
- Ads creation endpoints and curator marketing UI.
- Admin monitoring panels for pixel health and queue errors.
- Consent UI (only the API is present).
- Scheduled CAPI queue worker.
- Pixel events for landing pages and curator profile pages.
- Advanced matching payloads on the client (currently empty object).
