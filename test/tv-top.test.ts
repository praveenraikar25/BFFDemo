import { describe, expect, it } from 'vitest';
import {
  GENRES,
  SUPPORTED,
  abortError,
  buildApp,
  fakeUpstream,
  genreCalls,
  jsonResponse,
  tmdbShow,
  topRatedCalls,
  topRatedPage,
} from './helpers.js';

const EMPTY = (page: number) => ({ page, totalPages: 0, totalResults: 0, results: [] });

describe('GET /tv/top page parameter', () => {
  it('defaults to page 1', async () => {
    const { app, upstream } = buildApp();
    const res = await app.inject({ url: '/tv/top', headers: SUPPORTED });

    expect(res.statusCode).toBe(200);
    expect(topRatedCalls(upstream)).toEqual([expect.stringContaining('page=1')]);
  });

  it('requests the explicit page from TMDB', async () => {
    const { app, upstream } = buildApp({
      upstream: fakeUpstream({ topRated: () => jsonResponse(topRatedPage({ page: 3 })) }),
    });
    const res = await app.inject({ url: '/tv/top?page=3', headers: SUPPORTED });

    expect(res.statusCode).toBe(200);
    expect(res.json().page).toBe(3);
    expect(topRatedCalls(upstream)).toEqual([expect.stringContaining('page=3')]);
  });

  it.each(['0', '501', '1.5', 'abc'])('rejects page=%s with 400', async (page) => {
    const { app, upstream } = buildApp();
    const res = await app.inject({ url: `/tv/top?page=${page}`, headers: SUPPORTED });

    expect(res.statusCode).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe('GET /tv/top app version gate', () => {
  it.each([
    ['missing', {}],
    ['below minimum', { 'x-app-version': '1' }],
    ['non-integer (2.5)', { 'x-app-version': '2.5' }],
    ['non-numeric (abc)', { 'x-app-version': 'abc' }],
  ])('returns the empty result without calling TMDB when the version is %s', async (_label, headers) => {
    const { app, upstream } = buildApp();
    const res = await app.inject({ url: '/tv/top?page=4', headers });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(EMPTY(4));
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(['2', '3', '10'])('calls TMDB and returns real results for version %s', async (version) => {
    const { app, upstream } = buildApp();
    const res = await app.inject({ url: '/tv/top', headers: { 'x-app-version': version } });

    expect(res.statusCode).toBe(200);
    expect(res.json().results).toHaveLength(1);
    expect(topRatedCalls(upstream)).toHaveLength(1);
  });
});

describe('GET /tv/top response mapping', () => {
  it('maps TMDB snake_case fields to camelCase and exposes nothing else', async () => {
    const { app } = buildApp({
      upstream: fakeUpstream({
        topRated: () => jsonResponse(topRatedPage({ page: 2, total_pages: 7, total_results: 140 })),
      }),
    });
    const res = await app.inject({ url: '/tv/top?page=2', headers: SUPPORTED });

    expect(res.json()).toEqual({
      page: 2,
      totalPages: 7,
      totalResults: 140,
      results: [
        {
          id: 1396,
          name: 'Breaking Bad',
          overview: 'A chemistry teacher turns to crime.',
          firstAirDate: '2008-01-20',
          voteAverage: 8.9,
          posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
          genres: ['Drama', 'Crime'],
        },
      ],
    });
  });

  it('expands the poster path and returns null when there is none', async () => {
    const { app } = buildApp({
      upstream: fakeUpstream({
        topRated: () =>
          jsonResponse(
            topRatedPage({
              results: [tmdbShow({ id: 1, poster_path: '/abc.jpg' }), tmdbShow({ id: 2, poster_path: null })],
            })
          ),
      }),
    });
    const { results } = (await app.inject({ url: '/tv/top', headers: SUPPORTED })).json();

    expect(results[0].posterUrl).toBe('https://image.tmdb.org/t/p/w500/abc.jpg');
    expect(results[1].posterUrl).toBeNull();
  });

  it('resolves genre names in order, using "Unknown" for unmapped ids and [] for none', async () => {
    const { app } = buildApp({
      upstream: fakeUpstream({
        topRated: () =>
          jsonResponse(
            topRatedPage({
              results: [
                tmdbShow({ id: 1, genre_ids: [10765, 18] }),
                tmdbShow({ id: 2, genre_ids: [18, 99999] }),
                tmdbShow({ id: 3, genre_ids: [] }),
              ],
            })
          ),
      }),
    });
    const { results } = (await app.inject({ url: '/tv/top', headers: SUPPORTED })).json();

    expect(results[0].genres).toEqual(['Sci-Fi & Fantasy', 'Drama']);
    expect(results[1].genres).toEqual(['Drama', 'Unknown']);
    expect(results[2].genres).toEqual([]);
  });

  it('sends the TMDB read token as a bearer token', async () => {
    const { app, upstream } = buildApp();
    await app.inject({ url: '/tv/top', headers: SUPPORTED });

    for (const [, init] of upstream.mock.calls) {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-tmdb-token');
    }
  });
});

describe('GET /tv/top genre map caching', () => {
  it('fetches the genre list once and reuses it after a success', async () => {
    const { app, upstream } = buildApp();
    await app.inject({ url: '/tv/top', headers: SUPPORTED });
    await app.inject({ url: '/tv/top?page=2', headers: SUPPORTED });

    expect(genreCalls(upstream)).toHaveLength(1);
    expect(topRatedCalls(upstream)).toHaveLength(2);
  });

  it('retries the genre list on the next request after a failure', async () => {
    let attempt = 0;
    const { app, upstream } = buildApp({
      upstream: fakeUpstream({
        genres: () => (++attempt === 1 ? jsonResponse({}, 500) : jsonResponse({ genres: GENRES })),
      }),
    });

    const first = await app.inject({ url: '/tv/top', headers: SUPPORTED });
    const second = await app.inject({ url: '/tv/top', headers: SUPPORTED });

    expect(first.statusCode).toBe(502);
    expect(second.statusCode).toBe(200);
    expect(genreCalls(upstream)).toHaveLength(2);
  });

  it('shares a single in-flight genre fetch between concurrent requests', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { app, upstream } = buildApp({
      upstream: fakeUpstream({
        genres: async () => {
          await gate;
          return jsonResponse({ genres: GENRES });
        },
      }),
    });

    const pending = [1, 2, 3].map((page) => app.inject({ url: `/tv/top?page=${page}`, headers: SUPPORTED }));
    await new Promise((resolve) => setTimeout(resolve, 25)); // let all three reach the genre fetch
    release();
    const responses = await Promise.all(pending);

    expect(responses.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(genreCalls(upstream)).toHaveLength(1);
  });
});

describe('GET /tv/top upstream error mapping', () => {
  it('maps a TMDB 401 to 500 (our token is wrong, not the caller)', async () => {
    const { app } = buildApp({ upstream: fakeUpstream({ topRated: () => jsonResponse({}, 401) }) });
    const res = await app.inject({ url: '/tv/top', headers: SUPPORTED });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Upstream auth failed' });
  });

  it.each([404, 429, 500, 503])('maps a TMDB %s to 502', async (status) => {
    const { app } = buildApp({ upstream: fakeUpstream({ topRated: () => jsonResponse({}, status) }) });
    const res = await app.inject({ url: '/tv/top', headers: SUPPORTED });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: 'Upstream error' });
  });

  it('maps a top-rated timeout to 504', async () => {
    const { app } = buildApp({
      upstream: fakeUpstream({
        topRated: () => {
          throw abortError();
        },
      }),
    });
    const res = await app.inject({ url: '/tv/top', headers: SUPPORTED });

    expect(res.statusCode).toBe(504);
    expect(res.json()).toEqual({ error: 'Upstream timeout' });
  });

  it('maps a top-rated network failure to 502', async () => {
    const { app } = buildApp({
      upstream: fakeUpstream({
        topRated: () => {
          throw new TypeError('fetch failed');
        },
      }),
    });
    const res = await app.inject({ url: '/tv/top', headers: SUPPORTED });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: 'Failed to reach upstream' });
  });

  it.each([401, 500])('fails the whole request when the genre list returns %s', async (status) => {
    const { app } = buildApp({ upstream: fakeUpstream({ genres: () => jsonResponse({}, status) }) });
    const res = await app.inject({ url: '/tv/top', headers: SUPPORTED });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: 'Failed to reach upstream' });
  });

  it('maps a genre list timeout to 504 with no partial results', async () => {
    const { app } = buildApp({
      upstream: fakeUpstream({
        genres: () => {
          throw abortError();
        },
      }),
    });
    const res = await app.inject({ url: '/tv/top', headers: SUPPORTED });

    expect(res.statusCode).toBe(504);
    expect(res.json()).toEqual({ error: 'Upstream timeout' });
  });
});
