import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

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

const port = Number(process.env.PORT) || 3000;

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
