import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import type { OrderDatabase } from './client.ts';

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../database/migrations'
);

export async function runMigrations(db: OrderDatabase): Promise<void> {
  await migrate(db, { migrationsFolder });
}
