## Purpose
Enables invite-only tester curators to submit lightweight feedback from the frontend and correlates those submissions with backend logs for operator review.

## How It Works
`src/modules/tester-feedback/TesterFeedbackWidget.jsx` renders a client-side queue that stores entries in `localStorage` and flushes in batches to `/api/v1/tester-feedback/batch` via `authenticatedFetch`. The API handler in `server/api/tester-feedback.js` validates tester access, persists each entry using `createFeedbackEntries` in `server/services/testerFeedbackService.js`, and enqueues sync work. `server/services/testerFeedbackSyncService.js` runs a background loop (started in `server/index.js`) that POSTs unsynced rows to the logging server. `server/utils/requestContext.js` injects request IDs into Express, and `server/utils/logger.js` emits structured JSON logs and pushes them into `server/utils/logBuffer.js` for correlation. The logging server (`logging-server/index.js`) ingests batches (`logging-server/routes/feedback.js`), stores them in SQLite, and serves an operator UI (`logging-server/public/index.html`) with filtering, selection, markdown export, and log viewing backed by `GET /api/feedback/:actionId/logs`.

## API/Interface
- `POST /api/v1/tester-feedback/batch` (file: `server/api/tester-feedback.js`)  
  Body: `{ entries: [{ action_id: string, url: string, route?: string, message: string, metadata?: object, userAgent?: string }] }`  
  Requires authenticated tester, CSRF token, rate limited by `testerFeedbackLimiter`.
- `POST /api/v1/internal/tester-feedback/logs` (file: `server/api/internal/tester-feedback-logs.js`)  
  Headers: `x-logging-service-key`  
  Body: `{ action_id?: string, request_id?: string, created_at?: string, typing_started_at?: string, pre_window_ms?: number, post_window_ms?: number }`  
  Returns correlated log entries from `logBuffer`.
- Logging server endpoints (`logging-server/routes/feedback.js`):  
  - `POST /ingest/feedback` accepts `{ entries: [...] }` batches from the API sync worker.  
  - `GET /api/feedback` supports `page`, `pageSize`, `email`, `url`, `search`, `from`, `to`.  
  - `GET /api/feedback/:actionId/logs` proxies log retrieval to the API.  
  - `DELETE /api/feedback` clears all rows or rows before a given `before` timestamp via query string.

## Database
- `curators` table adds `tester INTEGER DEFAULT 0` (`server/database/db.js`).  
- New `tester_feedback` table with columns: `user_id`, `curator_id`, `request_id`, `action_id` (unique), `url`, `message`, `metadata`, `synced_remote`, `sync_attempts`, `created_at`, `synced_at`, `last_sync_attempt`. Indexes exist on `request_id`, `(user_id, created_at DESC)`, `(url, created_at DESC)`, and unique `action_id`.  
- Logging server uses `logging-server/db.js` to create `feedback` table storing `action_id`, `request_id`, `user_id`, `curator_id`, `curator_name`, `user_email`, `url`, `message`, `metadata`, `created_at`, `received_at`.

## Integration Points
- Frontend AuthContext (`src/shared/contexts/AuthContext.jsx`) supplies `user.tester` to the widget.  
- Site toggle: `tester_feedback_sitewide` in `admin_system_config` (surfaced in Site Admin → Settings → Site Display) enables both the widget and API capture for tester accounts. When the row is missing, `FEATURE_TESTER_FEEDBACK` and `VITE_FEATURE_TESTER_FEEDBACK` serve as bootstrap defaults.  
- Sync posts to external logging server defined by `LOGGING_SERVER_BASE_URL`, secured by `LOGGING_SERVICE_KEY`.  
- Logging UI queries the API’s internal log endpoint for correlated entries.

## Admin Dashboard Controls
- Curator summaries returned from `server/api/admin/dashboard.js` now include a `tester` boolean so the admin UI can surface tester coverage.  
- The curator editor modal (`src/modules/admin/components/curators/CuratorEditorModal.jsx`) exposes a “Tester Access” toggle via `CuratorForm` that writes the `tester` flag when creating or updating curators.  
- The curator list (`src/modules/admin/components/tabs/CuratorsTab.jsx`) displays aggregate tester counts and row-level pills for quick scanning.  
- The referral manager (`src/modules/admin/components/curators/CuratorReferralManager.jsx`) can issue tester-enabled invite codes and marks tester referrals in the table.  
- Referral issuance API (`server/api/admin/referrals.js`) already accepts an optional `tester` flag; the dashboard now provides first-class UI controls for it.  
- Site Display settings (`src/modules/admin/components/SiteDisplaySettings.jsx`) introduces an “Enable Tester Feedback Widget” toggle that persists to `tester_feedback_sitewide`.

## Configuration
- API env vars:  
  `FEATURE_TESTER_FEEDBACK`, `LOGGING_SERVER_BASE_URL`, `LOGGING_SERVICE_KEY`, optional `TESTER_FEEDBACK_SYNC_INTERVAL`, `TESTER_FEEDBACK_SYNC_BATCH`.  
- Frontend env: `VITE_FEATURE_TESTER_FEEDBACK` (fallback only; admin toggle overrides).  
- Admin config: `tester_feedback_sitewide` in `admin_system_config` stores the site toggle state.
- Logging server env: `LOGGING_DB_PATH`, `PORT`, optional `LOGGING_SERVICE_KEY`, `LOG_SOURCE_BASE_URL`. Refer to `logging-server/README.md` for standalone deployment steps.  
- NGINX proxy config lives in `infra/nginx/fb.fpil.xyz.conf`; TLS is applied separately via certbot.

## Usage Examples
```jsx
// src/App.jsx
import TesterFeedbackWidget from '@modules/tester-feedback/TesterFeedbackWidget';
...
<AuthProvider>
  ...
  <TesterFeedbackWidget />
</AuthProvider>
```

```js
// server/api/tester-feedback.js
router.post('/batch', authMiddleware, validateCSRFToken, testerFeedbackLimiter, async (req, res) => {
  ensureTesterAccess(req.user);
  const inserted = createFeedbackEntries({ user: req.user, entries: value.entries, requestId: req.requestId, curator: curatorRecord });
  if (inserted.length > 0) enqueueFeedbackSync();
  res.status(201).json({ success: true, accepted: inserted.filter(e => !e.duplicate).length, action_ids: inserted.map(e => e.action_id), request_id: req.requestId });
});
```

```js
// server/services/testerFeedbackSyncService.js
export const flushFeedback = async () => {
  const batch = getUnsyncedFeedback(SYNC_BATCH_SIZE);
  if (!batch.length) return;
  await fetch(`${LOGGING_BASE_URL}/ingest/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(SERVICE_KEY ? { 'x-logging-service-key': SERVICE_KEY } : {}) }, body: JSON.stringify({ entries: buildPayload(batch) }) });
  batch.forEach((entry) => markFeedbackSynced(entry.id));
};
```
