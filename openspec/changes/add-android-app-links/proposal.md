# Proposal

## Why

The MovieGallery Android app (`com.raikar.moviegallery`) wants `https://<bff host>/movie/{id}` links to open directly in the app. Android only does that after it verifies the host by fetching a Digital Asset Links file from it, and the BFF serves no such file today. A link tapped on a device without the app also needs somewhere to land, and the BFF currently returns 404 for `/movie/{id}`.

## What Changes

- Add a public `GET /.well-known/assetlinks.json` route. It returns the Digital Asset Links statement for `com.raikar.moviegallery`, with signing-certificate fingerprints read from a new optional env var `ANDROID_SHA256_CERT_FINGERPRINTS`. When the var is unset, it defaults to the debug key. Invalid entries are logged and dropped, never served.
- Add a public `GET /movie/:id` route. It returns a small static HTML fallback page with an "Open in app" link to `moviegallery://movie/{id}` and, when the new optional env var `APP_STORE_URL` is set, a "Get the app" link. An id that is not 1 to 10 digits in the range 1 to 2147483647 gets a 404.
- Both routes are registered without the auth guard and are reached with no redirect. No hostname is configured or hard-coded anywhere.
- Add a test runner (Node's built-in `node:test` through the existing `tsx`, with no new dependencies) and an `npm test` script. Tests cover the new routes and confirm that `/tv/top` still returns 401 without a token.
- Document the two env vars in `.env.example`, a new `README.md`, and `CLAUDE.md`.
- No existing route, response, or auth behavior changes. `/movies/:id` (plural) is untouched and separate from the new `/movie/:id`.

## Capabilities

### New Capabilities
- `android-app-links`: Android App Links support. This covers the Digital Asset Links file, its fingerprint configuration, and the public HTML fallback page for `/movie/{id}` links.

### Modified Capabilities
- `service-runtime`: The API documentation requirement lists a fixed set of route tags. A new `app-links` tag is added so the two new public routes are documented.

## Impact

- **Code**: new `src/routes/app-links.ts` (`registerAppLinksRoutes(app, deps)`, following the dependency-injection pattern in `routes/tv.ts`). `src/server.ts` gains two optional env vars, the `app-links` Swagger tag, and one registration call.
- **Tooling**: new `test/` directory and a `"test"` script in `package.json`. The repo has no linter, so `npm run build` (tsc) remains the type and lint check. No new dependencies.
- **Docs and config**: `.env.example`, new `README.md`, and `CLAUDE.md`. There is no `render.yaml` in the repo. Render env vars are set in the dashboard, and no `render.yaml` is added.
- **Deployment**: set `ANDROID_SHA256_CERT_FINGERPRINTS` on Render to the release (and QA) signing-key fingerprints. For Play App Signing, that is the key shown in Play Console, not the upload key. Without it, production serves only the debug fingerprint.
- **Out of scope**: iOS `apple-app-site-association`, custom domain setup.
