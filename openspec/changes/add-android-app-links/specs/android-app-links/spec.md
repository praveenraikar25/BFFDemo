# Spec Delta

## Purpose

Lets the MovieGallery Android app claim `https://<bff host>/movie/{id}` links as verified Android App Links, and gives a simple web page to people who open those links without the app installed.

## ADDED Requirements

### Requirement: Digital Asset Links file
The service SHALL expose `GET /.well-known/assetlinks.json`. It returns status 200 directly, never a redirect, with body `[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"com.raikar.moviegallery","sha256_cert_fingerprints":[<fingerprints>]}}]`. The response SHALL NOT depend on the request's host.

#### Scenario: File served
- **WHEN** a client requests `GET /.well-known/assetlinks.json`
- **THEN** the response status is 200
- **AND** the body is a JSON array with one statement whose `relation` is `["delegate_permission/common.handle_all_urls"]`, `target.namespace` is `android_app`, and `target.package_name` is `com.raikar.moviegallery`
- **AND** the response has no `Location` header

#### Scenario: Any host
- **WHEN** the file is requested with two different `Host` header values
- **THEN** both responses have identical bodies

#### Scenario: Trailing slash is not redirected
- **WHEN** a client requests `GET /.well-known/assetlinks.json/`
- **THEN** the response is not a redirect

### Requirement: Asset links response headers
The Digital Asset Links response SHALL have `Content-Type: application/json` and `Cache-Control: public, max-age=3600`.

#### Scenario: Headers present
- **WHEN** a client requests `GET /.well-known/assetlinks.json`
- **THEN** the `Content-Type` header is `application/json`
- **AND** the `Cache-Control` header is `public, max-age=3600`

### Requirement: Asset links file is public
`GET /.well-known/assetlinks.json` SHALL NOT require authentication. A request without an `Authorization` header, or with an invalid one, SHALL receive the file.

#### Scenario: No Authorization header
- **WHEN** a client requests the file without an `Authorization` header
- **THEN** the response status is 200 with the asset links body

#### Scenario: Invalid token ignored
- **WHEN** a client requests the file with `Authorization: Bearer garbage`
- **THEN** the response status is 200 with the asset links body

### Requirement: Fingerprint configuration
`sha256_cert_fingerprints` SHALL come from the optional `ANDROID_SHA256_CERT_FINGERPRINTS` setting, a comma-separated list. Each entry is trimmed, and empty entries are ignored. Order is preserved. When the setting is unset or blank, the list SHALL default to `B8:B8:DF:5E:F6:D8:88:4C:AE:43:AD:93:94:6C:FC:A2:DF:B3:AA:85:1A:30:EE:B6:18:22:0C:B0:49:F8:AD:6E`.

#### Scenario: Default when unset
- **WHEN** the service starts without `ANDROID_SHA256_CERT_FINGERPRINTS`
- **THEN** `sha256_cert_fingerprints` is `["B8:B8:DF:5E:F6:D8:88:4C:AE:43:AD:93:94:6C:FC:A2:DF:B3:AA:85:1A:30:EE:B6:18:22:0C:B0:49:F8:AD:6E"]`

#### Scenario: Multiple values with whitespace
- **WHEN** the setting is ` <fpA> , <fpB>,, ` where `<fpA>` and `<fpB>` are valid fingerprints
- **THEN** `sha256_cert_fingerprints` is `["<fpA>","<fpB>"]`

### Requirement: Invalid fingerprints are not served
A configured fingerprint SHALL be served only if it matches exactly 32 two-character uppercase hexadecimal pairs separated by colons. Invalid entries SHALL be omitted and logged at startup. If no valid entry remains, the list SHALL be empty and an error SHALL be logged. The service SHALL still start.

#### Scenario: Invalid entry dropped
- **WHEN** the setting contains one valid fingerprint, one lowercase fingerprint, and the value `not-a-key`
- **THEN** only the valid fingerprint is served
- **AND** a warning naming the two rejected entries is logged

