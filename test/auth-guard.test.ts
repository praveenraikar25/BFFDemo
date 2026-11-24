import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { createAuthGuard, type VerifyIdToken } from '../src/auth.js';
import { buildApp, topRatedCalls } from './helpers.js';

const UNAUTHORIZED = { error: 'Unauthorized' };

function guardedApp(verifyIdToken: VerifyIdToken) {
  const app = Fastify({ logger: false });
  app.get('/protected', { onRequest: createAuthGuard({ verifyIdToken }) }, async () => ({ ok: true }));
  return app;
}

const acceptingVerifier = () => vi.fn<VerifyIdToken>(async () => ({ uid: 'u1' }) as Awaited<ReturnType<VerifyIdToken>>);

describe('createAuthGuard', () => {
  it.each([
    ['no Authorization header', undefined],
    ['wrong scheme', 'Basic abc123'],
    ['lowercase scheme', 'bearer abc123'],
    ['empty bearer token', 'Bearer '],
    ['bearer with no space', 'Bearerabc123'],
    ['token with whitespace', 'Bearer abc 123'],
  ])('rejects %s with 401 without calling the verifier', async (_label, authorization) => {
    const verifyIdToken = acceptingVerifier();
    const res = await guardedApp(verifyIdToken).inject({
      url: '/protected',
      headers: authorization === undefined ? {} : { authorization },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(UNAUTHORIZED);
    expect(res.headers['www-authenticate']).toBe('Bearer');
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('passes the bearer token to the verifier and lets a valid token through', async () => {
    const verifyIdToken = acceptingVerifier();
    const res = await guardedApp(verifyIdToken).inject({
      url: '/protected',
      headers: { authorization: 'Bearer good.token.value' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(verifyIdToken).toHaveBeenCalledWith('good.token.value');
  });

  it.each([
    ['expired token', { code: 'auth/id-token-expired', message: 'expired' }],
    ['wrong project', { code: 'auth/argument-error', message: 'incorrect aud' }],
    ['key download failure', { code: 'auth/argument-error', message: 'Error fetching public keys' }],
    ['verifier timeout', { message: 'Token verification timed out after 3000ms' }],
    ['error with no fields', {}],
  ])('gives an identical 401 when verification fails (%s)', async (_label, failure) => {
    const verifyIdToken = vi.fn<VerifyIdToken>().mockRejectedValue(failure);
    const res = await guardedApp(verifyIdToken).inject({
      url: '/protected',
      headers: { authorization: 'Bearer some.token' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(UNAUTHORIZED);
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });
});

describe('GET /tv/top with the real auth guard', () => {
  const setup = () => {
    const verifyIdToken = vi.fn<VerifyIdToken>().mockRejectedValue(new Error('should not be called'));
    return { verifyIdToken, ...buildApp({ authGuard: createAuthGuard({ verifyIdToken }) }) };
  };

  it.each([
    ['supported version', '/tv/top', { 'x-app-version': '2' }],
    ['old version', '/tv/top', { 'x-app-version': '1' }],
    ['no version header', '/tv/top', {}],
    ['invalid page', '/tv/top?page=0', { 'x-app-version': '2' }],
  ])('returns 401 without a token (%s), never the empty 200 or a 400', async (_label, url, headers) => {
    const { app, upstream } = setup();
    const res = await app.inject({ url, headers });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(UNAUTHORIZED);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('returns 401 for a rejected token and does not call TMDB', async () => {
    const { app, upstream } = setup();
    const res = await app.inject({
      url: '/tv/top',
      headers: { authorization: 'Bearer bad.token', 'x-app-version': '2' },
    });

    expect(res.statusCode).toBe(401);
    expect(topRatedCalls(upstream)).toHaveLength(0);
  });

  it('serves real results for a valid token and supported version', async () => {
    const verifyIdToken = acceptingVerifier();
    const { app } = buildApp({ authGuard: createAuthGuard({ verifyIdToken }) });
    const res = await app.inject({
      url: '/tv/top',
      headers: { authorization: 'Bearer good.token', 'x-app-version': '2' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().results).toHaveLength(1);
  });

  it('gates a valid token on app version: old version gets the empty 200 result', async () => {
    const { app, upstream } = buildApp({ authGuard: createAuthGuard({ verifyIdToken: acceptingVerifier() }) });
    const res = await app.inject({
      url: '/tv/top',
      headers: { authorization: 'Bearer good.token', 'x-app-version': '1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().results).toEqual([]);
    expect(upstream).not.toHaveBeenCalled();
  });
});
