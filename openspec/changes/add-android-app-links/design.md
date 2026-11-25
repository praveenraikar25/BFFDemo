# Design

## Context

See proposal.md for motivation and specs/ for the behavior contract. Current state relevant to the approach:

- Fastify 5.12 with `fastify-type-provider-zod`. Env is validated with one zod object at the top of `src/server.ts`, which exits on failure before Fastify is created.
- Auth is opt-in per route (`onRequest: authGuard`). There is no global hook, catch-all route, trailing-slash redirect (`ignoreTrailingSlash` is off by default), or HTTPS redirect in the app. New routes are public unless they add the guard.
- Route modules take their dependencies as arguments (`registerTvRoutes(app, deps)`) instead of reading env themselves.
- The repo has no test runner, linter, README, or `render.yaml`. Render env vars are set in the dashboard.
- `server.ts` runs top-level side effects (env exit, Firebase init, `listen`), so it cannot be imported by tests. Route modules can.
- Fastify's `reply.send` appends `; charset=utf-8` to any JSON content type when the payload is a string or object (`lib/reply.js`). A `Buffer` payload with an explicit content type is sent with that header unchanged.

## Goals / Non-Goals

**Goals:**
- Two additive public routes in one new module, with no change to existing routes, hooks, or Fastify options.
- Config parsing that can be unit-tested without starting the server.
- A test setup with no new dependencies.

**Non-Goals:**
- Refactoring `server.ts` into a testable app factory. This would be useful, but it touches every existing route and falls outside "keep it small."
- Adding a linter. `npm run build` (tsc, strict) stays the static check.
- Serving any page for `/movie/:id` beyond the static fallback, such as movie title or poster lookups.

## Decisions

### D1. One module: `src/routes/app-links.ts`
It exports `registerAppLinksRoutes(app, { sha256CertFingerprints, appStoreUrl })`, plus the pure helpers `parseFingerprints(raw)` and `appLinksEnvSchema` (see D3). `server.ts` adds the env fields, logs the parse result, and makes one registration call. Neither route receives `authGuard`. That is the whole bypass: there is no allowlist to maintain.
*Alternative:* putting both routes inline in `server.ts`. Rejected because the new routes would then be untestable and would not follow the `routes/tv.ts` pattern.

### D2. Asset links body precomputed and sent as a Buffer
The JSON is built once at registration, from the package name constant and the parsed fingerprints. It is stored as a `Buffer` and sent with `reply.type('application/json').header('Cache-Control', 'public, max-age=3600')`. The Buffer path sends `Content-Type: application/json` exactly, with no charset appended. Nothing about the request (such as `Host`) affects the body. A zod `response[200]` schema is still declared so the route is documented in Swagger. Fastify does not run the serializer on Buffers.
*Alternative:* returning the object, which gives `application/json; charset=utf-8`. Android's verifier accepts that in practice, but the requirement asks for the exact type, and the Buffer costs nothing.

### D3. Config parsing
- `ANDROID_SHA256_CERT_FINGERPRINTS: z.string().optional()`. `parseFingerprints(raw)` returns `{ valid, invalid }`. It splits on `,`, trims, drops empties, and tests each entry against `/^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/`. `undefined` or a blank string returns the default debug fingerprint. `server.ts` logs `invalid` at warn and logs an error when `valid` is empty. It then logs the served list at info, so a deploy shows which keys are live. Fingerprints are public certificate hashes, not secrets, so logging them is safe.
- Lowercase entries are rejected, not uppercased. This follows the requirement literally, and the warning makes the fix obvious.
- `APP_STORE_URL`: trimmed, and blank becomes unset. Otherwise it must parse as an absolute URL with protocol `http:` or `https:`, or startup fails through the existing zod error path. Failing at startup, rather than dropping the value, prevents a typo from silently removing the button. The protocol check rules out `javascript:` URLs, which escaping alone would not.
- `appLinksEnvSchema` is exported from the module and merged into the env object in `server.ts` (`.extend(...)`), so tests can `safeParse` it directly.

### D4. `/movie/:id` validates in the handler and returns 404
No zod `params` schema is used, because a failure there yields 400, and the requirement is 404. The handler checks `/^\d{1,10}$/`, converts with `Number`, and requires `1 <= n <= 2147483647`. A failure returns a small static "Link not found" HTML page with status 404 that contains no request data. A pass renders the template with `String(n)`, which yields the canonical form (`0603` becomes `603`). Only that number and the startup-validated store URL are interpolated, both passed through a small `escapeHtml` as defense in depth. The query string is never read.

