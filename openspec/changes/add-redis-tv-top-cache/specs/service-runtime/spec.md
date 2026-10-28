# Spec Delta

## ADDED Requirements

### Requirement: Redis URL is optional configuration
The service SHALL accept an optional `REDIS_URL` configuration value, read from the same sources as other configuration (process environment, then `.env`). When it is unset or empty, the service SHALL start normally without a cache. When it is set to a value that is not a valid Redis URL, the service SHALL report a configuration error and exit with a non-zero status. An unreachable Redis server SHALL NOT prevent startup.

#### Scenario: Unset
- **WHEN** the service starts without `REDIS_URL`
- **THEN** it starts successfully and serves requests without a cache

#### Scenario: Valid URL provided via .env file
- **WHEN** `REDIS_URL` is defined only in a `.env` file in the working directory
- **THEN** the service uses it to configure the cache

#### Scenario: Malformed URL
- **WHEN** the service starts with `REDIS_URL=not-a-url`
- **THEN** it logs a configuration error and exits with a non-zero status without accepting requests

#### Scenario: Server unreachable
- **WHEN** the service starts with a well-formed `REDIS_URL` that nothing is listening on
- **THEN** it starts successfully and serves requests without a working cache
