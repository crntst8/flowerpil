## Configuration and client lifecycle
- `REDIS_URL` enables Redis usage; when it is missing or empty, Redis-backed features fall back to local in-memory behavior.
- `server/utils/redisClient.js` centralizes the optional Redis client; `getRedisClient()` returns `{ client, configured, available }` and initializes the connection on first use.
- `server/utils/redisClient.js` listens for `connect`, `ready`, `error`, `close`, and `end` events to update availability without logging connection strings.
- `server/utils/redisClient.js` exposes `getRedisState()` for safe status snapshots and avoids printing secrets.
- Environment wiring for `REDIS_URL` lives in `ecosystem.config.cjs` and `ecosystem.config.production.cjs`.

## Shared cache wrapper
- `server/utils/redisCache.js` provides `getCacheValue(namespace, key)` and `setCacheValue(namespace, key, value, ttlMs)`.
- Keys are namespaced as `fp:cache:<namespace>:<key>` via `buildCacheKey()`.
- Values serialize to JSON and return `undefined` on missing keys or parse errors so callers can fall back to in-memory caches without branching on Redis state.
- TTL handling converts milliseconds to seconds and uses `EX` when a positive TTL is supplied.

## Export OAuth PKCE storage
- `server/api/playlist-export.js` replaces the in-memory PKCE store with Redis when available while keeping the Map fallback.
- `setPkceState(platform, state, codeVerifier)` writes state and optional verifier to Redis using `fp:oauth:pkce:<platform>:<state>:state` and `fp:oauth:pkce:<platform>:<state>:verifier`, both with a 10-minute TTL; it always writes to the Map for fallback consistency.
- `getPkceState(platform, state)` reads from Redis first, then falls back to the Map for state validation in `POST /api/v1/export/auth/:platform/callback`.
- `consumePkceVerifier(platform, state)` uses a Redis Lua script to atomically read and delete the verifier and state, then falls back to the Map if Redis is unavailable.
- `clearPkceState(platform, state)` deletes both state and verifier in Redis and clears the Map for Spotify callbacks.
- `GET /api/v1/export/auth/:platform/url` calls `setPkceState()` after generating OAuth data; `POST /api/v1/export/auth/:platform/callback` calls `getPkceState()` and `consumePkceVerifier()` during OAuth validation.

## Spotify search caching
- `server/services/spotifyService.js` uses `normalizeSearchQuery()` to produce deterministic cache keys for ISRC and metadata searches.
- `getCachedSearch(cacheKey)` checks the in-memory `searchCache` first, then reads `fp:cache:spotify:search:<normalized-query>` via `getCacheValue()`; it hydrates the Map on Redis hits and updates cache hit metrics via `setCacheHitRate()`.
- `setCachedSearch(cacheKey, result)` writes to the Map and asynchronously calls `setCacheValue()` with the existing 5-minute TTL; it caches null results to avoid repeated misses.
- `searchByISRC()` and `searchByMetadata()` await `getCachedSearch()` before making outbound requests, preserving the existing cache TTL behavior.
- The cache stores only search results and nulls; it does not store access tokens or secrets.

## Distributed rate limiting for linking
- `server/utils/DistributedRateLimiter.js` uses Redis to coordinate token buckets across worker instances and falls back to local token tracking when Redis is unavailable.
- `initializeRedis()` reads `REDIS_URL` and creates the `ioredis` client; `getRedisState()` reports `{ configured, status, available }` for diagnostics.
- `refillTokens()`, `acquire()`, and `release()` execute Lua scripts against `rl:<platform>:tokens` and `rl:<platform>:refill_time` for atomic updates.
- `refillTokensLocal()` and `acquireLocal()` keep behavior consistent when Redis is down or missing.
- `server/worker/linking-worker.js` creates `new DistributedRateLimiter('spotify')` and `new DistributedRateLimiter('apple')` and logs `getRedisState()` in the startup snapshot.

## Redis keys and TTLs
- `rl:<platform>:tokens` and `rl:<platform>:refill_time` store distributed rate limiter state without TTLs.
- `fp:oauth:pkce:<platform>:<state>:state` and `fp:oauth:pkce:<platform>:<state>:verifier` store export OAuth PKCE state and verifier with 10-minute TTLs.
- `fp:cache:spotify:search:<normalized-query>` stores Spotify search results with a 5-minute TTL.

## Fallback behavior
- `server/api/playlist-export.js` always writes the in-memory Map and uses it when Redis is unavailable, so OAuth callbacks continue to work during Redis outages.
- `server/services/spotifyService.js` preserves existing in-memory cache behavior when Redis reads or writes fail.
- `server/utils/DistributedRateLimiter.js` uses local token buckets when Redis is disabled or unstable, which preserves functionality without cross-process coordination.
