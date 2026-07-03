import Fastify from 'fastify';

import { loadServiceConfig } from '@services-sandbox/config';
import { createLogger, shouldLogHttpRequest } from '@services-sandbox/telemetry';

import { createDbClient } from './db/client.ts';
import { runMigrations } from './db/migrate.ts';
import { registerHealthRoutes } from './routes/health.ts';

export interface OrderServiceRuntime {
  app: ReturnType<typeof Fastify>;
  close: () => Promise<void>;
}

export async function createOrderService(): Promise<OrderServiceRuntime> {
  const config = loadServiceConfig();
  const logger = createLogger({ serviceName: config.serviceName });
  const { pool, db } = createDbClient(config.databaseUrl);

  await runMigrations(db);
  logger.info('Database migrations applied');

  const app = Fastify({
    logger: false
  });

  app.addHook('onResponse', async (request, reply) => {
    if (
      shouldLogHttpRequest({
        path: request.url.split('?')[0],
        method: request.method,
        statusCode: reply.statusCode
      })
    ) {
      logger.info('HTTP request completed', {
        method: request.method,
        path: request.url,
        statusCode: reply.statusCode
      });
    }
  });

  registerHealthRoutes(app);

  async function close(): Promise<void> {
    await app.close();
    await pool.end();
  }

  return { app, close };
}

export async function startOrderService(): Promise<OrderServiceRuntime> {
  const config = loadServiceConfig();
  const runtime = await createOrderService();

  await runtime.app.listen({
    host: '0.0.0.0',
    port: config.port
  });

  const logger = createLogger({ serviceName: config.serviceName });
  logger.info('Order service listening', { port: config.port });

  return runtime;
}
