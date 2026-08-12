import Fastify from 'fastify';

import { createLogger, shouldLogHttpRequest } from '@services-sandbox/telemetry';

import { loadGatewayConfig } from './config.ts';
import { registerHealthRoutes } from './routes/health.ts';
import { registerOrderRoutes } from './routes/orders.ts';

export interface ApiGatewayRuntime {
  app: ReturnType<typeof Fastify>;
  close: () => Promise<void>;
}

export async function createApiGateway(): Promise<ApiGatewayRuntime> {
  const config = loadGatewayConfig();
  const logger = createLogger({ serviceName: config.serviceName });

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
      const requestContext = request.headers;

      logger.info('HTTP request completed', {
        method: request.method,
        path: request.url,
        statusCode: reply.statusCode,
        requestId: requestContext['x-request-id'],
        correlationId: requestContext['x-correlation-id']
      });
    }
  });

  registerHealthRoutes(app);
  registerOrderRoutes(app, config);

  async function close(): Promise<void> {
    await app.close();
  }

  return { app, close };
}

export async function startApiGateway(): Promise<ApiGatewayRuntime> {
  const config = loadGatewayConfig();
  const runtime = await createApiGateway();

  await runtime.app.listen({
    host: '0.0.0.0',
    port: config.port
  });

  const logger = createLogger({ serviceName: config.serviceName });
  logger.info('API gateway listening', { port: config.port });

  return runtime;
}