### D5. Fallback page
A single template literal holds an HTML5 page with a viewport meta tag, an inline `<style>` (system font stack, centered card, large tap targets), the text "MovieGallery", "This link opens in the MovieGallery app.", an "Open in app" button linking to `moviegallery://movie/<id>`, and an optional "Get the app" button. It has no scripts, external resources, or analytics. The response headers are:
- `Content-Type: text/html; charset=utf-8`
- `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`

No auto-redirect to the custom scheme is attempted, because that would need script and the CSP blocks it.

### D6. Swagger
Add an `app-links` tag to the Swagger config and tag both routes. Declare response 200/404 as `z.string()` with a description for the HTML route. If `fastify-type-provider-zod` supports per-content-type response schemas cleanly, use `text/html`. Otherwise keep the description. Neither route declares `security`.

### D7. Tests with `node:test` through `tsx`
Add the script `"test": "node --import tsx --test \"test/**/*.test.ts\""`. Node 22+ expands the glob itself, and the local version is v26. Tests build a fresh `Fastify()` with the zod compilers, register the module under test, and use `app.inject`. There is no network and no `listen`. The files are:
- `test/app-links.test.ts`: both routes, every spec scenario, plus `parseFingerprints` and `appLinksEnvSchema` cases.
- `test/auth-regression.test.ts`: registers `registerTvRoutes` with a real `createAuthGuard` (stub verifier that always rejects) and a spy `fetchUpstream`, alongside `registerAppLinksRoutes` on the same instance. It asserts that `/tv/top` returns 401 with no upstream call, and that both new routes return 200 without a token. The repo has no existing auth tests, so this is the regression check the request asks for.

`test/` is outside `tsconfig.json`'s `include`, so `tsc` does not emit or type-check tests. `tsx` runs them without type-checking. This is accepted to keep the build output unchanged.

### D8. Docs
- `.env.example`: both vars, commented, with the default noted.
- New `README.md`: purpose, setup, scripts, an env var table, and an App Links section covering how to get the release fingerprint and the verification commands.
- `CLAUDE.md`: update the "no test setup" line, add the new env vars to Setup, add the module to Architecture, and add the convention that public routes simply omit `authGuard`.

## Risks / Trade-offs

- **Production serves only the debug fingerprint if the env var is never set on Render** → verification fails for release builds. Mitigation: the startup info log lists the served fingerprints, and the deploy checklist in tasks.md requires setting the var. With Play App Signing, the fingerprint must be the app signing key from Play Console, not the upload key.
- **Render's edge redirects `http://` to `https://`.** That redirect is outside the app. Android fetches `https://` directly, so it does not affect verification. Verification curls use `https://` and must show 200 with no `Location` header.
- **`.onrender.com` free instances spin down when idle.** The first verifier fetch after idle can take tens of seconds. Android retries verification, but a cold start during install can delay link handling. Mitigation: note this in the README; a paid instance or keep-alive is a deploy decision, not code.
- **Fastify's default 404 handler echoes the URL inside a JSON message** for paths that match no route, such as `/movie/a/b` or params longer than `maxParamLength`. That response is JSON (not HTML), comes from existing global behavior, and is left unchanged to avoid touching shared config.
- **Tests are not type-checked** (D7) → a type error in a test only appears at runtime. Acceptable for now.

## Migration Plan

1. Merge and deploy. The routes are additive, and existing clients are unaffected.
2. On Render, set `ANDROID_SHA256_CERT_FINGERPRINTS` (release key, plus QA or upload keys if those builds need verified links) and optionally `APP_STORE_URL`. Saving env vars triggers a redeploy.
3. Verify with curl over `https://$HOST`, then with Google's Digital Asset Links API (`https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://$HOST&relation=delegate_permission/common.handle_all_urls`), then on a device with `adb shell pm verify-app-links --re-verify com.raikar.moviegallery` and `adb shell pm get-app-links com.raikar.moviegallery`.
4. Rollback: revert the commit. Nothing else depends on the routes. Removing them only makes links open in the browser again.

## Open Questions

- The release and QA fingerprint values, and the final `APP_STORE_URL`. These are config only and do not block implementation.
