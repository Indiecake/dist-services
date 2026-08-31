import Fastify from 'fastify';

import { loadServiceConfig } from '@services-sandbox/config';
import { COMMAND_TOPICS } from '@services-sandbox/kafka';
import {
  createKafkaParticipantRuntime,
  type KafkaRuntime
} from '@services-sandbox/kafka/runtime';
import { createLogger, shouldLogHttpRequest } from '@services-sandbox/telemetry';

import { createDbClient } from './db/client.ts';
import { InventoryRepository } from './db/inventory-repository.ts';
import { runMigrations } from './db/migrate.ts';
import { SERVICE_NAME } from './domain/types.ts';
import { handleInventoryCommand } from './messaging/command-handler.ts';
import { registerHealthRoutes } from './routes/health.ts';

export interface CreateInventoryServiceOptions {
  enableMessaging?: boolean;
  retryDelaysMs?: readonly number[];
  outboxPollIntervalMs?: number;
  outboxLeaseMs?: number;
}

export interface InventoryServiceRuntime {
  app: ReturnType<typeof Fastify>;
  repository: InventoryRepository;
  logger: ReturnType<typeof createLogger>;
  close: () => Promise<void>;
}

export async function createInventoryService(
  options: CreateInventoryServiceOptions = {}
): Promise<InventoryServiceRuntime> {
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

  const repository = new InventoryRepository(db);
  registerHealthRoutes(app, pool);

  let messaging: KafkaRuntime | null = null;
  const enableMessaging = options.enableMessaging ?? false;

  if (enableMessaging) {
    messaging = createKafkaParticipantRuntime({
      serviceName: SERVICE_NAME,
      brokers: config.kafkaBootstrapServers,
      commandTopic: COMMAND_TOPICS.inventory,
      handleCommand: (command) =>
        handleInventoryCommand(
          {
            repository,
            logger,
            retryDelaysMs: options.retryDelaysMs
          },
          command
        ),
      outboxStore: repository,
      logger,
      outboxPollIntervalMs: options.outboxPollIntervalMs,
      outboxLeaseMs: options.outboxLeaseMs
    });
    await messaging.start();
    logger.info('Inventory service messaging started');
  }

  async function close(): Promise<void> {
    if (messaging) {
      await messaging.stop();
    }
    await app.close();
    await pool.end();
  }

  return { app, repository, logger, close };
}

export async function startInventoryService(): Promise<InventoryServiceRuntime> {
  const config = loadServiceConfig();
  const runtime = await createInventoryService({ enableMessaging: true });

  await runtime.app.listen({
    host: '0.0.0.0',
    port: config.port
  });

  runtime.logger.info('Inventory service listening', {
    port: config.port,
    serviceName: SERVICE_NAME
  });

  return runtime;
}
