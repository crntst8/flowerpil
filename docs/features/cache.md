## Overview
- `server/utils/memoryCache.js` provides an in-memory LRU cache with synchronous cache-aside helpers aligned with better-sqlite3 access patterns.
- Public API hot paths use cache-aside reads and only store non-null responses.
- Demo filtering and feed visibility rules are applied after cache reads so user-specific visibility stays correct.

## Configuration
- `DISABLE_MEMORY_CACHE` turns the in-memory cache off when set to `true`.
- `CACHE_FEED_TTL`, `CACHE_PLAYLIST_TTL`, and `CACHE_CURATOR_TTL` are TTLs in milliseconds.
- Local dev defaults live in `ecosystem.config.cjs` under the PM2 environment block.

## Cached public endpoints
- `GET /api/v1/public/feed` caches playlist summaries per `limit` key and then applies demo filtering, pinned ordering, and hidden rules.
- `GET /api/v1/public/playlists/:id` caches the playlist record, flags, and track count for published playlists.
- `GET /api/v1/public/playlists/:id/tracks` (and `/api/v1/public/tracks/playlist/:id`) caches the mapped, ordered public track list.

## Invalidation and health
- `invalidatePlaylist()` runs after playlist create/update/delete/publish and track order/batch updates to clear feed, playlist, and tracks caches.
- `invalidateCuratorPlaylists()` runs after curator update/delete to clear curator, feed, and playlist caches.
- `invalidateFeed()` runs after feed visibility or Perfect Sundays config updates.
- `GET /api/health/cache` returns cache stats including hits, misses, sizes, and invalidation count.
