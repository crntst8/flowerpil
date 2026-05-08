# Export Request System - Technical Overview

## System Purpose

Export requests allow curators to queue playlist exports to DSP platforms (Spotify, Apple Music, TIDAL) using Flowerpil's centralized accounts instead of curator's personal accounts. Site admins authorize those Flowerpil-managed accounts, and a background worker processes requests automatically with the stored credentials. The admin-triggered manual export remains available as an emergency fallback.

## Related Documentation

- **`dsp-workflow.md`** - Complete end-to-end DSP workflow from import to export, including CuratorPlaylistCreate and CuratorPlaylists component details

This document focuses specifically on the export request system architecture. For the complete user journey and frontend components, see `dsp-workflow.md`.

## End-to-End Workflow (Automated Happy Path)

1. **Admin authorizes Flowerpil DSP tokens**  
   From the admin dashboard (`src/modules/admin/components/AdminDSPConnections.jsx`) an administrator signs in to Spotify, Apple Music, and TIDAL using the Flowerpil-owned credentials. Successful authorization writes rows into `export_oauth_tokens` with `account_type='flowerpil'`, updates health metadata, and exposes status badges in the UI. Admins can optionally run `scripts/dsp/scheduled-health-check.js` (via PM2 or cron) to keep `health_status` current. Curators can also connect their personal DSP accounts; those tokens are now stored with `account_type='curator'` + `owner_curator_id`.
2. **Curator requests export and records account preferences**  
   Curators flag the platforms that should use Flowerpil credentials via `curator_dsp_accounts.uses_flowerpil_account`. When they submit `POST /api/v1/export-requests`, the backend persists both the destinations array (for example `["spotify","apple"]`) **and** an `account_preferences` JSON object describing which account type should be used per destination (`{ "spotify": { "account_type": "curator" } }`). Only one active request per playlist is tracked; additional submissions reuse the latest request and reset progress when requested. Admin-triggered requests set every destination to `account_type='flowerpil'`.
3. **Worker fulfills the request automatically**  
   `server/worker/dspExportWorker.js` polls pending requests, leases one at a time per concurrency slot, and calls `runPlaylistExport()` for each destination. The worker now enforces `account_type='flowerpil'` so it only processes destinations owned by Flowerpil; curator-owned exports continue to run client-side in CuratorPlaylistCreate or CuratorPlaylists. If a non-Flowerpil destination sneaks into the queue, the worker marks it as skipped with a clear failure reason. Results and metadata are persisted and the status transitions to `completed` or `failed` based on platform outcomes. Retries are scheduled automatically for transient errors.

4. **Automatic queue triggers**  
   Track C introduced `server/services/autoExportService.js`, which listens to playlist lifecycle events (publish + import completes) and silently enqueues Flowerpil destinations via `ensureExportRequest`. The service inspects `curator_dsp_accounts` for `uses_flowerpil_account=1`, excludes the import source platform to avoid duplicate exports, and stamps `requested_by='system'`. UI no longer exposes a “Request export” CTA—curators simply watch `/api/v1/export-requests/playlist/:id` for status updates after publishing.

## Database Schema

### Table: export_requests

```sql
CREATE TABLE IF NOT EXISTS export_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,
  destinations TEXT NOT NULL,           -- JSON array: ["spotify","apple","tidal"]
  requested_by TEXT NOT NULL,           -- "curator" | "system"
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|auth_required|in_progress|completed|failed|confirmed
  results TEXT,                         -- JSON object: { spotify: {url, id}, apple: {url, id}, tidal: {url, id} }
  last_error TEXT,
  account_preferences TEXT,             -- JSON map: { spotify: { account_type, owner_curator_id } }
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_export_requests_playlist ON export_requests(playlist_id);
CREATE INDEX IF NOT EXISTS idx_export_requests_status ON export_requests(status);
```

### Table: curator_dsp_accounts

```sql
CREATE TABLE IF NOT EXISTS curator_dsp_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  curator_id INTEGER NOT NULL,
  platform TEXT NOT NULL,               -- spotify|apple|tidal
  email TEXT NOT NULL,
  uses_flowerpil_account INTEGER NOT NULL DEFAULT 0,  -- 0=use own account, 1=use flowerpil account
  metadata TEXT,                        -- JSON: { useOwn, submittedAt }
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(curator_id, platform),
  FOREIGN KEY (curator_id) REFERENCES curators(id) ON DELETE CASCADE
);
```

### Table: playlist_dsp_exports

```sql
CREATE TABLE IF NOT EXISTS playlist_dsp_exports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  remote_playlist_id TEXT,
  remote_playlist_url TEXT,
  account_type TEXT NOT NULL DEFAULT 'flowerpil',
  owner_curator_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  last_synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_snapshot_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(playlist_id, platform)
);
```

Tracks managed export state per playlist+platform. Replaces inference from ambiguous `exported_*_url` fields. Backfilled from legacy fields during migration 102. The runner, `ExportValidationService`, and `autoExportService` all check this table first, falling back to legacy fields for compatibility.

### Table: playlist_export_snapshots

```sql
CREATE TABLE IF NOT EXISTS playlist_export_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_dsp_export_id INTEGER NOT NULL,
  request_id INTEGER,
  snapshot_data TEXT,
  rollback_capability TEXT NOT NULL DEFAULT 'audit_only'
    CHECK(rollback_capability IN ('full', 'audit_only')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (playlist_dsp_export_id) REFERENCES playlist_dsp_exports(id)
);
```

Immutable pre-mutation snapshots. `rollback_capability: 'full'` for Spotify/TIDAL (can replace tracks in place), `'audit_only'` for Apple/YouTube (can only record what was there). Created by the export runner before replace-in-place operations.

### Column additions (migration 102)

- `export_requests.execution_mode TEXT NOT NULL DEFAULT 'worker'` -- `'worker'` or `'inline'` (curator tokens run inline)
- `url_import_jobs.draft_session_id TEXT` -- links import jobs to a specific draft creation session for deduplication

---

## Managed Export and Sync Flow

The export runner (`playlistExportRunner.js`) resolves managed export state from `playlist_dsp_exports` first (legacy `exported_*_url` as fallback), then uses `platformCapabilities.js` to branch:

- **Spotify/TIDAL** (`canReplace: true`, `canReadTracks: true`): creates a pre-mutation snapshot with `rollback_capability: 'full'`, then calls `syncPlaylist()` to update metadata and replace tracks in place. The existing remote playlist is reused.
- **Apple/YouTube** (`canReplace: false`): creates an audit-only snapshot (recording the old remote playlist ID), then calls `exportPlaylist()` to create a new remote playlist. Updates the `playlist_dsp_exports` row to point to the new playlist.
- **`create_new` mode**: always creates a new remote playlist via `exportPlaylist()` regardless of platform capability.

After a successful export, the runner upserts `playlist_dsp_exports` with the remote playlist ID/URL and `status: 'active'`, and writes `last_snapshot_id`. Source URLs (imported `*_url` fields on the playlists table) are preserved separately from export URLs (`exported_*_url`) -- the runner never overwrites source URLs.

Ownership is verified before syncing: `account_type` and `owner_curator_id` must match between the managed export row and the resolved token. Mismatched accounts create a new export instead of mutating the wrong remote playlist.

**UI labels** adapt based on managed export state:
- "Publish & Sync" when `playlist_dsp_exports` rows exist, "Publish & Export" otherwise
- Per-platform: "Updates existing playlist" (Spotify/TIDAL) vs "Creates new and re-links" (Apple/YouTube)

---

## API Endpoints

### POST /api/v1/export-requests

Create export request for playlist.

**Auth:** curator or admin

**Request:**
```json
{
  "playlist_id": 42,
  "destinations": ["spotify", "apple"],
  "requested_by": "curator",          // optional, defaults based on role
  "reset_progress": true,             // optional, default true for curator, false for system
  "account_preferences": {
    "spotify": { "account_type": "curator", "owner_curator_id": 17 },
    "apple":   { "account_type": "flowerpil" }
  }
}
```

**Logic:**
- Validates playlist exists
- Curator can only create requests for their own playlists
- Admin can create for any playlist
- Calls `ensureExportRequest()` which either creates new or updates existing
- Only one active request per playlist (upsert by playlist_id)
- If `reset_progress: true` → resets status to pending, clears results/errors
- `account_preferences` is optional; when omitted the service infers Flowerpil vs curator intent using `curator_dsp_accounts` and the requesting actor. The value is normalized and persisted in the `account_preferences` column for downstream consumers (worker, manual executions, etc.).

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 101,
    "playlist_id": 42,
    "destinations": ["spotify", "apple"],
    "status": "pending",
    "requested_by": "curator",
    "created_at": "2025-10-08T10:00:00Z",
    "updated_at": "2025-10-08T10:00:00Z"
  }
}
```

**Database query:**
```javascript
// server/services/exportRequestService.js
ensureExportRequest({playlistId, destinations, requestedBy, resetProgress})
```

Uses `queries.upsertExportRequest` prepared statement.

---

### GET /api/v1/export-requests/playlist/:playlistId

Get all export requests for a playlist.

**Auth:** curator (own playlists only) or admin

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 101,
      "playlist_id": 42,
      "destinations": ["spotify"],
      "status": "completed",
      "results": {
        "spotify": {
          "url": "https://open.spotify.com/playlist/abc123",
          "id": "abc123"
        }
      },
      "last_error": null,
      "created_at": "2025-10-08T10:00:00Z",
      "updated_at": "2025-10-08T10:15:00Z"
    }
  ]
}
```

---

### GET /api/v1/export-requests/:id

Get single export request by ID.

**Auth:** curator (own playlist only) or admin

---

### POST /api/v1/export-requests/:id/execute

Execute export request (admin only).

**Auth:** admin only

**Process:**
1. Updates status to `in_progress`
2. Fetches playlist from database
3. Fetches curator info
4. Parses destinations array
5. Calls `runPlaylistExport()` from playlistExportService
6. On success: updates status to `completed`, stores results JSON
7. On failure: updates status to `failed`, stores error message

**Location:** `server/api/export-requests.js:113-150`

**Automation note:** In production the PM2-managed worker (`server/worker/dspExportWorker.js`) performs these steps automatically. This endpoint now serves as an emergency lever for admins who need to replay or force an export outside the worker loop.

---

### GET /api/v1/admin/requests

List export requests (admin dashboard).

**Auth:** admin only

**Query params:**
- `status` - filter by status (pending|auth_required|in_progress|completed|failed|confirmed)
- `search` - search playlist title, curator name, playlist ID
- `limit` - max results (1-200, default 100)

