import 'dotenv/config';

import { startInventoryService } from './server.ts';

const runtime = await startInventoryService();

async function shutdown(signal: string): Promise<void> {
  runtime.logger.info('Shutting down inventory service', { signal });
  await runtime.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
