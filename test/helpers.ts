import Fastify from 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { vi } from 'vitest';
import { registerTvRoutes } from '../src/routes/tv.js';

export const TMDB_TOKEN = 'test-tmdb-token';

// ---- TMDB fixtures -------------------------------------------------------

export const GENRES = [
  { id: 18, name: 'Drama' },
  { id: 80, name: 'Crime' },
  { id: 10765, name: 'Sci-Fi & Fantasy' },
];

export function tmdbShow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1396,
    name: 'Breaking Bad',
    overview: 'A chemistry teacher turns to crime.',
    first_air_date: '2008-01-20',
    vote_average: 8.9,
    poster_path: '/abc.jpg',
    genre_ids: [18, 80],
    // Fields the BFF must not expose.
    popularity: 123.4,
    backdrop_path: '/bg.jpg',
    ...overrides,
  };
}

export function topRatedPage(overrides: Record<string, unknown> = {}) {
  return {
    page: 1,
    total_pages: 150,
    total_results: 3000,
    results: [tmdbShow()],
    ...overrides,
  };
}

// ---- Fake upstream -------------------------------------------------------

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const abortError = () => Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });

type UpstreamHandler = (url: string) => Response | Promise<Response>;

interface UpstreamRoutes {
  topRated?: UpstreamHandler;
  genres?: UpstreamHandler;
}

/**
 * A fetchUpstream fake that routes by URL, so tests do not depend on whether the genre
 * call happens before or after the top-rated call. A handler may return a Response or throw.
 */
export function fakeUpstream(routes: UpstreamRoutes = {}) {
  const topRated = routes.topRated ?? (() => jsonResponse(topRatedPage()));
  const genres = routes.genres ?? (() => jsonResponse({ genres: GENRES }));

  return vi.fn(async (url: string, _init?: RequestInit): Promise<Response> => {
    if (url.includes('/tv/top_rated')) return topRated(url);
    if (url.includes('/genre/tv/list')) return genres(url);
    throw new Error(`Unexpected upstream URL in test: ${url}`);
  });
}

type Upstream = ReturnType<typeof fakeUpstream>;

const urlsMatching = (upstream: Upstream, needle: string) =>
  upstream.mock.calls.map(([url]) => url).filter((url) => url.includes(needle));

export const topRatedCalls = (upstream: Upstream) => urlsMatching(upstream, '/tv/top_rated');
export const genreCalls = (upstream: Upstream) => urlsMatching(upstream, '/genre/tv/list');

// ---- App -----------------------------------------------------------------

type AuthGuard = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

interface BuildAppOptions {
  upstream?: Upstream;
  authGuard?: AuthGuard;
}

/** A fresh app per test, so the route's closure-held genre map never leaks between cases. */
export function buildApp({
  upstream = fakeUpstream(),
  authGuard = async () => {},
}: BuildAppOptions = {}) {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerTvRoutes(app, { fetchUpstream: upstream, tmdbReadToken: TMDB_TOKEN, authGuard });
  return { app, upstream };
}

export const SUPPORTED = { 'x-app-version': '2' };
