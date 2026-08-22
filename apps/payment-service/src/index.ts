import 'dotenv/config';

import { startPaymentService } from './server.ts';

const runtime = await startPaymentService();

async function shutdown(signal: string): Promise<void> {
  const logger = await import('@services-sandbox/telemetry').then(({ createLogger }) =>
    createLogger({ serviceName: process.env.SERVICE_NAME || 'payment-service' })
  );

  logger.info('Shutting down payment service', { signal });
  await runtime.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