**SQL:**
```sql
SELECT er.*, p.title AS playlist_title, p.curator_id, c.name AS curator_name
FROM export_requests er
LEFT JOIN playlists p ON er.playlist_id = p.id
LEFT JOIN curators c ON p.curator_id = c.id
WHERE er.status = ?
AND (LOWER(p.title) LIKE ? OR LOWER(c.name) LIKE ? OR CAST(er.playlist_id AS TEXT) LIKE ?)
ORDER BY er.created_at DESC
LIMIT ?
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 101,
      "playlist_id": 42,
      "playlist_title": "Summer Indie Vibes",
      "curator_id": 5,
      "curator_name": "Cool Label Records",
      "destinations": ["spotify", "apple"],
      "status": "pending",
      "requested_by": "curator",
      "results": {},
      "last_error": null,
      "created_at": "2025-10-08T10:00:00Z",
      "updated_at": "2025-10-08T10:00:00Z"
    }
  ]
}
```

**Location:** `server/api/admin/requests.js:68-115`

---

### POST /api/v1/admin/requests/bulk-export

Bulk process export requests.

**Auth:** admin only

**Request:**
```json
{
  "request_ids": [101, 102, 103]
}
```

**Process:**
1. Validates all request IDs exist
2. Filters to only pending/auth_required status (skips others)
3. Updates valid requests to `in_progress`
4. Calls `dispatchExportRequests(updated, { actor: 'admin' })`
5. Dispatcher runs exports asynchronously

**Response:**
```json
{
  "success": true,
  "data": {
    "updated": [
      { "id": 101, "status": "in_progress", ... },
      { "id": 102, "status": "in_progress", ... }
    ],
    "skipped": [
      { "id": 103, "reason": "invalid_status_completed" }
    ]
  }
}
```

**Location:** `server/api/admin/requests.js:117-176`

---

### POST /api/v1/admin/requests/:id/confirm

Confirm completed export request.

**Auth:** admin only

**Request:**
```json
{
  "dest_results": {
    "spotify_url": "https://open.spotify.com/playlist/abc123",
    "apple_url": "https://music.apple.com/playlist/def456"
  }
}
```

**Process:**
1. Validates request status is `completed`
2. Updates status to `confirmed`
3. Merges provided URLs into playlist record
4. Returns confirmed request

**Location:** `server/api/admin/requests.js:178-200+`

---

### GET /api/v1/curator/onboarding/dsp

Load curator's DSP preferences.

**Auth:** curator or admin

**Response:**
```json
{
  "success": true,
  "data": {
    "spotify": {
      "y": true,
      "email": "curator@label.com",
      "use_own": false                // false = uses flowerpil account
    },
    "apple": {
      "y": true,
      "email": "curator@label.com",
      "use_own": false
    },
    "tidal": {
      "y": true,
      "email": "curator@label.com",
      "use_own": true                 // true = uses own account
    }
  }
}
```

**Backend mapping:**
```javascript
// server/api/curator/index.js:99-115
const mapAccountsResponse = (rows = []) => {
  const response = {};
  for (const platform of ['spotify', 'apple', 'tidal']) {
    response[platform] = { y: false, email: '', use_own: true };
  }

  for (const row of rows) {
    response[row.platform] = {
      y: true,
      email: row.email || '',
      use_own: !(row.uses_flowerpil_account === 1)  // Inverse logic
    };
  }
  return response;
};
```

**CRITICAL:** Backend stores `uses_flowerpil_account` (1=yes, 0=no) but API returns `use_own` (inverse).

---

### POST /api/v1/curator/onboarding/dsp

Save curator's DSP preferences.

**Auth:** curator or admin

**Request:**
```json
{
  "spotify": {
    "y": true,
    "email": "curator@label.com",
    "use_own": false
  },
  "apple": {
    "y": true,
    "email": "curator@label.com",
    "use_own": false
  },
  "tidal": {
    "y": false
  }
}
```

**Process:**
```javascript
// For each platform:
if (!entry.y) {
  // Delete the record
  queries.deleteCuratorDSPAccount.run(curatorId, platform);
} else {
  // Validate email is present
  const usesFlowerpilAccount = entry.use_own ? 0 : 1;  // Inverse
  queries.upsertCuratorDSPAccount.run(
    curatorId,
    platform,
    email,
    usesFlowerpilAccount,
    metadata
  );
}
```

**Location:** `server/api/curator/index.js:340-433`

**IMPORTANT:** Only send data for platforms being updated. Sending all platforms with `y: false` will delete records.

---

## Frontend Components

### CuratorDSPConnections.jsx

**Location:** `src/modules/curator/components/CuratorDSPConnections.jsx`

**Purpose:** Curator configures which DSP accounts to use (own vs flowerpil).

**State:**
```javascript
const [authStatus, setAuthStatus] = useState({});           // OAuth connection status
const [dspPreferences, setDspPreferences] = useState({
  spotify: { y: false, email: '', uses_flowerpil_account: false },
  tidal: { y: false, email: '', uses_flowerpil_account: false },
  apple: { y: false, email: '', uses_flowerpil_account: false }
});
```

**Load preferences:**
```javascript
const loadPreferences = async () => {
  const res = await authenticatedFetch('/api/v1/curator/onboarding/dsp', { method: 'GET' });
  const json = await safeJson(res);
  if (res.ok && json.success && json.data) {
    const normalized = {};
    ['spotify', 'tidal', 'apple'].forEach(platform => {
      const entry = json.data[platform] || {};
      normalized[platform] = {
        y: !!entry.y,
        email: entry.email || '',
        uses_flowerpil_account: entry.use_own === false  // API returns use_own (inverse)
      };
    });
    setDspPreferences(normalized);
  }
};
```

**Toggle flowerpil account:**
```javascript
const handleFlowerpilToggle = async (platform, usesFlowerpil) => {
  // Update local state
  const updatedPrefs = {
    ...dspPreferences,
    [platform]: {
      ...dspPreferences[platform],
      uses_flowerpil_account: usesFlowerpil
    }
  };
  setDspPreferences(updatedPrefs);

  // CRITICAL: Only send the specific platform being toggled
  const pref = updatedPrefs[platform];
  const payload = {
    [platform]: {
      y: pref.y || true,                      // Default to true if not set
      email: pref.email || '',
      use_own: !pref.uses_flowerpil_account   // Inverse for API
    }
  };

  await authenticatedFetch('/api/v1/curator/onboarding/dsp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
};
```

**UI per platform:**
```jsx
<DSPCard>
  <DSPHeader>Spotify</DSPHeader>
  <DSPRow>
    <DSPLabel>Status</DSPLabel>
    <DSPValue>{authStatus?.spotify?.connected ? 'Connected' : 'Connection Required'}</DSPValue>
  </DSPRow>

  <CheckboxRow>
    <input
      type="checkbox"
      checked={dspPreferences.spotify?.uses_flowerpil_account}
      onChange={(e) => handleFlowerpilToggle('spotify', e.target.checked)}
    />
    <label>Export to Flowerpil DSP Account</label>
  </CheckboxRow>

  <DSPActions>
    {dspPreferences.spotify?.uses_flowerpil_account ? (
      <DisabledNote>Using Flowerpil account</DisabledNote>
    ) : (
      <Button onClick={() => startAuth('spotify')}>Connect</Button>
    )}
  </DSPActions>
</DSPCard>
```

**Checkbox logic:**
- Unchecked + OAuth connected = exports use curator's account (direct export)
- Checked = exports create export request for admin to process using flowerpil account
- When checked, OAuth connect button is hidden/disabled

---

### CuratorPlaylistCreate - Publish & Export Tab

**Location:** `src/modules/curator/components/CuratorPlaylistCreate.jsx`

**State:**
```javascript
const [dspPreferences, setDspPreferences] = useState({
  spotify: { uses_flowerpil_account: false },
  tidal: { uses_flowerpil_account: false },
  apple: { uses_flowerpil_account: false }
});

const [exportChoices, setExportChoices] = useState({
  spotify: false,
  apple: false,
  tidal: false
});

const [authStatus, setAuthStatus] = useState({});
```

**Load DSP preferences on step 4:**
```javascript
// Line 1579-1597
useEffect(() => {
  if (!isOpen) return;

  if (step === 4) {
    if (!exportStatusLoadedRef.current) {
      exportStatusLoadedRef.current = true;
      lastAuthLoadRef.current = {};
      loadExportAuthStatus(null, { forceDefaults: true });
      loadDspPreferences();  // NEW: Load DSP preferences
    }
    if (playlist?.id) {
      loadExportValidation();
    }
  } else {
    exportStatusLoadedRef.current = false;
  }
}, [isOpen, step, playlist?.id, loadExportAuthStatus, loadExportValidation, loadDspPreferences]);
```

**Load preferences function:**
```javascript
const loadDspPreferences = useCallback(async () => {
  try {
    const res = await authenticatedFetch('/api/v1/curator/onboarding/dsp', { method: 'GET' });
    const json = await safeJson(res, { context: 'Load DSP preferences' });
    if (res.ok && json.success && json.data) {
      const normalized = {};
      ['spotify', 'tidal', 'apple'].forEach(platform => {
        const entry = json.data[platform] || {};
        normalized[platform] = {
          uses_flowerpil_account: entry.use_own === false  // Inverse
        };
      });
      setDspPreferences(normalized);
    }
  } catch (e) {
    console.error('Failed to load DSP preferences:', e);
  }
}, [authenticatedFetch]);
```

**UI with export request indicators:**
```jsx
<SettingCard>
  <SettingHeader>
    <SettingTitle>Export Destinations</SettingTitle>
  </SettingHeader>
  <SettingDescription>
    Choose where Flowerpil should push this playlist.
    We disable the source DSP by default to avoid duplicates.
  </SettingDescription>
  <SettingContent>
    {['spotify', 'apple', 'tidal'].map(key => {
      const usesFlowerpil = dspPreferences[key]?.uses_flowerpil_account || false;
      return (
        <div key={key}>
          <InlineCheckbox $muted={importSource === key}>
            <input
              type="checkbox"
              checked={!!exportChoices[key]}
              disabled={importSource === key}  // Disable source platform
              onChange={() => {
                setExportChoicesTouched(true);
                setExportChoices(prev => ({ ...prev, [key]: !prev[key] }));
              }}
            />
            {platformLabels[key] || key}
          </InlineCheckbox>

          {/* NEW: Show export request indicator */}
          {usesFlowerpil && (
            <ValidationDetail style={{ marginLeft: '24px', fontSize: '11px', fontStyle: 'italic' }}>
              Export request will be created (using Flowerpil account)
            </ValidationDetail>
          )}
        </div>
      );
    })}
  </SettingContent>
</SettingCard>
```

