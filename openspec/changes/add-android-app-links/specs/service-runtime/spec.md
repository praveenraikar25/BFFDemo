# Spec Delta

## MODIFIED Requirements

### Requirement: API documentation
The service SHALL publish an OpenAPI document generated from the request and response schemas of its routes, and SHALL serve an interactive Swagger UI at `/docs`. Routes are grouped under the tags `system`, `movies`, `users`, `tv`, and `app-links`. The document SHALL declare a bearer authentication scheme and mark protected routes as requiring it.

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

#### Scenario: App Links routes documented as public
- **WHEN** a client views the OpenAPI document
- **THEN** `GET /.well-known/assetlinks.json` and `GET /movie/{id}` appear under the `app-links` tag
- **AND** neither is marked as requiring authentication
