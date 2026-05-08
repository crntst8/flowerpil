# User Accounts

Public user accounts provide a restricted tier of access for non-curator users. These accounts have limited import capabilities and gated export access based on playlist contribution thresholds.

## User Types and Privileges

The `users` table contains a `user_type` column that distinguishes public users from curators and admins. Public users have the value `public` while curators and admins bypass public user restrictions entirely.

User status values control access levels:
- `active` - Normal access within public user limits
- `suspended` - Blocked from imports and exports, can be restored by admin
- `restricted` - Limited functionality with specific constraints
- `revoked` - Permanent access removal with `is_active` set to 0

## Database Schema

### Users Table Extensions

`server/database/db.js` adds columns to the `users` table:

```sql
user_type TEXT DEFAULT 'public'
is_active INTEGER DEFAULT 1
exports_unlocked INTEGER DEFAULT 0
exports_unlocked_at DATETIME
exports_unlocked_by INTEGER
status TEXT DEFAULT 'pending'
status_reason TEXT
status_updated_at DATETIME
status_updated_by INTEGER
badges TEXT DEFAULT '[]'
```

### Admin User Actions Table

Stores audit trail for all admin actions on user accounts with mandatory reason field:

```sql
CREATE TABLE admin_user_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER NOT NULL,
  target_user_id INTEGER NOT NULL,
  target_user_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

Action types: `suspend`, `unsuspend`, `restrict`, `revoke`, `unlock_exports`, `badge_add`, `badge_remove`

### User Import Log Table

Tracks imports for rolling 24-hour rate limiting:

```sql
CREATE TABLE user_import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  import_type TEXT NOT NULL,
  source_platform TEXT,
  item_count INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Export Access Requests Table

Admin queue for export access approvals:

