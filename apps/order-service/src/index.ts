import 'dotenv/config';

import { startOrderService } from './server.ts';

const runtime = await startOrderService();

async function shutdown(signal: string): Promise<void> {
  const logger = await import('@services-sandbox/telemetry').then(({ createLogger }) =>
    createLogger({ serviceName: process.env.SERVICE_NAME || 'order-service' })
  );

  logger.info('Shutting down order service', { signal });
  await runtime.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
