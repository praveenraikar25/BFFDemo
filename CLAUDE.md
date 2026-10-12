# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — run with hot reload (`tsx watch src/server.ts`)
- `npm run build` — compile TypeScript to `dist/` (also runs automatically on `npm install` via `postinstall`)
- `npm start` — run the compiled `dist/server.js`

There is no test or lint setup. Type-check with `npm run build`.

## Setup

Copy `.env.example` to `.env` and set `TMDB_READ_TOKEN` (a TMDB v4 read access token). The server validates env with zod at startup and exits if it is missing. `PORT` defaults to 3000.

## Architecture

A small Fastify 5 BFF (backend-for-frontend) that proxies and reshapes upstream APIs (TMDB, jsonplaceholder). ESM project (`"type": "module"`, NodeNext), so relative imports must use the `.js` extension (e.g. `./routes/tv.js`).

- `src/server.ts` — env loading/validation, Fastify setup, shared `fetchUpstream` helper (3s abort timeout), simple routes (`/health`, `/movies/:id`, `/search` are stubs; `/users/:id` proxies jsonplaceholder), and registration of route modules.
- `src/routes/tv.ts` — `registerTvRoutes(app, deps)` for `/tv/top`. Dependencies (`fetchUpstream`, `tmdbReadToken`) are injected rather than imported; follow this pattern for new route modules.

Conventions to follow:
- Validation and response serialization use `fastify-type-provider-zod`; define `params`/`querystring`/`headers`/`response` zod schemas per route. Response schemas filter output, so any status code you return must be declared in `response`.
- Upstream errors are mapped, not passed through: timeout (`AbortError`) → 504, network failure → 502, upstream non-OK → 502. An upstream 401 from TMDB becomes 500 (our token is wrong, not the caller's). (`/users/:id` is the exception: it echoes the upstream status.)
- TMDB snake_case fields are mapped to camelCase in the BFF response; poster paths are expanded to full image URLs.
- `/tv/top` is gated on the `X-APP-VERSION` header: missing or below `MIN_APP_VERSION` returns an empty 200 result instead of calling TMDB. Genre IDs are resolved to names via a lazily cached TMDB genre map (promise cached in the route closure, reset on failure).
