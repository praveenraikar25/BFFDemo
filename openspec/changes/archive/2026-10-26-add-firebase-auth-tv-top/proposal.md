# Proposal

## Why

`GET /tv/top` is open: anyone who finds the URL can call it and use the BFF's TMDB credential, without being a user of the app. The app already signs users in with Firebase Authentication (email/password and Google), so the BFF can require a Firebase ID token on every request and reject callers who are not signed-in users.

## What Changes

- Add a reusable authentication guard that verifies a Firebase ID token sent as `Authorization: Bearer <idToken>`. Tokens from email/password and Google sign-in are accepted the same way, and unverified email addresses are allowed.
- Apply the guard to `GET /tv/top` only. Other routes, including `/health`, stay open.
- **BREAKING**: `GET /tv/top` without a valid token now returns `401 {"error":"Unauthorized"}`, checked before the `X-APP-VERSION` gate. Old app builds that send no token get 401 instead of the empty 200.
- If Google's token-signing keys cannot be fetched, the token cannot be verified and the request gets the same 401. The Firebase Admin SDK reports these failures with the same error code as an invalid token, so they can't be told apart reliably. Verification is bounded at 3s like other upstream calls.
- Token revocation is not checked. A disabled or signed-out user's token remains valid until it expires, at most about one hour. This was accepted as a trade-off.
- Add the required `FIREBASE_PROJECT_ID` configuration value, validated at startup.
- Document bearer authentication on `/tv/top` in the OpenAPI document and Swagger UI.

## Capabilities

### New Capabilities
- `request-auth`: verifying Firebase ID tokens on protected routes, and the 401 response when a token is missing or cannot be verified.

### Modified Capabilities
- `tv-top-rated`: the endpoint requires authentication before the app version gate runs.
- `service-runtime`: `FIREBASE_PROJECT_ID` is required at startup, protected routes are documented with a bearer scheme, and authentication on protected routes runs before input validation.

## Impact

- **Code**: new auth guard module (for example `src/auth.ts`); `src/server.ts` (env validation, Firebase Admin initialisation, injecting the verifier, Swagger security scheme); `src/routes/tv.ts` (attach the guard, declare 401).
- **Dependencies**: adds `firebase-admin`.
- **Config**: `FIREBASE_PROJECT_ID` added to `.env.example` and required at startup. No service-account credentials are needed.
- **Clients**: the app must send `Authorization: Bearer <idToken>` on `/tv/top`. It should call `getIdToken()` before each request so the SDK refreshes the token near its one-hour expiry. On a 401 it should force a refresh with `getIdToken(true)` and retry once before sending the user back to sign-in.
- **Docs**: update CLAUDE.md to describe the auth guard.
