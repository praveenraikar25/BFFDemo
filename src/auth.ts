import type { FastifyReply, FastifyRequest } from 'fastify';
import { initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';

const VERIFY_TIMEOUT_MS = 3000; // bounds the SDK's certificate download, which has no timeout of its own

export type VerifyIdToken = (token: string) => Promise<DecodedIdToken>;

// No credentials needed: without checkRevoked, verification is local against Google's public certs.
export function createFirebaseIdTokenVerifier(projectId: string): VerifyIdToken {
  const auth = getAuth(initializeApp({ projectId }));

  return async (token) => {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`Token verification timed out after ${VERIFY_TIMEOUT_MS}ms`)),
        VERIFY_TIMEOUT_MS
      );
    });
    try {
      return await Promise.race([auth.verifyIdToken(token), timeout]);
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

interface AuthGuardDeps {
  verifyIdToken: VerifyIdToken;
}

// onRequest hook: runs before validation, so unauthenticated callers get 401 even with bad input.
export function createAuthGuard({ verifyIdToken }: AuthGuardDeps) {
  return async function authGuard(request: FastifyRequest, reply: FastifyReply) {
    const match = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '');
    if (!match) {
      request.log.warn('Auth rejected: missing or malformed Authorization header');
      return unauthorized(reply);
    }

    try {
      await verifyIdToken(match[1]);
    } catch (err) {
      // Every failure is a 401, including key download failures (the SDK reports those with the
      // same code as a bad token). The message tells them apart in logs; never log the token.
      const { code, message } = err as { code?: string; message?: string };
      request.log.warn({ code, reason: message }, 'Auth rejected: token verification failed');
      return unauthorized(reply);
    }
  };
}

function unauthorized(reply: FastifyReply) {
  return reply.code(401).header('WWW-Authenticate', 'Bearer').send({ error: 'Unauthorized' });
}