**Publication workflow logic:**
```javascript
const startPublicationWorkflow = async () => {
  // 1. Save playlist
  const saved = await persistChanges({...});

  // 2. Run cross-platform linking
  const jobId = await triggerLinking(saved.id);
  await pollLinkingJob(jobId, saved.id);

  // 3. Determine which platforms to export
  let targets = Object.entries(exportChoices)
    .filter(([k, v]) => v)
    .map(([k]) => k);

  // 4. For each target platform:
  for (const platform of targets) {
    const usesFlowerpil = dspPreferences[platform]?.uses_flowerpil_account;
    const isConnected = authStatus?.[platform]?.connected;

    if (usesFlowerpil) {
      // Create export request
      await createExportRequest(saved.id, [platform]);
      setProgressState(ps => ({
        ...ps,
        exports: { ...ps.exports, [platform]: 'request_created' }
      }));
    } else if (isConnected) {
      // Direct export using curator's OAuth
      await runDirectExport(saved.id, platform);
      setProgressState(ps => ({
        ...ps,
        exports: { ...ps.exports, [platform]: 'success' }
      }));
    } else {
      // Auth required
      setProgressState(ps => ({
        ...ps,
        exports: { ...ps.exports, [platform]: 'auth_required' }
      }));
    }
  }

  // 5. Publish playlist
  await publishPlaylist(saved.id);
};
```

**Export request creation:**
```javascript
const createExportRequest = async (playlistId, destinations) => {
  const res = await authenticatedFetch('/api/v1/export-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playlist_id: playlistId,
      destinations: destinations,
      requested_by: 'curator'
    })
  });
  const json = await safeJson(res);
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to create export request');
  }
  return json.data;
};
```

---

### RequestsQueue.jsx (Admin Dashboard)

**Location:** `src/modules/admin/components/RequestsQueue.jsx`

**Purpose:** Admin views and processes export requests.

**State:**
```javascript
const [statusFilter, setStatusFilter] = useState('pending');
const [search, setSearch] = useState('');
const [requests, setRequests] = useState([]);
const [selectedIds, setSelectedIds] = useState(new Set());
const [working, setWorking] = useState(false);
```

**Load requests:**
```javascript
const loadRequests = useCallback(async () => {
  setLoading(true);
  try {
    const params = new URLSearchParams();
    if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
    if (search && search.trim()) params.set('search', search.trim());

    const response = await adminGet(`/api/v1/admin/requests?${params.toString()}`);
    setRequests(response.data || []);
    setSelectedIds(new Set());
  } catch (err) {
    setError(err?.message || 'Failed to load requests');
  } finally {
    setLoading(false);
  }
}, [statusFilter, search]);
```

**Bulk export:**
```javascript
const handleBulkExport = async () => {
  if (!selectedIds.size) return;
  setWorking(true);

  try {
    const payload = { request_ids: Array.from(selectedIds) };
    const result = await adminPost('/api/v1/admin/requests/bulk-export', payload);

    // result.data.updated = successfully queued
    // result.data.skipped = skipped with reasons

    setSuccess(`Queued ${result.data.updated.length} exports`);
    await loadRequests();  // Refresh list
  } catch (err) {
    setError(err.message);
  } finally {
    setWorking(false);
  }
};
```

**UI table:**
```jsx
<QueueTable>
  <QueueRow $header>
    <input type="checkbox" onChange={toggleSelectAll} />
    <span>Playlist</span>
    <span>Curator</span>
    <span>Destinations</span>
    <span>Status</span>
    <span>Created</span>
    <span>Actions</span>
  </QueueRow>

  {requests.map(request => (
    <QueueRow key={request.id}>
      <input
        type="checkbox"
        checked={selectedIds.has(request.id)}
        onChange={() => toggleSelect(request.id)}
      />
      <span>{request.playlist_title}</span>
      <span>{request.curator_name}</span>
      <span>{request.destinations.join(', ')}</span>
      <StatusChip $status={request.status}>{request.status}</StatusChip>
      <span>{formatDate(request.created_at)}</span>
      <Actions>
        <Button onClick={() => handleSingleExport(request.id)}>Export</Button>
      </Actions>
    </QueueRow>
  ))}
</QueueTable>

<Actions>
  <Button onClick={handleBulkExport} disabled={!selectedIds.size || working}>
    Bulk Export ({selectedIds.size})
  </Button>
  <Button onClick={handleBulkConfirm} disabled={!completedSelectedCount}>
    Confirm ({completedSelectedCount})
  </Button>
</Actions>
```

**Status filter:**
```javascript
const STATUS_OPTIONS = [
  'all',
  'pending',
  'auth_required',
  'in_progress',
  'completed',
  'failed',
  'confirmed'
];
```

---

### ExportRequestsPanel.jsx

**Location:** `src/modules/admin/components/ExportRequestsPanel.jsx`

**Status:** Active - used in ExportsTab component

**Purpose:** Simpler admin view for export requests, used in tabbed admin interface

**Features:**
- Shows pending and completed requests in separate sections
- Individual "Export Now" buttons
- Uses admin endpoint `/api/v1/admin/requests`
- Has "Mark Failed" modal for failed exports
- Delete capability for unwanted requests
- No bulk operations (simplified interface)

**Usage:**
- Imported by `src/modules/admin/components/tabs/ExportsTab.jsx`
- Alternative to RequestsQueue for tabbed admin views
- Provides focused view without advanced filtering

**Comparison with RequestsQueue:**
- **ExportRequestsPanel:** Simpler, tab-based, pending/completed sections
- **RequestsQueue:** Full-featured, status filters, search, bulk operations
- Both are actively maintained and serve different UI contexts

---

## Backend Services

### dspExportWorker.js (Automated Processor)

**Location:** `server/worker/dspExportWorker.js`

**Role:** Background worker that keeps the export queue moving without manual intervention.

**Key behavior:**
- Polls `export_requests` every `WORKER_POLL_INTERVAL_MS` (default `10000` ms) and respects `WORKER_CONCURRENCY` (default `3`, overridden to `2` in production) so only a few jobs run in parallel.
- Leases each pending request by switching the status to `in_progress` and writing `worker_id`, retry counters, and timestamps into `job_metadata`.
- Calls `runPlaylistExport()` for each requested destination; token selection is driven by the stored `account_preferences` map so curator-owned tokens are used when requested, otherwise Flowerpil tokens are applied automatically (with transparent fallback if a curator token is missing or expired).
- Persists per-platform results, updates `job_metadata.execution_time_ms`, and marks the request `completed` when every destination succeeds.
- Classifies failures, schedules retries with the backoff sequence (60s, 5m, 15m, 30m, 1h), and stops after `WORKER_MAX_RETRIES` (default `3`) or a non-retryable error.
- Handles SIGINT/SIGTERM by waiting up to 60s for in-flight jobs, then releasing leases so another worker can resume.

**Operational tools:** `scripts/dsp/queue-health.js`, `scripts/dsp/queue-tail.js`, and `scripts/dsp/queue-replay.js` surface queue status, recent jobs, and manual replay options for the admin team.

### exportRequestService.js

**Location:** `server/services/exportRequestService.js`

**Functions:**

#### ensureExportRequest(options)

Creates or updates export request. Normalizes per-platform `mode` (default: `replace_existing`, also accepts `create_new`). Derives and stores `execution_mode` (`inline` when any destination has `account_type: 'curator'`, otherwise `worker`). Reuses matching recent completed requests within a cooldown window instead of creating duplicates.

```javascript
export function ensureExportRequest({
  playlistId,
  destinations,          // array: ['spotify', 'apple']
  requestedBy,           // 'curator' | 'system'
  resetProgress = true,
  existingRequestId = null,
  accountPreferences = null,
  curatorId = null
}) {
  const normalizedDestinations = normalizeDestinations(destinations);
  if (!normalizedDestinations.length) throw new Error('At least one destination required');

  const serializedDestinations = JSON.stringify(normalizedDestinations);
  const queries = getQueries();
  const db = getDatabase();

  const run = db.transaction(() => {
    let targetRow = null;

    if (existingRequestId) {
      targetRow = queries.findExportRequestById.get(existingRequestId);
      if (!targetRow) throw new Error('Export request not found');
      if (Number(targetRow.playlist_id) !== Number(playlistId)) {
        throw new Error('Export request does not belong to playlist');
      }
    } else {
      const active = queries.findActiveExportRequestsForPlaylist.all(playlistId) || [];
      targetRow =
        active.find((row) => row.destinations === serializedDestinations) ||
        active[0] ||
        queries.findLatestExportRequestForPlaylist.get(playlistId) ||
        null;
    }

    const mergedPrefs = normalizeAccountPreferences(
      normalizedDestinations,
      accountPreferences ?? parseAccountPreferencesField(targetRow?.account_preferences),
      curatorId
    );
    const serializedPrefs = JSON.stringify(mergedPrefs || {});

    if (targetRow && ACTIVE_STATUSES.has(targetRow.status)) {
      const resultsValue = resetProgress ? null : targetRow.results;
      const errorValue = resetProgress ? null : targetRow.last_error;
      queries.requeueExportRequest.run(
        serializedDestinations,
        requestedBy,
        serializedPrefs,
        resultsValue,
        errorValue,
        targetRow.id
      );
      return queries.findExportRequestById.get(targetRow.id);
    }

    const insertInfo = queries.createExportRequest.run(
      playlistId,
      requestedBy,
      serializedDestinations,
      'pending',
      null,
      null,
      serializedPrefs
    );
    return queries.findExportRequestById.get(insertInfo.lastInsertRowid);
  });

  return mapExportRequestRow(run());
}
```

#### getExportRequestsForPlaylist(playlistId)

Get all export requests for a playlist.

```javascript
export function getExportRequestsForPlaylist(playlistId) {
  const queries = getQueries();
  const rows = queries.getExportRequestsByPlaylistId.all(playlistId);
  return rows.map(mapExportRequestRow);
}
```

#### mapExportRequestRow(row)

Map database row to API response format.

```javascript
export function mapExportRequestRow(row) {
  return {
    id: row.id,
    playlist_id: row.playlist_id,
    destinations: parseDestinations(row.destinations),
    requested_by: row.requested_by,
    status: row.status,
    results: parseJsonField(row.results, {}),
    last_error: row.last_error || null,
    account_preferences: parseAccountPreferences(row.account_preferences),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function parseAccountPreferences(value) {
  if (!value) return {};
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object') return {};
    const normalized = {};
    for (const platform of SUPPORTED_DESTINATIONS) {
      if (!parsed[platform]) continue;
      const pref = parsed[platform];
      const type = pref.account_type === 'curator' ? 'curator' : 'flowerpil';
      normalized[platform] = {
        account_type: type,
        owner_curator_id:
          type === 'curator' && pref.owner_curator_id
            ? Number(pref.owner_curator_id)
            : null
      };
    }
    return normalized;
  } catch (err) {
    console.warn('[EXPORT_REQUEST] Failed to parse account_preferences', err);
    return {};
  }
}
```

---

### exportQueueDispatcher.js

**Location:** `server/services/exportQueueDispatcher.js`

**Purpose:** Legacy async dispatcher previously used before the dedicated worker existed. It now serves as a fallback helper when scripting manual replay flows.

**Function:**

