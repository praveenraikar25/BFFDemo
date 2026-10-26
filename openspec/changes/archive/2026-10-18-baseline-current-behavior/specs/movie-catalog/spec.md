# Spec Delta

## Purpose

Reserves the movie lookup and search endpoints with their input contracts. Responses are currently placeholders that do not call any upstream; real data is expected to replace them in a future change.

## ADDED Requirements

### Requirement: Movie lookup input
The service SHALL expose `GET /movies/:id`, where `id` MUST consist only of digits; any other value SHALL be rejected with status 400.

#### Scenario: Non-numeric movie id
- **WHEN** a client requests `GET /movies/abc`
- **THEN** the response status is 400

### Requirement: Movie lookup placeholder response
For a valid id, `GET /movies/:id` SHALL return status 200 with `{"id":"<id>","title":"Movie <id>"}`, where `id` is returned as a string, without calling any upstream.

#### Scenario: Placeholder movie
- **WHEN** a client requests `GET /movies/42`
- **THEN** the response status is 200
- **AND** the body is `{"id":"42","title":"Movie 42"}`

### Requirement: Search input
The service SHALL expose `GET /search` with a required, non-empty `q` query parameter and an optional `limit` that MUST be a positive integer no greater than 50. Requests violating these rules SHALL be rejected with status 400.

#### Scenario: Missing query
- **WHEN** a client requests `GET /search` without `q`
- **THEN** the response status is 400

#### Scenario: Limit too large
- **WHEN** a client requests `GET /search?q=matrix&limit=51`
- **THEN** the response status is 400

### Requirement: Search placeholder response
For valid input, `GET /search` SHALL return status 200 with `{"results":["stub result for \"<q>\""]}`, a single placeholder entry regardless of `limit`, without calling any upstream.

#### Scenario: Placeholder search
- **WHEN** a client requests `GET /search?q=matrix&limit=10`
- **THEN** the response status is 200
- **AND** the body is `{"results":["stub result for \"matrix\""]}`
