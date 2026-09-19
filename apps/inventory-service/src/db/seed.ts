import 'dotenv/config';

import { loadServiceConfig } from '@services-sandbox/config';
import { createLogger } from '@services-sandbox/telemetry';

import { createDbClient } from './client.ts';
import { runMigrations } from './migrate.ts';
import { DEFAULT_INVENTORY_CATALOG, seedCatalogItems } from './seed-catalog.ts';

const config = loadServiceConfig();
const logger = createLogger({ serviceName: config.serviceName });
const { pool, db } = createDbClient(config.databaseUrl);

try {
  await runMigrations(db);
  const result = await seedCatalogItems(db, DEFAULT_INVENTORY_CATALOG, { mode: 'ensure' });
  logger.info('Inventory catalog seeded', {
    created: result.created,
    skipped: result.skipped
  });
} catch (error) {
  logger.error('Inventory catalog seed failed', {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
} finally {
  await pool.end();
}
