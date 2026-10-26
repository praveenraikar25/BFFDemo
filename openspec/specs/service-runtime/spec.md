# service-runtime Specification

## Purpose

Defines how the BFF starts up and validates its configuration, which port it listens on, and the operational endpoints for health checks and API documentation.

## Requirements

### Requirement: TMDB read token is required at startup
The service SHALL refuse to start when the `TMDB_READ_TOKEN` configuration value is missing or empty, reporting a configuration error and exiting with a non-zero status. The service SHALL read configuration from process environment variables and, when present, a `.env` file in the working directory.

#### Scenario: Token missing
- **WHEN** the service starts without `TMDB_READ_TOKEN` set
- **THEN** it logs a configuration error stating the token is required
- **AND** the process exits with a non-zero status without accepting requests

#### Scenario: Token empty
- **WHEN** the service starts with `TMDB_READ_TOKEN` set to an empty string
- **THEN** it logs a configuration error stating the token must not be empty
- **AND** the process exits with a non-zero status

#### Scenario: Token provided via .env file
- **WHEN** `TMDB_READ_TOKEN` is not in the process environment but is defined in a `.env` file in the working directory
- **THEN** the service starts successfully

### Requirement: Listening port
The service SHALL listen on all interfaces on the port given by the `PORT` configuration value, defaulting to 3000 when `PORT` is unset or not a valid non-zero number.

#### Scenario: Default port
- **WHEN** the service starts without `PORT` set
- **THEN** it accepts HTTP requests on port 3000

#### Scenario: Custom port
- **WHEN** the service starts with `PORT=8080`
- **THEN** it accepts HTTP requests on port 8080

### Requirement: Health check
The service SHALL expose `GET /health`, which returns status 200 with body `{"status":"ok"}` and does not call any upstream service.

#### Scenario: Health check succeeds
- **WHEN** a client requests `GET /health`
- **THEN** the response status is 200
- **AND** the body is `{"status":"ok"}`

### Requirement: API documentation
The service SHALL publish an OpenAPI document generated from the request and response schemas of its routes, and SHALL serve an interactive Swagger UI at `/docs`. Routes are grouped under the tags `system`, `movies`, `users`, and `tv`. The document SHALL declare a bearer authentication scheme and mark protected routes as requiring it.

#### Scenario: Swagger UI available
- **WHEN** a client requests `GET /docs`
- **THEN** the Swagger UI is served, describing every public route

#### Scenario: Schemas reflected in documentation
- **WHEN** a route declares parameter, query, header, or response schemas
- **THEN** the OpenAPI document describes those schemas for that route

#### Scenario: Protected routes documented
- **WHEN** a client views the OpenAPI document
- **THEN** `GET /tv/top` is marked as requiring bearer authentication and lists its 401 response
- **AND** `GET /health` is not marked as requiring authentication

### Requirement: Request validation errors
The service SHALL reject requests whose path parameters, query string, or headers fail the route's declared validation with status 400 before any handler logic or upstream call runs. On protected routes, authentication runs first, so this applies only to authenticated requests.

#### Scenario: Invalid input rejected
- **WHEN** a client sends a request that violates a route's declared input validation, authenticated if the route is protected
- **THEN** the response status is 400
- **AND** no upstream service is called

### Requirement: Firebase project ID is required at startup
The service SHALL refuse to start when the `FIREBASE_PROJECT_ID` configuration value is missing or empty, reporting a configuration error and exiting with a non-zero status. It is read from the same sources as other configuration (process environment, then `.env`).

#### Scenario: Project ID missing
- **WHEN** the service starts without `FIREBASE_PROJECT_ID` set
- **THEN** it logs a configuration error stating the project ID is required
- **AND** the process exits with a non-zero status without accepting requests

#### Scenario: Project ID empty
- **WHEN** the service starts with `FIREBASE_PROJECT_ID` set to an empty string
- **THEN** it logs a configuration error stating the project ID must not be empty
- **AND** the process exits with a non-zero status

#### Scenario: Project ID provided
- **WHEN** the service starts with `FIREBASE_PROJECT_ID` and `TMDB_READ_TOKEN` set
- **THEN** the service starts successfully without any Firebase service-account credentials
