# Spec Delta

## ADDED Requirements

### Requirement: Cached top-rated data
When a cache is available, `GET /tv/top` MAY serve a page's TMDB top-rated data from the cache instead of calling TMDB. The cache SHALL only be consulted after authentication and the app version gate have passed. The response SHALL be identical, including field mapping, poster URLs, and genre names, whether the data came from the cache or from TMDB. A cached page SHALL NOT be served for a different page number.

#### Scenario: Second request served from cache
- **WHEN** a supported, authenticated client requests `GET /tv/top?page=2` twice within the cache lifetime
- **THEN** TMDB's top-rated endpoint is called at most once
- **AND** both responses have the same body

#### Scenario: Gates still run first
- **WHEN** a page is cached and a client without a valid token requests it
- **THEN** the response is 401 and nothing is served from the cache

#### Scenario: Old client still gets the empty result
- **WHEN** a page is cached and an authenticated client sends `X-APP-VERSION: 1`
- **THEN** the empty result is returned, not the cached data

## MODIFIED Requirements

### Requirement: Page parameter
The endpoint SHALL accept an optional `page` query parameter that MUST be an integer from 1 to 500, defaulting to 1. Out-of-range or non-integer values SHALL be rejected with status 400.

#### Scenario: Default page
- **WHEN** a supported client requests `GET /tv/top` without `page`
- **THEN** page 1 is obtained, from the cache or from TMDB

#### Scenario: Explicit page
- **WHEN** a supported client requests `GET /tv/top?page=3`
- **THEN** page 3 is obtained, from the cache or from TMDB

#### Scenario: Page out of range
- **WHEN** a client requests `GET /tv/top?page=0` or `GET /tv/top?page=501`
- **THEN** the response status is 400

### Requirement: App version gate
For authenticated requests, the endpoint SHALL only obtain top-rated data, from the cache or from TMDB, when the `X-APP-VERSION` request header is an integer greater than or equal to 2. Otherwise it SHALL return status 200 with `{page: <requested page>, totalPages: 0, totalResults: 0, results: []}` without calling TMDB or consulting the cache. Unauthenticated requests are rejected before this gate runs.

#### Scenario: Header missing
- **WHEN** an authenticated client requests `GET /tv/top?page=4` without `X-APP-VERSION`
- **THEN** the response status is 200
- **AND** the body is `{"page":4,"totalPages":0,"totalResults":0,"results":[]}`
- **AND** TMDB is not called

#### Scenario: Version below minimum
- **WHEN** an authenticated client sends `X-APP-VERSION: 1`
- **THEN** the empty result is returned without calling TMDB

#### Scenario: Non-integer version treated as missing
- **WHEN** an authenticated client sends `X-APP-VERSION: 2.5` or `X-APP-VERSION: abc`
- **THEN** the header is treated as missing and the empty result is returned with status 200, not 400

#### Scenario: Supported version
- **WHEN** an authenticated client sends `X-APP-VERSION: 2` or higher
- **THEN** real results are returned, obtained from TMDB or from the cache

### Requirement: Authentication required
`GET /tv/top` SHALL be a protected route under the request authentication rules. Every request SHALL carry a valid Firebase ID token. A request without one SHALL receive 401 `{"error":"Unauthorized"}` before the app version gate runs, whatever its `X-APP-VERSION` value, and neither TMDB nor the cache SHALL be consulted.

#### Scenario: No token, supported version
- **WHEN** a client sends `X-APP-VERSION: 2` without an `Authorization` header
- **THEN** the response status is 401 with `{"error":"Unauthorized"}`
- **AND** TMDB is not called

#### Scenario: No token, old version
- **WHEN** a client sends `X-APP-VERSION: 1`, or no version header, without an `Authorization` header
- **THEN** the response status is 401, not the empty 200 result

#### Scenario: Valid token, supported version
- **WHEN** a client sends a valid Firebase ID token and `X-APP-VERSION: 2`
- **THEN** real results are returned with status 200, obtained from TMDB or from the cache
