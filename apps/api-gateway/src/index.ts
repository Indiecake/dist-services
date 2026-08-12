import 'dotenv/config';

import { startApiGateway } from './server.ts';

const runtime = await startApiGateway();

async function shutdown(signal: string): Promise<void> {
  const logger = await import('@services-sandbox/telemetry').then(({ createLogger }) =>
    createLogger({ serviceName: process.env.SERVICE_NAME || 'api-gateway' })
  );

  logger.info('Shutting down api-gateway', { signal });
  await runtime.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
