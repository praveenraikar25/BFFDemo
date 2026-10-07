import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const MIN_APP_VERSION = 2; // clients below this get an empty /tv/top response

const tvShowSchema = z.object({
  id: z.number(),
  name: z.string(),
  overview: z.string(),
  firstAirDate: z.string(),
  voteAverage: z.number(),
  posterUrl: z.string().nullable(),
  genres: z.array(z.string()),
});

const upstreamErrorSchema = z.object({ error: z.string() });

interface TvRouteDeps {
  fetchUpstream: (url: string, init?: RequestInit) => Promise<Response>;
  tmdbReadToken: string;
}

export function registerTvRoutes(
  app: FastifyInstance<any, any, any, any, ZodTypeProvider>,
  { fetchUpstream, tmdbReadToken }: TvRouteDeps
) {
  let genreMapPromise: Promise<Map<number, string>> | null = null;

  async function getTvGenreMap(): Promise<Map<number, string>> {
    if (!genreMapPromise) {
      genreMapPromise = fetchUpstream('https://api.themoviedb.org/3/genre/tv/list?language=en-US', {
        headers: {
          Authorization: `Bearer ${tmdbReadToken}`,
          Accept: 'application/json',
        },
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`TMDB genre list error: ${response.status}`);
          const data = await response.json();
          return new Map<number, string>(data.genres.map((g: { id: number; name: string }) => [g.id, g.name]));
        })
        .catch((err) => {
          genreMapPromise = null;
          throw err;
        });
    }
    return genreMapPromise;
  }

  app.get('/tv/top', {
    schema: {
      tags: ['tv'],
      summary: 'Top-rated TV series',
      description: `Clients must send x-app-version >= ${MIN_APP_VERSION}; otherwise an empty result is returned without calling TMDB.`,
      querystring: z.object({
        page: z.coerce.number().int().min(1).max(500).default(1),
      }),
      headers: z.object({
        'x-app-version': z.coerce.number().int().optional().catch(undefined),
      }),
      response: {
        200: z.object({
          page: z.number(),
          totalPages: z.number(),
          totalResults: z.number(),
          results: z.array(tvShowSchema),
        }),
        500: upstreamErrorSchema,
        502: upstreamErrorSchema,
        504: upstreamErrorSchema,
      },
    },
  }, async (request, reply) => {
    const { page } = request.query;
    const appVersion = request.headers['x-app-version'];

    if (appVersion === undefined || appVersion < MIN_APP_VERSION) {
      return { page, totalPages: 0, totalResults: 0, results: [] };
    }

    try {
      const response = await fetchUpstream(
        `https://api.themoviedb.org/3/tv/top_rated?language=en-US&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${tmdbReadToken}`,
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        request.log.error({ status: response.status }, 'TMDB upstream error');
        // A rejected token is our config bug, not the caller's — don't echo 401 back.
        return response.status === 401
          ? reply.code(500).send({ error: 'Upstream auth failed' })
          : reply.code(502).send({ error: 'Upstream error' });
      }

      const data = await response.json();
      const genreMap = await getTvGenreMap();

      return {
        page: data.page,
        totalPages: data.total_pages,
        totalResults: data.total_results,
        results: data.results.map((show: any) => ({
          id: show.id,
          name: show.name,
          overview: show.overview,
          firstAirDate: show.first_air_date,
          voteAverage: show.vote_average,
          posterUrl: show.poster_path ? `${TMDB_IMAGE_BASE}${show.poster_path}` : null,
          genres: (show.genre_ids ?? []).map((id: number) => genreMap.get(id) ?? 'Unknown'),
        })),
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return reply.code(504).send({ error: 'Upstream timeout' });
      }
      return reply.code(502).send({ error: 'Failed to reach upstream' });
    }
  });
}
