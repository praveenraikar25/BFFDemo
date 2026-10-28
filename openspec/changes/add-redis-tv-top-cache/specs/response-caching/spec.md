# Spec Delta

## Purpose

Defines how the BFF optionally caches upstream responses in Redis to avoid repeat upstream calls, and guarantees that an absent, slow, or failing cache never changes what clients receive or makes a request fail.

## ADDED Requirements

### Requirement: Cache is optional
The service SHALL support running with or without a cache. When no Redis connection URL is configured, the service SHALL serve every request without caching, with behavior identical to a service that has no cache.

#### Scenario: No Redis configured
- **WHEN** the service starts without `REDIS_URL` set
- **THEN** it starts successfully and every `GET /tv/top` request that passes the gates calls TMDB

### Requirement: Cache failures act as misses
Any cache read or write failure (connection error, timeout, Redis unavailable) SHALL be treated as a cache miss. The request SHALL still be served from the upstream, the failure SHALL be logged, and the failure SHALL NOT change the response status or body. Cache commands SHALL fail fast while Redis is disconnected, without queueing or delaying the request until Redis returns.

#### Scenario: Redis goes down while running
- **WHEN** Redis becomes unreachable after the service started and a supported client requests `GET /tv/top`
- **THEN** the response is the same 200 result it would have been with no cache
- **AND** the cache failure is logged
- **AND** the response is not delayed until Redis reconnects

#### Scenario: Cache write fails
- **WHEN** TMDB returns a successful response but storing it in the cache fails
- **THEN** the client still receives the 200 result

### Requirement: Startup tolerates an unreachable cache
The service SHALL start and accept requests even when a configured Redis cannot be reached at startup. It SHALL log a warning and serve uncached until the connection is established. A `REDIS_URL` that is not a valid Redis URL SHALL be rejected as a configuration error.

#### Scenario: Redis down at boot
- **WHEN** the service starts with a valid `REDIS_URL` but nothing is listening there
- **THEN** it logs a warning and starts accepting requests
- **AND** `GET /tv/top` requests are served from TMDB

#### Scenario: Invalid URL
- **WHEN** the service starts with `REDIS_URL` set to a value that is not a Redis URL
- **THEN** it logs a configuration error and exits with a non-zero status

### Requirement: Namespaced, versioned cache keys
Cache keys SHALL carry a service namespace prefix and a version segment, and SHALL include every upstream parameter that affects the cached payload. Changing the version segment SHALL cause previously cached entries to be ignored.

#### Scenario: Different pages do not collide
- **WHEN** page 1 and page 2 of the top-rated list are cached
- **THEN** each is stored under its own key and a request for one never returns the other

#### Scenario: Version bump invalidates
- **WHEN** the key version segment is changed and the service restarts
- **THEN** entries stored under the old version are not served

### Requirement: Entries expire
Every cached entry SHALL be stored with a time-to-live so that stale data is eventually refreshed from the upstream. The top-rated TV list SHALL be cached for approximately one hour.

#### Scenario: Entry expires
- **WHEN** a cached top-rated page's time-to-live has elapsed and a supported client requests it
- **THEN** TMDB is called again and the cache entry is refreshed

### Requirement: Errors are never cached
Upstream error outcomes (non-OK statuses, timeouts, network failures) SHALL NOT be stored in the cache. Only successful upstream responses SHALL be cached.

#### Scenario: Upstream failure then recovery
- **WHEN** TMDB returns a 500 for a page and a later request for the same page arrives after TMDB recovers
- **THEN** the later request calls TMDB and succeeds, rather than replaying the earlier failure
