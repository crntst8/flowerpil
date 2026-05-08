## Purpose
- Keep a real curator account fully functional while hiding it from public listings.
- Let the demo curator and admins see demo playlists and profiles without exposing them to other curators or the public.
- Track demo usage sessions, page pathways, and time spent for sales demos.

## Data model
- `curators.is_demo` is added in `server/database/migrations/069_demo_accounts.js` and ensured in `server/database/db.js`.
- `demo_account_activity` is created in `server/database/migrations/069_demo_accounts.js` and `server/database/db.js` with fields: `curator_id`, `user_id`, `session_id`, `event_type`, `path`, `from_path`, `duration_ms`, `metadata`, `created_at`.
- Queries in `server/database/db.js`:
  - `setCuratorDemoStatus` updates `curators.is_demo`.
  - `getDemoCurators` returns demo curators with linked admin user data.
  - `insertDemoActivity` stores demo activity events.

## Visibility rules
- Public curator and playlist endpoints use demo filters in `server/utils/demoAccountUtils.js`:
  - `getDemoCuratorIdSet` reads demo curator ids.
  - `filterDemoCurators` and `filterDemoPlaylists` remove demo content unless the viewer is an admin or the demo curator.
  - `canViewDemoCurator` allows visibility for admins or the owning curator.
- Curator endpoints apply optional auth in `server/api/curators.js` and return 404 for demo profiles when the viewer is not allowed.
- Playlist endpoints apply optional auth in `server/api/playlists.js` and 404 demo playlists when the viewer is not allowed.
- Public feed and playlist APIs apply optional auth in `server/api/public-playlists.js` and remove demo playlists for anonymous viewers.
- Tag pages in `server/api/public.js` filter demo playlists from the content tag response.
- `server/api/sitemap.js` excludes demo curators and demo playlists from the sitemap.
- When demo content is included in a public feed response, `server/api/public-playlists.js` switches to `Cache-Control: private, no-store` and adds a `Vary` header for `Cookie` and `Authorization`.

## Activity logging
- Demo activity posts to `POST /api/v1/demo-accounts/activity` in `server/api/demo-accounts.js`.
- The route requires `authMiddleware` and checks `req.user.is_demo` before inserting activity with `insertDemoActivity`.
- `src/shared/components/DemoAccountTracker.jsx` listens to route changes and logs a `route` event with `session_id`, `path`, `from_path`, and `duration_ms` using `useAuth().authenticatedFetch`.

## Admin controls
- Admin APIs live in `server/api/admin/demo-accounts.js` and require `authMiddleware` + `requireAdmin`.
- `GET /api/v1/admin/demo-accounts` returns demo curators with playlist and activity summaries.
- `GET /api/v1/admin/demo-accounts/:curatorId/activity` returns events, session rollups, and top paths for a demo curator.
- `POST /api/v1/admin/demo-accounts` supports two paths:
  - Create a new demo curator and curator login using `hashPassword`, `validatePassword`, and `createAdminUser`.
  - Mark an existing curator as demo and force `profile_visibility = 'private'`.
- `POST /api/v1/admin/demo-accounts/:curatorId/reset-password` regenerates a demo password and updates `admin_users` with `updateAdminUserPassword`.
- Admin actions log via `logSecurityEvent(SECURITY_EVENTS.ADMIN_ACTION)`.

## Operations UI
- `src/modules/admin/components/DemoAccountPanel.jsx` renders the demo account panel.
- `src/modules/admin/components/tabs/OperationsTab.jsx` mounts the panel under the "Demo Account" sub-tab.
- The panel calls admin endpoints via `adminGet` and `adminPost` from `src/modules/admin/utils/adminApi.js`.

## Dev user switcher
- `src/dev/DevUserSwitcher.jsx` includes a demo entry in `TEST_USERS` for quick login.
- Quick login uses `POST /api/v1/auth/dev/quick-login` from `server/api/auth.js` and only works in development.
- The demo switcher entry expects the demo account email to exist in `admin_users`.