```javascript
export async function dispatchExportRequests(requestIds, options = {}) {
  const { actor = 'system' } = options;
  const queries = getQueries();

  console.log(`[EXPORT_QUEUE] Dispatching ${requestIds.length} requests (actor: ${actor})`);

  for (const requestId of requestIds) {
    try {
      const request = queries.getExportRequestById.get(requestId);
      if (!request) {
        console.warn(`[EXPORT_QUEUE] Request ${requestId} not found`);
        continue;
      }

      if (request.status !== 'in_progress') {
        console.warn(`[EXPORT_QUEUE] Request ${requestId} status is ${request.status}, skipping`);
        continue;
      }

      const playlist = queries.getPlaylistById.get(request.playlist_id);
      if (!playlist) {
        queries.updateExportRequestStatus.run('failed', 'Playlist not found', requestId);
        continue;
      }

      const destinations = JSON.parse(request.destinations || '[]');
      const accountPreferences = parseAccountPreferencesField(request.account_preferences);

      const { runPlaylistExport } = await import('./playlistExportRunner.js');
      for (const destination of destinations) {
        await runPlaylistExport({
          playlistId: playlist.id,
          platform: destination,
          isPublic: true,
          allowDraftExport: actor === 'curator',
          exportRequestId: request.id,
          accountPreference: accountPreferences[destination] || null
        });
      }

      console.log(`[EXPORT_QUEUE] Request ${requestId} completed successfully`);

    } catch (err) {
      console.error(`[EXPORT_QUEUE] Request ${requestId} failed:`, err);
      queries.updateExportRequestStatus.run(
        'failed',
        err.message || 'Unknown error',
        requestId
      );
    }
  }
}
```

---

### playlistExportRunner.js

**Location:** `server/services/playlistExportRunner.js`

**Highlights:**
- Validates playlist eligibility (published status, ready tracks, etc.) before touching DSP APIs.
- Resolves per-destination account preferences from the export request or caller override and normalizes them to `{ account_type, owner_curator_id }`.
- Selects an OAuth token via `ensureAuthToken(platform, { accountType, curatorId })`. When a curator preference is supplied but no usable token exists, the runner automatically falls back to Flowerpil credentials and records that fact in `job_metadata`.
- Executes the DSP-specific exporter (`spotifyService`, `appleMusicApiService`, `tidalService`), persists exported URLs on the playlist row, and updates `export_requests.results`.
- Persists rich metadata (`token_id`, requested vs resolved account type, fallback flag, execution time, tracks exported) to `export_requests.job_metadata` for operator visibility.

**Core control flow (simplified):**

```javascript
export async function runPlaylistExport({
  playlistId,
  platform,
  isPublic = true,
  allowDraftExport = false,
  exportRequestId = null,
  accountPreference = null
}) {
  const exportRequestRow = exportRequestId
    ? queries.findExportRequestById.get(exportRequestId)
    : null;

  const eligibility = await exportValidationService.validatePlaylistEligibility(
    playlistId,
    { allowUnpublishedDrafts: allowDraftExport }
  );
  if (!eligibility.eligible) throw buildEligibilityError(eligibility);

  const playlist = eligibility.playlist;
  const tracks = queries.getTracksByPlaylistId.all(playlistId);

  // Determine desired account type
  let resolvedPreference = accountPreference;
  if (!resolvedPreference && exportRequestRow?.account_preferences) {
    const prefs = parseAccountPreferencesField(exportRequestRow.account_preferences);
    resolvedPreference = prefs?.[platform] || null;
  }

  const requestedAccountType =
    resolvedPreference?.account_type === 'curator' ? 'curator' : 'flowerpil';
  const requestedCuratorId =
    requestedAccountType === 'curator'
      ? Number(resolvedPreference?.owner_curator_id) ||
        Number(exportRequestRow?.curator_id) ||
        Number(playlist?.curator_id) ||
        null
      : null;

  let accountFallbackUsed = false;
  let { token: oauthToken, error } = ensureAuthToken(platform, {
    accountType: requestedAccountType,
    curatorId: requestedCuratorId
  });

  if (error && requestedAccountType === 'curator') {
    accountFallbackUsed = true;
    ({ token: oauthToken, error } = ensureAuthToken(platform, { accountType: 'flowerpil' }));
  }
  if (error) throw error; // surfaces AUTH_REQUIRED with authUrl + details

  const jobMetadata = {
    token_id: oauthToken.id,
    requested_account_type: requestedAccountType,
    requested_owner_curator_id: requestedCuratorId || null,
    resolved_account_type: oauthToken.account_type,
    resolved_owner_curator_id: oauthToken.owner_curator_id || null,
    account_fallback_used: accountFallbackUsed,
    platform,
    initiated_at: new Date().toISOString(),
    playlist_id: playlistId
  };

  const result = await exportWithPlatformService({
    platform,
    oauthToken,
    playlist,
    tracks,
    isPublic
  });

  persistExportedUrl({ platform, playlistId, result });
  updateRequestProgress(exportRequestRow, platform, {
    status: 'success',
    playlistUrl: result?.playlistUrl || null,
    exported_at: new Date().toISOString()
  });
  persistJobMetadata(exportRequestRow?.id, {
    ...jobMetadata,
    completed_at: new Date().toISOString(),
    execution_time_ms: Date.now() - startTime,
    tracks_exported: result?.tracksAdded || 0,
    success: true
  });

  return { result, playlist, playlistData: { ...playlist, isPublic } };
}
```

If any DSP export throws, `handleExportFailureInternal` records the failure, updates `job_metadata` with the error code, and allows the worker to decide whether to retry (based on error type + retry budget) or mark the request failed.

`ensureAuthToken` encapsulates token lookup and expiry checks. It throws `AUTH_REQUIRED` errors with the relevant account context (`{ accountType, curatorId }`) so the UI can route the user to the correct auth flow (admin vs curator).

---

---

## Database Queries

### Prepared Statements (server/database/db.js)

