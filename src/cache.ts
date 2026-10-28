import type { FastifyBaseLogger } from 'fastify';
import { Redis } from 'ioredis';

// A cache failure must never become a request failure: implementations never throw,
// and report any problem as a miss (get) or a no-op (set).
export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Start connecting in the background; never rejects. */
  connect(): void;
  close(): Promise<void>;
}

export function createNoopCache(): Cache {
  return {
    get: async () => null,
    set: async () => {},
    connect: () => {},
    close: async () => {},
  };
}

// Connection failures can be AggregateErrors with an empty message; fall back to code/name.
const describe = (err: unknown) => {
  const e = err as { message?: string; code?: string; name?: string };
  return e.message || e.code || e.name || 'unknown error';
};

const COMMAND_TIMEOUT_MS = 200;
const CONNECT_TIMEOUT_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 5000;

export function createRedisCache(url: string, logger: FastifyBaseLogger): Cache {
  const client = new Redis(url, {
    lazyConnect: true, // don't block or fail startup when Redis is down
    enableOfflineQueue: false, // fail fast while disconnected instead of queueing until reconnect
    commandTimeout: COMMAND_TIMEOUT_MS,
    connectTimeout: CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt) => Math.min(attempt * 200, MAX_RECONNECT_DELAY_MS),
  });

  // Without a listener, ioredis reports connection errors as unhandled error events.
  client.on('error', (err) => logger.warn({ err: describe(err) }, 'Redis error'));
  client.on('ready', () => logger.info('Redis cache connected'));

  return {
    async get(key) {
      try {
        return await client.get(key);
      } catch (err) {
        logger.warn({ err: describe(err), key }, 'Cache read failed, treating as miss');
        return null;
      }
    },

    async set(key, value, ttlSeconds) {
      try {
        await client.set(key, value, 'EX', ttlSeconds);
      } catch (err) {
        logger.warn({ err: describe(err), key }, 'Cache write failed');
      }
    },

    connect() {
      client.connect().catch((err) => {
        logger.warn({ err: describe(err) }, 'Redis unavailable at startup, running uncached until it connects');
      });
    },

    async close() {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    },
  };
}
