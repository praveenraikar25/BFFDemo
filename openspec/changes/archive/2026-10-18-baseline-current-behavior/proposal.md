# Proposal

## Why

The project has adopted OpenSpec but has no specs, so there is no recorded contract for what the BFF currently does. Capturing a baseline of existing behavior lets future changes be expressed as precise deltas against it.

## What Changes

- Document the current, observable behavior of every endpoint and cross-cutting concern as baseline specs.
- No code, API, or behavior changes. Known quirks (e.g. non-integer `X-APP-VERSION` treated as missing, `/users/:id` echoing undeclared upstream statuses) are recorded as-is; fixing them is left to future changes.

## Capabilities

### New Capabilities
- `service-runtime`: Startup configuration validation, listening port, health check, and OpenAPI/Swagger documentation.
- `upstream-errors`: Shared upstream call timeout and the mapping of upstream timeouts, network failures, and non-OK responses to BFF status codes.
- `tv-top-rated`: `GET /tv/top` — app-version gating, pagination, TMDB response reshaping, genre name resolution and caching, and error handling.
- `user-lookup`: `GET /users/:id` — id validation and proxying of JSONPlaceholder users, including upstream status echoing.
- `movie-catalog`: `GET /movies/:id` and `GET /search` — input validation and placeholder (stub) responses.

### Modified Capabilities
<!-- None: no specs exist yet. -->

## Impact

None. Documentation-only change; no code, dependencies, or APIs are affected.
