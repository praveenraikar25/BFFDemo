# Design

## Context

`registerTvRoutes(app, deps)` receives `fetchUpstream`, `tmdbReadToken`, and `authGuard` as arguments, and `createAuthGuard({ verifyIdToken })` is likewise injectable. `server.ts` cannot be imported by tests: it validates env, calls `listen` and may `process.exit` at module load. Tests therefore build their own Fastify instance. The behaviors under test are already specified in `tv-top-rated`, `request-auth` and `upstream-errors` (see proposal.md).

## Goals / Non-Goals

**Goals:**
- Every `tv-top-rated` scenario, and the `createAuthGuard` rejection paths are asserted by a fast, offline test.
- One new dev dependency (`vitest`), no runtime dependencies.

**Non-Goals:**
- No refactor of `server.ts` (e.g. extracting a `buildApp()`); tests wire the app themselves.
- No Firebase SDK or real network in any test.
- No coverage tooling or CI.

## Decisions

**Runner: Vitest** (`vitest run`). It provides `vi.fn()` spies, which replace hand-rolled call recording in the fakes, plus watch mode and `vi.waitFor` for the concurrent-request test. It runs TypeScript natively, so tests do not depend on `tsx`. Alternative: `node:test` via `tsx`, which adds no dependency but has a thinner mocking toolbox; rejected in favor of Vitest's ergonomics.

**Layout: `test/` at the repo root**, outside `src/`. `tsconfig.json` has `rootDir: src` and `include: ["src"]`, so `npm run build` ignores tests and `dist/` stays clean. Tests import from `../src/...js` as the NodeNext rule requires. Type-checking tests is not part of the build; Vitest strips types only. A `vitest.config.ts` is optional; if added it sets `include: ["test/**/*.test.ts"]` and lives at the repo root, outside `src/` and `tsc`. Alternative: co-located `src/**/*.test.ts`, rejected because it would be compiled into `dist/` and break `rootDir` expectations.

**Shared helper `test/helpers.ts`** exports:
- `buildApp(overrides)`: Fastify with the zod validator and serializer compilers, `logger: false`, and `registerTvRoutes` called with default fakes (authGuard passes) that overrides can replace.
- `fakeUpstream(routes)`: a URL-matching `fetchUpstream`, wrapped in `vi.fn()`, that routes `/tv/top_rated` and `/genre/tv/list` independently so each call is inspectable. Each route's handler can return a JSON `Response`, a non-OK status, or throw (including an `AbortError`). This is chosen over an ordered response queue so tests do not depend on whether the genre call happens before or after the top-rated call.
- A small TMDB fixture factory for top-rated pages and the genre list.

**Test files:**
- `test/tv-top.test.ts`: route behavior with a stubbed guard (page param, version gate, mapping, posters, genres, genre-map reuse/retry/in-flight sharing, error mapping, genre failure).
- `test/auth-guard.test.ts`: `createAuthGuard` with a fake verifier (missing, wrong scheme and empty token give 401 with `WWW-Authenticate: Bearer`; verifier rejection gives the same body; verifier not called without a header; valid token passes). One route-level test uses the real guard to show 401 beats an old version and an invalid `page`.

Each test builds a fresh app so the closure-held genre map never leaks between cases. The route is never given a real timer; `AbortError` is simulated by throwing.

Response caching is not covered here: it is not part of this change's base. Cache tests belong with the Redis cache change.

## Risks / Trade-offs

- [Fakes drift from real TMDB/Fastify behavior] → Fixtures mirror the TMDB field names the route reads; the tests assert the spec'd BFF output rather than internal calls wherever possible.
- [Tests are not type-checked by `npm run build`] → Accepted for now; a later change can add a `tsconfig.test.json` if wanted.
- [New dev dependency to maintain] → Dev-only, so it does not affect `dist/` or runtime; the injected-dependency design keeps tests free of Vitest-specific module mocking.
