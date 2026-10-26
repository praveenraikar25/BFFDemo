# Design

## Context

- There is no authentication anywhere in the BFF today. See proposal.md (Why).
- Route modules receive their dependencies by injection rather than importing them. `registerTvRoutes(app, { fetchUpstream, tmdbReadToken })` is the existing example.
- Validation uses `fastify-type-provider-zod`, which runs in Fastify's `preValidation` phase. Response schemas filter output, so every status a route returns must be declared.
- `fetchUpstream` applies the 3s timeout to calls the BFF makes itself. Calls made inside third-party libraries do not go through it.
- Requirements are in `specs/request-auth`, `specs/tv-top-rated`, and `specs/service-runtime`.

## Goals / Non-Goals

**Goals:**
- One guard that any route can opt into with a single line, which `/tv/top` uses now.
- Unit-testable route modules: the token verifier is injected and can be replaced with a fake.

**Non-Goals:**
- Passing user identity (uid, email) into handlers or responses. `/tv/top` doesn't need it. The guard can attach it to the request later.
- Authorization rules such as custom claims and roles, or a revocation check.
- Protecting routes other than `/tv/top`.

## Decisions

### D1: Use `firebase-admin`'s `verifyIdToken`

Initialise the Admin SDK with only `{ projectId: FIREBASE_PROJECT_ID }`. Without `checkRevoked`, `verifyIdToken` checks the signature, `aud`, `iss`, `exp`, `iat`, `auth_time`, and `sub` locally against Google's published certificates. It needs no service-account credentials.

- *Alternative: `jose` with Google's JWKS.* It is lighter and would give distinct key-fetch errors and a native timeout. But we would have to rewrite Firebase's claim rules ourselves. Rejected in favour of the official SDK.
- The SDK caches the certificates in process memory and refreshes them based on the `Cache-Control` max-age Google returns. This satisfies "Signing keys are reused while valid" without any code of ours.

### D2: Inject a narrow verifier dependency, not the SDK

`createFirebaseIdTokenVerifier(projectId)` in `src/auth.ts` builds `verifyIdToken: (token: string) => Promise<DecodedIdToken>`. It wraps the SDK call and bounds it at 3s (D5). `server.ts` passes the result into the guard.

```
verifyIdToken(token)
  resolves                                    -> proceed
  rejects (any reason, including key fetch    -> 401
           failure or the 3s limit)
```

The guard and route modules depend only on this function type. Only the verifier factory touches `firebase-admin`.

### D3: The guard is an `onRequest` hook created by a factory

`createAuthGuard({ verifyIdToken })` in `src/auth.ts` returns a Fastify `onRequest` handler. A route opts in with `onRequest: authGuard` in its route options. `registerTvRoutes` receives `authGuard` in its deps.

- **Why `onRequest`:** it runs before `preValidation`, so an unauthenticated request with a bad query gets 401, not 400 (spec: "Authentication runs before other request processing"). It also avoids parsing and validating input for callers we will reject.
- *Alternative: `preHandler`.* It runs after validation, which would break that ordering.
- *Alternative: a global hook with an allowlist.* Forgetting to allowlist a new route would make it fail closed by accident. We chose explicit opt-in, matching "applied only to `/tv/top` for now".

The guard parses `Authorization` with a strict `^Bearer (\S+)$` match. If the header is missing or doesn't match, it returns 401 without calling the verifier.

### D4: Error responses

- **401:** `reply.code(401).header('WWW-Authenticate', 'Bearer').send({ error: 'Unauthorized' })`. Log the specific reason at `warn` level, using the error's code and message but never the token. The SDK's message for a key download failure ("Error while making request: ...") makes such failures easy to spot in logs, even though the response is the same.
- `/tv/top` declares `401` in its `response` map with the existing `upstreamErrorSchema` (`{ error: string }`).

### D5: Key download failures are treated as unverifiable tokens

Task 1.2 checked `firebase-admin@14.5.0`. A certificate download failure surfaces as `auth/argument-error`, the same code as a malformed, wrong-project, expired or badly signed token. Only the message differs. Rather than match on undocumented message text, every verification failure maps to 401 (decision: the earlier 502/504 rule was dropped).

**Timeout:** the SDK's certificate download has no timeout by default and retries up to 4 times on connection reset or timeout. Our 3s `fetchUpstream` timeout doesn't cover it. The verifier races the SDK call against a 3s timer and rejects when the timer expires, which gives a 401. Verification from the cache takes microseconds, so only network-bound calls can hit the timer.

### D6: Configuration and documentation

- Add `FIREBASE_PROJECT_ID` to the zod env schema with the same error messages as `TMDB_READ_TOKEN`, and add it to `.env.example`.
- Swagger: add `components.securitySchemes.bearerAuth = { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }`. `/tv/top` gets `security: [{ bearerAuth: [] }]` in its schema. Its description notes that authentication is checked before the version gate.

## Risks / Trade-offs

- [Old app builds get 401 instead of an empty 200 (breaking)] → The app team confirms old builds handle 401 gracefully before deploy.
- [Disabled users keep access for up to about one hour] → Accepted. If a future sensitive route needs it, enable `checkRevoked` there, which requires service-account credentials.
- [During a Google key-server outage, users whose process has no cached keys get 401, and the app may send them to sign-in] → Accepted. Keys are cached for hours, so this only affects a cold start or a cache refresh during the outage. Failures are logged and distinguishable by message.
- [The 3s race may abandon an SDK fetch that is still running] → Harmless: the SDK finishes or fails in the background and the next request retries.
- [Cold start: the first authenticated request after a deploy pays one certificate fetch] → One small request per process and cache lifetime. Accepted.
- [`firebase-admin` adds a large dependency to a small service] → Accepted for correctness and future features. D2 keeps it isolated, so swapping to `jose` later is local.

## Migration Plan

1. Set `FIREBASE_PROJECT_ID` in every environment before deploying. Startup fails fast without it.
2. Confirm the app's current release sends `Authorization: Bearer <idToken>` on `/tv/top`. If it does, deploy the BFF.
3. **Rollback:** redeploy the previous version. No data or state changes are involved.
