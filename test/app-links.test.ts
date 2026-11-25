import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import {
  ANDROID_PACKAGE_NAME,
  DEFAULT_SHA256_CERT_FINGERPRINT,
  appLinksEnvSchema,
  parseFingerprints,
  registerAppLinksRoutes,
} from '../src/routes/app-links.js';

const FP_A = DEFAULT_SHA256_CERT_FINGERPRINT;
const FP_B = '14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5';

function buildApp(deps: { sha256CertFingerprints?: string[]; appStoreUrl?: string } = {}) {
  const app = Fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerAppLinksRoutes(app, {
    sha256CertFingerprints: deps.sha256CertFingerprints ?? [FP_A],
    appStoreUrl: deps.appStoreUrl,
  });
  return app;
}

describe('parseFingerprints', () => {
  test('unset or blank falls back to the default debug key', () => {
    for (const raw of [undefined, '', '   ']) {
      assert.deepEqual(parseFingerprints(raw), { valid: [FP_A], invalid: [] });
    }
  });

  test('splits on commas, trims, drops empties, keeps order', () => {
    assert.deepEqual(parseFingerprints(` ${FP_B} , ${FP_A},, `), { valid: [FP_B, FP_A], invalid: [] });
  });

  test('rejects lowercase, wrong length and junk entries', () => {
    const lower = FP_B.toLowerCase();
    const short = FP_A.split(':').slice(0, 31).join(':');
    assert.deepEqual(parseFingerprints(`${FP_A},${lower},${short},not-a-key`), {
      valid: [FP_A],
      invalid: [lower, short, 'not-a-key'],
    });
  });

  test('all-invalid input yields an empty list, not the default', () => {
    assert.deepEqual(parseFingerprints('bad, worse'), { valid: [], invalid: ['bad', 'worse'] });
  });
});

describe('appLinksEnvSchema', () => {
  test('both settings are optional', () => {
    assert.deepEqual(appLinksEnvSchema.parse({}), {});
  });

  test('blank APP_STORE_URL is treated as unset', () => {
    assert.equal(appLinksEnvSchema.parse({ APP_STORE_URL: '  ' }).APP_STORE_URL, undefined);
  });

  test('accepts http(s) store URLs', () => {
    const url = 'https://play.google.com/store/apps/details?id=com.raikar.moviegallery&hl=en';
    assert.equal(appLinksEnvSchema.parse({ APP_STORE_URL: url }).APP_STORE_URL, url);
    assert.ok(appLinksEnvSchema.safeParse({ APP_STORE_URL: 'http://example.test/app' }).success);
  });

  test('rejects non-http(s) and non-URL values', () => {
    for (const value of ['javascript:alert(1)', 'not a url', 'ftp://example.test/app']) {
      assert.equal(appLinksEnvSchema.safeParse({ APP_STORE_URL: value }).success, false, value);
    }
  });
});

describe('GET /.well-known/assetlinks.json', () => {
  test('serves the statement with exact headers and no redirect', async () => {
    const app = buildApp({ sha256CertFingerprints: [FP_A, FP_B] });
    const res = await app.inject({ method: 'GET', url: '/.well-known/assetlinks.json' });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/json');
    assert.equal(res.headers['cache-control'], 'public, max-age=3600');
    assert.equal(res.headers.location, undefined);
    assert.deepEqual(res.json(), [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: ANDROID_PACKAGE_NAME,
          sha256_cert_fingerprints: [FP_A, FP_B],
        },
      },
    ]);
  });

  test('serves an empty fingerprint list when none are valid', async () => {
    const res = await buildApp({ sha256CertFingerprints: [] }).inject('/.well-known/assetlinks.json');
    assert.deepEqual(res.json()[0].target.sha256_cert_fingerprints, []);
  });

  test('body does not depend on Host', async () => {
    const app = buildApp();
    const a = await app.inject({ url: '/.well-known/assetlinks.json', headers: { host: 'one.example' } });
    const b = await app.inject({ url: '/.well-known/assetlinks.json', headers: { host: 'two.example' } });
    assert.equal(a.body, b.body);
  });

  test('is public: no header and a garbage token both get 200', async () => {
    const app = buildApp();
    const none = await app.inject('/.well-known/assetlinks.json');
    const garbage = await app.inject({
      url: '/.well-known/assetlinks.json',
      headers: { authorization: 'Bearer garbage' },
    });
    assert.equal(none.statusCode, 200);
    assert.equal(garbage.statusCode, 200);
    assert.equal(garbage.body, none.body);
  });

  test('trailing slash is not redirected', async () => {
    const res = await buildApp().inject('/.well-known/assetlinks.json/');
    assert.ok(res.statusCode < 300 || res.statusCode >= 400, `got ${res.statusCode}`);
    assert.equal(res.headers.location, undefined);
  });
});