#### Scenario: Nothing valid
- **WHEN** every configured entry is invalid
- **THEN** the service starts and serves `sha256_cert_fingerprints: []`
- **AND** an error is logged

### Requirement: Movie link fallback page
The service SHALL expose `GET /movie/:id`, returning status 200 with `Content-Type: text/html` and an HTML page that names the app (MovieGallery), says the link opens in the MovieGallery app, and has an "Open in app" link to `moviegallery://movie/<id>`, where `<id>` is the id in canonical decimal form without leading zeros.

#### Scenario: Valid id
- **WHEN** a client requests `GET /movie/603`
- **THEN** the response status is 200 with a `text/html` content type
- **AND** the page contains a link with `href="moviegallery://movie/603"`

#### Scenario: Leading zeros normalized
- **WHEN** a client requests `GET /movie/0603`
- **THEN** the response status is 200
- **AND** the page links to `moviegallery://movie/603`

### Requirement: Movie id validation
`GET /movie/:id` SHALL respond 404 unless `id` is 1 to 10 ASCII digits whose value is between 1 and 2147483647. The 404 response SHALL NOT include the requested id. No other request input SHALL appear in any response from this route.

#### Scenario: Rejected ids
- **WHEN** a client requests `/movie/abc`, `/movie/0`, `/movie/-5`, `/movie/12345678901`, `/movie/2147483648`, `/movie/1e3`, or `/movie/%3Cscript%3E`
- **THEN** each response status is 404
- **AND** no response body contains the requested id

#### Scenario: Upper bound accepted
- **WHEN** a client requests `GET /movie/2147483647`
- **THEN** the response status is 200

#### Scenario: Query string not reflected
- **WHEN** a client requests `GET /movie/603?x=<script>alert(1)</script>`
- **THEN** the response status is 200
- **AND** the body does not contain `<script>`

### Requirement: Store link
When the optional `APP_STORE_URL` setting is set, the fallback page SHALL include a "Get the app" link to that URL, HTML-escaped. When it is unset or blank, the page SHALL omit that link. The service SHALL refuse to start if `APP_STORE_URL` is set to a value that is not an absolute `http` or `https` URL.

#### Scenario: Store URL set
- **WHEN** `APP_STORE_URL` is `https://play.google.com/store/apps/details?id=com.raikar.moviegallery&hl=en`
- **THEN** the page has a "Get the app" link with `href="https://play.google.com/store/apps/details?id=com.raikar.moviegallery&amp;hl=en"`

#### Scenario: Store URL unset
- **WHEN** `APP_STORE_URL` is not set
- **THEN** the page has no "Get the app" link

#### Scenario: Store URL not http(s)
- **WHEN** the service starts with `APP_STORE_URL=javascript:alert(1)`
- **THEN** it logs a configuration error and exits with a non-zero status

### Requirement: Fallback page is self-contained
The fallback page SHALL load no external scripts, stylesheets, fonts, images, or trackers. It SHALL include a mobile viewport meta tag. The response SHALL carry a `Content-Security-Policy` header that blocks scripts, and `X-Content-Type-Options: nosniff`.

#### Scenario: No external resources
- **WHEN** a client requests `GET /movie/603`
- **THEN** the HTML contains no `<script>` element and no `src=` attribute or `<link rel="stylesheet">` that refers to another resource
- **AND** it contains `<meta name="viewport"`
- **AND** the `Content-Security-Policy` header includes `default-src 'none'`

### Requirement: Fallback page is public
`GET /movie/:id` SHALL NOT require authentication.

#### Scenario: No Authorization header
- **WHEN** a client requests `GET /movie/603` without an `Authorization` header
- **THEN** the response status is 200

### Requirement: Existing routes unaffected
Adding App Links support SHALL NOT change the behavior of existing routes. Protected routes SHALL still reject unauthenticated requests, and `GET /movies/:id` keeps its existing contract.

#### Scenario: Protected route still protected
- **WHEN** a client calls `GET /tv/top` without an `Authorization` header on a service that also serves the App Links routes
- **THEN** the response status is 401 with `{"error":"Unauthorized"}`