```javascript
// Export requests
getExportRequestById: db.prepare('SELECT * FROM export_requests WHERE id = ?'),

getExportRequestsByPlaylistId: db.prepare(
  'SELECT * FROM export_requests WHERE playlist_id = ? ORDER BY created_at DESC'
),

upsertExportRequest: db.prepare(`
  INSERT INTO export_requests (playlist_id, destinations, requested_by, status, results, last_error, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(playlist_id) DO UPDATE SET
    destinations = excluded.destinations,
    requested_by = excluded.requested_by,
    status = excluded.status,
    results = excluded.results,
    last_error = excluded.last_error,
    updated_at = excluded.updated_at
`),

updateExportRequestStatus: db.prepare(`
  UPDATE export_requests
  SET status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`),

updateExportRequestResults: db.prepare(`
  UPDATE export_requests
  SET results = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`),

// Curator DSP accounts
getCuratorDSPAccounts: db.prepare(
  'SELECT * FROM curator_dsp_accounts WHERE curator_id = ?'
),

upsertCuratorDSPAccount: db.prepare(`
  INSERT INTO curator_dsp_accounts (curator_id, platform, email, uses_flowerpil_account, metadata, updated_at)
  VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(curator_id, platform) DO UPDATE SET
    email = excluded.email,
    uses_flowerpil_account = excluded.uses_flowerpil_account,
    metadata = excluded.metadata,
    updated_at = CURRENT_TIMESTAMP
`),

deleteCuratorDSPAccount: db.prepare(
  'DELETE FROM curator_dsp_accounts WHERE curator_id = ? AND platform = ?'
),
```

---

## Flow Diagrams

### Flow 1: Curator Configures DSP Preferences

```
1. Curator navigates to DSP Connections page
   GET /api/v1/curator/onboarding/dsp

2. Backend queries curator_dsp_accounts table
   SELECT * FROM curator_dsp_accounts WHERE curator_id = ?

3. Backend maps to response format:
   uses_flowerpil_account (db) → use_own (api, inverted)

4. Frontend receives:
   { spotify: { y: true, email: "...", use_own: false } }

5. Frontend normalizes:
   { spotify: { uses_flowerpil_account: true } }

6. Curator checks "Export to Flowerpil DSP Account" for Spotify

7. handleFlowerpilToggle('spotify', true) called

8. Frontend sends ONLY spotify:
   POST /api/v1/curator/onboarding/dsp
   { spotify: { y: true, email: "...", use_own: false } }

9. Backend inverts and stores:
   uses_flowerpil_account = 1

10. Database row:
    curator_id | platform | email | uses_flowerpil_account | metadata
    5          | spotify  | x@y.z | 1                      | {...}
```

### Flow 2: Curator Creates Playlist with Mixed Export Targets

```
CuratorPlaylistCreate - Publish & Export tab:

1. Step 4 becomes active
   useEffect triggers:
   - loadExportAuthStatus()
   - loadDspPreferences()  ← NEW
   - loadExportValidation()

2. loadDspPreferences() calls:
   GET /api/v1/curator/onboarding/dsp

3. State updated:
   dspPreferences = {
     spotify: { uses_flowerpil_account: true },
     apple: { uses_flowerpil_account: true },
     tidal: { uses_flowerpil_account: false }
   }

   authStatus = {
     spotify: { connected: false },
     apple: { connected: false },
     tidal: { connected: true, user: {...} }
   }

4. UI renders:
   ☑ Spotify
      ↳ "Export request will be created (using Flowerpil account)"
   ☑ Apple Music
      ↳ "Export request will be created (using Flowerpil account)"
   ☑ TIDAL
      Status: Connected ✓

5. Curator clicks "Start Publication Workflow"

6. startPublicationWorkflow() runs:

   a. Save playlist
      POST /api/v1/playlists

   b. Trigger cross-platform linking
      POST /api/v1/cross-platform/trigger

   c. Poll linking job
      GET /api/v1/cross-platform/job-status/{jobId}
      (repeat until completed)

   d. Determine export targets:
      targets = ['spotify', 'apple', 'tidal']

   e. For each target:

      SPOTIFY:
      - usesFlowerpil = true
      - isConnected = false
      → Create export request
        POST /api/v1/export-requests
        { playlist_id: 42, destinations: ['spotify'], requested_by: 'curator' }
      → Database: export_requests row created with status='pending'
      → Progress: exports.spotify = 'request_created'

      APPLE:
      - usesFlowerpil = true
      - isConnected = false
      → Create export request
        POST /api/v1/export-requests
        { playlist_id: 42, destinations: ['apple'], requested_by: 'curator' }
      → Database: export_requests row created with status='pending'
      → Progress: exports.apple = 'request_created'

      TIDAL:
      - usesFlowerpil = false
      - isConnected = true
      → Run direct export
        POST /api/v1/export/playlists (curator OAuth)
      → Creates playlist on curator's TIDAL account
      → Progress: exports.tidal = 'success'

   f. Publish playlist
      POST /api/v1/playlists/{id}/publish

7. Database state:

   playlists table:
     id=42, title="Summer Vibes", published=1,
     tidal_url="https://tidal.com/...",
     spotify_url=NULL, apple_url=NULL

   export_requests table:
     id=101, playlist_id=42, destinations='["spotify"]', status='pending'
     id=102, playlist_id=42, destinations='["apple"]', status='pending'

8. Wizard shows Step 5 (Progress):
   ✓ Linking: 23/25 tracks
   ✓ TIDAL Export: Success
   ⏳ Spotify Export: Request created (awaiting admin)
   ⏳ Apple Export: Request created (awaiting admin)
   ✓ Publish: Published
```

#### 2025-10-07 UI Updates

- Step 4 now surfaces an explicit account toggle for each DSP (`Use ours` vs `Use mine`). The choice mirrors `curator_dsp_accounts.use_own` and persists immediately via `/api/v1/curator/onboarding/dsp`.
- Flowerpil-managed exports show helper copy requiring a curator email on file; attempting to opt-in without an email raises inline guidance in both the DSP manager and wizard.
- When Flowerpil exports are queued, the wizard polls `/api/v1/export-requests/playlist/:id` until admin processing completes, updating Step 5/6 statuses in real time and injecting returned share URLs once available.
- Attempting to dismiss the wizard during linking/export/publish now triggers a confirmation modal instead of silently closing. Exiting early leaves the draft accessible from the curator dashboard, while continuing keeps progress uninterrupted.

### Flow 3: Admin Processes Export Requests

```
Admin Dashboard - Export Requests Section:

1. Admin opens /admin, navigates to Export Requests

2. RequestsQueue loads:
   GET /api/v1/admin/requests?status=pending

3. Backend query:
   SELECT er.*, p.title AS playlist_title, c.name AS curator_name
   FROM export_requests er
   LEFT JOIN playlists p ON er.playlist_id = p.id
   LEFT JOIN curators c ON p.curator_id = c.id
   WHERE er.status = 'pending'
   ORDER BY er.created_at DESC
   LIMIT 100

4. Table shows:
   ☐ | Summer Vibes | Cool Label | spotify | pending | 5m ago | [Export]
   ☐ | Summer Vibes | Cool Label | apple   | pending | 5m ago | [Export]

5. Admin selects both rows (checkboxes)

6. Admin clicks "Bulk Export (2)"

7. Frontend calls:
   POST /api/v1/admin/requests/bulk-export
   { request_ids: [101, 102] }

8. Backend (server/api/admin/requests.js:117):

   BEGIN TRANSACTION

   For requestId 101:
     - Check status = 'pending' ✓
     - UPDATE export_requests SET status='in_progress' WHERE id=101
     - Add to updated array

   For requestId 102:
     - Check status = 'pending' ✓
     - UPDATE export_requests SET status='in_progress' WHERE id=102
     - Add to updated array

   COMMIT

   setImmediate(() => {
     dispatchExportRequests([101, 102], { actor: 'admin' })
   })

9. dispatchExportRequests() runs asynchronously:

   For request 101 (Spotify):
     - Get request from DB
     - Get playlist (id=42)
     - Get tracks
    - Parse destinations: ['spotify']
    - Resolve accountPreferences → `{ spotify: { account_type: 'flowerpil' } }`
    - Call runPlaylistExport({
        playlistId: 42,
        platform: 'spotify',
        accountPreference: { account_type: 'flowerpil' },
        exportRequestId: 101
      })
    - runPlaylistExport():
      * Ensure Flowerpil Spotify token (fall back from curator if needed)
       * POST https://api.spotify.com/v1/me/playlists
         (creates playlist on Flowerpil's Spotify)
       * POST https://api.spotify.com/v1/playlists/{id}/tracks
         (adds 23 tracks)
       * Returns { id: 'abc123', url: 'https://open.spotify.com/playlist/abc123' }
     - UPDATE export_requests SET
         status='completed',
         results='{"spotify":{"id":"abc123","url":"...","tracks_added":23}}',
         updated_at=NOW()
       WHERE id=101
     - UPDATE playlists SET spotify_url='https://...' WHERE id=42

   For request 102 (Apple):
     - Get request from DB
     - Get playlist (id=42)
     - Get tracks
    - Parse destinations: ['apple']
    - Resolve accountPreferences → `{ apple: { account_type: 'flowerpil' } }`
    - Call runPlaylistExport({
        playlistId: 42,
        platform: 'apple',
        accountPreference: { account_type: 'flowerpil' },
        exportRequestId: 102
      })
    - runPlaylistExport():
      * Ensure Flowerpil Apple Music token (fall back from curator if needed)
       * POST https://api.music.apple.com/v1/me/library/playlists
         (creates playlist on Flowerpil's Apple Music)
       * POST playlist tracks endpoint
         (adds 22 tracks)
       * Returns { id: 'def456', url: 'https://music.apple.com/...', tracks_added: 22 }
     - UPDATE export_requests SET
         status='completed',
         results='{"apple":{"id":"def456","url":"...","tracks_added":22}}',
         updated_at=NOW()
       WHERE id=102
     - UPDATE playlists SET apple_url='https://...' WHERE id=42

10. Admin refreshes dashboard:
    GET /api/v1/admin/requests?status=completed

11. Table now shows:
    ☐ | Summer Vibes | Cool Label | spotify | completed | 5m ago | [Confirm]
    ☐ | Summer Vibes | Cool Label | apple   | completed | 5m ago | [Confirm]

12. Admin verifies playlists exist on platforms, selects both, clicks "Confirm (2)"

13. Frontend calls:
    POST /api/v1/admin/requests/101/confirm
    POST /api/v1/admin/requests/102/confirm

14. Backend updates:
    UPDATE export_requests SET status='confirmed' WHERE id IN (101, 102)

15. Final database state:

    playlists table (id=42):
      spotify_url = "https://open.spotify.com/playlist/abc123"
      apple_url = "https://music.apple.com/playlist/def456"
      tidal_url = "https://tidal.com/browse/playlist/xyz789"
      published = 1

    export_requests table:
      id=101, status='confirmed', results='{"spotify":{...}}'
      id=102, status='confirmed', results='{"apple":{...}}'
```

---

## Edge Cases

### Case 1: Curator Changes DSP Preference After Creating Request

**Scenario:**
1. Curator sets Spotify to use flowerpil account
2. Creates playlist, export request created (id=101, status='pending')
3. Before admin processes, curator unchecks "Use Flowerpil" and connects their own Spotify
4. Admin clicks "Bulk Export"

**What happens:**
- Export request 101 still has `playlist_id=42, destinations=['spotify'], status='pending'`
- Dispatcher runs export using flowerpil account (as per request)
- Curator's preference change doesn't affect existing requests
- New playlists from same curator will use curator's account (no request created)

**Solution:**
- Export requests are immutable once created
- Curator must delete/fail old request if they change preference
- OR: Add "Cancel Request" button in wizard/curator dashboard

---

### Case 2: Multiple Export Requests for Same Playlist

**Current behavior:**
```javascript
// ensureExportRequest uses upsert on playlist_id
// Only one request per playlist exists at a time

const existing = db.prepare(
  'SELECT * FROM export_requests WHERE playlist_id = ? LIMIT 1'
).get(playlistId);

if (existing) {
  if (resetProgress) {
    // Replace existing request
    queries.upsertExportRequest.run(...);
  } else {
    // Update destinations but keep progress
    db.prepare('UPDATE export_requests SET destinations = ? WHERE playlist_id = ?')
      .run(destJson, playlistId);
  }
}
```

**Scenario:**
1. Curator creates request for Spotify (id=101)
2. Admin starts processing (status='in_progress')
3. Curator edits wizard, adds Apple, clicks "Start Workflow" again
4. POST /api/v1/export-requests with destinations=['spotify','apple']

**What happens:**
- If `resetProgress=true` (default for curator):
  * Request 101 updated: status='pending', destinations=['spotify','apple'], results=null
  * Admin's in-progress export is orphaned (database status reset)
  * PROBLEM: Could lose partial progress

- If `resetProgress=false`:
  * Request 101 updated: destinations=['spotify','apple'], status unchanged
  * Admin's export continues but with updated destinations
  * PROBLEM: Might not export new destination

**Solution:**
- Lock requests that are in_progress/completed from curator updates
- OR: Create new request with incremented version/attempt number
- OR: Store destinations as separate rows (export_request_destinations table)

---

### Case 3: Curator Deletes Platform Preference While Request Pending

**Scenario:**
1. Curator has Spotify set to flowerpil account
2. Creates playlist, export request created
3. Goes to DSP Connections, unchecks Spotify checkbox (y: false)
4. Backend deletes curator_dsp_accounts row

**Database state:**
```sql
-- curator_dsp_accounts: no row for curator_id=5, platform='spotify'
-- export_requests: id=101, status='pending', destinations='["spotify"]'
```

**What happens when admin processes:**
- Dispatcher gets request, calls runPlaylistExport()
- runPlaylistExport() uses flowerpil account (from request context)
- Export succeeds
- Playlist gets spotify_url

**Impact:** None. Export requests are independent of current preferences.

---

### Case 4: Admin Processes Request But Platform Export Fails

**Scenario:**
1. Admin clicks "Bulk Export"
2. Spotify API returns 500 error

**Code path:**
```javascript
// exportQueueDispatcher.js
try {
  const results = await runPlaylistExport({...});
  queries.updateExportRequestStatus.run('completed', null, requestId);
  queries.updateExportRequestResults.run(JSON.stringify(results), requestId);
} catch (err) {
  queries.updateExportRequestStatus.run('failed', err.message, requestId);
}
```

**Database state:**
```sql
UPDATE export_requests
SET status='failed', last_error='Spotify API error: 500 Internal Server Error'
WHERE id=101
```

**Admin view:**
- Table shows status='failed'
- Can see error in last_error column
- Can retry by selecting and clicking "Bulk Export" again

**Retry behavior:**
```javascript
// server/api/admin/requests.js:128
const allowedStatuses = new Set(['pending', 'auth_required']);

if (!allowedStatuses.has(row.status)) {
  skipped.push({ id, reason: `invalid_status_${row.status}` });
  continue;
}
```

**PROBLEM:** Can't retry failed requests from UI.

**Solution:**
- Add 'failed' to allowedStatuses
- OR: Add "Reset to Pending" button
- OR: Add "Retry Failed" bulk action

---

### Case 5: Playlist Has No Tracks Linked for Platform

**Scenario:**
1. Playlist has 10 tracks
2. Cross-platform linking finds 0 tracks on Spotify (all missing)
3. Curator still creates export request for Spotify
4. Admin processes request

**What happens:**
```javascript
// playlistExportService.js
const trackUris = tracks
  .filter(t => t.spotify_id)
  .map(t => `spotify:track:${t.spotify_id}`);
// trackUris = []

if (trackUris.length > 0) {
  // Skipped
}

return {
  id: playlistId,
  url: `https://open.spotify.com/playlist/${playlistId}`,
  tracks_added: 0
};
```

**Result:**
- Empty playlist created on Spotify
- Request marked 'completed'
- results = `{"spotify":{"id":"...","url":"...","tracks_added":0}}`

**Admin sees:** Completed request with 0 tracks added.

**Improvement:** Add validation in wizard (loadExportValidation):
```javascript
const data = exportValidation?.spotify || {};
if (data.readyTracks === 0) {
  // Show warning: "0 tracks available on Spotify"
}
```

---

### Case 6: Curator Has No Email for Platform Using Flowerpil Account

**Scenario:**
1. Curator checks "Use Flowerpil Account" for Spotify
2. Leaves email field empty
3. Clicks save

**Backend validation:**
```javascript
// server/api/curator/index.js:398-404
const email = typeof entry.email === 'string' ? entry.email.trim().toLowerCase() : '';
if (!email) {
  return res.status(400).json({
    error: 'Validation failed',
    message: `Email is required for ${platform} when indicating availability`
  });
}
```

**Result:** 400 error, save fails.

**Frontend should:**
- Pre-validate before submit
- Show error message: "Email required for Spotify"
- Disable save button until valid

---

### Case 7: Two Admins Process Same Request Simultaneously

**Scenario:**
1. Admin A loads dashboard, sees request 101 (status='pending')
2. Admin B loads dashboard, sees request 101 (status='pending')
3. Admin A clicks "Export" on request 101
4. Admin B clicks "Export" on request 101 (1 second later)

**What happens:**

Admin A:
```sql
-- Time T+0
UPDATE export_requests SET status='in_progress' WHERE id=101;
-- Dispatcher starts export
```

Admin B:
```sql
-- Time T+1
UPDATE export_requests SET status='in_progress' WHERE id=101;
-- Dispatcher starts export
```

**Result:**
- Two parallel exports running for same playlist
- Both hit Spotify API
- Potentially two playlists created
- Last one to finish writes to database (race condition)

**Current prevention:**
```javascript
// exportQueueDispatcher.js:15
if (request.status !== 'in_progress') {
  console.warn(`Request ${requestId} status is ${request.status}, skipping`);
  continue;
}
```

**But:**
- Both updates to 'in_progress' succeed
- Both dispatchers see status='in_progress'
- Both run export

**Solution:**
- Add distributed lock (Redis)
- OR: Add `processing_by` column with admin user ID
- OR: Add `processing_started_at` timestamp, skip if < 5 minutes old
- OR: Use database transaction with SELECT FOR UPDATE:

```javascript
db.exec('BEGIN EXCLUSIVE');
const request = db.prepare('SELECT * FROM export_requests WHERE id = ? FOR UPDATE').get(id);
if (request.status !== 'pending') {
  db.exec('ROLLBACK');
  return { skipped: true, reason: 'already_processing' };
}
db.prepare('UPDATE export_requests SET status=? WHERE id=?').run('in_progress', id);
db.exec('COMMIT');
```

---

## Status Lifecycle

```
pending
  ↓ (admin clicks "Bulk Export")
