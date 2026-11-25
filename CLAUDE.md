# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — run with hot reload (`tsx watch src/server.ts`)
- `npm run build` — compile TypeScript to `dist/` (also runs automatically on `npm install` via `postinstall`)
- `npm start` — run the compiled `dist/server.js`
- `npm test` — run `test/**/*.test.ts` with Node's built-in runner via `tsx` (no extra test deps). Tests build a fresh Fastify instance, register the route module under test, and use `app.inject`; `server.ts` itself is not importable (top-level env exit and `listen`).

There is no linter; type-check with `npm run build`. `test/` is outside `tsconfig.json`'s `include`, so tests are not type-checked.

## Setup

Copy `.env.example` to `.env` and set `TMDB_READ_TOKEN` (a TMDB v4 read access token) and `FIREBASE_PROJECT_ID` (the Firebase project the app signs users into; no service-account credentials needed). The server validates env with zod at startup and exits if either is missing. `PORT` defaults to 3000. Optional: `ANDROID_SHA256_CERT_FINGERPRINTS` (comma-separated; defaults to the debug key; invalid entries are logged and dropped) and `APP_STORE_URL` (must be an absolute http(s) URL or startup fails). See README.md for the full table.

## Architecture

A small Fastify 5 BFF (backend-for-frontend) that proxies and reshapes upstream APIs (TMDB, jsonplaceholder). ESM project (`"type": "module"`, NodeNext), so relative imports must use the `.js` extension (e.g. `./routes/tv.js`).

- `src/server.ts` — env loading/validation, Fastify setup, shared `fetchUpstream` helper (3s abort timeout), simple routes (`/health`, `/movies/:id`, `/search` are stubs; `/users/:id` proxies jsonplaceholder), and registration of route modules.
- `src/auth.ts` — `createFirebaseIdTokenVerifier(projectId)` (wraps `firebase-admin` `verifyIdToken`, bounded at 3s) and `createAuthGuard({ verifyIdToken })`, an `onRequest` hook. `server.ts` builds the guard once and injects it.
- `src/routes/tv.ts` — `registerTvRoutes(app, deps)` for `/tv/top`. Dependencies (`fetchUpstream`, `tmdbReadToken`, `authGuard`) are injected rather than imported; follow this pattern for new route modules.
- `src/routes/app-links.ts` — `registerAppLinksRoutes(app, deps)` for Android App Links: `/.well-known/assetlinks.json` (precomputed body sent as a Buffer so `Content-Type` stays exactly `application/json`; Fastify appends a charset to strings/objects) and `/movie/:id` (static HTML fallback; id validated in the handler so bad ids are 404, not 400). Also exports `parseFingerprints` and `appLinksEnvSchema`, which `server.ts` merges into its env schema. Never hard-code the hostname.

Conventions to follow:
- Validation and response serialization use `fastify-type-provider-zod`; define `params`/`querystring`/`headers`/`response` zod schemas per route. Response schemas filter output, so any status code you return must be declared in `response`.
- Upstream errors are mapped, not passed through: timeout (`AbortError`) → 504, network failure → 502, upstream non-OK → 502. An upstream 401 from TMDB becomes 500 (our token is wrong, not the caller's). (`/users/:id` is the exception: it echoes the upstream status.)
- TMDB snake_case fields are mapped to camelCase in the BFF response; poster paths are expanded to full image URLs.
- Auth is opt-in per route: add `onRequest: authGuard`, `security: [{ bearerAuth: [] }]`, and a `401` response schema. It requires `Authorization: Bearer <Firebase ID token>`; because it runs in `onRequest` it precedes validation, so unauthenticated requests get 401 even with bad input. Every verification failure is 401 `{"error":"Unauthorized"}` with `WWW-Authenticate: Bearer` — including failures to download Google's signing keys, which the SDK reports with the same error code as a bad token (the logged reason tells them apart; never log the token). Revocation is deliberately not checked. Only `/tv/top` is protected; every other route is public simply by omitting `authGuard` (there is no global hook or allowlist). The App Links routes must stay public — Android's verifier and app-less browsers send no token.
- `/tv/top` checks auth first, then is gated on the `X-APP-VERSION` header: missing or below `MIN_APP_VERSION` returns an empty 200 result instead of calling TMDB. Genre IDs are resolved to names via a lazily cached TMDB genre map (promise cached in the route closure, reset on failure).
