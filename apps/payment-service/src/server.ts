import Fastify from 'fastify';

import { loadServiceConfig } from '@services-sandbox/config';
import { createLogger, shouldLogHttpRequest } from '@services-sandbox/telemetry';

import { createDbClient } from './db/client.ts';
import { runMigrations } from './db/migrate.ts';
import { PaymentsRepository } from './db/payments-repository.ts';
import { createSimulatedPaymentProcessor, type PaymentProcessor } from './domain/processor.ts';
import { SERVICE_NAME } from './domain/types.ts';
import { createKafkaRuntime, type KafkaRuntime } from './messaging/kafka-runtime.ts';
import { registerHealthRoutes } from './routes/health.ts';

export interface CreatePaymentServiceOptions {
  enableMessaging?: boolean;
  processor?: PaymentProcessor;
  retryDelaysMs?: readonly number[];
  outboxPollIntervalMs?: number;
  outboxLeaseMs?: number;
}

export interface PaymentServiceRuntime {
  app: ReturnType<typeof Fastify>;
  repository: PaymentsRepository;
  close: () => Promise<void>;
}

export async function createPaymentService(
  options: CreatePaymentServiceOptions = {}
): Promise<PaymentServiceRuntime> {
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

  const repository = new PaymentsRepository(db);
  const processor = options.processor ?? createSimulatedPaymentProcessor();
  registerHealthRoutes(app, pool);

  let messaging: KafkaRuntime | null = null;
  const enableMessaging = options.enableMessaging ?? false;

  if (enableMessaging) {
    messaging = createKafkaRuntime({
      brokers: config.kafkaBootstrapServers,
      repository,
      processor,
      logger,
      retryDelaysMs: options.retryDelaysMs,
      outboxPollIntervalMs: options.outboxPollIntervalMs,
      outboxLeaseMs: options.outboxLeaseMs
    });
    await messaging.start();
    logger.info('Payment service messaging started');
  }

  async function close(): Promise<void> {
    if (messaging) {
      await messaging.stop();
    }
    await app.close();
    await pool.end();
  }

  return { app, repository, close };
}

export async function startPaymentService(): Promise<PaymentServiceRuntime> {
  const config = loadServiceConfig();
  const runtime = await createPaymentService({ enableMessaging: true });

  await runtime.app.listen({
    host: '0.0.0.0',
    port: config.port
  });

  const logger = createLogger({ serviceName: config.serviceName });
  logger.info('Payment service listening', { port: config.port, serviceName: SERVICE_NAME });

  return runtime;
}
