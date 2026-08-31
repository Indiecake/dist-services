import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

import { pingDatabase } from '../db/connectivity.ts';
import { SERVICE_NAME } from '../domain/types.ts';

export function registerHealthRoutes(app: FastifyInstance, pool: Pool): void {
  app.get('/health', async () => ({
    status: 'ok',
    service: SERVICE_NAME
  }));

  app.get('/ready', async (_request, reply) => {
    const isReady = await pingDatabase(pool);
    return reply.status(isReady ? 200 : 503).send({
      status: isReady ? 'ready' : 'not_ready',
      service: SERVICE_NAME
    });
  });
}
