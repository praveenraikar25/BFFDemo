# Spec Delta

## Purpose

Provides clients with a paginated list of top-rated TV series sourced from TMDB, reshaped into the BFF's camelCase format with resolved genre names and full poster URLs, gated on client app version.

## ADDED Requirements

### Requirement: Top-rated TV endpoint
The service SHALL expose `GET /tv/top`, returning status 200 with `page`, `totalPages`, `totalResults`, and a `results` array of TV shows taken from TMDB's top-rated TV list (English).

#### Scenario: Successful listing
- **WHEN** a supported client requests `GET /tv/top`
- **THEN** the response status is 200
- **AND** the body contains `page`, `totalPages`, `totalResults`, and `results` reflecting TMDB's top-rated TV list

### Requirement: Page parameter
The endpoint SHALL accept an optional `page` query parameter that MUST be an integer from 1 to 500, defaulting to 1. Out-of-range or non-integer values SHALL be rejected with status 400.

#### Scenario: Default page
- **WHEN** a supported client requests `GET /tv/top` without `page`
- **THEN** page 1 is requested from TMDB

#### Scenario: Explicit page
- **WHEN** a supported client requests `GET /tv/top?page=3`
- **THEN** page 3 is requested from TMDB

#### Scenario: Page out of range
- **WHEN** a client requests `GET /tv/top?page=0` or `GET /tv/top?page=501`
- **THEN** the response status is 400

### Requirement: App version gate
The endpoint SHALL only call TMDB when the `X-APP-VERSION` request header is an integer greater than or equal to 2. Otherwise it SHALL return status 200 with `{page: <requested page>, totalPages: 0, totalResults: 0, results: []}` without calling TMDB.

#### Scenario: Header missing
- **WHEN** a client requests `GET /tv/top?page=4` without `X-APP-VERSION`
- **THEN** the response status is 200
- **AND** the body is `{"page":4,"totalPages":0,"totalResults":0,"results":[]}`
- **AND** TMDB is not called

#### Scenario: Version below minimum
- **WHEN** a client sends `X-APP-VERSION: 1`
- **THEN** the empty result is returned without calling TMDB

#### Scenario: Non-integer version treated as missing
- **WHEN** a client sends `X-APP-VERSION: 2.5` or `X-APP-VERSION: abc`
- **THEN** the header is treated as missing and the empty result is returned with status 200, not 400

#### Scenario: Supported version
- **WHEN** a client sends `X-APP-VERSION: 2` or higher
- **THEN** TMDB is called and real results are returned

### Requirement: Show field mapping
Each item in `results` SHALL contain `id`, `name`, `overview`, `firstAirDate`, `voteAverage`, `posterUrl`, and `genres`, mapped from TMDB's `id`, `name`, `overview`, `first_air_date`, `vote_average`, `poster_path`, and `genre_ids`. `page`, `totalPages`, and `totalResults` SHALL come from TMDB's `page`, `total_pages`, and `total_results`. No other TMDB fields are exposed.

#### Scenario: Fields renamed to camelCase
- **WHEN** TMDB returns a show with `first_air_date: "2008-01-20"` and `vote_average: 8.9`
- **THEN** the BFF item has `firstAirDate: "2008-01-20"` and `voteAverage: 8.9`

### Requirement: Poster URL expansion
`posterUrl` SHALL be the full image URL `https://image.tmdb.org/t/p/w500` followed by TMDB's `poster_path`, or `null` when the show has no poster path.

#### Scenario: Poster present
- **WHEN** TMDB returns `poster_path: "/abc.jpg"`
- **THEN** `posterUrl` is `https://image.tmdb.org/t/p/w500/abc.jpg`

#### Scenario: Poster absent
- **WHEN** TMDB returns `poster_path: null`
- **THEN** `posterUrl` is `null`

### Requirement: Genre name resolution
`genres` SHALL be the list of genre names corresponding to the show's TMDB genre ids, in the same order, using TMDB's English TV genre list. An id not found in that list SHALL resolve to `"Unknown"`, and a show with no genre ids SHALL have an empty list.

#### Scenario: Known genres
- **WHEN** a show has genre ids that exist in TMDB's TV genre list
- **THEN** `genres` contains their names in the same order

#### Scenario: Unknown genre id
- **WHEN** a show has a genre id not in TMDB's TV genre list
- **THEN** that entry in `genres` is `"Unknown"`

### Requirement: Genre list caching
The TV genre list SHALL be fetched from TMDB at most once per process after a successful fetch and reused for later requests. A failed fetch SHALL NOT be cached; the next request SHALL retry it. Concurrent requests SHALL share a single in-flight fetch.

#### Scenario: Reused after success
- **WHEN** two supported requests to `GET /tv/top` are made after the genre list was fetched successfully
- **THEN** TMDB's genre list endpoint is not called again

#### Scenario: Retried after failure
- **WHEN** the genre list fetch fails and a later supported request arrives
- **THEN** the genre list is fetched again

### Requirement: TV error handling
The endpoint SHALL map failures of the top-rated call per the upstream error rules: a TMDB 401 returns 500 `{"error":"Upstream auth failed"}`, any other non-OK status returns 502 `{"error":"Upstream error"}`, timeout returns 504, and network failure returns 502. Upstream non-OK statuses SHALL be logged.

#### Scenario: TMDB rejects token
- **WHEN** TMDB's top-rated call returns 401
- **THEN** the response status is 500 with `{"error":"Upstream auth failed"}`

#### Scenario: TMDB server error
- **WHEN** TMDB's top-rated call returns 500
- **THEN** the response status is 502 with `{"error":"Upstream error"}`

### Requirement: Genre list failure fails the request
If the genre list cannot be obtained, the endpoint SHALL fail the whole request rather than return partial results: a genre-list timeout returns 504 `{"error":"Upstream timeout"}`, and any other genre-list failure (including a non-OK status such as 401) returns 502 `{"error":"Failed to reach upstream"}`.

#### Scenario: Genre list returns error status
- **WHEN** the top-rated call succeeds but the genre list call returns a non-OK status
- **THEN** the response status is 502 with `{"error":"Failed to reach upstream"}`
- **AND** no show results are returned
