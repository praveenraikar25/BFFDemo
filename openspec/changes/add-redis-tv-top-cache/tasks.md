# Tasks

The project has no test or lint setup, so "verify" below means `npm run build` for types and the manual checks against a running server (and `redis-cli` where noted).

## 1. Setup and configuration

- [x] 1.1 Add `ioredis` to `package.json` dependencies and verify `npm install` succeeds and `npm run build` passes
- [x] 1.2 Add optional `REDIS_URL` to the zod env schema in `src/server.ts` (empty treated as unset; must parse as a `redis://` or `rediss://` URL) and document it as optional in `.env.example`; verify the server exits with a config error for `REDIS_URL=not-a-url` and starts normally when it is unset
- [x] 1.3 Start a local Redis (`docker run -d --name demo-redis -p 6379:6379 redis:7-alpine`) and verify `docker exec demo-redis redis-cli ping` returns `PONG`

## 2. Cache module

- [x] 2.1 Create `src/cache.ts` with the `Cache` interface (`get`, `set` with TTL) and `createNoopCache()`; verify `npm run build` passes
- [x] 2.2 Add `createRedisCache(url, logger)` with `lazyConnect`, `enableOfflineQueue: false`, a short `commandTimeout`, bounded reconnect backoff, and an `error` listener that logs warnings; verify the build passes and the server logs a warning, not a crash, when started with `REDIS_URL` pointing at a stopped Redis
- [x] 2.3 Make the Redis `get`/`set` never throw (catch, log warn, return `null`/resolve), including treating unparsable cached values as misses; verify by stopping Redis mid-run and confirming cache calls return without errors

## 3. Wire into the server and `/tv/top`

- [x] 3.1 In `src/server.ts`, build the cache (`createRedisCache` when `REDIS_URL` is set, otherwise `createNoopCache`), connect in the background after `listen`, add an `onClose` hook that quits the client, and inject `cache` into `registerTvRoutes`; verify `GET /health` responds immediately with Redis stopped and the process shuts down cleanly on SIGINT
- [x] 3.2 In `src/routes/tv.ts`, add `cache` to `TvRouteDeps` and implement cache-aside after the app-version gate: key `demo-bff:v1:tmdb:tv:top_rated:en-US:page=<n>`, TTL 3600s as a named constant, cache only `response.ok` bodies, leave error mapping and genre resolution unchanged; verify `npm run build` passes
- [x] 3.3 Verify cache behavior with a valid token and `X-APP-VERSION: 2`: the first `GET /tv/top?page=2` populates the key (`redis-cli GET` / `TTL` show a value and a TTL near 3600), the second is served without a TMDB call (confirm via server logs), and `page=3` uses a separate key
- [x] 3.4 Verify the gates and failure paths: no token gets 401 and a stale cached page is not served, `X-APP-VERSION: 1` gets the empty 200 with no cache read, stopping Redis mid-run still returns normal 200 responses without delay, and a forced TMDB error response leaves no key in Redis

## 4. Documentation

- [x] 4.1 Update `CLAUDE.md` (Setup, Architecture, and Conventions) to describe the optional `REDIS_URL`, `src/cache.ts`, the injected `cache` dependency, and the `/tv/top` caching rules; verify the text matches the implemented key format and TTL
