# Tasks

## 1. Test tooling and helpers

- [x] 1.1 Add `vitest` as a devDependency and `"test": "vitest run"` to package.json; verify `npm install` succeeds and `npm test` runs a trivial placeholder test that passes (removed once real tests exist)
- [x] 1.2 Create `test/helpers.ts` with `buildApp`, `fakeUpstream` and TMDB fixture factories, and verify it type-checks by importing it from a test and running `npm test`
- [x] 1.3 Confirm `npm run build` still succeeds, `dist/` contains no test output, and `tsc` ignores `test/` and any `vitest.config.ts`

## 2. Route behavior tests (`test/tv-top.test.ts`)

- [x] 2.1 Cover page parameter: default page 1, explicit page 3 reaches TMDB, and `page=0`/`page=501`/non-integer give 400; verify the tests pass
- [x] 2.2 Cover the version gate: missing, `1`, `2.5` and `abc` return the empty 200 body without calling TMDB, `2` and higher return real results; verify the tests pass
- [x] 2.3 Cover field mapping, poster URL expansion (present and `null`) and genre resolution (known, unknown to `"Unknown"`, no ids to `[]`); verify the tests pass
- [x] 2.4 Cover genre-map caching: reused after success, retried after failure, concurrent requests share one in-flight fetch; verify the tests pass
- [x] 2.5 Cover error mapping: TMDB 401 gives 500, other non-OK gives 502, `AbortError` gives 504, network error gives 502, genre non-OK gives 502 and genre `AbortError` gives 504 with no partial results; verify the tests pass

## 3. Auth tests (`test/auth-guard.test.ts`)

- [x] 3.1 Unit-test `createAuthGuard`: missing header, wrong scheme and empty token give 401 `{"error":"Unauthorized"}` with `WWW-Authenticate: Bearer` and the verifier is not called; a rejecting verifier gives the identical response; a valid token passes; verify the tests pass
- [x] 3.2 Add a route test using the real guard with a fake verifier: no token returns 401 even with `X-APP-VERSION: 1` or `page=0`, and TMDB is not called; verify the test passes

## 4. Documentation and final check

- [x] 4.1 Update CLAUDE.md: add `npm test` (Vitest) and a watch command (`npx vitest`) to Commands, replace "There is no test or lint setup" with the test layout and helper conventions, and verify the documented command runs as written
- [x] 4.2 Run `npm test` and `npm run build` together and verify both pass, then temporarily break a behavior (e.g. change `MIN_APP_VERSION`) to confirm a test fails, and revert it

## Workflow follow-up

- Archive the change after review.