in_progress
  ↓ (dispatcher runs)
  ├→ completed (success)
  │   ↓ (admin clicks "Confirm")
  │   confirmed (terminal state)
  │
  └→ failed (error)
      ↓ (currently no retry path)
      (manual reset needed)
```

**State transitions:**

| From | To | Triggered By | Conditions |
|------|-----|--------------|------------|
| - | pending | Curator creates request | - |
| pending | in_progress | Admin bulk export | Admin action |
| pending | failed | Validation fails | Missing playlist, etc |
| in_progress | completed | Dispatcher success | All platforms exported |
| in_progress | failed | Dispatcher error | API error, auth error |
| completed | confirmed | Admin confirms | Manual verification |
| failed | pending | (not implemented) | Admin reset |

**Missing transitions:**
- failed → pending (retry)
- completed → failed (rollback if curator reports issue)
- in_progress → pending (timeout/stuck job recovery)
- confirmed → completed (undo confirmation)

---

## Configuration

### Environment Variables

**Required:**
- None specific to export requests

**Used by underlying services:**
- `SPOTIFY_CLIENT_ID` - Flowerpil Spotify app
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`
- `APPLE_MUSIC_TEAM_ID` - Flowerpil Apple Music
- `APPLE_MUSIC_KEY_ID`
- `APPLE_MUSIC_PRIVATE_KEY`
- `TIDAL_CLIENT_ID` - Flowerpil TIDAL app
- `TIDAL_CLIENT_SECRET`

### Token Storage

OAuth tokens for both export and import operations are stored in the `export_oauth_tokens` table following the OAuth Tokens v2 schema (Migration 042). The previous `oauth_tokens` and `dsp_auth_tokens` tables are deprecated.

**Current architecture:**

```sql
-- Active table: export_oauth_tokens
CREATE TABLE export_oauth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL CHECK (platform IN ('spotify', 'tidal', 'apple')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at DATETIME,
  refresh_expires_at DATETIME,

  account_type TEXT NOT NULL CHECK (account_type IN ('flowerpil', 'curator')),
  account_label TEXT NOT NULL,
  owner_curator_id INTEGER,

  health_status TEXT DEFAULT 'unknown',
  last_validated_at DATETIME,
  is_active INTEGER DEFAULT 1,

  user_info TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (owner_curator_id) REFERENCES curators(id) ON DELETE CASCADE,
  UNIQUE(platform, account_type, account_label)
);

-- Example records:
-- Flowerpil Spotify (primary):
-- account_type='flowerpil', account_label='flowerpil-primary', owner_curator_id=NULL

-- Curator Spotify:
-- account_type='curator', account_label='curator-164-primary', owner_curator_id=164
```

**Token lookup patterns:**

Export operations query by account preferences stored in `export_requests.account_preferences`:
```javascript
const token = getExportToken(platform, {
  accountType: prefs.account_type,      // 'flowerpil' | 'curator'
  curatorId: prefs.owner_curator_id,    // NULL for flowerpil
  preferActive: true
});
```

Import operations resolve curator context from user session or schedule metadata:
```javascript
const curatorId = schedule.owner_curator_id;
const token = await getSpotifyAccessToken(db, curatorId);
```

Both patterns prioritize `is_active=1` tokens and check expiration before returning credentials.

---

## Testing Scenarios

### Test 1: Complete Flow - Flowerpil Account

**Setup:**
1. Create curator account (id=10)
2. No OAuth connections

**Steps:**
1. Navigate to /curator/dsp-connections
2. Check ☑ "Export to Flowerpil DSP Account" for Spotify
3. Verify database:
   ```sql
   SELECT * FROM curator_dsp_accounts WHERE curator_id=10 AND platform='spotify';
   -- uses_flowerpil_account = 1
   ```
4. Open CuratorPlaylistCreate or CuratorPlaylists
5. Import playlist from Spotify (OAuth required for import only)
6. Complete steps 1-3
7. Step 4: Verify checkbox shows indicator:
   ```
   ☑ Spotify
      ↳ "Export request will be created (using Flowerpil account)"
   ```
8. Click "Start Publication Workflow"
9. Verify database:
   ```sql
   SELECT * FROM export_requests WHERE playlist_id = ?;
   -- status='pending', destinations='["spotify"]'
   ```
10. Login as admin
11. Navigate to /admin
12. Verify export request appears in table
13. Select request, click "Bulk Export"
14. Wait for completion (check logs)
15. Verify database:
    ```sql
    SELECT status, results FROM export_requests WHERE id = ?;
    -- status='completed', results='{"spotify":{"url":"..."}}'

    SELECT spotify_url FROM playlists WHERE id = ?;
    -- spotify_url = 'https://open.spotify.com/playlist/...'
    ```
16. Click "Confirm"
17. Verify database:
    ```sql
    SELECT status FROM export_requests WHERE id = ?;
    -- status='confirmed'
    ```

**Expected:**
- Playlist created on Flowerpil's Spotify account
- All transitions successful
- No errors in console

---

### Test 2: Mixed Export (Flowerpil + Own Account)

**Setup:**
1. Curator has TIDAL OAuth connected
2. Curator sets Spotify to flowerpil account
3. Curator does NOT check Apple (will use own account, but no OAuth)

**Steps:**
1. Create playlist, select Spotify + Apple + TIDAL for export
2. Step 4 shows:
   ```
   ☑ Spotify → "Export request will be created"
   ☑ Apple Music → "Status: Connection Required" (no indicator)
   ☑ TIDAL → "Status: Connected"
   ```
3. Click "Start Workflow"
4. Verify database:
   ```sql
   SELECT * FROM export_requests WHERE playlist_id = ?;
   -- Spotify request created, status='pending'
   ```
5. Verify TIDAL export ran immediately (playlist.tidal_url set)
6. Verify Apple export shows auth_required status (no request created)

**Expected:**
- Spotify: Export request created
- Apple: No request created, auth required message
- TIDAL: Direct export successful

---

### Test 3: Preference Persistence

**Steps:**
1. Check ☑ Spotify flowerpil account
2. Refresh page
3. Verify checkbox still checked
4. Database query:
   ```sql
   SELECT uses_flowerpil_account FROM curator_dsp_accounts
   WHERE curator_id=? AND platform='spotify';
   -- Should be 1
   ```

**Expected:**
- Checkbox state persists across page loads
- Database value correct

---

### Test 4: Request Update (Same Playlist)

**Steps:**
1. Create playlist, export to Spotify only
2. Export request created (id=101)
3. Edit playlist in CuratorPlaylists, change export to Spotify + Apple
4. Click "Start Workflow" again
5. Verify database:
   ```sql
   SELECT id, destinations FROM export_requests WHERE playlist_id = ?;
   -- Same id=101, destinations='["spotify","apple"]'
   ```

**Expected:**
- Same request ID (upsert)
- Destinations updated
- Status reset to pending

---

### Test 5: Failed Export Recovery

**Steps:**
1. Simulate Spotify API failure (disconnect network during export)
2. Admin processes request
3. Verify database:
   ```sql
   SELECT status, last_error FROM export_requests WHERE id = ?;
   -- status='failed', last_error='Network error...'
   ```
4. Fix network
5. Attempt to re-export from UI

**Expected:**
- Request marked failed
- Error message visible
- Retry mechanism available (if implemented)

---

### Test 6: Concurrent Admin Processing

**Steps:**
1. Open two admin browser windows
2. Both load Export Requests page
3. Both see same pending request
4. Admin A clicks "Export"
5. Admin B clicks "Export" 2 seconds later
6. Monitor logs for duplicate processing
7. Verify database state after both complete

**Expected:**
- Only one export runs
- OR: Second export skipped with log message
- No duplicate playlists created

---

## Logging

**Key log points:**

