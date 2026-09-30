import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { registerTvRoutes } from './routes/tv.js';

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

registerTvRoutes(app, { fetchUpstream, tmdbReadToken: TMDB_READ_TOKEN });

const port = Number(process.env.PORT) || 3000;

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
