import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

export const ANDROID_PACKAGE_NAME = 'com.raikar.moviegallery';
export const DEFAULT_SHA256_CERT_FINGERPRINT =
  'B8:B8:DF:5E:F6:D8:88:4C:AE:43:AD:93:94:6C:FC:A2:DF:B3:AA:85:1A:30:EE:B6:18:22:0C:B0:49:F8:AD:6E';

const FINGERPRINT_PATTERN = /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/;
const MAX_MOVIE_ID = 2147483647; // Int max on the app side
const APP_SCHEME_MOVIE_URL = 'moviegallery://movie/';

// Optional settings, merged into the server's env schema.
export const appLinksEnvSchema = z.object({
  ANDROID_SHA256_CERT_FINGERPRINTS: z.string().optional(),
  // Blank means unset. Anything else must be http(s): escaping alone would not stop a javascript: URL.
  APP_STORE_URL: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .pipe(
      z
        .url({ protocol: /^https?$/, error: 'APP_STORE_URL must be an absolute http(s) URL' })
        .optional()
    )
    .optional(),
});

// Comma-separated, trimmed, empties ignored. Unset or blank falls back to the debug key.
export function parseFingerprints(raw: string | undefined): { valid: string[]; invalid: string[] } {
  if (raw === undefined || raw.trim() === '') {
    return { valid: [DEFAULT_SHA256_CERT_FINGERPRINT], invalid: [] };
  }
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const entry of raw.split(',').map((part) => part.trim()).filter(Boolean)) {
    (FINGERPRINT_PATTERN.test(entry) ? valid : invalid).push(entry);
  }
  return { valid, invalid };
}

const assetLinksSchema = z.array(
  z.object({
    relation: z.array(z.string()),
    target: z.object({
      namespace: z.literal('android_app'),
      package_name: z.string(),
      sha256_cert_fingerprints: z.array(z.string()),
    }),
  })
);

const HTML_SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

interface AppLinksRouteDeps {
  sha256CertFingerprints: string[];
  appStoreUrl?: string;
}

// Both routes are public on purpose: Android's verifier and app-less browsers send no token.
export function registerAppLinksRoutes(
  app: FastifyInstance<any, any, any, any, ZodTypeProvider>,
  { sha256CertFingerprints, appStoreUrl }: AppLinksRouteDeps
) {
  // Sent as a Buffer so Fastify keeps Content-Type exactly application/json (it appends a charset to strings and objects).
  const assetLinksBody = Buffer.from(
    JSON.stringify([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: ANDROID_PACKAGE_NAME,
          sha256_cert_fingerprints: sha256CertFingerprints,
        },
      },
    ])
  );

  app.get('/.well-known/assetlinks.json', {
    schema: {
      tags: ['app-links'],
      summary: 'Digital Asset Links for the Android app',
      description: `Lets Android verify that ${ANDROID_PACKAGE_NAME} may open this host's links. Public; no auth.`,
      response: { 200: assetLinksSchema },
    },
  }, async (_request, reply) => {
    return reply
      .type('application/json')
      .header('Cache-Control', 'public, max-age=3600')
      .send(assetLinksBody as any); // typed against the schema object; the Buffer is that object, pre-serialized
  });

  const notFoundPage = renderPage(
    '<h1>Link not found</h1>\n<p>This MovieGallery link isn’t valid.</p>'
  );

  app.get('/movie/:id', {
    schema: {
      tags: ['app-links'],
      summary: 'Web fallback for MovieGallery movie links',
      description:
        'HTML page shown when a movie link is opened without the app installed. ' +
        `Valid ids are 1–10 digits in the range 1–${MAX_MOVIE_ID}; anything else is 404. Public; no auth.`,
      // Any string passes here; the handler validates so bad ids get 404, not 400.
      params: z.object({ id: z.string() }),
      response: {
        200: z.string().describe('text/html page'),
        404: z.string().describe('text/html page'),
      },
    },
  }, async (request, reply) => {
    reply.type('text/html; charset=utf-8').headers(HTML_SECURITY_HEADERS);

    const movieId = parseMovieId(request.params.id);
    if (movieId === null) {
      return reply.code(404).send(notFoundPage);
    }
    return reply.send(renderMoviePage(movieId, appStoreUrl));
  });
}

function parseMovieId(raw: string): string | null {
  if (!/^\d{1,10}$/.test(raw)) return null;
  const value = Number(raw);
  if (value < 1 || value > MAX_MOVIE_ID) return null;
  return String(value); // canonical form, no leading zeros
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMoviePage(movieId: string, appStoreUrl: string | undefined): string {
  const storeLink = appStoreUrl
    ? `\n<a class="button" href="${escapeHtml(appStoreUrl)}">Get the app</a>`
    : '';
  return renderPage(
    '<h1>MovieGallery</h1>\n' +
      '<p>This link opens in the MovieGallery app.</p>\n' +
      `<a class="button primary" href="${escapeHtml(APP_SCHEME_MOVIE_URL + movieId)}">Open in app</a>` +
      storeLink
  );
}

function renderPage(content: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>MovieGallery</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: Canvas; color: CanvasText; }
  main { width: 100%; max-width: 420px; padding: 32px 16px; box-sizing: border-box; text-align: center; }
  h1 { font-size: 1.75rem; margin: 0 0 12px; }
  p { font-size: 1.05rem; line-height: 1.5; margin: 0 0 28px; opacity: .8; }
  .button { display: block; padding: 14px 20px; margin: 0 0 12px; border-radius: 10px; font-size: 1.05rem;
    font-weight: 600; text-decoration: none; border: 2px solid #3b5bdb; color: #3b5bdb; }
  .button.primary { background: #3b5bdb; color: #fff; }
  @media (prefers-color-scheme: dark) { .button:not(.primary) { border-color: #91a7ff; color: #91a7ff; } }
</style>
</head>
<body>
<main>
${content}
</main>
</body>
</html>
`;
}
