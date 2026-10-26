# Tasks

The project has no test runner. Verification uses `npm run build` (type-check) and `curl` against `npm run dev`. A real ID token can be obtained from the app, or from the Firebase Auth REST API `signInWithPassword` with a test user.

## 1. Dependency and SDK behaviour spike

- [x] 1.1 Add `firebase-admin` to dependencies. Verify that `npm install` succeeds and `npm run build` passes.
- [x] 1.2 With a scratch script (not committed), call `verifyIdToken` with only `{ projectId }` initialised (no credentials). Record the `FirebaseAuthError` codes for an expired token, a malformed token, a wrong-project token, and a blocked certificate URL (for example, offline or a bad DNS override). Verify that the codes match design D5, or update D5 with the actual codes before continuing. Result: all cases return `auth/argument-error`, so D5 and the spec were updated so that key-fetch failures return 401.

## 2. Configuration

- [x] 2.1 Add `FIREBASE_PROJECT_ID` to the zod env schema in `src/server.ts`, with required/non-empty messages matching `TMDB_READ_TOKEN`, and add it to `.env.example`. Verify that the server exits non-zero with a clear message when the value is unset or empty, and starts when it is set.
- [x] 2.2 Initialise the Firebase Admin app with `{ projectId }` in `src/server.ts`. Verify that the server starts without any `GOOGLE_APPLICATION_CREDENTIALS` set.

## 3. Token verifier and auth guard

- [x] 3.1 Create `src/auth.ts` with `createFirebaseIdTokenVerifier(projectId)` (design D2/D5). It wraps `verifyIdToken` and rejects if verification takes longer than 3s. Verify with `npm run build`.
- [x] 3.2 In `src/auth.ts`, add `createAuthGuard({ verifyIdToken })`, returning an `onRequest` hook (design D3/D4). It does strict `Bearer` parsing. A missing or invalid header, or any verifier rejection, returns 401 `{"error":"Unauthorized"}` with `WWW-Authenticate: Bearer`. It logs the reason, never the token. Verify with `npm run build`.
- [x] 3.3 Build the verifier and guard in `src/server.ts` and pass `authGuard` into `registerTvRoutes` deps. Verify with `npm run build`.

## 4. Protect `/tv/top`

- [x] 4.1 In `src/routes/tv.ts`, add `authGuard` to `TvRouteDeps`, set `onRequest: authGuard` on `/tv/top`, declare `401` in `response`, add `security: [{ bearerAuth: [] }]`, and update the description to say auth is checked before the version gate. Verify with `npm run build`.
- [x] 4.2 Verify the request-auth scenarios with curl. No header, `Basic` scheme, empty bearer, a garbage token, and an expired token each return 401 with an identical body and `WWW-Authenticate: Bearer`. No token with `?page=0` returns 401, not 400. Server logs show the rejection reason and no token.
- [x] 4.3 Verify the tv-top-rated scenarios with curl and a valid token. `X-APP-VERSION: 2` returns real results. Version 1 or a missing version returns the empty 200. `?page=0` returns 400. Tokens from both an email/password user and a Google user are accepted, including an unverified email user.
- [x] 4.4 Verify key-fetch failure handling. Restart the server with the certificate host unreachable (for example, offline). A valid-format token returns 401 within about 3s, and the log shows the key download error. Also check that `/health` still works without a token.

## 5. Documentation

- [x] 5.1 Add the `bearerAuth` security scheme to the Swagger config in `src/server.ts` (design D6). Verify that `/docs` shows the lock on `GET /tv/top` with a 401 response, that no lock is shown on `/health`, and that "Authorize" with a token makes "Try it out" return 200.
- [x] 5.2 Update `CLAUDE.md`. Add `FIREBASE_PROJECT_ID` to Setup. Describe the auth guard: its `onRequest` opt-in, its injection via deps, and that every verification failure, including key download failures, returns 401. Note that `/tv/top` checks auth before the version gate. Verify by rereading it against the implemented code.
- [ ] 5.3 Write a short client integration note for the app team in the PR description. Cover sending `Authorization: Bearer <idToken>`, calling `getIdToken()` before each request, and on 401 retrying once with `getIdToken(true)` before sending the user to sign-in. Also flag that old builds now get 401. Verify that the note is included in the PR description.

## Workflow follow-up

- Before deploy, set `FIREBASE_PROJECT_ID` in every environment and confirm the current app release sends the token.
- Archive the change after review and deployment.
