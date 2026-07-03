import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './database/migrations',
  schemaFilter: ['orders_schema'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://platform:platform@localhost:5432/platform'
  }
});
