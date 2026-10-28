# Design

## Context

`/tv/top` currently calls TMDB on every supported request (`src/routes/tv.ts`), bounded by the 3s `fetchUpstream` timeout. Route modules receive their dependencies by injection from `src/server.ts` (`fetchUpstream`, `tmdbReadToken`, `authGuard`). The genre map already has its own in-process cache. The project is ESM/NodeNext and validates env with zod at startup. See proposal.md for motivation and scope.

## Goals / Non-Goals

**Goals:**
- Cache-aside for the TMDB top-rated call, with the cache invisible to API behavior (see specs/response-caching and specs/tv-top-rated).
- A cache that can be absent, slow, or broken without affecting any response.
- A small, injectable cache abstraction that a later route (such as `/users/:id`) could reuse.

**Non-Goals:**
- Single-flight / stampede protection for the top-rated key. The race is harmless at this scale and can be a follow-up exercise. The genre map keeps its existing promise-in-closure cache.
- Cache metrics, a Redis health check, TLS/auth hardening, and eviction tuning beyond local defaults.

## Decisions

**1. A narrow `Cache` interface with two implementations.**
`Cache` exposes `get(key): Promise<string | null>` and `set(key, value, ttlSeconds): Promise<void>`. `createNoopCache()` always misses; `createRedisCache(url, logger)` is backed by Redis. `server.ts` picks one based on `REDIS_URL` and injects it into `registerTvRoutes` next to `fetchUpstream`, following the existing dependency-injection convention.
- Alternative: a `wrap(key, ttl, loader)` helper. Rejected for now: `/tv/top` needs to cache only successful responses and keep its own error mapping, so explicit get/set in the route is clearer for learning.
- Alternative: an in-process Map/LRU. Rejected: it wouldn't teach Redis, and the proposal's goal is Redis.

**2. Redis client: `ioredis`.**
Its connection options map directly onto the fail-safe behavior needed (below), and it has first-class TypeScript types. `node-redis` would also work; the choice is not load-bearing because everything sits behind the `Cache` interface.

**3. Fail-fast client configuration.**
Create the client with `lazyConnect: true`, `enableOfflineQueue: false`, a short `commandTimeout` (about 200ms), a small `maxRetriesPerRequest`, and a bounded reconnect backoff. With the offline queue off, commands issued while disconnected reject immediately instead of waiting for reconnection, so an outage becomes a quick miss rather than a hung request. Reconnection continues in the background. An `error` listener is always attached so connection errors are logged as warnings and never surface as unhandled events.
- Trade-off: for a moment after boot, before the first connection completes, commands also reject. Those requests are just misses.

**4. Never throw out of the cache layer.**
The Redis `Cache` implementation catches every error from `get` and `set`, logs it at warn level (no key payloads beyond the key), and returns `null` / resolves. Route code therefore needs no try/catch around cache calls and cannot accidentally convert a cache failure into a 502/504. A cached value that fails `JSON.parse` is also treated as a miss.

**5. Cache the raw TMDB JSON, after the gates.**
In `/tv/top`, the order stays: `authGuard` (onRequest) → app-version gate → cache lookup → TMDB on miss → store on success. The cached value is TMDB's response body as a JSON string; field mapping, poster URLs, and genre resolution run on every response from that raw data. This keeps mapping changes from needing invalidation and keeps the genre map independent. Only `response.ok` bodies are stored, so errors, 401 mapping, and 502/504 paths are unchanged.
- Genre-map failures still fail the request exactly as today, even on a cache hit, because genre resolution is unchanged.

**6. Key format and TTL.**
`demo-bff:v1:tmdb:tv:top_rated:en-US:page=<n>`: service prefix, version segment, source, and every upstream parameter (language, page). TTL is 3600 seconds, held as a named constant next to `MIN_APP_VERSION`-style constants in the route module. Bumping `v1` invalidates everything.

**7. Configuration.**
`REDIS_URL` is added to the zod env schema as optional; empty is treated as unset, and a set value must parse as a `redis://` or `rediss://` URL, otherwise startup fails with a config error like the existing variables. `.env.example` documents it as optional. `/health` is unchanged and does not touch Redis.

**8. Lifecycle.**
The Redis client connects after the server starts, in the background, so a down Redis never delays or blocks `listen`. An `onClose` hook quits the client for a clean shutdown.

## Risks / Trade-offs

- [Stale data for up to an hour] → Acceptable for a slow-changing top-rated list; the TTL and key version are the levers.
- [Cache outage silently running uncached] → Warnings are logged on connection errors and reconnect attempts; no metrics (non-goal).
- [Concurrent misses on an expired key each call TMDB] → Accepted for this scale; single-flight is a documented follow-up.
- [Cached payload shape drifts from what the mapper expects after a TMDB change] → Entries expire within the hour, and the key version can be bumped; corrupt or unparsable values are treated as misses.
- [Local Redis needed to see the feature work] → One `docker run` command; the service runs fine without it.