```sql
CREATE TABLE export_access_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending',
  reviewed_by INTEGER,
  reviewed_at DATETIME,
  review_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## Feature Flags

`server/services/featureFlagService.js` provides centralized flag management:

| Function | Flag | Default | Purpose |
|----------|------|---------|---------|
| `isPublicSignupEnabled()` | `PUBLIC_USERS_ENABLED` | false | Master switch for public user system |
| `isInviteOnly()` | `INVITE_ONLY_MODE` | true | Restricts signups to invited users |
| `arePublicExportsDisabled()` | `DISABLE_PUBLIC_EXPORTS` | false | Global kill switch for public exports |
| `getPublicUserImportLimit()` | `PUBLIC_USER_IMPORT_LIMIT` | 2 | Imports allowed per 24 hours |
| `getExportPlaylistThreshold()` | `PUBLIC_USER_EXPORT_PLAYLIST_THRESHOLD` | 6 | Published playlists required for export eligibility |

The `getAllFlags()` function returns all flags as an object, consumed by `server/api/bootstrap.js` to provide frontend access via the `featureFlags` response field.

Environment variables are defined in `ecosystem.config.cjs` in the `env` block.

## Import Rate Limiting

### Middleware

`server/middleware/publicUserLimits.js` exports two middleware functions:

**`publicUserImportLimiter`**

Applied to import routes. For public users:
1. Skips processing if `PUBLIC_USERS_ENABLED` is false
2. Returns 403 for suspended or revoked users
3. Queries `user_import_log` via `getUserImportCountLast24h` for rolling 24h count
4. Returns 429 with limit details if count exceeds `PUBLIC_USER_IMPORT_LIMIT`
5. Attaches `req.logPublicUserImport(importType, platform, count)` for logging successful imports
6. Attaches `req.publicUserImportInfo` object with `current`, `limit`, `remaining` properties

**`requireActiveAccount`**

Blocks requests from users with `is_active=0` or status `suspended`/`revoked`.

### Integration

`server/api/url-import.js` applies `publicUserImportLimiter` to the POST `/jobs` route. After successful job creation, calls `req.logPublicUserImport()` to record the import.

## Export Gating

### Eligibility Service

`server/services/exportEligibilityService.js` determines export access:

**`ELIGIBILITY_STATUS`** constants:
- `ELIGIBLE` - Can export
- `NOT_PUBLIC_USER` - Curators/admins, always eligible
- `EXPORTS_DISABLED` - Global flag blocks all public exports
- `SUSPENDED` / `REVOKED` - Account status blocks exports
- `UNLOCKED` - Admin manually unlocked exports
- `THRESHOLD_NOT_MET` - Insufficient published playlists
- `PENDING_APPROVAL` - Threshold met, awaiting admin approval

**`checkExportEligibility(user)`**

Returns `{ eligible, status, message, playlistCount?, threshold? }`. Evaluation order:
1. Non-public users (curators/admins) return eligible
2. `arePublicExportsDisabled()` check
3. User status check for suspended/revoked
4. `exports_unlocked` flag check for admin override
5. Published playlist count via `getPublishedPlaylistCount(userId)` compared against `getExportPlaylistThreshold()`

**`getPublishedPlaylistCount(userId)`**

Queries `playlists` table for count where `curator_id = userId AND published = 1`.

**`canRequestExportAccess(user)`**

Returns `{ canRequest, reason }`. Users can only request if status is `PENDING_APPROVAL` and no pending request exists.

**`requireExportEligibility`**

Express middleware that returns 403 with eligibility details for ineligible users.

### Integration

`server/api/playlist-export.js` applies `requireExportEligibility` to:
- POST `/playlists/:id/queue-export/:platform`
- POST `/playlists/:id/export/:platform`

## Public User API

`server/api/public-user.js` provides user-facing endpoints registered at `/api/v1/user`:

### GET `/export-eligibility`

Returns current user's export eligibility via `checkExportEligibility()` and `canRequestExportAccess()`.

Response includes: `eligible`, `status`, `message`, `playlistCount`, `threshold`, `canRequest`, `requestReason`

### POST `/request-export-access`

Creates an export access request for users meeting the threshold. Inserts via `createExportAccessRequest` query. Logs `PUBLIC_USER_EXPORT_REQUEST` security event.

Returns: `requestId`, `queuePosition`, `message`

### GET `/export-request-status`

Returns the user's export access request status if one exists.

Returns: `hasRequest`, `status`, `createdAt`, `reviewedAt`, `reviewReason`

### GET `/import-usage`

For public users, returns 24-hour import usage stats. Non-public users receive `{ unlimited: true }`.

Returns: `unlimited`, `current`, `limit`, `remaining`, `imports[]`

## Admin Users API

`server/api/admin-users.js` provides admin endpoints registered at `/api/v1/admin/users`. All routes require `authMiddleware` and `requireAdmin`.

### User Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | List public users with pagination and search. Uses `getPublicUsersPaginated` or `searchPublicUsers` |
| `/:id` | GET | User details with action history, import usage, and export request status |
| `/:id/actions` | GET | Action history via `getAdminUserActionsByTarget` |
| `/:id/suspend` | POST | Suspend user. Logs `PUBLIC_USER_SUSPENDED` security event |
| `/:id/unsuspend` | POST | Restore suspended user |
| `/:id/restrict` | POST | Apply restrictions. Logs `PUBLIC_USER_RESTRICTED` event |
| `/:id/revoke` | POST | Permanent access removal. Sets `is_active=0`. Logs `PUBLIC_USER_REVOKED` event |
| `/:id/unlock-exports` | POST | Manual export unlock. Logs `PUBLIC_USER_EXPORTS_UNLOCKED` event |
| `/:id/badge` | POST | Add or remove badge. Accepts `badge`, `action` (add/remove), `reason` |

All modifying endpoints require a `reason` parameter and insert records into `admin_user_actions`.

### Bulk Operations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/bulk-action` | POST | Perform action on multiple users. Accepts `userIds[]`, `action`, `reason` |

Valid bulk actions: `suspend`, `restore`, `restrict`, `unlock_exports`

### Export Requests

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/export-requests` | GET | List pending requests via `getPendingExportAccessRequests` |
| `/export-requests/:id/approve` | POST | Approve request and unlock exports |
| `/export-requests/:id/deny` | POST | Deny request. Requires reason |

### Analytics

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/analytics/summary` | GET | Aggregate stats via `getPublicUserSignupStats` and `getPublicUserImportStats` |

Returns user stats (total, last7Days, last30Days, verified, exportsUnlocked, suspended), import stats (total, uniqueUsers, last7Days), and pending export request count.

### Email Communication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/send-email` | POST | Send email to users. Accepts `userIds[]`, `groupId`, `sendToAll`, `subject`, `body` |
| `/email-templates` | GET | List all email templates |
| `/email-templates` | POST | Create template with `name`, `subject`, `body` |
| `/email-templates/:id` | DELETE | Delete template |

Emails are sent via `sendAdminEmail()` from `server/utils/emailService.js` in batches of 50 with 1-second delays.

## Security Events

`server/utils/securityLogger.js` defines event types logged via `logSecurityEvent()`:

