import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const env = z.object({
  TMDB_READ_TOKEN: z
    .string({ error: 'TMDB_READ_TOKEN is required — copy .env.example to .env' })
    .min(1, 'TMDB_READ_TOKEN must not be empty'),
}).safeParse(process.env);

if (!env.success) {
  console.error('Config error:', z.flattenError(env.error).fieldErrors);
  process.exit(1);
}

const { TMDB_READ_TOKEN } = env.data;

const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

const UPSTREAM_TIMEOUT_MS = 3000;

async function fetchUpstream(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

app.get('/health', async () => {
  return { status: 'ok' };
});

app.get('/movies/:id', {
  schema: {
    params: z.object({
      id: z.string().regex(/^\d+$/, 'id must be numeric'),
    }),
    response: {
      200: z.object({
        id: z.string(),
        title: z.string(),
      }),
    },
  },
}, async (request) => {
  const { id } = request.params;
  return { id, title: `Movie ${id}` };
});

app.get('/search', {
  schema: {
    querystring: z.object({
      q: z.string().min(1, 'q is required'),
      limit: z.coerce.number().int().positive().max(50).optional(),
    }),
    response: {
      200: z.object({
        results: z.array(z.string()),
      }),
    },
  },
}, async (request) => {
  const { q } = request.query;
  return { results: [`stub result for "${q}"`] };
});

app.get('/users/:id', {
  schema: {
    params: z.object({
      id: z.string().regex(/^\d+$/, 'id must be numeric'),
    }),
  },
}, async (request, reply) => {
  const { id } = request.params;

  try {
    const response = await fetchUpstream(
      `https://jsonplaceholder.typicode.com/users/${id}`
    );

    if (!response.ok) {
      return reply.code(response.status).send({
        error: 'Upstream error',
        status: response.status,
      });
    }

    return await response.json();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return reply.code(504).send({ error: 'Upstream timeout' });
    }
    return reply.code(502).send({ error: 'Failed to reach upstream' });
  }
});

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

const tvShowSchema = z.object({
  id: z.number(),
  name: z.string(),
  overview: z.string(),
  firstAirDate: z.string(),
  voteAverage: z.number(),
  posterUrl: z.string().nullable(),
});

const upstreamErrorSchema = z.object({ error: z.string() });

app.get('/tv/top', {
  schema: {
    querystring: z.object({
      page: z.coerce.number().int().min(1).max(500).default(1),
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

  try {
    const response = await fetchUpstream(
      `https://api.themoviedb.org/3/tv/top_rated?language=en-US&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${TMDB_READ_TOKEN}`,
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
      })),
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return reply.code(504).send({ error: 'Upstream timeout' });
    }
    return reply.code(502).send({ error: 'Failed to reach upstream' });
  }
});

const port = Number(process.env.PORT) || 3000;

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
