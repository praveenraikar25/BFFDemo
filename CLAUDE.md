# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — run with hot reload (`tsx watch src/server.ts`)
- `npm run build` — compile TypeScript to `dist/` (also runs automatically on `npm install` via `postinstall`)
- `npm start` — run the compiled `dist/server.js`

There is no test or lint setup. Type-check with `npm run build`.

## Setup

Copy `.env.example` to `.env` and set `TMDB_READ_TOKEN` (a TMDB v4 read access token) and `FIREBASE_PROJECT_ID` (the Firebase project the app signs users into; no service-account credentials needed). The server validates env with zod at startup and exits if either is missing. `PORT` defaults to 3000.

`REDIS_URL` (e.g. `redis://localhost:6379`) is optional and enables the `/tv/top` cache; unset or empty runs uncached, and a malformed value exits at startup. Redis is never required: for local dev, `docker run -d --name demo-redis -p 6379:6379 redis:7-alpine`.

## Architecture

A small Fastify 5 BFF (backend-for-frontend) that proxies and reshapes upstream APIs (TMDB, jsonplaceholder). ESM project (`"type": "module"`, NodeNext), so relative imports must use the `.js` extension (e.g. `./routes/tv.js`).

- `src/server.ts` — env loading/validation, Fastify setup, shared `fetchUpstream` helper (3s abort timeout), simple routes (`/health`, `/movies/:id`, `/search` are stubs; `/users/:id` proxies jsonplaceholder), and registration of route modules.
- `src/auth.ts` — `createFirebaseIdTokenVerifier(projectId)` (wraps `firebase-admin` `verifyIdToken`, bounded at 3s) and `createAuthGuard({ verifyIdToken })`, an `onRequest` hook. `server.ts` builds the guard once and injects it.
- `src/cache.ts` — the `Cache` interface (`get`, `set` with TTL, `connect`, `close`), `createNoopCache()`, and `createRedisCache(url, logger)` (`ioredis`). `server.ts` picks one from `REDIS_URL`, connects in the background after `listen` (so a down Redis never blocks startup), closes it in an `onClose` hook, and injects it.
- `src/routes/tv.ts` — `registerTvRoutes(app, deps)` for `/tv/top`. Dependencies (`fetchUpstream`, `tmdbReadToken`, `authGuard`, `cache`) are injected rather than imported; follow this pattern for new route modules.

Conventions to follow:
- Validation and response serialization use `fastify-type-provider-zod`; define `params`/`querystring`/`headers`/`response` zod schemas per route. Response schemas filter output, so any status code you return must be declared in `response`.
- Upstream errors are mapped, not passed through: timeout (`AbortError`) → 504, network failure → 502, upstream non-OK → 502. An upstream 401 from TMDB becomes 500 (our token is wrong, not the caller's). (`/users/:id` is the exception: it echoes the upstream status.)
- TMDB snake_case fields are mapped to camelCase in the BFF response; poster paths are expanded to full image URLs.
- Auth is opt-in per route: add `onRequest: authGuard`, `security: [{ bearerAuth: [] }]`, and a `401` response schema. It requires `Authorization: Bearer <Firebase ID token>`; because it runs in `onRequest` it precedes validation, so unauthenticated requests get 401 even with bad input. Every verification failure is 401 `{"error":"Unauthorized"}` with `WWW-Authenticate: Bearer` — including failures to download Google's signing keys, which the SDK reports with the same error code as a bad token (the logged reason tells them apart; never log the token). Revocation is deliberately not checked. Only `/tv/top` is protected.
- `/tv/top` checks auth first, then is gated on the `X-APP-VERSION` header: missing or below `MIN_APP_VERSION` returns an empty 200 result instead of calling TMDB. Genre IDs are resolved to names via a lazily cached TMDB genre map (promise cached in the route closure, reset on failure).
- Caching is cache-aside and must never affect responses: `Cache` implementations never throw (a failure is logged and acts as a miss/no-op), and the Redis client has `enableOfflineQueue: false` and a ~200ms command timeout so an outage fails fast instead of hanging requests. `/tv/top` consults the cache only after auth and the version gate, caches TMDB's raw JSON for successful responses only (never errors) under `demo-bff:v1:tmdb:tv:top_rated:en-US:page=<n>` with a 3600s TTL, and still maps fields/genres on every response. Bump the `v1` key segment to invalidate everything. Include every upstream parameter in new cache keys.