```javascript
// Request creation
console.log('[EXPORT_REQUESTS_CREATE] Request created:', {
  requestId,
  playlistId,
  destinations,
  requestedBy
});

// Bulk export dispatch
console.log('[EXPORT_QUEUE] Dispatching', requestIds.length, 'requests (actor:', actor, ')');

// Individual request processing
console.log('[EXPORT_QUEUE] Processing request', requestId, {
  playlistId,
  destinations,
  status
});

// Export service start
console.log('[EXPORT] Starting export for playlist', playlistId, {
  platform,
  accountPreference,
  exportRequestId
});

// Platform-specific exports
console.log('[EXPORT_SPOTIFY] Creating playlist:', {
  title,
  tracks: trackUris.length,
  account: jobMetadata.resolved_account_type,
  fallback: jobMetadata.account_fallback_used
});

// Completion
console.log('[EXPORT_QUEUE] Request', requestId, 'completed successfully', {
  results
});

// Errors
console.error('[EXPORT_QUEUE] Request', requestId, 'failed:', err.message);
console.error('[EXPORT_SPOTIFY] API error:', {
  status: res.status,
  error: await res.text()
});
```

---

## Security Considerations

**Authorization:**
- Curators can only create/view requests for their own playlists
- Admins can create/view/process requests for any playlist
- Export execution is admin-only

**Token security:**
- Flowerpil tokens stored in database (encrypted at rest recommended)
- Curator tokens stored separately by user_id
- No tokens exposed in API responses

**Input validation:**
- Destinations array validated against whitelist: ['spotify', 'apple', 'tidal']
- Playlist ID must exist and curator must own it (for curators)
- Email required when setting flowerpil account preference

**SQL injection:**
- All queries use prepared statements
- No raw string concatenation in SQL

**Rate limiting:**
- Admin endpoints use `adminApiLimiter` middleware
- Export requests throttled by manual admin processing (no auto-processing)

---

## Performance Considerations

**Database indexes:**
```sql
CREATE INDEX idx_export_requests_playlist ON export_requests(playlist_id);
CREATE INDEX idx_export_requests_status ON export_requests(status);
CREATE INDEX idx_curator_dsp_accounts_curator ON curator_dsp_accounts(curator_id, platform);
```

**Query optimization:**
- Admin list query uses LEFT JOIN (efficient for small datasets)
- Limit 100 results by default
- No N+1 queries (playlists/curators joined in single query)

**Async processing:**
- Bulk export uses `setImmediate()` to avoid blocking HTTP response
- Dispatcher runs in background
- Frontend polls for status updates (not implemented, admin must refresh)

**Caching:**
- No caching currently implemented
- Opportunities:
  * Cache DSP preferences (5min TTL)
  * Cache admin request list (30sec TTL, invalidate on updates)

**Bottlenecks:**
- Sequential processing in dispatcher (processes requests one-by-one)
- Spotify API rate limits (30 requests/second)
- No parallel export for multiple platforms in single request

**Improvements:**
- Parallel dispatch using Promise.all()
- Queue system (Bull/BullMQ) for reliable background processing
- WebSocket for real-time admin dashboard updates
- Batch API calls where supported (Spotify allows 100 tracks per add)

---

## Known Issues

1. **Concurrent admin processing not prevented**
   - Status: Race condition possible when multiple admins process same request
   - Risk: Low (requires exact simultaneous clicks)
   - Mitigation: dspExportWorker uses request leasing with worker_id
   - Fix: Add distributed lock or processing_by column for manual executions

2. **No progress tracking during export**
   - Status: Binary (pending/in_progress/completed)
   - Improvement: Add progress field, emit real-time events
   - Worker logs execution_time_ms in job_metadata for post-analysis

3. **Export request upsert can reset in-progress requests**
   - Status: Can lose partial progress if curator re-submits during processing
   - Fix: Lock requests in non-pending states or use versioned attempts

4. **No curator-facing request status UI**
   - Status: Curators can't view request progress after creation
   - Improvement: Add "Export Requests" tab to curator dashboard with polling
   - Current workaround: Curator checks final playlist URLs after publish

5. **Empty playlists created if no tracks linked**
   - Status: Validation exists but doesn't prevent creation
   - Result: DSP playlist created with 0 tracks
   - Improvement: Block export in wizard if readyTracks = 0 for platform

6. **Apple Music library playlist sharing requires manual step**
   - Status: API limitation - library playlists (p.xxx) cannot be shared programmatically
   - Handling: Slack notification sent to admin for manual share URL retrieval
   - Impact: Adds latency to Apple Music export completion

---

## Future Enhancements

**Automatic retry:**
```javascript
// Add to export_requests table
retry_count INTEGER DEFAULT 0,
max_retries INTEGER DEFAULT 3,
next_retry_at TEXT

// In dispatcher
if (status === 'failed' && row.retry_count < row.max_retries) {
  const nextRetry = Date.now() + (Math.pow(2, row.retry_count) * 60000); // Exponential backoff
  queries.scheduleRetry.run(nextRetry, row.id);
}
```

**Scheduled exports:**
```javascript
// Run cron job every 5 minutes
async function processScheduledExports() {
  const due = db.prepare(`
    SELECT * FROM export_requests
    WHERE status='failed'
    AND retry_count < max_retries
    AND next_retry_at <= ?
  `).all(new Date().toISOString());

  for (const request of due) {
    await dispatchExportRequests([request.id], { actor: 'system' });
  }
}
```

**Webhook notifications:**
```javascript
// When request completes/fails
if (curator.webhook_url) {
  await fetch(curator.webhook_url, {
    method: 'POST',
    body: JSON.stringify({
      event: 'export_request.completed',
      data: { requestId, playlistId, status, results }
    })
  });
}
```

**Progress events:**
```javascript
// In playlistExportService.js
for (const platform of destinations) {
  emitProgress({ requestId, platform, status: 'starting' });

  const result = await exportToPlatform(platform, playlist, tracks);

  emitProgress({ requestId, platform, status: 'completed', result });
}

// Admin dashboard listens via WebSocket
socket.on('export_progress', (data) => {
  updateRequestInUI(data.requestId, data);
});
```

**Bulk operations:**
- Bulk confirm (implemented)
- Bulk delete
- Bulk retry
- Filter by curator
- Filter by date range

**Audit log:**
```sql
CREATE TABLE export_request_audit (
  id INTEGER PRIMARY KEY,
  request_id INTEGER,
  action TEXT,           -- 'created', 'updated', 'exported', 'confirmed', 'failed'
  actor_user_id INTEGER,
  actor_role TEXT,       -- 'curator', 'admin', 'system'
  metadata TEXT,         -- JSON
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Export templates:**
- Save common destination combinations
- "Export to all Flowerpil accounts"
- "Export to curator accounts only"

---

## File Locations

**Frontend:**
- `/src/modules/curator/components/CuratorDSPConnections.jsx` - DSP preference UI
- `/src/modules/curator/components/CuratorPlaylistCreate.jsx` - Playlist creation with export configuration (see `dsp-workflow.md`)
- `/src/modules/curator/components/CuratorPlaylists.jsx` - Playlist management with export options (see `dsp-workflow.md`)
- `/src/modules/admin/components/RequestsQueue.jsx` - Full-featured admin queue (used in SiteAdmin)
- `/src/modules/admin/components/ExportRequestsPanel.jsx` - Simplified admin queue (used in ExportsTab)
- `/src/modules/admin/components/tabs/ExportsTab.jsx` - Tabbed admin view for exports
- `/src/modules/admin/components/SiteAdmin.jsx` - Main admin dashboard container

**Backend:**
- `/server/api/export-requests.js` - Curator-facing endpoints
- `/server/api/admin/requests.js` - Admin-facing endpoints
- `/server/api/curator/index.js` - DSP preference endpoints
- `/server/services/exportRequestService.js` - Request creation/retrieval
- `/server/services/exportQueueDispatcher.js` - Legacy async dispatcher (fallback)
- `/server/services/playlistExportRunner.js` - Core export orchestration with token management
- `/server/services/autoExportService.js` - Auto-queue on publish/import
- `/server/services/dspTelemetryService.js` - Event tracking and worker heartbeats
- `/server/worker/dspExportWorker.js` - Automated background processor

**Database:**
- `/server/database/db.js` - Base schema bootstrap + prepared statements (`getQueries()`)
- `/server/database/migrations/` - Schema changes for export requests, tokens, and worker metadata

**Documentation:**
- `/docs/features/export.md` - This file (export request system details)
- `/docs/features/dsp-workflow.md` - Complete DSP workflow guide (import → export)

---

## Schema Updates (2025-10-22)

### Migration 042: OAuth Tokens v2 - Enhanced Token Management

**Updated**: 2025-10-22
**Migration file**: `server/database/migrations/042_oauth_tokens_v2.js`
**Planning docs**: `llm/features/wip/dsp-automate/MIGRATION_PLAN.md`

#### Changes to `export_oauth_tokens`

The OAuth tokens table has been enhanced to support:
- Multiple accounts per platform (Flowerpil-managed + curator-owned)
- Token rotation with primary/backup redundancy
- Health tracking and validation history
- Explicit account ownership

**New schema:**

```sql
CREATE TABLE export_oauth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Core token data
  platform TEXT NOT NULL CHECK (platform IN ('spotify', 'tidal', 'apple')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at DATETIME,
  refresh_expires_at DATETIME,         -- NEW: when refresh token expires (if applicable)

  -- Account classification
  account_type TEXT NOT NULL CHECK (account_type IN ('flowerpil', 'curator')),
  account_label TEXT NOT NULL,         -- NEW: human-readable identifier (e.g., 'flowerpil-primary', 'curator-johndoe')
  owner_curator_id INTEGER,            -- NEW: FK to curators.id for curator-owned tokens

  -- Operational metadata
  health_status TEXT DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'expiring', 'expired', 'revoked', 'unknown')),
  last_validated_at DATETIME,          -- NEW: last successful API call with this token
  is_active INTEGER DEFAULT 1,         -- NEW: primary/backup flag (1=active, 0=backup)

  -- Legacy compatibility
  user_info TEXT,                      -- JSON: {id, display_name, storefront, etc}

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  FOREIGN KEY (owner_curator_id) REFERENCES curators(id) ON DELETE CASCADE,
  UNIQUE(platform, account_type, account_label)
);

