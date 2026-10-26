# Spec Delta

## ADDED Requirements

### Requirement: Authentication required
`GET /tv/top` SHALL be a protected route under the request authentication rules. Every request SHALL carry a valid Firebase ID token. A request without one SHALL receive 401 `{"error":"Unauthorized"}` before the app version gate runs, whatever its `X-APP-VERSION` value, and TMDB SHALL NOT be called.

#### Scenario: No token, supported version
- **WHEN** a client sends `X-APP-VERSION: 2` without an `Authorization` header
- **THEN** the response status is 401 with `{"error":"Unauthorized"}`
- **AND** TMDB is not called

#### Scenario: No token, old version
- **WHEN** a client sends `X-APP-VERSION: 1`, or no version header, without an `Authorization` header
- **THEN** the response status is 401, not the empty 200 result

#### Scenario: Valid token, supported version
- **WHEN** a client sends a valid Firebase ID token and `X-APP-VERSION: 2`
- **THEN** TMDB is called and real results are returned with status 200

## MODIFIED Requirements

### Requirement: App version gate
For authenticated requests, the endpoint SHALL only call TMDB when the `X-APP-VERSION` request header is an integer greater than or equal to 2. Otherwise it SHALL return status 200 with `{page: <requested page>, totalPages: 0, totalResults: 0, results: []}` without calling TMDB. Unauthenticated requests are rejected before this gate runs.

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
- **THEN** TMDB is called and real results are returned
