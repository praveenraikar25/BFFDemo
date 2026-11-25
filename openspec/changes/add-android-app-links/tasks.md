# Tasks

The repo has no linter. `npm run build` (strict tsc) is the static check, and `npm test` is added in group 1. Existing routes, hooks, and Fastify options must not change. Check with `git diff src/routes/tv.ts src/auth.ts` (expected: empty) and by reviewing the `server.ts` diff. The only expected `server.ts` changes are the env fields, the Swagger tag, logging, and one registration call.

## 1. Test runner

- [x] 1.1 Add `"test": "node --import tsx --test \"test/**/*.test.ts\""` to `package.json` (design D7). Do not add dependencies. Create `test/` with a trivial passing test. Verify that `npm test` runs it and exits 0, and that `npm run build` still emits only `src/` into `dist/`.

## 2. Asset links config and route

- [x] 2.1 Create `src/routes/app-links.ts` with the `ANDROID_PACKAGE_NAME` and `DEFAULT_SHA256_CERT_FINGERPRINT` constants, `parseFingerprints(raw)` returning `{ valid, invalid }`, and `appLinksEnvSchema` (design D3). In `test/app-links.test.ts`, verify these cases: unset or blank returns the default; ` A , B,, ` returns `[A, B]` in order; lowercase, 31-pair, and `not-a-key` entries land in `invalid`; and all-invalid input returns an empty `valid`. Run `npm test`.
- [x] 2.2 Add `registerAppLinksRoutes(app, { sha256CertFingerprints, appStoreUrl })` with `GET /.well-known/assetlinks.json`: a precomputed Buffer, `Content-Type: application/json` exactly, `Cache-Control: public, max-age=3600`, tag `app-links`, and no `onRequest` (design D1/D2). In tests, verify every scenario under the spec's asset links requirements: 200; exact content type; exact body shape and fingerprints; no `Location` header; identical body for two different `Host` values; 200 with no `Authorization` header and with `Bearer garbage`; and the trailing-slash path not returning 3xx. Run `npm test` and `npm run build`.
- [x] 2.3 In `src/server.ts`, extend the env zod object with `appLinksEnvSchema`. Parse the fingerprints, log invalid entries at warn, log an error if none are valid, and log the served list at info. Call `registerAppLinksRoutes`, and add the `app-links` tag to the Swagger config. Verify with `npm run dev`. First, with the var unset, `curl -i localhost:3000/.well-known/assetlinks.json` shows the default fingerprint. Second, with `ANDROID_SHA256_CERT_FINGERPRINTS=" <valid>, bad ,"`, the log warns about `bad` and serves only `<valid>`.
- [x] 2.4 Add `ANDROID_SHA256_CERT_FINGERPRINTS` to `.env.example`, commented out, with the default noted and a note that values must be uppercase colon-separated SHA-256, comma-separated for multiple keys. Verify that copying `.env.example` to a fresh `.env` (with the two required vars filled) still starts the server.

## 3. Movie fallback page

- [x] 3.1 Add `GET /movie/:id` to `registerAppLinksRoutes` with handler-side validation (`/^\d{1,10}$/` and 1 to 2147483647, canonical `String(n)`) and a static 404 HTML page with no request data (design D4). Add `escapeHtml` and the page template with the headers from design D5. In tests, verify: 200 and `text/html` for `/movie/603`; `href="moviegallery://movie/603"`; `/movie/0603` links to `603`; `/movie/2147483647` returns 200; and 404 with the id absent from the body for `abc`, `0`, `-5`, `12345678901`, `2147483648`, `1e3`, and `%3Cscript%3E`. Also verify that `?x=<script>alert(1)</script>` is not reflected, the body has no `<script` or external `src=`/stylesheet link, `<meta name="viewport"` is present, CSP includes `default-src 'none'`, `nosniff` is set, and the route returns 200 without `Authorization`. Run `npm test`.
- [x] 3.2 Wire `APP_STORE_URL` into `appLinksEnvSchema` (trim, blank becomes unset, must be an absolute http(s) URL) and pass it through `server.ts`. Render the "Get the app" link only when it is set. In tests, verify that the button is absent when unset; that `https://...?id=com.raikar.moviegallery&hl=en` renders `href` with `&amp;`; and that `appLinksEnvSchema.safeParse` rejects `javascript:alert(1)` and `not a url` and accepts blank. Manually verify that `APP_STORE_URL=javascript:alert(1) npm run dev` exits non-zero with a config error. Run `npm test` and `npm run build`.
- [x] 3.3 Add `APP_STORE_URL` to `.env.example`, commented out, as optional. Verify by rereading it next to the schema.
- [x] 3.4 Open `http://localhost:3000/movie/603` in a mobile viewport (browser devtools) and confirm that the page is readable, the buttons are tappable, and the devtools network panel shows no requests beyond the document.

## 4. Auth regression and docs

- [x] 4.1 Create `test/auth-regression.test.ts` (design D7). On one Fastify instance, register `registerTvRoutes`, using a real `createAuthGuard` with a stub verifier that always rejects and a spy `fetchUpstream`, together with `registerAppLinksRoutes`. Assert that `GET /tv/top` with no token returns 401 `{"error":"Unauthorized"}` with `WWW-Authenticate: Bearer` and that the spy is not called. Assert that both App Links routes return 200 with no token. Run `npm test`, and confirm `git diff src/routes/tv.ts src/auth.ts` is empty.
- [x] 4.2 Verify Swagger. With `npm run dev`, confirm that `/docs/json` lists both new routes under `app-links` with no `security`, and that `/tv/top` still shows `bearerAuth`.
- [x] 4.3 Create `README.md`. Cover purpose, setup, scripts (`dev`, `build`, `start`, `test`), and a table of every env var (`TMDB_READ_TOKEN`, `FIREBASE_PROJECT_ID`, `PORT`, `ANDROID_SHA256_CERT_FINGERPRINTS`, `APP_STORE_URL`) with required/optional status and defaults. Add an App Links section on where to get the release fingerprint (Play Console, App signing key) and the curl, Digital Asset Links API, and `adb pm verify-app-links` checks from design's Migration Plan. Also note the cold-start caveat. Do not include a real hostname. Verify that the documented commands run as written locally.
- [x] 4.4 Update `CLAUDE.md`: replace "There is no test or lint setup" with the `npm test` command, add the two env vars to Setup, add `src/routes/app-links.ts` to Architecture, and note that public routes omit `authGuard` (only `/tv/top` is protected). Verify by rereading it against the code.

## 5. Final checks

- [x] 5.1 Run `npm run build` and `npm test`. Both must pass. Confirm with `grep -rn "onrender.com" src test` (expected: no matches) that no hostname is hard-coded, and that no real secrets are in `.env.example` or `README.md`.
- [x] 5.2 Prepare the hand-off: the list of files changed, the exact Render env vars, and a verification checklist using `curl -i https://$HOST/.well-known/assetlinks.json` and `curl -i https://$HOST/movie/603`. Each check must confirm 200, no `Location` header, exact `Content-Type`, and no `Authorization` sent. Verify that the checklist commands run against `http://localhost:3000` and produce the expected results.

## Workflow follow-up

- After deploy, set `ANDROID_SHA256_CERT_FINGERPRINTS` on Render to the Play Console app-signing key (and any QA key). Run the hand-off checklist against the live host, then run `adb shell pm verify-app-links --re-verify com.raikar.moviegallery` on a device.
- Archive the change after review and deployment.
