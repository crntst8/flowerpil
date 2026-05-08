# Playlist Comments and Loves

## Purpose
`PlaylistView` supports two engagement actions:
- Love a playlist and save it to the signed-in account’s saved playlists list.
- Add comments and replies on a playlist page.

The feature keeps engagement tied to published playlists and exposes saved playlists in the curator dashboard.

## Data Model
Schema lives in `server/database/migrations/101_playlist_engagement.js`:
- `playlist_loves`: one row per `(playlist_id, account_id, account_role)`.
- `playlist_comments`: top-level comments and replies with `parent_comment_id`.

Database bootstrap and prepared statements live in `server/database/db.js`:
- Table creation in `initializeDatabase()`:
  - `playlist_loves`
  - `playlist_comments`
- Query methods in `getQueries()`:
  - `addPlaylistLove`
  - `removePlaylistLove`
  - `checkPlaylistLovedByAccount`
  - `getPlaylistLoveCount`
  - `listLovedPlaylistsByAccount`
  - `insertPlaylistComment`
  - `getPlaylistCommentById`
  - `listPlaylistCommentsWithAuthors`

`listPlaylistCommentsWithAuthors` resolves usernames by `account_role` using `users`, `admin_users`, and `curators`.

## API Routes
Route module: `server/api/playlist-engagement.js`.

Mounted in `server/index.js`:
- `playlistEngagementCSRFMiddleware` applies CSRF validation to mutating methods.
- `app.use('/api/v1/playlist-engagement', playlistEngagementCSRFMiddleware, playlistEngagementRoutes)`.

Route handlers:
- `GET /api/v1/playlist-engagement/saved/playlists`
  - Uses `authMiddleware`.
  - Returns loved published playlists for the current account via `listLovedPlaylistsByAccount`.
- `GET /api/v1/playlist-engagement/:playlistId`
  - Uses `optionalAuth`.
  - Returns `loveCount`, `viewerHasLoved`, and threaded `comments`.
- `POST /api/v1/playlist-engagement/:playlistId/love`
  - Uses `authMiddleware`.
  - Uses `addPlaylistLove`.
- `DELETE /api/v1/playlist-engagement/:playlistId/love`
  - Uses `authMiddleware`.
  - Uses `removePlaylistLove`.
- `POST /api/v1/playlist-engagement/:playlistId/comments`
  - Uses `authMiddleware`.
  - Uses `insertPlaylistComment`.
- `POST /api/v1/playlist-engagement/:playlistId/comments/:commentId/replies`
  - Uses `authMiddleware`.
  - Validates parent comment with `getPlaylistCommentById`.
  - Uses `insertPlaylistComment`.

Core helper functions in `server/api/playlist-engagement.js`:
- `resolveAccountRole`
- `validatePlaylistId`
- `getPublishedPlaylistOrNull`
- `buildCommentTree`
- `buildEngagementPayload`

## Feature Gates
Gates use `admin_system_config` keys:
- `playlist_love_enabled`
- `playlist_comments_enabled`

Default gate values are defined in `server/api/admin/systemConfig.js` (`DEFAULT_CONFIGS`).

Public config exposure:
- `server/api/config.js` (`GET /api/v1/config/site-settings`)
- `server/api/bootstrap.js` (`GET /api/v1/bootstrap`)

Backend gate enforcement in `server/api/playlist-engagement.js`:
- `readGateEnabled`
- `isLoveEnabled`
- `isCommentsEnabled`

Gate behavior:
- Love endpoints reject when love gate is off.
- Comment endpoints reject when comments gate is off.
- Engagement read payload strips disabled sections.
- Saved playlists endpoint returns an empty list when love gate is off.

## Admin Controls
UI toggles live in `src/modules/admin/components/SiteDisplaySettings.jsx`:
- `togglePlaylistLove`
- `togglePlaylistComments`

`CONFIG_SPECS` seeds missing config keys through `/api/v1/admin/system-config/:key`.

## Site Settings Context
`src/shared/contexts/SiteSettingsContext.jsx` provides:
- `isPlaylistLoveEnabled`
- `isPlaylistCommentsEnabled`

These helpers wrap raw settings reads and are used by public playlist UI.

## Frontend Service Layer
API client functions are in `src/modules/playlists/services/playlistService.js`:
- `getPlaylistEngagement`
- `lovePlaylist`
- `unlovePlaylist`
- `createPlaylistComment`
- `createPlaylistReply`

Mutations require `authenticatedFetch` from `AuthContext` so cookies and CSRF handling stay consistent.

## PlaylistView Integration
Main UI integration: `src/modules/playlists/components/PlaylistView.jsx`.

Gate reads:
- `useSiteSettings()`
- `playlistLoveEnabled`
- `playlistCommentsEnabled`

Love interaction:
- `handleLoveToggle` performs optimistic UI updates.
- If unauthenticated, `handleLoveToggle` opens `SignupModal` by setting `showSignupModal`.
- Love button renders in the actions row to the right of playlist links.
- Heart icons:
  - `/love-fullsize.png`
  - `/love-red-fullsize.png`

Comments interaction:
- `handleSubmitComment` posts top-level comments.
- `handleSubmitReply` posts replies.
- Comments panel lives between `ActionsWrapper` and `TrackSectionWrapper`.
- Panel uses `commentsExpanded` for collapse/show behavior.

Signup behavior:
- `SignupModal` is rendered in `PlaylistView`.
- Unauthenticated love/comment/reply actions open the same modal path.

## Curator Saved Tab
Saved playlists render in `src/modules/curator/components/CuratorDashboard.jsx`.

Tab setup:
- `VALID_TABS` includes `saved`.
- Desktop and mobile menu include the saved tab.

Data flow:
- `loadSavedPlaylists` fetches `/api/v1/playlist-engagement/saved/playlists`.
- `handleUnsavePlaylist` calls `DELETE /api/v1/playlist-engagement/:playlistId/love`.
- Saved list renders when `activeTab === 'saved'`.
