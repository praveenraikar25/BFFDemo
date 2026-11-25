# demo-bff

A small Fastify backend-for-frontend for the MovieGallery app. It reshapes upstream APIs (TMDB, JSONPlaceholder) for the client, verifies Firebase sign-in on protected routes, and serves the files Android needs to open `/movie/{id}` links in the app.

API docs (Swagger UI) are served at `/docs`.

## Setup

Requires Node.js 22 or later.

```sh
npm install            # also builds dist/
cp .env.example .env   # then fill in the required values
npm run dev
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Run `src/server.ts` with hot reload |
| `npm run build` | Type-check and compile to `dist/`. This is also the project's lint step. |
| `npm start` | Run the compiled `dist/server.js` |
| `npm test` | Run the tests in `test/` with Node's built-in test runner |

## Environment variables

Read from the process environment, then from `.env` in the working directory if present. On Render, set them under the service's **Environment** tab.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `TMDB_READ_TOKEN` | Yes | — | TMDB v4 read access token |
| `FIREBASE_PROJECT_ID` | Yes | — | Firebase project whose ID tokens are accepted. No service-account credentials needed. |
| `PORT` | No | `3000` | Listening port. Render sets this automatically. |
| `ANDROID_SHA256_CERT_FINGERPRINTS` | No | Debug key `B8:B8:DF:…:AD:6E` | Comma-separated SHA-256 signing-certificate fingerprints served in `/.well-known/assetlinks.json`. Each must be 32 uppercase hex pairs separated by colons. Invalid entries are logged and skipped. |
| `APP_STORE_URL` | No | unset | Target of the "Get the app" button on `/movie/{id}` pages. Must be an absolute `http(s)` URL, or the server won't start. The button is hidden when unset. |

The server exits at startup if a required variable is missing or `APP_STORE_URL` is invalid.

## Android App Links

The Android app (`com.raikar.moviegallery`) opens `https://<this host>/movie/{id}` links directly. Two public routes support this, and neither requires a Firebase token:

- `GET /.well-known/assetlinks.json` is the Digital Asset Links file Android fetches to verify that the app may handle this host's links.
- `GET /movie/{id}` is a small web page for people who open a link without the app installed. It has an "Open in app" link (`moviegallery://movie/{id}`) and, if `APP_STORE_URL` is set, a "Get the app" link. Ids must be 1 to 2147483647. Anything else returns 404.

The host is never configured. The routes work on whatever hostname serves them.

### Signing fingerprints

`ANDROID_SHA256_CERT_FINGERPRINTS` must list the certificate that signed the APK installed on the device. List several, comma-separated, to cover release, QA, and debug builds.

- **Play Store builds:** Play Console → your app → **Test and release → App integrity → App signing**, under **App signing key certificate**, copy the SHA-256. With Play App Signing, use this key, not the upload key.
- **Local or QA builds:** run `./gradlew signingReport` in the Android project, or use `keytool -list -v -keystore <keystore> -alias <alias>`.

If this variable is not set, only the debug key is served, and release builds won't open links in the app. The startup log line `Serving Android App Links fingerprints` shows which keys are live.

### Verifying a deployment

Set `HOST` to the service's hostname, for example `HOST=<service>.onrender.com`.

```sh
# 200, content-type: application/json, cache-control: public, max-age=3600, no Location header
curl -i https://$HOST/.well-known/assetlinks.json

# 200, content-type: text/html; charset=utf-8, no Location header; body links to moviegallery://movie/603
curl -i https://$HOST/movie/603

# Google's view of the statement (should list com.raikar.moviegallery)
curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://$HOST&relation=delegate_permission/common.handle_all_urls"

# On a device with the app installed
adb shell pm verify-app-links --re-verify com.raikar.moviegallery
adb shell pm get-app-links com.raikar.moviegallery   # the host should show "verified"
```

Neither `curl` command sends an `Authorization` header. A 200 confirms that the routes are public.

To check locally, run `npm run dev` and use `http://localhost:3000` in place of `https://$HOST`.

**Cold starts:** Render free instances sleep when idle, and the first request can take tens of seconds. Android retries verification, but a slow first fetch can delay link handling right after install. A paid instance avoids this.