describe('GET /movie/:id', () => {
  test('valid id renders the fallback page', async () => {
    const res = await buildApp().inject('/movie/603');

    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers['content-type']), /^text\/html/);
    assert.match(res.body, /MovieGallery/);
    assert.match(res.body, /This link opens in the MovieGallery app\./);
    assert.match(res.body, /<a [^>]*href="moviegallery:\/\/movie\/603"[^>]*>Open in app<\/a>/);
  });

  test('leading zeros are normalized', async () => {
    const res = await buildApp().inject('/movie/0603');
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /href="moviegallery:\/\/movie\/603"/);
  });

  test('Int max is accepted', async () => {
    const res = await buildApp().inject('/movie/2147483647');
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /href="moviegallery:\/\/movie\/2147483647"/);
  });

  test('invalid ids get the same static 404 page', async () => {
    const app = buildApp();
    const reference = await app.inject('/movie/abc');
    assert.equal(reference.statusCode, 404);
    assert.match(String(reference.headers['content-type']), /^text\/html/);

    const ids = ['abc', '0', '-5', '12345678901', '2147483648', '1e3', '%3Cscript%3E', '00000000000', '9999999999'];
    for (const id of ids) {
      const res = await app.inject(`/movie/${id}`);
      assert.equal(res.statusCode, 404, id);
      // Identical body for every rejected id proves nothing from the request is echoed.
      assert.equal(res.body, reference.body, id);
    }
    for (const id of ['12345678901', '2147483648', '1e3', '<script>', 'script']) {
      assert.equal(reference.body.includes(id), false, id);
    }
  });

  test('query string is not reflected', async () => {
    const res = await buildApp().inject('/movie/603?x=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.includes('<script'), false);
    assert.equal(res.body.includes('alert'), false);
  });

  test('page is self-contained and locked down', async () => {
    const res = await buildApp({ appStoreUrl: 'https://example.test/app' }).inject('/movie/603');
    assert.equal(/<script/i.test(res.body), false);
    assert.equal(/\ssrc=/i.test(res.body), false);
    assert.equal(/<link[^>]+stylesheet/i.test(res.body), false);
    assert.equal(/<(img|iframe|object|embed)\b/i.test(res.body), false);
    assert.match(res.body, /<meta name="viewport"/);
    assert.match(String(res.headers['content-security-policy']), /default-src 'none'/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  test('is public: 200 without Authorization', async () => {
    const res = await buildApp().inject({ url: '/movie/603', headers: {} });
    assert.equal(res.statusCode, 200);
  });

  test('omits "Get the app" when APP_STORE_URL is unset', async () => {
    const res = await buildApp().inject('/movie/603');
    assert.equal(res.body.includes('Get the app'), false);
  });

  test('renders an escaped "Get the app" link when APP_STORE_URL is set', async () => {
    const res = await buildApp({
      appStoreUrl: 'https://play.google.com/store/apps/details?id=com.raikar.moviegallery&hl=en',
    }).inject('/movie/603');
    assert.match(
      res.body,
      /<a [^>]*href="https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.raikar\.moviegallery&amp;hl=en"[^>]*>Get the app<\/a>/
    );
  });
});
