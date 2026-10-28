# Proposal

## Why

`GET /tv/top` calls TMDB on every supported request, even though the top-rated list changes slowly and is identical for every caller. This project is a learning exercise, so adding a Redis-backed cache is a chance to practise the cache-aside pattern, TTLs, key design, and, most importantly, how to make a cache fail safe so an absent or broken Redis never degrades the API.

## What Changes

- Add an optional `REDIS_URL` configuration value. When unset, the service runs uncached through a no-op cache and behaves exactly as it does today.
- Add a cache dependency, injected into route modules alongside `fetchUpstream`, backed by Redis when `REDIS_URL` is set.
- Cache the raw TMDB top-rated response for `/tv/top`, keyed by upstream parameters (language and page) under a namespaced, versioned key, with a TTL of about one hour. Mapping to camelCase, poster URLs, and genre names still runs on every response.
- Consult the cache only after authentication and the app version gate, so those gates behave as before.
- Never cache upstream errors.
- Treat any cache failure (connection error, timeout, Redis down) as a cache miss: log it and fall through to TMDB. Cache commands fail fast instead of queueing while disconnected.
- The service starts even if Redis is unreachable at boot, logging a warning and running uncached.
- Out of scope: caching `/users/:id`, moving the genre map into Redis, TLS or password setup, stale-while-revalidate, metrics, and a Redis health check.

## Capabilities

### New Capabilities
- `response-caching`: How the BFF caches upstream responses in an optional Redis store: key namespacing and versioning, TTL, no caching of errors, and fail-safe behavior when the cache is absent or failing.

### Modified Capabilities
- `tv-top-rated`: `/tv/top` may be served from cached TMDB data instead of calling TMDB, only after the auth and version gates; responses are identical whether or not the cache was hit.
- `service-runtime`: Adds the optional `REDIS_URL` configuration value, and startup must not fail because Redis is unreachable.

## Impact

- Code: `src/server.ts` (env schema, cache construction, injection), `src/routes/tv.ts` (cache-aside around the top-rated call), and a new cache module under `src/`.
- Dependencies: a Redis client library (such as `ioredis`).
- Config: new optional `REDIS_URL` in `.env.example`.
- Local tooling: a Redis instance for development, for example `docker run -p 6379:6379 redis:7-alpine`. Redis is not required to run the service.
- API: no change to request or response shapes or status codes.
