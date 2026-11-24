# Proposal

## Why

`/tv/top` is the most behavior-rich route in the BFF (auth, version gate, field mapping, genre resolution, upstream error mapping), and none of it is covered by automated tests. The project has no test runner at all, so regressions in any of the ~25 spec scenarios are only caught by manual runs. The route and auth guard already take their dependencies by injection, so they can be tested without network or Firebase.

## What Changes

- Add Vitest as a dev dependency and an `npm test` script (`vitest run`).
- Add route-level tests for `/tv/top` that drive the real route through `app.inject()` with fake `fetchUpstream`, and `authGuard`.
- Add unit tests for `createAuthGuard` with a fake `verifyIdToken`, plus a route test that wires the real guard to confirm 401 precedes version-gate and validation.
- Update CLAUDE.md, which currently says there is no test setup.
- No production behavior changes; no changes to `src/` beyond what tests need (none expected).

## Capabilities

### New Capabilities
<!-- None: no spec-level behavior changes. The tests verify the existing tv-top-rated, request-auth and upstream-errors specs. -->

### Modified Capabilities
<!-- None. This change sets skip_specs: true. -->

## Impact

- New files under `test/` (or `src/**/*.test.ts`, decided in design).
- `package.json`: new `vitest` devDependency and `test` script; `package-lock.json` updates accordingly.
- `CLAUDE.md`: commands section updated.
- Out of scope: tests for `/users/:id`, stubs, caching (not on this branch's base), the Firebase SDK verifier, and CI setup.