| Event | Logged By | Trigger |
|-------|-----------|---------|
| `PUBLIC_USER_SIGNUP` | Auth routes | New public user registration |
| `PUBLIC_USER_SUSPENDED` | `admin-users.js` | Admin suspends user |
| `PUBLIC_USER_RESTRICTED` | `admin-users.js` | Admin restricts user |
| `PUBLIC_USER_REVOKED` | `admin-users.js` | Admin revokes access |
| `PUBLIC_USER_EXPORTS_UNLOCKED` | `admin-users.js` | Admin unlocks exports |
| `PUBLIC_USER_IMPORT_LIMIT_HIT` | `publicUserLimits.js` | Import limit exceeded |
| `PUBLIC_USER_EXPORT_BLOCKED` | Export routes | Export attempt blocked |
| `PUBLIC_USER_EXPORT_REQUEST` | `public-user.js` | User submits export request |

## Frontend Components

### Admin Panel

`src/modules/admin/components/AdminPage.jsx` includes the `UsersTab` component in `TAB_CONFIG`.

`src/modules/admin/components/tabs/UsersTab.jsx` provides sub-navigation with lazy-loaded panels:

| Panel | Component | Purpose |
|-------|-----------|---------|
| Accounts | `UsersAccountsPanel.jsx` | User list with search, pagination, bulk selection |
| Groups | `UsersGroupsPanel.jsx` | User group management |
| Analytics | `UsersAnalyticsPanel.jsx` | Signup and usage metrics dashboard |
| Export Requests | `UsersContentPanel.jsx` | Export access request queue management |

### User Components

Located in `src/modules/admin/components/users/`:

| Component | Purpose |
|-----------|---------|
| `UserAuditModal.jsx` | One-click audit panel with admin action buttons |
| `UserBadge.jsx` | Badge display component with visual variants |
| `EmailComposeModal.jsx` | Email compose interface with recipient selection |

Action button visibility in `UserAuditModal.jsx`:
- Restore: Shows for suspended/restricted users
- Suspend: Shows when not suspended or revoked
- Restrict: Shows when not restricted or revoked
- Revoke Access: Shows when not revoked

### Admin Service

`src/modules/admin/services/adminService.js` exports functions:

| Function | Endpoint |
|----------|----------|
| `getPublicUsers(params)` | GET `/api/v1/admin/users` |
| `getPublicUser(id)` | GET `/api/v1/admin/users/:id` |
| `getUserActions(id)` | GET `/api/v1/admin/users/:id/actions` |
| `suspendUser(id, reason)` | POST `/api/v1/admin/users/:id/suspend` |
| `unsuspendUser(id, reason)` | POST `/api/v1/admin/users/:id/unsuspend` |
| `restrictUser(id, reason)` | POST `/api/v1/admin/users/:id/restrict` |
| `revokeUser(id, reason)` | POST `/api/v1/admin/users/:id/revoke` |
| `unlockUserExports(id, reason)` | POST `/api/v1/admin/users/:id/unlock-exports` |
| `updateUserBadge(id, badge, action, reason)` | POST `/api/v1/admin/users/:id/badge` |
| `getPublicUserAnalytics()` | GET `/api/v1/admin/users/analytics/summary` |
| `getExportAccessRequests()` | GET `/api/v1/admin/users/export-requests` |
| `approveExportRequest(id, reason)` | POST `/api/v1/admin/users/export-requests/:id/approve` |
| `denyExportRequest(id, reason)` | POST `/api/v1/admin/users/export-requests/:id/deny` |

## Database Prepared Statements

`server/database/db.js` `getQueries()` includes:

### User Queries
- `getAllPublicUsers`, `getPublicUsersPaginated`, `countPublicUsers`
- `searchPublicUsers`, `countSearchPublicUsers`
- `updateUserStatus`, `updateUserActive`, `updateUserExportsUnlocked`, `updateUserBadges`

### Admin Action Queries
- `insertAdminUserAction`, `getAdminUserActionsByTarget`, `getAllAdminUserActions`

### Import Log Queries
- `insertUserImportLog`, `getUserImportCountLast24h`, `getUserImportLogsLast24h`

### Export Request Queries
- `createExportAccessRequest`, `getExportAccessRequestByUser`, `getPendingExportAccessRequests`
- `updateExportAccessRequest`, `countPendingExportAccessRequests`

### Analytics Queries
- `getPublicUserSignupStats`, `getPublicUserImportStats`
