# Spec Delta

## Purpose

Defines how the BFF bounds calls to upstream APIs and translates upstream failures into its own error responses, so clients see consistent statuses regardless of which upstream failed.

## ADDED Requirements

### Requirement: Upstream call timeout
Every call the BFF makes to an upstream API SHALL be aborted if it has not completed within 3 seconds.

#### Scenario: Slow upstream aborted
- **WHEN** an upstream API takes longer than 3 seconds to respond
- **THEN** the BFF abandons the upstream call

### Requirement: Upstream timeout maps to 504
When an upstream call is aborted because of the timeout, the BFF SHALL respond with status 504 and body `{"error":"Upstream timeout"}`.

#### Scenario: Timeout response
- **WHEN** an upstream call exceeds the timeout during a client request
- **THEN** the response status is 504
- **AND** the body is `{"error":"Upstream timeout"}`

### Requirement: Upstream network failure maps to 502
When an upstream call fails without a response for any reason other than the timeout (for example DNS failure, refused connection, or an unreadable response body), the BFF SHALL respond with status 502 and body `{"error":"Failed to reach upstream"}`.

#### Scenario: Upstream unreachable
- **WHEN** the upstream host cannot be reached during a client request
- **THEN** the response status is 502
- **AND** the body is `{"error":"Failed to reach upstream"}`

### Requirement: Upstream non-OK responses are not passed through by default
When an upstream API returns a non-success status, the BFF SHALL respond with status 502 and an error body rather than forwarding the upstream status, unless a capability explicitly specifies different handling.

#### Scenario: Upstream server error
- **WHEN** an upstream API returns status 503 and the capability defines no override
- **THEN** the response status is 502
- **AND** the body contains an `error` message

### Requirement: Upstream credential rejection maps to 500
When TMDB rejects the BFF's credentials with status 401, the BFF SHALL respond with status 500 and body `{"error":"Upstream auth failed"}`, because the fault lies in the BFF's configuration, not the caller's request. The upstream 401 SHALL NOT be forwarded to the client.

#### Scenario: Invalid TMDB token
- **WHEN** TMDB responds with status 401 to a BFF request
- **THEN** the client receives status 500
- **AND** the body is `{"error":"Upstream auth failed"}`
