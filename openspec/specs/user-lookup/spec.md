# user-lookup Specification

## Purpose

Lets clients fetch a single user profile by id, proxied from the JSONPlaceholder users API with a fixed response shape.

## Requirements

### Requirement: User lookup endpoint
The service SHALL expose `GET /users/:id`, fetching `https://jsonplaceholder.typicode.com/users/:id` and returning status 200 with the user's `id`, `name`, `username`, `email`, `address` (`street`, `suite`, `city`, `zipcode`, `geo.lat`, `geo.lng`), `phone`, `website`, and `company` (`name`, `catchPhrase`, `bs`). Fields outside this shape SHALL be omitted.

#### Scenario: Existing user
- **WHEN** a client requests `GET /users/1` and JSONPlaceholder returns that user
- **THEN** the response status is 200
- **AND** the body contains the user in the documented shape

### Requirement: Numeric user id
The `id` path parameter MUST consist only of digits; any other value SHALL be rejected with status 400 without calling the upstream.

#### Scenario: Non-numeric id
- **WHEN** a client requests `GET /users/abc`
- **THEN** the response status is 400
- **AND** JSONPlaceholder is not called

### Requirement: Upstream status is echoed
Unlike other upstream-backed routes, when JSONPlaceholder returns a non-success status the endpoint SHALL respond with that same status and body `{"error":"Upstream error","status":<upstream status>}`. Only 404 is declared in the route's documented responses; other echoed statuses are returned undeclared.

#### Scenario: User not found
- **WHEN** JSONPlaceholder returns 404 for `GET /users/999`
- **THEN** the response status is 404
- **AND** the body is `{"error":"Upstream error","status":404}`

#### Scenario: Upstream server error echoed
- **WHEN** JSONPlaceholder returns 500
- **THEN** the response status is 500 with `{"error":"Upstream error","status":500}`

### Requirement: User lookup timeout and network errors
The endpoint SHALL follow the shared upstream rules for failures without a response: timeout returns 504 `{"error":"Upstream timeout"}`, and network failure returns 502 `{"error":"Failed to reach upstream"}`.

#### Scenario: JSONPlaceholder times out
- **WHEN** JSONPlaceholder does not respond within 3 seconds
- **THEN** the response status is 504 with `{"error":"Upstream timeout"}`