-- New indexes
CREATE INDEX idx_oauth_tokens_v2_platform ON export_oauth_tokens(platform);
CREATE INDEX idx_oauth_tokens_v2_account_type ON export_oauth_tokens(account_type);
CREATE INDEX idx_oauth_tokens_v2_health ON export_oauth_tokens(health_status);
CREATE INDEX idx_oauth_tokens_v2_active ON export_oauth_tokens(is_active) WHERE is_active = 1;
CREATE INDEX idx_oauth_tokens_v2_curator ON export_oauth_tokens(owner_curator_id) WHERE owner_curator_id IS NOT NULL;
```

**Key changes:**

1. **Removed UNIQUE(platform) constraint** - Now allows multiple tokens per platform
2. **Added `account_type`** - Distinguishes Flowerpil-managed from curator-owned tokens
3. **Added `account_label`** - Human-readable identifier for token management
4. **Added `owner_curator_id`** - Links curator-owned tokens to specific curators
5. **Added `health_status`** - Tracks token operational health
6. **Added `last_validated_at`** - Records last successful token use
7. **Added `is_active`** - Enables primary/backup token selection
8. **Added `refresh_expires_at`** - Tracks refresh token expiration (important for Spotify)

**Migration behavior:**

- Existing tokens are migrated with `account_type='flowerpil'` and `account_label='legacy-{platform}'`
- Original table preserved as `export_oauth_tokens_legacy` for rollback
- All existing tokens marked as `is_active=1` and `health_status='unknown'`

#### Changes to `export_requests`

**New column:**

```sql
ALTER TABLE export_requests ADD COLUMN job_metadata TEXT;
```

**Purpose:**
Store operational metadata for export jobs, including which token was used, retry counts, and execution context.

**Example `job_metadata` JSON (with per-platform progress):**

```json
{
  "worker_id": "export-worker-hostname-12345",
  "leased_at": "2025-01-15T10:00:00Z",
  "started_at": "2025-01-15T10:00:05Z",
  "completed_at": "2025-01-15T10:05:30Z",
  "execution_time_ms": 325000,
  "retry_count": 0,
  "max_retries": 3,
  "token_id": 42,
  "account_type": "flowerpil",
  "account_label": "flowerpil-spotify",
  "requested_account_type": "flowerpil",
  "resolved_account_type": "flowerpil",
  "account_fallback_used": false,
  "platforms": {
    "spotify": {
      "status": "completed",
      "started_at": "2025-01-15T10:00:10Z",
      "completed_at": "2025-01-15T10:02:30Z",
      "tracks_added": 45,
      "total_tracks": 50,
      "duration_ms": 140000,
      "playlist_url": "https://open.spotify.com/playlist/abc123"
    },
    "apple": {
      "status": "completed",
      "started_at": "2025-01-15T10:02:35Z",
      "completed_at": "2025-01-15T10:05:20Z",
      "tracks_added": 48,
      "total_tracks": 50,
      "duration_ms": 165000,
      "playlist_url": "https://music.apple.com/us/playlist/def456"
    }
  },
  "success": true
}
```

#### Token Selection Logic (Updated)

The `getExportToken()` function in `server/services/playlistExportRunner.js` has been updated to support multi-account selection:

**Old behavior:**
```javascript
// Single token per platform, latest wins
const getExportToken = (platform) => {
  const stmt = db.prepare('SELECT * FROM oauth_tokens WHERE platform = ? ORDER BY id DESC LIMIT 1');
  return stmt.get(platform);
};
```

**New behavior:**
```javascript
// Select by account type, curator, and active status
const getExportToken = (platform, options = {}) => {
  const { accountType = 'flowerpil', curatorId = null, preferActive = true } = options;

  let sql = `
    SELECT * FROM export_oauth_tokens
    WHERE platform = ?
      AND account_type = ?
  `;
  const params = [platform, accountType];

  if (curatorId) {
    sql += ` AND owner_curator_id = ?`;
    params.push(curatorId);
  }

  if (preferActive) {
    sql += ` AND is_active = 1`;
  }

  sql += ` ORDER BY last_validated_at DESC NULLS LAST, id DESC LIMIT 1`;

  const stmt = db.prepare(sql);
  return stmt.get(...params);
};
```

**Selection priority:**
1. Match platform and account type
2. Filter by curator ID if specified
3. Prefer active tokens (`is_active=1`)
4. Sort by most recently validated (`last_validated_at DESC`)
5. Fall back to newest token by ID

#### Health Status Values

| Status | Description | Trigger |
|--------|-------------|---------|
| `healthy` | Token valid and working | Successful API call within last 24h |
| `expiring` | Token expires within 48h | Automated health check |
| `expired` | Token past expiration | Automated health check or failed refresh |
| `revoked` | User revoked authorization | API returns 401/403 with revocation error |
| `unknown` | Health not yet determined | Initial state for new tokens |

#### Account Type Guidelines

**`flowerpil` account type:**
- Tokens for Flowerpil's centralized DSP accounts
- Used when curator has `uses_flowerpil_account=1` in `curator_dsp_accounts`
- Managed by site admins via CLI tools
- Can have multiple tokens per platform for redundancy (primary + backup)

**`curator` account type:**
- Reserved for future feature: curator-owned OAuth tokens
- Would be linked to specific curator via `owner_curator_id`
- Currently not implemented in export workflows

#### Rollback Procedure

If issues arise after migration:

1. Stop export workers: `pm2 stop export-worker`
2. Run down migration: `npm run migrate:down`
3. Tables automatically renamed: `export_oauth_tokens_legacy` → `export_oauth_tokens`
4. Restart services: `pm2 restart all`

#### CLI Tools (Phase 1 Deliverables)

New CLI scripts under `scripts/dsp/`:

- `setup-token.ts` - Interactive OAuth setup for DSP platforms
- `token-check.js` - Verify token health and expiration
- `token-rotate.js` - Rotate primary/backup tokens
- `health-report.js` - Generate system-wide DSP health report

See `llm/features/wip/dsp-automate/IMPLEMENT.json` for full CLI specifications.

#### Related Tables

No changes to:
- `curator_dsp_accounts` - Still tracks curator DSP preferences
- `cross_links` - Still stores platform-specific track URLs
- `playlists` - Export URL columns unchanged

#### Backward Compatibility

**Breaking changes:**
- Code directly querying `export_oauth_tokens` must be updated to handle new columns
- Token selection logic must use new `getExportToken()` signature

**Non-breaking:**
- Old token queries still work (new columns NULL/default for legacy data)
- `job_metadata` column is optional in `export_requests`
- Trigger and index names remain compatible

#### Testing Recommendations

Before deploying migration to production:

1. **Backup database**: `sqlite3 data/flowerpil.db ".backup data/flowerpil_pre_042.db"`
2. **Test migration**: `npm run migrate:up` on staging
3. **Verify token count**: Confirm row count matches before/after
4. **Test export**: Run manual export using migrated token
5. **Monitor logs**: Check for errors referencing old schema
6. **Validate rollback**: Test `npm run migrate:down` on staging

#### Known Issues & Limitations

- **SQLite limitation**: Cannot add CHECK constraint to existing column, hence table recreation
- **Downtime window**: Brief read-only period during table rename (typically <1 second)
- **Refresh token expiry**: Not all platforms provide `refresh_expires_at` (Apple doesn't use refresh tokens)
- **Import/Export table segregation**: Playlist import operations and export operations use distinct OAuth token tables with different schemas, requiring careful token lookup implementation to prevent table mismatch errors

#### Curator Playlist Import Token Lookup

The playlist import flow uses the same `export_oauth_tokens` table architecture but requires distinct token lookup implementation due to different execution contexts.

**Import flow components:**

1. **Curator import endpoint** (`server/api/curator/index.js`)
   - Curator accesses own DSP playlists via authenticated session
   - Token lookup resolves `admin_users.curator_id` to `export_oauth_tokens.owner_curator_id`
   - Query filters by `account_type='curator'` and `is_active=1`

2. **Import scheduler service** (`server/services/playlistSchedulerService.js`)
   - Automated playlist syncs via `playlist_import_schedules` table
   - Schedule records include `owner_curator_id` for token resolution
   - Supports both curator-owned and Flowerpil account contexts

**Token selection logic:**

```javascript
// server/api/curator/index.js:436-478
const getCuratorOAuthToken = (userId, platform) => {
  const user = db.prepare('SELECT curator_id FROM admin_users WHERE id = ?').get(userId);
  if (!user?.curator_id) return null;

  const row = db.prepare(`
    SELECT access_token, expires_at FROM export_oauth_tokens
    WHERE platform = ?
      AND account_type = 'curator'
      AND owner_curator_id = ?
      AND is_active = 1
    ORDER BY COALESCE(expires_at, datetime('now')) DESC
    LIMIT 1
  `).get(platform, user.curator_id);

  if (!row?.access_token) return null;
  if (row.expires_at && new Date(row.expires_at) <= new Date()) return null;
  return row.access_token;
};
```

```javascript
// server/services/playlistSchedulerService.js:46-94
async function getSpotifyAccessToken(db, curatorId = null) {
  let row;

  if (curatorId) {
    // Curator import: use curator's token
    row = db.prepare(`
      SELECT access_token, expires_at FROM export_oauth_tokens
      WHERE platform = 'spotify'
        AND account_type = 'curator'
        AND owner_curator_id = ?
        AND is_active = 1
      ORDER BY COALESCE(expires_at, datetime('now')) DESC
      LIMIT 1
    `).get(curatorId);
  } else {
    // Admin import: use flowerpil token
    row = db.prepare(`
      SELECT access_token, expires_at FROM export_oauth_tokens
      WHERE platform = 'spotify'
        AND account_type = 'flowerpil'
        AND is_active = 1
      ORDER BY COALESCE(expires_at, datetime('now')) DESC
      LIMIT 1
    `).get();
  }

  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
  return row.access_token;
}
```

**Schedule creation:**

Import schedules created via `POST /api/v1/playlist-actions/schedules` now populate `owner_curator_id` from the associated playlist's curator relationship:

```javascript
// server/api/playlist-actions.js:115-141
const playlist = queries.getPlaylistById.get(playlist_id);
const stmt = db.prepare(`
  INSERT INTO playlist_import_schedules (
    playlist_id, source, mode, wip_spotify_playlist_id,
    frequency, frequency_value, time_utc, status, owner_curator_id
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
`);
stmt.run(playlist_id, source, mode, wip_spotify_playlist_id,
         frequency, frequency_value, time_utc, playlist.curator_id);
```

This ensures the scheduler can retrieve the correct curator-scoped token when executing automated imports.

**Common failure modes:**

1. **Table mismatch**: Querying `oauth_tokens` instead of `export_oauth_tokens` returns no results for curator accounts
2. **Missing curator_id**: Import schedules without `owner_curator_id` cannot resolve curator tokens, causing authentication failures
3. **Account type mismatch**: Querying `account_type='flowerpil'` when curator token is required returns wrong credentials

All import token lookups must query `export_oauth_tokens` with appropriate `account_type` and `owner_curator_id` filters to prevent authentication errors during playlist fetch operations.

#### Next Steps (Phase 1 Continuation)

1. Migration file created and documented
2. Import flow token lookups updated to use export_oauth_tokens table
3. ⏳ Update `playlistExportRunner.js` with enhanced token fallback logic
4. ⏳ Create `tokenHealthService.js` for health tracking
5. ⏳ Build CLI tools for token management
6. ⏳ Update admin UI to show token health status
7. ⏳ Implement token refresh automation

See `llm/features/wip/dsp-automate/README.md` for full project roadmap.
