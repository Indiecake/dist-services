import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

import * as schema from './schema.ts';

export type OrderDatabase = ReturnType<typeof createDbClient>['db'];

export function createDbClient(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  return { pool, db };
}
