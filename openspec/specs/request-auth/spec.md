# request-auth Specification

## Purpose

Ensures that protected BFF routes serve only requests from users signed in to the app through Firebase Authentication, by verifying the Firebase ID token each request carries.

## Requirements

### Requirement: Bearer token required on protected routes
A protected route SHALL require an `Authorization` header in the form `Bearer <token>`. A request whose header is missing, uses another scheme, or has an empty token SHALL be rejected as unauthenticated.

#### Scenario: Header missing
- **WHEN** a client calls a protected route without an `Authorization` header
- **THEN** the request is rejected as unauthenticated

#### Scenario: Wrong scheme
- **WHEN** a client sends `Authorization: Basic abc123` to a protected route
- **THEN** the request is rejected as unauthenticated

#### Scenario: Empty bearer token
- **WHEN** a client sends `Authorization: Bearer ` with no token
- **THEN** the request is rejected as unauthenticated

### Requirement: Firebase ID token verification
A bearer token SHALL be accepted only if it is a Firebase ID token issued for the configured Firebase project: a valid Google signature, `aud` equal to the project ID, `iss` equal to `https://securetoken.google.com/<projectId>`, not expired, and a non-empty `sub`. Any other token SHALL be rejected as unauthenticated.

#### Scenario: Valid token
- **WHEN** a client sends a current Firebase ID token issued for the configured project
- **THEN** the request proceeds to the route handler

#### Scenario: Expired token
- **WHEN** a client sends a Firebase ID token whose expiry time has passed
- **THEN** the request is rejected as unauthenticated

#### Scenario: Token for another Firebase project
- **WHEN** a client sends a Firebase ID token whose `aud` is a different project ID
- **THEN** the request is rejected as unauthenticated

#### Scenario: Malformed or tampered token
- **WHEN** a client sends a bearer value that is not a well-formed JWT, or whose signature does not verify
- **THEN** the request is rejected as unauthenticated

### Requirement: Sign-in method and email verification are not restricted
Valid Firebase ID tokens SHALL be accepted regardless of sign-in provider and regardless of whether the user's email address is verified.

#### Scenario: Email/password user
- **WHEN** a client sends a valid token whose sign-in provider is `password`
- **THEN** the request proceeds

#### Scenario: Google user
- **WHEN** a client sends a valid token whose sign-in provider is `google.com`
- **THEN** the request proceeds

#### Scenario: Unverified email
- **WHEN** a client sends a valid token with `email_verified: false`
- **THEN** the request proceeds

### Requirement: Revocation is not checked
Token verification SHALL NOT check whether the token or the user's session has been revoked or the account disabled. Such a token SHALL be accepted until it expires.

#### Scenario: Token of a disabled user before expiry
- **WHEN** a user's account is disabled after their token was issued and the token has not yet expired
- **THEN** a request with that token proceeds

### Requirement: Unauthenticated response
A request rejected as unauthenticated SHALL receive status 401 with body `{"error":"Unauthorized"}` and the header `WWW-Authenticate: Bearer`. The response SHALL NOT reveal why the token was rejected. The reason SHALL be logged. No upstream data API SHALL be called.

#### Scenario: Identical response for every rejection reason
- **WHEN** a request is rejected because the header is missing, the token is expired, or the signature is invalid
- **THEN** each response has status 401, body `{"error":"Unauthorized"}`, and `WWW-Authenticate: Bearer`

#### Scenario: Upstream not called
- **WHEN** a request to a protected route is rejected as unauthenticated
- **THEN** the route's upstream API is not called

### Requirement: Authentication runs before other request processing
On a protected route, authentication SHALL run before input validation and before any route logic. An unauthenticated request SHALL receive 401 even when its parameters, query string, or other headers are also invalid.

#### Scenario: Unauthenticated request with invalid query
- **WHEN** a client calls a protected route with no token and an invalid query parameter
- **THEN** the response status is 401, not 400

### Requirement: Signing key retrieval failure
If Google's public signing keys are needed and cannot be retrieved, the token cannot be verified and the request SHALL be rejected as unauthenticated (401). Token verification SHALL complete or fail within 3 seconds. A verification that has not completed by then SHALL also be rejected as unauthenticated.

#### Scenario: Key retrieval fails
- **WHEN** the signing keys are not cached and fetching them fails with a network error or non-OK status
- **THEN** the response status is 401 with `{"error":"Unauthorized"}`

#### Scenario: Key retrieval hangs
- **WHEN** the signing keys are not cached and fetching them does not complete within 3 seconds
- **THEN** the response status is 401 with `{"error":"Unauthorized"}` within about 3 seconds of the request

### Requirement: Signing keys are reused while valid
Retrieved signing keys SHALL be reused for later requests until the cache lifetime that Google publishes for them expires, so that verifying a token does not normally require a network call.

#### Scenario: Keys reused
- **WHEN** two authenticated requests arrive within the keys' published cache lifetime
- **THEN** the signing keys are fetched at most once
