import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { createAuthGuard } from '../src/auth.js';
import { registerTvRoutes } from '../src/routes/tv.js';
import { DEFAULT_SHA256_CERT_FINGERPRINT, registerAppLinksRoutes } from '../src/routes/app-links.js';

// Protected and public routes on one instance: the App Links routes must not loosen /tv/top,
// and the auth guard must not leak onto the App Links routes.
function buildApp() {
  const upstreamCalls: string[] = [];
  const app = Fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const authGuard = createAuthGuard({
    verifyIdToken: async () => {
      throw Object.assign(new Error('rejected by stub'), { code: 'auth/argument-error' });
    },
  });
  registerTvRoutes(app, {
    fetchUpstream: async (url) => {
      upstreamCalls.push(url);
      throw new Error('upstream must not be called');
    },
    tmdbReadToken: 'unused',
    authGuard,
  });
  registerAppLinksRoutes(app, { sha256CertFingerprints: [DEFAULT_SHA256_CERT_FINGERPRINT] });
  return { app, upstreamCalls };
}

test('/tv/top still rejects requests without a valid token', async () => {
  const { app, upstreamCalls } = buildApp();
  const cases = [
    {},
    { authorization: 'Bearer some-invalid-token', 'x-app-version': '2' },
    { authorization: 'Basic abc123' },
  ];
  for (const headers of cases) {
    const res = await app.inject({ url: '/tv/top', headers });
    assert.equal(res.statusCode, 401, JSON.stringify(headers));
    assert.deepEqual(res.json(), { error: 'Unauthorized' });
    assert.equal(res.headers['www-authenticate'], 'Bearer');
  }
  assert.deepEqual(upstreamCalls, []);
});

test('App Links routes are reachable without a token on the same instance', async () => {
  const { app } = buildApp();
  for (const url of ['/.well-known/assetlinks.json', '/movie/603']) {
    const res = await app.inject(url);
    assert.equal(res.statusCode, 200, url);
    assert.equal(res.headers['www-authenticate'], undefined, url);
  }
});
